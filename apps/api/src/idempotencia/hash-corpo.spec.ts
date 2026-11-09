import { hashCorpo } from './hash-corpo';

/**
 * IDP-03 de .claude/specs/features/pwa-instalavel-responsivo/spec.md:
 * "mesmo corpo" e o mesmo conteudo, sem depender da ordem das chaves.
 */
describe('hashCorpo', () => {
  it('ignora a ordem das chaves, inclusive aninhadas e dentro de arrays de objetos', () => {
    const a = {
      tipo: 'VALE',
      valor: 150,
      extra: { b: 2, a: { y: 1, x: [{ q: 1, p: 2 }] } },
      itens: [{ materialId: 'm-1', quantidade: 3 }],
    };
    const b = {
      itens: [{ quantidade: 3, materialId: 'm-1' }],
      extra: { a: { x: [{ p: 2, q: 1 }], y: 1 }, b: 2 },
      valor: 150,
      tipo: 'VALE',
    };

    expect(hashCorpo(a)).toBe(hashCorpo(b));
  });

  it('valor diferente da hash diferente', () => {
    expect(hashCorpo({ tipo: 'VALE', valor: 150 })).not.toBe(
      hashCorpo({ tipo: 'VALE', valor: 151 }),
    );
  });

  it('chave a mais da hash diferente', () => {
    expect(hashCorpo({ tipo: 'VALE', valor: 150 })).not.toBe(
      hashCorpo({ tipo: 'VALE', valor: 150, observacao: 'x' }),
    );
  });

  it('a ordem dos elementos de um array conta', () => {
    expect(hashCorpo({ itens: [1, 2] })).not.toBe(hashCorpo({ itens: [2, 1] }));
  });

  it('corpo undefined ou vazio tem hash estavel', () => {
    expect(hashCorpo(undefined)).toBe(hashCorpo(undefined));
    expect(hashCorpo({})).toBe(hashCorpo({}));
  });

  it('devolve 64 caracteres hexadecimais', () => {
    expect(hashCorpo({ tipo: 'VALE' })).toMatch(/^[0-9a-f]{64}$/);
    expect(hashCorpo(undefined)).toMatch(/^[0-9a-f]{64}$/);
  });
});
