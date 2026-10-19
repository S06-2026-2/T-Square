import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';

import { api } from '../../lib/api';
import LancamentoForm from './LancamentoForm';

jest.mock('../../lib/api', () => ({ api: { post: jest.fn() } }));

const post = api.post as jest.Mock;

function preencher(rotulo: string, valor: string) {
  fireEvent.change(screen.getByLabelText(rotulo), { target: { value: valor } });
}

function registrar() {
  fireEvent.click(screen.getByRole('button', { name: 'Registrar' }));
}

beforeEach(() => {
  post.mockReset();
});

describe('LancamentoForm', () => {
  it('oferece apenas VALE e PAGAMENTO como tipo, nunca CREDITO', () => {
    render(<LancamentoForm gesseiroId="g1" onSalvo={jest.fn()} />);

    const valores = within(screen.getByLabelText('Tipo'))
      .getAllByRole('option')
      .map((opcao) => (opcao as HTMLOptionElement).value);
    expect(valores).toEqual(['VALE', 'PAGAMENTO']);
  });

  it('exige valor maior que zero; descricao e opcional', () => {
    render(<LancamentoForm gesseiroId="g1" onSalvo={jest.fn()} />);

    expect(screen.getByLabelText('Valor')).toBeRequired();
    expect(screen.getByLabelText('Valor')).toHaveAttribute('min', '0.01');
    expect(screen.getByLabelText('Descricao')).not.toBeRequired();
  });

  it('registra o lancamento com valor numerico no gesseiro e avisa a pagina', async () => {
    post.mockResolvedValue({ id: 'l1' });
    const onSalvo = jest.fn();
    render(<LancamentoForm gesseiroId="g1" onSalvo={onSalvo} />);

    preencher('Tipo', 'PAGAMENTO');
    preencher('Valor', '100');
    preencher('Descricao', 'Acerto da semana');
    registrar();

    await waitFor(() => expect(onSalvo).toHaveBeenCalled());
    expect(post).toHaveBeenCalledWith('/gesseiros/g1/lancamentos', {
      tipo: 'PAGAMENTO',
      valor: 100,
      descricao: 'Acerto da semana',
    });
    expect(screen.getByLabelText('Valor')).toHaveValue(null);
    expect(screen.getByLabelText('Descricao')).toHaveValue('');
  });

  it('omite a descricao vazia e usa VALE como tipo inicial', async () => {
    post.mockResolvedValue({ id: 'l1' });
    render(<LancamentoForm gesseiroId="g1" onSalvo={jest.fn()} />);

    preencher('Valor', '50.5');
    registrar();

    await waitFor(() => expect(post).toHaveBeenCalled());
    expect(post.mock.calls[0][1]).toEqual({ tipo: 'VALE', valor: 50.5 });
  });

  it('mostra o 400 da API sem avisar a pagina e sem perder os dados', async () => {
    post.mockRejectedValue(new Error('valor must not be less than 0'));
    const onSalvo = jest.fn();
    render(<LancamentoForm gesseiroId="g1" onSalvo={onSalvo} />);

    preencher('Tipo', 'PAGAMENTO');
    preencher('Valor', '100');
    preencher('Descricao', 'Acerto');
    registrar();

    expect(await screen.findByText('valor must not be less than 0')).toHaveClass('erro');
    expect(onSalvo).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Tipo')).toHaveValue('PAGAMENTO');
    expect(screen.getByLabelText('Valor')).toHaveValue(100);
    expect(screen.getByLabelText('Descricao')).toHaveValue('Acerto');
  });

  it('desabilita o botao enquanto o lancamento esta sendo enviado', async () => {
    let terminar!: (valor: unknown) => void;
    post.mockReturnValue(new Promise((resolve) => (terminar = resolve)));
    render(<LancamentoForm gesseiroId="g1" onSalvo={jest.fn()} />);

    preencher('Valor', '100');
    registrar();

    expect(screen.getByRole('button', { name: 'Registrar' })).toBeDisabled();
    terminar({ id: 'l1' });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Registrar' })).toBeEnabled());
  });
});
