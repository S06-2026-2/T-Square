import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';

import { api } from '../../lib/api';
import type { Material, Obra } from '../../types';
import MovimentacaoForm from './MovimentacaoForm';

jest.mock('../../lib/api', () => ({ api: { post: jest.fn() } }));

const post = api.post as jest.Mock;

const materiais: Material[] = [
  { id: 'm-placa', nome: 'Placa de gesso', unidade: 'un', saldoAtual: 50, estoqueMinimo: 10 },
];
const obras: Obra[] = [
  { id: 'o-forro', titulo: 'Forro sala', clienteNome: 'Maria', status: 'ANDAMENTO', valorTotal: 8500 },
  { id: 'o-sanca', titulo: 'Sanca quarto', clienteNome: 'Joao', status: 'CONCLUIDA', valorTotal: 3000 },
  { id: 'o-divisoria', titulo: 'Divisoria loja', clienteNome: 'Ana', status: 'CANCELADA', valorTotal: 5000 },
];

function preencher(rotulo: string, valor: string) {
  fireEvent.change(screen.getByLabelText(rotulo), { target: { value: valor } });
}

function registrar() {
  fireEvent.click(screen.getByRole('button', { name: 'Registrar movimentacao' }));
}

function renderForm(onSalvo = jest.fn()) {
  render(<MovimentacaoForm materiais={materiais} obras={obras} onSalvo={onSalvo} />);
  return onSalvo;
}

beforeEach(() => {
  post.mockReset();
});

describe('MovimentacaoForm', () => {
  it('exige material, tipo e quantidade maior que zero; observacao e opcional', () => {
    renderForm();

    expect(screen.getByLabelText('Material')).toBeRequired();
    expect(screen.getByLabelText('Tipo')).toBeRequired();
    expect(screen.getByLabelText('Quantidade')).toBeRequired();
    expect(screen.getByLabelText('Quantidade')).toHaveAttribute('min', '0.01');
    expect(screen.getByLabelText('Observacao')).not.toBeRequired();
    const tipos = within(screen.getByLabelText('Tipo'))
      .getAllByRole('option')
      .map((opcao) => (opcao as HTMLOptionElement).value);
    expect(tipos).toEqual(['ENTRADA', 'SAIDA']);
  });

  it('registra uma entrada com quantidade numerica e avisa a pagina (FRM-09 AC1)', async () => {
    post.mockResolvedValue({ id: 'mv1' });
    const onSalvo = renderForm();

    preencher('Material', 'm-placa');
    preencher('Quantidade', '20');
    preencher('Observacao', 'Compra da semana');
    registrar();

    await waitFor(() => expect(onSalvo).toHaveBeenCalled());
    expect(post).toHaveBeenCalledWith('/estoque/movimentacoes', {
      materialId: 'm-placa',
      tipo: 'ENTRADA',
      quantidade: 20,
      observacao: 'Compra da semana',
    });
  });

  it('so oferece a obra na SAIDA e envia o obraId escolhido (FRM-09 AC2)', async () => {
    post.mockResolvedValue({ id: 'mv1' });
    renderForm();

    expect(screen.queryByLabelText('Obra')).not.toBeInTheDocument();
    preencher('Tipo', 'SAIDA');
    expect(screen.getByLabelText('Obra')).not.toBeRequired();
    preencher('Material', 'm-placa');
    preencher('Quantidade', '5');
    preencher('Obra', 'o-forro');
    registrar();

    await waitFor(() => expect(post).toHaveBeenCalled());
    expect(post.mock.calls[0][1]).toEqual({
      materialId: 'm-placa',
      tipo: 'SAIDA',
      quantidade: 5,
      obraId: 'o-forro',
    });
  });

  it('nao oferece obra concluida nem cancelada na SAIDA (EST-09)', () => {
    renderForm();
    preencher('Tipo', 'SAIDA');

    const opcoes = within(screen.getByLabelText('Obra'))
      .getAllByRole('option')
      .map((opcao) => opcao.textContent);
    expect(opcoes).toEqual(['Nenhuma', 'Forro sala']);
  });

  it('nao envia obraId quando o tipo volta para ENTRADA depois de escolher uma obra (FRM-09 AC2)', async () => {
    post.mockResolvedValue({ id: 'mv1' });
    renderForm();

    preencher('Tipo', 'SAIDA');
    preencher('Obra', 'o-forro');
    preencher('Tipo', 'ENTRADA');
    expect(screen.queryByLabelText('Obra')).not.toBeInTheDocument();
    preencher('Material', 'm-placa');
    preencher('Quantidade', '5');
    registrar();

    await waitFor(() => expect(post).toHaveBeenCalled());
    expect(post.mock.calls[0][1]).toEqual({ materialId: 'm-placa', tipo: 'ENTRADA', quantidade: 5 });
  });

  it('mostra o 400 de saldo insuficiente sem avisar a pagina e sem perder os dados (FRM-09 AC3)', async () => {
    post.mockRejectedValue(new Error('Saldo insuficiente de "Placa de gesso": disponivel 50, pedido 80'));
    const onSalvo = renderForm();

    preencher('Tipo', 'SAIDA');
    preencher('Material', 'm-placa');
    preencher('Quantidade', '80');
    preencher('Obra', 'o-forro');
    registrar();

    expect(
      await screen.findByText('Saldo insuficiente de "Placa de gesso": disponivel 50, pedido 80'),
    ).toHaveClass('erro');
    expect(onSalvo).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Tipo')).toHaveValue('SAIDA');
    expect(screen.getByLabelText('Material')).toHaveValue('m-placa');
    expect(screen.getByLabelText('Quantidade')).toHaveValue(80);
    expect(screen.getByLabelText('Obra')).toHaveValue('o-forro');
  });

  it('desabilita o botao enquanto a movimentacao esta sendo enviada', async () => {
    let terminar!: (valor: unknown) => void;
    post.mockReturnValue(new Promise((resolve) => (terminar = resolve)));
    renderForm();

    preencher('Material', 'm-placa');
    preencher('Quantidade', '5');
    registrar();

    expect(screen.getByRole('button', { name: 'Registrar movimentacao' })).toBeDisabled();
    terminar({ id: 'mv1' });
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Registrar movimentacao' })).toBeEnabled(),
    );
  });
});
