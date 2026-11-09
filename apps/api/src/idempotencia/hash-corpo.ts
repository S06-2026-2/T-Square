import { createHash } from 'node:crypto';

/** Copia o valor com as chaves de todo objeto ordenadas; arrays mantem a ordem. */
function canonico(valor: unknown): unknown {
  if (Array.isArray(valor)) {
    return valor.map(canonico);
  }
  if (valor !== null && typeof valor === 'object') {
    const objeto = valor as Record<string, unknown>;
    return Object.fromEntries(
      Object.keys(objeto)
        .sort()
        .map((chave) => [chave, canonico(objeto[chave])]),
    );
  }
  return valor;
}

/**
 * SHA-256 (hex, 64 caracteres) do corpo em JSON canonico: a mesma informacao
 * com as chaves em outra ordem da o mesmo hash (IDP-03).
 */
export function hashCorpo(body: unknown): string {
  const json = JSON.stringify(canonico(body)) ?? '';
  return createHash('sha256').update(json).digest('hex');
}
