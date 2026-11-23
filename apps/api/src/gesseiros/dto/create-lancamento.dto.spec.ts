import { TipoLancamento } from '@prisma/client';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { CreateLancamentoDto } from './create-lancamento.dto';

/**
 * Cobre a validacao de formato do corpo de POST /gesseiros/:id/lancamentos
 * (.claude/specs/features/gesseiros-crud-financeiro/spec.md, GES-03): `tipo` fora do enum
 * ou `valor` nao numerico → 400 (o ValidationPipe recusa o corpo).
 *
 * As regras de negocio (valor > 0, CREDITO proibido) ficam no service e sao testadas em
 * gesseiros.service.spec.ts — aqui so o que o DTO barra.
 */
describe('CreateLancamentoDto', () => {
  const camposComErro = async (corpo: Record<string, unknown>) => {
    const dto = plainToInstance(CreateLancamentoDto, corpo);
    return (await validate(dto)).map((erro) => erro.property);
  };

  it('recusa tipo fora do enum', async () => {
    expect(await camposComErro({ tipo: 'XYZ', valor: 100 })).toEqual(['tipo']);
  });

  it('recusa valor nao numerico', async () => {
    expect(await camposComErro({ tipo: TipoLancamento.VALE, valor: 'abc' })).toEqual(['valor']);
  });

  it('aceita um VALE de 100', async () => {
    expect(await camposComErro({ tipo: TipoLancamento.VALE, valor: 100 })).toEqual([]);
  });
});
