import Anthropic from '@anthropic-ai/sdk';
import { Injectable } from '@nestjs/common';
import {
  AlertaEstoque,
  Prisma,
  ResolvidoPor,
  StatusAlertaEstoque,
  StatusObra,
  TipoAlertaEstoque,
} from '@prisma/client';

import { MapaMarcadores } from './marcadores-obra';
import { MaterialSnapshot, SnapshotEstoque } from './previsao-estoque.service';

type Decimal = Prisma.Decimal;
const Decimal = Prisma.Decimal;

const DIA_MS = 24 * 60 * 60 * 1000;
export const SILENCIO_DISPENSA_DIAS = 5;
export const SILENCIO_RESOLUCAO_DIAS = 3;

/** Sugestao aceita durante o loop; so e gravada no fim da analise. */
export interface SugestaoAceita {
  materialId: string;
  tipo: TipoAlertaEstoque;
  /** null no INFORMATIVO */
  quantidade: Decimal | null;
  /** Texto cru do agente (com marcadores); finalizado na persistencia. */
  justificativa: string;
}

/** Leituras por material que a trava do sugerirReposicao pode exigir (EAP-67). */
export type ConsultaMaterial = 'consumoDoMaterial' | 'reservadoPorObras' | 'previstoVsUtilizado';

export interface ContextoFerramentas {
  snapshot: SnapshotEstoque;
  mapa: MapaMarcadores;
  aceitas: SugestaoAceita[];
  /** Leituras ja feitas nesta analise, por materialId. */
  consultas: Map<string, Set<ConsultaMaterial>>;
}

/** Obras que ainda vao consumir: previsao delas pede investigacao. */
const STATUS_OBRA_ATIVA: StatusObra[] = [StatusObra.FECHADA, StatusObra.ANDAMENTO];

const temReserva = (m: MaterialSnapshot) => m.obrasQueReservam.length > 0;
const temPrevisao = (m: MaterialSnapshot) =>
  m.previstoVsUtilizado.some((l) => STATUS_OBRA_ATIVA.includes(l.status));

/**
 * Leituras que o agente precisa ter feito antes de sugerir para o material (EAP-67):
 * consumoDoMaterial sempre; reservadoPorObras com reserva; previstoVsUtilizado com
 * previsao de obra FECHADA/ANDAMENTO.
 */
export function consultasExigidas(m: MaterialSnapshot): ConsultaMaterial[] {
  const exigidas: ConsultaMaterial[] = ['consumoDoMaterial'];
  if (temReserva(m)) exigidas.push('reservadoPorObras');
  if (temPrevisao(m)) exigidas.push('previstoVsUtilizado');
  return exigidas;
}

/** Faixa aceita de REPOSICAO: 50% a 200% do calculado (EAP-05). */
const faixaReposicao = (calculado: Decimal) => ({
  minimo: calculado.times(0.5),
  maximo: calculado.times(2),
});

export interface ResultadoFerramenta {
  conteudo: string;
  erro: boolean;
}

export interface SilencioMaterial {
  /** REPOSICAO dispensado < 5 dias ou resolvido pelo operador < 3 dias: nada e criado. */
  tudo: boolean;
  /** tudo, ou INFORMATIVO dispensado < 5 dias / resolvido pelo operador < 3 dias: novo INFORMATIVO e recusado. */
  informativo: boolean;
  motivo: string | null;
}

const recente = (data: Date | null, agora: Date, dias: number) =>
  data !== null && agora.getTime() - data.getTime() < dias * DIA_MS;

/**
 * Silencio de um material a partir dos ultimos alertas dele (EAP-50, EAP-51, EAP-65).
 * Usado por sugerirReposicao e pela rede de seguranca.
 */
export function silencioDoMaterial(alertas: AlertaEstoque[], agora: Date): SilencioMaterial {
  const ordenados = [...alertas].sort(
    (a, b) => b.atualizadoEm.getTime() - a.atualizadoEm.getTime(),
  );
  const ultimoDoTipo = (tipo: TipoAlertaEstoque) => ordenados.find((a) => a.tipo === tipo);
  const resolvidoPeloOperadorRecente = (alerta: AlertaEstoque | undefined) =>
    alerta?.status === StatusAlertaEstoque.RESOLVIDO &&
    alerta.resolvidoPor === ResolvidoPor.OPERADOR &&
    recente(alerta.resolvidoEm, agora, SILENCIO_RESOLUCAO_DIAS);

  // Silencio por tipo: REPOSICAO dispensado/resolvido segura tudo;
  // INFORMATIVO dispensado/resolvido segura so novos INFORMATIVO.
  const reposicao = ultimoDoTipo(TipoAlertaEstoque.REPOSICAO);
  if (
    reposicao?.status === StatusAlertaEstoque.DISPENSADO &&
    recente(reposicao.dispensadoEm, agora, SILENCIO_DISPENSA_DIAS)
  ) {
    return {
      tudo: true,
      informativo: true,
      motivo: `alerta de reposição dispensado há menos de ${SILENCIO_DISPENSA_DIAS} dias`,
    };
  }

  if (resolvidoPeloOperadorRecente(reposicao)) {
    return {
      tudo: true,
      informativo: true,
      motivo: `alerta de reposição resolvido pelo operador há menos de ${SILENCIO_RESOLUCAO_DIAS} dias`,
    };
  }

  const informativo = ultimoDoTipo(TipoAlertaEstoque.INFORMATIVO);
  if (
    informativo?.status === StatusAlertaEstoque.DISPENSADO &&
    recente(informativo.dispensadoEm, agora, SILENCIO_DISPENSA_DIAS)
  ) {
    return {
      tudo: false,
      informativo: true,
      motivo: `observação dispensada há menos de ${SILENCIO_DISPENSA_DIAS} dias`,
    };
  }

  if (resolvidoPeloOperadorRecente(informativo)) {
    return {
      tudo: false,
      informativo: true,
      motivo: `observação resolvida pelo operador há menos de ${SILENCIO_RESOLUCAO_DIAS} dias`,
    };
  }

  return { tudo: false, informativo: false, motivo: null };
}

const num = (valor: Decimal | null) => (valor === null ? null : Number(valor.toDecimalPlaces(2)));

const entradaMaterial = {
  type: 'object' as const,
  properties: { materialId: { type: 'string', description: 'id vindo de listarMateriais' } },
  required: ['materialId'],
};

/** Definicoes enviadas a Claude API: 4 leituras e 1 escrita. */
export const DEFINICOES_FERRAMENTAS: Anthropic.Tool[] = [
  {
    name: 'listarMateriais',
    description:
      'Visão geral de todos os materiais: saldo atual, mínimo, risco (ABAIXO_DO_MINIMO, ' +
      'NO_MINIMO_COM_CONSUMO, PREVISAO ou SEM_RISCO), se o alerta é obrigatório e se há ' +
      'reserva ou previsão de obras ativas. Não traz a quantidade a comprar.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'consumoDoMaterial',
    description:
      'Consumo solto de um material na janela de análise (saídas sem obra ou de obras sem ' +
      'previsão para ele), com ritmo diário, dias até o mínimo, saldo livre, a quantidade ' +
      'calculada para 30 dias de cobertura e a faixa aceita para REPOSICAO.',
    input_schema: entradaMaterial,
  },
  {
    name: 'reservadoPorObras',
    description:
      'Quanto do material está reservado por obras FECHADA/ANDAMENTO, por obra. ' +
      'As obras aparecem só como marcadores {{OBRA_n}}.',
    input_schema: entradaMaterial,
  },
  {
    name: 'previstoVsUtilizado',
    description:
      'Previsto × utilizado de cada obra que prevê o material (pendente e excedente). ' +
      'As obras aparecem só como marcadores {{OBRA_n}}.',
    input_schema: entradaMaterial,
  },
  {
    name: 'sugerirReposicao',
    description:
      'Registra a sugestão para um material. Só é aceita depois de consumoDoMaterial e, quando ' +
      'o material tem reserva ou previsão, de reservadoPorObras / previstoVsUtilizado. ' +
      'REPOSICAO exige quantidade entre 50% e 200% da ' +
      'quantidade calculada e só vale com calculado > 0. INFORMATIVO não leva quantidade e só ' +
      'vale com calculado <= 0. Cite obras só pelos marcadores {{OBRA_n}} recebidos. ' +
      'Uma nova sugestão para o mesmo material substitui a anterior.',
    input_schema: {
      type: 'object',
      properties: {
        materialId: { type: 'string' },
        tipo: {
          type: 'string',
          enum: [TipoAlertaEstoque.REPOSICAO, TipoAlertaEstoque.INFORMATIVO],
        },
        quantidade: { type: 'number', description: 'obrigatória em REPOSICAO' },
        justificativa: { type: 'string', description: 'texto curto em português para o operador' },
      },
      required: ['materialId', 'tipo', 'justificativa'],
    },
  },
];

/**
 * Executa as ferramentas do agente contra o snapshot. A unica escrita e a lista de
 * sugestoes aceitas em memoria; nada vai ao banco aqui.
 * Spec: .claude/specs/features/estoque-agente-proativo/spec.md
 * (EAP-05, 06, 11, 50, 51, 58, 59, 65, 67)
 */
@Injectable()
export class FerramentasAgente {
  readonly definicoes = DEFINICOES_FERRAMENTAS;

  executar(nome: string, input: unknown, ctx: ContextoFerramentas): ResultadoFerramenta {
    const dados = (input ?? {}) as Record<string, unknown>;
    if (typeof dados !== 'object' || Array.isArray(dados)) {
      return falha('Entrada inválida: esperado um objeto JSON');
    }

    if (nome === 'listarMateriais') {
      return ok(ctx.snapshot.materiais.map((m) => visaoGeral(m)));
    }

    if (
      ![
        'consumoDoMaterial',
        'reservadoPorObras',
        'previstoVsUtilizado',
        'sugerirReposicao',
      ].includes(nome)
    ) {
      return falha(`Ferramenta desconhecida: ${nome}`);
    }

    if (typeof dados.materialId !== 'string' || dados.materialId === '') {
      return falha('Entrada inválida: materialId é obrigatório');
    }
    const material = ctx.snapshot.materiais.find((m) => m.id === dados.materialId);
    if (!material) {
      return falha(`Material ${dados.materialId} não encontrado`);
    }

    if (nome !== 'sugerirReposicao') {
      const feitas = ctx.consultas.get(material.id) ?? new Set<ConsultaMaterial>();
      ctx.consultas.set(material.id, feitas.add(nome as ConsultaMaterial));
    }

    switch (nome) {
      case 'consumoDoMaterial': {
        const { calculado } = material.indicador;
        const faixa = calculado.gt(0) ? faixaReposicao(calculado) : null;
        return ok({
          materialId: material.id,
          nome: material.nome,
          unidade: material.unidade,
          diasJanela: material.diasJanela,
          consumoSolto: num(material.consumoSolto),
          ritmoDiario: num(material.indicador.ritmoDiario),
          diasAteMinimo: num(material.indicador.diasAteMinimo),
          saldoLivre: num(material.indicador.saldoLivre),
          calculado: num(calculado),
          // null com calculado <= 0: so INFORMATIVO e aceito.
          minimoAceito: faixa && num(faixa.minimo),
          maximoAceito: faixa && num(faixa.maximo),
        });
      }
      case 'reservadoPorObras':
        return ok({
          materialId: material.id,
          nome: material.nome,
          unidade: material.unidade,
          reservado: num(material.indicador.reservado),
          obras: material.obrasQueReservam.map((o) => ({
            obra: ctx.mapa.marcar(o.obraId, o.titulo),
            pendente: num(o.pendente),
          })),
        });
      case 'previstoVsUtilizado':
        return ok({
          materialId: material.id,
          nome: material.nome,
          unidade: material.unidade,
          obras: material.previstoVsUtilizado.map((l) => ({
            obra: ctx.mapa.marcar(l.obraId, l.titulo),
            status: l.status,
            previsto: num(l.previsto),
            utilizado: num(l.utilizado),
            pendente: num(l.pendente),
            excedente: num(l.excedente),
          })),
        });
      default:
        return this.sugerirReposicao(material, dados, ctx);
    }
  }

  private sugerirReposicao(
    material: MaterialSnapshot,
    dados: Record<string, unknown>,
    ctx: ContextoFerramentas,
  ): ResultadoFerramenta {
    const { tipo, quantidade, justificativa } = dados;
    if (tipo !== TipoAlertaEstoque.REPOSICAO && tipo !== TipoAlertaEstoque.INFORMATIVO) {
      return falha('Entrada inválida: tipo deve ser REPOSICAO ou INFORMATIVO');
    }
    if (typeof justificativa !== 'string' || justificativa.trim() === '') {
      return falha('Entrada inválida: justificativa é obrigatória');
    }
    if (
      quantidade !== undefined &&
      quantidade !== null &&
      (typeof quantidade !== 'number' || !Number.isFinite(quantidade))
    ) {
      return falha('Entrada inválida: quantidade deve ser um número');
    }

    const silencio = silencioDoMaterial(material.ultimosAlertas, ctx.snapshot.geradoEm);
    if (silencio.tudo || (tipo === TipoAlertaEstoque.INFORMATIVO && silencio.informativo)) {
      return falha(`Sugestão recusada: ${silencio.motivo}`);
    }

    // Trava de investigacao (EAP-67): depois do silencio, para nao pedir leituras inuteis.
    const feitas = ctx.consultas.get(material.id);
    const faltando = consultasExigidas(material).filter((c) => !feitas?.has(c));
    if (faltando.length > 0) {
      return falha(
        `Sugestão recusada: antes de sugerir para este material, consulte ${faltando.join(', ')}.`,
      );
    }

    const calculado = material.indicador.calculado;
    let qtd: Decimal | null = null;

    if (tipo === TipoAlertaEstoque.REPOSICAO) {
      if (calculado.lte(0)) {
        return falha(
          `Sugestão recusada: calculado = ${num(calculado)}, o material não precisa de compra; ` +
            'só INFORMATIVO é aceito.',
        );
      }
      const { minimo, maximo } = faixaReposicao(calculado);
      const faixa = `entre ${num(minimo)} e ${num(maximo)} ${material.unidade}`;
      if (typeof quantidade !== 'number') {
        return falha(`Entrada inválida: REPOSICAO exige quantidade (faixa aceita: ${faixa})`);
      }
      qtd = new Decimal(quantidade);
      if (qtd.lt(minimo) || qtd.gt(maximo)) {
        return falha(
          `Sugestão recusada: quantidade ${quantidade} fora da faixa aceita, ${faixa} ` +
            `(calculado = ${num(calculado)}).`,
        );
      }
    } else if (calculado.gt(0)) {
      return falha(
        `Sugestão recusada: calculado = ${num(calculado)}, o material exige REPOSICAO; ` +
          'coloque a observação na justificativa do REPOSICAO.',
      );
    }

    const outras = ctx.aceitas.filter((s) => s.materialId !== material.id);
    ctx.aceitas.splice(0, ctx.aceitas.length, ...outras, {
      materialId: material.id,
      tipo,
      quantidade: qtd,
      justificativa,
    });

    return ok({ aceito: true, materialId: material.id, tipo, quantidade: num(qtd) });
  }
}

/**
 * Item do listarMateriais: so a visao geral e o sinal de risco. Sem calculado, saldo livre
 * nem ritmo, para o agente investigar com as outras leituras antes de decidir.
 */
function visaoGeral(m: MaterialSnapshot) {
  return {
    materialId: m.id,
    nome: m.nome,
    unidade: m.unidade,
    saldoAtual: num(m.saldoAtual),
    estoqueMinimo: num(m.estoqueMinimo),
    risco: m.indicador.motivo ?? 'SEM_RISCO',
    obrigatorio: m.indicador.obrigatorio,
    temReserva: temReserva(m),
    temPrevisao: temPrevisao(m),
  };
}

const ok = (valor: unknown): ResultadoFerramenta => ({
  conteudo: JSON.stringify(valor),
  erro: false,
});
const falha = (mensagem: string): ResultadoFerramenta => ({ conteudo: mensagem, erro: true });
