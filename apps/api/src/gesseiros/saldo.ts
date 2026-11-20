import { Prisma, TipoLancamento } from '@prisma/client';

import { ClientePrisma } from '../idempotencia/tipos';

/** Linha de um `groupBy` de lançamentos com a soma por tipo. */
export interface SomaPorTipo {
  tipo: TipoLancamento;
  _sum: { valor: Prisma.Decimal | string | number | null };
}

export interface TotaisGesseiro {
  creditos: number;
  vales: number;
  pagamentos: number;
  /** creditos − vales − pagamentos: quanto a firma ainda deve ao gesseiro. */
  saldo: number;
}

/**
 * A regra do saldo, num lugar só (CLAUDE.md: saldo é sempre derivado de lançamentos).
 * A conta é feita em Decimal: "saldo = 0" no arquivamento (ARQ-09) não pode errar por float.
 */
export function totaisDe(linhas: SomaPorTipo[]): TotaisGesseiro {
  const soma = (tipo: TipoLancamento) =>
    linhas
      .filter((linha) => linha.tipo === tipo)
      .reduce((acc, linha) => acc.plus(linha._sum.valor ?? 0), new Prisma.Decimal(0));

  const creditos = soma(TipoLancamento.CREDITO);
  const vales = soma(TipoLancamento.VALE);
  const pagamentos = soma(TipoLancamento.PAGAMENTO);

  return {
    creditos: creditos.toNumber(),
    vales: vales.toNumber(),
    pagamentos: pagamentos.toNumber(),
    saldo: creditos.minus(vales).minus(pagamentos).toNumber(),
  };
}

/** Saldo de vários gesseiros com um `groupBy` só; id sem lançamento fica com saldo 0. */
export async function saldosPorGesseiro(
  cliente: ClientePrisma,
  ids: string[],
): Promise<Map<string, number>> {
  const saldos = new Map(ids.map((id) => [id, 0]));
  if (ids.length === 0) {
    return saldos;
  }

  const linhas = await cliente.lancamento.groupBy({
    by: ['gesseiroId', 'tipo'],
    where: { gesseiroId: { in: ids } },
    _sum: { valor: true },
  });

  for (const id of ids) {
    saldos.set(id, totaisDe(linhas.filter((linha) => linha.gesseiroId === id)).saldo);
  }
  return saldos;
}
