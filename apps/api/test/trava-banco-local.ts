/**
 * Trava dos testes e2e: eles gravam e apagam dados (prefixo `[e2e]`) no banco do
 * DATABASE_URL, entao so rodam contra o Postgres local do Docker.
 * Registrada em `setupFiles` (jest-e2e.json): roda antes de cada arquivo de teste, antes de
 * qualquer import do AppModule, e portanto antes de qualquer conexao.
 * Mesma regra de `exigirBancoLocal` em scripts/fixture-auditoria.mjs.
 */
export {};

const HOSTS_LOCAIS = new Set(['localhost', '127.0.0.1', '::1', '[::1]', 'db']);

let host: string | null;
try {
  host = new URL(process.env.DATABASE_URL ?? '').hostname || null;
} catch {
  host = null;
}

if (!host || !HOSTS_LOCAIS.has(host)) {
  throw new Error(
    `[e2e] RECUSADO: os testes e2e so rodam em banco local (${[...HOSTS_LOCAIS].join(', ')}). ` +
      `DATABASE_URL aponta para "${host ?? 'URL ausente ou invalida'}". Nenhuma conexao foi aberta.`,
  );
}
