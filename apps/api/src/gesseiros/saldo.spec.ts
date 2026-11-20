import { Prisma, TipoLancamento } from '@prisma/client';

import { ClientePrisma } from '../idempotencia/tipos';
import { saldosPorGesseiro, totaisDe } from './saldo';

/** Base de ARQ-03 e ARQ-09 (arquivar-e-limpar-registros): saldo derivado dos lançamentos. */
describe('totaisDe', () => {
  it('saldo = créditos − vales − pagamentos, aceitando Decimal, string e número', () => {
    expect(
      totaisDe([
        { tipo: TipoLancamento.CREDITO, _sum: { valor: new Prisma.Decimal('4300.75') } },
        { tipo: TipoLancamento.VALE, _sum: { valor: '800.25' } },
        { tipo: TipoLancamento.PAGAMENTO, _sum: { valor: 0.5 } },
      ]),
    ).toEqual({ creditos: 4300.75, vales: 800.25, pagamentos: 0.5, saldo: 3500 });
  });

  it('sem linhas, ou com soma nula, tudo 0', () => {
    expect(totaisDe([])).toEqual({ creditos: 0, vales: 0, pagamentos: 0, saldo: 0 });
    expect(totaisDe([{ tipo: TipoLancamento.VALE, _sum: { valor: null } }]).saldo).toBe(0);
  });

  it('conta em Decimal: 0,10 + 0,20 de vale zeram um crédito de 0,30 sem resto de float', () => {
    expect(
      totaisDe([
        { tipo: TipoLancamento.CREDITO, _sum: { valor: '0.30' } },
        { tipo: TipoLancamento.VALE, _sum: { valor: '0.10' } },
        { tipo: TipoLancamento.VALE, _sum: { valor: '0.20' } },
      ]).saldo,
    ).toBe(0);
  });

  it('saldo negativo quando o gesseiro recebeu mais do que tinha de crédito', () => {
    expect(
      totaisDe([
        { tipo: TipoLancamento.CREDITO, _sum: { valor: '100' } },
        { tipo: TipoLancamento.PAGAMENTO, _sum: { valor: '150' } },
      ]).saldo,
    ).toBe(-50);
  });
});

describe('saldosPorGesseiro', () => {
  const cliente = (linhas: unknown[]) => {
    const groupBy = jest.fn().mockResolvedValue(linhas);
    return { groupBy, cliente: { lancamento: { groupBy } } as unknown as ClientePrisma };
  };

  it('um groupBy só para todos os ids, e um saldo por gesseiro', async () => {
    const { groupBy, cliente: c } = cliente([
      { gesseiroId: 'g-1', tipo: TipoLancamento.CREDITO, _sum: { valor: '2500' } },
      { gesseiroId: 'g-1', tipo: TipoLancamento.PAGAMENTO, _sum: { valor: '2500' } },
      { gesseiroId: 'g-2', tipo: TipoLancamento.CREDITO, _sum: { valor: '1500' } },
      { gesseiroId: 'g-2', tipo: TipoLancamento.VALE, _sum: { valor: '200' } },
    ]);

    const saldos = await saldosPorGesseiro(c, ['g-1', 'g-2', 'g-3']);

    expect(groupBy).toHaveBeenCalledTimes(1);
    expect(groupBy).toHaveBeenCalledWith({
      by: ['gesseiroId', 'tipo'],
      where: { gesseiroId: { in: ['g-1', 'g-2', 'g-3'] } },
      _sum: { valor: true },
    });
    expect([...saldos]).toEqual([
      ['g-1', 0],
      ['g-2', 1300],
      ['g-3', 0],
    ]);
  });

  it('lista vazia não consulta o banco', async () => {
    const { groupBy, cliente: c } = cliente([]);

    expect((await saldosPorGesseiro(c, [])).size).toBe(0);
    expect(groupBy).not.toHaveBeenCalled();
  });
});
