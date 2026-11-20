import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { CreateObraDto } from './create-obra.dto';
import { UpdateObraDto } from './update-obra.dto';

/**
 * TRN-06 (story "Fechar os atalhos de status na API", AC1-AC4) de
 * .claude/specs/features/obras-transicoes-status/spec.md. Mesmas opcoes do ValidationPipe global
 * (main.ts): whitelist + forbidNonWhitelisted, entao `status` no corpo vira 400.
 */
describe('status fora dos DTOs de obra', () => {
  const opcoes = { whitelist: true, forbidNonWhitelisted: true };
  const corpoValido = {
    titulo: 'Forro Residencia Teste',
    clienteNome: 'Cliente Teste',
    valorTotal: 8500,
  };

  const errosDe = async (classe: new () => object, corpo: object) =>
    validate(plainToInstance(classe, corpo) as object, opcoes);

  it('POST com status: CreateObraDto recusa a propriedade status (AC2)', async () => {
    const erros = await errosDe(CreateObraDto, { ...corpoValido, status: 'CONCLUIDA' });

    expect(erros.map((e) => e.property)).toEqual(['status']);
    expect(erros[0].constraints).toHaveProperty('whitelistValidation');
  });

  it('PATCH com status: UpdateObraDto recusa a propriedade status (AC3)', async () => {
    const erros = await errosDe(UpdateObraDto, { status: 'ORCAMENTO' });

    expect(erros.map((e) => e.property)).toEqual(['status']);
    expect(erros[0].constraints).toHaveProperty('whitelistValidation');
  });

  it('POST sem status continua valido (AC1)', async () => {
    expect(await errosDe(CreateObraDto, corpoValido)).toEqual([]);
  });

  it('PATCH sem status continua atualizando os demais campos (AC4)', async () => {
    expect(await errosDe(UpdateObraDto, { titulo: 'Novo titulo', valorTotal: 9000 })).toEqual([]);
  });
});
