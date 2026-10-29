import Anthropic from '@anthropic-ai/sdk';
import { ConflictException, HttpException, HttpStatus, Inject, Injectable } from '@nestjs/common';
import {
  AlertaEstoque,
  AnaliseEstoque,
  OrigemAnaliseEstoque,
  OrigemTextoAlerta,
  Prisma,
  ResolvidoPor,
  StatusAlertaEstoque,
  StatusAnaliseEstoque,
  TipoAlertaEstoque,
} from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { CLIENTE_LLM, ClienteLlm } from './cliente-llm';
import {
  ContextoFerramentas,
  FerramentasAgente,
  SILENCIO_RESOLUCAO_DIAS,
  silencioDoMaterial,
} from './ferramentas-agente';
import { finalizarJustificativa, MapaMarcadores } from './marcadores-obra';
import { MaterialSnapshot, PrevisaoEstoqueService } from './previsao-estoque.service';

type Decimal = Prisma.Decimal;
const Decimal = Prisma.Decimal;

const MINUTO_MS = 60 * 1000;
const DIA_MS = 24 * 60 * MINUTO_MS;
export const LIMITE_CHAMADAS_FERRAMENTA = 50;
export const PRAZO_ANALISE_MS = 2 * MINUTO_MS;
export const ANALISE_TRAVADA_MS = 5 * MINUTO_MS;
export const INTERVALO_MANUAL_MS = 1 * MINUTO_MS;
const TAMANHO_RESUMO = 500;

export const MSG_ANALISE_EM_ANDAMENTO = 'Já existe uma análise de estoque em andamento';
export const MSG_LIMITE_MANUAL = 'Aguarde 1 minuto entre análises manuais';

/** Um passo do agente, gravado em AnaliseEstoque.passos (auditoria; nao vai para a UI). */
export interface PassoAgente {
  tipo: 'texto' | 'ferramenta' | 'limite' | 'erro';
  ferramenta?: string;
  entrada?: unknown;
  resultado?: string;
  texto?: string;
  erro?: boolean;
}

export interface ResultadoLoop {
  status: StatusAnaliseEstoque;
  passos: PassoAgente[];
  chamadas: number;
  erro: string | null;
  modelo: string | null;
}

const SISTEMA = [
  'Você é o agente de reposição de estoque de uma firma de gesso. Você nunca compra nem',
  'movimenta estoque; só registra sugestões com sugerirReposicao. Método: (1) comece por',
  'listarMateriais, que dá a visão geral e o risco de cada material; (2) investigue, começando',
  'pelos obrigatórios: (a) todo material com risco diferente de SEM_RISCO: chame',
  'consumoDoMaterial (traz saldo livre, quantidade calculada e faixa aceita), reservadoPorObras',
  'se temReserva e previstoVsUtilizado se temPrevisao; (b) todo material SEM_RISCO com',
  'temPrevisao: chame consumoDoMaterial e previstoVsUtilizado, para ver se alguma obra está',
  'consumindo além do previsto; (c) se temUsoSemPrevisao, chame previstoVsUtilizado: o',
  'consumo solto inclui saídas para obras que não preveem o material (usoSemPrevisao),',
  'então diga na justificativa quanto foi para cada uma, pelo marcador, em vez de tratar',
  'como consumo sem obra; (3) só então decida. sugerirReposicao recusa a sugestão se',
  'faltar alguma dessas consultas. Os números vêm calculados: não refaça contas. Regras:',
  'obrigatorio = true exige REPOSICAO; PREVISAO merece REPOSICAO se o consumo justificar;',
  'REPOSICAO só dentro da faixa aceita, ajustando dentro dela quando a investigação mostrar',
  'motivo; INFORMATIVO (sem quantidade) só com calculado <= 0, para uma observação útil (ex.:',
  'obra consumindo além do previsto). Na justificativa, diga o que você viu (reserva, consumo,',
  'excedente) e cite obras só pelos marcadores {{OBRA_n}} exatamente como recebidos.',
  'Justificativas curtas, em português, para o dono da firma. Quando terminar, responda com um',
  'resumo de uma linha.',
].join(' ');

/**
 * Orquestra uma analise do agente de estoque: controle de execucao, loop com a LLM,
 * rede de seguranca e ciclo de vida dos alertas.
 * Spec: .claude/specs/features/estoque-agente-proativo/spec.md
 */
@Injectable()
export class AgenteEstoqueService {
  private emExecucao = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly previsao: PrevisaoEstoqueService,
    @Inject(CLIENTE_LLM) private readonly cliente: ClienteLlm,
    private readonly ferramentas: FerramentasAgente,
  ) {}

  /**
   * Roda uma analise. Devolve null quando um disparo automatico e pulado porque ja existe
   * outra em andamento; no disparo manual a mesma situacao vira 409.
   */
  async analisar(origem: OrigemAnaliseEstoque): Promise<AnaliseEstoque | null> {
    const manual = origem === OrigemAnaliseEstoque.MANUAL;
    if (this.emExecucao) {
      if (manual) throw new ConflictException(MSG_ANALISE_EM_ANDAMENTO);
      return null;
    }

    this.emExecucao = true;
    try {
      const agora = new Date();

      // Analise travada (crash no meio): depois de 5 min vira FALHA e libera a proxima.
      await this.prisma.analiseEstoque.updateMany({
        where: {
          status: StatusAnaliseEstoque.EM_ANDAMENTO,
          iniciadoEm: { lt: new Date(agora.getTime() - ANALISE_TRAVADA_MS) },
        },
        data: { status: StatusAnaliseEstoque.FALHA, finalizadoEm: agora, erro: 'abandonada' },
      });

      const emAndamento = await this.prisma.analiseEstoque.findFirst({
        where: { status: StatusAnaliseEstoque.EM_ANDAMENTO },
      });
      if (emAndamento) {
        if (manual) throw new ConflictException(MSG_ANALISE_EM_ANDAMENTO);
        return null;
      }

      if (manual) {
        const ultimaManual = await this.prisma.analiseEstoque.findFirst({
          where: { origem: OrigemAnaliseEstoque.MANUAL },
          orderBy: { iniciadoEm: 'desc' },
        });
        if (
          ultimaManual &&
          agora.getTime() - ultimaManual.iniciadoEm.getTime() < INTERVALO_MANUAL_MS
        ) {
          throw new HttpException(MSG_LIMITE_MANUAL, HttpStatus.TOO_MANY_REQUESTS);
        }
      }

      const analise = await this.prisma.analiseEstoque.create({
        data: { origem, iniciadoEm: agora },
      });

      try {
        const snapshot = await this.previsao.montarSnapshot(agora);
        const ctx: ContextoFerramentas = {
          snapshot,
          mapa: new MapaMarcadores(),
          aceitas: [],
          consultas: new Map(),
        };
        const loop = await this.executarLoop(ctx, Date.now() + PRAZO_ANALISE_MS);
        return await this.persistir(analise, ctx, loop);
      } catch (erro) {
        // Nada do resultado foi gravado (a $transaction desfez); registra a falha a parte.
        return this.prisma.analiseEstoque.update({
          where: { id: analise.id },
          data: {
            status: StatusAnaliseEstoque.FALHA,
            finalizadoEm: new Date(),
            erro: descreverErro(erro),
          },
        });
      }
    } finally {
      this.emExecucao = false;
    }
  }

  /**
   * Loop manual de tool use: ate 50 chamadas de ferramenta e 2 minutos.
   * O historico so e acrescentado (response.content inteiro volta), nunca editado.
   */
  private async executarLoop(ctx: ContextoFerramentas, prazo: number): Promise<ResultadoLoop> {
    const passos: PassoAgente[] = [];
    let chamadas = 0;
    let modelo: string | null = null;
    const fim = (status: StatusAnaliseEstoque, erro: string | null = null): ResultadoLoop => ({
      status,
      passos,
      chamadas,
      erro,
      modelo,
    });
    const parcial = (motivo: string) => {
      passos.push({ tipo: 'limite', texto: motivo });
      return fim(StatusAnaliseEstoque.PARCIAL, motivo);
    };

    if (!this.cliente.disponivel()) {
      return fim(StatusAnaliseEstoque.FALHA, 'sem chave');
    }

    const messages: Anthropic.MessageParam[] = [
      {
        role: 'user',
        content:
          `Analise o estoque de hoje (${ctx.snapshot.geradoEm.toISOString().slice(0, 10)}). ` +
          'Comece por listarMateriais.',
      },
    ];
    const controle = new AbortController();
    const timer = setTimeout(() => controle.abort(), Math.max(0, prazo - Date.now()));
    const PRAZO = 'prazo de 2 minutos atingido';

    try {
      for (;;) {
        if (Date.now() >= prazo) return parcial(PRAZO);

        let resposta: Anthropic.Message;
        try {
          resposta = await this.cliente.enviar({
            system: SISTEMA,
            tools: this.ferramentas.definicoes,
            messages,
            signal: controle.signal,
          });
        } catch (erro) {
          if (controle.signal.aborted || Date.now() >= prazo) return parcial(PRAZO);
          const descricao = descreverErro(erro);
          passos.push({ tipo: 'erro', texto: descricao });
          return fim(StatusAnaliseEstoque.FALHA, descricao);
        }

        modelo = resposta.model ?? modelo;
        for (const bloco of resposta.content) {
          if (bloco.type === 'text' && bloco.text.trim() !== '') {
            passos.push({ tipo: 'texto', texto: bloco.text });
          }
        }

        if (resposta.stop_reason === 'end_turn') return fim(StatusAnaliseEstoque.SUCESSO);
        if (resposta.stop_reason !== 'tool_use') {
          // refusal, max_tokens e qualquer outro motivo inesperado.
          return fim(StatusAnaliseEstoque.FALHA, `stop_reason: ${resposta.stop_reason}`);
        }

        messages.push({ role: 'assistant', content: resposta.content });
        const resultados: Anthropic.ToolResultBlockParam[] = [];
        for (const bloco of resposta.content) {
          if (bloco.type !== 'tool_use') continue;
          if (chamadas >= LIMITE_CHAMADAS_FERRAMENTA) {
            return parcial(
              `limite de ${LIMITE_CHAMADAS_FERRAMENTA} chamadas de ferramenta atingido`,
            );
          }
          if (Date.now() >= prazo) return parcial(PRAZO);

          chamadas++;
          const resultado = this.ferramentas.executar(bloco.name, bloco.input, ctx);
          passos.push({
            tipo: 'ferramenta',
            ferramenta: bloco.name,
            entrada: bloco.input,
            resultado: resultado.conteudo.slice(0, TAMANHO_RESUMO),
            erro: resultado.erro,
          });
          resultados.push({
            type: 'tool_result',
            tool_use_id: bloco.id,
            content: resultado.conteudo,
            ...(resultado.erro ? { is_error: true } : {}),
          });
        }
        messages.push({ role: 'user', content: resultados });
      }
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Grava o resultado numa unica $transaction: sugestoes aceitas, rede de seguranca,
   * reabertura, fechamento dos nao repetidos (so SUCESSO/PARCIAL) e finalizacao da analise.
   * Nunca toca em Material.saldoAtual nem cria MovimentacaoEstoque.
   */
  private async persistir(
    analise: AnaliseEstoque,
    ctx: ContextoFerramentas,
    loop: ResultadoLoop,
  ): Promise<AnaliseEstoque> {
    const agora = ctx.snapshot.geradoEm;
    const fechaNaoRepetidos =
      loop.status === StatusAnaliseEstoque.SUCESSO || loop.status === StatusAnaliseEstoque.PARCIAL;

    return this.prisma.$transaction(async (tx) => {
      const alertados: string[] = [];

      for (const material of ctx.snapshot.materiais) {
        const sugestao = ctx.aceitas.find((s) => s.materialId === material.id);
        let dados: DadosAlerta;

        if (sugestao) {
          const quantidade = sugestao.quantidade;
          const { texto, origemTexto } = finalizarJustificativa(
            sugestao.justificativa,
            ctx.mapa,
            material.obrasQueReservam,
            textoPadrao(material, sugestao.tipo, quantidade),
          );
          dados = dadosAlerta(material, sugestao.tipo, quantidade, texto, origemTexto);
        } else if (
          material.indicador.obrigatorio &&
          !silencioDoMaterial(material.ultimosAlertas, agora).tudo
        ) {
          // Rede de seguranca: so REPOSICAO, com a quantidade calculada e o texto padrao.
          const quantidade = material.indicador.calculado;
          dados = dadosAlerta(
            material,
            TipoAlertaEstoque.REPOSICAO,
            quantidade,
            textoPadrao(material, TipoAlertaEstoque.REPOSICAO, quantidade),
            OrigemTextoAlerta.PADRAO,
          );
        } else {
          continue;
        }

        const ativo = await tx.alertaEstoque.findFirst({
          where: { materialId: material.id, status: StatusAlertaEstoque.ATIVO },
        });
        const reabrir = ativo ? null : alertaReabrivel(material.ultimosAlertas, dados.tipo, agora);

        if (ativo) {
          await tx.alertaEstoque.update({
            where: { id: ativo.id },
            data: { ...dados, analiseId: analise.id },
          });
        } else if (reabrir) {
          await tx.alertaEstoque.update({
            where: { id: reabrir.id },
            data: {
              ...dados,
              analiseId: analise.id,
              status: StatusAlertaEstoque.ATIVO,
              resolvidoPor: null,
              resolvidoEm: null,
            },
          });
        } else {
          await tx.alertaEstoque.create({
            data: { ...dados, materialId: material.id, analiseId: analise.id },
          });
        }
        alertados.push(material.id);
      }

      if (fechaNaoRepetidos) {
        await tx.alertaEstoque.updateMany({
          where: { status: StatusAlertaEstoque.ATIVO, materialId: { notIn: alertados } },
          data: {
            status: StatusAlertaEstoque.RESOLVIDO,
            resolvidoPor: ResolvidoPor.AGENTE,
            resolvidoEm: agora,
          },
        });
      }

      const totalAlertas = await tx.alertaEstoque.count({
        where: { status: StatusAlertaEstoque.ATIVO },
      });

      return tx.analiseEstoque.update({
        where: { id: analise.id },
        data: {
          status: loop.status,
          finalizadoEm: new Date(),
          totalAlertas,
          chamadasFerramenta: loop.chamadas,
          modelo: loop.modelo,
          erro: loop.erro,
          passos: loop.passos as unknown as Prisma.InputJsonValue,
          marcadores: ctx.mapa.paraJson(),
        },
      });
    });
  }
}

type DadosAlerta = Pick<
  Prisma.AlertaEstoqueUncheckedCreateInput,
  | 'tipo'
  | 'quantidadeSugerida'
  | 'saldoLivre'
  | 'estoqueMinimo'
  | 'ritmoDiario'
  | 'diasAteMinimo'
  | 'justificativa'
  | 'origemTexto'
>;

const duasCasas = (valor: Decimal) => valor.toDecimalPlaces(2);

function dadosAlerta(
  material: MaterialSnapshot,
  tipo: TipoAlertaEstoque,
  quantidade: Decimal | null,
  justificativa: string,
  origemTexto: OrigemTextoAlerta,
): DadosAlerta {
  const i = material.indicador;
  return {
    tipo,
    quantidadeSugerida:
      tipo === TipoAlertaEstoque.INFORMATIVO || !quantidade ? null : duasCasas(quantidade),
    saldoLivre: duasCasas(i.saldoLivre),
    estoqueMinimo: duasCasas(material.estoqueMinimo),
    ritmoDiario: duasCasas(i.ritmoDiario),
    // Arredonda para baixo: o card mostra floor(diasAteMinimo).
    diasAteMinimo:
      i.diasAteMinimo === null ? null : i.diasAteMinimo.toDecimalPlaces(2, Decimal.ROUND_DOWN),
    justificativa,
    origemTexto,
  };
}

/**
 * Ultimo alerta do mesmo tipo resolvido pelo operador ha 3 dias ou mais: volta a ATIVO (EAP-52).
 * Mesmo tipo para nao transformar um INFORMATIVO antigo em REPOSICAO (e vice-versa).
 */
function alertaReabrivel(
  alertas: AlertaEstoque[],
  tipo: TipoAlertaEstoque,
  agora: Date,
): AlertaEstoque | null {
  const ultimo = alertas
    .filter((a) => a.tipo === tipo)
    .sort((a, b) => b.atualizadoEm.getTime() - a.atualizadoEm.getTime())[0];
  if (
    ultimo?.status === StatusAlertaEstoque.RESOLVIDO &&
    ultimo.resolvidoPor === ResolvidoPor.OPERADOR &&
    ultimo.resolvidoEm !== null &&
    agora.getTime() - ultimo.resolvidoEm.getTime() >= SILENCIO_RESOLUCAO_DIAS * DIA_MS
  ) {
    return ultimo;
  }
  return null;
}

const fmt = (valor: Decimal) =>
  Number(valor.toDecimalPlaces(2)).toLocaleString('pt-BR', { maximumFractionDigits: 2 });

/** Justificativa padrao (origemTexto = PADRAO), montada so com os numeros do material. */
export function textoPadrao(
  material: MaterialSnapshot,
  tipo: TipoAlertaEstoque,
  quantidade: Decimal | null,
): string {
  const i = material.indicador;
  const un = material.unidade;
  const saldo = `Saldo livre de ${fmt(i.saldoLivre)} ${un}`;
  const minimo = `mínimo de ${fmt(material.estoqueMinimo)} ${un}`;
  const temConsumo = i.ritmoDiario.gt(0);
  const consumo = temConsumo
    ? `consumo de ${fmt(i.ritmoDiario)} ${un}/dia`
    : `sem consumo nos últimos ${material.diasJanela} dias`;

  let texto: string;
  if (tipo === TipoAlertaEstoque.INFORMATIVO) {
    texto = `${saldo}, ${minimo}; ${consumo}. Sem necessidade de compra pelo cálculo.`;
  } else {
    let situacao: string;
    if (i.motivo === 'ABAIXO_DO_MINIMO') situacao = `${saldo}, abaixo do ${minimo}`;
    else if (i.motivo === 'NO_MINIMO_COM_CONSUMO') situacao = `${saldo}, no ${minimo}`;
    else if (i.diasAteMinimo !== null)
      situacao = `${saldo} cruza o ${minimo} em ~${i.diasAteMinimo.floor().toString()} dias`;
    else situacao = `${saldo}, ${minimo}`;
    const cobertura = temConsumo ? ' cobre 30 dias' : '';
    const repor = quantidade ? ` Repor ${fmt(quantidade)} ${un}${cobertura}.` : '';
    texto = `${situacao}; ${consumo}.${repor}`;
  }

  if (material.obrasQueReservam.length > 0) {
    texto += ` Reservado para: ${material.obrasQueReservam.map((o) => o.titulo).join(', ')}.`;
  }
  if (material.usoSemPrevisao.length > 0) {
    const obras = material.usoSemPrevisao.map(
      (u) => `${u.titulo} (${fmt(u.saidasNaJanela)} ${un})`,
    );
    texto += ` Saídas para obras sem previsão: ${obras.join(', ')}.`;
  }
  return texto;
}

function descreverErro(erro: unknown): string {
  if (erro instanceof Error) return `${erro.constructor.name}: ${erro.message}`.slice(0, 500);
  return String(erro).slice(0, 500);
}
