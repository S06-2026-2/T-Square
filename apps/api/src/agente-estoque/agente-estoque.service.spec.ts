import Anthropic from '@anthropic-ai/sdk';
import { ConflictException, HttpException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
  AlertaEstoque,
  OrigemAnaliseEstoque,
  OrigemTextoAlerta,
  Prisma,
  ResolvidoPor,
  StatusAlertaEstoque,
  StatusAnaliseEstoque,
  StatusObra,
  TipoAlertaEstoque,
} from '@prisma/client';

import { calcularIndicador } from '../estoque/calculo-estoque';
import { PrismaService } from '../prisma/prisma.service';
import {
  AgenteEstoqueService,
  LIMITE_CHAMADAS_FERRAMENTA,
  PRAZO_ANALISE_MS,
  ResultadoLoop,
} from './agente-estoque.service';
import { CLIENTE_LLM, ClienteLlm, RequisicaoLlm } from './cliente-llm';
import { ContextoFerramentas, FerramentasAgente } from './ferramentas-agente';
import { MapaMarcadores } from './marcadores-obra';
import {
  MaterialSnapshot,
  PrevisaoEstoqueService,
  SnapshotEstoque,
} from './previsao-estoque.service';

/**
 * Cobre EAP-03, 07, 08, 09, 10, 12, 14, 15, 16, 17, 21, 22, 23, 24, 25, 50, 51, 52 e 60 de
 * .claude/specs/features/estoque-agente-proativo/spec.md
 * O Prisma e a Claude API sao substituidos por mocks: nenhum teste usa banco ou rede.
 */

type PassoRoteiro =
  Anthropic.Message | Error | ((req: RequisicaoLlm) => Promise<Anthropic.Message>);

/** ClienteLlm falsa: devolve uma sequencia fixa de respostas (roteiro de tool calls). */
class Roteiro implements ClienteLlm {
  readonly requisicoes: Anthropic.MessageParam[][] = [];

  constructor(
    private readonly passos: PassoRoteiro[],
    private readonly comChave = true,
  ) {}

  disponivel() {
    return this.comChave;
  }

  async enviar(req: RequisicaoLlm): Promise<Anthropic.Message> {
    this.requisicoes.push([...req.messages]);
    const passo = this.passos.shift();
    if (!passo) throw new Error('roteiro acabou');
    if (passo instanceof Error) throw passo;
    if (typeof passo === 'function') return passo(req);
    return passo;
  }
}

let idBloco = 0;
const resposta = (stop_reason: string, content: unknown[]): Anthropic.Message =>
  ({
    id: 'msg',
    model: 'claude-haiku-5-5',
    role: 'assistant',
    stop_reason,
    content,
  }) as unknown as Anthropic.Message;
const ferramenta = (name: string, input: Record<string, unknown> = {}) => ({
  type: 'tool_use',
  id: `tu-${++idBloco}`,
  name,
  input,
});
const usar = (...blocos: unknown[]) => resposta('tool_use', blocos);
/** Leitura que a trava do sugerirReposicao exige antes de sugerir (EAP-67). */
const consumo = (materialId: string) => ferramenta('consumoDoMaterial', { materialId });
const texto = (t: string) => ({ type: 'text', text: t });
const terminar = (t = 'Análise concluída.') => resposta('end_turn', [texto(t)]);

describe('AgenteEstoqueService', () => {
  const DIA = 24 * 60 * 60 * 1000;
  const MIN = 60 * 1000;
  const agora = new Date('2026-10-27T12:00:00Z');
  const diasAtras = (dias: number) => new Date(agora.getTime() - dias * DIA);
  const dec = (v: number) => new Prisma.Decimal(v);

  /** Material com janela de 30 dias. */
  function material(
    id: string,
    o: {
      saldo: number;
      minimo: number;
      consumo?: number;
      alertas?: Partial<AlertaEstoque>[];
      obras?: { obraId: string; titulo: string; pendente: number }[];
    },
  ): MaterialSnapshot {
    const obrasQueReservam = (o.obras ?? []).map((ob) => ({ ...ob, pendente: dec(ob.pendente) }));
    return {
      id,
      nome: id.toUpperCase(),
      unidade: 'saco',
      saldoAtual: dec(o.saldo),
      estoqueMinimo: dec(o.minimo),
      diasJanela: 30,
      consumoSolto: dec(o.consumo ?? 0),
      indicador: calcularIndicador({
        saldoAtual: dec(o.saldo),
        estoqueMinimo: dec(o.minimo),
        pendentes: obrasQueReservam.map((r) => r.pendente),
        consumoSolto: dec(o.consumo ?? 0),
        diasJanela: 30,
      }),
      obrasQueReservam,
      previstoVsUtilizado: [],
      ultimosAlertas: (o.alertas ?? []) as AlertaEstoque[],
    };
  }

  // saldo livre 5 < minimo 10, ritmo 1/dia -> obrigatorio, calculado = ceil(30 + 10 - 5) = 35.
  const calAbaixo = (alertas?: Partial<AlertaEstoque>[]) =>
    material('cal', { saldo: 5, minimo: 10, consumo: 30, alertas });
  // saldo 100, minimo 10, sem consumo -> nao obrigatorio, calculado <= 0.
  const gessoSobrando = () => material('gesso', { saldo: 100, minimo: 10 });
  // saldo 25 - 20 reservados = 5 livres; calculado = 35.
  const calReservada = () =>
    material('cal', {
      saldo: 25,
      minimo: 10,
      consumo: 30,
      obras: [{ obraId: 'o-1', titulo: 'Forro Residência Silva', pendente: 20 }],
    });
  const TEXTO_PADRAO_CAL =
    'Saldo livre de 5 saco, abaixo do mínimo de 10 saco; consumo de 1 saco/dia. ' +
    'Repor 35 saco cobre 30 dias.';

  let prisma: {
    analiseEstoque: {
      create: jest.Mock;
      update: jest.Mock;
      updateMany: jest.Mock;
      findFirst: jest.Mock;
    };
    alertaEstoque: {
      findFirst: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      updateMany: jest.Mock;
      count: jest.Mock;
    };
    material: { update: jest.Mock; updateMany: jest.Mock };
    movimentacaoEstoque: { create: jest.Mock; createMany: jest.Mock };
    $transaction: jest.Mock;
  };
  let previsao: { montarSnapshot: jest.Mock };

  const snapshot = (...materiais: MaterialSnapshot[]): SnapshotEstoque => ({
    geradoEm: agora,
    materiais,
  });

  beforeEach(() => {
    prisma = {
      analiseEstoque: {
        create: jest.fn(async ({ data }) => ({
          id: 'an-1',
          status: StatusAnaliseEstoque.EM_ANDAMENTO,
          ...data,
        })),
        update: jest.fn(async ({ where, data }) => ({ id: where.id, ...data })),
        updateMany: jest.fn(async () => ({ count: 0 })),
        findFirst: jest.fn(async () => null),
      },
      alertaEstoque: {
        findFirst: jest.fn(async () => null),
        create: jest.fn(async ({ data }) => ({ id: 'al-novo', ...data })),
        update: jest.fn(async ({ where, data }) => ({ id: where.id, ...data })),
        updateMany: jest.fn(async () => ({ count: 0 })),
        count: jest.fn(async () => 0),
      },
      material: { update: jest.fn(), updateMany: jest.fn() },
      movimentacaoEstoque: { create: jest.fn(), createMany: jest.fn() },
      // Executa o callback da transacao passando o proprio mock como "tx".
      $transaction: jest.fn((callback: (tx: unknown) => unknown) => callback(prisma)),
    };
    previsao = { montarSnapshot: jest.fn(async () => snapshot(calAbaixo(), gessoSobrando())) };
  });

  async function criar(roteiro: ClienteLlm): Promise<AgenteEstoqueService> {
    const modulo: TestingModule = await Test.createTestingModule({
      providers: [
        AgenteEstoqueService,
        FerramentasAgente,
        { provide: PrismaService, useValue: prisma },
        { provide: PrevisaoEstoqueService, useValue: previsao },
        { provide: CLIENTE_LLM, useValue: roteiro },
      ],
    }).compile();
    return modulo.get(AgenteEstoqueService);
  }

  const contexto = (...materiais: MaterialSnapshot[]): ContextoFerramentas => ({
    snapshot: snapshot(...materiais),
    mapa: new MapaMarcadores(),
    aceitas: [],
    consultas: new Map(),
  });

  const loop = (service: AgenteEstoqueService, ctx: ContextoFerramentas): Promise<ResultadoLoop> =>
    service['executarLoop'](ctx, Date.now() + PRAZO_ANALISE_MS);

  const dadosCriados = () => prisma.alertaEstoque.create.mock.calls.map(([arg]) => arg.data);
  const numeros = (d: Record<string, unknown>) =>
    Object.fromEntries(
      Object.entries(d).map(([k, v]) => [k, v instanceof Prisma.Decimal ? Number(v) : v]),
    );
  const fechamentos = () =>
    prisma.alertaEstoque.updateMany.mock.calls.filter(
      ([arg]) => arg.data.status === StatusAlertaEstoque.RESOLVIDO,
    );
  const finalizacao = () => prisma.analiseEstoque.update.mock.calls.slice(-1)[0]?.[0];

  // -------------------------------------------------------------------------------------------
  describe('T7 — loop do agente (EAP-08, EAP-09, EAP-17)', () => {
    it('end_turn termina com SUCESSO', async () => {
      const service = await criar(new Roteiro([terminar()]));

      const r = await loop(service, contexto(calAbaixo()));

      expect(r.status).toBe(StatusAnaliseEstoque.SUCESSO);
      expect(r.chamadas).toBe(0);
      expect(r.erro).toBeNull();
    });

    it('grava os passos na ordem e só acrescenta ao histórico', async () => {
      const lista = ferramenta('listarMateriais');
      const sugestao = ferramenta('sugerirReposicao', {
        materialId: 'cal',
        tipo: 'REPOSICAO',
        quantidade: 35,
        justificativa: 'Abaixo do mínimo.',
      });
      const primeira = usar(texto('Vou listar.'), lista);
      const roteiro = new Roteiro([primeira, usar(consumo('cal'), sugestao), terminar('Pronto.')]);
      const service = await criar(roteiro);

      const r = await loop(service, contexto(calAbaixo()));

      expect(r.status).toBe(StatusAnaliseEstoque.SUCESSO);
      expect(r.chamadas).toBe(3);
      expect(r.passos.map((p) => [p.tipo, p.ferramenta ?? p.texto])).toEqual([
        ['texto', 'Vou listar.'],
        ['ferramenta', 'listarMateriais'],
        ['ferramenta', 'consumoDoMaterial'],
        ['ferramenta', 'sugerirReposicao'],
        ['texto', 'Pronto.'],
      ]);
      expect(r.passos[3]).toEqual({
        tipo: 'ferramenta',
        ferramenta: 'sugerirReposicao',
        entrada: sugestao.input,
        resultado: expect.stringContaining('"aceito":true'),
        erro: false,
      });
      expect(r.passos[1].resultado).toContain('"materialId":"cal"');
      expect(r.modelo).toBe('claude-haiku-5-5');

      // 2a requisicao = 1a + resposta do assistente inteira + tool_result do listarMateriais.
      const segunda = roteiro.requisicoes[1];
      expect(segunda[0]).toEqual(roteiro.requisicoes[0][0]);
      expect(segunda[1]).toEqual({ role: 'assistant', content: primeira.content });
      expect(segunda[2]).toEqual({
        role: 'user',
        content: [expect.objectContaining({ type: 'tool_result', tool_use_id: lista.id })],
      });
    });

    it('ferramenta inexistente vira tool_result com erro, conta no limite e o loop continua', async () => {
      const errada = ferramenta('comprarMaterial', { materialId: 'cal' });
      const roteiro = new Roteiro([usar(errada), terminar()]);
      const service = await criar(roteiro);

      const r = await loop(service, contexto(calAbaixo()));

      expect(r.status).toBe(StatusAnaliseEstoque.SUCESSO);
      expect(r.chamadas).toBe(1);
      expect(roteiro.requisicoes[1][2]).toEqual({
        role: 'user',
        content: [expect.objectContaining({ tool_use_id: errada.id, is_error: true })],
      });
    });

    it('a 21ª chamada de ferramenta não executa: PARCIAL mantendo as aceitas', async () => {
      const blocos = [
        consumo('cal'),
        ferramenta('sugerirReposicao', {
          materialId: 'cal',
          tipo: 'REPOSICAO',
          quantidade: 35,
          justificativa: 'x',
        }),
        ...Array.from({ length: LIMITE_CHAMADAS_FERRAMENTA }, () => ferramenta('listarMateriais')),
      ];
      const roteiro = new Roteiro([usar(...blocos)]);
      const service = await criar(roteiro);
      const ctx = contexto(calAbaixo());

      const r = await loop(service, ctx);

      expect(r.status).toBe(StatusAnaliseEstoque.PARCIAL);
      expect(r.chamadas).toBe(20);
      expect(r.passos.filter((p) => p.tipo === 'ferramenta')).toHaveLength(20);
      expect(ctx.aceitas.map((s) => s.materialId)).toEqual(['cal']);
      expect(roteiro.requisicoes).toHaveLength(1);
    });

    describe('prazo de 2 minutos (relógio fake)', () => {
      beforeEach(() => jest.useFakeTimers({ now: agora }));
      afterEach(() => jest.useRealTimers());

      it('aborta a requisição em curso: PARCIAL mantendo as aceitas', async () => {
        let abortada = false;
        const travada = (req: RequisicaoLlm) =>
          new Promise<Anthropic.Message>((_, rejeitar) => {
            req.signal.addEventListener('abort', () => {
              abortada = true;
              rejeitar(new Error('Request was aborted.'));
            });
            jest.advanceTimersByTime(PRAZO_ANALISE_MS);
          });
        const service = await criar(
          new Roteiro([
            usar(
              consumo('cal'),
              ferramenta('sugerirReposicao', {
                materialId: 'cal',
                tipo: 'REPOSICAO',
                quantidade: 35,
                justificativa: 'x',
              }),
            ),
            travada,
          ]),
        );
        const ctx = contexto(calAbaixo());

        const r = await loop(service, ctx);

        expect(abortada).toBe(true);
        expect(r.status).toBe(StatusAnaliseEstoque.PARCIAL);
        expect(ctx.aceitas.map((s) => s.materialId)).toEqual(['cal']);
      });

      it('resposta que chega depois do prazo não executa as ferramentas pedidas', async () => {
        const atrasada = async () => {
          jest.setSystemTime(agora.getTime() + PRAZO_ANALISE_MS + 1);
          return usar(ferramenta('listarMateriais'));
        };
        const service = await criar(new Roteiro([atrasada]));

        const r = await loop(service, contexto(calAbaixo()));

        expect(r.status).toBe(StatusAnaliseEstoque.PARCIAL);
        expect(r.chamadas).toBe(0);
      });
    });

    it('exceção do cliente termina com FALHA', async () => {
      const service = await criar(new Roteiro([new Error('Connection error.')]));

      const r = await loop(service, contexto(calAbaixo()));

      expect(r.status).toBe(StatusAnaliseEstoque.FALHA);
      expect(r.erro).toContain('Connection error.');
    });

    it.each(['refusal', 'max_tokens'])('stop_reason %s termina com FALHA', async (stop) => {
      const service = await criar(new Roteiro([resposta(stop, [])]));

      const r = await loop(service, contexto(calAbaixo()));

      expect(r.status).toBe(StatusAnaliseEstoque.FALHA);
      expect(r.erro).toBe(`stop_reason: ${stop}`);
    });

    it('sem chave o loop nem começa: FALHA', async () => {
      const roteiro = new Roteiro([terminar()], false);
      const service = await criar(roteiro);

      const r = await loop(service, contexto(calAbaixo()));

      expect(r.status).toBe(StatusAnaliseEstoque.FALHA);
      expect(r.erro).toBe('sem chave');
      expect(roteiro.requisicoes).toHaveLength(0);
    });
  });

  // -------------------------------------------------------------------------------------------
  describe('T8 — persistência, rede de segurança e ciclo de vida', () => {
    const ativoNoBanco = { id: 'al-ativo', materialId: 'cal', status: StatusAlertaEstoque.ATIVO };

    it('obrigatório sem sugestão vira REPOSICAO com quantidade calculada e texto PADRAO (EAP-03, EAP-07)', async () => {
      const service = await criar(new Roteiro([terminar()]));

      await service.analisar(OrigemAnaliseEstoque.MANUAL);

      expect(dadosCriados().map(numeros)).toEqual([
        {
          tipo: TipoAlertaEstoque.REPOSICAO,
          quantidadeSugerida: 35,
          saldoLivre: 5,
          estoqueMinimo: 10,
          ritmoDiario: 1,
          diasAteMinimo: 0,
          justificativa: TEXTO_PADRAO_CAL,
          origemTexto: OrigemTextoAlerta.PADRAO,
          materialId: 'cal',
          analiseId: 'an-1',
        },
      ]);
    });

    it('sem chave: FALHA, rede de segurança cria o obrigatório e nada é fechado (EAP-08, EAP-16)', async () => {
      const service = await criar(new Roteiro([], false));

      const analise = await service.analisar(OrigemAnaliseEstoque.MANUAL);

      expect(analise?.status).toBe(StatusAnaliseEstoque.FALHA);
      expect(dadosCriados()).toEqual([
        expect.objectContaining({ materialId: 'cal', origemTexto: OrigemTextoAlerta.PADRAO }),
      ]);
      expect(fechamentos()).toEqual([]);
    });

    it('exceção da Claude API: FALHA não fecha alertas ATIVO (EAP-16)', async () => {
      const service = await criar(new Roteiro([new Error('500')]));

      const analise = await service.analisar(OrigemAnaliseEstoque.MANUAL);

      expect(analise?.status).toBe(StatusAnaliseEstoque.FALHA);
      expect(fechamentos()).toEqual([]);
    });

    it('rede de segurança nunca cria INFORMATIVO (EAP-60)', async () => {
      previsao.montarSnapshot.mockResolvedValue(snapshot(calAbaixo(), gessoSobrando()));
      const service = await criar(new Roteiro([terminar()]));

      await service.analisar(OrigemAnaliseEstoque.MANUAL);

      expect(dadosCriados().map((d) => [d.materialId, d.tipo])).toEqual([
        ['cal', TipoAlertaEstoque.REPOSICAO],
      ]);
    });

    it('sugestão sem investigar é recusada e a rede de segurança cobre o obrigatório (EAP-67)', async () => {
      const apressada = ferramenta('sugerirReposicao', {
        materialId: 'cal',
        tipo: 'REPOSICAO',
        quantidade: 40,
        justificativa: 'Sem olhar.',
      });
      const roteiro = new Roteiro([usar(apressada), terminar()]);
      const service = await criar(roteiro);

      const analise = await service.analisar(OrigemAnaliseEstoque.MANUAL);

      expect(analise?.status).toBe(StatusAnaliseEstoque.SUCESSO);
      expect(roteiro.requisicoes[1][2]).toEqual({
        role: 'user',
        content: [
          expect.objectContaining({
            tool_use_id: apressada.id,
            is_error: true,
            content: expect.stringContaining('consulte consumoDoMaterial'),
          }),
        ],
      });
      expect(dadosCriados().map(numeros)).toEqual([
        expect.objectContaining({
          materialId: 'cal',
          quantidadeSugerida: 35,
          origemTexto: OrigemTextoAlerta.PADRAO,
        }),
      ]);
    });

    it('INFORMATIVO aceito do agente é gravado sem quantidade (EAP-58)', async () => {
      const service = await criar(
        new Roteiro([
          usar(
            consumo('gesso'),
            ferramenta('sugerirReposicao', {
              materialId: 'gesso',
              tipo: 'INFORMATIVO',
              justificativa: 'Estoque folgado.',
            }),
          ),
          terminar(),
        ]),
      );

      await service.analisar(OrigemAnaliseEstoque.MANUAL);

      expect(dadosCriados().find((d) => d.materialId === 'gesso')).toEqual(
        expect.objectContaining({
          tipo: TipoAlertaEstoque.INFORMATIVO,
          quantidadeSugerida: null,
          justificativa: 'Estoque folgado.',
          origemTexto: OrigemTextoAlerta.AGENTE,
        }),
      );
    });

    it('reexecução atualiza o ATIVO existente em vez de criar outro (EAP-14)', async () => {
      prisma.alertaEstoque.findFirst.mockResolvedValue(ativoNoBanco);
      const service = await criar(new Roteiro([terminar()]));

      await service.analisar(OrigemAnaliseEstoque.MANUAL);

      expect(prisma.alertaEstoque.findFirst).toHaveBeenCalledWith({
        where: { materialId: 'cal', status: StatusAlertaEstoque.ATIVO },
      });
      expect(prisma.alertaEstoque.create).not.toHaveBeenCalled();
      expect(prisma.alertaEstoque.update).toHaveBeenCalledTimes(1);
      const [{ where, data }] = prisma.alertaEstoque.update.mock.calls[0];
      expect(where).toEqual({ id: 'al-ativo' });
      expect(numeros(data)).toEqual(
        expect.objectContaining({
          quantidadeSugerida: 35,
          analiseId: 'an-1',
          justificativa: TEXTO_PADRAO_CAL,
        }),
      );
    });

    it('SUCESSO fecha como RESOLVIDO/AGENTE todo ATIVO não repetido (EAP-15)', async () => {
      const service = await criar(new Roteiro([terminar()]));

      await service.analisar(OrigemAnaliseEstoque.MANUAL);

      expect(fechamentos()).toEqual([
        [
          {
            where: { status: StatusAlertaEstoque.ATIVO, materialId: { notIn: ['cal'] } },
            data: {
              status: StatusAlertaEstoque.RESOLVIDO,
              resolvidoPor: ResolvidoPor.AGENTE,
              resolvidoEm: agora,
            },
          },
        ],
      ]);
    });

    it('PARCIAL também fecha os não repetidos e mantém as aceitas (EAP-09, EAP-15)', async () => {
      const blocos = [
        consumo('cal'),
        ferramenta('sugerirReposicao', {
          materialId: 'cal',
          tipo: 'REPOSICAO',
          quantidade: 40,
          justificativa: 'Sugestão do agente.',
        }),
        ...Array.from({ length: LIMITE_CHAMADAS_FERRAMENTA }, () => ferramenta('listarMateriais')),
      ];
      const service = await criar(new Roteiro([usar(...blocos)]));

      const analise = await service.analisar(OrigemAnaliseEstoque.MANUAL);

      expect(analise?.status).toBe(StatusAnaliseEstoque.PARCIAL);
      expect(dadosCriados().map(numeros)).toEqual([
        expect.objectContaining({
          materialId: 'cal',
          quantidadeSugerida: 40,
          justificativa: 'Sugestão do agente.',
          origemTexto: OrigemTextoAlerta.AGENTE,
        }),
      ]);
      expect(fechamentos()).toHaveLength(1);
      expect(fechamentos()[0][0].where.materialId).toEqual({ notIn: ['cal'] });
    });

    describe('silêncio e reabertura (EAP-50, EAP-51, EAP-52)', () => {
      const alerta = (a: Partial<AlertaEstoque>): Partial<AlertaEstoque> => ({
        materialId: 'cal',
        tipo: TipoAlertaEstoque.REPOSICAO,
        resolvidoPor: null,
        dispensadoEm: null,
        resolvidoEm: null,
        atualizadoEm: diasAtras(1),
        ...a,
      });

      it.each([
        [
          'REPOSICAO dispensado há 4 dias',
          { status: StatusAlertaEstoque.DISPENSADO, dispensadoEm: diasAtras(4) },
        ],
        [
          'resolvido pelo operador há 2 dias',
          {
            status: StatusAlertaEstoque.RESOLVIDO,
            resolvidoPor: ResolvidoPor.OPERADOR,
            resolvidoEm: diasAtras(2),
          },
        ],
      ])('%s: a rede de segurança não cria nem reabre o obrigatório', async (_, a) => {
        previsao.montarSnapshot.mockResolvedValue(snapshot(calAbaixo([alerta(a)])));
        const service = await criar(new Roteiro([terminar()]));

        await service.analisar(OrigemAnaliseEstoque.MANUAL);

        expect(prisma.alertaEstoque.create).not.toHaveBeenCalled();
        expect(prisma.alertaEstoque.update).not.toHaveBeenCalled();
      });

      it('INFORMATIVO resolvido pelo operador há 1 dia: a rede de segurança cria o REPOSICAO obrigatório', async () => {
        previsao.montarSnapshot.mockResolvedValue(
          snapshot(
            calAbaixo([
              alerta({
                tipo: TipoAlertaEstoque.INFORMATIVO,
                status: StatusAlertaEstoque.RESOLVIDO,
                resolvidoPor: ResolvidoPor.OPERADOR,
                resolvidoEm: diasAtras(1),
              }),
            ]),
          ),
        );
        const service = await criar(new Roteiro([terminar()]));

        await service.analisar(OrigemAnaliseEstoque.MANUAL);

        expect(dadosCriados()).toEqual([
          expect.objectContaining({ materialId: 'cal', tipo: TipoAlertaEstoque.REPOSICAO }),
        ]);
      });

      it('INFORMATIVO resolvido pelo operador há 3 dias ou mais não é reaberto como REPOSICAO', async () => {
        previsao.montarSnapshot.mockResolvedValue(
          snapshot(
            calAbaixo([
              alerta({
                id: 'al-info',
                tipo: TipoAlertaEstoque.INFORMATIVO,
                status: StatusAlertaEstoque.RESOLVIDO,
                resolvidoPor: ResolvidoPor.OPERADOR,
                resolvidoEm: diasAtras(3),
              }),
            ]),
          ),
        );
        const service = await criar(new Roteiro([terminar()]));

        await service.analisar(OrigemAnaliseEstoque.MANUAL);

        expect(prisma.alertaEstoque.update).not.toHaveBeenCalledWith(
          expect.objectContaining({ where: { id: 'al-info' } }),
        );
        expect(dadosCriados()).toEqual([
          expect.objectContaining({ materialId: 'cal', tipo: TipoAlertaEstoque.REPOSICAO }),
        ]);
      });

      it('dispensado há 5 dias ou mais: cria um alerta novo', async () => {
        previsao.montarSnapshot.mockResolvedValue(
          snapshot(
            calAbaixo([
              alerta({ status: StatusAlertaEstoque.DISPENSADO, dispensadoEm: diasAtras(5) }),
            ]),
          ),
        );
        const service = await criar(new Roteiro([terminar()]));

        await service.analisar(OrigemAnaliseEstoque.MANUAL);

        expect(dadosCriados()).toEqual([expect.objectContaining({ materialId: 'cal' })]);
      });

      it('resolvido pelo operador há 3 dias ou mais: o mesmo registro volta para ATIVO', async () => {
        previsao.montarSnapshot.mockResolvedValue(
          snapshot(
            calAbaixo([
              alerta({
                id: 'al-velho',
                status: StatusAlertaEstoque.RESOLVIDO,
                resolvidoPor: ResolvidoPor.OPERADOR,
                resolvidoEm: diasAtras(3),
              }),
            ]),
          ),
        );
        const service = await criar(new Roteiro([terminar()]));

        await service.analisar(OrigemAnaliseEstoque.MANUAL);

        expect(prisma.alertaEstoque.create).not.toHaveBeenCalled();
        const [{ where, data }] = prisma.alertaEstoque.update.mock.calls[0];
        expect(where).toEqual({ id: 'al-velho' });
        expect(numeros(data)).toEqual(
          expect.objectContaining({
            status: StatusAlertaEstoque.ATIVO,
            resolvidoPor: null,
            resolvidoEm: null,
            quantidadeSugerida: 35,
            saldoLivre: 5,
            analiseId: 'an-1',
          }),
        );
      });
    });

    describe('justificativa passa por finalizarJustificativa (EAP-12)', () => {
      const comTexto = (justificativa: string) =>
        new Roteiro([
          usar(consumo('cal'), ferramenta('reservadoPorObras', { materialId: 'cal' })),
          usar(
            ferramenta('sugerirReposicao', {
              materialId: 'cal',
              tipo: 'REPOSICAO',
              quantidade: 40,
              justificativa,
            }),
          ),
          terminar(),
        ]);

      beforeEach(() => previsao.montarSnapshot.mockResolvedValue(snapshot(calReservada())));

      it('troca o marcador emitido pelo título da obra', async () => {
        const service = await criar(comTexto('Falta material para {{OBRA_1}}.'));

        await service.analisar(OrigemAnaliseEstoque.MANUAL);

        expect(dadosCriados()[0]).toEqual(
          expect.objectContaining({
            justificativa: 'Falta material para Forro Residência Silva.',
            origemTexto: OrigemTextoAlerta.AGENTE,
          }),
        );
      });

      it('marcador alterado: grava o texto padrão do material com PADRAO', async () => {
        const service = await criar(comTexto('Falta material para {{OBRA 12}}.'));

        await service.analisar(OrigemAnaliseEstoque.MANUAL);

        expect(numeros(dadosCriados()[0])).toEqual(
          expect.objectContaining({
            quantidadeSugerida: 40,
            justificativa:
              'Saldo livre de 5 saco, abaixo do mínimo de 10 saco; consumo de 1 saco/dia. ' +
              'Repor 40 saco cobre 30 dias. Reservado para: Forro Residência Silva.',
            origemTexto: OrigemTextoAlerta.PADRAO,
          }),
        );
      });

      it('sem marcador da obra que reserva: acrescenta "Reservado para:"', async () => {
        const service = await criar(comTexto('Comprar logo'));

        await service.analisar(OrigemAnaliseEstoque.MANUAL);

        expect(dadosCriados()[0]).toEqual(
          expect.objectContaining({
            justificativa: 'Comprar logo. Reservado para: Forro Residência Silva.',
            origemTexto: OrigemTextoAlerta.AGENTE,
          }),
        );
      });
    });

    it.each([
      ['SUCESSO', () => new Roteiro([terminar()])],
      [
        'PARCIAL',
        () =>
          new Roteiro([
            usar(
              ...Array.from({ length: LIMITE_CHAMADAS_FERRAMENTA + 1 }, () =>
                ferramenta('listarMateriais'),
              ),
            ),
          ]),
      ],
      ['FALHA', () => new Roteiro([], false)],
    ])('%s: nunca altera saldoAtual nem cria movimentação (EAP-10)', async (status, roteiro) => {
      const service = await criar(roteiro());

      const analise = await service.analisar(OrigemAnaliseEstoque.MANUAL);

      expect(analise?.status).toBe(status);
      expect(prisma.material.update).not.toHaveBeenCalled();
      expect(prisma.material.updateMany).not.toHaveBeenCalled();
      expect(prisma.movimentacaoEstoque.create).not.toHaveBeenCalled();
      expect(prisma.movimentacaoEstoque.createMany).not.toHaveBeenCalled();
    });

    it('finaliza a AnaliseEstoque com status, nº de ATIVO, passos e marcadores (EAP-17)', async () => {
      previsao.montarSnapshot.mockResolvedValue(snapshot(calReservada()));
      prisma.alertaEstoque.count.mockResolvedValue(3);
      const service = await criar(
        new Roteiro([
          usar(ferramenta('reservadoPorObras', { materialId: 'cal' })),
          terminar('Fim.'),
        ]),
      );

      const analise = await service.analisar(OrigemAnaliseEstoque.MANUAL);

      expect(prisma.alertaEstoque.count).toHaveBeenCalledWith({
        where: { status: StatusAlertaEstoque.ATIVO },
      });
      expect(finalizacao()).toEqual({
        where: { id: 'an-1' },
        data: {
          status: StatusAnaliseEstoque.SUCESSO,
          finalizadoEm: expect.any(Date),
          totalAlertas: 3,
          chamadasFerramenta: 1,
          modelo: 'claude-haiku-5-5',
          erro: null,
          passos: [
            expect.objectContaining({ tipo: 'ferramenta', ferramenta: 'reservadoPorObras' }),
            { tipo: 'texto', texto: 'Fim.' },
          ],
          marcadores: { '{{OBRA_1}}': 'o-1' },
        },
      });
      expect(analise).toEqual(
        expect.objectContaining({ status: StatusAnaliseEstoque.SUCESSO, totalAlertas: 3 }),
      );
    });
  });

  // -------------------------------------------------------------------------------------------
  describe('T9 — controle de execução (EAP-21..25)', () => {
    const esperar = async (condicao: () => boolean) => {
      for (let i = 0; i < 50 && !condicao(); i++) await new Promise((r) => setImmediate(r));
    };

    it('manual livre: cria a análise com origem MANUAL e devolve a análise finalizada (EAP-21)', async () => {
      const service = await criar(new Roteiro([terminar()]));

      const analise = await service.analisar(OrigemAnaliseEstoque.MANUAL);

      expect(prisma.analiseEstoque.create).toHaveBeenCalledWith({
        data: { origem: OrigemAnaliseEstoque.MANUAL, iniciadoEm: expect.any(Date) },
      });
      expect(analise).toEqual(
        expect.objectContaining({
          id: 'an-1',
          status: StatusAnaliseEstoque.SUCESSO,
          finalizadoEm: expect.any(Date),
        }),
      );
    });

    it('durante outra análise: manual → 409, automática → null sem criar registro (EAP-22, EAP-24)', async () => {
      let liberar!: (m: Anthropic.Message) => void;
      const roteiro = new Roteiro([() => new Promise<Anthropic.Message>((r) => (liberar = r))]);
      const service = await criar(roteiro);

      const primeira = service.analisar(OrigemAnaliseEstoque.MANUAL);
      await esperar(() => roteiro.requisicoes.length === 1);

      await expect(service.analisar(OrigemAnaliseEstoque.MANUAL)).rejects.toThrow(
        new ConflictException('Já existe uma análise de estoque em andamento'),
      );
      await expect(service.analisar(OrigemAnaliseEstoque.AGENDADA)).resolves.toBeNull();
      await expect(service.analisar(OrigemAnaliseEstoque.CATCH_UP)).resolves.toBeNull();
      expect(prisma.analiseEstoque.create).toHaveBeenCalledTimes(1);

      liberar(terminar());
      await expect(primeira).resolves.toEqual(
        expect.objectContaining({ status: StatusAnaliseEstoque.SUCESSO }),
      );
    });

    it('EM_ANDAMENTO recente no banco: manual → 409, automática → null', async () => {
      prisma.analiseEstoque.findFirst.mockImplementation(async ({ where }) =>
        where.status === StatusAnaliseEstoque.EM_ANDAMENTO
          ? { id: 'an-0', iniciadoEm: new Date() }
          : null,
      );
      const service = await criar(new Roteiro([terminar()]));

      await expect(service.analisar(OrigemAnaliseEstoque.MANUAL)).rejects.toBeInstanceOf(
        ConflictException,
      );
      await expect(service.analisar(OrigemAnaliseEstoque.AGENDADA)).resolves.toBeNull();
      expect(prisma.analiseEstoque.create).not.toHaveBeenCalled();
    });

    it('manual menos de 5 min depois da última manual → 429 (EAP-23)', async () => {
      prisma.analiseEstoque.findFirst.mockImplementation(async ({ where }) =>
        where.origem === OrigemAnaliseEstoque.MANUAL
          ? { id: 'an-0', iniciadoEm: new Date(Date.now() - 4 * MIN) }
          : null,
      );
      const service = await criar(new Roteiro([terminar()]));

      const erro = await service.analisar(OrigemAnaliseEstoque.MANUAL).catch((e) => e);

      expect(erro).toBeInstanceOf(HttpException);
      expect(erro.getStatus()).toBe(429);
      expect(erro.message).toBe('Aguarde 5 minutos entre análises manuais');
      expect(prisma.analiseEstoque.findFirst).toHaveBeenCalledWith({
        where: { origem: OrigemAnaliseEstoque.MANUAL },
        orderBy: { iniciadoEm: 'desc' },
      });
      expect(prisma.analiseEstoque.create).not.toHaveBeenCalled();
    });

    it('manual 5 min ou mais depois da última manual roda; automática ignora o limite', async () => {
      prisma.analiseEstoque.findFirst.mockImplementation(async ({ where }) =>
        where.origem === OrigemAnaliseEstoque.MANUAL
          ? { id: 'an-0', iniciadoEm: new Date(Date.now() - 5 * MIN - 1000) }
          : null,
      );
      const service = await criar(new Roteiro([terminar(), terminar()]));

      await expect(service.analisar(OrigemAnaliseEstoque.MANUAL)).resolves.not.toBeNull();
      prisma.analiseEstoque.findFirst.mockImplementation(async ({ where }) =>
        where.origem === OrigemAnaliseEstoque.MANUAL
          ? { id: 'an-1', iniciadoEm: new Date() }
          : null,
      );
      await expect(service.analisar(OrigemAnaliseEstoque.AGENDADA)).resolves.not.toBeNull();
      expect(prisma.analiseEstoque.create).toHaveBeenCalledTimes(2);
    });

    it('EM_ANDAMENTO há mais de 5 min vira FALHA e a nova análise roda (EAP-25)', async () => {
      const service = await criar(new Roteiro([terminar()]));
      const antes = Date.now();

      await service.analisar(OrigemAnaliseEstoque.AGENDADA);

      const [{ where, data }] = prisma.analiseEstoque.updateMany.mock.calls[0];
      expect(where.status).toBe(StatusAnaliseEstoque.EM_ANDAMENTO);
      const limite = where.iniciadoEm.lt.getTime();
      expect(limite).toBeGreaterThanOrEqual(antes - 5 * MIN);
      expect(limite).toBeLessThanOrEqual(Date.now() - 5 * MIN);
      expect(data).toEqual({
        status: StatusAnaliseEstoque.FALHA,
        finalizadoEm: expect.any(Date),
        erro: 'abandonada',
      });
      expect(prisma.analiseEstoque.create).toHaveBeenCalledWith({
        data: { origem: OrigemAnaliseEstoque.AGENDADA, iniciadoEm: expect.any(Date) },
      });
    });

    it('falha na persistência grava FALHA à parte', async () => {
      prisma.$transaction.mockRejectedValue(new Error('banco caiu'));
      const service = await criar(new Roteiro([terminar()]));

      const analise = await service.analisar(OrigemAnaliseEstoque.MANUAL);

      expect(finalizacao()).toEqual({
        where: { id: 'an-1' },
        data: {
          status: StatusAnaliseEstoque.FALHA,
          finalizadoEm: expect.any(Date),
          erro: expect.stringContaining('banco caiu'),
        },
      });
      expect(analise?.status).toBe(StatusAnaliseEstoque.FALHA);
    });

    it('lock é liberado mesmo com exceção', async () => {
      prisma.analiseEstoque.create.mockRejectedValueOnce(new Error('banco caiu'));
      const service = await criar(new Roteiro([terminar()]));

      await expect(service.analisar(OrigemAnaliseEstoque.MANUAL)).rejects.toThrow('banco caiu');
      const segunda = await service.analisar(OrigemAnaliseEstoque.MANUAL);

      expect(segunda?.status).toBe(StatusAnaliseEstoque.SUCESSO);
      expect(prisma.analiseEstoque.create).toHaveBeenCalledTimes(2);
    });
  });
});
