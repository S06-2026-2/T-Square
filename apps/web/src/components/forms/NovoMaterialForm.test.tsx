import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import { api } from '../../lib/api';
import NovoMaterialForm from './NovoMaterialForm';

jest.mock('../../lib/api', () => ({ api: { post: jest.fn() } }));

const post = api.post as jest.Mock;

function preencher(rotulo: string, valor: string) {
  fireEvent.change(screen.getByLabelText(rotulo), { target: { value: valor } });
}

function salvar() {
  fireEvent.click(screen.getByRole('button', { name: 'Salvar material' }));
}

beforeEach(() => {
  post.mockReset();
});

describe('NovoMaterialForm', () => {
  it('exige nome (minimo 2) e unidade; estoque minimo e opcional', () => {
    render(<NovoMaterialForm onSalvo={jest.fn()} />);

    expect(screen.getByLabelText('Nome')).toBeRequired();
    expect(screen.getByLabelText('Nome')).toHaveAttribute('minLength', '2');
    expect(screen.getByLabelText('Unidade')).toBeRequired();
    expect(screen.getByLabelText('Estoque minimo')).not.toBeRequired();
  });

  it('cadastra o material com estoque minimo numerico, avisa a pagina e limpa o formulario (FRM-08 AC1)', async () => {
    post.mockResolvedValue({ id: 'm1' });
    const onSalvo = jest.fn();
    render(<NovoMaterialForm onSalvo={onSalvo} />);

    preencher('Nome', 'Placa de gesso');
    preencher('Unidade', 'un');
    preencher('Estoque minimo', '10');
    salvar();

    await waitFor(() => expect(onSalvo).toHaveBeenCalled());
    expect(post).toHaveBeenCalledWith('/estoque/materiais', {
      nome: 'Placa de gesso',
      unidade: 'un',
      estoqueMinimo: 10,
    });
    expect(screen.getByLabelText('Nome')).toHaveValue('');
    expect(screen.getByLabelText('Unidade')).toHaveValue('');
    expect(screen.getByLabelText('Estoque minimo')).toHaveValue(null);
  });

  it('omite o estoque minimo quando fica vazio (FRM-08 AC2)', async () => {
    post.mockResolvedValue({ id: 'm1' });
    render(<NovoMaterialForm onSalvo={jest.fn()} />);

    preencher('Nome', 'Placa de gesso');
    preencher('Unidade', 'un');
    salvar();

    await waitFor(() => expect(post).toHaveBeenCalled());
    expect(post.mock.calls[0][1]).toEqual({ nome: 'Placa de gesso', unidade: 'un' });
  });

  it('mostra o 409 de nome duplicado sem avisar a pagina e sem perder os dados (FRM-08 AC3)', async () => {
    post.mockRejectedValue(new Error('Ja existe um material chamado "Placa de gesso"'));
    const onSalvo = jest.fn();
    render(<NovoMaterialForm onSalvo={onSalvo} />);

    preencher('Nome', 'Placa de gesso');
    preencher('Unidade', 'un');
    preencher('Estoque minimo', '10');
    salvar();

    expect(await screen.findByText('Ja existe um material chamado "Placa de gesso"')).toHaveClass('erro');
    expect(onSalvo).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Nome')).toHaveValue('Placa de gesso');
    expect(screen.getByLabelText('Unidade')).toHaveValue('un');
    expect(screen.getByLabelText('Estoque minimo')).toHaveValue(10);
  });

  it('desabilita o botao enquanto o cadastro esta sendo enviado', async () => {
    let terminar!: (valor: unknown) => void;
    post.mockReturnValue(new Promise((resolve) => (terminar = resolve)));
    render(<NovoMaterialForm onSalvo={jest.fn()} />);

    preencher('Nome', 'Placa de gesso');
    preencher('Unidade', 'un');
    salvar();

    expect(screen.getByRole('button', { name: 'Salvar material' })).toBeDisabled();
    terminar({ id: 'm1' });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Salvar material' })).toBeEnabled());
  });
});
