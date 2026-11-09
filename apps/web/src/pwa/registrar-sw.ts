/**
 * Registro manual do service worker (PWA-03/04, UPD-03). Só no build de produção: `main.tsx`
 * passa `prod: import.meta.env.PROD`, que é `false` no `npm run dev`.
 *
 * De propósito, não escuta `controllerchange` nem chama `location.reload()`: quando uma versão
 * nova ativa (skipWaiting + clientsClaim no sw.ts), a página aberta continua com o código que já
 * carregou e a versão nova aparece na próxima abertura ou recarga (UPD-03).
 */
export async function registrarSw({ prod }: { prod: boolean }): Promise<void> {
  if (!prod) return;
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  try {
    await navigator.serviceWorker.register('/sw.js', { scope: '/' });
  } catch {
    // Sem SW o app funciona só online, como antes (Error Handling do design).
  }
}
