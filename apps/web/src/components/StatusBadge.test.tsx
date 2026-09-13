import { render, screen } from '@testing-library/react';
import StatusBadge, { rotuloStatus } from './StatusBadge';

describe('StatusBadge', () => {
  it('traduz o status do funil para o rotulo que o usuario le', () => {
    expect(rotuloStatus('ORCAMENTO')).toBe('Aguardando cliente');
    expect(rotuloStatus('ANDAMENTO')).toBe('Em andamento');
  });

  it('renderiza o rotulo e a classe correspondente ao status', () => {
    const { container } = render(<StatusBadge status="CONCLUIDA" />);

    expect(screen.getByText('Concluida')).toBeInTheDocument();
    expect(container.querySelector('.badge-concluida')).not.toBeNull();
  });
});
