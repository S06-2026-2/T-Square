import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';

import { api } from '../lib/api';
import type { Material, Obra } from '../types';
import Estoque from './Estoque';

jest.mock('../lib/api', () => ({
  api: { get: jest.fn(), post: jest.fn() },
}));

const get = api.get as jest.Mock;
const post = api.post as jest.Mock;

const placa: Material = { id: 'm-placa', nome: 'Placa de gesso', unidade: 'un', saldoAtual: 50, estoqueMinimo: 10 };
const obras: Obra[] = [
  { id: 'o-forro', titulo: 'Forro sala', clienteNome: 'Maria', status: 'ANDAMENTO', valorTotal: 8500 },
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
  materiais = [placa];
  get.mockImplementation(async (caminho: string) => (caminho === '/obras' ? obras : materiais));
});

describe('Estoque', () => {
  it('recarrega a tabela depois de cadastrar um material, e ele aparece com saldo 0 (FRM-08 AC1)', async () => {
    post.mockImplementation(async () => {
      materiais = [placa, { id: 'm-massa', nome: 'Massa corrida', unidade: 'saco', saldoAtual: 0, estoqueMinimo: 0 }];
      return { id: 'm-massa' };
    });
    render(<Estoque />);
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
    render(<Estoque />);
    await screen.findByRole('cell', { name: 'Placa de gesso' });

    fireEvent.click(screen.getByRole('button', { name: 'Registrar entrada/saida' }));
    expect(within(screen.getByLabelText('Material')).getByRole('option', { name: 'Placa de gesso (un)' })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Tipo'), { target: { value: 'SAIDA' } });
    expect(within(screen.getByLabelText('Obra')).getByRole('option', { name: 'Forro sala' })).toBeInTheDocument();
  });

  it('recarrega a tabela com o saldo novo depois de uma saida (FRM-09 AC1)', async () => {
    post.mockImplementation(async () => {
      materiais = [{ ...placa, saldoAtual: 45 }];
      return { id: 'mv1' };
    });
    render(<Estoque />);
    await screen.findByRole('cell', { name: 'Placa de gesso' });
    expect(linha('Placa de gesso').getAllByRole('cell')[2]).toHaveTextContent(/^50$/);

    fireEvent.click(screen.getByRole('button', { name: 'Registrar entrada/saida' }));
    fireEvent.change(screen.getByLabelText('Material'), { target: { value: 'm-placa' } });
    fireEvent.change(screen.getByLabelText('Tipo'), { target: { value: 'SAIDA' } });
    fireEvent.change(screen.getByLabelText('Quantidade'), { target: { value: '5' } });
    fireEvent.click(screen.getByRole('button', { name: 'Registrar movimentacao' }));

    await waitFor(() => expect(chamadasMateriais()).toBe(2));
    await waitFor(() => expect(linha('Placa de gesso').getAllByRole('cell')[2]).toHaveTextContent(/^45$/));
  });

  it('nao recarrega nem altera a tabela quando a movimentacao falha (FRM-09 AC3)', async () => {
    post.mockRejectedValue(new Error('Saldo insuficiente'));
    render(<Estoque />);
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
