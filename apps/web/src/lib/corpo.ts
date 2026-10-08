/**
 * Helpers para montar o corpo das requisicoes dos formularios.
 * O ValidationPipe da API nao converte string em number e recusa campos
 * extras, entao todo formulario passa os valores dos inputs por aqui.
 */

export function numero(valor: string): number {
  return Number(valor);
}

export function numeroOpcional(valor: string): number | undefined {
  return valor.trim() === '' ? undefined : Number(valor);
}

export function textoOpcional(valor: string): string | undefined {
  const limpo = valor.trim();
  return limpo === '' ? undefined : limpo;
}

export function semVazios<T extends object>(obj: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(obj).filter(([, valor]) => valor !== undefined),
  ) as Partial<T>;
}
