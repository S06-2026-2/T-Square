import { Prisma } from '@prisma/client';

import { reais } from './moeda';

describe('reais', () => {
  it.each([
    [1500.5, 'R$ 1.500,50'],
    ['8500.00', 'R$ 8.500,00'],
    [new Prisma.Decimal('0'), 'R$ 0,00'],
    [-50, '-R$ 50,00'],
  ])('%p → %s, com espaço comum', (valor, esperado) => {
    expect(reais(valor)).toBe(esperado);
  });
});
