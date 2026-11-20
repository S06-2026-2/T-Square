import {
  ZERE_O_SALDO,
  confirmacaoArquivarGesseiro,
  confirmacaoArquivarMaterial,
  ehFalhaDeRede,
} from './arquivamento';

/** ARQ-10 AC5 e ARQ-12 AC5 de arquivar-e-limpar-registros. */
describe('textos do arquivamento', () => {
  it('gesseiro', () => {
    expect(confirmacaoArquivarGesseiro('João')).toBe(
      'Arquivar João? Ele some da lista e é apagado de vez em 7 dias; até lá dá para restaurar em "Ver arquivados".',
    );
    expect(ZERE_O_SALDO).toBe('Zere o saldo para arquivar');
  });

  it('material com saldo: avisa quanto ainda há', () => {
    expect(
      confirmacaoArquivarMaterial({ nome: 'Cal', unidade: 'saco', saldoAtual: '1250.5' }),
    ).toBe(
      'Arquivar Cal? Ainda há 1.250,5 saco em estoque. Ele some do estoque e é apagado de vez em 7 dias; até lá dá para restaurar em "Ver arquivados".',
    );
  });

  it('material com saldo negativo também avisa', () => {
    expect(
      confirmacaoArquivarMaterial({ nome: 'Cal', unidade: 'saco', saldoAtual: '-2' }),
    ).toContain('Ainda há -2 saco em estoque.');
  });

  it.each(['0', '0.00', 0])('material com saldo %p: sem aviso', (saldoAtual) => {
    expect(confirmacaoArquivarMaterial({ nome: 'Cal', unidade: 'saco', saldoAtual })).toBe(
      'Arquivar Cal? Ele some do estoque e é apagado de vez em 7 dias; até lá dá para restaurar em "Ver arquivados".',
    );
  });

  it('falha de rede é o status 0', () => {
    expect(ehFalhaDeRede(Object.assign(new Error('x'), { status: 0 }))).toBe(true);
    expect(ehFalhaDeRede(Object.assign(new Error('x'), { status: 400 }))).toBe(false);
    expect(ehFalhaDeRede(null)).toBe(false);
  });
});
