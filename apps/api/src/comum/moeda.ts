import { Prisma } from '@prisma/client';

/**
 * Valor em reais para mensagens da API: `R$ 1.500,50`. O Intl separa "R$" do número com um espaço
 * não separável (U+00A0); aqui ele vira espaço comum, para a mensagem ser previsível nos testes e
 * no front.
 */
export function reais(valor: Prisma.Decimal | string | number): string {
  return Number(valor)
    .toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
    .replace(/ /g, ' ');
}
