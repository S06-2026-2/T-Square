import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';

import { api } from '../lib/api';
import type { Gesseiro, Obra, StatusObra } from '../types';
import Obras from './Obras';

jest.mock('../lib/api', () => ({
  api: { get: jest.fn(), post: jest.fn(), patch: jest.fn() },
}));

const get = api.get as jest.Mock;
const post = api.post as jest.Mock;

const gesseiros: Gesseiro[] = [{ id: 'g-ana', nome: 'Ana', ativo: true }];

function obra(id: string, status: StatusObra): Obra {
  return { id, titulo: `Obra ${id}`, clienteNome: 'Cliente', status, valorTotal: 1000, gesseiros: [] };
}

const todas: Obra[] = [
  obra('orc', 'ORCAMENTO'),
  obra('fec', 'FECHADA'),
  obra('and', 'ANDAMENTO'),
  obra('con', 'CONCLUIDA'),
  obra('can', 'CANCELADA'),
];

/** Caminhos de GET /obras chamados ate agora, na ordem. */
function chamadasObras(): string[] {
  return get.mock.calls.map(([caminho]) => caminho as string).filter((c) => c.startsWith('/obras'));
}

function ultimaChamadaObras() {
  const chamadas = chamadasObras();
  return chamadas[chamadas.length - 1];
}

function card(titulo: string) {
  return screen.getByRole('heading', { name: titulo }).closest('article') as HTMLElement;
}

async function criarObra() {
  fireEvent.click(screen.getByRole('button', { name: 'Nova obra' }));
  fireEvent.change(screen.getByLabelText('Titulo'), { target: { value: 'Forro sala' } });
  fireEvent.change(screen.getByLabelText('Cliente'), { target: { value: 'Maria Silva' } });
  fireEvent.change(screen.getByLabelText('Valor total'), { target: { value: '8500' } });
  fireEvent.click(screen.getByRole('button', { name: 'Salvar obra' }));
}

beforeEach(() => {
  get.mockReset();
  post.mockReset();
  get.mockImplementation(async (caminho: string) => (caminho === '/gesseiros' ? gesseiros : todas));
});

describe('Obras', () => {
  it('volta o filtro para Todas depois de criar uma obra com outro filtro ativo', async () => {
    post.mockResolvedValue({ id: 'nova' });
    render(<Obras />);
    await screen.findByText('Obra orc');

    fireEvent.click(screen.getByRole('button', { name: 'Fechadas' }));
    await waitFor(() => expect(chamadasObras()).toContain('/obras?status=FECHADA'));

    await criarObra();

    await waitFor(() => expect(ultimaChamadaObras()).toBe('/obras'));
    expect(screen.getByRole('button', { name: 'Todas' })).toHaveClass('ativo');
  });

  it('recarrega a lista depois de criar uma obra com o filtro ja em Todas', async () => {
    post.mockResolvedValue({ id: 'nova' });
    render(<Obras />);
    await screen.findByText('Obra orc');
    const antes = chamadasObras().length;
    get.mockImplementation(async (caminho: string) =>
      caminho === '/gesseiros' ? gesseiros : [obra('nova', 'ORCAMENTO'), ...todas],
    );

    await criarObra();

    await waitFor(() => expect(chamadasObras()).toHaveLength(antes + 1));
    expect(ultimaChamadaObras()).toBe('/obras');
    const nova = await screen.findByRole('heading', { name: 'Obra nova' });
    expect(
      within(nova.closest('article') as HTMLElement).getByText('Aguardando cliente'),
    ).toBeInTheDocument();
  });

  it('so oferece alocacao em obras que ainda nao terminaram', async () => {
    render(<Obras />);
    await screen.findByText('Obra orc');

    for (const titulo of ['Obra orc', 'Obra fec', 'Obra and']) {
      expect(within(card(titulo)).getByRole('button', { name: 'Alocar' })).toBeInTheDocument();
    }
    for (const titulo of ['Obra con', 'Obra can']) {
      expect(within(card(titulo)).queryByRole('button', { name: 'Alocar' })).not.toBeInTheDocument();
    }
  });

  it('recarrega a lista depois de alocar um gesseiro', async () => {
    post.mockResolvedValue({ id: 'a1' });
    render(<Obras />);
    await screen.findByText('Obra orc');
    const antes = chamadasObras().length;

    const alvo = within(card('Obra orc'));
    await waitFor(() =>
      expect(within(alvo.getByLabelText('Gesseiro')).getByRole('option', { name: 'Ana' })).toBeInTheDocument(),
    );
    get.mockImplementation(async (caminho: string) => {
      if (caminho === '/gesseiros') return gesseiros;
      const alocada: Obra = {
        ...obra('orc', 'ORCAMENTO'),
        gesseiros: [{ id: 'a1', gesseiroId: 'g-ana', valorCombinado: 700, gesseiro: gesseiros[0] }],
      };
      return [alocada, ...todas.slice(1)];
    });
    fireEvent.change(alvo.getByLabelText('Gesseiro'), { target: { value: 'g-ana' } });
    fireEvent.change(alvo.getByLabelText('Valor combinado'), { target: { value: '700' } });
    fireEvent.click(alvo.getByRole('button', { name: 'Alocar' }));

    await waitFor(() => expect(chamadasObras()).toHaveLength(antes + 1));
    expect(post).toHaveBeenCalledWith('/obras/orc/gesseiros', {
      gesseiroId: 'g-ana',
      valorCombinado: 700,
    });
    const alocados = await waitFor(() => {
      const lista = card('Obra orc').querySelector('.lista-gesseiros');
      expect(lista).not.toBeNull();
      return lista as HTMLElement;
    });
    expect(alocados).toHaveTextContent(/Ana - R\$\s700,00/);
  });
});
