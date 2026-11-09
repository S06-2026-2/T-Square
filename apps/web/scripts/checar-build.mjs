// Conferências do build de produção (roda depois do `vite build`, dentro do `npm run build`).
// Sai com código 1 se alguma falhar, o que derruba o build local e o da Vercel.
//
// 1. AD-010 / UPD-04: um único chunk JS em dist/assets, sem import() dinâmico. Com o service worker
//    ativando a versão nova sem recarregar a página (UPD-03), uma página antiga que pedisse um
//    chunk lazy depois do deploy receberia um arquivo que não existe mais (tela branca).
// 2. PWA-03: dist/sw.js existe.
// 3. PWA-01: dist/manifest.webmanifest tem exatamente os campos de src/pwa/manifest.json.
// 4. PWA-01/02: os PNGs dos ícones existem e têm o tamanho declarado (cabeçalho IHDR).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.resolve(RAIZ, process.argv[2] ?? 'dist'); // argumento só para a prova de mutação
const falhas = [];

// 1. Um chunk JS, sem import() dinâmico.
const assets = path.join(DIST, 'assets');
const js = fs.existsSync(assets) ? fs.readdirSync(assets).filter((f) => f.endsWith('.js')) : [];
if (js.length !== 1) {
  falhas.push(
    `AD-010: dist/assets deve ter exatamente 1 arquivo .js e tem ${js.length} (${js.join(', ') || 'nenhum'}). ` +
      'Rotas lazy (React.lazy / import()) quebram páginas abertas depois de um deploy (UPD-04).',
  );
}
for (const arquivo of js) {
  const codigo = fs.readFileSync(path.join(assets, arquivo), 'utf8');
  if (/\bimport\s*\(/.test(codigo)) {
    falhas.push(`AD-010: ${arquivo} contém import() dinâmico. Sem rotas lazy (UPD-04).`);
  }
}

// 2. Service worker.
if (!fs.existsSync(path.join(DIST, 'sw.js'))) falhas.push('PWA-03: dist/sw.js não foi gerado.');

// 3. Manifest igual ao do spec.
const caminhoManifest = path.join(DIST, 'manifest.webmanifest');
if (!fs.existsSync(caminhoManifest)) {
  falhas.push('PWA-01: dist/manifest.webmanifest não foi gerado.');
} else {
  const gerado = JSON.parse(fs.readFileSync(caminhoManifest, 'utf8'));
  const esperado = JSON.parse(fs.readFileSync(path.join(RAIZ, 'src/pwa/manifest.json'), 'utf8'));
  try {
    assert.deepStrictEqual(gerado, esperado);
  } catch (erro) {
    falhas.push(`PWA-01: manifest.webmanifest difere de src/pwa/manifest.json:\n${erro.message}`);
  }
}

// 4. PWA-01/02: cada ícone do manifest e o apple-touch-icon existem no dist com o tamanho declarado.
const icones = fs.existsSync(caminhoManifest)
  ? JSON.parse(fs.readFileSync(caminhoManifest, 'utf8')).icons ?? []
  : [];
for (const { src, sizes } of [...icones, { src: 'apple-touch-icon.png', sizes: '180x180' }]) {
  const arquivo = path.join(DIST, src);
  if (!fs.existsSync(arquivo)) {
    falhas.push(`PWA-01/02: ${src} não está no dist.`);
    continue;
  }
  const png = fs.readFileSync(arquivo);
  const medido = png.subarray(12, 16).toString('ascii') === 'IHDR'
    ? `${png.readUInt32BE(16)}x${png.readUInt32BE(20)}`
    : 'não é PNG';
  if (medido !== sizes) falhas.push(`PWA-01/02: ${src} tem ${medido}, declarado ${sizes}.`);
}

if (falhas.length) {
  console.error(`checar-build: ${falhas.length} falha(s)\n- ${falhas.join('\n- ')}`);
  process.exit(1);
}
console.log(`checar-build: OK (1 chunk JS: ${js[0]}; sw.js; manifest igual ao PWA-01; ${icones.length + 1} ícones no tamanho)`);
