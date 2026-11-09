import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { CreateMaterialDto } from './create-material.dto';

/**
 * Cobre EST-01 de .claude/specs/features/estoque-materiais-movimentacao/spec.md:
 * `nome` com minimo de 2 caracteres e `estoqueMinimo` opcional (o ValidationPipe recusa o resto).
 */
describe('CreateMaterialDto', () => {
  const camposComErro = async (corpo: Record<string, unknown>) =>
    (await validate(plainToInstance(CreateMaterialDto, corpo))).map((erro) => erro.property);

  it('recusa nome com menos de 2 caracteres (EST-01)', async () => {
    expect(await camposComErro({ nome: 'C', unidade: 'saco' })).toEqual(['nome']);
  });

  it('aceita nome com 2 caracteres e estoqueMinimo omitido (EST-01)', async () => {
    expect(await camposComErro({ nome: 'Ca', unidade: 'saco' })).toEqual([]);
  });

  it('recusa estoqueMinimo negativo', async () => {
    expect(await camposComErro({ nome: 'Cal', unidade: 'saco', estoqueMinimo: -1 })).toEqual([
      'estoqueMinimo',
    ]);
  });
});
