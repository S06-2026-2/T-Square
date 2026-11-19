// Auditoria de responsividade (spec pwa-instalavel-responsivo, RSP-01..RSP-10).
//
// Percorre 15 telas/estados em 6 larguras com o UA do Safari da Apple (90 combinações) e, de novo,
// 14 estados em 1024/1366 com o Chrome de desktop sem toque (28), num total de 118, e mede o layout.
// Sai com código 1 se qualquer medida falhar, se algum estado não montar (NAO_MONTADO) ou se
// sobrar dado "[audit]" no banco. Não existe estado "pulado".
//
// Edge Cases: o primeiro material, obra e gesseiro de cada lista chegam com um nome de 120
// caracteres (troca na resposta do GET, na página; nada vai ao banco) e precisam quebrar a linha
// em 320px; no fim, a troca de largura 1366 -> 390 com um formulário preenchido não pode recarregar
// a página nem perder o que foi digitado. O iPad (1024/1366) tem toque, e o RSP-07 vale também
// para `pointer: coarse`.
//
// Pré-requisitos: o front servido em AUDIT_BASE_URL (padrão: `vite preview`, porta 4173) e a API
// no Docker (container gesso_api), que roda a fixture dos alertas:
//   docker exec gesso_api node scripts/fixture-auditoria.mjs preparar|limpar|contar
// Não rodar durante uma análise real do agente nem perto de uma demonstração.
//
// Variáveis: AUDIT_BASE_URL, AUDIT_API_URL (padrão http://localhost:3000), CHROME_PATH,
// AUDIT_API_CONTAINER (padrão gesso_api). Screenshots e relatorio.json vão para apps/web/.audit/.
//
// "Instalar app" (RSP-08, PWA-10): o headless nunca dispara beforeinstallprompt, então o botão só
// existe no modo 'ios'. Por isso cada largura usa o UA do Safari de um aparelho Apple real
// (iPhone até 768px, iPad em 1024/1366): o botão aparece em toda página logada e é medido.
// A passada "chrome" em 1024/1366 mede o desktop com mouse como ele é no Chrome (sem o botão, que
// lá só aparece com beforeinstallprompt): nela o botão não é exigido e o estado da instrução não roda.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import puppeteer from 'puppeteer-core';

import { limparFixture, prepararFixture, relatarLimpeza } from './fixture-cliente.mjs';

const BASE = (process.env.AUDIT_BASE_URL ?? 'http://localhost:4173').replace(/\/$/, '');
const API = (process.env.AUDIT_API_URL ?? 'http://localhost:3000').replace(/\/$/, '');
const CHROME = process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const SAIDA = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '.audit');
const ESPERA_MONTAGEM = 5000;

const UA_IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
const UA_IPAD =
  'Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';

const LARGURAS = [
  { largura: 320, altura: 640, toque: true, escala: 2, ua: UA_IPHONE },
  { largura: 360, altura: 780, toque: true, escala: 2, ua: UA_IPHONE },
  { largura: 390, altura: 844, toque: true, escala: 2, ua: UA_IPHONE },
  { largura: 768, altura: 1024, toque: true, escala: 1, ua: UA_IPHONE },
  // iPad: tela de toque (pointer: coarse, mede o RSP-07 acima de 900px), sem o modo celular.
  { largura: 1024, altura: 768, toque: true, movel: false, escala: 1, ua: UA_IPAD },
  { largura: 1366, altura: 768, toque: true, movel: false, escala: 1, ua: UA_IPAD },
  // Chrome de desktop, sem toque e sem trocar o UA (RSP-05 com mouse).
  { largura: 1024, altura: 768, toque: false, escala: 1, ua: null, rotulo: '1024-chrome' },
  { largura: 1366, altura: 768, toque: false, escala: 1, ua: null, rotulo: '1366-chrome' },
];

/** Estados medidos numa largura: a instrução de instalação só existe com o UA da Apple. */
const estadosDa = (v) => ESTADOS.filter((e) => v.ua || !e.precisaInstalar);
const nomeDa = (v) => v.rotulo ?? String(v.largura);

// A fixture (trava de banco local, limpeza no fim e em SIGINT/SIGTERM) fica em fixture-cliente.mjs,
// compartilhada com a audit-pwa.mjs.

// ---------------------------------------------------------------- helpers de página

const pausa = (ms) => new Promise((r) => setTimeout(r, ms));

/** Espera até 5 s uma condição no navegador; false se não acontecer. */
async function esperar(page, condicao, ...args) {
  try {
    await page.waitForFunction(condicao, { timeout: ESPERA_MONTAGEM, polling: 100 }, ...args);
    return true;
  } catch {
    return false;
  }
}

/** Clica no primeiro elemento `seletor` cujo texto ou aria-label contém `texto`. */
async function clicar(page, seletor, texto) {
  return page.evaluate(
    (seletor, texto) => {
      const el = [...document.querySelectorAll(seletor)].find(
        (e) => e.textContent.includes(texto) || (e.getAttribute('aria-label') ?? '').includes(texto),
      );
      if (!el) return false;
      el.click();
      return true;
    },
    seletor,
    texto,
  );
}

// Edge Case "nome longo (até 120 caracteres)": o primeiro material, a primeira obra e o primeiro
// gesseiro de cada lista chegam à tela com um nome de 120 caracteres. A troca é feita na resposta
// do GET dentro da página (fetch embrulhado), sem gravar nada no banco.
const NOME_LONGO = (
  'Residencial Jardim das Acácias bloco B apartamento 1204 forro de gesso acartonado ' +
  'com sanca invertida e iluminação embutida na sala'
).slice(0, 120);
if (NOME_LONGO.length !== 120) throw new Error(`NOME_LONGO com ${NOME_LONGO.length} caracteres`);

function embrulharFetchComNomeLongo(nome) {
  const original = window.fetch.bind(window);
  const campos = { '/api/estoque/materiais': 'nome', '/api/obras': 'titulo', '/api/gesseiros': 'nome' };
  window.fetch = async (entrada, opcoes) => {
    const resposta = await original(entrada, opcoes);
    try {
      const url = new URL(typeof entrada === 'string' ? entrada : entrada.url, location.href);
      const metodo = (opcoes?.method ?? (typeof entrada === 'string' ? 'GET' : entrada.method)).toUpperCase();
      const campo = campos[url.pathname];
      if (!campo || metodo !== 'GET' || resposta.status !== 200) return resposta;
      const dados = await resposta.clone().json();
      if (!Array.isArray(dados) || dados.length === 0) return resposta;
      dados[0] = { ...dados[0], [campo]: nome };
      return new Response(JSON.stringify(dados), {
        status: resposta.status,
        statusText: resposta.statusText,
        headers: resposta.headers,
      });
    } catch {
      return resposta;
    }
  };
}

/** Edge Case: o nome longo quebra a linha dentro do card/célula (2+ linhas) e não passa da tela. */
function medirNomeLongo(seletor, nome, largura) {
  const el = [...document.querySelectorAll(seletor)].find((e) => e.textContent.includes(nome));
  if (!el) return `nome de 120 caracteres não encontrado em ${seletor}`;
  const faixa = document.createRange();
  faixa.selectNodeContents(el);
  const linhas = new Set([...faixa.getClientRects()].filter((r) => r.width > 0).map((r) => Math.round(r.top))).size;
  const r = el.getBoundingClientRect();
  const noScrollDaTabela = Boolean(el.closest('.tabela-wrap'));
  if (linhas < 2) return `nome de 120 caracteres em ${seletor} numa linha só (${Math.round(r.width)}px)`;
  if (!noScrollDaTabela && r.right > largura + 0.5) return `nome em ${seletor} vai até x=${Math.round(r.right)} (largura ${largura})`;
  return null;
}

// Funções avaliadas no navegador (sem closures).
function visivelComTexto(seletor, texto) {
  return [...document.querySelectorAll(seletor)].some((el) => {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && (!texto || el.textContent.includes(texto));
  });
}

function botaoInstalarVisivel() {
  const b = document.querySelector('.btn-instalar');
  if (!b) return false;
  const r = b.getBoundingClientRect();
  return r.width > 0 && r.height > 0;
}

function formularioAberto() {
  const f = document.querySelector('.conteudo form.formulario');
  return Boolean(f && f.getBoundingClientRect().height > 0);
}

// ---------------------------------------------------------------- estados

const ALERTA = '[audit] Alerta ativo';
const INSTRUCAO_IOS = 'Toque em Compartilhar e depois em Adicionar à Tela de Início';
const SILENCIADO = '[audit] Silenciado';

/**
 * Cada estado: rota, se precisa de login, a ação que o monta e a conferência de que montou.
 * `montar(page, ctx)` devolve true quando o estado está de fato na tela.
 */
const ESTADOS = [
  {
    id: 'login',
    rota: '/login',
    logado: false,
    montar: (p) => esperar(p, visivelComTexto, '.login-card input', ''),
  },
  {
    // PWA-10: instrução do Safari do iOS aberta pelo "Instalar app" (só abre; nada a enviar).
    id: 'instalar-instrucao',
    rota: '/obras',
    precisaInstalar: true,
    montar: async (p) => {
      if (!(await esperar(p, botaoInstalarVisivel))) return false;
      await p.evaluate(() => document.querySelector('.btn-instalar').click());
      return esperar(p, visivelComTexto, '#instrucao-instalar', INSTRUCAO_IOS);
    },
  },
  {
    id: 'dashboard',
    rota: '/dashboard',
    precisaFixture: true,
    montar: (p) =>
      esperar(
        p,
        (alerta) =>
          document.querySelectorAll('.grade-resumo .card-resumo').length > 0 &&
          [...document.querySelectorAll('.lista-alertas .card-alerta h4')].some((h) =>
            h.textContent.includes(alerta),
          ),
        ALERTA,
      ),
  },
  {
    id: 'dashboard-silenciados',
    rota: '/dashboard',
    precisaFixture: true,
    montar: async (p) => {
      if (!(await esperar(p, visivelComTexto, '.acoes-secao .btn-icone', ''))) return false;
      await clicar(p, '.acoes-secao .btn-icone', 'Ver silenciados');
      return esperar(p, visivelComTexto, '#painel-silenciados', SILENCIADO);
    },
  },
  {
    id: 'dashboard-justificativa',
    rota: '/dashboard',
    precisaFixture: true,
    montar: async (p) => {
      const achou = await esperar(
        p,
        (alerta) =>
          [...document.querySelectorAll('.card-alerta')].some((c) =>
            c.querySelector('h4')?.textContent.includes(alerta),
          ),
        ALERTA,
      );
      if (!achou) return false;
      await p.evaluate((alerta) => {
        const card = [...document.querySelectorAll('.card-alerta')].find((c) =>
          c.querySelector('h4')?.textContent.includes(alerta),
        );
        card.querySelector('.btn-detalhes').click();
      }, ALERTA);
      return esperar(
        p,
        (alerta) =>
          [...document.querySelectorAll('.card-alerta')].some(
            (c) =>
              c.querySelector('h4')?.textContent.includes(alerta) &&
              c.querySelector('.justificativa')?.getBoundingClientRect().height > 0,
          ),
        ALERTA,
      );
    },
  },
  {
    id: 'obras',
    rota: '/obras',
    nomeLongo: '.card-obra h2',
    montar: (p) => esperar(p, visivelComTexto, '.grade .card-obra', ''),
  },
  {
    id: 'obras-form',
    rota: '/obras',
    montar: async (p) => {
      if (!(await esperar(p, visivelComTexto, '.cabecalho-pagina .btn', 'Nova obra'))) return false;
      await clicar(p, '.cabecalho-pagina .btn', 'Nova obra');
      return esperar(p, formularioAberto);
    },
  },
  {
    id: 'obras-detalhes',
    rota: '/obras',
    montar: async (p) => {
      if (!(await esperar(p, visivelComTexto, '.card-obra details', ''))) return false;
      await p.evaluate(() =>
        document.querySelectorAll('.card-obra details').forEach((d) => (d.open = true)),
      );
      // Todos abertos e o conteúdo carregado (os previstos buscam na API ao abrir).
      return esperar(
        p,
        () =>
          [...document.querySelectorAll('.card-obra details')].every((d) => d.open) &&
          document.querySelectorAll('.card-obra details[open] .form-card').length > 0 &&
          document.querySelectorAll('.card-obra details[open] .carregando').length === 0,
      );
    },
  },
  {
    id: 'gesseiros',
    rota: '/gesseiros',
    nomeLongo: '.lista-pessoas .btn-texto',
    montar: (p) => esperar(p, visivelComTexto, '.lista-pessoas li', ''),
  },
  {
    id: 'gesseiros-extrato',
    rota: '/gesseiros',
    extrato: true,
    montar: async (p) => {
      if (!(await esperar(p, visivelComTexto, '.lista-pessoas .btn-texto', ''))) return false;
      await p.click('.lista-pessoas .btn-texto');
      return esperar(p, () => {
        const h2 = document.querySelector('.duas-colunas > .card h2');
        return Boolean(h2 && h2.getBoundingClientRect().height > 0);
      });
    },
  },
  {
    id: 'gesseiros-form',
    rota: '/gesseiros',
    montar: async (p) => {
      if (!(await esperar(p, visivelComTexto, '.cabecalho-pagina .btn', 'Novo gesseiro')))
        return false;
      await clicar(p, '.cabecalho-pagina .btn', 'Novo gesseiro');
      return esperar(p, formularioAberto);
    },
  },
  {
    id: 'estoque',
    rota: '/estoque',
    nomeLongo: '.tabela-wrap tbody td',
    montar: (p) => esperar(p, visivelComTexto, '.tabela-wrap tbody tr', ''),
  },
  {
    id: 'estoque-mov',
    rota: '/estoque',
    montar: async (p) => {
      if (!(await esperar(p, visivelComTexto, '.tabela-wrap tbody tr', ''))) return false;
      await clicar(p, '.cabecalho-pagina .btn', 'Registrar entrada/saida');
      return esperar(p, formularioAberto);
    },
  },
  {
    id: 'estoque-material',
    rota: '/estoque',
    montar: async (p) => {
      if (!(await esperar(p, visivelComTexto, '.tabela-wrap tbody tr', ''))) return false;
      await clicar(p, '.cabecalho-pagina .btn', 'Novo material');
      return esperar(p, formularioAberto);
    },
  },
  {
    // Aberto pelo "Resolver" do alerta [audit] no dashboard. Só abre: nunca salva, para o alerta
    // não ser resolvido.
    id: 'estoque-resolver',
    rota: '/dashboard',
    precisaFixture: true,
    montar: async (p, ctx) => {
      const achou = await esperar(
        p,
        (alerta) =>
          [...document.querySelectorAll('.card-alerta')].some((c) =>
            c.querySelector('h4')?.textContent.includes(alerta),
          ),
        ALERTA,
      );
      if (!achou) return false;
      await p.evaluate((alerta) => {
        const card = [...document.querySelectorAll('.card-alerta')].find((c) =>
          c.querySelector('h4')?.textContent.includes(alerta),
        );
        [...card.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Resolver').click();
      }, ALERTA);
      const esperado = { alerta: ctx.fixture.alertaId, material: ctx.fixture.materialId };
      return esperar(
        p,
        (esperado, alerta) => {
          const q = new URLSearchParams(location.search);
          return (
            location.pathname === '/estoque' &&
            q.get('alerta') === esperado.alerta &&
            q.get('material') === esperado.material &&
            q.get('quantidade') !== null &&
            [...document.querySelectorAll('[data-testid="aviso-alerta"]')].some(
              (el) => el.getBoundingClientRect().height > 0 && el.textContent.includes(alerta),
            ) &&
            Boolean(document.querySelector('.conteudo form.formulario'))
          );
        },
        esperado,
        ALERTA,
      );
    },
  },
];

// ---------------------------------------------------------------- medidas (no navegador)

/** RSP-10: depois de selecionar um gesseiro, o card do extrato fica no topo da viewport. */
function medirExtrato() {
  const card = document.querySelector('.duas-colunas > .card');
  const topo = document.querySelector('.sidebar');
  const cs = topo ? getComputedStyle(topo) : null;
  const topoFixo = cs && (cs.position === 'sticky' || cs.position === 'fixed');
  const alturaTopo = topoFixo ? topo.getBoundingClientRect().bottom : 0;
  const y = Math.round(card.getBoundingClientRect().top);
  // Visível logo abaixo do topo fixo (até 24px de folga), nunca escondido atrás dele.
  const ok = y >= Math.floor(alturaTopo) - 1 && y <= alturaTopo + 24;
  return ok ? null : `card do extrato em y=${y}, esperado entre ${Math.round(alturaTopo)} e ${Math.round(alturaTopo + 24)} (viewport ${innerHeight}px)`;
}

async function medir(page, logado, largura) {
  return page.evaluate(async (logado, largura) => {
    const falhas = [];
    const falha = (req, msg) => falhas.push(`${req}: ${msg}`);
    // Referência horizontal = largura emulada do aparelho. Com isMobile, o Chrome alarga a
    // viewport de layout até caber o conteúdo, e innerWidth cresce junto com o transbordo
    // (fica igual ao scrollWidth com a página transbordando). Por isso o RSP-01 exige
    // scrollWidth == innerWidth == largura emulada.
    const vw = largura;
    const vh = window.innerHeight;
    const mobile = window.matchMedia('(max-width: 900px)').matches;
    const tolerancia = 0.5;

    const visivel = (el) => {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) return false;
      const cs = getComputedStyle(el);
      return cs.visibility !== 'hidden' && cs.display !== 'none';
    };
    const desc = (el) => {
      const classe = typeof el.className === 'string' && el.className.trim()
        ? '.' + el.className.trim().split(/\s+/).join('.')
        : '';
      const texto = (el.getAttribute('aria-label') || el.textContent || '').trim().replace(/\s+/g, ' ');
      return `${el.tagName.toLowerCase()}${classe} "${texto.slice(0, 24)}"`;
    };
    const dentroDeRolagem = (el) => {
      for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) {
        if (/(auto|scroll|hidden|clip)/.test(getComputedStyle(a).overflowX)) return true;
      }
      return false;
    };
    const frame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

    // Área de safe-area-inset-top/bottom (0 no headless, mas medida de verdade).
    const sonda = document.createElement('div');
    sonda.style.cssText =
      'position:fixed;visibility:hidden;padding-top:env(safe-area-inset-top);padding-bottom:env(safe-area-inset-bottom)';
    document.body.appendChild(sonda);
    const safeTop = parseFloat(getComputedStyle(sonda).paddingTop) || 0;
    sonda.remove();

    // RSP-01: a página não transborda na horizontal.
    const sw = document.documentElement.scrollWidth;
    if (sw !== vw || window.innerWidth !== vw) {
      const culpados = [...document.querySelectorAll('body *')]
        .filter((el) => {
          const r = el.getBoundingClientRect();
          return r.width > 0 && (r.right > vw + 1 || r.left < -1) && !dentroDeRolagem(el);
        })
        .slice(0, 3)
        .map((el) => `${desc(el)} [${Math.round(el.getBoundingClientRect().right)}]`);
      falha('RSP-01', `scrollWidth ${sw}, innerWidth ${window.innerWidth}, largura ${vw}${culpados.length ? ' (' + culpados.join('; ') + ')' : ''}`);
    }

    // RSP-02: a tabela rola dentro de .tabela-wrap, sem alargar a página.
    for (const wrap of [...document.querySelectorAll('.tabela-wrap')].filter(visivel)) {
      const r = wrap.getBoundingClientRect();
      const rola = /(auto|scroll)/.test(getComputedStyle(wrap).overflowX);
      if (!rola) falha('RSP-02', `.tabela-wrap sem overflow-x auto`);
      else if (r.right > vw + tolerancia || r.left < -tolerancia)
        falha('RSP-02', `.tabela-wrap vai de ${Math.round(r.left)} a ${Math.round(r.right)} (viewport ${vw})`);
    }

    // PWA-10: a instrução aberta cabe inteira na largura da tela.
    const instrucao = document.querySelector('#instrucao-instalar');
    if (instrucao && visivel(instrucao)) {
      const r = instrucao.getBoundingClientRect();
      if (r.left < -tolerancia || r.right > vw + tolerancia || r.top < -tolerancia)
        falha('PWA-10', `instrução vai de x=${Math.round(r.left)} a ${Math.round(r.right)}, y=${Math.round(r.top)} (viewport ${vw})`);
    }

    if (logado) {
      const sidebar = document.querySelector('.sidebar');
      const nav = document.querySelector('.nav');
      const links = [...document.querySelectorAll('.nav .nav-link')].filter(visivel);
      const rotulos = links.map((l) => l.innerText.trim());
      const ativos = links.filter((l) => l.classList.contains('ativo'));
      const ativoCerto = ativos.length === 1 && new URL(ativos[0].href).pathname === location.pathname;

      if (mobile) {
        // RSP-03: barra inferior fixa com as 4 abas e rótulo curto, aba atual destacada.
        const curtos = ['Geral', 'Obras', 'Equipe', 'Estoque'];
        const rn = nav.getBoundingClientRect();
        if (getComputedStyle(nav).position !== 'fixed') falha('RSP-03', `.nav com position ${getComputedStyle(nav).position}, esperado fixed`);
        else if (rn.bottom < vh - 1) falha('RSP-03', `.nav termina em ${Math.round(rn.bottom)}, não no fim da viewport (${vh})`);
        if (links.length !== 4) falha('RSP-03', `${links.length} abas visíveis, esperado 4`);
        if (rotulos.join('|') !== curtos.join('|')) falha('RSP-03', `rótulos [${rotulos.join(', ')}], esperado [${curtos.join(', ')}]`);
        if (!ativoCerto) falha('RSP-03', `aba ativa não corresponde a ${location.pathname}`);

        // RSP-04: topo com no máximo 64px (fora a safe area).
        const alturaTopo = sidebar.getBoundingClientRect().height - safeTop;
        if (alturaTopo > 64 + tolerancia) falha('RSP-04', `topo com ${Math.round(alturaTopo)}px, máximo 64`);

        // RSP-06: no fim da rolagem, o último elemento do conteúdo fica acima da barra.
        const scrollAntes = window.scrollY;
        window.scrollTo(0, document.documentElement.scrollHeight);
        await frame();
        const ultimo = document.querySelector('.conteudo')?.lastElementChild;
        if (ultimo && getComputedStyle(nav).position === 'fixed') {
          const fim = ultimo.getBoundingClientRect().bottom;
          const topoNav = nav.getBoundingClientRect().top;
          if (fim > topoNav + tolerancia) falha('RSP-06', `último elemento termina em ${Math.round(fim)}, a barra começa em ${Math.round(topoNav)}`);
        } else if (ultimo) {
          falha('RSP-06', 'sem barra inferior fixa para conferir o espaço reservado');
        }
        window.scrollTo(0, scrollAntes);
        await frame();
      } else {
        // RSP-05: sidebar lateral com os rótulos atuais.
        const longos = ['Visao geral', 'Obras', 'Gesseiros', 'Estoque'];
        const rs = sidebar.getBoundingClientRect();
        if (rs.left !== 0 || Math.round(rs.width) !== 240 || rs.height < vh - 1)
          falha('RSP-05', `sidebar em x=${Math.round(rs.left)} com ${Math.round(rs.width)}x${Math.round(rs.height)}, esperado lateral 240px de altura total`);
        if (rotulos.join('|') !== longos.join('|')) falha('RSP-05', `rótulos [${rotulos.join(', ')}], esperado [${longos.join(', ')}]`);
        if (!ativoCerto) falha('RSP-05', `aba ativa não corresponde a ${location.pathname}`);
      }
    }

    // RSP-07: campos com pelo menos 16px em ≤ 900px OU em tela de toque (pointer: coarse), que é o
    // caso do iPad em 1024/1366.
    if (mobile || window.matchMedia('(pointer: coarse)').matches) {
      const pequenos = [...document.querySelectorAll('input, select, textarea')]
        .filter((el) => el.type !== 'hidden' && visivel(el))
        .map((el) => parseFloat(getComputedStyle(el).fontSize))
        .filter((t) => t < 16);
      if (pequenos.length) falha('RSP-07', `${pequenos.length} campo(s) com fonte < 16px (${[...new Set(pequenos)].join(', ')}px)`);
    }

    if (mobile) {
      // RSP-08: alvos de toque com pelo menos 44x44.
      const alvos = [
        '.nav-link', '.btn-sair', '.btn-instalar', '.chip', '.btn-detalhes', '.btn-icone',
        '.card-obra summary', '.linha-form .btn-texto',
      ];
      const pequenosAlvo = [...document.querySelectorAll(alvos.join(','))]
        .filter(visivel)
        .filter((el) => {
          const r = el.getBoundingClientRect();
          return r.width < 44 - tolerancia || r.height < 44 - tolerancia;
        });
      if (pequenosAlvo.length) {
        const exemplos = [...new Set(pequenosAlvo.map((el) => {
          const r = el.getBoundingClientRect();
          return `${desc(el)} ${Math.round(r.width)}x${Math.round(r.height)}`;
        }))].slice(0, 3);
        falha('RSP-08', `${pequenosAlvo.length} alvo(s) < 44x44 (${exemplos.join('; ')})`);
      }
    }

    return falhas;
  }, logado, largura);
}

// ---------------------------------------------------------------- execução

async function auditar(browser, login, ctx, relatorio) {
  for (const v of LARGURAS) {
    const page = await browser.newPage();
    await page.setViewport({
      width: v.largura,
      height: v.altura,
      deviceScaleFactor: v.escala,
      isMobile: v.movel ?? v.toque,
      hasTouch: v.toque,
    });
    if (v.ua) {
      await page.setUserAgent(v.ua);
      // Safari não tem `beforeinstallprompt`. Com o app instalável (manifest + SW, L5) o Chrome
      // headless dispara o evento mesmo com o UA da Apple, e o botão iria para o modo 'prompt'.
      // Este listener roda antes do app e engole o evento, como no Safari de verdade.
      await page.evaluateOnNewDocument(() => {
        window.addEventListener('beforeinstallprompt', (e) => e.stopImmediatePropagation(), true);
      });
    }
    await page.evaluateOnNewDocument(embrulharFetchComNomeLongo, NOME_LONGO);

    for (const estado of estadosDa(v)) {
      const chave = `${nomeDa(v)}/${estado.id}`;
      const logado = estado.logado !== false;
      let resultado;
      try {
        await page.goto(`${BASE}/login`, { waitUntil: 'networkidle0', timeout: 30000 });
        await page.evaluate(
          (logado, l) => {
            localStorage.clear();
            if (logado) {
              localStorage.setItem('gesso.token', l.accessToken);
              localStorage.setItem('gesso.usuario', JSON.stringify(l.usuario));
            }
          },
          logado,
          login,
        );
        await page.goto(`${BASE}${estado.rota}`, { waitUntil: 'networkidle0', timeout: 30000 });

        const montado = (!estado.precisaFixture || ctx.fixture) && (await estado.montar(page, ctx));
        // RSP-08/PWA-10: com o UA do Safari da Apple, toda página logada tem o "Instalar app".
        // Sem ele, o alvo de toque não seria medido: o estado não conta como montado.
        const semBotao = montado && logado && Boolean(v.ua) && !(await esperar(page, botaoInstalarVisivel));
        // Edge Case: nas telas de lista, o nome de 120 caracteres tem de estar na tela.
        const semNomeLongo =
          montado && estado.nomeLongo && !(await esperar(page, visivelComTexto, estado.nomeLongo, NOME_LONGO));
        if (!montado || semBotao || semNomeLongo) {
          const motivos = [];
          if (semBotao) motivos.push('botão "Instalar app" (.btn-instalar) ausente na página logada');
          if (semNomeLongo) motivos.push(`nome de 120 caracteres ausente em ${estado.nomeLongo}`);
          resultado = { status: 'NAO_MONTADO', falhas: motivos };
        } else {
          await page.evaluate(() => document.fonts.ready);
          const falhas = [];
          if (estado.extrato && v.largura === 360) {
            await pausa(1200); // rolagem suave até o extrato
            const f = await page.evaluate(medirExtrato);
            if (f) falhas.push(`RSP-10: ${f}`);
          }
          if (estado.nomeLongo && v.largura === 320) {
            const f = await page.evaluate(medirNomeLongo, estado.nomeLongo, NOME_LONGO, v.largura);
            if (f) falhas.push(`Edge Case nome longo: ${f}`);
          }
          falhas.push(...(await medir(page, logado, v.largura)));
          resultado = { status: falhas.length ? 'FALHA' : 'OK', falhas };
        }
        await page.screenshot({ path: path.join(SAIDA, `${nomeDa(v)}-${estado.id}.png`), fullPage: true });
      } catch (erro) {
        resultado = { status: 'NAO_MONTADO', falhas: [`erro: ${erro.message.split('\n')[0]}`] };
      }
      relatorio[chave] = resultado;
      const detalhe = resultado.falhas.length ? `  ${resultado.falhas.join(' | ')}` : '';
      console.log(`${nomeDa(v).padStart(11)}  ${estado.id.padEnd(24)} ${resultado.status}${detalhe}`);
    }
    await page.close();
  }
}

async function principal() {
  fs.mkdirSync(SAIDA, { recursive: true });
  console.log(`[audit] front ${BASE}, API ${API}, Chrome ${CHROME}`);

  const relatorio = {};
  const ctx = { fixture: null };
  let browser;
  let restos = null;
  let troca = { ok: false, detalhe: 'não rodou' };
  try {
    try {
      // Restos de uma execução interrompida à força saem antes de qualquer coisa.
      ctx.fixture = prepararFixture();
      console.log(`[audit] fixture preparada: ${JSON.stringify(ctx.fixture)}`);
    } catch (erro) {
      console.error(`[audit] fixture falhou (os estados do agente ficam NAO_MONTADO): ${erro.message.split('\n')[0]}`);
    }

    const resposta = await fetch(`${API}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@gesso.com', senha: 'admin123' }),
    });
    if (!resposta.ok) throw new Error(`login na API respondeu ${resposta.status}`);
    const login = await resposta.json();

    browser = await puppeteer.launch({ executablePath: CHROME, headless: true });
    await auditar(browser, login, ctx, relatorio);
    troca = await trocaDeLargura(browser, login);
  } finally {
    if (browser) await browser.close().catch(() => {});
    restos = limparFixture();
  }

  const valores = Object.values(relatorio);
  const total = LARGURAS.reduce((n, v) => n + estadosDa(v).length, 0);
  const naoMontados = total - valores.filter((r) => r.status !== 'NAO_MONTADO').length;
  const medidos = total - naoMontados;
  const falhas = valores.filter((r) => r.status === 'FALHA').length;
  fs.writeFileSync(path.join(SAIDA, 'relatorio.json'), JSON.stringify(relatorio, null, 2));

  relatarLimpeza(restos);

  console.log(`troca de largura 1366 -> 390 com formulário preenchido: ${troca.ok ? 'OK' : 'FALHA'} (${troca.detalhe})`);
  console.log(`medidos: ${medidos}/${total}, nao montados: ${naoMontados}, falhas: ${falhas}`);
  return falhas === 0 && naoMontados === 0 && restos === 0 && troca.ok ? 0 : 1;
}

/**
 * Edge Case: a janela passa de > 900px para ≤ 900px (redimensionar, girar o tablet) com um
 * formulário preenchido. A sidebar vira barra inferior sem recarregar a página e sem perder o
 * que foi digitado. Nada é enviado.
 */
async function trocaDeLargura(browser, login) {
  const page = await browser.newPage();
  try {
    await page.setViewport({ width: 1366, height: 768, deviceScaleFactor: 1 });
    await page.goto(`${BASE}/login`, { waitUntil: 'networkidle0', timeout: 30000 });
    await page.evaluate((l) => {
      localStorage.setItem('gesso.token', l.accessToken);
      localStorage.setItem('gesso.usuario', JSON.stringify(l.usuario));
    }, login);
    await page.goto(`${BASE}/gesseiros`, { waitUntil: 'networkidle0', timeout: 30000 });
    if (!(await esperar(page, visivelComTexto, '.cabecalho-pagina .btn', 'Novo gesseiro'))) {
      return { ok: false, detalhe: 'botão "Novo gesseiro" não apareceu' };
    }
    await clicar(page, '.cabecalho-pagina .btn', 'Novo gesseiro');
    if (!(await esperar(page, formularioAberto))) return { ok: false, detalhe: 'formulário não abriu' };
    const digitado = '[audit] troca de largura';
    await page.type('.conteudo form.formulario input', digitado);
    const antes = await page.evaluate(() => {
      window.__semRecarga = true;
      return getComputedStyle(document.querySelector('.nav')).position;
    });

    // Só a largura muda (sem trocar isMobile/hasTouch, que faria o puppeteer recarregar).
    await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 });
    await pausa(300);
    const depois = await page.evaluate(() => {
      const nav = document.querySelector('.nav');
      const campo = document.querySelector('.conteudo form.formulario input');
      return {
        semRecarga: window.__semRecarga === true,
        navFixa: getComputedStyle(nav).position === 'fixed',
        navNoFim: Math.abs(nav.getBoundingClientRect().bottom - innerHeight) <= 1,
        valor: campo ? campo.value : null,
      };
    });
    const ok =
      antes !== 'fixed' && depois.semRecarga && depois.navFixa && depois.navNoFim && depois.valor === digitado;
    await page.screenshot({ path: path.join(SAIDA, 'troca-de-largura.png'), fullPage: true });
    return {
      ok,
      detalhe:
        `nav antes: ${antes}; depois: ${depois.navFixa ? 'fixa' : 'não fixa'}${depois.navNoFim ? ' no fim' : ''}; ` +
        `sem recarregar: ${depois.semRecarga}; campo mantido: ${depois.valor === digitado}`,
    };
  } catch (erro) {
    return { ok: false, detalhe: `erro: ${erro.message.split('\n')[0]}` };
  } finally {
    await page.close();
  }
}

principal()
  .then((codigo) => process.exit(codigo))
  .catch((erro) => {
    console.error(`[audit] erro: ${erro.stack ?? erro}`);
    limparFixture();
    const total = LARGURAS.reduce((n, v) => n + estadosDa(v).length, 0);
    console.log(`medidos: 0/${total}, nao montados: ${total}, falhas: 0`);
    process.exit(1);
  });
