import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { readFileSync } from 'node:fs';
import { VitePWA } from 'vite-plugin-pwa';

// Fonte única do manifest (PWA-01); o teste e o scripts/checar-build.mjs leem o mesmo arquivo.
const MANIFESTO = JSON.parse(readFileSync(new URL('./src/pwa/manifest.json', import.meta.url), 'utf8'));

export default defineConfig({
  plugins: [
    react(),
    // Service worker próprio (src/sw.ts). Só existe no `vite build` (PWA-03): o registro é manual
    // em main.tsx, condicionado a import.meta.env.PROD, e o dev server não serve SW (PWA-04).
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      injectRegister: false, // registro manual, sem recarregar a página (UPD-03)
      devOptions: { enabled: false }, // PWA-04
      includeAssets: ['apple-touch-icon.png'],
      // O plugin preenche `description` com a do package.json (Object.assign sobre os padrões);
      // `undefined` anula esse padrão e o campo some do JSON. PWA-01 lista os campos exatos, e o
      // scripts/checar-build.mjs confere.
      manifest: { ...MANIFESTO, description: undefined },
      injectManifest: { globPatterns: ['**/*.{js,css,html,png,svg,webmanifest}'] },
    }),
  ],
  server: {
    port: 5173,
    host: true,
  },
});
