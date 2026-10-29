import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';

import { api } from '../lib/api';
import type { Gesseiro, LinhaPrevistoUtilizado, Material, Obra, StatusObra } from '../types';
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

const materiais: Material[] = [
  { id: 'm-cal', nome: 'Cal', unidade: 'saco', saldoAtual: '25', estoqueMinimo: '10' },
];

const previstoCal: LinhaPrevistoUtilizado = {
  materialId: 'm-cal',
  material: 'Cal',
  unidade: 'saco',
  previsto: '20',
  utilizado: '8',
  pendente: '12',
  excedente: '0',
};

/** GET por caminho, incluindo o previsto x utilizado de qualquer obra e a lista de materiais. */
function responderComPrevistos() {
  get.mockImplementation(async (caminho: string) => {
    if (caminho === '/gesseiros') return gesseiros;
    if (caminho === '/estoque/materiais') return materiais;
    if (/^\/obras\/[^/]+\/materiais-previstos$/.test(caminho)) return [previstoCal];
    return todas;
  });
}

function abrirPrevistos(titulo: string) {
  fireEvent.click(within(card(titulo)).getByText('Materiais previstos'));
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

  it('mostra a ação "Materiais previstos" em todo card e só monta o formulário ao abrir', async () => {
    responderComPrevistos();
    render(<Obras />);
    await screen.findByText('Obra orc');

    for (const titulo of ['Obra orc', 'Obra fec', 'Obra and', 'Obra con', 'Obra can']) {
      expect(within(card(titulo)).getByText('Materiais previstos').tagName).toBe('SUMMARY');
    }
    expect(get).not.toHaveBeenCalledWith('/obras/orc/materiais-previstos');
  });

  it('abre o editor com os itens atuais nos 3 status editáveis (EAP-43)', async () => {
    responderComPrevistos();
    render(<Obras />);
    await screen.findByText('Obra orc');

    for (const [id, titulo] of [
      ['orc', 'Obra orc'],
      ['fec', 'Obra fec'],
      ['and', 'Obra and'],
    ]) {
      abrirPrevistos(titulo);
      const alvo = within(card(titulo));
      expect(await alvo.findByRole('table')).toHaveTextContent('12 pendentes');
      await waitFor(() => expect(alvo.getByLabelText('Material')).toHaveValue('m-cal'));
      expect(alvo.getByLabelText('Quantidade')).toHaveValue(20);
      expect(alvo.getByRole('button', { name: 'Salvar materiais' })).toBeInTheDocument();
      expect(get).toHaveBeenCalledWith(`/obras/${id}/materiais-previstos`);
    }
  });

  it('em obra CONCLUIDA ou CANCELADA mostra só o previsto x utilizado, sem editor (EAP-44)', async () => {
    responderComPrevistos();
    render(<Obras />);
    await screen.findByText('Obra orc');

    for (const titulo of ['Obra con', 'Obra can']) {
      abrirPrevistos(titulo);
      const alvo = within(card(titulo));
      expect(await alvo.findByRole('table')).toHaveTextContent('12 pendentes');
      expect(alvo.queryByLabelText('Material')).not.toBeInTheDocument();
      expect(alvo.queryByRole('button', { name: 'Adicionar material' })).not.toBeInTheDocument();
      expect(alvo.queryByRole('button', { name: 'Salvar materiais' })).not.toBeInTheDocument();
    }
  });
});
