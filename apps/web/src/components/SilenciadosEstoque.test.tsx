import { fireEvent, render, screen, within } from '@testing-library/react';

import { api } from '../lib/api';
import type { SilenciadoEstoque } from '../types';
import SilenciadosEstoque from './SilenciadosEstoque';

jest.mock('../lib/api', () => ({ api: { get: jest.fn() } }));

const get = api.get as jest.Mock;

/** Instante em hora local, serializado como a API devolve (ISO em UTC). */
const em = new Date(2026, 9, 29, 13, 48).toISOString();
const ate = new Date(2026, 10, 1, 13, 48).toISOString();

function silenciado(campos: Partial<SilenciadoEstoque> = {}): SilenciadoEstoque {
  return {
    alertaId: 'a1',
    materialId: 'm1',
    material: { nome: 'Gesso cola', unidade: 'saco' },
    tipo: 'REPOSICAO',
    acao: 'RESOLVIDO',
    em,
    ate,
    abrangencia: 'TUDO',
    ...campos,
  };
}

function abrir() {
  fireEvent.click(screen.getByRole('button', { name: 'Ver silenciados' }));
}

beforeEach(() => {
  get.mockReset();
});

describe('SilenciadosEstoque', () => {
  it('começa minimizado e não busca nada', () => {
    render(<SilenciadosEstoque />);

    expect(screen.getByRole('button', { name: 'Ver silenciados' })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
    expect(screen.queryByRole('region')).not.toBeInTheDocument();
    expect(get).not.toHaveBeenCalled();
  });

  it('ao expandir busca e mostra material, ação, quando e até quando', async () => {
    get.mockResolvedValue([silenciado()]);
    render(<SilenciadosEstoque />);

    abrir();

    expect(get).toHaveBeenCalledWith('/estoque/agente/silenciados');
    const painel = within(await screen.findByRole('region', { name: 'Silenciados pelo operador' }));
    expect(await painel.findByText('Gesso cola')).toBeInTheDocument();
    expect(painel.getByText('Reposição resolvida')).toBeInTheDocument();
    expect(
      painel.getByText('Em 29/10/2026 13:48 · volta a ser analisado em 01/11/2026 13:48'),
    ).toBeInTheDocument();
    // abrangencia TUDO: nada de aviso de "só observações".
    expect(painel.queryByText(/Só observações ficam de fora/)).not.toBeInTheDocument();
  });

  it.each([
    ['REPOSICAO', 'DISPENSADO', 'Reposição dispensada'],
    ['REPOSICAO', 'RESOLVIDO', 'Reposição resolvida'],
    ['INFORMATIVO', 'DISPENSADO', 'Observação dispensada'],
    ['INFORMATIVO', 'RESOLVIDO', 'Observação resolvida'],
  ] as const)('%s %s aparece como "%s"', async (tipo, acao, rotulo) => {
    get.mockResolvedValue([silenciado({ tipo, acao })]);
    render(<SilenciadosEstoque />);

    abrir();

    expect(await screen.findByText(rotulo)).toBeInTheDocument();
  });

  it('mantem a ordem da API, o silencio que termina primeiro no topo (EAP-74)', async () => {
    get.mockResolvedValue([
      silenciado({ alertaId: 'a1', ate }),
      silenciado({
        alertaId: 'a2',
        material: { nome: 'Fita telada', unidade: 'rolo' },
        ate: new Date(2026, 10, 2, 9, 0).toISOString(),
      }),
    ]);
    render(<SilenciadosEstoque />);

    abrir();

    await screen.findByText('Gesso cola');
    const nomes = screen
      .getAllByRole('listitem')
      .map((li) => li.querySelector('strong')?.textContent);
    expect(nomes).toEqual(['Gesso cola', 'Fita telada']);
  });

  it('avisa quando só observações estão silenciadas', async () => {
    get.mockResolvedValue([
      silenciado({ tipo: 'INFORMATIVO', acao: 'DISPENSADO', abrangencia: 'INFORMATIVO' }),
    ]);
    render(<SilenciadosEstoque />);

    abrir();

    expect(await screen.findByText('Observação dispensada')).toBeInTheDocument();
    expect(
      screen.getByText('Só observações ficam de fora; a reposição continua sendo alertada.'),
    ).toBeInTheDocument();
  });

  it('mostra estado vazio quando nada está silenciado', async () => {
    get.mockResolvedValue([]);
    render(<SilenciadosEstoque />);

    abrir();

    expect(await screen.findByText('Nenhum material silenciado.')).toBeInTheDocument();
  });

  it('minimiza de novo e busca outra vez ao reabrir', async () => {
    get.mockResolvedValue([silenciado()]);
    render(<SilenciadosEstoque />);

    abrir();
    await screen.findByText('Gesso cola');
    fireEvent.click(screen.getByRole('button', { name: 'Fechar silenciados' }));

    expect(screen.queryByRole('region')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ver silenciados' })).toHaveAttribute(
      'aria-expanded',
      'false',
    );

    abrir();
    await screen.findByText('Gesso cola');
    expect(get).toHaveBeenCalledTimes(2);
  });

  it('ao reabrir, a lista nova substitui a antiga', async () => {
    get
      .mockResolvedValueOnce([silenciado()])
      .mockResolvedValueOnce([
        silenciado({ alertaId: 'a2', material: { nome: 'Fita telada', unidade: 'rolo' } }),
      ]);
    render(<SilenciadosEstoque />);

    abrir();
    await screen.findByText('Gesso cola');
    fireEvent.click(screen.getByRole('button', { name: 'Fechar silenciados' }));
    abrir();

    expect(await screen.findByText('Fita telada')).toBeInTheDocument();
    expect(screen.queryByText('Gesso cola')).not.toBeInTheDocument();
  });

  it('exibe a mensagem da API no padrão erro quando a busca falha', async () => {
    get.mockRejectedValue(new Error('Erro ao comunicar com a API'));
    render(<SilenciadosEstoque />);

    abrir();

    expect(await screen.findByText('Erro ao comunicar com a API')).toHaveClass('erro');
  });
});
