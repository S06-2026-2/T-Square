import { numero, numeroOpcional, semVazios, textoOpcional } from './corpo';

describe('corpo', () => {
  it('converte o valor do input numerico para number', () => {
    expect(numero('8500')).toBe(8500);
    expect(numero('2.5')).toBe(2.5);
  });

  it('omite numero opcional vazio em vez de mandar string', () => {
    expect(numeroOpcional('')).toBeUndefined();
    expect(numeroOpcional('   ')).toBeUndefined();
    expect(numeroOpcional('2.5')).toBe(2.5);
    expect(numeroOpcional('0')).toBe(0);
  });

  it('omite texto opcional vazio e tira espacos das pontas', () => {
    expect(textoOpcional('')).toBeUndefined();
    expect(textoOpcional('   ')).toBeUndefined();
    expect(textoOpcional(' Forro ')).toBe('Forro');
  });

  it('remove so as chaves undefined, mantendo 0 e false', () => {
    expect(semVazios({ a: 1, b: undefined, c: 0, d: false, e: '' })).toEqual({
      a: 1,
      c: 0,
      d: false,
      e: '',
    });
    expect(Object.keys(semVazios({ b: undefined }))).toEqual([]);
  });
});
