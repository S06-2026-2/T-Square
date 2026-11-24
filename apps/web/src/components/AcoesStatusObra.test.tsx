import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';

import { api } from '../lib/api';
import type { Obra, StatusObra } from '../types';
import AcoesStatusObra from './AcoesStatusObra';

jest.mock('../lib/api', () => ({ api: { patch: jest.fn() } }));

const patch = api.patch as jest.Mock;

/** TRN-05, TRN-10, TRN-11 e TRN-13 de .claude/specs/features/obras-transicoes-status/spec.md. */
const SEM_CONEXAO =
  'Sem conexão: não foi possível confirmar o envio. Tente de novo; o mesmo lançamento não será duplicado.';

const erroHttp = (mensagem: string, status = 400) => Object.assign(new Error(mensagem), { status });
const erroRede = () => Object.assign(new Error(SEM_CONEXAO), { status: 0 });

const joao = {
  id: 'a1',
  gesseiroId: 'g1',
  valorCombinado: '2500.00',
  gesseiro: { id: 'g1', nome: 'João', ativo: true },
};

function obra(status: StatusObra, gesseiros: Obra['gesseiros'] = [joao]): Obra {
  return { id: 'o1', titulo: 'Forro', clienteNome: 'Maria', status, valorTotal: 1000, gesseiros };
}

function montar(o: Obra) {
  const onAlterada = jest.fn().mockResolvedValue(undefined);
  const onErro = jest.fn().mockResolvedValue(undefined);
  const resultado = render(<AcoesStatusObra obra={o} onAlterada={onAlterada} onErro={onErro} />);
  return { onAlterada, onErro, ...resultado };
}

const botao = (nome: string) => screen.getByRole('button', { name: nome });

/** Espera de verdade: um reenvio automático (timer, retry) teria tempo de acontecer. */
const esperarUmPouco = () => act(() => new Promise((r) => setTimeout(r, 300)));

beforeEach(() => {
  patch.mockReset();
  jest.restoreAllMocks();
});

describe('AcoesStatusObra: avanço (TRN-05)', () => {
  it.each([
    ['ORCAMENTO', 'Cliente aprovou', 'fechar'],
    ['FECHADA', 'Iniciar obra', 'iniciar'],
  ] as const)(
    '%s: "%s" chama PATCH /obras/:id/%s e avisa a página',
    async (status, rotulo, acao) => {
      patch.mockResolvedValue({});
      const { onAlterada, onErro } = montar(obra(status));

      fireEvent.click(botao(rotulo));

      await waitFor(() => expect(onAlterada).toHaveBeenCalledTimes(1));
      expect(patch).toHaveBeenCalledWith(`/obras/o1/${acao}`);
      expect(onErro).not.toHaveBeenCalled();
    },
  );

  it('mostra só o botão de avanço do status atual, mais o Cancelar', () => {
    montar(obra('ORCAMENTO'));

    expect(screen.getAllByRole('button').map((b) => b.textContent)).toEqual([
      'Cliente aprovou',
      'Cancelar obra',
    ]);
  });

  it.each(['CONCLUIDA', 'CANCELADA'] as const)('%s: nenhum botão de status', (status) => {
    const { container } = montar(obra(status));

    expect(screen.queryAllByRole('button')).toHaveLength(0);
    expect(container).toBeEmptyDOMElement();
  });

  it('desabilita o botão enquanto o PATCH não responde (sem duplo clique)', async () => {
    let responder!: () => void;
    patch.mockReturnValue(new Promise<void>((r) => (responder = r)));
    montar(obra('ORCAMENTO'));

    fireEvent.click(botao('Cliente aprovou'));
    fireEvent.click(botao('Cliente aprovou'));

    expect(botao('Cliente aprovou')).toBeDisabled();
    expect(botao('Cancelar obra')).toBeDisabled();
    expect(patch).toHaveBeenCalledTimes(1);
    await act(async () => responder());
    expect(botao('Cliente aprovou')).toBeEnabled();
  });
});

describe('AcoesStatusObra: iniciar sem equipe (TRN-05)', () => {
  it('FECHADA sem gesseiro: "Iniciar obra" desabilitado com o aviso exato', () => {
    montar(obra('FECHADA', []));

    expect(botao('Iniciar obra')).toBeDisabled();
    expect(screen.getByText('Aloque pelo menos um gesseiro para iniciar')).toBeInTheDocument();
    fireEvent.click(botao('Iniciar obra'));
    expect(patch).not.toHaveBeenCalled();
  });

  it('FECHADA com gesseiro: habilitado e sem aviso', () => {
    montar(obra('FECHADA'));

    expect(botao('Iniciar obra')).toBeEnabled();
    expect(screen.queryByText('Aloque pelo menos um gesseiro para iniciar')).toBeNull();
  });

  it('FECHADA com gesseiros ausente na resposta: trata como sem equipe', () => {
    montar({ ...obra('FECHADA'), gesseiros: undefined });

    expect(botao('Iniciar obra')).toBeDisabled();
    expect(screen.getByText('Aloque pelo menos um gesseiro para iniciar')).toBeInTheDocument();
  });

  it('ANDAMENTO sem gesseiro: "Concluir obra" continua habilitado e sem aviso', () => {
    montar(obra('ANDAMENTO', []));

    expect(botao('Concluir obra')).toBeEnabled();
    expect(screen.queryByText('Aloque pelo menos um gesseiro para iniciar')).toBeNull();
  });
});

describe('AcoesStatusObra: concluir com confirmação (TRN-11)', () => {
  it('pergunta com a lista de créditos e só envia se confirmar', async () => {
    const confirmar = jest.spyOn(window, 'confirm').mockReturnValue(true);
    patch.mockResolvedValue({});
    const { onAlterada } = montar(obra('ANDAMENTO'));

    fireEvent.click(botao('Concluir obra'));

    await waitFor(() => expect(onAlterada).toHaveBeenCalledTimes(1));
    expect(confirmar).toHaveBeenCalledTimes(1);
    const texto = (confirmar.mock.calls[0][0] as string).replace(/ /g, ' ');
    expect(texto.split('\n')).toContain('João — R$ 2.500,00');
    expect(patch).toHaveBeenCalledWith('/obras/o1/concluir');
  });

  it('cancelar o diálogo não envia nada', () => {
    jest.spyOn(window, 'confirm').mockReturnValue(false);
    const { onAlterada, onErro } = montar(obra('ANDAMENTO'));

    fireEvent.click(botao('Concluir obra'));

    expect(patch).not.toHaveBeenCalled();
    expect(onAlterada).not.toHaveBeenCalled();
    expect(onErro).not.toHaveBeenCalled();
  });

  it('sem equipe: o diálogo traz o texto exato de nenhum crédito', () => {
    const confirmar = jest.spyOn(window, 'confirm').mockReturnValue(false);
    montar(obra('ANDAMENTO', []));

    fireEvent.click(botao('Concluir obra'));

    expect((confirmar.mock.calls[0][0] as string).split('\n')).toContain(
      'Nenhum gesseiro alocado: nenhum crédito será gerado.',
    );
  });

  it.each(['fechar', 'iniciar'] as const)('%s não pede confirmação', async (acao) => {
    const confirmar = jest.spyOn(window, 'confirm');
    patch.mockResolvedValue({});
    montar(obra(acao === 'fechar' ? 'ORCAMENTO' : 'FECHADA'));

    fireEvent.click(botao(acao === 'fechar' ? 'Cliente aprovou' : 'Iniciar obra'));

    await waitFor(() => expect(patch).toHaveBeenCalled());
    expect(confirmar).not.toHaveBeenCalled();
  });
});

describe('AcoesStatusObra: erros do avanço (P1 AC9/AC11, AD-014)', () => {
  it('resposta HTTP de erro: onErro(mensagem da API, recarregar=true), sem onAlterada', async () => {
    patch.mockRejectedValue(erroHttp('Não é possível fechar uma obra com status FECHADA'));
    const { onAlterada, onErro } = montar(obra('ORCAMENTO'));

    fireEvent.click(botao('Cliente aprovou'));

    await waitFor(() =>
      expect(onErro).toHaveBeenCalledWith(
        'Não é possível fechar uma obra com status FECHADA',
        true,
      ),
    );
    expect(onAlterada).not.toHaveBeenCalled();
    expect(botao('Cliente aprovou')).toBeEnabled();
  });

  it('falha de rede: onErro(mensagem do OFF-08, recarregar=false) e não reenvia', async () => {
    jest.spyOn(window, 'confirm').mockReturnValue(true);
    patch.mockRejectedValue(erroRede());
    const { onAlterada, onErro } = montar(obra('ANDAMENTO'));

    fireEvent.click(botao('Concluir obra'));

    await waitFor(() => expect(onErro).toHaveBeenCalledWith(SEM_CONEXAO, false));
    await esperarUmPouco();
    expect(onAlterada).not.toHaveBeenCalled();
    expect(onErro).toHaveBeenCalledTimes(1);
    expect(patch).toHaveBeenCalledTimes(1);
  });
});

describe('AcoesStatusObra: cancelar com motivo (TRN-10, TRN-13)', () => {
  const abrir = () => fireEvent.click(botao('Cancelar obra'));
  const digitar = (valor: string) =>
    fireEvent.change(screen.getByLabelText('Motivo'), { target: { value: valor } });
  const confirmar = () => fireEvent.click(botao('Confirmar cancelamento'));

  it.each(['ORCAMENTO', 'FECHADA', 'ANDAMENTO'] as const)(
    '%s oferece "Cancelar obra"',
    (status) => {
      montar(obra(status));

      expect(botao('Cancelar obra')).toBeEnabled();
    },
  );

  it('o campo Motivo é obrigatório, de 3 a 500 caracteres', () => {
    montar(obra('FECHADA'));
    abrir();

    const campo = screen.getByLabelText('Motivo');
    expect(campo).toBeRequired();
    expect(campo).toHaveAttribute('minLength', '3');
    expect(campo).toHaveAttribute('maxLength', '500');
  });

  it('confirma: PATCH /obras/:id/cancelar com o motivo, fecha o formulário e avisa a página', async () => {
    patch.mockResolvedValue({});
    const { onAlterada, onErro } = montar(obra('ANDAMENTO'));
    abrir();
    digitar('Cliente desistiu');

    confirmar();

    await waitFor(() => expect(onAlterada).toHaveBeenCalledTimes(1));
    expect(patch).toHaveBeenCalledWith('/obras/o1/cancelar', { motivo: 'Cliente desistiu' });
    expect(screen.queryByLabelText('Motivo')).toBeNull();
    expect(onErro).not.toHaveBeenCalled();
  });

  it('erro HTTP: mensagem no formulário, motivo mantido e a lista recarrega', async () => {
    patch.mockRejectedValue(erroHttp('Não é possível cancelar uma obra com status CONCLUIDA'));
    const { onAlterada, onErro } = montar(obra('ANDAMENTO'));
    abrir();
    digitar('Cliente desistiu');

    confirmar();

    expect(
      await screen.findByText('Não é possível cancelar uma obra com status CONCLUIDA'),
    ).toHaveClass('erro');
    expect(screen.getByLabelText('Motivo')).toHaveValue('Cliente desistiu');
    expect(onAlterada).toHaveBeenCalledTimes(1);
    expect(onErro).not.toHaveBeenCalled();
  });

  it('falha de rede: mensagem do OFF-08 no formulário, motivo mantido, sem recarregar nem reenviar', async () => {
    patch.mockRejectedValue(erroRede());
    const { onAlterada, onErro } = montar(obra('ANDAMENTO'));
    abrir();
    digitar('Cliente desistiu');

    confirmar();

    expect(await screen.findByText(SEM_CONEXAO)).toHaveClass('erro');
    await esperarUmPouco();
    expect(screen.getByLabelText('Motivo')).toHaveValue('Cliente desistiu');
    expect(onAlterada).not.toHaveBeenCalled();
    expect(onErro).not.toHaveBeenCalled();
    expect(patch).toHaveBeenCalledTimes(1);
  });

  it('erro HTTP e a recarga traz a obra já final: mensagem e motivo continuam, sem confirmar de novo', async () => {
    const mensagem = 'Não é possível cancelar uma obra com status CONCLUIDA';
    patch.mockRejectedValue(erroHttp(mensagem));
    const { rerender, onAlterada, onErro } = montar(obra('ANDAMENTO'));
    abrir();
    digitar('Cliente desistiu');
    confirmar();
    await screen.findByText(mensagem);

    // A página recarregou (onAlterada) e o GET trouxe a obra concluída por outra chamada.
    rerender(<AcoesStatusObra obra={obra('CONCLUIDA')} onAlterada={onAlterada} onErro={onErro} />);

    expect(screen.getByText(mensagem)).toHaveClass('erro');
    expect(screen.getByLabelText('Motivo')).toHaveValue('Cliente desistiu');
    expect(botao('Confirmar cancelamento')).toBeDisabled();
    fireEvent.click(botao('Voltar'));
    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });

  it('duplo clique em "Confirmar cancelamento" envia uma vez só', async () => {
    let responder!: () => void;
    patch.mockReturnValue(new Promise<void>((r) => (responder = r)));
    montar(obra('FECHADA'));
    abrir();
    digitar('Cliente desistiu');

    confirmar();
    expect(botao('Confirmar cancelamento')).toBeDisabled();
    confirmar();

    expect(patch).toHaveBeenCalledTimes(1);
    await act(async () => responder());
  });

  it('depois de cancelar com sucesso, reabrir o formulário mostra o motivo vazio', async () => {
    patch.mockResolvedValue({});
    const { onAlterada } = montar(obra('FECHADA'));
    abrir();
    digitar('Cliente desistiu');
    confirmar();
    await waitFor(() => expect(onAlterada).toHaveBeenCalled());

    abrir();

    expect(screen.getByLabelText('Motivo')).toHaveValue('');
  });

  it('o formulário aberto sobrevive a um re-render da página (ex.: reconexão)', () => {
    const { rerender, onAlterada, onErro } = montar(obra('FECHADA'));
    abrir();
    digitar('Cliente desistiu');

    rerender(
      <AcoesStatusObra obra={{ ...obra('FECHADA') }} onAlterada={onAlterada} onErro={onErro} />,
    );

    expect(screen.getByLabelText('Motivo')).toHaveValue('Cliente desistiu');
  });

  it('"Voltar" fecha o formulário sem enviar', () => {
    montar(obra('FECHADA'));
    abrir();

    fireEvent.click(botao('Voltar'));

    expect(screen.queryByLabelText('Motivo')).toBeNull();
    expect(patch).not.toHaveBeenCalled();
  });
});
