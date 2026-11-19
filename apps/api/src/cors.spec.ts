import { origensPermitidas } from './cors';

describe('origensPermitidas', () => {
  it('le uma lista separada por virgula, tirando espacos', () => {
    expect(origensPermitidas('https://a.vercel.app, http://localhost:5173')).toEqual([
      'https://a.vercel.app',
      'http://localhost:5173',
    ]);
  });

  it('tira a barra final, que o navegador nunca manda no Origin', () => {
    expect(origensPermitidas('https://a.vercel.app/')).toEqual(['https://a.vercel.app']);
  });

  it.each([
    ['ausente', undefined],
    ['vazio', ''],
    ['so com virgulas e espacos', ' , '],
  ])('libera qualquer origem quando o CORS_ORIGIN esta %s', (_caso, valor) => {
    expect(origensPermitidas(valor)).toBe('*');
  });
});
