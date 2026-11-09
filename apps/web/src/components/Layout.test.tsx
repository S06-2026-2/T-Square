import { render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

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
