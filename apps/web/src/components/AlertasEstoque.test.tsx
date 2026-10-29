import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';

import { api } from '../lib/api';
import type { AlertaEstoque, AnaliseEstoque, RespostaAlertasEstoque } from '../types';
import AlertasEstoque from './AlertasEstoque';

jest.mock('../lib/api', () => ({
  api: { get: jest.fn(), post: jest.fn(), patch: jest.fn() },
}));

const get = api.get as jest.Mock;
const post = api.post as jest.Mock;
const patch = api.patch as jest.Mock;

/** Instante em hora local, serializado como a API devolve (ISO em UTC). */
const iniciadoEm = new Date(2026, 9, 28, 6, 0).toISOString();

const analise = (status: AnaliseEstoque['status'] = 'SUCESSO'): AnaliseEstoque => ({
  id: 'an1',
  origem: 'MANUAL',
  status,
  iniciadoEm,
  finalizadoEm: iniciadoEm,
  totalAlertas: 1,
});

function alerta(id: string, campos: Partial<AlertaEstoque> = {}): AlertaEstoque {
  return {
    id,
    materialId: `m-${id}`,
    tipo: 'REPOSICAO',
    status: 'ATIVO',
    quantidadeSugerida: '12',
    saldoLivre: '5',
    estoqueMinimo: '10',
    ritmoDiario: '1.5',
    diasAteMinimo: null,
    justificativa: `Justificativa ${id}`,
    origemTexto: 'AGENTE',
    motivo: 'ABAIXO_DO_MINIMO',
    criadoEm: iniciadoEm,
    material: { id: `m-${id}`, nome: `Material ${id}`, unidade: 'saco', saldoAtual: '5', estoqueMinimo: '10' },
    ...campos,
  };
}

function responder(resposta: RespostaAlertasEstoque) {
  get.mockResolvedValue(resposta);
  render(<AlertasEstoque />);
}

/** Card do alerta pelo nome do material. */
async function card(nome: string) {
  const titulo = await screen.findByRole('heading', { name: new RegExp(nome) });
  return within(titulo.closest('li') as HTMLElement);
}

beforeEach(() => {
  get.mockReset();
  post.mockReset();
  patch.mockReset();
});

describe('AlertasEstoque', () => {
  it('busca os alertas do agente e mostra material, unidade, quantidade dos campos e justificativa (EAP-26, EAP-27)', async () => {
    responder({
      ultimaAnalise: analise(),
      alertas: [
        alerta('cal', {
          material: { id: 'm-cal', nome: 'Cal', unidade: 'saco', saldoAtual: '5', estoqueMinimo: '10' },
          quantidadeSugerida: '12',
          justificativa: 'Repor 99 sacos para cobrir a obra',
        }),
      ],
    });

    const c = await card('Cal');
    expect(c.getByTestId('quantidade-sugerida')).toHaveTextContent(/^12$/);
    expect(c.getByTestId('unidade')).toHaveTextContent(/^saco$/);
    expect(c.getByText('Repor 99 sacos para cobrir a obra')).toBeInTheDocument();
    expect(get).toHaveBeenCalledWith('/estoque/agente/alertas');
  });

  it('formata a quantidade decimal com vírgula', async () => {
    responder({ ultimaAnalise: analise(), alertas: [alerta('gesso', { quantidadeSugerida: '7.5' })] });

    const c = await card('Material gesso');
    expect(c.getByTestId('quantidade-sugerida')).toHaveTextContent(/^7,5$/);
  });

  it('mantém a ordem devolvida pela API (EAP-26)', async () => {
    responder({
      ultimaAnalise: analise(),
      alertas: [
        alerta('b', { tipo: 'INFORMATIVO', quantidadeSugerida: null, saldoLivre: '50' }),
        alerta('a'),
        alerta('c', { saldoLivre: '20', diasAteMinimo: '3' }),
      ],
    });

    await card('Material b');
    const nomes = screen.getAllByRole('heading', { level: 4 }).map((h) => h.textContent);
    expect(nomes).toEqual(['ℹ️ Material b', '⚠️ Material a', '⚠️ Material c']);
  });

  it('mostra a situação em dias de cada alerta (EAP-28)', async () => {
    responder({
      ultimaAnalise: analise(),
      alertas: [
        alerta('abaixo', { motivo: 'ABAIXO_DO_MINIMO', diasAteMinimo: '0' }),
        alerta('nominimo', { motivo: 'NO_MINIMO_COM_CONSUMO', saldoLivre: '10', diasAteMinimo: '0' }),
        alerta('previsao', { motivo: 'PREVISAO', saldoLivre: '20', ritmoDiario: '2', diasAteMinimo: '4.9' }),
        alerta('parado', { motivo: null, saldoLivre: '20', ritmoDiario: '0', diasAteMinimo: null }),
      ],
    });

    expect((await card('Material abaixo')).getByTestId('situacao')).toHaveTextContent(/^abaixo do mínimo$/);
    expect((await card('Material nominimo')).getByTestId('situacao')).toHaveTextContent(/^no mínimo$/);
    expect((await card('Material previsao')).getByTestId('situacao')).toHaveTextContent(
      /^cruza o mínimo em ~4 dias$/,
    );
    expect((await card('Material parado')).getByTestId('situacao')).toHaveTextContent(/^sem consumo recente$/);
  });

  it('mostra o selo "sem agente — alerta básico" só no texto PADRAO (EAP-29)', async () => {
    responder({
      ultimaAnalise: analise(),
      alertas: [alerta('padrao', { origemTexto: 'PADRAO' }), alerta('agente', { origemTexto: 'AGENTE' })],
    });

    expect((await card('Material padrao')).getByText('sem agente — alerta básico')).toBeInTheDocument();
    expect((await card('Material agente')).queryByText('sem agente — alerta básico')).not.toBeInTheDocument();
  });

  it('REPOSICAO tem ⚠️; INFORMATIVO tem ℹ️, "observação do agente" e nenhuma quantidade (EAP-62, EAP-63)', async () => {
    responder({
      ultimaAnalise: analise(),
      alertas: [
        alerta('repor'),
        alerta('info', {
          tipo: 'INFORMATIVO',
          motivo: null,
          quantidadeSugerida: null,
          saldoLivre: '50',
          diasAteMinimo: null,
        }),
      ],
    });

    const repor = await card('Material repor');
    expect(repor.getByText('⚠️')).toBeInTheDocument();
    expect(repor.queryByText('ℹ️')).not.toBeInTheDocument();
    expect(repor.queryByText('observação do agente')).not.toBeInTheDocument();

    const info = await card('Material info');
    expect(info.getByText('ℹ️')).toBeInTheDocument();
    expect(info.queryByText('⚠️')).not.toBeInTheDocument();
    expect(info.getByText('observação do agente')).toBeInTheDocument();
    expect(info.queryByTestId('quantidade-sugerida')).not.toBeInTheDocument();
    expect(info.queryByText(/Repor/)).not.toBeInTheDocument();
  });

  it('mostra a data e a hora de início da última análise (EAP-30)', async () => {
    responder({ ultimaAnalise: analise(), alertas: [alerta('cal')] });

    expect(await screen.findByTestId('ultima-analise')).toHaveTextContent(/^Última análise: 28\/10\/2026 06:00$/);
  });

  it('com análise e nenhum alerta ATIVO, mostra "Estoque em dia" (EAP-31)', async () => {
    responder({ ultimaAnalise: analise(), alertas: [] });

    expect(await screen.findByText('Estoque em dia')).toBeInTheDocument();
    expect(screen.queryAllByRole('listitem')).toHaveLength(0);
  });

  it('sem nenhuma análise, mostra "Nenhuma análise executada ainda" no lugar da data e dos cards (EAP-32)', async () => {
    responder({ ultimaAnalise: null, alertas: [] });

    expect(await screen.findByText('Nenhuma análise executada ainda')).toBeInTheDocument();
    expect(screen.queryByText(/Última análise:/)).not.toBeInTheDocument();
    expect(screen.queryByText('Estoque em dia')).not.toBeInTheDocument();
    expect(screen.queryAllByRole('listitem')).toHaveLength(0);
  });

  it.each(['FALHA', 'PARCIAL'] as const)(
    'última análise %s mostra o aviso com o status junto dos alertas ATIVO (EAP-33)',
    async (status) => {
      responder({ ultimaAnalise: analise(status), alertas: [alerta('cal', { origemTexto: 'PADRAO' })] });

      expect(await screen.findByTestId('aviso-analise')).toHaveTextContent(status);
      expect(screen.getAllByRole('listitem')).toHaveLength(1);
    },
  );

  it('última análise SUCESSO não mostra aviso (EAP-33)', async () => {
    responder({ ultimaAnalise: analise('SUCESSO'), alertas: [alerta('cal')] });

    await card('Material cal');
    expect(screen.queryByTestId('aviso-analise')).not.toBeInTheDocument();
  });

  it('enquanto carrega, mostra "Carregando alertas..." e nenhum card', () => {
    get.mockReturnValue(new Promise(() => {}));
    render(<AlertasEstoque />);

    expect(screen.getByText('Carregando alertas...')).toBeInTheDocument();
    expect(screen.queryAllByRole('listitem')).toHaveLength(0);
  });

  it('exibe a mensagem da API no padrão erro quando a busca falha', async () => {
    get.mockRejectedValue(new Error('Erro ao comunicar com a API'));
    render(<AlertasEstoque />);

    expect(await screen.findByText('Erro ao comunicar com a API')).toHaveClass('erro');
    expect(screen.queryByText('Carregando alertas...')).not.toBeInTheDocument();
    expect(screen.queryAllByRole('listitem')).toHaveLength(0);
  });
});

/** ApiError simplificado: a mensagem da API vem em `message`. */
function erroApi(status: number, mensagem: string) {
  return Object.assign(new Error(mensagem), { status });
}

describe('AlertasEstoque: ações', () => {
  it('"Rodar análise agora" chama o POST, fica desabilitado até a resposta e recarrega os alertas (EAP-35)', async () => {
    get
      .mockResolvedValueOnce({ ultimaAnalise: null, alertas: [] })
      .mockResolvedValueOnce({ ultimaAnalise: analise(), alertas: [alerta('cal')] });
    let terminar: (valor: unknown) => void = () => {};
    post.mockReturnValue(new Promise((resolve) => (terminar = resolve)));
    render(<AlertasEstoque />);
    await screen.findByText('Nenhuma análise executada ainda');

    fireEvent.click(screen.getByRole('button', { name: 'Rodar análise agora' }));

    expect(post).toHaveBeenCalledWith('/estoque/agente/analisar');
    expect(screen.getByRole('button', { name: 'Analisando...' })).toBeDisabled();
    expect(get).toHaveBeenCalledTimes(1);

    terminar(analise());

    expect(await screen.findByRole('heading', { name: /Material cal/ })).toBeInTheDocument();
    expect(get).toHaveBeenCalledTimes(2);
    expect(get).toHaveBeenLastCalledWith('/estoque/agente/alertas');
    expect(screen.getByRole('button', { name: 'Rodar análise agora' })).toBeEnabled();
    expect(screen.getByTestId('ultima-analise')).toHaveTextContent('Última análise: 28/10/2026 06:00');
  });

  it.each([
    [409, 'Já existe uma análise de estoque em andamento'],
    [429, 'Aguarde 5 minutos entre análises manuais'],
  ])('POST com %i mostra a mensagem da API no padrão erro e mantém os alertas (EAP-36)', async (status, mensagem) => {
    responder({ ultimaAnalise: analise(), alertas: [alerta('cal')] });
    post.mockRejectedValue(erroApi(status, mensagem));
    await card('Material cal');

    fireEvent.click(screen.getByRole('button', { name: 'Rodar análise agora' }));

    expect(await screen.findByText(mensagem)).toHaveClass('erro');
    expect(screen.getAllByRole('listitem')).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Rodar análise agora' })).toBeEnabled();
    expect(get).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['Dispensar', 'dispensar', 'EAP-46'],
    ['Resolver', 'resolver', 'EAP-47'],
  ])('"%s" chama PATCH /estoque/agente/alertas/:id/%s e remove só aquele card (%s)', async (botao, acao) => {
    responder({ ultimaAnalise: analise(), alertas: [alerta('cal'), alerta('gesso')] });
    patch.mockResolvedValue({ id: 'cal' });

    const cal = await card('Material cal');
    fireEvent.click(cal.getByRole('button', { name: botao }));

    await waitFor(() =>
      expect(screen.queryByRole('heading', { name: /Material cal/ })).not.toBeInTheDocument(),
    );
    expect(patch).toHaveBeenCalledWith(`/estoque/agente/alertas/cal/${acao}`);
    expect(screen.getByRole('heading', { name: /Material gesso/ })).toBeInTheDocument();
    expect(screen.getAllByRole('listitem')).toHaveLength(1);
  });

  it.each(['Dispensar', 'Resolver'])(
    'falha em "%s" mantém o card e mostra a mensagem da API no padrão erro (EAP-53)',
    async (botao) => {
      responder({ ultimaAnalise: analise(), alertas: [alerta('cal')] });
      patch.mockRejectedValue(erroApi(400, 'Alerta cal não está ativo'));

      const cal = await card('Material cal');
      fireEvent.click(cal.getByRole('button', { name: botao }));

      expect(await screen.findByText('Alerta cal não está ativo')).toHaveClass('erro');
      expect(screen.getByRole('heading', { name: /Material cal/ })).toBeInTheDocument();
      expect(cal.getByRole('button', { name: botao })).toBeEnabled();
    },
  );
});
