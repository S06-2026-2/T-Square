import { StatusObra } from '@prisma/client';

/**
 * Funil da obra (spec obras-transicoes-status, AD-007): so avanca uma etapa por vez ou cancela.
 * CONCLUIDA e CANCELADA sao finais. Fonte unica da regra "de onde para onde".
 */
export type AcaoObra = 'fechar' | 'iniciar' | 'concluir' | 'cancelar';

export const TRANSICOES: Record<AcaoObra, { de: StatusObra[]; para: StatusObra }> = {
  fechar: { de: [StatusObra.ORCAMENTO], para: StatusObra.FECHADA },
  iniciar: { de: [StatusObra.FECHADA], para: StatusObra.ANDAMENTO },
  concluir: { de: [StatusObra.ANDAMENTO], para: StatusObra.CONCLUIDA },
  cancelar: {
    de: [StatusObra.ORCAMENTO, StatusObra.FECHADA, StatusObra.ANDAMENTO],
    para: StatusObra.CANCELADA,
  },
};

/** TRN-04: mensagem do 400 de transicao invalida. */
export function mensagemTransicaoInvalida(acao: AcaoObra, status: StatusObra): string {
  return `Não é possível ${acao} uma obra com status ${status}`;
}
