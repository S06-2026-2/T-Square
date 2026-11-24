import type { Obra } from '../types';
import { STATUS_FUNIL, acaoDeAvanco, rotuloPlural, textoConfirmacaoConclusao } from './status';

/** TRN-05 e TRN-11 de .claude/specs/features/obras-transicoes-status/spec.md. */
describe('acaoDeAvanco (TRN-05)', () => {
  it('um botão de avanço por status em aberto, nenhum nos finais', () => {
    expect(acaoDeAvanco).toEqual({
      ORCAMENTO: { acao: 'fechar', rotulo: 'Cliente aprovou' },
      FECHADA: { acao: 'iniciar', rotulo: 'Iniciar obra' },
      ANDAMENTO: { acao: 'concluir', rotulo: 'Concluir obra' },
    });
    expect(acaoDeAvanco.CONCLUIDA).toBeUndefined();
    expect(acaoDeAvanco.CANCELADA).toBeUndefined();
  });
});

describe('textoConfirmacaoConclusao (TRN-11)', () => {
  const obra = (gesseiros: Obra['gesseiros']): Obra => ({
    id: 'o1',
    titulo: 'Forro Residência Silva',
    clienteNome: 'Maria',
    status: 'ANDAMENTO',
    valorTotal: '8500.00',
    gesseiros,
  });

  // Intl formata "R$ 2.500,00" com espaço não separável.
  const nbsp = (texto: string) => texto.replace(/ /g, ' ');

  it('uma linha "<nome> — <valor em BRL>" por gesseiro alocado', () => {
    const texto = textoConfirmacaoConclusao(
      obra([
        {
          id: 'a1',
          gesseiroId: 'g1',
          valorCombinado: '2500.00',
          gesseiro: { id: 'g1', nome: 'João', ativo: true },
        },
        {
          id: 'a2',
          gesseiroId: 'g2',
          valorCombinado: 1500.5,
          gesseiro: { id: 'g2', nome: 'Pedro', ativo: true },
        },
      ]),
    );

    const linhas = nbsp(texto).split('\n');
    expect(linhas).toContain('João — R$ 2.500,00');
    expect(linhas).toContain('Pedro — R$ 1.500,50');
    expect(linhas.filter((l) => l.includes(' — R$ '))).toHaveLength(2);
  });

  it('alocação sem o gesseiro embutido usa o gesseiroId na linha', () => {
    const texto = textoConfirmacaoConclusao(
      obra([{ id: 'a1', gesseiroId: 'g-77', valorCombinado: 100 }]),
    );

    expect(nbsp(texto).split('\n')).toContain('g-77 — R$ 100,00');
  });

  it.each([[[]], [undefined]])('sem equipe (%p): mostra o texto exato da spec', (gesseiros) => {
    const linhas = textoConfirmacaoConclusao(obra(gesseiros)).split('\n');

    expect(linhas).toContain('Nenhum gesseiro alocado: nenhum crédito será gerado.');
    expect(linhas.some((l) => l.includes(' — '))).toBe(false);
  });
});

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
