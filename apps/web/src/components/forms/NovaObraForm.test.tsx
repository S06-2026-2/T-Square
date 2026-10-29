import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';

import { api } from '../../lib/api';
import type { Gesseiro, Material } from '../../types';
import NovaObraForm from './NovaObraForm';

jest.mock('../../lib/api', () => ({ api: { post: jest.fn(), get: jest.fn() } }));

const post = api.post as jest.Mock;
const get = api.get as jest.Mock;

const gesseiros: Gesseiro[] = [
  { id: 'g-ana', nome: 'Ana', ativo: true },
  { id: 'g-beto', nome: 'Beto', ativo: true },
  { id: 'g-caio', nome: 'Caio', ativo: false },
];

const materiais: Material[] = [
  { id: 'm-cal', nome: 'Cal', unidade: 'saco', saldoAtual: '25', estoqueMinimo: '10' },
  { id: 'm-gesso', nome: 'Gesso', unidade: 'saco', saldoAtual: '40', estoqueMinimo: '5' },
];

function preencher(rotulo: string, valor: string) {
  fireEvent.change(screen.getByLabelText(rotulo), { target: { value: valor } });
}

function preencherObrigatorios() {
  preencher('Titulo', 'Forro sala');
  preencher('Cliente', 'Maria Silva');
  preencher('Valor total', '8500');
}

function opcoes(select: HTMLElement) {
  return within(select)
    .getAllByRole('option')
    .map((opcao) => (opcao as HTMLOptionElement).value)
    .filter(Boolean);
}

function salvar() {
  fireEvent.click(screen.getByRole('button', { name: 'Salvar obra' }));
}

beforeEach(() => {
  post.mockReset();
  get.mockReset();
  get.mockImplementation(async (caminho: string) =>
    caminho === '/estoque/materiais' ? materiais : [],
  );
});

describe('NovaObraForm', () => {
  it('exige titulo, cliente e valor total antes de enviar', () => {
    render(<NovaObraForm gesseiros={gesseiros} onSalvo={jest.fn()} />);

    expect(screen.getByLabelText('Titulo')).toBeRequired();
    expect(screen.getByLabelText('Cliente')).toBeRequired();
    expect(screen.getByLabelText('Valor total')).toBeRequired();
  });

  it('cria a obra so com os obrigatorios, valor numerico, e limpa o formulario', async () => {
    post.mockResolvedValue({ id: 'o1' });
    const onSalvo = jest.fn();
    render(<NovaObraForm gesseiros={gesseiros} onSalvo={onSalvo} />);

    preencherObrigatorios();
    salvar();

    await waitFor(() => expect(onSalvo).toHaveBeenCalled());
    expect(post).toHaveBeenCalledWith('/obras', {
      titulo: 'Forro sala',
      clienteNome: 'Maria Silva',
      valorTotal: 8500,
    });
    expect(screen.getByLabelText('Titulo')).toHaveValue('');
    expect(screen.getByLabelText('Cliente')).toHaveValue('');
    expect(screen.getByLabelText('Valor total')).toHaveValue(null);
  });

  it('envia opcionais, planta baixa e pagamento aninhado com numeros', async () => {
    post.mockResolvedValue({ id: 'o1' });
    render(<NovaObraForm gesseiros={gesseiros} onSalvo={jest.fn()} />);

    preencherObrigatorios();
    preencher('Descricao', 'Forro com sanca');
    preencher('Telefone do cliente', '(35) 98888-0001');
    preencher('Endereco', 'Rua A, 10');
    preencher('Planta baixa (URL)', 'https://drive.example.com/planta.pdf');
    expect(screen.getByLabelText('Planta baixa (URL)')).toHaveAttribute('type', 'url');

    expect(screen.queryByLabelText('Parcelas')).not.toBeInTheDocument();
    expect(opcoes(screen.getByLabelText('Forma de pagamento'))).toEqual([
      'PIX',
      'DINHEIRO',
      'CARTAO_CREDITO',
      'CARTAO_DEBITO',
      'BOLETO',
      'TRANSFERENCIA',
    ]);
    preencher('Forma de pagamento', 'CARTAO_CREDITO');
    preencher('Parcelas', '3');
    preencher('Valor de entrada', '1000');
    salvar();

    await waitFor(() => expect(post).toHaveBeenCalled());
    expect(post).toHaveBeenCalledWith('/obras', {
      titulo: 'Forro sala',
      clienteNome: 'Maria Silva',
      valorTotal: 8500,
      descricao: 'Forro com sanca',
      clienteTelefone: '(35) 98888-0001',
      endereco: 'Rua A, 10',
      plantaBaixaUrl: 'https://drive.example.com/planta.pdf',
      pagamento: { forma: 'CARTAO_CREDITO', parcelas: 3, valorEntrada: 1000 },
    });
  });

  it('omite parcelas e entrada vazias do pagamento', async () => {
    post.mockResolvedValue({ id: 'o1' });
    render(<NovaObraForm gesseiros={gesseiros} onSalvo={jest.fn()} />);

    preencherObrigatorios();
    preencher('Forma de pagamento', 'PIX');
    salvar();

    await waitFor(() => expect(post).toHaveBeenCalled());
    expect(post.mock.calls[0][1].pagamento).toEqual({ forma: 'PIX' });
  });

  it('monta a equipe so com gesseiros ativos, sem repetir gesseiro entre linhas', async () => {
    post.mockResolvedValue({ id: 'o1' });
    render(<NovaObraForm gesseiros={gesseiros} onSalvo={jest.fn()} />);

    preencherObrigatorios();
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar gesseiro' }));
    const [primeiro] = screen.getAllByLabelText('Gesseiro');
    expect(opcoes(primeiro)).toEqual(['g-ana', 'g-beto']);
    expect(primeiro).toBeRequired();
    expect(screen.getAllByLabelText('Valor combinado')[0]).toBeRequired();

    fireEvent.change(primeiro, { target: { value: 'g-ana' } });
    fireEvent.change(screen.getAllByLabelText('Valor combinado')[0], {
      target: { value: '500' },
    });
    fireEvent.change(screen.getAllByLabelText('Funcao')[0], { target: { value: 'Forro' } });

    fireEvent.click(screen.getByRole('button', { name: 'Adicionar gesseiro' }));
    const segundo = screen.getAllByLabelText('Gesseiro')[1];
    expect(opcoes(segundo)).toEqual(['g-beto']);

    fireEvent.change(segundo, { target: { value: 'g-beto' } });
    fireEvent.change(screen.getAllByLabelText('Valor combinado')[1], {
      target: { value: '300' },
    });
    salvar();

    await waitFor(() => expect(post).toHaveBeenCalled());
    expect(post.mock.calls[0][1].gesseiros).toEqual([
      { gesseiroId: 'g-ana', valorCombinado: 500, funcao: 'Forro' },
      { gesseiroId: 'g-beto', valorCombinado: 300 },
    ]);
  });

  it('remove uma linha de gesseiro e nao envia equipe vazia', async () => {
    post.mockResolvedValue({ id: 'o1' });
    render(<NovaObraForm gesseiros={gesseiros} onSalvo={jest.fn()} />);

    preencherObrigatorios();
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar gesseiro' }));
    fireEvent.click(screen.getByRole('button', { name: 'Remover' }));
    expect(screen.queryByLabelText('Gesseiro')).not.toBeInTheDocument();
    salvar();

    await waitFor(() => expect(post).toHaveBeenCalled());
    expect(post.mock.calls[0][1]).not.toHaveProperty('gesseiros');
  });

  it('mostra o erro da API sem perder o que foi preenchido', async () => {
    post.mockRejectedValue(new Error('titulo must be longer than or equal to 3 characters'));
    const onSalvo = jest.fn();
    render(<NovaObraForm gesseiros={gesseiros} onSalvo={onSalvo} />);

    preencherObrigatorios();
    preencher('Titulo', 'Fo');
    salvar();

    expect(
      await screen.findByText('titulo must be longer than or equal to 3 characters'),
    ).toBeInTheDocument();
    expect(onSalvo).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Titulo')).toHaveValue('Fo');
    expect(screen.getByLabelText('Cliente')).toHaveValue('Maria Silva');
    expect(screen.getByLabelText('Valor total')).toHaveValue(8500);
  });

  it('desabilita o botao enquanto a obra esta sendo salva', async () => {
    let terminar!: (valor: unknown) => void;
    post.mockReturnValue(new Promise((resolve) => (terminar = resolve)));
    render(<NovaObraForm gesseiros={gesseiros} onSalvo={jest.fn()} />);

    preencherObrigatorios();
    salvar();

    expect(screen.getByRole('button', { name: 'Salvar obra' })).toBeDisabled();
    terminar({ id: 'o1' });
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Salvar obra' })).toBeEnabled(),
    );
  });
  describe('materiais previstos (EAP-37)', () => {
    it('carrega os materiais da API para a seção "Materiais previstos"', async () => {
      render(<NovaObraForm gesseiros={gesseiros} onSalvo={jest.fn()} />);

      expect(get).toHaveBeenCalledWith('/estoque/materiais');
      fireEvent.click(screen.getByRole('button', { name: 'Adicionar material' }));
      await waitFor(() =>
        expect(opcoes(screen.getByLabelText('Material'))).toEqual(['m-cal', 'm-gesso']),
      );
    });

    it('obra com itens envia materiaisPrevistos com a quantidade numérica', async () => {
      post.mockResolvedValue({ id: 'o1' });
      const onSalvo = jest.fn();
      render(<NovaObraForm gesseiros={gesseiros} onSalvo={onSalvo} />);
      await waitFor(() => expect(get).toHaveBeenCalled());

      preencherObrigatorios();
      fireEvent.click(screen.getByRole('button', { name: 'Adicionar material' }));
      await waitFor(() =>
        expect(opcoes(screen.getByLabelText('Material'))).toEqual(['m-cal', 'm-gesso']),
      );
      fireEvent.change(screen.getByLabelText('Material'), { target: { value: 'm-cal' } });
      fireEvent.change(screen.getByLabelText('Quantidade'), { target: { value: '20' } });
      fireEvent.click(screen.getByRole('button', { name: 'Adicionar material' }));
      fireEvent.change(screen.getAllByLabelText('Material')[1], { target: { value: 'm-gesso' } });
      fireEvent.change(screen.getAllByLabelText('Quantidade')[1], { target: { value: '7.5' } });
      salvar();

      await waitFor(() => expect(onSalvo).toHaveBeenCalled());
      expect(post).toHaveBeenCalledWith('/obras', {
        titulo: 'Forro sala',
        clienteNome: 'Maria Silva',
        valorTotal: 8500,
        materiaisPrevistos: [
          { materialId: 'm-cal', quantidade: 20 },
          { materialId: 'm-gesso', quantidade: 7.5 },
        ],
      });
      // O formulário volta vazio, inclusive a seção de materiais.
      expect(screen.queryByLabelText('Material')).not.toBeInTheDocument();
    });

    it('obra sem itens (ou com a linha removida) não envia o campo', async () => {
      post.mockResolvedValue({ id: 'o1' });
      render(<NovaObraForm gesseiros={gesseiros} onSalvo={jest.fn()} />);
      await waitFor(() => expect(get).toHaveBeenCalled());

      preencherObrigatorios();
      fireEvent.click(screen.getByRole('button', { name: 'Adicionar material' }));
      fireEvent.click(screen.getByRole('button', { name: 'Remover material' }));
      salvar();

      await waitFor(() => expect(post).toHaveBeenCalled());
      expect(post.mock.calls[0][1]).not.toHaveProperty('materiaisPrevistos');
    });

    it('mostra o erro ao carregar materiais sem bloquear a criação da obra', async () => {
      get.mockRejectedValue(new Error('Falha ao listar materiais'));
      post.mockResolvedValue({ id: 'o1' });
      const onSalvo = jest.fn();
      render(<NovaObraForm gesseiros={gesseiros} onSalvo={onSalvo} />);

      expect(await screen.findByText('Falha ao listar materiais')).toBeInTheDocument();
      preencherObrigatorios();
      salvar();
      await waitFor(() => expect(onSalvo).toHaveBeenCalled());
    });
  });
});
