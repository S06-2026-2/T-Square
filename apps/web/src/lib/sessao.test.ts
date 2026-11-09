import type { LoginResponse } from '../types';
import { auth } from './api';
import { encerrarSessao, iniciarSessao, limparCacheApi, NOME_CACHE_API } from './sessao';

jest.mock('./config', () => ({ BASE_URL: 'http://api.teste' }));

const resposta: LoginResponse = {
  accessToken: 'token-novo',
  usuario: { id: 'u2', nome: 'Bia', email: 'bia@gesso.com', papel: 'ADMIN' },
};

/** Cache Storage falso; `delete` é o que o teste configurar. */
function instalarCaches(deletar: jest.Mock) {
  Object.defineProperty(globalThis, 'caches', {
    value: { delete: deletar },
    configurable: true,
    writable: true,
  });
}

function logarComo(token: string) {
  localStorage.setItem('gesso.token', token);
  localStorage.setItem('gesso.usuario', JSON.stringify({ nome: 'Ana' }));
}

afterEach(() => {
  delete (globalThis as { caches?: unknown }).caches;
  localStorage.clear();
});

describe('sessao', () => {
  it('o cache de dados se chama api-dados', () => {
    expect(NOME_CACHE_API).toBe('api-dados');
  });

  describe('limparCacheApi', () => {
    it('sem Cache Storage no navegador, resolve sem erro', async () => {
      expect(typeof caches).toBe('undefined');
      await expect(limparCacheApi()).resolves.toBeUndefined();
    });

    it('com Cache Storage, apaga o cache api-dados', async () => {
      const deletar = jest.fn().mockResolvedValue(true);
      instalarCaches(deletar);

      await expect(limparCacheApi()).resolves.toBeUndefined();
      expect(deletar).toHaveBeenCalledWith('api-dados');
    });

    it('com caches.delete rejeitando, resolve sem erro', async () => {
      const deletar = jest.fn().mockRejectedValue(new DOMException('negado', 'SecurityError'));
      instalarCaches(deletar);

      await expect(limparCacheApi()).resolves.toBeUndefined();
      expect(deletar).toHaveBeenCalledWith('api-dados');
    });
  });

  describe('encerrarSessao (OFF-11)', () => {
    it.each([
      ['sem Cache Storage', null],
      ['com caches.delete resolvendo', jest.fn().mockResolvedValue(true)],
      ['com caches.delete rejeitando', jest.fn().mockRejectedValue(new Error('quota'))],
    ])('%s: remove token e usuário e não lança', async (_caso, deletar) => {
      if (deletar) instalarCaches(deletar);
      logarComo('token-velho');

      await expect(encerrarSessao()).resolves.toBeUndefined();

      expect(localStorage.getItem('gesso.token')).toBeNull();
      expect(localStorage.getItem('gesso.usuario')).toBeNull();
      expect(auth.estaLogado()).toBe(false);
      if (deletar) expect(deletar).toHaveBeenCalledWith('api-dados');
    });

    it('só resolve depois que o cache foi apagado', async () => {
      let terminar!: (valor: boolean) => void;
      instalarCaches(jest.fn(() => new Promise<boolean>((resolve) => (terminar = resolve))));
      logarComo('token-velho');

      let resolveu = false;
      const envio = encerrarSessao().then(() => (resolveu = true));
      await Promise.resolve();
      expect(resolveu).toBe(false);

      terminar(true);
      await envio;
      expect(resolveu).toBe(true);
    });
  });

  describe('iniciarSessao (OFF-12)', () => {
    it('apaga o cache antes de gravar token e usuário', async () => {
      let terminar!: (valor: boolean) => void;
      const deletar = jest.fn(() => {
        // No momento da limpeza, a sessão nova ainda não foi gravada.
        expect(localStorage.getItem('gesso.token')).toBeNull();
        return new Promise<boolean>((resolve) => (terminar = resolve));
      });
      instalarCaches(deletar);

      const envio = iniciarSessao(resposta);
      await Promise.resolve();
      expect(deletar).toHaveBeenCalledWith('api-dados');
      expect(localStorage.getItem('gesso.token')).toBeNull();

      terminar(true);
      await envio;
      expect(localStorage.getItem('gesso.token')).toBe('token-novo');
      expect(auth.getUsuario()).toEqual(resposta.usuario);
    });

    it('sem Cache Storage, grava token e usuário normalmente', async () => {
      await expect(iniciarSessao(resposta)).resolves.toBeUndefined();

      expect(localStorage.getItem('gesso.token')).toBe('token-novo');
      expect(auth.getUsuario()).toEqual(resposta.usuario);
    });

    it('com caches.delete rejeitando, grava token e usuário normalmente', async () => {
      instalarCaches(jest.fn().mockRejectedValue(new Error('quota')));

      await expect(iniciarSessao(resposta)).resolves.toBeUndefined();

      expect(localStorage.getItem('gesso.token')).toBe('token-novo');
    });
  });
});
