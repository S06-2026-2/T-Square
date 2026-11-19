import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

import { iniciarCapturaInstalacao } from '../lib/instalacao';
import Layout from './Layout';

jest.mock('../lib/api', () => ({
  auth: { getUsuario: () => ({ nome: 'Admin' }), logout: jest.fn() },
}));

function renderEm(caminho: string) {
  render(
    <MemoryRouter
      initialEntries={[caminho]}
      future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
    >
      <Routes>
        <Route element={<Layout />}>
          <Route path="*" element={<p>tela</p>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

// Mesmo <nav> no desktop (sidebar, rótulo longo) e no celular (barra inferior, rótulo curto):
// o CSS escolhe qual rótulo aparece (RSP-03, RSP-05).
const abas = [
  { para: '/dashboard', rotulo: 'Visao geral', curto: 'Geral' },
  { para: '/obras', rotulo: 'Obras', curto: 'Obras' },
  { para: '/gesseiros', rotulo: 'Gesseiros', curto: 'Equipe' },
  { para: '/estoque', rotulo: 'Estoque', curto: 'Estoque' },
];

describe('Layout', () => {
  it('mostra as 4 abas, cada uma com o rótulo longo e o curto (RSP-03, RSP-05)', () => {
    renderEm('/dashboard');

    const links = within(screen.getByRole('navigation')).getAllByRole('link');
    expect(links).toHaveLength(4);
    abas.forEach((aba, i) => {
      expect(links[i]).toHaveAttribute('href', aba.para);
      expect(links[i]).toHaveAccessibleName(aba.rotulo);
      expect(links[i].querySelector('.rotulo')).toHaveTextContent(new RegExp(`^${aba.rotulo}$`));
      expect(links[i].querySelector('.rotulo-curto')).toHaveTextContent(
        new RegExp(`^${aba.curto}$`),
      );
    });
  });

  it('destaca só a aba da rota atual (RSP-03)', () => {
    renderEm('/gesseiros');

    const links = within(screen.getByRole('navigation')).getAllByRole('link');
    const ativos = links.filter((link) => link.classList.contains('ativo'));
    expect(ativos).toHaveLength(1);
    expect(ativos[0]).toHaveAttribute('href', '/gesseiros');
  });

  it('mantém o botão Sair (RSP-04)', () => {
    renderEm('/obras');

    expect(screen.getByRole('button', { name: 'Sair' })).toBeInTheDocument();
  });
});

describe('Layout: indicador de conexão (OFF-06)', () => {
  afterEach(() => {
    delete (navigator as { onLine?: boolean }).onLine;
  });

  it('offline: o ícone aparece na área do usuário (topo no celular, sidebar no desktop), antes do avatar', () => {
    Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => false });
    renderEm('/obras');

    const icone = screen.getByRole('img', { name: 'Dados possivelmente desatualizados' });
    const usuario = icone.closest('.usuario') as HTMLElement;
    expect(usuario).not.toBeNull();
    expect(usuario.closest('.sidebar')).not.toBeNull();
    expect(icone.nextElementSibling).toHaveClass('avatar');
  });

  it('online: a área do usuário não tem o ícone', () => {
    renderEm('/obras');

    expect(
      screen.queryByRole('img', { name: 'Dados possivelmente desatualizados' }),
    ).not.toBeInTheDocument();
  });
});

describe('Layout: botão Instalar app (PWA-05)', () => {
  beforeAll(() => {
    iniciarCapturaInstalacao();
  });

  afterEach(() => {
    act(() => {
      window.dispatchEvent(new Event('appinstalled'));
    });
  });

  it('sem convite do navegador, não há botão de instalar', () => {
    renderEm('/obras');

    expect(screen.queryByRole('button', { name: 'Instalar app' })).not.toBeInTheDocument();
  });

  it('com beforeinstallprompt, o botão aparece na área do usuário (topo no celular, sidebar no desktop), antes do Sair', () => {
    renderEm('/obras');

    act(() => {
      window.dispatchEvent(new Event('beforeinstallprompt', { cancelable: true }));
    });

    const botao = screen.getByRole('button', { name: 'Instalar app' });
    const usuario = botao.closest('.usuario') as HTMLElement;
    expect(usuario).not.toBeNull();
    expect(usuario.closest('.sidebar')).not.toBeNull();
    expect(botao.closest('.instalar')?.nextElementSibling).toBe(
      screen.getByRole('button', { name: 'Sair' }),
    );
  });
});

describe('Layout: Sair (OFF-11)', () => {
  afterEach(() => {
    delete (globalThis as { caches?: unknown }).caches;
  });

  it('espera o logout e a limpeza do cache api-dados e só então vai para /login', async () => {
    const { auth: authMock } = jest.requireMock('../lib/api');
    authMock.logout.mockClear();
    let terminar!: (valor: boolean) => void;
    const deletar = jest.fn(() => new Promise<boolean>((resolve) => (terminar = resolve)));
    Object.defineProperty(globalThis, 'caches', {
      value: { delete: deletar },
      configurable: true,
      writable: true,
    });
    render(
      <MemoryRouter
        initialEntries={['/obras']}
        future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
      >
        <Routes>
          <Route path="/login" element={<p>tela de login</p>} />
          <Route element={<Layout />}>
            <Route path="*" element={<p>tela</p>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Sair' }));

    expect(authMock.logout).toHaveBeenCalledTimes(1);
    expect(deletar).toHaveBeenCalledWith('api-dados');
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.queryByText('tela de login')).not.toBeInTheDocument();
    expect(screen.getByText('tela')).toBeInTheDocument();

    await act(async () => {
      terminar(true);
    });
    expect(await screen.findByText('tela de login')).toBeInTheDocument();
  });
});
