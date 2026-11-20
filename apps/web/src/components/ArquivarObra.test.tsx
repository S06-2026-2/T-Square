import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import { api } from '../lib/api';
import { moeda } from '../lib/formato';
import type { Obra, SituacaoArquivamento, StatusObra } from '../types';
import ArquivarObra from './ArquivarObra';

jest.mock('../lib/api', () => ({ api: { get: jest.fn(), patch: jest.fn() } }));

const get = api.get as jest.Mock;
const patch = api.patch as jest.Mock;

const SEM_CONEXAO =
  'Sem conexão: não foi possível confirmar o envio. Tente de novo; o mesmo lançamento não será duplicado.';
const erroHttp = (mensagem: string, status = 400) => Object.assign(new Error(mensagem), { status });
const erroRede = () => Object.assign(new Error(SEM_CONEXAO), { status: 0 });

const obra = (status: StatusObra = 'CONCLUIDA'): Obra =>
  ({ id: 'o-1', titulo: 'Forro', clienteNome: 'Maria', status, valorTotal: '8000' }) as Obra;

const situacao = (extra: Partial<SituacaoArquivamento> = {}): SituacaoArquivamento => ({
  concluida: true,
  arquivada: false,
  valorRecebido: 8000,
  valorTotal: 8000,
  clienteQuitado: true,
  gesseirosPendentes: [],
  podeArquivar: true,
  ...extra,
});

const botaoArquivar = () => screen.getByRole('button', { name: 'Arquivar' });

async function abrirPainel() {
  fireEvent.click(screen.getByRole('button', { name: 'Arquivar obra' }));
  await waitFor(() => expect(get).toHaveBeenCalledWith('/obras/o-1/arquivamento'));
}

/** O moeda usa espaço não separável; o matcher normaliza só o texto da tela. */
const brl = (valor: number) => moeda(valor).replace(/ /g, ' ');

beforeEach(() => {
  get.mockReset();
  patch.mockReset();
});

/** ARQ-05 de arquivar-e-limpar-registros. */
describe('ArquivarObra', () => {
  it.each<StatusObra>(['ORCAMENTO', 'FECHADA', 'ANDAMENTO', 'CANCELADA'])(
    'obra %s: sem o botão',
    (status) => {
      const { container } = render(<ArquivarObra obra={obra(status)} onAlterada={jest.fn()} />);

      expect(container).toBeEmptyDOMElement();
    },
  );

  it('concluída e tudo pago: as duas confirmações com ✔ e "Arquivar" habilitado', async () => {
    get.mockResolvedValue(situacao());
    render(<ArquivarObra obra={obra()} onAlterada={jest.fn()} />);

    await abrirPainel();

    expect(await screen.findByTestId('gesseiros-pagos')).toHaveTextContent('Gesseiros pagos: ✔');
    expect(screen.getByTestId('cliente-pagou')).toHaveTextContent(
      `Cliente pagou ${brl(8000)} de ${brl(8000)} ✔`,
    );
    expect(botaoArquivar()).toBeEnabled();
  });

  it('pendências: lista "<nome> — <saldo>", ✘ no cliente e "Arquivar" desabilitado', async () => {
    get.mockResolvedValue(
      situacao({
        valorRecebido: 5000,
        clienteQuitado: false,
        gesseirosPendentes: [
          { id: 'g-1', nome: 'João', saldo: 350.5 },
          { id: 'g-2', nome: 'Ana', saldo: 100 },
        ],
        podeArquivar: false,
      }),
    );
    render(<ArquivarObra obra={obra()} onAlterada={jest.fn()} />);

    await abrirPainel();

    expect(await screen.findByTestId('gesseiros-pagos')).toHaveTextContent(
      `Gesseiros pagos: João — ${brl(350.5)}, Ana — ${brl(100)}`,
    );
    expect(screen.getByTestId('cliente-pagou')).toHaveTextContent(
      `Cliente pagou ${brl(5000)} de ${brl(8000)} ✘`,
    );
    expect(botaoArquivar()).toBeDisabled();
  });

  it('antes da situação chegar, "Arquivar" fica desabilitado', async () => {
    get.mockReturnValue(new Promise(() => undefined));
    render(<ArquivarObra obra={obra()} onAlterada={jest.fn()} />);

    await abrirPainel();

    expect(botaoArquivar()).toBeDisabled();
  });

  it('sucesso: PATCH arquivar uma vez e recarrega', async () => {
    get.mockResolvedValue(situacao());
    patch.mockResolvedValue({});
    const onAlterada = jest.fn();
    render(<ArquivarObra obra={obra()} onAlterada={onAlterada} />);
    await abrirPainel();
    await screen.findByTestId('gesseiros-pagos');

    fireEvent.click(botaoArquivar());

    await waitFor(() => expect(onAlterada).toHaveBeenCalledTimes(1));
    expect(patch).toHaveBeenCalledTimes(1);
    expect(patch).toHaveBeenCalledWith('/obras/o-1/arquivar');
  });

  it('erro HTTP: mensagem da API no painel e recarga', async () => {
    get.mockResolvedValue(situacao());
    patch.mockRejectedValue(erroHttp('Ainda há gesseiros a pagar: João (R$ 350,50)'));
    const onAlterada = jest.fn();
    render(<ArquivarObra obra={obra()} onAlterada={onAlterada} />);
    await abrirPainel();
    await screen.findByTestId('gesseiros-pagos');

    fireEvent.click(botaoArquivar());

    expect(await screen.findByText('Ainda há gesseiros a pagar: João (R$ 350,50)')).toHaveClass(
      'erro',
    );
    await waitFor(() => expect(onAlterada).toHaveBeenCalledTimes(1));
  });

  it('sem rede: mensagem do OFF-08, sem recarga e sem reenviar sozinho', async () => {
    jest.useFakeTimers();
    try {
      get.mockResolvedValue(situacao());
      patch.mockRejectedValue(erroRede());
      const onAlterada = jest.fn();
      render(<ArquivarObra obra={obra()} onAlterada={onAlterada} />);
      await abrirPainel();
      await screen.findByTestId('gesseiros-pagos');

      fireEvent.click(botaoArquivar());

      expect(await screen.findByText(SEM_CONEXAO)).toHaveClass('erro');
      jest.advanceTimersByTime(60_000);
      expect(patch).toHaveBeenCalledTimes(1);
      expect(onAlterada).not.toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
    }
  });

  it('erro ao buscar a situação: mensagem no painel e "Arquivar" desabilitado', async () => {
    get.mockRejectedValue(erroHttp('Obra o-1 não encontrada', 404));
    render(<ArquivarObra obra={obra()} onAlterada={jest.fn()} />);

    await abrirPainel();

    expect(await screen.findByText('Obra o-1 não encontrada')).toHaveClass('erro');
    expect(botaoArquivar()).toBeDisabled();
  });

  it('"Voltar" fecha o painel', async () => {
    get.mockResolvedValue(situacao());
    render(<ArquivarObra obra={obra()} onAlterada={jest.fn()} />);
    await abrirPainel();

    fireEvent.click(screen.getByRole('button', { name: 'Voltar' }));

    expect(screen.getByRole('button', { name: 'Arquivar obra' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Arquivar' })).not.toBeInTheDocument();
  });

  // Auditor web #5: só os gesseiros pendentes já bastam para desabilitar.
  it('cliente quitado mas gesseiro pendente: "Arquivar" desabilitado', async () => {
    get.mockResolvedValue(
      situacao({
        gesseirosPendentes: [{ id: 'g-1', nome: 'João', saldo: 10 }],
        podeArquivar: false,
      }),
    );
    render(<ArquivarObra obra={obra()} onAlterada={jest.fn()} />);
    await abrirPainel();

    await screen.findByTestId('gesseiros-pagos');
    expect(screen.getByTestId('cliente-pagou')).toHaveTextContent('✔');
    expect(botaoArquivar()).toBeDisabled();
  });

  // Auditor web #6: enquanto o PATCH não volta, um segundo clique não envia de novo.
  it('dois cliques com o PATCH pendente: um PATCH só', async () => {
    get.mockResolvedValue(situacao());
    patch.mockReturnValue(new Promise(() => undefined));
    render(<ArquivarObra obra={obra()} onAlterada={jest.fn()} />);
    await abrirPainel();
    await screen.findByTestId('gesseiros-pagos');

    fireEvent.click(botaoArquivar());
    await waitFor(() => expect(botaoArquivar()).toBeDisabled());
    fireEvent.click(botaoArquivar());

    expect(patch).toHaveBeenCalledTimes(1);
  });

  // Auditor web #8: sucesso fecha o painel mesmo se o card continuar montado.
  it('sucesso fecha o painel', async () => {
    get.mockResolvedValue(situacao());
    patch.mockResolvedValue({});
    const onAlterada = jest.fn();
    render(<ArquivarObra obra={obra()} onAlterada={onAlterada} />);
    await abrirPainel();
    await screen.findByTestId('gesseiros-pagos');

    fireEvent.click(botaoArquivar());

    await waitFor(() => expect(onAlterada).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole('button', { name: 'Arquivar' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Arquivar obra' })).toBeInTheDocument();
  });

  // Auditor web #2: com o painel aberto, a recarga trazendo outro status não some com a mensagem.
  it('painel aberto e a obra muda de status no rerender: o painel e o erro ficam', async () => {
    get.mockResolvedValue(situacao());
    patch.mockRejectedValue(erroHttp('A obra já está arquivada'));
    const { rerender } = render(<ArquivarObra obra={obra()} onAlterada={jest.fn()} />);
    await abrirPainel();
    await screen.findByTestId('gesseiros-pagos');
    fireEvent.click(botaoArquivar());
    await screen.findByText('A obra já está arquivada');

    rerender(<ArquivarObra obra={obra('ANDAMENTO')} onAlterada={jest.fn()} />);

    expect(screen.getByText('A obra já está arquivada')).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Arquivar obra' })).toBeInTheDocument();
  });
});
