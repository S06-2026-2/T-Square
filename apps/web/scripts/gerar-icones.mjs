// Gera os ícones do app instalável (PWA-01, PWA-02) a partir do SVG da marca (o mesmo do favicon
// em index.html), num Chrome headless. Roda à mão quando a marca mudar; os PNGs entram no git e
// não fazem parte do build.
//
//   npm run gerar:icones --workspace apps/web
//
// Saída em apps/web/public/:
//   icone-192.png, icone-512.png     cantos arredondados, fundo transparente fora do quadrado
//   icone-512-maskable.png           fundo cheio #1f6f5c, desenho dentro do círculo de 80% (zona segura)
//   apple-touch-icon.png (180)       fundo cheio (o iOS arredonda sozinho e não aceita transparência)
// No fim, confere a largura e a altura de cada PNG lendo o cabeçalho IHDR, e sai com código 1 se
// alguma não bater.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import puppeteer from 'puppeteer-core';

const CHROME = process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PUBLICO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');
const VERDE = '#1f6f5c';

/** Camadas da marca no viewBox 0 0 24 24 (as mesmas do favicon). */
const DESENHO =
  `<path d="M5 8.5 12 5l7 3.5-7 3.5zM5 12l7 3.5 7-3.5M5 15.5 12 19l7-3.5" fill="none" ` +
  `stroke="white" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"/>`;

/**
 * `arredondado`: o quadrado verde com rx 6 (como o favicon), cantos transparentes.
 * `cheio`: fundo verde em todo o quadro e o desenho reduzido a `escala` em volta do centro.
 */
function svg(tamanho, { arredondado, escala = 1 }) {
  const fundo = arredondado
    ? `<rect width="24" height="24" rx="6" fill="${VERDE}"/>`
    : `<rect width="24" height="24" fill="${VERDE}"/>`;
  const desenho =
    escala === 1 ? DESENHO : `<g transform="translate(12 12) scale(${escala}) translate(-12 -12)">${DESENHO}</g>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="${tamanho}" height="${tamanho}">${fundo}${desenho}</svg>`;
}

const ICONES = [
  { arquivo: 'icone-192.png', tamanho: 192, arredondado: true },
  { arquivo: 'icone-512.png', tamanho: 512, arredondado: true },
  // Zona segura do maskable: círculo de 80% do lado (raio 9,6 no viewBox 24). Com escala 0,8 o
  // ponto mais distante do desenho fica a ~6,3 do centro, com folga para o traço.
  { arquivo: 'icone-512-maskable.png', tamanho: 512, arredondado: false, escala: 0.8 },
  { arquivo: 'apple-touch-icon.png', tamanho: 180, arredondado: false, escala: 0.9 },
];

/** Largura e altura do cabeçalho IHDR (bytes 16..23 de um PNG). */
function dimensoesPng(arquivo) {
  const b = fs.readFileSync(arquivo);
  const assinatura = '89504e470d0a1a0a';
  if (b.subarray(0, 8).toString('hex') !== assinatura || b.subarray(12, 16).toString('ascii') !== 'IHDR') {
    throw new Error(`${path.basename(arquivo)} não é um PNG válido`);
  }
  return { largura: b.readUInt32BE(16), altura: b.readUInt32BE(20) };
}

async function principal() {
  fs.mkdirSync(PUBLICO, { recursive: true });
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: true });
  try {
    const page = await browser.newPage();
    for (const icone of ICONES) {
      await page.setViewport({ width: icone.tamanho, height: icone.tamanho, deviceScaleFactor: 1 });
      await page.setContent(
        `<!doctype html><html><body style="margin:0;background:transparent">${svg(icone.tamanho, icone)}</body></html>`,
      );
      await page.screenshot({
        path: path.join(PUBLICO, icone.arquivo),
        omitBackground: true,
        clip: { x: 0, y: 0, width: icone.tamanho, height: icone.tamanho },
      });
    }
  } finally {
    await browser.close();
  }

  let erros = 0;
  for (const icone of ICONES) {
    const { largura, altura } = dimensoesPng(path.join(PUBLICO, icone.arquivo));
    const ok = largura === icone.tamanho && altura === icone.tamanho;
    if (!ok) erros += 1;
    console.log(`${ok ? 'OK  ' : 'ERRO'} ${icone.arquivo}: ${largura}x${altura} (esperado ${icone.tamanho}x${icone.tamanho})`);
  }
  return erros === 0 ? 0 : 1;
}

principal()
  .then((codigo) => process.exit(codigo))
  .catch((erro) => {
    console.error(erro);
    process.exit(1);
  });
