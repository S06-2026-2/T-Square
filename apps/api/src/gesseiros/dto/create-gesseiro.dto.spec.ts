import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { CreateGesseiroDto } from './create-gesseiro.dto';

/**
 * Cobre o GES-02 de .claude/specs/features/gesseiros-crud-financeiro/spec.md:
 * nome com menos de 3 caracteres → 400 (o ValidationPipe recusa o corpo).
 *
 * O `@MinLength(3)` e a unica barreira: o service grava o DTO direto, sem conferir o nome.
 */
describe('CreateGesseiroDto', () => {
  const camposComErro = async (nome: unknown) => {
    const dto = plainToInstance(CreateGesseiroDto, { nome });
    return (await validate(dto)).map((erro) => erro.property);
  };

  it('recusa nome com 2 caracteres', async () => {
    expect(await camposComErro('Jo')).toEqual(['nome']);
  });

  it('aceita nome com 3 caracteres', async () => {
    expect(await camposComErro('Joa')).toEqual([]);
  });
});
