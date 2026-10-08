import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';

import { api } from '../../lib/api';
import type { Gesseiro } from '../../types';
import AlocarGesseiroForm from './AlocarGesseiroForm';

jest.mock('../../lib/api', () => ({ api: { post: jest.fn() } }));

const post = api.post as jest.Mock;

const gesseiros: Gesseiro[] = [
  { id: 'g-ana', nome: 'Ana', ativo: true },
  { id: 'g-caio', nome: 'Caio', ativo: false },
];

function preencher(rotulo: string, valor: string) {
  fireEvent.change(screen.getByLabelText(rotulo), { target: { value: valor } });
}

function alocar() {
  fireEvent.click(screen.getByRole('button', { name: 'Alocar' }));
}

beforeEach(() => {
  post.mockReset();
});

describe('AlocarGesseiroForm', () => {
  it('exige gesseiro e valor combinado antes de enviar', () => {
    render(<AlocarGesseiroForm obraId="o1" gesseiros={gesseiros} onSalvo={jest.fn()} />);

    expect(screen.getByLabelText('Gesseiro')).toBeRequired();
    expect(screen.getByLabelText('Valor combinado')).toBeRequired();
    expect(screen.getByLabelText('Funcao')).not.toBeRequired();
  });

  it('lista so gesseiros ativos no seletor', () => {
    render(<AlocarGesseiroForm obraId="o1" gesseiros={gesseiros} onSalvo={jest.fn()} />);

    const valores = within(screen.getByLabelText('Gesseiro'))
      .getAllByRole('option')
      .map((opcao) => (opcao as HTMLOptionElement).value)
      .filter(Boolean);
    expect(valores).toEqual(['g-ana']);
  });

  it('aloca o gesseiro na obra com valor numerico e avisa a pagina', async () => {
    post.mockResolvedValue({ id: 'a1' });
    const onSalvo = jest.fn();
    render(<AlocarGesseiroForm obraId="o1" gesseiros={gesseiros} onSalvo={onSalvo} />);

    preencher('Gesseiro', 'g-ana');
    preencher('Valor combinado', '1200');
    preencher('Funcao', 'Forro');
    alocar();

    await waitFor(() => expect(onSalvo).toHaveBeenCalled());
    expect(post).toHaveBeenCalledWith('/obras/o1/gesseiros', {
      gesseiroId: 'g-ana',
      valorCombinado: 1200,
      funcao: 'Forro',
    });
    expect(screen.getByLabelText('Valor combinado')).toHaveValue(null);
  });

  it('omite a funcao quando ela fica vazia', async () => {
    post.mockResolvedValue({ id: 'a1' });
    render(<AlocarGesseiroForm obraId="o1" gesseiros={gesseiros} onSalvo={jest.fn()} />);

    preencher('Gesseiro', 'g-ana');
    preencher('Valor combinado', '1200');
    alocar();

    await waitFor(() => expect(post).toHaveBeenCalled());
    expect(post.mock.calls[0][1]).toEqual({ gesseiroId: 'g-ana', valorCombinado: 1200 });
  });

  it('mostra o 404 da API sem avisar a pagina e sem perder os dados', async () => {
    post.mockRejectedValue(new Error('Gesseiro g-ana nao encontrado'));
    const onSalvo = jest.fn();
    render(<AlocarGesseiroForm obraId="o1" gesseiros={gesseiros} onSalvo={onSalvo} />);

    preencher('Gesseiro', 'g-ana');
    preencher('Valor combinado', '1200');
    alocar();

    expect(await screen.findByText('Gesseiro g-ana nao encontrado')).toBeInTheDocument();
    expect(onSalvo).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Gesseiro')).toHaveValue('g-ana');
    expect(screen.getByLabelText('Valor combinado')).toHaveValue(1200);
  });

  it('desabilita o botao enquanto a alocacao esta sendo enviada', async () => {
    let terminar!: (valor: unknown) => void;
    post.mockReturnValue(new Promise((resolve) => (terminar = resolve)));
    render(<AlocarGesseiroForm obraId="o1" gesseiros={gesseiros} onSalvo={jest.fn()} />);

    preencher('Gesseiro', 'g-ana');
    preencher('Valor combinado', '1200');
    alocar();

    expect(screen.getByRole('button', { name: 'Alocar' })).toBeDisabled();
    terminar({ id: 'a1' });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Alocar' })).toBeEnabled());
  });
});
