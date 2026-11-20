import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { CancelarObraDto } from './cancelar-obra.dto';

/**
 * TRN-09 (P2 AC1 e AC3) de .claude/specs/features/obras-transicoes-status/spec.md:
 * motivo obrigatorio, de 3 a 500 caracteres depois do trim, gravado sem espacos nas pontas.
 */
describe('CancelarObraDto', () => {
  const opcoes = { whitelist: true, forbidNonWhitelisted: true };
  const montar = (corpo: object) => plainToInstance(CancelarObraDto, corpo);
  const camposComErro = async (corpo: object) =>
    (await validate(montar(corpo), opcoes)).map((e) => e.property);

  it.each([
    ['ausente', {}],
    ['nulo', { motivo: null }],
    ['que nao e texto', { motivo: 123 }],
    ['com 2 caracteres depois do trim', { motivo: '  ab  ' }],
    ['so com espacos', { motivo: '      ' }],
    ['com 501 caracteres', { motivo: 'a'.repeat(501) }],
  ])('recusa motivo %s', async (_caso, corpo) => {
    expect(await camposComErro(corpo)).toEqual(['motivo']);
  });

  it.each([
    ['com 3 caracteres', 'abc'],
    ['com 500 caracteres', 'a'.repeat(500)],
    ['com 500 caracteres e espacos nas pontas', `  ${'a'.repeat(500)}  `],
  ])('aceita motivo %s', async (_caso, motivo) => {
    expect(await camposComErro({ motivo })).toEqual([]);
  });

  it('tira os espacos das pontas do motivo', () => {
    expect(montar({ motivo: '  Cliente desistiu  ' }).motivo).toBe('Cliente desistiu');
  });
});
