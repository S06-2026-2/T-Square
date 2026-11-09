import { NOME_CACHE_API } from '../pwa/nomes-cache';
import type { LoginResponse } from '../types';
import { auth } from './api';

/**
 * Início e fim de sessão (AD-010). O cache de dados da API guarda informação financeira e a chave
 * dele é só a URL, então todo login e todo logout o apagam (OFF-11, OFF-12). Nada além deste
 * módulo encerra a sessão.
 */

/** Nome do cache de `GET /api/**`: o mesmo do service worker, de `pwa/nomes-cache.ts`. */
export { NOME_CACHE_API };

/** Apaga o cache de dados. Sem Cache Storage (sem SW, jsdom) ou com falha, segue sem erro. */
export async function limparCacheApi(): Promise<void> {
  if (typeof caches === 'undefined') return;
  try {
    await caches.delete(NOME_CACHE_API);
  } catch {
    // Sem permissão de armazenamento ou cache indisponível: não há o que apagar.
  }
}

export async function encerrarSessao(): Promise<void> {
  auth.logout();
  await limparCacheApi();
}

export async function iniciarSessao(resposta: LoginResponse): Promise<void> {
  await limparCacheApi();
  auth.setToken(resposta.accessToken);
  auth.setUsuario(resposta.usuario);
}
