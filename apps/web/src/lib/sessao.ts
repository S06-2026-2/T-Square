import { useSyncExternalStore } from 'react';

import { NOME_CACHE_API } from '../pwa/nomes-cache';
import type { LoginResponse } from '../types';
import { auth } from './api';

/**
 * Início e fim de sessão (AD-010). O cache de dados da API guarda informação financeira e a chave
 * dele é só a URL, então todo login e todo logout o apagam (OFF-11, OFF-12). Nada além deste
 * módulo encerra a sessão.
 *
 * A sessão é observável (`useSessaoAtiva`): quando ela termina, a `RotaPrivada` leva a `/login`
 * na hora, depois de o cache ter sido apagado (OFF-11), sem esperar uma recarga.
 */

/** Nome do cache de `GET /api/**`: o mesmo do service worker, de `pwa/nomes-cache.ts`. */
export { NOME_CACHE_API };

/** Por que a última sessão terminou: "Sair" ou 401 (sessão expirada). */
export type MotivoFimSessao = 'saida' | 'expirada';

let motivoFim: MotivoFimSessao | null = null;
const assinantes = new Set<() => void>();

function avisar() {
  assinantes.forEach((fn) => fn());
}

function assinar(fn: () => void): () => void {
  assinantes.add(fn);
  return () => {
    assinantes.delete(fn);
  };
}

/** true enquanto houver token; a tela renderiza de novo quando a sessão começa ou termina. */
export function useSessaoAtiva(): boolean {
  return useSyncExternalStore(assinar, auth.estaLogado, auth.estaLogado);
}

/** Motivo do fim da última sessão (null depois de um login). */
export function motivoFimSessao(): MotivoFimSessao | null {
  return motivoFim;
}

/** Apaga o cache de dados. Sem Cache Storage (sem SW, jsdom) ou com falha, segue sem erro. */
export async function limparCacheApi(): Promise<void> {
  if (typeof caches === 'undefined') return;
  try {
    await caches.delete(NOME_CACHE_API);
  } catch {
    // Sem permissão de armazenamento ou cache indisponível: não há o que apagar.
  }
}

/** Encerra a sessão: token, usuário e cache de dados; só então avisa a tela (OFF-11). */
export async function encerrarSessao(motivo: MotivoFimSessao = 'saida'): Promise<void> {
  auth.logout();
  await limparCacheApi();
  motivoFim = motivo;
  avisar();
}

export async function iniciarSessao(resposta: LoginResponse): Promise<void> {
  await limparCacheApi();
  auth.setToken(resposta.accessToken);
  auth.setUsuario(resposta.usuario);
  motivoFim = null;
  avisar();
}
