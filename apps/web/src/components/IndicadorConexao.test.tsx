import { act, render, screen } from '@testing-library/react';

import { registrarOrigem } from '../lib/conexao';
import IndicadorConexao from './IndicadorConexao';

const ROTULO = 'Dados possivelmente desatualizados';

/** Simula o navegador ficando offline/online: muda `navigator.onLine` e dispara o evento. */
function ficar(estado: 'online' | 'offline') {
  Object.defineProperty(navigator, 'onLine', {
    configurable: true,
    get: () => estado === 'online',
  });
  window.dispatchEvent(new Event(estado));
}

beforeEach(() => {
  ficar('online');
  registrarOrigem('rede');
});

afterAll(() => {
  delete (navigator as { onLine?: boolean }).onLine;
});

describe('IndicadorConexao (OFF-06, OFF-07)', () => {
  it('online e última resposta da rede: não renderiza nada', () => {
    const { container } = render(<IndicadorConexao />);

    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByRole('img', { name: ROTULO })).not.toBeInTheDocument();
  });

  it('offline: mostra o ícone com aria-label e title exatos e nenhum texto visível (OFF-06)', () => {
    render(<IndicadorConexao />);

    act(() => ficar('offline'));

    const icone = screen.getByRole('img', { name: ROTULO });
    expect(icone).toHaveAttribute('aria-label', ROTULO);
    expect(icone).toHaveAttribute('title', ROTULO);
    expect(icone).toHaveClass('indicador-conexao');
    expect(icone).toHaveTextContent(/^$/);
    expect(icone.querySelector('svg')).toBeInTheDocument();
  });

  it('online com a última resposta GET vinda do cache: mostra o ícone (OFF-06)', () => {
    render(<IndicadorConexao />);

    act(() => registrarOrigem('cache'));

    expect(screen.getByRole('img', { name: ROTULO })).toHaveAttribute('title', ROTULO);
  });

  it('resposta da rede com o navegador online: esconde o ícone (OFF-07)', () => {
    render(<IndicadorConexao />);
    act(() => {
      ficar('offline');
      registrarOrigem('cache');
    });
    expect(screen.getByRole('img', { name: ROTULO })).toBeInTheDocument();

    act(() => ficar('online'));
    // Ainda com a última resposta do cache: continua aceso.
    expect(screen.getByRole('img', { name: ROTULO })).toBeInTheDocument();

    act(() => registrarOrigem('rede'));
    expect(screen.queryByRole('img', { name: ROTULO })).not.toBeInTheDocument();
  });
});
