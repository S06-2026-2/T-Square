/// <reference lib="webworker" />
/**
 * Service worker do Gesso Manager (vite-plugin-pwa, modo injectManifest). Só existe no build de
 * produção (PWA-03/04). As regras do cache de dados estão em `pwa/regras-cache.ts`, testadas.
 * Spec: .claude/specs/features/pwa-instalavel-responsivo/spec.md
 */
import { CacheableResponsePlugin } from 'workbox-cacheable-response';
import { clientsClaim } from 'workbox-core';
import { ExpirationPlugin } from 'workbox-expiration';
import {
  cleanupOutdatedCaches,
  createHandlerBoundToURL,
  precacheAndRoute,
  type PrecacheEntry,
} from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';
import { CacheFirst, NetworkFirst, StaleWhileRevalidate } from 'workbox-strategies';

import { BASE_URL } from './lib/config';
import {
  ehRequisicaoDeDados,
  MAX_ENTRADAS,
  NOME_CACHE_API,
  origensApi,
  pluginRecebimento,
  SETE_DIAS_SEGUNDOS,
  TIMEOUT_REDE_SEGUNDOS,
} from './pwa/regras-cache';

declare const self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: Array<PrecacheEntry | string>;
};

// UPD-01/02: a versão nova ativa sozinha, sem esperar as abas fecharem, e assume as páginas
// abertas. Nenhuma página é recarregada (UPD-03): quem já está aberta continua com o código que
// carregou; como o build tem um chunk só (AD-010), ela não pede arquivo que deixou de existir (UPD-04).
self.addEventListener('install', () => {
  void self.skipWaiting();
});
clientsClaim();

// OFF-01: a casca do app (HTML, JS, CSS, ícones, manifest) vem do precache; versões antigas saem.
precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

// OFF-01: qualquer rota do app abre offline com o index.html. `/api/**` nunca recebe o HTML.
registerRoute(
  new NavigationRoute(createHandlerBoundToURL('/index.html'), { denylist: [/^\/api\//] }),
);

// OFF-02/03/04/09/10/14: GET /api/** (fora de /api/auth/**) da API, rede primeiro com 5 s.
// Só 200 vai para o cache; um 401 ou 500 da rede chega à tela como veio (nunca é trocado pelo cache).
// Mesma origem que o api.ts usa (lib/config.ts), inclusive o padrão localhost:3000.
const origens = origensApi(BASE_URL, self.location.origin);
registerRoute(
  (opcoes) => ehRequisicaoDeDados(opcoes, origens),
  new NetworkFirst({
    cacheName: NOME_CACHE_API,
    networkTimeoutSeconds: TIMEOUT_REDE_SEGUNDOS,
    plugins: [
      new CacheableResponsePlugin({ statuses: [200] }),
      new ExpirationPlugin({ maxEntries: MAX_ENTRADAS, maxAgeSeconds: SETE_DIAS_SEGUNDOS }),
      pluginRecebimento,
    ],
  }),
);

// Fontes do Google (assumption do spec): a fonte não muda offline.
registerRoute(
  ({ url }) => url.origin === 'https://fonts.googleapis.com',
  new StaleWhileRevalidate({ cacheName: 'fontes-css' }),
);
registerRoute(
  ({ url }) => url.origin === 'https://fonts.gstatic.com',
  new CacheFirst({
    cacheName: 'fontes-arquivos',
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({ maxEntries: 30, maxAgeSeconds: 365 * 24 * 60 * 60 }),
    ],
  }),
);
