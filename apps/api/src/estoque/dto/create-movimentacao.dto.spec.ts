import { TipoMovimentacao } from '@prisma/client';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { CreateMovimentacaoDto } from './create-movimentacao.dto';

/**
 * Cobre o edge case de .claude/specs/features/estoque-materiais-movimentacao/spec.md:
 * quantidade <= 0 → 400 (o ValidationPipe recusa o corpo).
 *
 * O `@Min(0.01)` e a unica barreira contra quantidade negativa: o service nao confere o sinal,
 * entao uma SAIDA de -5 viraria um decrement de -5 (o saldo subiria) e uma ENTRADA de -5 poderia
 * deixar o saldo negativo.
 */
describe('CreateMovimentacaoDto', () => {
  const camposComErro = async (tipo: TipoMovimentacao, quantidade: unknown) => {
    const dto = plainToInstance(CreateMovimentacaoDto, { materialId: 'm-1', tipo, quantidade });
    return (await validate(dto)).map((erro) => erro.property);
  };

  describe.each([TipoMovimentacao.ENTRADA, TipoMovimentacao.SAIDA])('%s', (tipo) => {
    it.each([
      ['zero', 0],
      ['negativa', -5],
    ])('recusa quantidade %s', async (_caso, quantidade) => {
      expect(await camposComErro(tipo, quantidade)).toEqual(['quantidade']);
    });

    it.each([
      ['0,01', 0.01],
      ['inteira', 20],
    ])('aceita quantidade %s', async (_caso, quantidade) => {
      expect(await camposComErro(tipo, quantidade)).toEqual([]);
    });
  });
});
