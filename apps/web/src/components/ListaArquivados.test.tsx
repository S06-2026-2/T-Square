import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';

import { api } from '../lib/api';
import ListaArquivados from './ListaArquivados';

jest.mock('../lib/api', () => ({ api: { get: jest.fn(), patch: jest.fn() } }));

const get = api.get as jest.Mock;
const patch = api.patch as jest.Mock;

const SEM_CONEXAO =
  'Sem conexão: não foi possível confirmar o envio. Tente de novo; o mesmo lançamento não será duplicado.';
const erroHttp = (mensagem: string) => Object.assign(new Error(mensagem), { status: 400 });
const erroRede = () => Object.assign(new Error(SEM_CONEXAO), { status: 0 });

/** ISO de um instante em hora local, para a data esperada não depender do fuso da máquina. */
const isoLocal = (ano: number, mes: number, dia: number) =>
  new Date(ano, mes - 1, dia, 15, 0).toISOString();

interface Item {
  id: string;
  nome: string;
  arquivadoEm: string;
}

const itens: Item[] = [
  { id: 'g-1', nome: 'João', arquivadoEm: isoLocal(2026, 11, 20) },
  { id: 'g-2', nome: 'Ana', arquivadoEm: isoLocal(2026, 11, 18) },
];

function renderizar(onRestaurado = jest.fn()) {
  render(
    <ListaArquivados<Item>
      caminho="/gesseiros"
      rotulo={(i) => i.nome}
      onRestaurado={onRestaurado}
    />,
  );
  return onRestaurado;
}

const linha = (nome: string) => screen.getByText(nome).closest('li') as HTMLElement;

beforeEach(() => {
  get.mockReset();
  patch.mockReset();
});

/** ARQ-07 (UI) e ARQ-08 de arquivar-e-limpar-registros. */
describe('ListaArquivados', () => {
  it('busca <caminho>?arquivados=true e mostra rótulo, data da limpeza e Restaurar', async () => {
    get.mockResolvedValue(itens);
    renderizar();

    expect(await screen.findByText('João')).toBeInTheDocument();
    expect(get).toHaveBeenCalledWith('/gesseiros?arquivados=true');
    expect(within(linha('João')).getByText('Será apagado em 27/11/2026')).toBeInTheDocument();
    expect(within(linha('Ana')).getByText('Será apagado em 25/11/2026')).toBeInTheDocument();
    expect(within(linha('Ana')).getByRole('button', { name: 'Restaurar' })).toBeEnabled();
  });

  it('lista vazia: "Nada arquivado."', async () => {
    get.mockResolvedValue([]);
    renderizar();

    expect(await screen.findByText('Nada arquivado.')).toBeInTheDocument();
  });

  it('restaurar: PATCH <caminho>/:id/restaurar, sai da lista e avisa a página', async () => {
    get.mockResolvedValue(itens);
    patch.mockResolvedValue({});
    const onRestaurado = renderizar();
    await screen.findByText('João');

    fireEvent.click(within(linha('João')).getByRole('button', { name: 'Restaurar' }));

    await waitFor(() => expect(onRestaurado).toHaveBeenCalledTimes(1));
    expect(patch).toHaveBeenCalledWith('/gesseiros/g-1/restaurar');
    expect(screen.queryByText('João')).not.toBeInTheDocument();
    expect(screen.getByText('Ana')).toBeInTheDocument();
  });

  it('erro HTTP: mensagem e a lista recarrega; a página não é avisada', async () => {
    get.mockResolvedValue(itens);
    patch.mockRejectedValue(erroHttp('O gesseiro não está arquivado'));
    const onRestaurado = renderizar();
    await screen.findByText('João');

    fireEvent.click(within(linha('João')).getByRole('button', { name: 'Restaurar' }));

    expect(await screen.findByText('O gesseiro não está arquivado')).toHaveClass('erro');
    await waitFor(() => expect(get).toHaveBeenCalledTimes(2));
    expect(onRestaurado).not.toHaveBeenCalled();
  });

  it('sem rede: mensagem do OFF-08, sem recarga e sem reenviar', async () => {
    get.mockResolvedValue(itens);
    patch.mockRejectedValue(erroRede());
    renderizar();
    await screen.findByText('João');

    fireEvent.click(within(linha('João')).getByRole('button', { name: 'Restaurar' }));

    expect(await screen.findByText(SEM_CONEXAO)).toHaveClass('erro');
    expect(get).toHaveBeenCalledTimes(1);
    expect(patch).toHaveBeenCalledTimes(1);
    expect(screen.getByText('João')).toBeInTheDocument();
  });

  it('erro ao carregar: mensagem', async () => {
    get.mockRejectedValue(erroHttp('Falhou'));
    renderizar();

    expect(await screen.findByText('Falhou')).toHaveClass('erro');
  });

  // Auditor web #12: um restaurar por vez.
  it('com um restaurar pendente, os outros "Restaurar" ficam desabilitados', async () => {
    get.mockResolvedValue(itens);
    patch.mockReturnValue(new Promise(() => undefined));
    renderizar();
    await screen.findByText('João');

    fireEvent.click(within(linha('João')).getByRole('button', { name: 'Restaurar' }));

    await waitFor(() =>
      expect(within(linha('Ana')).getByRole('button', { name: 'Restaurar' })).toBeDisabled(),
    );
    fireEvent.click(within(linha('Ana')).getByRole('button', { name: 'Restaurar' }));
    expect(patch).toHaveBeenCalledTimes(1);
  });
});
