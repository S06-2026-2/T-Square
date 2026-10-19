import { render, screen, within } from '@testing-library/react';

import { api } from '../lib/api';
import type { ResumoStatus } from '../types';
import Dashboard from './Dashboard';

jest.mock('../lib/api', () => ({
  api: { get: jest.fn() },
}));

const get = api.get as jest.Mock;

/** Resposta de GET /obras/resumo com o seed padrao. */
const seed: ResumoStatus[] = [
  { status: 'ANDAMENTO', quantidade: 1, valorTotal: 8500 },
  { status: 'ORCAMENTO', quantidade: 1, valorTotal: 14200 },
];

/** Card do status pelo rotulo exibido. */
async function card(rotulo: string) {
  const titulo = await screen.findByRole('heading', { name: rotulo });
  return within(titulo.closest('article') as HTMLElement);
}

beforeEach(() => {
  get.mockReset();
});

describe('Dashboard', () => {
  it('busca o resumo e mostra quantidade e valor em BRL de cada status (DSH-01)', async () => {
    get.mockResolvedValue(seed);
    render(<Dashboard />);

    const andamento = await card('Em andamento');
    expect(andamento.getByTestId('quantidade')).toHaveTextContent(/^1$/);
    expect(andamento.getByTestId('valor')).toHaveTextContent(/^R\$\s8\.500,00$/);

    const orcamento = await card('Aguardando cliente');
    expect(orcamento.getByTestId('quantidade')).toHaveTextContent(/^1$/);
    expect(orcamento.getByTestId('valor')).toHaveTextContent(/^R\$\s14\.200,00$/);

    expect(get).toHaveBeenCalledWith('/obras/resumo');
  });

  it('mostra os status ausentes na resposta com 0 e R$ 0,00, na ordem do funil (DSH-02)', async () => {
    get.mockResolvedValue(seed);
    render(<Dashboard />);
    await card('Em andamento');

    for (const rotulo of ['Fechadas', 'Concluidas', 'Canceladas']) {
      const c = await card(rotulo);
      expect(c.getByTestId('quantidade')).toHaveTextContent(/^0$/);
      expect(c.getByTestId('valor')).toHaveTextContent(/^R\$\s0,00$/);
    }

    const titulos = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent);
    expect(titulos).toEqual(['Aguardando cliente', 'Fechadas', 'Em andamento', 'Concluidas', 'Canceladas']);
  });

  it('sem nenhuma obra, mostra os 5 cards zerados', async () => {
    get.mockResolvedValue([]);
    render(<Dashboard />);
    await card('Aguardando cliente');

    const cards = screen.getAllByRole('article');
    expect(cards).toHaveLength(5);
    for (const c of cards) {
      expect(within(c).getByTestId('quantidade')).toHaveTextContent(/^0$/);
      expect(within(c).getByTestId('valor')).toHaveTextContent(/^R\$\s0,00$/);
    }
  });

  it('enquanto carrega, mostra o aviso e nenhum card', () => {
    get.mockReturnValue(new Promise(() => {}));
    render(<Dashboard />);

    expect(screen.getByText('Carregando...')).toBeInTheDocument();
    expect(screen.queryAllByRole('article')).toHaveLength(0);
  });

  it('exibe a mensagem de erro quando a API falha (DSH-03)', async () => {
    get.mockRejectedValue(new Error('Erro ao comunicar com a API'));
    render(<Dashboard />);

    const erro = await screen.findByText('Erro ao comunicar com a API');
    expect(erro).toHaveClass('erro');
    expect(screen.queryAllByRole('article')).toHaveLength(0);
  });
});
