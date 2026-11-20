import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

import { api } from '../lib/api';
import type { Gesseiro, LinhaPrevistoUtilizado, Material, Obra, StatusObra } from '../types';
import Obras from './Obras';

jest.mock('../lib/api', () => ({
  api: { get: jest.fn(), post: jest.fn(), patch: jest.fn() },
}));

const get = api.get as jest.Mock;
const post = api.post as jest.Mock;
const patch = api.patch as jest.Mock;

const gesseiros: Gesseiro[] = [{ id: 'g-ana', nome: 'Ana', ativo: true }];

function obra(id: string, status: StatusObra): Obra {
  return {
    id,
    titulo: `Obra ${id}`,
    clienteNome: 'Cliente',
    status,
    valorTotal: 1000,
    gesseiros: [],
  };
}

const todas: Obra[] = [
  obra('orc', 'ORCAMENTO'),
  obra('fec', 'FECHADA'),
  obra('and', 'ANDAMENTO'),
  obra('con', 'CONCLUIDA'),
  obra('can', 'CANCELADA'),
];

/** Caminhos de GET /obras chamados ate agora, na ordem. */
function chamadasObras(): string[] {
  return get.mock.calls.map(([caminho]) => caminho as string).filter((c) => c.startsWith('/obras'));
}

function ultimaChamadaObras() {
  const chamadas = chamadasObras();
  return chamadas[chamadas.length - 1];
}

function card(titulo: string) {
  return screen.getByRole('heading', { name: titulo }).closest('article') as HTMLElement;
}

const materiais: Material[] = [
  { id: 'm-cal', nome: 'Cal', unidade: 'saco', saldoAtual: '25', estoqueMinimo: '10' },
];

const previstoCal: LinhaPrevistoUtilizado = {
  materialId: 'm-cal',
  material: 'Cal',
  unidade: 'saco',
  previsto: '20',
  utilizado: '8',
  pendente: '12',
  excedente: '0',
  semPrevisao: false,
};

/** GET por caminho, incluindo o previsto x utilizado de qualquer obra e a lista de materiais. */
function responderComPrevistos() {
  get.mockImplementation(async (caminho: string) => {
    if (caminho === '/gesseiros') return gesseiros;
    if (caminho === '/estoque/materiais') return materiais;
    if (/^\/obras\/[^/]+\/materiais-previstos$/.test(caminho)) return [previstoCal];
    return todas;
  });
}

function abrirPrevistos(titulo: string) {
  fireEvent.click(within(card(titulo)).getByText('Materiais previstos'));
}

async function criarObra() {
  fireEvent.click(screen.getByRole('button', { name: 'Nova obra' }));
  fireEvent.change(screen.getByLabelText('Titulo'), { target: { value: 'Forro sala' } });
  fireEvent.change(screen.getByLabelText('Cliente'), { target: { value: 'Maria Silva' } });
  fireEvent.change(screen.getByLabelText('Valor total'), { target: { value: '8500' } });
  fireEvent.click(screen.getByRole('button', { name: 'Salvar obra' }));
}

beforeEach(() => {
  get.mockReset();
  post.mockReset();
  patch.mockReset();
  get.mockImplementation(async (caminho: string) => (caminho === '/gesseiros' ? gesseiros : todas));
});

describe('Obras', () => {
  it('volta o filtro para Todas depois de criar uma obra com outro filtro ativo', async () => {
    post.mockResolvedValue({ id: 'nova' });
    render(<Obras />);
    await screen.findByText('Obra orc');

    fireEvent.click(screen.getByRole('button', { name: 'Fechadas' }));
    await waitFor(() => expect(chamadasObras()).toContain('/obras?status=FECHADA'));

    await criarObra();

    await waitFor(() => expect(ultimaChamadaObras()).toBe('/obras'));
    expect(screen.getByRole('button', { name: 'Todas' })).toHaveClass('ativo');
  });

  it('recarrega a lista depois de criar uma obra com o filtro ja em Todas', async () => {
    post.mockResolvedValue({ id: 'nova' });
    render(<Obras />);
    await screen.findByText('Obra orc');
    const antes = chamadasObras().length;
    get.mockImplementation(async (caminho: string) =>
      caminho === '/gesseiros' ? gesseiros : [obra('nova', 'ORCAMENTO'), ...todas],
    );

    await criarObra();

    await waitFor(() => expect(chamadasObras()).toHaveLength(antes + 1));
    expect(ultimaChamadaObras()).toBe('/obras');
    const nova = await screen.findByRole('heading', { name: 'Obra nova' });
    expect(
      within(nova.closest('article') as HTMLElement).getByText('Aguardando cliente'),
    ).toBeInTheDocument();
  });

  it('so oferece alocacao em obras que ainda nao terminaram', async () => {
    render(<Obras />);
    await screen.findByText('Obra orc');

    for (const titulo of ['Obra orc', 'Obra fec', 'Obra and']) {
      expect(within(card(titulo)).getByRole('button', { name: 'Alocar' })).toBeInTheDocument();
    }
    for (const titulo of ['Obra con', 'Obra can']) {
      expect(
        within(card(titulo)).queryByRole('button', { name: 'Alocar' }),
      ).not.toBeInTheDocument();
    }
  });

  it('recarrega a lista depois de alocar um gesseiro', async () => {
    post.mockResolvedValue({ id: 'a1' });
    render(<Obras />);
    await screen.findByText('Obra orc');
    const antes = chamadasObras().length;

    const alvo = within(card('Obra orc'));
    await waitFor(() =>
      expect(
        within(alvo.getByLabelText('Gesseiro')).getByRole('option', { name: 'Ana' }),
      ).toBeInTheDocument(),
    );
    get.mockImplementation(async (caminho: string) => {
      if (caminho === '/gesseiros') return gesseiros;
      const alocada: Obra = {
        ...obra('orc', 'ORCAMENTO'),
        gesseiros: [{ id: 'a1', gesseiroId: 'g-ana', valorCombinado: 700, gesseiro: gesseiros[0] }],
      };
      return [alocada, ...todas.slice(1)];
    });
    fireEvent.change(alvo.getByLabelText('Gesseiro'), { target: { value: 'g-ana' } });
    fireEvent.change(alvo.getByLabelText('Valor combinado'), { target: { value: '700' } });
    fireEvent.click(alvo.getByRole('button', { name: 'Alocar' }));

    await waitFor(() => expect(chamadasObras()).toHaveLength(antes + 1));
    expect(post).toHaveBeenCalledWith('/obras/orc/gesseiros', {
      gesseiroId: 'g-ana',
      valorCombinado: 700,
    });
    const alocados = await waitFor(() => {
      const lista = card('Obra orc').querySelector('.lista-gesseiros');
      expect(lista).not.toBeNull();
      return lista as HTMLElement;
    });
    expect(alocados).toHaveTextContent(/Ana - R\$\s700,00/);
  });

  it('mostra a ação "Materiais previstos" em todo card e só monta o formulário ao abrir', async () => {
    responderComPrevistos();
    render(<Obras />);
    await screen.findByText('Obra orc');

    for (const titulo of ['Obra orc', 'Obra fec', 'Obra and', 'Obra con', 'Obra can']) {
      expect(within(card(titulo)).getByText('Materiais previstos').tagName).toBe('SUMMARY');
    }
    expect(get).not.toHaveBeenCalledWith('/obras/orc/materiais-previstos');
  });

  it('abre o editor com os itens atuais nos 3 status editáveis (EAP-43)', async () => {
    responderComPrevistos();
    render(<Obras />);
    await screen.findByText('Obra orc');

    for (const [id, titulo] of [
      ['orc', 'Obra orc'],
      ['fec', 'Obra fec'],
      ['and', 'Obra and'],
    ]) {
      abrirPrevistos(titulo);
      const alvo = within(card(titulo));
      expect(await alvo.findByRole('table')).toHaveTextContent('pendente: 12');
      await waitFor(() => expect(alvo.getByLabelText('Material')).toHaveValue('m-cal'));
      expect(alvo.getByLabelText('Quantidade')).toHaveValue(20);
      expect(alvo.getByRole('button', { name: 'Salvar materiais' })).toBeInTheDocument();
      expect(get).toHaveBeenCalledWith(`/obras/${id}/materiais-previstos`);
    }
  });

  it('em obra CONCLUIDA ou CANCELADA mostra só o previsto x utilizado, sem editor (EAP-44)', async () => {
    responderComPrevistos();
    render(<Obras />);
    await screen.findByText('Obra orc');

    for (const titulo of ['Obra con', 'Obra can']) {
      abrirPrevistos(titulo);
      const alvo = within(card(titulo));
      expect(await alvo.findByRole('table')).toHaveTextContent('pendente: 12');
      expect(alvo.queryByLabelText('Material')).not.toBeInTheDocument();
      expect(alvo.queryByRole('button', { name: 'Adicionar material' })).not.toBeInTheDocument();
      expect(alvo.queryByRole('button', { name: 'Salvar materiais' })).not.toBeInTheDocument();
    }
  });
});

describe('Obras: conexão de volta (OFF-15)', () => {
  function chamadas(caminho: string) {
    return get.mock.calls.filter(([c]) => c === caminho).length;
  }

  it('o evento online busca de novo as obras do filtro atual e os gesseiros, sem fechar o formulário preenchido', async () => {
    render(<Obras />);
    await screen.findByText('Obra orc');
    fireEvent.click(screen.getByRole('button', { name: 'Fechadas' }));
    await waitFor(() => expect(ultimaChamadaObras()).toBe('/obras?status=FECHADA'));
    fireEvent.click(screen.getByRole('button', { name: 'Nova obra' }));
    fireEvent.change(screen.getByLabelText('Titulo'), { target: { value: 'Forro sala' } });
    fireEvent.change(screen.getByLabelText('Cliente'), { target: { value: 'Maria Silva' } });
    const obrasAntes = chamadas('/obras?status=FECHADA');
    expect(chamadas('/gesseiros')).toBe(1);
    get.mockImplementation(async (caminho: string) =>
      caminho === '/gesseiros' ? gesseiros : [obra('reconectada', 'FECHADA')],
    );

    act(() => {
      window.dispatchEvent(new Event('online'));
    });

    expect(await screen.findByRole('heading', { name: 'Obra reconectada' })).toBeInTheDocument();
    expect(chamadas('/obras?status=FECHADA')).toBe(obrasAntes + 1);
    await waitFor(() => expect(chamadas('/gesseiros')).toBe(2));
    expect(screen.getByLabelText('Titulo')).toHaveValue('Forro sala');
    expect(screen.getByLabelText('Cliente')).toHaveValue('Maria Silva');
    expect(screen.getByRole('button', { name: 'Fechadas' })).toHaveClass('ativo');
    expect(post).not.toHaveBeenCalled();
  });
});

/** TRN-05, TRN-10 (exibição do motivo) e TRN-13 (P1 AC9/AC11, reconexão) de obras-transicoes-status. */
describe('Obras: ações de status', () => {
  const SEM_CONEXAO =
    'Sem conexão: não foi possível confirmar o envio. Tente de novo; o mesmo lançamento não será duplicado.';

  it('cada card em aberto mostra o botão de avanço do seu status; os finais, nenhum', async () => {
    render(<Obras />);
    await screen.findByText('Obra orc');

    expect(
      within(card('Obra orc')).getByRole('button', { name: 'Cliente aprovou' }),
    ).toBeInTheDocument();
    expect(
      within(card('Obra fec')).getByRole('button', { name: 'Iniciar obra' }),
    ).toBeInTheDocument();
    expect(
      within(card('Obra and')).getByRole('button', { name: 'Concluir obra' }),
    ).toBeInTheDocument();
    for (const titulo of ['Obra con', 'Obra can']) {
      for (const nome of ['Cliente aprovou', 'Iniciar obra', 'Concluir obra', 'Cancelar obra']) {
        expect(within(card(titulo)).queryByRole('button', { name: nome })).toBeNull();
      }
    }
  });

  it('transição aplicada: recarrega com o filtro atual e o card mostra o novo status', async () => {
    patch.mockResolvedValue({});
    render(<Obras />);
    await screen.findByText('Obra orc');
    fireEvent.click(screen.getByRole('button', { name: 'Aguardando cliente' }));
    await waitFor(() => expect(ultimaChamadaObras()).toBe('/obras?status=ORCAMENTO'));
    const antes = chamadasObras().length;
    get.mockImplementation(async (caminho: string) =>
      caminho === '/gesseiros' ? gesseiros : [obra('orc', 'FECHADA')],
    );

    fireEvent.click(within(card('Obra orc')).getByRole('button', { name: 'Cliente aprovou' }));

    await waitFor(() => expect(chamadasObras()).toHaveLength(antes + 1));
    expect(patch).toHaveBeenCalledWith('/obras/orc/fechar');
    expect(ultimaChamadaObras()).toBe('/obras?status=ORCAMENTO');
    expect(
      await within(card('Obra orc')).findByRole('button', { name: 'Iniciar obra' }),
    ).toBeInTheDocument();
  });

  it('erro HTTP: recarrega com o filtro atual e depois mostra a mensagem da API (P1 AC9)', async () => {
    const mensagem = 'Não é possível fechar uma obra com status FECHADA';
    patch.mockRejectedValue(Object.assign(new Error(mensagem), { status: 400 }));
    render(<Obras />);
    await screen.findByText('Obra orc');
    const antes = chamadasObras().length;
    get.mockImplementation(async (caminho: string) =>
      caminho === '/gesseiros' ? gesseiros : [obra('orc', 'FECHADA')],
    );

    fireEvent.click(within(card('Obra orc')).getByRole('button', { name: 'Cliente aprovou' }));

    // O carregar() limpa o erro; a mensagem aparece depois dele e fica na tela.
    expect(await screen.findByText(mensagem)).toHaveClass('erro');
    expect(chamadasObras()).toHaveLength(antes + 1);
    expect(ultimaChamadaObras()).toBe('/obras');
    expect(
      within(card('Obra orc')).getByRole('button', { name: 'Iniciar obra' }),
    ).toBeInTheDocument();
  });

  it('falha de rede: mostra a mensagem do OFF-08, não recarrega e não reenvia (P1 AC11)', async () => {
    jest.spyOn(window, 'confirm').mockReturnValue(true);
    patch.mockRejectedValue(Object.assign(new Error(SEM_CONEXAO), { status: 0 }));
    render(<Obras />);
    await screen.findByText('Obra orc');
    const antes = chamadasObras().length;

    fireEvent.click(within(card('Obra and')).getByRole('button', { name: 'Concluir obra' }));

    expect(await screen.findByText(SEM_CONEXAO)).toHaveClass('erro');
    expect(chamadasObras()).toHaveLength(antes);
    expect(patch).toHaveBeenCalledTimes(1);
    expect(
      within(card('Obra and')).getByRole('button', { name: 'Concluir obra' }),
    ).toBeInTheDocument();
    (window.confirm as jest.Mock).mockRestore();
  });

  it('obra CANCELADA mostra "Motivo do cancelamento: <motivo>"', async () => {
    get.mockImplementation(async (caminho: string) =>
      caminho === '/gesseiros'
        ? gesseiros
        : [
            { ...obra('can', 'CANCELADA'), motivoCancelamento: 'Cliente desistiu' },
            obra('orc', 'ORCAMENTO'),
          ],
    );
    render(<Obras />);
    await screen.findByText('Obra can');

    expect(
      within(card('Obra can')).getByText('Motivo do cancelamento: Cliente desistiu'),
    ).toBeInTheDocument();
    expect(within(card('Obra orc')).queryByText(/Motivo do cancelamento/)).toBeNull();
  });

  it('cancelar com 400 e a recarga trazendo a obra CONCLUIDA: a mensagem da API continua no card (P2 AC7)', async () => {
    const mensagem = 'Não é possível cancelar uma obra com status CONCLUIDA';
    patch.mockRejectedValue(Object.assign(new Error(mensagem), { status: 400 }));
    render(<Obras />);
    await screen.findByText('Obra orc');
    fireEvent.click(within(card('Obra and')).getByRole('button', { name: 'Cancelar obra' }));
    fireEvent.change(within(card('Obra and')).getByLabelText('Motivo'), {
      target: { value: 'Cliente desistiu' },
    });
    const antes = chamadasObras().length;
    get.mockImplementation(async (caminho: string) =>
      caminho === '/gesseiros'
        ? gesseiros
        : todas.map((o) => (o.id === 'and' ? obra('and', 'CONCLUIDA') : o)),
    );

    fireEvent.click(
      within(card('Obra and')).getByRole('button', { name: 'Confirmar cancelamento' }),
    );

    await waitFor(() => expect(chamadasObras()).toHaveLength(antes + 1));
    await waitFor(() =>
      expect(within(card('Obra and')).getByText('Concluida')).toBeInTheDocument(),
    );
    expect(within(card('Obra and')).getByText(mensagem)).toHaveClass('erro');
    expect(within(card('Obra and')).getByLabelText('Motivo')).toHaveValue('Cliente desistiu');
  });

  it('o formulário de cancelamento preenchido sobrevive à reconexão (OFF-15)', async () => {
    render(<Obras />);
    await screen.findByText('Obra orc');
    fireEvent.click(within(card('Obra fec')).getByRole('button', { name: 'Cancelar obra' }));
    fireEvent.change(within(card('Obra fec')).getByLabelText('Motivo'), {
      target: { value: 'Cliente desistiu' },
    });
    const antes = chamadasObras().length;

    act(() => {
      window.dispatchEvent(new Event('online'));
    });

    await waitFor(() => expect(chamadasObras()).toHaveLength(antes + 1));
    expect(within(card('Obra fec')).getByLabelText('Motivo')).toHaveValue('Cliente desistiu');
    expect(patch).not.toHaveBeenCalled();
  });
});

/** ARQ-02, ARQ-05, ARQ-07 e ARQ-08 de arquivar-e-limpar-registros, na página. */
describe('Obras: valor recebido e arquivamento', () => {
  const arquivada = { ...obra('arq', 'CONCLUIDA'), arquivadoEm: '2026-11-20T15:00:00.000Z' };
  const situacaoOk = {
    concluida: true,
    arquivada: false,
    valorRecebido: 1000,
    valorTotal: 1000,
    clienteQuitado: true,
    gesseirosPendentes: [],
    podeArquivar: true,
  };

  beforeEach(() => {
    get.mockReset();
    patch.mockReset();
    get.mockImplementation(async (caminho: string) => {
      if (caminho === '/gesseiros') return gesseiros;
      if (caminho === '/obras?arquivados=true') return [arquivada];
      if (caminho === '/obras/con/arquivamento') return situacaoOk;
      return todas;
    });
  });

  it('todo card tem o valor recebido; só o CONCLUIDA tem "Arquivar obra"', async () => {
    render(<Obras />);
    await screen.findByText('Obra con');

    for (const titulo of ['Obra orc', 'Obra con', 'Obra can']) {
      expect(within(card(titulo)).getByLabelText('Valor recebido do cliente')).toBeInTheDocument();
    }
    expect(screen.getAllByRole('button', { name: 'Arquivar obra' })).toHaveLength(1);
    expect(
      within(card('Obra con')).getByRole('button', { name: 'Arquivar obra' }),
    ).toBeInTheDocument();
  });

  it('salvar o valor recebido faz o PATCH e recarrega a lista', async () => {
    patch.mockResolvedValue({});
    render(<Obras />);
    await screen.findByText('Obra con');
    const antes = chamadasObras().length;

    const cartao = card('Obra orc');
    fireEvent.change(within(cartao).getByLabelText('Valor recebido do cliente'), {
      target: { value: '400' },
    });
    fireEvent.click(within(cartao).getByRole('button', { name: 'Salvar' }));

    await waitFor(() => expect(chamadasObras()).toHaveLength(antes + 1));
    expect(patch).toHaveBeenCalledWith('/obras/orc', { valorRecebido: 400 });
  });

  it('arquivar: PATCH e a lista recarrega com o filtro atual', async () => {
    patch.mockResolvedValue({});
    render(<Obras />);
    await screen.findByText('Obra con');
    fireEvent.click(within(card('Obra con')).getByRole('button', { name: 'Arquivar obra' }));
    const botao = await within(card('Obra con')).findByRole('button', { name: 'Arquivar' });
    await waitFor(() => expect(botao).toBeEnabled());
    const antes = chamadasObras().filter((c) => c === '/obras').length;

    fireEvent.click(botao);

    await waitFor(() =>
      expect(chamadasObras().filter((c) => c === '/obras')).toHaveLength(antes + 1),
    );
    expect(patch).toHaveBeenCalledWith('/obras/con/arquivar');
  });

  it('"Ver arquivados" lista as arquivadas; restaurar recarrega a lista principal', async () => {
    patch.mockResolvedValue({});
    render(<Obras />);
    await screen.findByText('Obra con');

    fireEvent.click(screen.getByRole('button', { name: 'Ver arquivados' }));

    const lista = await screen.findByLabelText('Arquivados');
    expect(await within(lista).findByText('Obra arq (Cliente)')).toBeInTheDocument();
    expect(within(lista).getByText('Será apagado em 27/11/2026')).toBeInTheDocument();
    const antes = chamadasObras().filter((c) => c === '/obras').length;

    fireEvent.click(within(lista).getByRole('button', { name: 'Restaurar' }));

    await waitFor(() =>
      expect(chamadasObras().filter((c) => c === '/obras')).toHaveLength(antes + 1),
    );
    expect(patch).toHaveBeenCalledWith('/obras/arq/restaurar');
    expect(within(lista).queryByText('Obra arq (Cliente)')).not.toBeInTheDocument();
  });

  it('"Fechar arquivados" esconde a lista', async () => {
    render(<Obras />);
    await screen.findByText('Obra con');
    fireEvent.click(screen.getByRole('button', { name: 'Ver arquivados' }));
    await screen.findByLabelText('Arquivados');

    fireEvent.click(screen.getByRole('button', { name: 'Fechar arquivados' }));

    expect(screen.queryByLabelText('Arquivados')).not.toBeInTheDocument();
  });

  it('arquivar com o filtro "Concluidas": recarrega com ?status=CONCLUIDA e o card sai (ARQ-05)', async () => {
    let arquivou = false;
    patch.mockImplementation(async () => {
      arquivou = true;
      return {};
    });
    get.mockImplementation(async (caminho: string) => {
      if (caminho === '/gesseiros') return gesseiros;
      if (caminho === '/obras/con/arquivamento') return situacaoOk;
      if (caminho === '/obras?status=CONCLUIDA') return arquivou ? [] : [obra('con', 'CONCLUIDA')];
      return todas;
    });
    render(<Obras />);
    await screen.findByText('Obra orc');
    fireEvent.click(screen.getByRole('button', { name: 'Concluidas' }));
    await waitFor(() => expect(ultimaChamadaObras()).toBe('/obras?status=CONCLUIDA'));
    await waitFor(() => expect(screen.queryByText('Obra orc')).not.toBeInTheDocument());
    fireEvent.click(within(card('Obra con')).getByRole('button', { name: 'Arquivar obra' }));
    const botao = await within(card('Obra con')).findByRole('button', { name: 'Arquivar' });
    await waitFor(() => expect(botao).toBeEnabled());

    fireEvent.click(botao);

    await waitFor(() => expect(screen.queryByText('Obra con')).not.toBeInTheDocument());
    expect(ultimaChamadaObras()).toBe('/obras?status=CONCLUIDA');
  });

  it('com "Ver arquivados" aberto, arquivar busca os arquivados de novo (auditor web #25/#26)', async () => {
    patch.mockResolvedValue({});
    render(<Obras />);
    await screen.findByText('Obra con');
    fireEvent.click(screen.getByRole('button', { name: 'Ver arquivados' }));
    await within(await screen.findByLabelText('Arquivados')).findByText('Obra arq (Cliente)');
    expect(chamadasObras().filter((c) => c === '/obras?arquivados=true')).toHaveLength(1);
    fireEvent.click(within(card('Obra con')).getByRole('button', { name: 'Arquivar obra' }));
    const botao = await within(card('Obra con')).findByRole('button', { name: 'Arquivar' });
    await waitFor(() => expect(botao).toBeEnabled());

    fireEvent.click(botao);

    await waitFor(() =>
      expect(chamadasObras().filter((c) => c === '/obras?arquivados=true')).toHaveLength(2),
    );
  });
});
