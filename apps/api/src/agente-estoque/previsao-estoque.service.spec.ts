import { Test, TestingModule } from '@nestjs/testing';
import { Prisma, StatusObra, TipoMovimentacao } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { PrevisaoEstoqueService } from './previsao-estoque.service';

/**
 * Cobre EAP-01, EAP-02, EAP-45 e EAP-64 de
 * .claude/specs/features/estoque-agente-proativo/spec.md
 * O Prisma e substituido por um mock, entao a suite roda sem banco.
 */
describe('PrevisaoEstoqueService', () => {
  let service: PrevisaoEstoqueService;
  let prisma: {
    material: { findMany: jest.Mock; create: jest.Mock; update: jest.Mock; updateMany: jest.Mock };
    materialPrevistoObra: { findMany: jest.Mock; create: jest.Mock; createMany: jest.Mock };
    movimentacaoEstoque: { findMany: jest.Mock; create: jest.Mock; createMany: jest.Mock };
    alertaEstoque: {
      findMany: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      updateMany: jest.Mock;
    };
    analiseEstoque: { create: jest.Mock; update: jest.Mock };
    $transaction: jest.Mock;
  };

  const DIA = 24 * 60 * 60 * 1000;
  const agora = new Date('2026-10-27T12:00:00Z');
  const diasAtras = (dias: number) => new Date(agora.getTime() - dias * DIA);
  const dec = (valor: number | string) => new Prisma.Decimal(valor);

  const material = (id: string, saldo: number, minimo: number, criadoHaDias = 60) => ({
    id,
    nome: id.toUpperCase(),
    unidade: 'saco',
    saldoAtual: dec(saldo),
    estoqueMinimo: dec(minimo),
    criadoEm: diasAtras(criadoHaDias),
  });

  const obra = (id: string, status: StatusObra) => ({ id, titulo: `Obra ${id}`, status });

  const previsto = (o: ReturnType<typeof obra>, materialId: string, quantidade: number) => ({
    id: `${o.id}-${materialId}`,
    obraId: o.id,
    materialId,
    quantidade: dec(quantidade),
    obra: o,
  });

  const mov = (
    materialId: string,
    tipo: TipoMovimentacao,
    quantidade: number,
    haDias: number,
    o: ReturnType<typeof obra> | null = null,
  ) => ({
    materialId,
    obraId: o?.id ?? null,
    tipo,
    quantidade: dec(quantidade),
    criadoEm: diasAtras(haDias),
    obra: o ? { titulo: o.titulo, status: o.status } : null,
  });

  const saida = (materialId: string, q: number, haDias: number, o?: ReturnType<typeof obra>) =>
    mov(materialId, TipoMovimentacao.SAIDA, q, haDias, o ?? null);
  const entrada = (materialId: string, q: number, haDias: number, o?: ReturnType<typeof obra>) =>
    mov(materialId, TipoMovimentacao.ENTRADA, q, haDias, o ?? null);

  function dados(d: {
    materiais?: unknown[];
    previstos?: unknown[];
    movimentacoes?: unknown[];
    alertas?: unknown[];
  }) {
    prisma.material.findMany.mockResolvedValue(d.materiais ?? []);
    prisma.materialPrevistoObra.findMany.mockResolvedValue(d.previstos ?? []);
    prisma.movimentacaoEstoque.findMany.mockResolvedValue(d.movimentacoes ?? []);
    prisma.alertaEstoque.findMany.mockResolvedValue(d.alertas ?? []);
  }

  async function snapshotDe(materialId: string) {
    const snapshot = await service.montarSnapshot(agora);
    const item = snapshot.materiais.find((m) => m.id === materialId);
    if (!item) throw new Error(`material ${materialId} fora do snapshot`);
    return item;
  }

  beforeEach(async () => {
    prisma = {
      material: {
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
      materialPrevistoObra: { findMany: jest.fn(), create: jest.fn(), createMany: jest.fn() },
      movimentacaoEstoque: { findMany: jest.fn(), create: jest.fn(), createMany: jest.fn() },
      alertaEstoque: {
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
      analiseEstoque: { create: jest.fn(), update: jest.fn() },
      $transaction: jest.fn(),
    };

    const modulo: TestingModule = await Test.createTestingModule({
      providers: [PrevisaoEstoqueService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = modulo.get<PrevisaoEstoqueService>(PrevisaoEstoqueService);
  });

  describe('consumo solto (EAP-02)', () => {
    it('SAIDA sem obra dentro da janela conta no ritmo', async () => {
      dados({ materiais: [material('cal', 40, 10)], movimentacoes: [saida('cal', 30, 5)] });

      const cal = await snapshotDe('cal');

      expect(cal.consumoSolto.toString()).toBe('30');
      expect(cal.indicador.ritmoDiario.toString()).toBe('1');
    });

    it('SAIDA de obra sem previsao daquele material conta, inclusive obra CONCLUIDA', async () => {
      const soCal = obra('o1', StatusObra.CONCLUIDA); // preve so Cal
      const semPrevisao = obra('o2', StatusObra.CONCLUIDA);
      dados({
        materiais: [material('cal', 100, 10), material('gesso', 100, 10)],
        previstos: [previsto(soCal, 'cal', 5)],
        movimentacoes: [saida('gesso', 12, 3, soCal), saida('gesso', 3, 2, semPrevisao)],
      });

      const gesso = await snapshotDe('gesso');

      expect(gesso.consumoSolto.toString()).toBe('15');
    });

    it('SAIDA de obra com previsao para o material nao conta (nem o previsto, nem o excedente)', async () => {
      // Independent Test (P3): 10 previstos e 15 de SAIDA para a obra.
      const o1 = obra('o1', StatusObra.ANDAMENTO);
      dados({
        materiais: [material('cal', 100, 10)],
        previstos: [previsto(o1, 'cal', 10)],
        movimentacoes: [saida('cal', 15, 4, o1)],
      });

      const cal = await snapshotDe('cal');

      expect(cal.consumoSolto.toString()).toBe('0');
      expect(cal.indicador.ritmoDiario.toString()).toBe('0');
      expect(cal.previstoVsUtilizado).toEqual([
        expect.objectContaining({ obraId: 'o1', titulo: 'Obra o1' }),
      ]);
      const linha = cal.previstoVsUtilizado[0];
      expect(linha.previsto.toString()).toBe('10');
      expect(linha.utilizado.toString()).toBe('15');
      expect(linha.pendente.toString()).toBe('0');
      expect(linha.excedente.toString()).toBe('5');
    });

    it('SAIDA de obra CANCELADA nao conta', async () => {
      const cancelada = obra('o3', StatusObra.CANCELADA);
      dados({
        materiais: [material('cal', 100, 10)],
        movimentacoes: [saida('cal', 9, 2, cancelada), saida('cal', 6, 2)],
      });

      const cal = await snapshotDe('cal');

      expect(cal.consumoSolto.toString()).toBe('6');
    });

    it('SAIDA fora da janela nao conta', async () => {
      dados({
        materiais: [material('cal', 100, 10)],
        movimentacoes: [saida('cal', 50, 31), saida('cal', 3, 29)],
      });

      const cal = await snapshotDe('cal');

      expect(cal.diasJanela).toBe(30);
      expect(cal.consumoSolto.toString()).toBe('3');
    });

    it('SAIDA para obra sem previsao continua no consumo solto e aparece em usoSemPrevisao (EAP-71)', async () => {
      const loja = obra('o7', StatusObra.ANDAMENTO);
      dados({
        materiais: [material('fita', 0, 5)],
        movimentacoes: [
          saida('fita', 15, 6),
          saida('fita', 7, 1, loja),
          saida('fita', 4, 1, loja),
          // devolucao antiga: abate o utilizado, nao o que saiu na janela
          entrada('fita', 1, 40, loja),
        ],
      });

      const fita = await snapshotDe('fita');

      expect(fita.consumoSolto.toString()).toBe('26');
      expect(
        fita.usoSemPrevisao.map((u) => ({
          ...u,
          utilizado: u.utilizado.toString(),
          saidasNaJanela: u.saidasNaJanela.toString(),
        })),
      ).toEqual([
        {
          obraId: 'o7',
          titulo: 'Obra o7',
          status: StatusObra.ANDAMENTO,
          utilizado: '10',
          saidasNaJanela: '11',
        },
      ]);
    });

    it('usoSemPrevisao ignora obra com previsao, obra CANCELADA e SAIDA fora da janela (EAP-71)', async () => {
      const comPrevisao = obra('o1', StatusObra.ANDAMENTO);
      const cancelada = obra('o2', StatusObra.CANCELADA);
      const antiga = obra('o3', StatusObra.CONCLUIDA);
      dados({
        materiais: [material('fita', 100, 5)],
        previstos: [previsto(comPrevisao, 'fita', 10)],
        movimentacoes: [
          saida('fita', 3, 2, comPrevisao),
          saida('fita', 4, 2, cancelada),
          saida('fita', 5, 31, antiga),
        ],
      });

      const fita = await snapshotDe('fita');

      expect(fita.usoSemPrevisao).toEqual([]);
      expect(fita.consumoSolto.toString()).toBe('0');
    });

    it('material criado ha menos de 7 dias usa janela 7 no ritmo', async () => {
      dados({
        materiais: [material('cal', 100, 10, 3)],
        movimentacoes: [saida('cal', 14, 2)],
      });

      const cal = await snapshotDe('cal');

      expect(cal.diasJanela).toBe(7);
      expect(cal.indicador.ritmoDiario.toString()).toBe('2');
    });
  });

  describe('reservado por obras (EAP-45)', () => {
    it('so obras FECHADA e ANDAMENTO reservam; ORCAMENTO, CONCLUIDA e CANCELADA nao', async () => {
      // Independent Test (P2): Cal saldo 25, minimo 10, obra FECHADA com 20 previstos.
      const fechada = obra('f', StatusObra.FECHADA);
      const andamento = obra('a', StatusObra.ANDAMENTO);
      const orcamento = obra('o', StatusObra.ORCAMENTO);
      const concluida = obra('c', StatusObra.CONCLUIDA);
      const cancelada = obra('x', StatusObra.CANCELADA);
      dados({
        materiais: [material('cal', 25, 10)],
        previstos: [
          previsto(fechada, 'cal', 20),
          previsto(andamento, 'cal', 0.5),
          previsto(orcamento, 'cal', 7),
          previsto(concluida, 'cal', 9),
          previsto(cancelada, 'cal', 11),
        ],
      });

      const cal = await snapshotDe('cal');

      expect(cal.indicador.reservado.toString()).toBe('20.5');
      expect(cal.indicador.saldoLivre.toString()).toBe('4.5');
      expect(cal.indicador.obrigatorio).toBe(true);
      expect(cal.obrasQueReservam.map((o) => o.obraId).sort()).toEqual(['a', 'f']);
      expect(cal.obrasQueReservam.find((o) => o.obraId === 'f')?.titulo).toBe('Obra f');
      expect(cal.obrasQueReservam.find((o) => o.obraId === 'f')?.pendente.toString()).toBe('20');
    });

    it('obra ORCAMENTO com previsao nao reserva: saldo livre = saldo atual', async () => {
      const orcamento = obra('o', StatusObra.ORCAMENTO);
      dados({ materiais: [material('cal', 25, 10)], previstos: [previsto(orcamento, 'cal', 20)] });

      const cal = await snapshotDe('cal');

      expect(cal.indicador.reservado.toString()).toBe('0');
      expect(cal.indicador.saldoLivre.toString()).toBe('25');
      expect(cal.obrasQueReservam).toEqual([]);
    });

    it('pendente cai com as SAIDAs da obra (de todo o historico) e o saldo livre se mantem', async () => {
      // Independent Test (P2): 20 previstos, 8 de SAIDA para a obra, saldo 17 => pendente 12.
      const fechada = obra('f', StatusObra.FECHADA);
      dados({
        materiais: [material('cal', 17, 10)],
        previstos: [previsto(fechada, 'cal', 20)],
        movimentacoes: [saida('cal', 5, 2, fechada), saida('cal', 3, 45, fechada)],
      });

      const cal = await snapshotDe('cal');

      expect(cal.indicador.reservado.toString()).toBe('12');
      expect(cal.indicador.saldoLivre.toString()).toBe('5');
    });
  });

  describe('devolucao (EAP-64)', () => {
    it('ENTRADA com obraId abate o utilizado e o pendente sobe', async () => {
      // Independent Test (P2): SAIDA 8, ENTRADA 3 => utilizado 5, pendente 15, saldo 20 - 15 = 5.
      const fechada = obra('f', StatusObra.FECHADA);
      dados({
        materiais: [material('cal', 20, 10)],
        previstos: [previsto(fechada, 'cal', 20)],
        movimentacoes: [saida('cal', 8, 3, fechada), entrada('cal', 3, 1, fechada)],
      });

      const cal = await snapshotDe('cal');

      const linha = cal.previstoVsUtilizado[0];
      expect(linha.utilizado.toString()).toBe('5');
      expect(linha.pendente.toString()).toBe('15');
      expect(cal.indicador.reservado.toString()).toBe('15');
      expect(cal.indicador.saldoLivre.toString()).toBe('5');
    });

    it('devolucoes acima das saidas: utilizado 0 e pendente nao passa do previsto', async () => {
      const fechada = obra('f', StatusObra.FECHADA);
      dados({
        materiais: [material('cal', 50, 10)],
        previstos: [previsto(fechada, 'cal', 20)],
        movimentacoes: [saida('cal', 2, 3, fechada), entrada('cal', 6, 1, fechada)],
      });

      const cal = await snapshotDe('cal');

      expect(cal.previstoVsUtilizado[0].utilizado.toString()).toBe('0');
      expect(cal.indicador.reservado.toString()).toBe('20');
    });
  });

  it('obra concluida deixa de reservar sem nenhuma gravacao extra (derivado do status)', async () => {
    const concluida = obra('f', StatusObra.CONCLUIDA);
    dados({
      materiais: [material('cal', 25, 10)],
      previstos: [previsto(concluida, 'cal', 20)],
    });

    const cal = await snapshotDe('cal');

    expect(cal.indicador.reservado.toString()).toBe('0');
  });

  it('anexa ao material os ultimos alertas dele', async () => {
    const alertaCal = { id: 'al-1', materialId: 'cal', status: 'DISPENSADO' };
    const alertaGesso = { id: 'al-2', materialId: 'gesso', status: 'RESOLVIDO' };
    dados({
      materiais: [material('cal', 100, 10), material('gesso', 100, 10)],
      alertas: [alertaCal, alertaGesso],
    });

    const snapshot = await service.montarSnapshot(agora);

    expect(snapshot.materiais.find((m) => m.id === 'cal')?.ultimosAlertas).toEqual([alertaCal]);
    expect(snapshot.materiais.find((m) => m.id === 'gesso')?.ultimosAlertas).toEqual([alertaGesso]);
  });

  it('banco sem materiais gera snapshot vazio', async () => {
    dados({});

    const snapshot = await service.montarSnapshot(agora);

    expect(snapshot.materiais).toEqual([]);
  });

  it('nunca escreve no banco', async () => {
    const fechada = obra('f', StatusObra.FECHADA);
    dados({
      materiais: [material('cal', 5, 10)],
      previstos: [previsto(fechada, 'cal', 20)],
      movimentacoes: [saida('cal', 8, 3, fechada), saida('cal', 4, 2)],
    });

    await service.montarSnapshot(agora);

    const escritas = [
      prisma.material.create,
      prisma.material.update,
      prisma.material.updateMany,
      prisma.materialPrevistoObra.create,
      prisma.materialPrevistoObra.createMany,
      prisma.movimentacaoEstoque.create,
      prisma.movimentacaoEstoque.createMany,
      prisma.alertaEstoque.create,
      prisma.alertaEstoque.update,
      prisma.alertaEstoque.updateMany,
      prisma.analiseEstoque.create,
      prisma.analiseEstoque.update,
      prisma.$transaction,
    ];
    escritas.forEach((escrita) => expect(escrita).not.toHaveBeenCalled());
  });
});
