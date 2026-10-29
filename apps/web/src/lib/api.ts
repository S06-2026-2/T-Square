/**
 * Cliente HTTP unico do projeto.
 * Todas as chamadas a API passam por aqui, entao o token JWT
 * e o tratamento de erro ficam em um lugar so.
 */
const BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

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
  ) {
    super(message);
  }
}

async function request<T>(caminho: string, options: RequestInit = {}): Promise<T> {
  const token = auth.getToken();

  const resposta = await fetch(`${BASE_URL}/api${caminho}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });

  if (resposta.status === 401) {
    auth.logout();
    throw new ApiError('Sessao expirada. Faca login novamente.', 401);
  }

  if (!resposta.ok) {
    const corpo = await resposta.json().catch(() => ({}));
    const mensagem = Array.isArray(corpo.message) ? corpo.message.join(', ') : corpo.message;
    throw new ApiError(mensagem ?? 'Erro ao comunicar com a API', resposta.status);
  }

  if (resposta.status === 204) {
    return undefined as T;
  }

  return resposta.json() as Promise<T>;
}

export const api = {
  get: <T>(caminho: string) => request<T>(caminho),
  post: <T>(caminho: string, corpo?: unknown) =>
    request<T>(caminho, { method: 'POST', body: JSON.stringify(corpo ?? {}) }),
  patch: <T>(caminho: string, corpo?: unknown) =>
    request<T>(caminho, { method: 'PATCH', body: JSON.stringify(corpo ?? {}) }),
  put: <T>(caminho: string, corpo?: unknown) =>
    request<T>(caminho, { method: 'PUT', body: JSON.stringify(corpo ?? {}) }),
  delete: <T>(caminho: string) => request<T>(caminho, { method: 'DELETE' }),
};
