import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { filtroArquivados, QueryArquivadosDto } from './arquivados';

/** ARQ-06 (arquivar-e-limpar-registros). */
describe('QueryArquivadosDto', () => {
  const montar = (arquivados: unknown) => plainToInstance(QueryArquivadosDto, { arquivados });

  it.each([
    ['true', true],
    ['false', false],
  ])('"%s" vira %p', async (texto, esperado) => {
    const dto = montar(texto);
    expect(dto.arquivados).toBe(esperado);
    expect(await validate(dto)).toEqual([]);
  });

  it('outro valor é recusado', async () => {
    expect((await validate(montar('sim'))).map((e) => e.property)).toEqual(['arquivados']);
  });

  it('ausente passa', async () => {
    expect(await validate(plainToInstance(QueryArquivadosDto, {}))).toEqual([]);
  });
});

describe('filtroArquivados', () => {
  it('sem flag: só não arquivados, sem mudar a ordem', () => {
    expect(filtroArquivados()).toEqual({ where: { arquivadoEm: null }, orderBy: undefined });
    expect(filtroArquivados(false)).toEqual({ where: { arquivadoEm: null }, orderBy: undefined });
  });

  it('com flag: só arquivados, do mais recente para o mais antigo', () => {
    expect(filtroArquivados(true)).toEqual({
      where: { arquivadoEm: { not: null } },
      orderBy: { arquivadoEm: 'desc' },
    });
  });
});
