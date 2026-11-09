/**
 * Nome do cache de `GET /api/**` (OFF-02). Usado pelo service worker (`sw.ts`, via
 * `regras-cache.ts`) para gravar e pelo `lib/sessao.ts` para apagar no login e no logout
 * (OFF-11, OFF-12). Fica num módulo sem dependências para o `sw.js` não carregar React nem o
 * `api.ts` só por causa de uma constante.
 */
export const NOME_CACHE_API = 'api-dados';
