/** Helpers de formatacao usados nas telas. */

export function moeda(valor: string | number | null | undefined): string {
  const numero = Number(valor ?? 0);
  return numero.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function data(valor: string | null | undefined): string {
  if (!valor) return '-';
  return new Date(valor).toLocaleDateString('pt-BR');
}

/** Ate duas iniciais do nome, para o avatar ("Maria Silva" -> "MS"). */
export function iniciais(nome: string): string {
  return nome
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((parte) => parte[0].toUpperCase())
    .join('');
}
