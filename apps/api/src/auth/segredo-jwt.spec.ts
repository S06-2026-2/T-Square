import { SEGREDO_PADRAO_DEV, segredoJwt } from './segredo-jwt';

describe('segredoJwt', () => {
  it('usa o JWT_SECRET definido', () => {
    expect(segredoJwt({ JWT_SECRET: 'segredo-proprio' })).toBe('segredo-proprio');
  });

  it('em producao, com segredo proprio, devolve ele', () => {
    expect(segredoJwt({ NODE_ENV: 'production', JWT_SECRET: 'segredo-proprio' })).toBe(
      'segredo-proprio',
    );
  });

  it('fora de producao, sem JWT_SECRET, cai no padrao de desenvolvimento', () => {
    expect(segredoJwt({})).toBe(SEGREDO_PADRAO_DEV);
    expect(segredoJwt({ NODE_ENV: 'development' })).toBe(SEGREDO_PADRAO_DEV);
  });

  it.each([
    ['ausente', undefined],
    ['vazio', ''],
    ['so com espacos', '   '],
    ['igual ao padrao do repositorio', SEGREDO_PADRAO_DEV],
  ])('em producao, recusa subir com JWT_SECRET %s', (_caso, valor) => {
    expect(() => segredoJwt({ NODE_ENV: 'production', JWT_SECRET: valor })).toThrow(
      'JWT_SECRET ausente ou igual ao valor padrao',
    );
  });
});
