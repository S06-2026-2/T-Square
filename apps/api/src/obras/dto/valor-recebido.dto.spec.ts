import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { CreateObraDto } from './create-obra.dto';
import { UpdateObraDto } from './update-obra.dto';

/** ARQ-01 (P1: Registrar quanto o cliente pagou) de arquivar-e-limpar-registros. */
describe('valorRecebido nos DTOs de obra', () => {
  const opcoes = { whitelist: true, forbidNonWhitelisted: true };
  const erros = async (classe: new () => object, corpo: object) =>
    (await validate(plainToInstance(classe, corpo) as object, opcoes)).map((e) => e.property);

  it.each([
    ['negativo', -0.01],
    ['não numérico', '100'],
    ['com 3 casas', 10.555],
  ])('PATCH recusa valorRecebido %s', async (_caso, valorRecebido) => {
    expect(await erros(UpdateObraDto, { valorRecebido })).toEqual(['valorRecebido']);
  });

  it.each([0, 1500.5, 8500])('PATCH aceita valorRecebido %p', async (valorRecebido) => {
    expect(await erros(UpdateObraDto, { valorRecebido })).toEqual([]);
  });

  it('POST não aceita valorRecebido: a obra nasce com 0 (AC3)', async () => {
    const corpo = { titulo: 'Forro', clienteNome: 'Maria', valorTotal: 8500, valorRecebido: 100 };
    const resultado = await validate(plainToInstance(CreateObraDto, corpo), opcoes);

    expect(resultado.map((e) => e.property)).toEqual(['valorRecebido']);
    expect(resultado[0].constraints).toHaveProperty('whitelistValidation');
  });
});
