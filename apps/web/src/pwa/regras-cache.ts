/**
 * Regras do cache de dados do service worker (OFF-02, OFF-04, OFF-09, OFF-10, OFF-14), fora do
 * runtime do Workbox para rodarem no Jest. O `sw.ts` só monta as rotas com o que está aqui.
 * Spec: .claude/specs/features/pwa-instalavel-responsivo/spec.md
 */
import type { WorkboxPlugin } from 'workbox-core/types';

import { NOME_CACHE_API } from './nomes-cache';

export { NOME_CACHE_API };

/** OFF-03: depois de 5 s sem resposta da API, a tela recebe o cache. */
export const TIMEOUT_REDE_SEGUNDOS = 5;
/** OFF-14: no máximo 200 respostas; o ExpirationPlugin descarta as mais antigas. */
export const MAX_ENTRADAS = 200;
/** OFF-10: idade máxima, contada a partir do recebimento. */
export const SETE_DIAS_SEGUNDOS = 7 * 24 * 60 * 60;
const SETE_DIAS_MS = SETE_DIAS_SEGUNDOS * 1000;

/** Gravado pelo SW quando a resposta chega: a base da idade do OFF-10. */
export const CABECALHO_RECEBIDO_EM = 'X-Recebido-Em';
/** Marca a resposta entregue do cache (OFF-04); o `api.ts` lê esse cabeçalho. */
export const CABECALHO_DO_CACHE = 'X-From-Cache';

/**
 * Origens da API: a própria página (se a API estiver atrás do mesmo domínio) e a do
 * `VITE_API_URL` do build (a API no Render, ou localhost:3000), sem repetir.
 */
export function origensApi(viteApiUrl: string | undefined, propria: string): string[] {
  const origens = [new URL(propria).origin];
  if (viteApiUrl) {
    const daApi = new URL(viteApiUrl).origin;
    if (!origens.includes(daApi)) origens.push(daApi);
  }
  return origens;
}

/**
 * OFF-02/OFF-09: só `GET /api/**` da API, fora de `/api/auth/**`. POST, PATCH, PUT e DELETE nunca
 * passam por este cache (vão direto à rede, sem rota no SW).
 */
export function ehRequisicaoDeDados(
  { request, url }: { request: Request; url: URL },
  origens: string[],
): boolean {
  return (
    request.method === 'GET' &&
    origens.includes(url.origin) &&
    url.pathname.startsWith('/api/') &&
    !url.pathname.startsWith('/api/auth/')
  );
}

/** Cópia da resposta com cabeçalhos a mais; o corpo é o mesmo stream. */
function comCabecalhos(resposta: Response, extras: Record<string, string>): Response {
  const headers = new Headers(resposta.headers);
  for (const [nome, valor] of Object.entries(extras)) headers.set(nome, valor);
  return new Response(resposta.body, {
    status: resposta.status,
    statusText: resposta.statusText,
    headers,
  });
}

/**
 * Plugin do Workbox para o cache `api-dados`.
 * - `cacheWillUpdate`: só 200 é gravado (OFF-09), com `X-Recebido-Em` = agora.
 * - `cachedResponseWillBeUsed`: recebida há mais de 7 dias (ou sem data) não é usada (OFF-10);
 *   senão sai com `X-From-Cache: 1` (OFF-04).
 * `agora` é injetável para os testes.
 */
export function criarPluginRecebimento(agora: () => number = Date.now): WorkboxPlugin {
  return {
    cacheWillUpdate: async ({ response }) => {
      if (response.status !== 200) return null;
      return comCabecalhos(response, { [CABECALHO_RECEBIDO_EM]: String(agora()) });
    },
    cachedResponseWillBeUsed: async ({ cachedResponse }) => {
      if (!cachedResponse) return null;
      const recebidoEm = Number(cachedResponse.headers.get(CABECALHO_RECEBIDO_EM));
      if (!cachedResponse.headers.has(CABECALHO_RECEBIDO_EM) || !Number.isFinite(recebidoEm)) {
        return null;
      }
      if (agora() - recebidoEm > SETE_DIAS_MS) return null;
      return comCabecalhos(cachedResponse, { [CABECALHO_DO_CACHE]: '1' });
    },
  };
}

export const pluginRecebimento = criarPluginRecebimento();

/** Classes do Workbox que a estratégia usa; injetadas para o teste conferir as opções. */
export interface ClassesWorkbox<E> {
  NetworkFirst: new (opcoes: {
    cacheName: string;
    networkTimeoutSeconds: number;
    plugins: WorkboxPlugin[];
  }) => E;
  CacheableResponsePlugin: new (opcoes: { statuses: number[] }) => WorkboxPlugin;
  ExpirationPlugin: new (opcoes: { maxEntries: number; maxAgeSeconds: number }) => WorkboxPlugin;
}

/**
 * Estratégia do cache de dados, montada aqui para o `sw.ts` não ter nenhum valor solto:
 * rede primeiro com 5 s (OFF-03), só 200 (OFF-09), 200 entradas e 7 dias (OFF-14, OFF-10),
 * `X-Recebido-Em`/`X-From-Cache` (OFF-04, OFF-10), no cache `api-dados`.
 */
export function criarEstrategiaDados<E>(classes: ClassesWorkbox<E>): E {
  return new classes.NetworkFirst({
    cacheName: NOME_CACHE_API,
    networkTimeoutSeconds: TIMEOUT_REDE_SEGUNDOS,
    plugins: [
      new classes.CacheableResponsePlugin({ statuses: [200] }),
      new classes.ExpirationPlugin({ maxEntries: MAX_ENTRADAS, maxAgeSeconds: SETE_DIAS_SEGUNDOS }),
      pluginRecebimento,
    ],
  });
}
