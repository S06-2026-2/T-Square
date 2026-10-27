import {
  AlertaEstoque,
  Prisma,
  ResolvidoPor,
  StatusAlertaEstoque,
  StatusObra,
  TipoAlertaEstoque,
} from '@prisma/client';

import { calcularIndicador } from '../estoque/calculo-estoque';
import { ContextoFerramentas, FerramentasAgente } from './ferramentas-agente';
import { MapaMarcadores } from './marcadores-obra';
import { MaterialSnapshot } from './previsao-estoque.service';

/**
 * Cobre EAP-05, 06, 11, 50, 51, 58, 59 e 65 de
 * .claude/specs/features/estoque-agente-proativo/spec.md
 */
describe('FerramentasAgente', () => {
  const DIA = 24 * 60 * 60 * 1000;
  const agora = new Date('2026-10-27T12:00:00Z');
  const diasAtras = (dias: number) => new Date(agora.getTime() - dias * DIA);
  const dec = (v: number) => new Prisma.Decimal(v);

  const ferramentas = new FerramentasAgente();

  /** Material com janela de 30 dias; consumo = saidas soltas na janela. */
  function material(
    id: string,
    o: {
      saldo: number;
      minimo: number;
      consumo?: number;
      alertas?: Partial<AlertaEstoque>[];
      obras?: {
        obraId: string;
        titulo: string;
        status: StatusObra;
        previsto: number;
        utilizado: number;
      }[];
    },
  ): MaterialSnapshot {
    const linhas = (o.obras ?? []).map((ob) => ({
      obraId: ob.obraId,
      titulo: ob.titulo,
      status: ob.status,
      previsto: dec(ob.previsto),
      utilizado: dec(ob.utilizado),
      pendente: dec(Math.max(0, ob.previsto - ob.utilizado)),
      excedente: dec(Math.max(0, ob.utilizado - ob.previsto)),
    }));
    const obrasQueReservam = linhas
      .filter((l) => l.pendente.gt(0) && ['FECHADA', 'ANDAMENTO'].includes(l.status))
      .map(({ obraId, titulo, pendente }) => ({ obraId, titulo, pendente }));
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
      previstoVsUtilizado: linhas,
      ultimosAlertas: (o.alertas ?? []) as AlertaEstoque[],
    };
  }

  const contexto = (...materiais: MaterialSnapshot[]): ContextoFerramentas => ({
    snapshot: { geradoEm: agora, materiais },
    mapa: new MapaMarcadores(),
    aceitas: [],
  });

  // Independent Test da spec: saldo 15, minimo 10, 55 de saida em 30 dias -> calculado 50.
  const calComFalta = (alertas?: Partial<AlertaEstoque>[]) =>
    material('cal', { saldo: 15, minimo: 10, consumo: 55, alertas });
  // saldo 40, minimo 10, 30 de saida em 30 dias -> calculado 0.
  const calSobrando = (alertas?: Partial<AlertaEstoque>[]) =>
    material('cal', { saldo: 40, minimo: 10, consumo: 30, alertas });

  const sugerir = (ctx: ContextoFerramentas, input: Record<string, unknown>) =>
    ferramentas.executar(
      'sugerirReposicao',
      { materialId: 'cal', justificativa: 'texto', ...input },
      ctx,
    );

  describe('leituras (EAP-11)', () => {
    const obras = [
      {
        obraId: 'o-1',
        titulo: 'Forro Residência Silva',
        status: StatusObra.FECHADA,
        previsto: 20,
        utilizado: 8,
      },
      {
        obraId: 'o-2',
        titulo: 'Sanca Loja Centro',
        status: StatusObra.CONCLUIDA,
        previsto: 10,
        utilizado: 15,
      },
    ];

    it('devolvem só nome, unidade, números e marcadores, sem título nem dados de cliente', () => {
      const ctx = contexto(material('cal', { saldo: 25, minimo: 10, consumo: 30, obras }));

      const saidas = [
        'listarMateriais',
        'consumoDoMaterial',
        'reservadoPorObras',
        'previstoVsUtilizado',
      ].map((nome) => ferramentas.executar(nome, { materialId: 'cal' }, ctx));

      for (const saida of saidas) {
        expect(saida.erro).toBe(false);
        expect(saida.conteudo).not.toMatch(/Forro Residência Silva|Sanca Loja Centro/);
        expect(saida.conteudo).not.toMatch(/clienteNome|clienteTelefone|endereco|titulo/);
      }

      expect(JSON.parse(saidas[2].conteudo)).toEqual({
        materialId: 'cal',
        nome: 'CAL',
        unidade: 'saco',
        reservado: 12,
        obras: [{ obra: '{{OBRA_1}}', pendente: 12 }],
      });
      expect(JSON.parse(saidas[3].conteudo).obras).toEqual([
        {
          obra: '{{OBRA_1}}',
          status: 'FECHADA',
          previsto: 20,
          utilizado: 8,
          pendente: 12,
          excedente: 0,
        },
        {
          obra: '{{OBRA_2}}',
          status: 'CONCLUIDA',
          previsto: 10,
          utilizado: 15,
          pendente: 0,
          excedente: 5,
        },
      ]);
      expect(ctx.mapa.paraJson()).toEqual({ '{{OBRA_1}}': 'o-1', '{{OBRA_2}}': 'o-2' });
    });

    it('listarMateriais devolve os indicadores calculados', () => {
      const ctx = contexto(calComFalta());

      const [cal] = JSON.parse(ferramentas.executar('listarMateriais', {}, ctx).conteudo);

      expect(cal).toEqual(
        expect.objectContaining({
          materialId: 'cal',
          saldoLivre: 15,
          estoqueMinimo: 10,
          ritmoDiario: 1.83,
          calculado: 50,
          obrigatorio: false,
          motivo: 'PREVISAO',
        }),
      );
    });
  });

  describe('sugerirReposicao REPOSICAO (EAP-05, EAP-06)', () => {
    it.each([25, 50, 100])(
      'aceita quantidade %p dentro de 50%%–200%% do calculado (50)',
      (quantidade) => {
        const ctx = contexto(calComFalta());

        const r = sugerir(ctx, { tipo: 'REPOSICAO', quantidade });

        expect(r.erro).toBe(false);
        expect(ctx.aceitas).toHaveLength(1);
        expect(ctx.aceitas[0]).toEqual({
          materialId: 'cal',
          tipo: TipoAlertaEstoque.REPOSICAO,
          quantidade: dec(quantidade),
          justificativa: 'texto',
        });
      },
    );

    it.each([24.99, 100.01])(
      'recusa %p fora da faixa, com a faixa no erro, sem aceitar',
      (quantidade) => {
        const ctx = contexto(calComFalta());

        const r = sugerir(ctx, { tipo: 'REPOSICAO', quantidade });

        expect(r.erro).toBe(true);
        expect(r.conteudo).toContain('entre 25 e 100 saco');
        expect(ctx.aceitas).toEqual([]);
      },
    );

    it('recusa REPOSICAO com calculado <= 0 indicando que só INFORMATIVO é aceito', () => {
      const ctx = contexto(calSobrando());

      const r = sugerir(ctx, { tipo: 'REPOSICAO', quantidade: 20 });

      expect(r.erro).toBe(true);
      expect(r.conteudo).toContain('só INFORMATIVO é aceito');
      expect(ctx.aceitas).toEqual([]);
    });

    it('REPOSICAO sem quantidade é input inválido', () => {
      const ctx = contexto(calComFalta());

      const r = sugerir(ctx, { tipo: 'REPOSICAO' });

      expect(r.erro).toBe(true);
      expect(ctx.aceitas).toEqual([]);
    });
  });

  describe('sugerirReposicao INFORMATIVO (EAP-58, EAP-59)', () => {
    it('aceita INFORMATIVO com calculado <= 0, sem quantidade', () => {
      const ctx = contexto(calSobrando());

      const r = sugerir(ctx, { tipo: 'INFORMATIVO', quantidade: 5, justificativa: 'observação' });

      expect(r.erro).toBe(false);
      expect(ctx.aceitas).toEqual([
        {
          materialId: 'cal',
          tipo: TipoAlertaEstoque.INFORMATIVO,
          quantidade: null,
          justificativa: 'observação',
        },
      ]);
    });

    it('recusa INFORMATIVO com calculado > 0 indicando REPOSICAO', () => {
      const ctx = contexto(calComFalta());

      const r = sugerir(ctx, { tipo: 'INFORMATIVO' });

      expect(r.erro).toBe(true);
      expect(r.conteudo).toContain('exige REPOSICAO');
      expect(ctx.aceitas).toEqual([]);
    });
  });

  describe('silêncio (EAP-50, EAP-51, EAP-65)', () => {
    const alerta = (a: Partial<AlertaEstoque>): Partial<AlertaEstoque> => ({
      materialId: 'cal',
      resolvidoPor: null,
      dispensadoEm: null,
      resolvidoEm: null,
      atualizadoEm: diasAtras(1),
      ...a,
    });

    it('REPOSICAO dispensado há menos de 5 dias recusa REPOSICAO e INFORMATIVO', () => {
      const dispensado = alerta({
        tipo: TipoAlertaEstoque.REPOSICAO,
        status: StatusAlertaEstoque.DISPENSADO,
        dispensadoEm: diasAtras(4.9),
      });
      const ctxFalta = contexto(calComFalta([dispensado]));
      const ctxSobra = contexto(calSobrando([dispensado]));

      expect(sugerir(ctxFalta, { tipo: 'REPOSICAO', quantidade: 50 }).erro).toBe(true);
      expect(sugerir(ctxSobra, { tipo: 'INFORMATIVO' }).erro).toBe(true);
      expect(ctxFalta.aceitas).toEqual([]);
      expect(ctxSobra.aceitas).toEqual([]);
    });

    it('REPOSICAO dispensado há 5 dias ou mais volta a aceitar', () => {
      const ctx = contexto(
        calComFalta([
          alerta({
            tipo: TipoAlertaEstoque.REPOSICAO,
            status: StatusAlertaEstoque.DISPENSADO,
            dispensadoEm: diasAtras(5),
          }),
        ]),
      );

      expect(sugerir(ctx, { tipo: 'REPOSICAO', quantidade: 50 }).erro).toBe(false);
    });

    it('resolvido pelo operador há menos de 3 dias recusa; com 3 dias aceita', () => {
      const resolvido = (dias: number) =>
        alerta({
          tipo: TipoAlertaEstoque.REPOSICAO,
          status: StatusAlertaEstoque.RESOLVIDO,
          resolvidoPor: ResolvidoPor.OPERADOR,
          resolvidoEm: diasAtras(dias),
        });
      const recente = contexto(calComFalta([resolvido(2.9)]));
      const antigo = contexto(calComFalta([resolvido(3)]));

      expect(sugerir(recente, { tipo: 'REPOSICAO', quantidade: 50 }).erro).toBe(true);
      expect(recente.aceitas).toEqual([]);
      expect(sugerir(antigo, { tipo: 'REPOSICAO', quantidade: 50 }).erro).toBe(false);
    });

    it('INFORMATIVO resolvido pelo operador há menos de 3 dias recusa só INFORMATIVO; REPOSICAO continua aceito', () => {
      const resolvido = alerta({
        tipo: TipoAlertaEstoque.INFORMATIVO,
        status: StatusAlertaEstoque.RESOLVIDO,
        resolvidoPor: ResolvidoPor.OPERADOR,
        resolvidoEm: diasAtras(1),
      });
      const ctxSobra = contexto(calSobrando([resolvido]));
      const ctxFalta = contexto(calComFalta([resolvido]));

      const informativo = sugerir(ctxSobra, { tipo: 'INFORMATIVO' });
      const reposicao = sugerir(ctxFalta, { tipo: 'REPOSICAO', quantidade: 50 });

      expect(informativo.erro).toBe(true);
      expect(ctxSobra.aceitas).toEqual([]);
      expect(reposicao.erro).toBe(false);
      expect(ctxFalta.aceitas).toHaveLength(1);
    });

    it('resolvido pelo agente não silencia', () => {
      const ctx = contexto(
        calComFalta([
          alerta({
            tipo: TipoAlertaEstoque.REPOSICAO,
            status: StatusAlertaEstoque.RESOLVIDO,
            resolvidoPor: ResolvidoPor.AGENTE,
            resolvidoEm: diasAtras(1),
          }),
        ]),
      );

      expect(sugerir(ctx, { tipo: 'REPOSICAO', quantidade: 50 }).erro).toBe(false);
    });

    it('INFORMATIVO dispensado há menos de 5 dias recusa só INFORMATIVO', () => {
      const dispensado = alerta({
        tipo: TipoAlertaEstoque.INFORMATIVO,
        status: StatusAlertaEstoque.DISPENSADO,
        dispensadoEm: diasAtras(2),
      });
      const ctxSobra = contexto(calSobrando([dispensado]));
      const ctxFalta = contexto(calComFalta([dispensado]));

      const informativo = sugerir(ctxSobra, { tipo: 'INFORMATIVO' });
      const reposicao = sugerir(ctxFalta, { tipo: 'REPOSICAO', quantidade: 50 });

      expect(informativo.erro).toBe(true);
      expect(ctxSobra.aceitas).toEqual([]);
      expect(reposicao.erro).toBe(false);
      expect(ctxFalta.aceitas).toHaveLength(1);
    });
  });

  it('segunda sugestão do mesmo material substitui a primeira (edge case)', () => {
    const ctx = contexto(calComFalta(), material('gesso', { saldo: 0, minimo: 5 }));
    ferramentas.executar(
      'sugerirReposicao',
      { materialId: 'gesso', tipo: 'REPOSICAO', quantidade: 5, justificativa: 'g' },
      ctx,
    );

    sugerir(ctx, { tipo: 'REPOSICAO', quantidade: 40, justificativa: 'primeira' });
    sugerir(ctx, { tipo: 'REPOSICAO', quantidade: 60, justificativa: 'segunda' });

    expect(ctx.aceitas.filter((s) => s.materialId === 'cal')).toEqual([
      {
        materialId: 'cal',
        tipo: TipoAlertaEstoque.REPOSICAO,
        quantidade: dec(60),
        justificativa: 'segunda',
      },
    ]);
    expect(ctx.aceitas.map((s) => s.materialId).sort()).toEqual(['cal', 'gesso']);
  });

  describe('erros de ferramenta (edge case)', () => {
    it('material inexistente', () => {
      const r = ferramentas.executar(
        'consumoDoMaterial',
        { materialId: 'nao-existe' },
        contexto(calComFalta()),
      );

      expect(r).toEqual({ conteudo: 'Material nao-existe não encontrado', erro: true });
    });

    it('ferramenta inexistente', () => {
      const r = ferramentas.executar(
        'comprarMaterial',
        { materialId: 'cal' },
        contexto(calComFalta()),
      );

      expect(r.erro).toBe(true);
      expect(r.conteudo).toContain('comprarMaterial');
    });

    it.each([
      [{ tipo: 'REPOSICAO', quantidade: 50, justificativa: 'x' }],
      [{ materialId: 'cal', tipo: 'COMPRA', quantidade: 50, justificativa: 'x' }],
      [{ materialId: 'cal', tipo: 'REPOSICAO', quantidade: '50', justificativa: 'x' }],
      [{ materialId: 'cal', tipo: 'REPOSICAO', quantidade: 50, justificativa: '' }],
    ])('input inválido %p', (input) => {
      const ctx = contexto(calComFalta());

      const r = ferramentas.executar('sugerirReposicao', input, ctx);

      expect(r.erro).toBe(true);
      expect(r.conteudo).toMatch(/^Entrada inválida/);
      expect(ctx.aceitas).toEqual([]);
    });
  });
});
