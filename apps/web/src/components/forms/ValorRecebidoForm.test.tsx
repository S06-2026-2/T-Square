import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import { api } from '../../lib/api';
import { moeda } from '../../lib/formato';
import type { Obra } from '../../types';
import ValorRecebidoForm from './ValorRecebidoForm';

jest.mock('../../lib/api', () => ({ api: { patch: jest.fn() } }));

const patch = api.patch as jest.Mock;

const obra: Obra = {
  id: 'o-1',
  titulo: 'Forro sala',
  clienteNome: 'Maria',
  status: 'CONCLUIDA',
  valorTotal: '8000.00',
  valorRecebido: '2500.50',
} as Obra;

const campo = () => screen.getByLabelText('Valor recebido do cliente');

/** O moeda usa espaço não separável; o matcher normaliza só o texto da tela. */
const brl = (valor: number) => moeda(valor).replace(/ /g, ' ');

beforeEach(() => patch.mockReset());

/** ARQ-02 de arquivar-e-limpar-registros. */
describe('ValorRecebidoForm', () => {
  it('mostra "Recebido R$ X de R$ Y" e o campo com 0..valorTotal em centavos', () => {
    render(<ValorRecebidoForm obra={obra} onSalvo={jest.fn()} />);

    expect(screen.getByText(`Recebido ${brl(2500.5)} de ${brl(8000)}`)).toBeInTheDocument();
    expect(campo()).toHaveValue(2500.5);
    expect(campo()).toHaveAttribute('min', '0');
    expect(campo()).toHaveAttribute('max', '8000');
    expect(campo()).toHaveAttribute('step', '0.01');
  });

  it('obra sem valorRecebido começa em 0', () => {
    render(<ValorRecebidoForm obra={{ ...obra, valorRecebido: undefined }} onSalvo={jest.fn()} />);

    expect(screen.getByText(`Recebido ${brl(0)} de ${brl(8000)}`)).toBeInTheDocument();
    expect(campo()).toHaveValue(0);
  });

  it('salvar faz PATCH /obras/:id com o número e recarrega', async () => {
    patch.mockResolvedValue({});
    const onSalvo = jest.fn();
    render(<ValorRecebidoForm obra={obra} onSalvo={onSalvo} />);

    fireEvent.change(campo(), { target: { value: '8000' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    await waitFor(() => expect(onSalvo).toHaveBeenCalledTimes(1));
    expect(patch).toHaveBeenCalledWith('/obras/o-1', { valorRecebido: 8000 });
  });

  it('erro da API aparece no form e não recarrega', async () => {
    patch.mockRejectedValue(
      new Error('O valor recebido não pode passar do valor total (R$ 8.000,00)'),
    );
    const onSalvo = jest.fn();
    render(<ValorRecebidoForm obra={obra} onSalvo={onSalvo} />);

    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(
      await screen.findByText('O valor recebido não pode passar do valor total (R$ 8.000,00)'),
    ).toBeInTheDocument();
    expect(onSalvo).not.toHaveBeenCalled();
  });
});
