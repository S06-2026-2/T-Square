// Fonte única do manifest: o vite.config.ts a passa ao vite-plugin-pwa e o
// scripts/checar-build.mjs confere que o dist/manifest.webmanifest gerado é igual a ela (e que os
// PNGs têm o tamanho declarado).
const MANIFESTO = jest.requireActual<Record<string, unknown>>('./manifest.json');

describe('manifest do app instalável (PWA-01)', () => {
  it('tem exatamente os campos e valores do spec, inclusive id "/"', () => {
    expect(MANIFESTO).toEqual({
      id: '/',
      name: 'Gesso Manager',
      short_name: 'Gesso',
      lang: 'pt-BR',
      start_url: '/',
      scope: '/',
      display: 'standalone',
      theme_color: '#0f2a24',
      background_color: '#f3f5f4',
      icons: [
        { src: 'icone-192.png', sizes: '192x192', type: 'image/png' },
        { src: 'icone-512.png', sizes: '512x512', type: 'image/png' },
        { src: 'icone-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      ],
    });
  });
});
