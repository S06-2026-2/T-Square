import { fireEvent, render, screen } from '@testing-library/react';

import { useInstalacao, type ModoInstalacao } from '../lib/instalacao';
import BotaoInstalar from './BotaoInstalar';

jest.mock('../lib/instalacao', () => ({ useInstalacao: jest.fn() }));

const usarInstalacao = useInstalacao as jest.Mock;
const instalar = jest.fn(async () => undefined);
const INSTRUCAO = 'Toque em Compartilhar e depois em Adicionar à Tela de Início';

function renderizar(modo: ModoInstalacao) {
  usarInstalacao.mockReturnValue({ modo, instalar });
  return render(
    <div>
      <p>fora do botão</p>
      <BotaoInstalar />
    </div>,
  );
}

beforeEach(() => {
  instalar.mockClear();
});

describe('BotaoInstalar', () => {
  it('modo null: não renderiza nada (PWA-07, PWA-08, PWA-09)', () => {
    renderizar(null);

    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(document.querySelector('.instalar')).toBeNull();
  });

  it('"prompt": botão "Instalar app" com o ícone; o clique chama instalar() (PWA-05, PWA-06)', () => {
    renderizar('prompt');

    const botao = screen.getByRole('button', { name: 'Instalar app' });
    expect(botao).toHaveClass('btn-instalar');
    expect(botao.querySelector('svg')).toBeInTheDocument();
    expect(botao).not.toHaveAttribute('aria-expanded');

    fireEvent.click(botao);

    expect(instalar).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(INSTRUCAO)).not.toBeInTheDocument();
  });

  it('"ios": o clique abre a instrução com o texto exato e não chama instalar() (PWA-10)', () => {
    renderizar('ios');
    const botao = screen.getByRole('button', { name: 'Instalar app' });
    expect(botao).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText(INSTRUCAO)).not.toBeInTheDocument();

    fireEvent.click(botao);

    const painel = screen.getByRole('region', { name: 'Como instalar o app' });
    expect(painel).toHaveClass('painel-instalar');
    expect(painel).toHaveTextContent(new RegExp(`^${INSTRUCAO}$`));
    expect(botao).toHaveAttribute('aria-expanded', 'true');
    expect(instalar).not.toHaveBeenCalled();
  });

  it('"ios": Esc fecha a instrução', () => {
    renderizar('ios');
    fireEvent.click(screen.getByRole('button', { name: 'Instalar app' }));
    expect(screen.getByText(INSTRUCAO)).toBeInTheDocument();

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(screen.queryByText(INSTRUCAO)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Instalar app' })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
  });

  it('"ios": toque fora fecha a instrução; toque dentro dela não fecha', () => {
    renderizar('ios');
    fireEvent.click(screen.getByRole('button', { name: 'Instalar app' }));

    fireEvent.pointerDown(screen.getByText(INSTRUCAO));
    expect(screen.getByText(INSTRUCAO)).toBeInTheDocument();

    fireEvent.pointerDown(screen.getByText('fora do botão'));
    expect(screen.queryByText(INSTRUCAO)).not.toBeInTheDocument();
  });

  it('"ios": outra tecla não fecha; um segundo clique no botão fecha', () => {
    renderizar('ios');
    const botao = screen.getByRole('button', { name: 'Instalar app' });
    fireEvent.click(botao);

    fireEvent.keyDown(document, { key: 'Enter' });
    expect(screen.getByText(INSTRUCAO)).toBeInTheDocument();

    fireEvent.click(botao);
    expect(screen.queryByText(INSTRUCAO)).not.toBeInTheDocument();
  });
});
