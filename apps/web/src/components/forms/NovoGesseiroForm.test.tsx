import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import { api } from '../../lib/api';
import NovoGesseiroForm from './NovoGesseiroForm';

jest.mock('../../lib/api', () => ({ api: { post: jest.fn() } }));

const post = api.post as jest.Mock;

function preencher(rotulo: string, valor: string) {
  fireEvent.change(screen.getByLabelText(rotulo), { target: { value: valor } });
}

function salvar() {
  fireEvent.click(screen.getByRole('button', { name: 'Salvar gesseiro' }));
}

beforeEach(() => {
  post.mockReset();
});

describe('NovoGesseiroForm', () => {
  it('exige nome com pelo menos 3 caracteres; telefone e chave Pix sao opcionais', () => {
    render(<NovoGesseiroForm onSalvo={jest.fn()} />);

    expect(screen.getByLabelText('Nome')).toBeRequired();
    expect(screen.getByLabelText('Nome')).toHaveAttribute('minLength', '3');
    expect(screen.getByLabelText('Telefone')).not.toBeRequired();
    expect(screen.getByLabelText('Chave Pix')).not.toBeRequired();
  });

  it('cadastra o gesseiro com todos os campos, avisa a pagina e limpa o formulario', async () => {
    post.mockResolvedValue({ id: 'g1' });
    const onSalvo = jest.fn();
    render(<NovoGesseiroForm onSalvo={onSalvo} />);

    preencher('Nome', ' Joao Ferreira ');
    preencher('Telefone', '(35) 99999-0001');
    preencher('Chave Pix', 'joao@pix.com');
    salvar();

    await waitFor(() => expect(onSalvo).toHaveBeenCalled());
    expect(post).toHaveBeenCalledWith('/gesseiros', {
      nome: 'Joao Ferreira',
      telefone: '(35) 99999-0001',
      chavePix: 'joao@pix.com',
    });
    expect(screen.getByLabelText('Nome')).toHaveValue('');
    expect(screen.getByLabelText('Telefone')).toHaveValue('');
    expect(screen.getByLabelText('Chave Pix')).toHaveValue('');
  });

  it('omite telefone e chave Pix quando ficam vazios', async () => {
    post.mockResolvedValue({ id: 'g1' });
    render(<NovoGesseiroForm onSalvo={jest.fn()} />);

    preencher('Nome', 'Joao Ferreira');
    preencher('Telefone', '   ');
    salvar();

    await waitFor(() => expect(post).toHaveBeenCalled());
    expect(post.mock.calls[0][1]).toEqual({ nome: 'Joao Ferreira' });
  });

  it('mostra o erro da API sem avisar a pagina e sem perder os dados', async () => {
    post.mockRejectedValue(new Error('nome must be longer than or equal to 3 characters'));
    const onSalvo = jest.fn();
    render(<NovoGesseiroForm onSalvo={onSalvo} />);

    preencher('Nome', 'Joao Ferreira');
    preencher('Telefone', '(35) 99999-0001');
    salvar();

    expect(await screen.findByText('nome must be longer than or equal to 3 characters')).toHaveClass('erro');
    expect(onSalvo).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Nome')).toHaveValue('Joao Ferreira');
    expect(screen.getByLabelText('Telefone')).toHaveValue('(35) 99999-0001');
  });

  it('desabilita o botao enquanto o cadastro esta sendo enviado', async () => {
    let terminar!: (valor: unknown) => void;
    post.mockReturnValue(new Promise((resolve) => (terminar = resolve)));
    render(<NovoGesseiroForm onSalvo={jest.fn()} />);

    preencher('Nome', 'Joao Ferreira');
    salvar();

    expect(screen.getByRole('button', { name: 'Salvar gesseiro' })).toBeDisabled();
    terminar({ id: 'g1' });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Salvar gesseiro' })).toBeEnabled());
  });
});
