import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';

import { api } from '../../lib/api';
import type { LinhaPrevistoUtilizado, Material } from '../../types';
import MateriaisPrevistosForm from './MateriaisPrevistosForm';

jest.mock('../../lib/api', () => ({ api: { get: jest.fn(), put: jest.fn() } }));

const get = api.get as jest.Mock;
const put = api.put as jest.Mock;

const materiais: Material[] = [
  { id: 'm-cal', nome: 'Cal', unidade: 'saco', saldoAtual: '25', estoqueMinimo: '10' },
  { id: 'm-gesso', nome: 'Gesso', unidade: 'saco', saldoAtual: '40', estoqueMinimo: '5' },
  { id: 'm-placa', nome: 'Placa', unidade: 'un', saldoAtual: '100', estoqueMinimo: '20' },
];

/** Decimais como a API serializa: string. */
const linhas: LinhaPrevistoUtilizado[] = [
  {
    materialId: 'm-cal',
    material: 'Cal',
    unidade: 'saco',
    previsto: '20',
    utilizado: '8',
    pendente: '12',
    excedente: '0',
    semPrevisao: false,
  },
  {
    materialId: 'm-gesso',
    material: 'Gesso',
    unidade: 'saco',
    previsto: '10',
    utilizado: '15',
    pendente: '0',
    excedente: '5',
    semPrevisao: false,
  },
  {
    materialId: 'm-placa',
    material: 'Placa',
    unidade: 'un',
    previsto: '1250.5',
    utilizado: '1250.5',
    pendente: '0',
    excedente: '0',
    semPrevisao: false,
  },
];

function responder(previstos: LinhaPrevistoUtilizado[]) {
  get.mockImplementation(async (caminho: string) => {
    if (caminho === '/estoque/materiais') return materiais;
    if (caminho === '/obras/o1/materiais-previstos') return previstos;
    throw new Error(`caminho inesperado: ${caminho}`);
  });
}

/** Texto de cada célula, linha a linha, sem o cabeçalho. */
function corpoDaTabela() {
  const tabela = screen.getByRole('table');
  return within(tabela)
    .getAllByRole('row')
    .slice(1)
    .map((linha) =>
      within(linha)
        .getAllByRole('cell')
        .map((celula) => celula.textContent),
    );
}

function salvar() {
  fireEvent.click(screen.getByRole('button', { name: 'Salvar materiais' }));
}

beforeEach(() => {
  get.mockReset();
  put.mockReset();
});

describe('MateriaisPrevistosForm', () => {
  it('mostra a tabela previsto x utilizado com material, previsto, utilizado e situação (EAP-55, EAP-56)', async () => {
    responder(linhas);
    render(<MateriaisPrevistosForm obraId="o1" status="ANDAMENTO" />);

    const tabela = await screen.findByRole('table');
    expect(
      within(tabela)
        .getAllByRole('columnheader')
        .map((th) => th.textContent),
    ).toEqual(['Material', 'Previsto', 'Utilizado', 'Situação']);
    expect(corpoDaTabela()).toEqual([
      ['Cal (saco)', '20', '8', 'pendente: 12'],
      ['Gesso (saco)', '10', '15', 'excedente: 5'],
      ['Placa (un)', '1.250,5', '1.250,5', 'conforme previsto'],
    ]);
    expect(get).toHaveBeenCalledWith('/obras/o1/materiais-previstos');
  });

  describe('material usado sem previsão (EAP-70)', () => {
    const fita: LinhaPrevistoUtilizado = {
      materialId: 'm-fita',
      material: 'Fita para juntas',
      unidade: 'rolo',
      previsto: '0',
      utilizado: '11',
      pendente: '0',
      excedente: '11',
      semPrevisao: true,
    };

    it('aparece na tabela com "—" no previsto e "não previsto" na situação', async () => {
      responder([linhas[0], fita]);
      render(<MateriaisPrevistosForm obraId="o1" status="ANDAMENTO" />);

      await screen.findByRole('table');
      expect(corpoDaTabela()).toEqual([
        ['Cal (saco)', '20', '8', 'pendente: 12'],
        ['Fita para juntas (rolo)', '—', '11', 'não previsto'],
      ]);
    });

    it('obra só com material sem previsão mostra a tabela em vez de "Nenhum material previsto"', async () => {
      responder([fita]);
      render(<MateriaisPrevistosForm obraId="o1" status="ANDAMENTO" />);

      await screen.findByRole('table');
      expect(screen.queryByText('Nenhum material previsto')).not.toBeInTheDocument();
    });

    it('não entra no editor nem no PUT ao salvar', async () => {
      responder([linhas[0], fita]);
      put.mockResolvedValue([]);
      render(<MateriaisPrevistosForm obraId="o1" status="ANDAMENTO" />);
      await screen.findByRole('table');

      expect(
        screen.getAllByLabelText('Material').map((s) => (s as HTMLSelectElement).value),
      ).toEqual(['m-cal']);
      salvar();

      await waitFor(() =>
        expect(put).toHaveBeenCalledWith('/obras/o1/materiais-previstos', {
          itens: [{ materialId: 'm-cal', quantidade: 20 }],
        }),
      );
    });
  });

  it('mostra "Nenhum material previsto" no lugar da tabela (EAP-57)', async () => {
    responder([]);
    render(<MateriaisPrevistosForm obraId="o1" status="ORCAMENTO" />);

    expect(await screen.findByText('Nenhum material previsto')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    // Em status editável o editor continua disponível para cadastrar os primeiros itens.
    expect(screen.getByRole('button', { name: 'Adicionar material' })).toBeInTheDocument();
  });

  it('abre o editor com os itens atuais, abaixo da tabela (EAP-38)', async () => {
    responder(linhas);
    render(<MateriaisPrevistosForm obraId="o1" status="FECHADA" />);

    const tabela = await screen.findByRole('table');
    const selects = screen.getAllByLabelText('Material');
    expect(selects.map((s) => (s as HTMLSelectElement).value)).toEqual([
      'm-cal',
      'm-gesso',
      'm-placa',
    ]);
    expect(
      screen.getAllByLabelText('Quantidade').map((i) => (i as HTMLInputElement).value),
    ).toEqual(['20', '10', '1250.5']);
    // Tabela acima do formulário de edição (P3, critério 2).
    expect(
      tabela.compareDocumentPosition(selects[0]) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it('salvar chama PUT /obras/:id/materiais-previstos com a lista inteira e recarrega a tabela (EAP-38)', async () => {
    responder(linhas.slice(0, 1));
    put.mockResolvedValue([]);
    render(<MateriaisPrevistosForm obraId="o1" status="ANDAMENTO" />);
    await screen.findByRole('table');

    fireEvent.change(screen.getByLabelText('Quantidade'), { target: { value: '25' } });
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar material' }));
    fireEvent.change(screen.getAllByLabelText('Material')[1], { target: { value: 'm-gesso' } });
    fireEvent.change(screen.getAllByLabelText('Quantidade')[1], { target: { value: '7.5' } });

    const depois: LinhaPrevistoUtilizado[] = [
      { ...linhas[0], previsto: '25', pendente: '17' },
      { ...linhas[1], previsto: '7.5', utilizado: '0', pendente: '7.5', excedente: '0' },
    ];
    responder(depois);
    salvar();

    await waitFor(() =>
      expect(corpoDaTabela()).toEqual([
        ['Cal (saco)', '25', '8', 'pendente: 17'],
        ['Gesso (saco)', '7,5', '0', 'pendente: 7,5'],
      ]),
    );
    expect(put).toHaveBeenCalledWith('/obras/o1/materiais-previstos', {
      itens: [
        { materialId: 'm-cal', quantidade: 25 },
        { materialId: 'm-gesso', quantidade: 7.5 },
      ],
    });
    expect(get.mock.calls.filter(([c]) => c === '/obras/o1/materiais-previstos')).toHaveLength(2);
  });

  it('remover todas as linhas envia lista vazia (remove os previstos)', async () => {
    responder(linhas.slice(0, 1));
    put.mockResolvedValue([]);
    render(<MateriaisPrevistosForm obraId="o1" status="ORCAMENTO" />);
    await screen.findByRole('table');

    fireEvent.click(screen.getByRole('button', { name: 'Remover material' }));
    responder([]);
    salvar();

    expect(await screen.findByText('Nenhum material previsto')).toBeInTheDocument();
    expect(put).toHaveBeenCalledWith('/obras/o1/materiais-previstos', { itens: [] });
  });

  it('mostra o erro da API no formulário sem perder o que foi editado', async () => {
    responder(linhas.slice(0, 1));
    put.mockRejectedValue(new Error('Material m-cal não encontrado'));
    render(<MateriaisPrevistosForm obraId="o1" status="ANDAMENTO" />);
    await screen.findByRole('table');

    fireEvent.change(screen.getByLabelText('Quantidade'), { target: { value: '30' } });
    salvar();

    expect(await screen.findByText('Material m-cal não encontrado')).toBeInTheDocument();
    expect(screen.getByLabelText('Quantidade')).toHaveValue(30);
    expect(corpoDaTabela()).toEqual([['Cal (saco)', '20', '8', 'pendente: 12']]);
  });

  it('desabilita o botão enquanto salva', async () => {
    responder(linhas.slice(0, 1));
    let terminar!: (valor: unknown) => void;
    put.mockReturnValue(new Promise((resolve) => (terminar = resolve)));
    render(<MateriaisPrevistosForm obraId="o1" status="ANDAMENTO" />);
    await screen.findByRole('table');

    salvar();

    expect(screen.getByRole('button', { name: 'Salvar materiais' })).toBeDisabled();
    terminar([]);
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Salvar materiais' })).toBeEnabled(),
    );
  });

  it.each(['CONCLUIDA', 'CANCELADA'] as const)(
    'em %s mostra só a tabela, sem editor (EAP-44)',
    async (status) => {
      responder(linhas);
      render(<MateriaisPrevistosForm obraId="o1" status={status} />);

      await screen.findByRole('table');
      expect(corpoDaTabela()).toHaveLength(3);
      expect(screen.queryByLabelText('Material')).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Adicionar material' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Salvar materiais' })).not.toBeInTheDocument();
      expect(get).not.toHaveBeenCalledWith('/estoque/materiais');
    },
  );

  it('mostra o erro ao carregar o previsto x utilizado', async () => {
    get.mockRejectedValue(new Error('Obra o1 não encontrada'));
    render(<MateriaisPrevistosForm obraId="o1" status="ANDAMENTO" />);

    expect(await screen.findByText('Obra o1 não encontrada')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });
});
