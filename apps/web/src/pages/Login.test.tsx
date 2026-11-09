import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

import Login from './Login';

jest.mock('../lib/api', () => ({
  api: {
    post: jest.fn(async () => ({
      accessToken: 'token',
      usuario: { id: 'u1', nome: 'Admin', email: 'admin@gesso.com', papel: 'ADMIN' },
    })),
  },
  auth: { setToken: jest.fn(), setUsuario: jest.fn() },
}));

describe('Login', () => {
  it('leva para a pagina inicial (que abre o dashboard) depois de entrar', async () => {
    render(
      <MemoryRouter
        initialEntries={['/login']}
        future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
      >
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/" element={<p>pagina inicial</p>} />
          <Route path="/obras" element={<p>obras</p>} />
        </Routes>
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Entrar' }));

    expect(await screen.findByText('pagina inicial')).toBeInTheDocument();
  });
});

describe('Login: sessão limpa e sem conexão (OFF-12, OFF-13)', () => {
  const { api: apiMock, auth: authMock } = jest.requireMock('../lib/api');

  function renderLogin() {
    render(
      <MemoryRouter
        initialEntries={['/login']}
        future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
      >
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/" element={<p>pagina inicial</p>} />
        </Routes>
      </MemoryRouter>,
    );
  }

  function preencherEEntrar(email: string, senha: string) {
    fireEvent.change(screen.getByLabelText('E-mail'), { target: { value: email } });
    fireEvent.change(screen.getByLabelText('Senha'), { target: { value: senha } });
    fireEvent.click(screen.getByRole('button', { name: 'Entrar' }));
  }

  /** Erro com o formato do `ApiError` (mensagem + status). */
  function erroApi(mensagem: string, status: number) {
    return Object.assign(new Error(mensagem), { status });
  }

  beforeEach(() => {
    authMock.setToken.mockClear();
    authMock.setUsuario.mockClear();
  });

  afterEach(() => {
    delete (globalThis as { caches?: unknown }).caches;
  });

  it('sucesso: apaga o cache de dados e grava a sessão antes de abrir a primeira tela', async () => {
    let terminar!: (valor: boolean) => void;
    const deletar = jest.fn(() => new Promise<boolean>((resolve) => (terminar = resolve)));
    Object.defineProperty(globalThis, 'caches', {
      value: { delete: deletar },
      configurable: true,
      writable: true,
    });
    renderLogin();

    preencherEEntrar('admin@gesso.com', 'admin123');
    await waitFor(() => expect(deletar).toHaveBeenCalledWith('api-dados'));
    expect(authMock.setToken).not.toHaveBeenCalled();
    expect(screen.queryByText('pagina inicial')).not.toBeInTheDocument();

    await act(async () => {
      terminar(true);
    });
    expect(await screen.findByText('pagina inicial')).toBeInTheDocument();
    expect(authMock.setToken).toHaveBeenCalledWith('token');
    expect(authMock.setUsuario).toHaveBeenCalledWith({
      id: 'u1',
      nome: 'Admin',
      email: 'admin@gesso.com',
      papel: 'ADMIN',
    });
  });

  it('falha de rede: mensagem do OFF-13, mantém o e-mail e esvazia a senha', async () => {
    apiMock.post.mockRejectedValueOnce(
      erroApi(
        'Sem conexão: não foi possível confirmar o envio. Tente de novo; o mesmo lançamento não será duplicado.',
        0,
      ),
    );
    renderLogin();

    preencherEEntrar('bia@gesso.com', 'segredo1');

    expect(
      await screen.findByText('Sem conexão. Conecte-se à internet para entrar.'),
    ).toHaveClass('erro');
    expect(screen.getByLabelText('E-mail')).toHaveValue('bia@gesso.com');
    expect(screen.getByLabelText('Senha')).toHaveValue('');
    expect(screen.queryByText('pagina inicial')).not.toBeInTheDocument();
    expect(authMock.setToken).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Entrar' })).toBeEnabled();
  });

  it.each([
    ['401 (credencial errada)', erroApi('Sessao expirada. Faca login novamente.', 401)],
    ['500', erroApi('Erro ao comunicar com a API', 500)],
  ])('%s: mostra a mensagem do api.ts, como hoje, sem mexer nos campos', async (_caso, erro) => {
    apiMock.post.mockRejectedValueOnce(erro);
    renderLogin();

    preencherEEntrar('bia@gesso.com', 'errada');

    expect(await screen.findByText(erro.message)).toHaveClass('erro');
    expect(screen.queryByText('Sem conexão. Conecte-se à internet para entrar.')).not.toBeInTheDocument();
    expect(screen.getByLabelText('E-mail')).toHaveValue('bia@gesso.com');
    expect(screen.getByLabelText('Senha')).toHaveValue('errada');
    expect(authMock.setToken).not.toHaveBeenCalled();
  });
});
