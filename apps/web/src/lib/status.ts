import type { Obra, StatusObra } from '../types';
import { moeda } from './formato';

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

/** Ação que avança a obra uma etapa no funil (obras-transicoes-status, TRN-05). */
export type AcaoAvanco = 'fechar' | 'iniciar' | 'concluir';

/** Botão de avanço de cada status; CONCLUIDA e CANCELADA não avançam (estados finais). */
export const acaoDeAvanco: Partial<Record<StatusObra, { acao: AcaoAvanco; rotulo: string }>> = {
  ORCAMENTO: { acao: 'fechar', rotulo: 'Cliente aprovou' },
  FECHADA: { acao: 'iniciar', rotulo: 'Iniciar obra' },
  ANDAMENTO: { acao: 'concluir', rotulo: 'Concluir obra' },
};

export const SEM_EQUIPE_NA_CONCLUSAO = 'Nenhum gesseiro alocado: nenhum crédito será gerado.';

/**
 * Texto do diálogo do "Concluir obra" (TRN-11): quem vai receber crédito, uma linha
 * `<nome> — <valor combinado>` por gesseiro, com os dados que GET /obras já devolve.
 */
export function textoConfirmacaoConclusao(obra: Obra): string {
  const equipe = obra.gesseiros ?? [];
  if (equipe.length === 0) {
    return `Concluir esta obra?\n${SEM_EQUIPE_NA_CONCLUSAO}`;
  }
  const linhas = equipe.map(
    (alocacao) =>
      `${alocacao.gesseiro?.nome ?? alocacao.gesseiroId} — ${moeda(alocacao.valorCombinado)}`,
  );
  return ['Concluir esta obra? Créditos que serão gerados:', ...linhas].join('\n');
}
