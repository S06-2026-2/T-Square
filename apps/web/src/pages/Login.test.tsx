import { fireEvent, render, screen } from '@testing-library/react';
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
