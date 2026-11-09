import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import { api } from '../lib/api';
import type { Extrato, Gesseiro } from '../types';
import Gesseiros from './Gesseiros';

jest.mock('../lib/api', () => ({
  api: { get: jest.fn(), post: jest.fn() },
}));

const get = api.get as jest.Mock;
const post = api.post as jest.Mock;

const ana: Gesseiro = { id: 'g-ana', nome: 'Ana', ativo: true };

function extrato(vales: number, saldoAReceber: number): Extrato {
  return {
    gesseiro: { id: 'g-ana', nome: 'Ana' },
    creditos: 100,
    vales,
    pagamentos: 0,
    saldoAReceber,
    lancamentos: [],
  };
}

function chamadas(caminho: string) {
  return get.mock.calls.filter(([c]) => c === caminho).length;
}

// O jsdom não tem matchMedia nem scrollIntoView (RSP-10). Padrão: tela larga.
const scrollIntoView = jest.fn();
let telaEstreita = false;
const matchMedia = jest.fn((consulta: string) => ({ matches: telaEstreita, media: consulta }));

beforeEach(() => {
  get.mockReset();
  post.mockReset();
  scrollIntoView.mockReset();
  matchMedia.mockClear();
  telaEstreita = false;
  Element.prototype.scrollIntoView = scrollIntoView;
  window.matchMedia = matchMedia as unknown as typeof window.matchMedia;
});

describe('Gesseiros', () => {
  it('recarrega a lista depois de cadastrar um gesseiro, e o novo aparece (FRM-06)', async () => {
    get.mockResolvedValueOnce([ana]);
    post.mockResolvedValue({ id: 'g-joao' });
    render(<Gesseiros />);
    await screen.findByRole('button', { name: 'Ana' });

    get.mockResolvedValueOnce([ana, { id: 'g-joao', nome: 'Joao Ferreira', ativo: true }]);
    fireEvent.click(screen.getByRole('button', { name: 'Novo gesseiro' }));
    fireEvent.change(screen.getByLabelText('Nome'), { target: { value: 'Joao Ferreira' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar gesseiro' }));

    expect(await screen.findByRole('button', { name: 'Joao Ferreira' })).toBeInTheDocument();
    expect(chamadas('/gesseiros')).toBe(2);
    expect(post).toHaveBeenCalledWith('/gesseiros', { nome: 'Joao Ferreira' });
  });

  it('so mostra o formulario de lancamento com um extrato aberto (FRM-07 AC3)', async () => {
    get.mockImplementation(async (caminho: string) =>
      caminho === '/gesseiros' ? [ana] : extrato(0, 100),
    );
    render(<Gesseiros />);
    await screen.findByRole('button', { name: 'Ana' });

    expect(screen.queryByLabelText('Tipo')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Registrar' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Ana' }));

    expect(await screen.findByLabelText('Tipo')).toBeInTheDocument();
  });

  it('recarrega o extrato depois de registrar um vale e mostra o saldo novo (FRM-07 AC1)', async () => {
    let atual = extrato(0, 100);
    get.mockImplementation(async (caminho: string) => (caminho === '/gesseiros' ? [ana] : atual));
    post.mockImplementation(async () => {
      atual = extrato(100, 0);
      return { id: 'l1' };
    });
    render(<Gesseiros />);
    fireEvent.click(await screen.findByRole('button', { name: 'Ana' }));
    await screen.findByLabelText('Tipo');
    expect(screen.getByText('Saldo a receber').nextElementSibling).toHaveTextContent(/R\$\s100,00/);

    fireEvent.change(screen.getByLabelText('Valor'), { target: { value: '100' } });
    fireEvent.click(screen.getByRole('button', { name: 'Registrar' }));

    await waitFor(() => expect(chamadas('/gesseiros/g-ana/extrato')).toBe(2));
    expect(post).toHaveBeenCalledWith('/gesseiros/g-ana/lancamentos', { tipo: 'VALE', valor: 100 });
    await waitFor(() =>
      expect(screen.getByText('Saldo a receber').nextElementSibling).toHaveTextContent(/R\$\s0,00/),
    );
  });

  describe('linha clicável e rolagem até o extrato', () => {
    const anaComTelefone: Gesseiro = { id: 'g-ana', nome: 'Ana', telefone: '35 99999-0000', ativo: true };

    function montar() {
      get.mockImplementation(async (caminho: string) =>
        caminho === '/gesseiros' ? [anaComTelefone] : extrato(0, 100),
      );
      render(<Gesseiros />);
    }

    it('clicar na linha fora do nome (no telefone) abre o extrato (RSP-09)', async () => {
      montar();
      fireEvent.click(await screen.findByText('35 99999-0000'));

      expect(await screen.findByRole('heading', { level: 2, name: 'Ana' })).toBeInTheDocument();
      expect(chamadas('/gesseiros/g-ana/extrato')).toBe(1);
    });

    it('um clique no nome faz uma chamada só ao extrato (RSP-09)', async () => {
      montar();
      fireEvent.click(await screen.findByRole('button', { name: 'Ana' }));

      await screen.findByRole('heading', { level: 2, name: 'Ana' });
      expect(chamadas('/gesseiros/g-ana/extrato')).toBe(1);
    });

    it('com tela de até 760px, rola até o início do card do extrato (RSP-10)', async () => {
      telaEstreita = true;
      montar();
      fireEvent.click(await screen.findByRole('button', { name: 'Ana' }));

      const titulo = await screen.findByRole('heading', { level: 2, name: 'Ana' });
      await waitFor(() => expect(scrollIntoView).toHaveBeenCalledTimes(1));
      expect(matchMedia).toHaveBeenCalledWith('(max-width: 760px)');
      expect(scrollIntoView).toHaveBeenCalledWith({ block: 'start', behavior: 'smooth' });
      // O elemento rolado é o card que contém o extrato.
      expect(scrollIntoView.mock.contexts[0]).toBe(titulo.closest('.card'));
    });

    it('com tela mais larga que 760px, não rola (RSP-10)', async () => {
      montar();
      fireEvent.click(await screen.findByRole('button', { name: 'Ana' }));

      await screen.findByRole('heading', { level: 2, name: 'Ana' });
      expect(matchMedia).toHaveBeenCalledWith('(max-width: 760px)');
      expect(scrollIntoView).not.toHaveBeenCalled();
    });
  });
});
