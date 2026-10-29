import {
  AlertaEstoque,
  Prisma,
  ResolvidoPor,
  StatusAlertaEstoque,
  StatusObra,
  TipoAlertaEstoque,
} from '@prisma/client';

import { calcularIndicador } from '../estoque/calculo-estoque';
import { ContextoFerramentas, consultasExigidas, FerramentasAgente } from './ferramentas-agente';
import { MapaMarcadores } from './marcadores-obra';
import { MaterialSnapshot } from './previsao-estoque.service';

/**
 * Cobre EAP-05, 06, 11, 50, 51, 58, 59, 65 e 67 de
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
      semPrevisao?: {
        obraId: string;
        titulo: string;
        status: StatusObra;
        utilizado: number;
        saidas: number;
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
      usoSemPrevisao: (o.semPrevisao ?? []).map((u) => ({
        obraId: u.obraId,
        titulo: u.titulo,
        status: u.status,
        utilizado: dec(u.utilizado),
        saidasNaJanela: dec(u.saidas),
      })),
      ultimosAlertas: (o.alertas ?? []) as AlertaEstoque[],
    };
  }

  const contexto = (...materiais: MaterialSnapshot[]): ContextoFerramentas => ({
    snapshot: { geradoEm: agora, materiais },
    mapa: new MapaMarcadores(),
    aceitas: [],
    consultas: new Map(),
  });

  // Independent Test da spec: saldo 15, minimo 10, 55 de saida em 30 dias -> calculado 50.
  const calComFalta = (alertas?: Partial<AlertaEstoque>[]) =>
    material('cal', { saldo: 15, minimo: 10, consumo: 55, alertas });
  // saldo 40, minimo 10, 30 de saida em 30 dias -> calculado 0.
  const calSobrando = (alertas?: Partial<AlertaEstoque>[]) =>
    material('cal', { saldo: 40, minimo: 10, consumo: 30, alertas });

  /** Faz as leituras que a trava exige para o material (EAP-67). */
  const consultar = (ctx: ContextoFerramentas, materialId: string) => {
    const alvo = ctx.snapshot.materiais.find((m) => m.id === materialId)!;
    for (const nome of consultasExigidas(alvo)) {
      ferramentas.executar(nome, { materialId }, ctx);
    }
  };

  /** Sugere para "cal" depois das leituras exigidas; a trava tem testes próprios. */
  const sugerir = (ctx: ContextoFerramentas, input: Record<string, unknown>) => {
    consultar(ctx, 'cal');
    return ferramentas.executar(
      'sugerirReposicao',
      { materialId: 'cal', justificativa: 'texto', ...input },
      ctx,
    );
  };

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

    it('listarMateriais dá só a visão geral e o risco, sem a quantidade calculada', () => {
      const ctx = contexto(
        calComFalta(),
        material('gesso', { saldo: 40, minimo: 10, obras: [obras[1]] }),
        material('placa', { saldo: 30, minimo: 20, obras: [obras[0]] }),
      );

      const lista = JSON.parse(ferramentas.executar('listarMateriais', {}, ctx).conteudo);

      expect(lista).toEqual([
        {
          materialId: 'cal',
          nome: 'CAL',
          unidade: 'saco',
          saldoAtual: 15,
          estoqueMinimo: 10,
          risco: 'PREVISAO',
          obrigatorio: false,
          temReserva: false,
          temPrevisao: false,
          temUsoSemPrevisao: false,
        },
        // Previsão só de obra CONCLUIDA não conta como temPrevisao.
        expect.objectContaining({ materialId: 'gesso', risco: 'SEM_RISCO', temPrevisao: false }),
        // Saldo 30 com 12 reservados: saldo livre 18 < mínimo 20.
        expect.objectContaining({
          materialId: 'placa',
          risco: 'ABAIXO_DO_MINIMO',
          obrigatorio: true,
          temReserva: true,
          temPrevisao: true,
          temUsoSemPrevisao: false,
        }),
      ]);
      expect(JSON.stringify(lista)).not.toMatch(/calculado|saldoLivre|ritmoDiario|"reservado"/);
    });

    it('consumoDoMaterial traz saldo livre, calculado e a faixa aceita', () => {
      const ctx = contexto(
        calComFalta(),
        material('sobra', { saldo: 40, minimo: 10, consumo: 30 }),
      );
      const ler = (materialId: string) =>
        JSON.parse(ferramentas.executar('consumoDoMaterial', { materialId }, ctx).conteudo);

      expect(ler('cal')).toEqual({
        materialId: 'cal',
        nome: 'CAL',
        unidade: 'saco',
        diasJanela: 30,
        consumoSolto: 55,
        consumoEmObrasSemPrevisao: 0,
        ritmoDiario: 1.83,
        diasAteMinimo: 2.73,
        saldoLivre: 15,
        calculado: 50,
        minimoAceito: 25,
        maximoAceito: 100,
      });
      // calculado <= 0: sem faixa, só INFORMATIVO.
      expect(ler('sobra')).toEqual(
        expect.objectContaining({ calculado: 0, minimoAceito: null, maximoAceito: null }),
      );
    });
  });

  describe('trava de investigação (EAP-67)', () => {
    const obraAtiva = {
      obraId: 'o-1',
      titulo: 'Forro Residência Silva',
      status: StatusObra.ANDAMENTO,
      previsto: 20,
      utilizado: 8,
    };
    const obraExcedida = { ...obraAtiva, previsto: 10, utilizado: 15 };
    const sugerirDireto = (ctx: ContextoFerramentas, input: Record<string, unknown>) =>
      ferramentas.executar(
        'sugerirReposicao',
        { materialId: 'cal', justificativa: 'texto', ...input },
        ctx,
      );

    it('sem consumoDoMaterial recusa, sem aceitar, dizendo o que falta', () => {
      const ctx = contexto(calComFalta());

      const r = sugerirDireto(ctx, { tipo: 'REPOSICAO', quantidade: 50 });

      expect(r).toEqual({
        conteudo:
          'Sugestão recusada: antes de sugerir para este material, consulte consumoDoMaterial.',
        erro: true,
      });
      expect(ctx.aceitas).toEqual([]);
    });

    it('material sem reserva nem previsão: só consumoDoMaterial basta', () => {
      const ctx = contexto(calComFalta());
      ferramentas.executar('consumoDoMaterial', { materialId: 'cal' }, ctx);

      expect(sugerirDireto(ctx, { tipo: 'REPOSICAO', quantidade: 50 }).erro).toBe(false);
      expect(ctx.aceitas).toHaveLength(1);
    });

    it('material com reserva e previsão exige reservadoPorObras e previstoVsUtilizado', () => {
      const ctx = contexto(
        material('cal', { saldo: 15, minimo: 10, consumo: 55, obras: [obraAtiva] }),
      );
      ferramentas.executar('consumoDoMaterial', { materialId: 'cal' }, ctx);

      const r1 = sugerirDireto(ctx, { tipo: 'REPOSICAO', quantidade: 62 });
      ferramentas.executar('reservadoPorObras', { materialId: 'cal' }, ctx);
      const r2 = sugerirDireto(ctx, { tipo: 'REPOSICAO', quantidade: 62 });
      ferramentas.executar('previstoVsUtilizado', { materialId: 'cal' }, ctx);
      const r3 = sugerirDireto(ctx, { tipo: 'REPOSICAO', quantidade: 62 });

      expect(r1.conteudo).toContain('consulte reservadoPorObras, previstoVsUtilizado.');
      expect(r2.conteudo).toContain('consulte previstoVsUtilizado.');
      expect(r3.erro).toBe(false);
      expect(ctx.aceitas).toHaveLength(1);
    });

    it('SEM_RISCO com obra ativa além do previsto: INFORMATIVO só depois de previstoVsUtilizado', () => {
      // Excedente não reserva (pendente 0) e não entra no consumo solto: calculado <= 0.
      const ctx = contexto(material('cal', { saldo: 40, minimo: 10, obras: [obraExcedida] }));
      ferramentas.executar('consumoDoMaterial', { materialId: 'cal' }, ctx);

      const antes = sugerirDireto(ctx, { tipo: 'INFORMATIVO' });
      ferramentas.executar('previstoVsUtilizado', { materialId: 'cal' }, ctx);
      const depois = sugerirDireto(ctx, { tipo: 'INFORMATIVO' });

      expect(antes.conteudo).toContain('consulte previstoVsUtilizado.');
      expect(depois.erro).toBe(false);
      expect(ctx.aceitas).toEqual([
        expect.objectContaining({ materialId: 'cal', tipo: TipoAlertaEstoque.INFORMATIVO }),
      ]);
    });

    it('a leitura de outro material não libera este', () => {
      const ctx = contexto(calComFalta(), material('gesso', { saldo: 0, minimo: 5 }));
      ferramentas.executar('consumoDoMaterial', { materialId: 'gesso' }, ctx);

      expect(sugerirDireto(ctx, { tipo: 'REPOSICAO', quantidade: 50 }).erro).toBe(true);
    });

    it('material silenciado recusa pelo silêncio, sem pedir leituras', () => {
      const ctx = contexto(
        calComFalta([
          {
            tipo: TipoAlertaEstoque.REPOSICAO,
            status: StatusAlertaEstoque.DISPENSADO,
            dispensadoEm: diasAtras(1),
            atualizadoEm: diasAtras(1),
          },
        ]),
      );

      const r = sugerirDireto(ctx, { tipo: 'REPOSICAO', quantidade: 50 });

      expect(r.conteudo).toContain('dispensado');
      expect(r.conteudo).not.toContain('consulte');
    });
  });

  describe('uso sem previsão (EAP-71, EAP-72)', () => {
    // Fita: 40 de consumo solto, dos quais 11 foram para uma obra que não prevê fita.
    const fita = () =>
      material('cal', {
        saldo: 0,
        minimo: 5,
        consumo: 40,
        semPrevisao: [
          {
            obraId: 'o-7',
            titulo: 'Drywall - Loja Avenida',
            status: StatusObra.ANDAMENTO,
            utilizado: 11,
            saidas: 11,
          },
        ],
      });

    it('listarMateriais avisa, consumoDoMaterial separa a parte das obras e previstoVsUtilizado detalha por marcador', () => {
      const ctx = contexto(fita());

      const [lista] = JSON.parse(ferramentas.executar('listarMateriais', {}, ctx).conteudo);
      const consumo = JSON.parse(
        ferramentas.executar('consumoDoMaterial', { materialId: 'cal' }, ctx).conteudo,
      );
      const previsto = ferramentas.executar('previstoVsUtilizado', { materialId: 'cal' }, ctx);

      expect(lista).toEqual(
        expect.objectContaining({ temPrevisao: false, temUsoSemPrevisao: true }),
      );
      expect(consumo).toEqual(
        expect.objectContaining({ consumoSolto: 40, consumoEmObrasSemPrevisao: 11 }),
      );
      expect(JSON.parse(previsto.conteudo)).toEqual({
        materialId: 'cal',
        nome: 'CAL',
        unidade: 'saco',
        obras: [],
        usoSemPrevisao: [
          { obra: '{{OBRA_1}}', status: 'ANDAMENTO', utilizado: 11, saidasNaJanela: 11 },
        ],
      });
      expect(previsto.conteudo).not.toContain('Loja Avenida');
      expect(ctx.mapa.paraJson()).toEqual({ '{{OBRA_1}}': 'o-7' });
    });

    it('sem uso sem previsão, consumoEmObrasSemPrevisao é 0 e temUsoSemPrevisao é false', () => {
      const ctx = contexto(calComFalta());

      const [lista] = JSON.parse(ferramentas.executar('listarMateriais', {}, ctx).conteudo);
      const consumo = JSON.parse(
        ferramentas.executar('consumoDoMaterial', { materialId: 'cal' }, ctx).conteudo,
      );

      expect(lista.temUsoSemPrevisao).toBe(false);
      expect(consumo.consumoEmObrasSemPrevisao).toBe(0);
    });

    it('trava: com uso sem previsão, sugerir exige previstoVsUtilizado', () => {
      const ctx = contexto(fita());
      ferramentas.executar('consumoDoMaterial', { materialId: 'cal' }, ctx);
      const entrada = {
        materialId: 'cal',
        justificativa: 'texto',
        tipo: 'REPOSICAO',
        quantidade: 45,
      };

      const r1 = ferramentas.executar('sugerirReposicao', entrada, ctx);
      ferramentas.executar('previstoVsUtilizado', { materialId: 'cal' }, ctx);
      const r2 = ferramentas.executar('sugerirReposicao', entrada, ctx);

      expect(r1).toEqual({
        conteudo:
          'Sugestão recusada: antes de sugerir para este material, consulte previstoVsUtilizado.',
        erro: true,
      });
      expect(r2.erro).toBe(false);
      expect(ctx.aceitas).toHaveLength(1);
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
    consultar(ctx, 'gesso');
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
