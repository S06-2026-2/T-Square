// Cliente da fixture "[audit]", compartilhado por audit-responsive.mjs e audit-pwa.mjs: as duas
// auditorias usam a mesma trava de banco e a mesma limpeza.
//
// A fixture roda dentro do container da API (que tem o Prisma Client gerado):
//   docker exec gesso_api node scripts/fixture-auditoria.mjs preparar|limpar|contar
// A trava fica lá (apps/api/scripts/fixture-auditoria.mjs): se o DATABASE_URL do container não
// apontar para um banco local, sai com código 3 antes de conectar e o execFileSync aqui lança.
import { execFileSync } from 'node:child_process';

const CONTAINER = process.env.AUDIT_API_CONTAINER ?? 'gesso_api';

/** Roda um comando da fixture e devolve o JSON da última linha. Lança se a fixture falhar. */
export function fixture(comando) {
  const saida = execFileSync(
    'docker',
    ['exec', CONTAINER, 'node', 'scripts/fixture-auditoria.mjs', comando],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
  );
  const linhas = saida.trim().split('\n');
  return JSON.parse(linhas[linhas.length - 1]);
}

/**
 * Limpeza que roda uma vez só (fim normal, erro ou sinal). Devolve quantos registros "[audit]"
 * sobraram (0 = banco limpo) ou null se a limpeza falhou.
 */
let limpo = false;
export function limparFixture() {
  if (limpo) return null;
  limpo = true;
  try {
    return fixture('limpar').restos;
  } catch (erro) {
    console.error(`[audit] falha ao limpar a fixture: ${erro.message}`);
    return null;
  }
}

/** Limpa os restos de uma execução interrompida à força e prepara a fixture. */
export function prepararFixture() {
  const restosAnteriores = fixture('contar').restos;
  if (restosAnteriores > 0) {
    console.log(`[audit] ${restosAnteriores} resto(s) [audit] de uma execução anterior: limpando`);
  }
  fixture('limpar');
  return fixture('preparar');
}

export function relatarLimpeza(restos, log = console.log) {
  log(
    restos === 0
      ? '[audit] fixture limpa: nenhum registro [audit] no banco'
      : `[audit] ERRO: a limpeza da fixture deixou ${restos ?? '?'} registro(s) [audit] no banco`,
  );
}

// Ctrl+C (SIGINT) ou encerramento (SIGTERM): limpa antes de sair. Se nem isso rodar (processo
// morto à força), a limpeza do início da próxima execução apaga os restos.
for (const sinal of ['SIGINT', 'SIGTERM']) {
  process.on(sinal, () => {
    console.error(`\n[audit] ${sinal}: limpando a fixture antes de sair...`);
    relatarLimpeza(limparFixture(), console.error);
    process.exit(130);
  });
}
