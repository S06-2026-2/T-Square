/** Helpers de formatacao usados nas telas. */

export function moeda(valor: string | number | null | undefined): string {
  const numero = Number(valor ?? 0);
  return numero.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function data(valor: string | null | undefined): string {
  if (!valor) return '-';
  return new Date(valor).toLocaleDateString('pt-BR');
}
