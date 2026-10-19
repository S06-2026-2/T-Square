import { STATUS_FUNIL, rotuloPlural } from './status';

describe('status do funil', () => {
  it('lista os 5 status na ordem do funil', () => {
    expect(STATUS_FUNIL).toEqual(['ORCAMENTO', 'FECHADA', 'ANDAMENTO', 'CONCLUIDA', 'CANCELADA']);
  });

  it('usa os rotulos dos filtros de Obras, com Canceladas para CANCELADA', () => {
    expect(rotuloPlural).toEqual({
      ORCAMENTO: 'Aguardando cliente',
      FECHADA: 'Fechadas',
      ANDAMENTO: 'Em andamento',
      CONCLUIDA: 'Concluidas',
      CANCELADA: 'Canceladas',
    });
  });
});
