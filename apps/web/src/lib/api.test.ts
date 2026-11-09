import { api, ApiError } from './api';
import { registrarOrigem } from './conexao';
import { encerrarSessao } from './sessao';

jest.mock('./config', () => ({ BASE_URL: 'http://api.teste' }));
jest.mock('./conexao', () => ({ registrarOrigem: jest.fn() }));
jest.mock('./sessao', () => ({ encerrarSessao: jest.fn() }));

const origem = registrarOrigem as jest.Mock;
const encerrar = encerrarSessao as jest.Mock;
const fetchMock = jest.fn();

const SEM_DADOS = 'Sem conexão e sem dados salvos desta tela neste aparelho.';
const SEM_ENVIO =
  'Sem conexão: não foi possível confirmar o envio. Tente de novo; o mesmo lançamento não será duplicado.';

/** Resposta HTTP mínima (o jsdom do Jest não tem `Response`). */
function resposta(status: number, corpo: unknown = {}, cabecalhos: Record<string, string> = {}) {
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: { get: (nome: string) => cabecalhos[nome] ?? null },
    json: async () => corpo,
  };
}

/** Executa a chamada e devolve o erro lançado (ou falha se ela resolver). */
async function erroDe(chamada: Promise<unknown>): Promise<ApiError> {
  try {
    await chamada;
  } catch (e) {
    return e as ApiError;
  }
  throw new Error('a chamada deveria ter falhado');
}

function cabecalhosDaChamada(i = 0): Record<string, string> {
  return fetchMock.mock.calls[i][1].headers;
}

beforeAll(() => {
  (globalThis as { fetch?: unknown }).fetch = fetchMock;
});

beforeEach(() => {
  fetchMock.mockReset();
  origem.mockReset();
  encerrar.mockReset();
  encerrar.mockResolvedValue(undefined);
  localStorage.clear();
});

describe('api: falha de rede (fetch rejeita com TypeError) vira status 0', () => {
  it('GET: ApiError status 0 com a mensagem do OFF-05', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));

    const erro = await erroDe(api.get('/estoque/materiais'));

    expect(erro).toBeInstanceOf(ApiError);
    expect(erro.status).toBe(0);
    expect(erro.message).toBe(SEM_DADOS);
    expect(origem).not.toHaveBeenCalled();
  });

  it.each([
    ['POST', () => api.post('/gesseiros', { nome: 'Joao' })],
    ['PATCH', () => api.patch('/obras/o1', { titulo: 'x' })],
    ['PUT', () => api.put('/obras/o1/pagamento', { forma: 'PIX' })],
    ['DELETE', () => api.delete('/estoque/agente/silenciados/m1')],
  ])('%s: ApiError status 0 com a mensagem do OFF-08', async (metodo, chamar) => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));

    const erro = await erroDe(chamar());

    expect(fetchMock.mock.calls[0][1].method).toBe(metodo);
    expect(erro).toBeInstanceOf(ApiError);
    expect(erro.status).toBe(0);
    expect(erro.message).toBe(SEM_ENVIO);
  });

  it('um erro que não é TypeError não vira falha de rede', async () => {
    const outro = new Error('quebrou');
    fetchMock.mockRejectedValue(outro);

    expect(await erroDe(api.get('/obras'))).toBe(outro);
  });
});

describe('api: codigo do corpo de erro', () => {
  it('409 com codigo EM_PROCESSAMENTO: ApiError leva o código e a mensagem da API', async () => {
    fetchMock.mockResolvedValue(
      resposta(409, { message: 'Este envio ainda está sendo processado.', codigo: 'EM_PROCESSAMENTO' }),
    );

    const erro = await erroDe(api.post('/gesseiros/g1/lancamentos', { valor: 1 }));

    expect(erro).toBeInstanceOf(ApiError);
    expect(erro.status).toBe(409);
    expect(erro.codigo).toBe('EM_PROCESSAMENTO');
    expect(erro.message).toBe('Este envio ainda está sendo processado.');
  });

  it('409 de negócio sem codigo: ApiError sem código', async () => {
    fetchMock.mockResolvedValue(resposta(409, { message: 'Ja existe um material chamado "Placa"' }));

    const erro = await erroDe(api.post('/estoque/materiais', { nome: 'Placa' }));

    expect(erro.status).toBe(409);
    expect(erro.codigo).toBeUndefined();
  });
});

describe('api: resposta HTTP de erro mantém a mensagem da API', () => {
  it.each([
    [400, { message: ['valor must not be less than 0', 'tipo must be a valid enum value'] }, 'valor must not be less than 0, tipo must be a valid enum value'],
    [409, { message: 'Este envio ainda está em processamento' }, 'Este envio ainda está em processamento'],
    [422, { message: 'Idempotency-Key reutilizada com outro corpo' }, 'Idempotency-Key reutilizada com outro corpo'],
    [500, {}, 'Erro ao comunicar com a API'],
  ])('%i: ApiError com o status e a mensagem da API', async (status, corpo, mensagem) => {
    fetchMock.mockResolvedValue(resposta(status, corpo));

    const erro = await erroDe(api.post('/gesseiros/g1/lancamentos', { valor: 1 }));

    expect(erro).toBeInstanceOf(ApiError);
    expect(erro.status).toBe(status);
    expect(erro.message).toBe(mensagem);
    expect(encerrar).not.toHaveBeenCalled();
  });
});

describe('api: origem dos dados (OFF-04, OFF-06, OFF-07)', () => {
  it('GET 200 com X-From-Cache: 1 registra cache', async () => {
    fetchMock.mockResolvedValue(resposta(200, [{ id: 'o1' }], { 'X-From-Cache': '1' }));

    await expect(api.get('/obras')).resolves.toEqual([{ id: 'o1' }]);
    expect(origem).toHaveBeenCalledTimes(1);
    expect(origem).toHaveBeenCalledWith('cache');
  });

  it('GET 200 sem o cabeçalho registra rede', async () => {
    fetchMock.mockResolvedValue(resposta(200, [{ id: 'o1' }]));

    await api.get('/obras');
    expect(origem).toHaveBeenCalledTimes(1);
    expect(origem).toHaveBeenCalledWith('rede');
  });

  it('escrita com sucesso não registra origem', async () => {
    fetchMock.mockResolvedValue(resposta(201, { id: 'g1' }, { 'X-From-Cache': '1' }));

    await api.post('/gesseiros', { nome: 'Joao' });
    expect(origem).not.toHaveBeenCalled();
  });

  it('GET com erro HTTP não registra origem', async () => {
    fetchMock.mockResolvedValue(resposta(500));

    await erroDe(api.get('/obras'));
    expect(origem).not.toHaveBeenCalled();
  });
});

describe('api: 401 (OFF-11)', () => {
  it('espera encerrarSessao() antes de lançar "Sessao expirada"', async () => {
    let terminar!: () => void;
    encerrar.mockReturnValue(new Promise<void>((resolve) => (terminar = resolve)));
    fetchMock.mockResolvedValue(resposta(401, { message: 'Unauthorized' }));

    let rejeitou = false;
    const chamada = api.get('/obras').catch((e: ApiError) => {
      rejeitou = true;
      return e;
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(encerrar).toHaveBeenCalledTimes(1);
    expect(rejeitou).toBe(false);

    terminar();
    const erro = (await chamada) as ApiError;
    expect(rejeitou).toBe(true);
    expect(erro).toBeInstanceOf(ApiError);
    expect(erro.status).toBe(401);
    expect(erro.message).toBe('Sessao expirada. Faca login novamente.');
  });
});

describe('api: Idempotency-Key (IDP-01)', () => {
  it('post com idempotencyKey manda o cabeçalho, junto com o JSON e o token', async () => {
    localStorage.setItem('gesso.token', 'tok');
    fetchMock.mockResolvedValue(resposta(201, { id: 'l1' }));

    await api.post('/gesseiros/g1/lancamentos', { valor: 10 }, { idempotencyKey: 'k' });

    expect(fetchMock.mock.calls[0][0]).toBe('http://api.teste/api/gesseiros/g1/lancamentos');
    expect(fetchMock.mock.calls[0][1].body).toBe('{"valor":10}');
    expect(cabecalhosDaChamada()).toEqual({
      'Content-Type': 'application/json',
      Authorization: 'Bearer tok',
      'Idempotency-Key': 'k',
    });
  });

  it('post sem a opção não manda o cabeçalho', async () => {
    fetchMock.mockResolvedValue(resposta(201, { id: 'g1' }));

    await api.post('/gesseiros', { nome: 'Joao' });

    expect(cabecalhosDaChamada()).toEqual({ 'Content-Type': 'application/json' });
  });
});
