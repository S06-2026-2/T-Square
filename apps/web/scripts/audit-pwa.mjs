// Auditoria do PWA no navegador (spec pwa-instalavel-responsivo: PWA-01/03, OFF-01..07/09/11,
// Edge Case do 401). Roda contra o build de produção, num Chrome headless de verdade, com o
// service worker ativo. Sai com código 1 se qualquer conferência falhar ou se sobrar dado
// "[audit]" no banco ou cache/SW no navegador.
//
// Pré-requisitos: `npm run build` + `vite preview` (porta 4173) e a API no Docker (gesso_api).
// Usa a mesma fixture da audit-responsive (fixture-cliente.mjs): mesma trava de banco local
// (exit 3 fora de localhost/127.0.0.1/::1/db) e mesma limpeza no fim, em erro e em SIGINT/SIGTERM.
// Não grava nada além da fixture: só GETs, login e logout.
//
// "Sem rede" é aplicado na página (setOfflineMode) E no alvo do service worker (CDP
// Network.emulateNetworkConditions): o setOfflineMode da página não alcança o fetch do SW, e sem
// isso o SW buscaria na rede e o teste offline passaria sem provar nada. A API lenta (6 s) é
// emulada só no SW, com a página online.
//
// Variáveis: AUDIT_BASE_URL (padrão http://localhost:4173), AUDIT_API_URL (padrão
// http://localhost:3000), CHROME_PATH. Screenshots em apps/web/.audit/pwa-*.png.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import puppeteer from 'puppeteer-core';

import { limparFixture, prepararFixture, relatarLimpeza } from './fixture-cliente.mjs';

const BASE = (process.env.AUDIT_BASE_URL ?? 'http://localhost:4173').replace(/\/$/, '');
const API = (process.env.AUDIT_API_URL ?? 'http://localhost:3000').replace(/\/$/, '');
const CHROME = process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const SAIDA = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '.audit');
const ESPERA = 10_000;

const CACHE = 'api-dados';
const SEM_CONEXAO_LEITURA = 'Sem conexão e sem dados salvos desta tela neste aparelho.';
const MATERIAL_FIXTURE = '[audit] Alerta ativo';
const INDICADOR = '.indicador-conexao';

// ---------------------------------------------------------------- relatório

const resultados = [];
function conferir(id, ok, detalhe) {
  resultados.push({ id, ok: Boolean(ok), detalhe });
  console.log(`${ok ? 'OK   ' : 'FALHA'} ${id}: ${detalhe}`);
}

async function foto(page, nome) {
  await page.screenshot({ path: path.join(SAIDA, `pwa-${nome}.png`) }).catch(() => {});
}

// ---------------------------------------------------------------- helpers

const pausa = (ms) => new Promise((r) => setTimeout(r, ms));

async function esperar(page, condicao, ...args) {
  try {
    await page.waitForFunction(condicao, { timeout: ESPERA, polling: 100 }, ...args);
    return true;
  } catch {
    return false;
  }
}

function textoVisivel(texto) {
  return document.body.innerText.includes(texto);
}

function indicadorVisivel(seletor) {
  return document.querySelector(seletor) !== null;
}

/** Entradas do cache de dados: URL, método e cabeçalhos relevantes. */
function lerCacheDados(nome) {
  return (async () => {
    if (!(await caches.has(nome))) return null;
    const cache = await caches.open(nome);
    const pedidos = await cache.keys();
    return Promise.all(
      pedidos.map(async (pedido) => {
        const resposta = await cache.match(pedido);
        return {
          url: pedido.url,
          metodo: pedido.method,
          status: resposta?.status ?? null,
          recebidoEm: resposta?.headers.get('X-Recebido-Em') ?? null,
          doCache: resposta?.headers.get('X-From-Cache') ?? null,
        };
      }),
    );
  })();
}

/** fetch feito pela própria página (passa pelo SW). Nunca lança: devolve o que aconteceu. */
function buscarNaPagina(url, token) {
  return (async () => {
    try {
      const r = await fetch(url, token ? { headers: { Authorization: `Bearer ${token}` } } : {});
      const corpo = await r.text();
      return {
        status: r.status,
        tipo: r.headers.get('Content-Type'),
        doCache: r.headers.get('X-From-Cache'),
        html: /<html|<!doctype/i.test(corpo),
      };
    } catch (e) {
      return { erro: `${e.name}: ${e.message}` };
    }
  })();
}

async function entrar(page) {
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle0' });
  await page.waitForSelector('.login-card input[type=email]');
  // Os campos podem vir preenchidos: apaga antes de digitar.
  for (const [seletor, valor] of [
    ['.login-card input[type=email]', 'admin@gesso.com'],
    ['.login-card input[type=password]', 'admin123'],
  ]) {
    await page.click(seletor, { count: 3 });
    await page.keyboard.press('Backspace');
    await page.type(seletor, valor);
  }
  await Promise.all([
    page.waitForFunction(() => location.pathname === '/dashboard', { timeout: ESPERA }),
    page.click('.login-card button[type=submit]'),
  ]);
  await page.waitForNetworkIdle({ idleTime: 500 });
}

// ---------------------------------------------------------------- rede (página + SW)

// O SW muda antes da página: ao voltar a rede, a página dispara o evento "online" e busca na hora
// (OFF-15); se o SW ainda estivesse offline, essa busca cairia no cache e o ícone não apagaria.
let cdpSw = null;
async function rede(page, modo) {
  await cdpSw.send('Network.emulateNetworkConditions', {
    offline: modo === 'offline',
    latency: modo === 'lenta' ? 6000 : 0,
    downloadThroughput: -1,
    uploadThroughput: -1,
  });
  await page.setOfflineMode(modo === 'offline');
}

// ---------------------------------------------------------------- roteiro

async function roteiro(browser, contexto) {
  const page = await contexto.newPage();
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 });

  // 1. PWA-03: SW registrado pelo build, escopo "/", controlando a página.
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle0' });
  const sw = await page.evaluate(async () => {
    const reg = await navigator.serviceWorker.ready;
    for (let i = 0; i < 50 && !navigator.serviceWorker.controller; i += 1) {
      await new Promise((r) => setTimeout(r, 100));
    }
    return {
      escopo: reg.scope,
      script: reg.active?.scriptURL ?? null,
      controla: navigator.serviceWorker.controller !== null,
    };
  });
  conferir(
    'PWA-03 service worker ativo',
    sw.escopo === `${BASE}/` && sw.script === `${BASE}/sw.js` && sw.controla,
    `escopo ${sw.escopo}, script ${sw.script}, controla a página: ${sw.controla}`,
  );
  const alvoSw = await browser.waitForTarget(
    (t) => t.type() === 'service_worker' && t.url() === `${BASE}/sw.js`,
    { timeout: ESPERA },
  );
  cdpSw = await alvoSw.createCDPSession();
  await cdpSw.send('Network.enable');

  // 2. PWA-01: manifest servido e ligado no HTML.
  const manifest = await page.evaluate(async () => {
    const href = document.querySelector('link[rel=manifest]')?.getAttribute('href');
    if (!href) return { href: null };
    const r = await fetch(href);
    return { href, status: r.status, json: await r.json() };
  });
  conferir(
    'PWA-01 manifest servido',
    manifest.status === 200 && manifest.json?.id === '/' && manifest.json?.display === 'standalone' &&
      manifest.json?.icons?.length === 3,
    `href ${manifest.href}, status ${manifest.status}, id ${manifest.json?.id}, ${manifest.json?.icons?.length} ícones`,
  );

  // 3. Online: login e as telas; o cache guarda os GET 200, nunca /api/auth (OFF-02, OFF-09).
  await entrar(page);
  for (const rota of ['/obras', '/estoque', '/gesseiros']) {
    await page.goto(`${BASE}${rota}`, { waitUntil: 'networkidle0' });
  }
  await page.waitForSelector('.lista-pessoas li');
  const nomes = await page.$$eval('.lista-pessoas li .btn-texto', (els) => els.map((e) => e.textContent));
  if (nomes.length < 2) throw new Error(`são precisos 2 gesseiros no banco local, há ${nomes.length}`);
  await page.click('.lista-pessoas li:nth-child(1)');
  await esperar(page, textoVisivel, 'Saldo');
  await page.waitForNetworkIdle({ idleTime: 500 });
  const idAberto = await page.evaluate(
    (api) => performance.getEntriesByType('resource').map((e) => e.name)
      .find((u) => u.startsWith(`${api}/api/gesseiros/`) && u.endsWith('/extrato')),
    API,
  );

  const entradas = (await page.evaluate(lerCacheDados, CACHE)) ?? [];
  const tem = (prefixo) => entradas.some((e) => e.url.startsWith(`${API}${prefixo}`));
  const agora = Date.now();
  const recebidasOk = entradas.every((e) => /^\d+$/.test(e.recebidoEm ?? '') && agora - Number(e.recebidoEm) < 10 * 60_000);
  conferir(
    'OFF-02 cache online de /obras, /estoque e extrato',
    tem('/api/obras') && tem('/api/estoque/materiais') && Boolean(idAberto) && entradas.some((e) => e.url === idAberto) && recebidasOk,
    `${entradas.length} entradas; X-Recebido-Em numérico e recente em todas: ${recebidasOk}; extrato ${idAberto}`,
  );
  conferir(
    'OFF-09 nada de /api/auth, só GET 200, sem X-From-Cache gravado',
    entradas.every((e) => !e.url.includes('/api/auth/') && e.metodo === 'GET' && e.status === 200 && e.doCache === null),
    `métodos ${[...new Set(entradas.map((e) => e.metodo))].join(',')}; status ${[...new Set(entradas.map((e) => e.status))].join(',')}`,
  );

  // 4. Offline: recarregar /estoque mostra os materiais do cache e o ícone (OFF-01, OFF-04, OFF-06).
  const token = await page.evaluate(() => localStorage.getItem('gesso.token'));
  await page.goto(`${BASE}/estoque`, { waitUntil: 'networkidle0' });
  await rede(page, 'offline');
  await page.reload({ waitUntil: 'domcontentloaded' });
  const estoqueOk = await esperar(page, textoVisivel, MATERIAL_FIXTURE);
  const iconeOffline = await esperar(page, indicadorVisivel, INDICADOR);
  const viaSw = await page.evaluate(buscarNaPagina, `${API}/api/estoque/materiais`, token);
  await foto(page, 'offline-estoque');
  conferir(
    'OFF-01/04/06 /estoque recarregado offline',
    estoqueOk && iconeOffline && viaSw.status === 200 && viaSw.doCache === '1',
    `material "${MATERIAL_FIXTURE}" na tela: ${estoqueOk}; ícone: ${iconeOffline}; ` +
      `fetch da página: status ${viaSw.status ?? viaSw.erro}, X-From-Cache ${viaSw.doCache}`,
  );

  // 5. Offline: extrato nunca aberto mostra a mensagem do OFF-05.
  await page.goto(`${BASE}/gesseiros`, { waitUntil: 'domcontentloaded' });
  await esperar(page, (n) => document.querySelectorAll('.lista-pessoas li').length >= n, 2);
  await page.click('.lista-pessoas li:nth-child(2)');
  const msgOk = await esperar(
    page,
    (t) => [...document.querySelectorAll('.erro')].some((e) => e.textContent.trim() === t),
    SEM_CONEXAO_LEITURA,
  );
  await foto(page, 'offline-extrato-nao-aberto');
  conferir('OFF-05 extrato não aberto, offline', msgOk, `".erro" com "${SEM_CONEXAO_LEITURA}": ${msgOk} (gesseiro ${nomes[1]})`);

  // 6. Offline: /api/** nunca recebe o HTML do app (OFF-01).
  const mesmaOrigem = await page.evaluate(buscarNaPagina, `${BASE}/api/obras`);
  const daApi = await page.evaluate(buscarNaPagina, `${API}/api/obras`, token);
  const navegacao = await contexto.newPage();
  await navegacao.setOfflineMode(true);
  let navResultado;
  try {
    const r = await navegacao.goto(`${BASE}/api/obras`, { waitUntil: 'domcontentloaded', timeout: ESPERA });
    const temApp = await navegacao.evaluate(() => document.getElementById('root') !== null);
    navResultado = { status: r?.status(), temApp };
  } catch (e) {
    navResultado = { erro: e.message.split('\n')[0], temApp: false };
  }
  await navegacao.close();
  conferir(
    'OFF-01 /api/** offline sem HTML',
    !mesmaOrigem.html && !daApi.html && (daApi.tipo ?? '').includes('application/json') && !navResultado.temApp,
    `fetch ${BASE}/api/obras: ${mesmaOrigem.erro ?? `${mesmaOrigem.status} ${mesmaOrigem.tipo}`}; ` +
      `fetch ${API}/api/obras: ${daApi.status} ${daApi.tipo} X-From-Cache ${daApi.doCache}; ` +
      `navegação a ${BASE}/api/obras: ${navResultado.erro ?? `status ${navResultado.status}`}, app montado: ${navResultado.temApp}`,
  );

  // 7. Volta a rede: a tela busca de novo e o ícone some (OFF-07, OFF-15).
  let buscasGesseiros = 0;
  const contar = (req) => {
    if (req.url().startsWith(`${API}/api/gesseiros`)) buscasGesseiros += 1;
  };
  page.on('request', contar);
  await rede(page, 'online');
  const iconeSumiu = await esperar(page, (s) => document.querySelector(s) === null, INDICADOR);
  await page.waitForNetworkIdle({ idleTime: 500 }).catch(() => {});
  page.off('request', contar);
  await foto(page, 'reconectado');
  conferir(
    'OFF-07/15 reconexão',
    iconeSumiu && buscasGesseiros >= 1,
    `ícone sumiu: ${iconeSumiu}; GET /api/gesseiros* depois de reconectar: ${buscasGesseiros}`,
  );

  // 8. API lenta (6 s, página online): em 5 s a tela recebe o cache e o ícone acende (OFF-03/04/06).
  // A página está online, então o ícone só acende se o X-From-Cache do SW chegar legível ao api.ts.
  await rede(page, 'lenta');
  const inicio = Date.now();
  await page.goto(`${BASE}/estoque`, { waitUntil: 'domcontentloaded' });
  const lentaDados = await esperar(page, textoVisivel, MATERIAL_FIXTURE);
  const decorrido = Date.now() - inicio;
  const lentaIcone = await esperar(page, indicadorVisivel, INDICADOR);
  await foto(page, 'api-lenta');
  await rede(page, 'online');
  await pausa(1500); // a resposta tardia da rede termina de chegar e atualiza o cache
  conferir(
    'OFF-03/04 API lenta usa o cache em 5 s',
    lentaDados && lentaIcone && decorrido >= 4500 && decorrido < 6000,
    `dados do cache na tela em ${decorrido} ms (esperado entre 4,5 s e 6 s); ícone: ${lentaIcone}`,
  );

  // 9. 401 com rede não é trocado pelo cache (Edge Case). /api/obras está em cache.
  const com401 = await page.evaluate(buscarNaPagina, `${API}/api/obras`, 'token-invalido-da-auditoria');
  conferir(
    'Edge Case 401 com rede chega como 401',
    com401.status === 401 && com401.doCache === null,
    `GET /api/obras com token inválido: status ${com401.status}, X-From-Cache ${com401.doCache}`,
  );

  // 10. Sair apaga o cache de dados (OFF-11).
  const antesSair = ((await page.evaluate(lerCacheDados, CACHE)) ?? []).length;
  await page.goto(`${BASE}/estoque`, { waitUntil: 'networkidle0' });
  await Promise.all([
    page.waitForFunction(() => location.pathname === '/login', { timeout: ESPERA }),
    page.click('.btn-sair'),
  ]);
  const depoisSair = await page.evaluate(lerCacheDados, CACHE);
  conferir(
    'OFF-11 Sair apaga api-dados',
    antesSair > 0 && (depoisSair === null || depoisSair.length === 0),
    `entradas antes: ${antesSair}; depois: ${depoisSair === null ? 'cache ausente' : depoisSair.length}`,
  );

  // 11. 401 de verdade pela tela: logout automático também apaga o cache (OFF-11). Como na main,
  // a tela mostra "Sessao expirada" e fica na rota; a RotaPrivada só confere o token ao montar,
  // então quem leva a /login é a próxima abertura/recarga (pendência registrada no STATE.md).
  await entrar(page);
  await page.goto(`${BASE}/obras`, { waitUntil: 'networkidle0' });
  const antes401 = ((await page.evaluate(lerCacheDados, CACHE)) ?? []).length;
  await page.evaluate(() => localStorage.setItem('gesso.token', 'token-invalido-da-auditoria'));
  await page.reload({ waitUntil: 'domcontentloaded' });
  const msg401 = await esperar(
    page,
    (t) => [...document.querySelectorAll('.erro')].some((e) => e.textContent.includes(t)),
    'Sessao expirada',
  );
  await page.waitForNetworkIdle({ idleTime: 500 }).catch(() => {});
  const depois401 = await page.evaluate(lerCacheDados, CACHE);
  await page.reload({ waitUntil: 'domcontentloaded' });
  const foiAoLogin = await esperar(page, () => location.pathname === '/login');
  const depoisNavegar = await page.evaluate(lerCacheDados, CACHE);
  conferir(
    'OFF-11 401 automático apaga api-dados',
    antes401 > 0 && msg401 && (depois401 === null || depois401.length === 0) && foiAoLogin &&
      (depoisNavegar === null || depoisNavegar.length === 0),
    `entradas antes: ${antes401}; depois do 401: ${depois401 === null ? 'cache ausente' : depois401.length}; ` +
      `"Sessao expirada" na tela: ${msg401}; recarga leva a /login: ${foiAoLogin}; cache depois: ${depoisNavegar === null ? 'ausente' : depoisNavegar.length}`,
  );

  // 12. Limpeza do navegador: todos os caches e o SW saem.
  const limpezaNavegador = await page.evaluate(async () => {
    for (const nome of await caches.keys()) await caches.delete(nome);
    for (const reg of await navigator.serviceWorker.getRegistrations()) await reg.unregister();
    localStorage.clear();
    return {
      caches: (await caches.keys()).length,
      registros: (await navigator.serviceWorker.getRegistrations()).length,
    };
  });
  conferir(
    'Cache Storage e SW limpos no fim',
    limpezaNavegador.caches === 0 && limpezaNavegador.registros === 0,
    `caches restantes: ${limpezaNavegador.caches}; service workers registrados: ${limpezaNavegador.registros}`,
  );
}

async function principal() {
  fs.mkdirSync(SAIDA, { recursive: true });
  console.log(`[audit:pwa] front ${BASE}, API ${API}, Chrome ${CHROME}`);

  let browser;
  let restos = null;
  try {
    // Sem a fixture não há o material marcador: a auditoria para aqui (com exit 1 abaixo).
    const fixture = prepararFixture();
    console.log(`[audit:pwa] fixture preparada: ${JSON.stringify(fixture)}`);

    browser = await puppeteer.launch({ executablePath: CHROME, headless: true });
    // Contexto isolado: começa sem cache nem SW e é descartado no fim.
    const contexto = await browser.createBrowserContext();
    try {
      await roteiro(browser, contexto);
    } finally {
      await contexto.close().catch(() => {});
    }
  } catch (erro) {
    conferir('execução', false, erro.stack ?? String(erro));
  } finally {
    if (browser) await browser.close().catch(() => {});
    restos = limparFixture();
  }

  relatarLimpeza(restos);
  const falhas = resultados.filter((r) => !r.ok).length;
  fs.writeFileSync(path.join(SAIDA, 'pwa-relatorio.json'), JSON.stringify(resultados, null, 2));
  console.log(`conferencias: ${resultados.length - falhas}/${resultados.length} ok, falhas: ${falhas}`);
  return falhas === 0 && restos === 0 ? 0 : 1;
}

principal()
  .then((codigo) => process.exit(codigo))
  .catch((erro) => {
    console.error(`[audit:pwa] erro: ${erro.stack ?? erro}`);
    relatarLimpeza(limparFixture());
    process.exit(1);
  });
