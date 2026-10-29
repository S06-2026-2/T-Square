import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

import { api } from '../lib/api';
import type { Material, Obra } from '../types';
import Estoque from './Estoque';

jest.mock('../lib/api', () => ({
  api: { get: jest.fn(), post: jest.fn(), patch: jest.fn() },
}));

const get = api.get as jest.Mock;
const post = api.post as jest.Mock;
const patch = api.patch as jest.Mock;

/** Estoque no roteador; o Dashboard é só um marcador para conferir a volta. */
function renderizar(endereco = '/estoque') {
  render(
    <MemoryRouter initialEntries={[endereco]}>
      <Routes>
        <Route path="/estoque" element={<Estoque />} />
        <Route path="/dashboard" element={<p>Tela do dashboard</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

const placa: Material = {
  id: 'm-placa',
  nome: 'Placa de gesso',
  unidade: 'un',
  saldoAtual: 50,
  estoqueMinimo: 10,
};
const obras: Obra[] = [
  {
    id: 'o-forro',
    titulo: 'Forro sala',
    clienteNome: 'Maria',
    status: 'ANDAMENTO',
    valorTotal: 8500,
  },
];

let materiais: Material[];

function chamadasMateriais() {
  return get.mock.calls.filter(([c]) => c === '/estoque/materiais').length;
}

function linha(nome: string) {
  return within(screen.getByRole('cell', { name: nome }).closest('tr') as HTMLElement);
}

beforeEach(() => {
  get.mockReset();
  post.mockReset();
  patch.mockReset();
  materiais = [placa];
  get.mockImplementation(async (caminho: string) => (caminho === '/obras' ? obras : materiais));
});

describe('Estoque', () => {
  it('recarrega a tabela depois de cadastrar um material, e ele aparece com saldo 0 (FRM-08 AC1)', async () => {
    post.mockImplementation(async () => {
      materiais = [
        placa,
        { id: 'm-massa', nome: 'Massa corrida', unidade: 'saco', saldoAtual: 0, estoqueMinimo: 0 },
      ];
      return { id: 'm-massa' };
    });
    renderizar();
    await screen.findByRole('cell', { name: 'Placa de gesso' });

    fireEvent.click(screen.getByRole('button', { name: 'Novo material' }));
    fireEvent.change(screen.getByLabelText('Nome'), { target: { value: 'Massa corrida' } });
    fireEvent.change(screen.getByLabelText('Unidade'), { target: { value: 'saco' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar material' }));

    await screen.findByRole('cell', { name: 'Massa corrida' });
    expect(chamadasMateriais()).toBe(2);
    expect(linha('Massa corrida').getAllByRole('cell')[2]).toHaveTextContent(/^0$/);
  });

  it('passa os materiais e as obras carregados para o formulario de movimentacao', async () => {
    renderizar();
    await screen.findByRole('cell', { name: 'Placa de gesso' });

    fireEvent.click(screen.getByRole('button', { name: 'Registrar entrada/saida' }));
    expect(
      within(screen.getByLabelText('Material')).getByRole('option', {
        name: 'Placa de gesso (un)',
      }),
    ).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Tipo'), { target: { value: 'SAIDA' } });
    expect(
      within(screen.getByLabelText('Obra')).getByRole('option', { name: 'Forro sala' }),
    ).toBeInTheDocument();
  });

  it('recarrega a tabela com o saldo novo depois de uma saida (FRM-09 AC1)', async () => {
    post.mockImplementation(async () => {
      materiais = [{ ...placa, saldoAtual: 45 }];
      return { id: 'mv1' };
    });
    renderizar();
    await screen.findByRole('cell', { name: 'Placa de gesso' });
    expect(linha('Placa de gesso').getAllByRole('cell')[2]).toHaveTextContent(/^50$/);

    fireEvent.click(screen.getByRole('button', { name: 'Registrar entrada/saida' }));
    fireEvent.change(screen.getByLabelText('Material'), { target: { value: 'm-placa' } });
    fireEvent.change(screen.getByLabelText('Tipo'), { target: { value: 'SAIDA' } });
    fireEvent.change(screen.getByLabelText('Quantidade'), { target: { value: '5' } });
    fireEvent.click(screen.getByRole('button', { name: 'Registrar movimentacao' }));

    await waitFor(() => expect(chamadasMateriais()).toBe(2));
    await waitFor(() =>
      expect(linha('Placa de gesso').getAllByRole('cell')[2]).toHaveTextContent(/^45$/),
    );
  });

  it('nao recarrega nem altera a tabela quando a movimentacao falha (FRM-09 AC3)', async () => {
    post.mockRejectedValue(new Error('Saldo insuficiente'));
    renderizar();
    await screen.findByRole('cell', { name: 'Placa de gesso' });

    fireEvent.click(screen.getByRole('button', { name: 'Registrar entrada/saida' }));
    fireEvent.change(screen.getByLabelText('Material'), { target: { value: 'm-placa' } });
    fireEvent.change(screen.getByLabelText('Tipo'), { target: { value: 'SAIDA' } });
    fireEvent.change(screen.getByLabelText('Quantidade'), { target: { value: '80' } });
    fireEvent.click(screen.getByRole('button', { name: 'Registrar movimentacao' }));

    expect(await screen.findByText('Saldo insuficiente')).toBeInTheDocument();
    expect(chamadasMateriais()).toBe(1);
    expect(linha('Placa de gesso').getAllByRole('cell')[2]).toHaveTextContent(/^50$/);
    expect(screen.getByLabelText('Quantidade')).toHaveValue(80);
  });
});

describe('Estoque: atalho do "Resolver" de um alerta de reposição (EAP-68)', () => {
  const atalho = '/estoque?alerta=al-1&material=m-placa&quantidade=28';

  it('abre a ENTRADA já preenchida com o material e a quantidade do alerta', async () => {
    renderizar(atalho);
    await screen.findByRole('cell', { name: 'Placa de gesso' });

    expect(screen.getByTestId('aviso-alerta')).toHaveTextContent(
      'Registre a entrada de Placa de gesso para resolver o alerta de reposição.',
    );
    expect(screen.getByLabelText('Material')).toHaveValue('m-placa');
    expect(screen.getByLabelText('Tipo')).toHaveValue('ENTRADA');
    expect(screen.getByLabelText('Quantidade')).toHaveValue(28);
  });

  it('salva a ENTRADA, resolve o alerta e volta ao Dashboard', async () => {
    post.mockResolvedValue({ id: 'mv1' });
    patch.mockResolvedValue({ id: 'al-1' });
    renderizar(atalho);
    await screen.findByRole('cell', { name: 'Placa de gesso' });

    fireEvent.change(screen.getByLabelText('Quantidade'), { target: { value: '30' } });
    fireEvent.click(screen.getByRole('button', { name: 'Registrar movimentacao' }));

    expect(await screen.findByText('Tela do dashboard')).toBeInTheDocument();
    expect(post).toHaveBeenCalledWith('/estoque/movimentacoes', {
      materialId: 'm-placa',
      tipo: 'ENTRADA',
      quantidade: 30,
    });
    expect(patch).toHaveBeenCalledWith('/estoque/agente/alertas/al-1/resolver');
    expect(post.mock.invocationCallOrder[0]).toBeLessThan(patch.mock.invocationCallOrder[0]);
  });

  it('se a ENTRADA falha, não resolve o alerta e mantém o formulário', async () => {
    post.mockRejectedValue(new Error('Material nao encontrado'));
    renderizar(atalho);
    await screen.findByRole('cell', { name: 'Placa de gesso' });

    fireEvent.click(screen.getByRole('button', { name: 'Registrar movimentacao' }));

    expect(await screen.findByText('Material nao encontrado')).toBeInTheDocument();
    expect(patch).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Quantidade')).toHaveValue(28);
    expect(screen.queryByText('Tela do dashboard')).not.toBeInTheDocument();
  });

  it('se resolver o alerta falha, avisa que a entrada foi registrada e fica no Estoque', async () => {
    post.mockResolvedValue({ id: 'mv1' });
    patch.mockRejectedValue(new Error('Alerta al-1 não está ativo'));
    renderizar(atalho);
    await screen.findByRole('cell', { name: 'Placa de gesso' });

    fireEvent.click(screen.getByRole('button', { name: 'Registrar movimentacao' }));

    expect(
      await screen.findByText(
        'Entrada registrada, mas o alerta não foi resolvido: Alerta al-1 não está ativo',
      ),
    ).toHaveClass('erro');
    expect(screen.queryByText('Tela do dashboard')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Quantidade')).not.toBeInTheDocument();
  });

  it('fechar o formulário desfaz o atalho: uma movimentação depois não resolve o alerta', async () => {
    post.mockResolvedValue({ id: 'mv1' });
    renderizar(atalho);
    await screen.findByRole('cell', { name: 'Placa de gesso' });

    fireEvent.click(screen.getByRole('button', { name: 'Registrar entrada/saida' }));
    expect(screen.queryByTestId('aviso-alerta')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Registrar entrada/saida' }));
    fireEvent.change(screen.getByLabelText('Material'), { target: { value: 'm-placa' } });
    fireEvent.change(screen.getByLabelText('Quantidade'), { target: { value: '5' } });
    fireEvent.click(screen.getByRole('button', { name: 'Registrar movimentacao' }));

    await waitFor(() => expect(post).toHaveBeenCalled());
    await waitFor(() => expect(chamadasMateriais()).toBe(2));
    expect(patch).not.toHaveBeenCalled();
    expect(screen.queryByText('Tela do dashboard')).not.toBeInTheDocument();
  });
});
