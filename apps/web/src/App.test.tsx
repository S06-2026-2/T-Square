import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import App from './App';

jest.mock('./lib/api', () => ({
  api: { get: jest.fn(async () => []) },
  auth: {
    estaLogado: jest.fn(() => true),
    getUsuario: () => ({ nome: 'Admin' }),
    logout: jest.fn(),
  },
}));

function renderEm(caminho: string) {
  render(
    <MemoryRouter
      initialEntries={[caminho]}
      future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
    >
      <App />
    </MemoryRouter>,
  );
}

describe('App', () => {
  it('abre o dashboard ao acessar a pagina inicial', async () => {
    renderEm('/');

    expect(await screen.findByRole('heading', { level: 1, name: 'Visao geral' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Visao geral' })).toHaveClass('ativo');
  });

  it('mostra a aba Visao geral como primeira do menu, apontando para /dashboard', async () => {
    renderEm('/obras');

    const links = within(screen.getByRole('navigation')).getAllByRole('link');
    expect(links[0]).toHaveTextContent('Visao geral');
    expect(links[0]).toHaveAttribute('href', '/dashboard');
    await screen.findByRole('heading', { level: 1, name: 'Obras' });
  });
});

describe('App: rota privada sem token (AD-010)', () => {
  const { auth: authMock } = jest.requireMock('./lib/api');
  let deletar: jest.Mock;

  beforeEach(() => {
    deletar = jest.fn().mockResolvedValue(true);
    Object.defineProperty(globalThis, 'caches', {
      value: { delete: deletar },
      configurable: true,
      writable: true,
    });
  });

  afterEach(() => {
    authMock.estaLogado.mockReturnValue(true);
    delete (globalThis as { caches?: unknown }).caches;
  });

  it('sem token, vai para o login e apaga o cache de dados que tiver sobrado', async () => {
    authMock.estaLogado.mockReturnValue(false);

    renderEm('/estoque');

    expect(await screen.findByRole('button', { name: 'Entrar' })).toBeInTheDocument();
    expect(deletar).toHaveBeenCalledWith('api-dados');
  });

  it('logado, não mexe no cache', async () => {
    renderEm('/obras');

    await screen.findByRole('heading', { level: 1, name: 'Obras' });
    expect(deletar).not.toHaveBeenCalled();
  });
});
