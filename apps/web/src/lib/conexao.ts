import { useEffect, useRef, useSyncExternalStore } from 'react';

/**
 * Estado "dados possivelmente desatualizados" (OFF-06, OFF-07): o navegador está offline ou a
 * última resposta GET veio do cache do service worker. O `api.ts` registra a origem a cada GET 200.
 */
type Origem = 'rede' | 'cache';

let ultimaOrigem: Origem = 'rede';
const assinantes = new Set<() => void>();

function avisar() {
  assinantes.forEach((fn) => fn());
}

export function registrarOrigem(origem: Origem): void {
  ultimaOrigem = origem;
  avisar();
}

export function estaDesatualizado(): boolean {
  return !navigator.onLine || ultimaOrigem === 'cache';
}

/** Avisa `fn` a cada `registrarOrigem` e nos eventos `online`/`offline`. O retorno cancela. */
export function assinar(fn: () => void): () => void {
  assinantes.add(fn);
  window.addEventListener('online', fn);
  window.addEventListener('offline', fn);
  return () => {
    assinantes.delete(fn);
    window.removeEventListener('online', fn);
    window.removeEventListener('offline', fn);
  };
}

export function useDesatualizado(): boolean {
  return useSyncExternalStore(assinar, estaDesatualizado);
}

/** Chama `fn` a cada evento `online` (OFF-15), sempre a versão mais recente de `fn`. */
export function useAoReconectar(fn: () => void): void {
  const atual = useRef(fn);

  useEffect(() => {
    atual.current = fn;
  });

  useEffect(() => {
    const aoReconectar = () => atual.current();
    window.addEventListener('online', aoReconectar);
    return () => window.removeEventListener('online', aoReconectar);
  }, []);
}
