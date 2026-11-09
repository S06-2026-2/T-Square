/**
 * Cliente HTTP unico do projeto.
 * Todas as chamadas a API passam por aqui, entao o token JWT
 * e o tratamento de erro ficam em um lugar so.
 */
import { BASE_URL } from './config';
import { registrarOrigem } from './conexao';
import { encerrarSessao } from './sessao';

const TOKEN_KEY = 'gesso.token';
const USER_KEY = 'gesso.usuario';

export const auth = {
  getToken: () => localStorage.getItem(TOKEN_KEY),
  setToken: (token: string) => localStorage.setItem(TOKEN_KEY, token),
  getUsuario: () => {
    const bruto = localStorage.getItem(USER_KEY);
    return bruto ? JSON.parse(bruto) : null;
  },
  setUsuario: (usuario: unknown) => localStorage.setItem(USER_KEY, JSON.stringify(usuario)),
  logout: () => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  },
  estaLogado: () => Boolean(localStorage.getItem(TOKEN_KEY)),
};

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    /** Código de máquina do corpo de erro, quando a API manda (ex.: 'EM_PROCESSAMENTO'). */
    public readonly codigo?: string,
  ) {
    super(message);
  }
}

/** Falha de rede (`fetch` rejeitou, inclusive o SW sem cópia): status 0, mensagem por método. */
export const SEM_CONEXAO_LEITURA = 'Sem conexão e sem dados salvos desta tela neste aparelho.';
export const SEM_CONEXAO_ENVIO =
  'Sem conexão: não foi possível confirmar o envio. Tente de novo; o mesmo lançamento não será duplicado.';

async function request<T>(caminho: string, options: RequestInit = {}): Promise<T> {
  const token = auth.getToken();
  const metodo = (options.method ?? 'GET').toUpperCase();

  let resposta: Response;
  try {
    resposta = await fetch(`${BASE_URL}/api${caminho}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...options.headers,
      },
    });
  } catch (e) {
    // Só a rejeição do fetch é falha de rede (OFF-05, OFF-08, OFF-13). Uma resposta HTTP de erro
    // (4xx/5xx) segue abaixo com a mensagem da API, como antes.
    if (e instanceof TypeError) {
      throw new ApiError(metodo === 'GET' ? SEM_CONEXAO_LEITURA : SEM_CONEXAO_ENVIO, 0);
    }
    throw e;
  }

  if (resposta.status === 401) {
    await encerrarSessao();
    throw new ApiError('Sessao expirada. Faca login novamente.', 401);
  }

  if (!resposta.ok) {
    const corpo = await resposta.json().catch(() => ({}));
    const mensagem = Array.isArray(corpo.message) ? corpo.message.join(', ') : corpo.message;
    const codigo = typeof corpo.codigo === 'string' ? corpo.codigo : undefined;
    throw new ApiError(mensagem ?? 'Erro ao comunicar com a API', resposta.status, codigo);
  }

  if (metodo === 'GET' && resposta.status === 200) {
    registrarOrigem(resposta.headers.get('X-From-Cache') === '1' ? 'cache' : 'rede');
  }

  if (resposta.status === 204) {
    return undefined as T;
  }

  return resposta.json() as Promise<T>;
}

export const api = {
  get: <T>(caminho: string) => request<T>(caminho),
  post: <T>(caminho: string, corpo?: unknown, opcoes: { idempotencyKey?: string } = {}) =>
    request<T>(caminho, {
      method: 'POST',
      body: JSON.stringify(corpo ?? {}),
      headers: opcoes.idempotencyKey ? { 'Idempotency-Key': opcoes.idempotencyKey } : undefined,
    }),
  patch: <T>(caminho: string, corpo?: unknown) =>
    request<T>(caminho, { method: 'PATCH', body: JSON.stringify(corpo ?? {}) }),
  put: <T>(caminho: string, corpo?: unknown) =>
    request<T>(caminho, { method: 'PUT', body: JSON.stringify(corpo ?? {}) }),
  delete: <T>(caminho: string) => request<T>(caminho, { method: 'DELETE' }),
};
