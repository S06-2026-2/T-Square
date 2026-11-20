import { StatusObra } from '@prisma/client';

import { AcaoObra, mensagemTransicaoInvalida, TRANSICOES } from './transicoes-obra';

/**
 * TRN-01, TRN-02, TRN-03, TRN-04 e TRN-09 de
 * .claude/specs/features/obras-transicoes-status/spec.md: origem valida e destino de cada acao.
 */
describe('TRANSICOES', () => {
  const todos = Object.values(StatusObra);

  // Origens que a spec permite para cada acao (P1 AC1-AC5, P2 AC1/AC4).
  const esperado: Record<AcaoObra, { de: StatusObra[]; para: StatusObra }> = {
    fechar: { de: ['ORCAMENTO'], para: 'FECHADA' },
    iniciar: { de: ['FECHADA'], para: 'ANDAMENTO' },
    concluir: { de: ['ANDAMENTO'], para: 'CONCLUIDA' },
    cancelar: { de: ['ORCAMENTO', 'FECHADA', 'ANDAMENTO'], para: 'CANCELADA' },
  };

  it('tem exatamente as 4 acoes da spec', () => {
    expect(Object.keys(TRANSICOES).sort()).toEqual(['cancelar', 'concluir', 'fechar', 'iniciar']);
  });

  describe.each(Object.keys(esperado) as AcaoObra[])('%s', (acao) => {
    it.each(todos)('origem %s aceita so onde a spec manda', (status) => {
      expect(TRANSICOES[acao].de.includes(status)).toBe(esperado[acao].de.includes(status));
    });

    it('leva ao destino da spec', () => {
      expect(TRANSICOES[acao].para).toBe(esperado[acao].para);
    });
  });

  it('CONCLUIDA e CANCELADA nao sao origem de nenhuma acao (estados finais)', () => {
    for (const { de } of Object.values(TRANSICOES)) {
      expect(de).not.toContain(StatusObra.CONCLUIDA);
      expect(de).not.toContain(StatusObra.CANCELADA);
    }
  });
});

describe('mensagemTransicaoInvalida (TRN-04)', () => {
  it.each([
    ['fechar', 'FECHADA', 'Não é possível fechar uma obra com status FECHADA'],
    ['iniciar', 'ORCAMENTO', 'Não é possível iniciar uma obra com status ORCAMENTO'],
    ['concluir', 'CONCLUIDA', 'Não é possível concluir uma obra com status CONCLUIDA'],
    ['cancelar', 'CANCELADA', 'Não é possível cancelar uma obra com status CANCELADA'],
  ] as const)('%s em %s', (acao, status, mensagem) => {
    expect(mensagemTransicaoInvalida(acao, status)).toBe(mensagem);
  });
});
