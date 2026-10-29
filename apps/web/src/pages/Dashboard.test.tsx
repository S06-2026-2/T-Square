import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import { api } from '../lib/api';
import type { RespostaAlertasEstoque, ResumoStatus } from '../types';
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

/** Resposta de GET /estoque/agente/alertas com uma análise e nenhum alerta. */
const estoqueEmDia: RespostaAlertasEstoque = {
  ultimaAnalise: {
    id: 'an1',
    origem: 'MANUAL',
    status: 'SUCESSO',
    iniciadoEm: '2026-10-28T09:00:00.000Z',
    finalizadoEm: '2026-10-28T09:01:00.000Z',
    totalAlertas: 0,
  },
  alertas: [],
};

/**
 * `api.get` responde por caminho: o Dashboard busca o resumo do funil e os alertas do agente.
 * Os testes DSH só controlam o resumo; os alertas respondem "Estoque em dia" por padrão.
 */
function porCaminho(
  resumo: () => Promise<unknown>,
  alertas: () => Promise<unknown> = async () => estoqueEmDia,
) {
  get.mockImplementation((caminho: string) => {
    if (caminho === '/obras/resumo') return resumo();
    if (caminho === '/estoque/agente/alertas') return alertas();
    return Promise.reject(new Error(`caminho inesperado: ${caminho}`));
  });
}

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
    porCaminho(async () => seed);
    render(
      <MemoryRouter>
        <Dashboard />
      </MemoryRouter>,
    );

    const andamento = await card('Em andamento');
    expect(andamento.getByTestId('quantidade')).toHaveTextContent(/^1$/);
    expect(andamento.getByTestId('valor')).toHaveTextContent(/^R\$\s8\.500,00$/);

    const orcamento = await card('Aguardando cliente');
    expect(orcamento.getByTestId('quantidade')).toHaveTextContent(/^1$/);
    expect(orcamento.getByTestId('valor')).toHaveTextContent(/^R\$\s14\.200,00$/);

    expect(get).toHaveBeenCalledWith('/obras/resumo');
  });

  it('mostra os status ausentes na resposta com 0 e R$ 0,00, na ordem do funil (DSH-02)', async () => {
    porCaminho(async () => seed);
    render(
      <MemoryRouter>
        <Dashboard />
      </MemoryRouter>,
    );
    await card('Em andamento');

    for (const rotulo of ['Fechadas', 'Concluidas', 'Canceladas']) {
      const c = await card(rotulo);
      expect(c.getByTestId('quantidade')).toHaveTextContent(/^0$/);
      expect(c.getByTestId('valor')).toHaveTextContent(/^R\$\s0,00$/);
    }

    const titulos = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent);
    expect(titulos).toEqual([
      'Aguardando cliente',
      'Fechadas',
      'Em andamento',
      'Concluidas',
      'Canceladas',
    ]);
  });

  it('sem nenhuma obra, mostra os 5 cards zerados', async () => {
    porCaminho(async () => []);
    render(
      <MemoryRouter>
        <Dashboard />
      </MemoryRouter>,
    );
    await card('Aguardando cliente');

    const cards = screen.getAllByRole('article');
    expect(cards).toHaveLength(5);
    for (const c of cards) {
      expect(within(c).getByTestId('quantidade')).toHaveTextContent(/^0$/);
      expect(within(c).getByTestId('valor')).toHaveTextContent(/^R\$\s0,00$/);
    }
  });

  it('enquanto carrega, mostra o aviso e nenhum card', () => {
    porCaminho(
      () => new Promise(() => {}),
      () => new Promise(() => {}),
    );
    render(
      <MemoryRouter>
        <Dashboard />
      </MemoryRouter>,
    );

    expect(screen.getByText('Carregando...')).toBeInTheDocument();
    expect(screen.queryAllByRole('article')).toHaveLength(0);
  });

  it('exibe a mensagem de erro quando a API falha (DSH-03)', async () => {
    porCaminho(() => Promise.reject(new Error('Erro ao comunicar com a API')));
    render(
      <MemoryRouter>
        <Dashboard />
      </MemoryRouter>,
    );

    const erro = await screen.findByText('Erro ao comunicar com a API');
    expect(erro).toHaveClass('erro');
    expect(screen.queryAllByRole('article')).toHaveLength(0);
  });

  describe('seção de alertas do agente de estoque (EAP-34)', () => {
    const secaoEstoque = () => screen.getByRole('region', { name: 'Reposição de estoque' });

    it('erro em /estoque/agente/alertas aparece só na seção de estoque e mantém os cards do funil', async () => {
      porCaminho(
        async () => seed,
        () => Promise.reject(new Error('Erro ao carregar alertas do agente')),
      );
      render(
        <MemoryRouter>
          <Dashboard />
        </MemoryRouter>,
      );

      const erro = await screen.findByText('Erro ao carregar alertas do agente');
      expect(erro).toHaveClass('erro');
      expect(secaoEstoque()).toContainElement(erro);
      expect(screen.getAllByText('Erro ao carregar alertas do agente')).toHaveLength(1);

      const andamento = await card('Em andamento');
      expect(andamento.getByTestId('valor')).toHaveTextContent(/^R\$\s8\.500,00$/);
      expect(screen.getAllByRole('article')).toHaveLength(5);
    });

    it('erro em /obras/resumo não esconde a seção de estoque', async () => {
      porCaminho(() => Promise.reject(new Error('Erro ao comunicar com a API')));
      render(
        <MemoryRouter>
          <Dashboard />
        </MemoryRouter>,
      );

      const erro = await screen.findByText('Erro ao comunicar com a API');
      expect(secaoEstoque()).not.toContainElement(erro);
      expect(await within(secaoEstoque()).findByText('Estoque em dia')).toBeInTheDocument();
      expect(
        within(secaoEstoque()).getByRole('button', { name: 'Rodar análise agora' }),
      ).toBeInTheDocument();
      expect(get).toHaveBeenCalledWith('/estoque/agente/alertas');
    });
  });
});
