import type { StatusObra } from '../types';

/** Status de obra na ordem do funil, do orcamento ao fim. */
export const STATUS_FUNIL: StatusObra[] = ['ORCAMENTO', 'FECHADA', 'ANDAMENTO', 'CONCLUIDA', 'CANCELADA'];

/** Rotulo de um grupo de obras no status (filtros de Obras, cards do Dashboard). */
export const rotuloPlural: Record<StatusObra, string> = {
  ORCAMENTO: 'Aguardando cliente',
  FECHADA: 'Fechadas',
  ANDAMENTO: 'Em andamento',
  CONCLUIDA: 'Concluidas',
  CANCELADA: 'Canceladas',
};
