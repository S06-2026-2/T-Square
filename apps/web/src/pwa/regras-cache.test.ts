/**
 * @jest-environment node
 */
import {
  CABECALHO_DO_CACHE,
  CABECALHO_RECEBIDO_EM,
  criarPluginRecebimento,
  ehRequisicaoDeDados,
  MAX_ENTRADAS,
  NOME_CACHE_API,
  origensApi,
  SETE_DIAS_SEGUNDOS,
  TIMEOUT_REDE_SEGUNDOS,
} from './regras-cache';

const API = 'http://localhost:3000';
const PAGINA = 'http://localhost:4173';
const ORIGENS = [PAGINA, API];

function pedido(metodo: string, endereco: string) {
  const url = new URL(endereco);
  return { request: new Request(url, { method: metodo }), url };
}

const AGORA = Date.UTC(2026, 10, 9, 12, 0, 0);
const SETE_DIAS_MS = 7 * 24 * 60 * 60 * 1000;
const plugin = criarPluginRecebimento(() => AGORA);

// Os callbacks do Workbox recebem mais campos; os testes só usam os que as regras leem.
type Args = Parameters<NonNullable<typeof plugin.cacheWillUpdate>>[0];
type ArgsUso = Parameters<NonNullable<typeof plugin.cachedResponseWillBeUsed>>[0];
const gravar = (response: Response) => plugin.cacheWillUpdate!({ response } as Args);
const usar = (cachedResponse: Response | undefined) =>
  plugin.cachedResponseWillBeUsed!({ cachedResponse } as ArgsUso);

function emCache(corpo: string, recebidoEm?: number | string) {
  const headers = new Headers({ 'Content-Type': 'application/json' });
  if (recebidoEm !== undefined) headers.set(CABECALHO_RECEBIDO_EM, String(recebidoEm));
  return new Response(corpo, { status: 200, headers });
}

describe('constantes do cache de dados', () => {
  it('nome api-dados, 5 s, 200 entradas e 7 dias (OFF-03, OFF-10, OFF-14)', () => {
    expect(NOME_CACHE_API).toBe('api-dados');
    expect(TIMEOUT_REDE_SEGUNDOS).toBe(5);
    expect(MAX_ENTRADAS).toBe(200);
    expect(SETE_DIAS_SEGUNDOS).toBe(604_800);
  });
});

describe('ehRequisicaoDeDados (OFF-02, OFF-09)', () => {
  it.each([
    ['GET /api/obras da API', 'GET', `${API}/api/obras`],
    ['GET com query string', 'GET', `${API}/api/obras?status=ANDAMENTO`],
    ['GET /api/** na própria origem', 'GET', `${PAGINA}/api/estoque/materiais`],
  ])('%s: entra no cache', (_caso, metodo, endereco) => {
    expect(ehRequisicaoDeDados(pedido(metodo, endereco), ORIGENS)).toBe(true);
  });

  it.each([
    ['POST', 'POST', `${API}/api/gesseiros/g1/lancamentos`],
    ['PATCH', 'PATCH', `${API}/api/obras/o1`],
    ['PUT', 'PUT', `${API}/api/obras/o1`],
    ['DELETE', 'DELETE', `${API}/api/gesseiros/g1`],
    ['GET /api/auth/login', 'GET', `${API}/api/auth/login`],
    ['GET /api/auth/qualquer', 'GET', `${API}/api/auth/perfil`],
    ['outra origem', 'GET', 'https://outra.exemplo.com/api/obras'],
    ['arquivo do app', 'GET', `${PAGINA}/assets/index-abc.js`],
    ['navegação', 'GET', `${PAGINA}/estoque`],
  ])('%s: fica fora do cache', (_caso, metodo, endereco) => {
    expect(ehRequisicaoDeDados(pedido(metodo, endereco), ORIGENS)).toBe(false);
  });
});

describe('cacheWillUpdate: só 200 é gravado, com a data de recebimento (OFF-09, OFF-10)', () => {
  it('200: cópia com X-Recebido-Em igual a agora, mesmo status e mesmo corpo', async () => {
    const resposta = new Response('{"id":1}', {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });

    const gravada = await gravar(resposta);

    expect(gravada).not.toBeNull();
    expect(gravada!.status).toBe(200);
    expect(gravada!.headers.get(CABECALHO_RECEBIDO_EM)).toBe(String(AGORA));
    expect(gravada!.headers.get('Content-Type')).toBe('application/json');
    expect(await gravada!.text()).toBe('{"id":1}');
  });

  it.each([201, 204, 304, 400, 401, 403, 404, 409, 422, 500, 503])(
    '%i: não grava (null)',
    async (status) => {
      const corpo = status === 204 || status === 304 ? null : '{}';
      expect(await gravar(new Response(corpo, { status }))).toBeNull();
    },
  );
});

describe('cachedResponseWillBeUsed: 7 dias e X-From-Cache (OFF-04, OFF-10)', () => {
  it('recebida há exatamente 7 dias: entrega com X-From-Cache: 1 e o corpo intacto', async () => {
    const usada = await usar(emCache('[1,2]', AGORA - SETE_DIAS_MS));

    expect(usada).not.toBeNull();
    expect(usada!.headers.get(CABECALHO_DO_CACHE)).toBe('1');
    expect(usada!.headers.get(CABECALHO_RECEBIDO_EM)).toBe(String(AGORA - SETE_DIAS_MS));
    expect(await usada!.text()).toBe('[1,2]');
  });

  it('recebida há 7 dias + 1 ms: descartada (null)', async () => {
    expect(await usar(emCache('[]', AGORA - SETE_DIAS_MS - 1))).toBeNull();
  });

  it('sem X-Recebido-Em ou com valor inválido: descartada', async () => {
    expect(await usar(emCache('[]'))).toBeNull();
    expect(await usar(emCache('[]', 'ontem'))).toBeNull();
  });

  it('sem resposta em cache: null', async () => {
    expect(await usar(undefined)).toBeNull();
  });

  it('o que foi gravado agora é usado agora: ida e volta pelo plugin', async () => {
    const gravada = await gravar(new Response('{"ok":true}', { status: 200 }));
    const usada = await usar(gravada!);

    expect(usada!.headers.get(CABECALHO_DO_CACHE)).toBe('1');
    expect(await usada!.json()).toEqual({ ok: true });
  });
});

describe('origensApi', () => {
  it('página e API em origens diferentes: as duas, sem caminho', () => {
    expect(origensApi('http://localhost:3000/', PAGINA)).toEqual([PAGINA, API]);
    expect(origensApi('https://gesso-api.onrender.com/base', 'https://gesso.vercel.app/')).toEqual([
      'https://gesso.vercel.app',
      'https://gesso-api.onrender.com',
    ]);
  });

  it('sem VITE_API_URL, ou igual à própria: só a própria', () => {
    expect(origensApi(undefined, PAGINA)).toEqual([PAGINA]);
    expect(origensApi(`${PAGINA}/api`, `${PAGINA}/`)).toEqual([PAGINA]);
  });
});
