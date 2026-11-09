import { useSyncExternalStore } from 'react';

/**
 * Estado da instalação do app (PWA-05..PWA-10).
 * - `'prompt'`: o navegador ofereceu a instalação (`beforeinstallprompt`) e o evento está guardado.
 * - `'ios'`: Safari do iPhone/iPad, que não tem esse evento; o botão mostra a instrução manual.
 * - `null`: já instalado (standalone), já usado/recusado, ou navegador sem suporte.
 */
export type ModoInstalacao = 'prompt' | 'ios' | null;

/** Evento do Chrome/Edge; não está no `lib.dom` do TypeScript. */
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

let eventoGuardado: BeforeInstallPromptEvent | null = null;
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

/**
 * Registra os eventos de instalação. Chamar o mais cedo possível (topo do `main.tsx`), porque o
 * `beforeinstallprompt` pode disparar antes de o React montar o botão.
 */
export function iniciarCapturaInstalacao(): void {
  window.addEventListener('beforeinstallprompt', (evento) => {
    // Sem o preventDefault o Chrome mostra a própria barra de instalação.
    evento.preventDefault();
    eventoGuardado = evento as BeforeInstallPromptEvent;
    avisar();
  });
  window.addEventListener('appinstalled', () => {
    eventoGuardado = null;
    avisar();
  });
}

function emStandalone(): boolean {
  const porMidia =
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(display-mode: standalone)').matches;
  // Safari do iOS: o app aberto da tela de início expõe `navigator.standalone`.
  return porMidia || (navigator as { standalone?: boolean }).standalone === true;
}

/** Safari do iPhone/iPad. O iPad recente se apresenta como Mac (`MacIntel`), mas com toque. */
function ehSafariIos(): boolean {
  const ua = navigator.userAgent;
  const ios =
    /iPhone|iPad|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  // Chrome, Firefox e Edge do iOS não instalam pelo "Adicionar à Tela de Início" do Safari.
  return ios && !/CriOS|FxiOS|EdgiOS/.test(ua);
}

function modoAtual(): ModoInstalacao {
  if (emStandalone()) return null;
  if (eventoGuardado) return 'prompt';
  if (ehSafariIos()) return 'ios';
  return null;
}

/** Abre o diálogo do navegador. Aceito ou recusado, o evento não serve mais (PWA-06, PWA-07). */
async function instalar(): Promise<void> {
  const evento = eventoGuardado;
  if (!evento) return;
  try {
    await evento.prompt();
    await evento.userChoice;
  } catch {
    // O navegador recusou abrir o diálogo (evento já usado): o botão some do mesmo jeito.
  } finally {
    if (eventoGuardado === evento) eventoGuardado = null;
    avisar();
  }
}

export function useInstalacao(): { modo: ModoInstalacao; instalar: () => Promise<void> } {
  const modo = useSyncExternalStore(assinar, modoAtual);
  return { modo, instalar };
}
