import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { CreateObraDto } from './create-obra.dto';
import { SubstituirMateriaisPrevistosDto } from './materiais-previstos.dto';

/**
 * Cobre EAP-41 de .claude/specs/features/estoque-agente-proativo/spec.md:
 * quantidade <= 0 ou com mais de 2 casas decimais → 400 (o ValidationPipe recusa o corpo).
 */
describe('SubstituirMateriaisPrevistosDto', () => {
  const errosDe = async (corpo: unknown) => {
    const dto = plainToInstance(SubstituirMateriaisPrevistosDto, corpo);
    return validate(dto);
  };

  /** Propriedades com erro no primeiro item da lista. */
  const camposComErroNoItem = async (quantidade: unknown) => {
    const erros = await errosDe({ itens: [{ materialId: 'mat-cal', quantidade }] });
    const itens = erros.find((e) => e.property === 'itens');
    return (itens?.children?.[0]?.children ?? []).map((e) => e.property);
  };

  it.each([
    ['zero', 0],
    ['negativa', -5],
    ['com 3 casas decimais', 1.234],
  ])('recusa quantidade %s', async (_caso, quantidade) => {
    expect(await camposComErroNoItem(quantidade)).toEqual(['quantidade']);
  });

  it.each([
    ['0,01', 0.01],
    ['com 2 casas decimais', 12.75],
  ])('aceita quantidade %s', async (_caso, quantidade) => {
    expect(await errosDe({ itens: [{ materialId: 'mat-cal', quantidade }] })).toEqual([]);
  });

  it('aceita lista vazia (remove todos os previstos)', async () => {
    expect(await errosDe({ itens: [] })).toEqual([]);
  });

  it('exige a lista de itens e o materialId de cada item', async () => {
    const semItens = await errosDe({});
    expect(semItens.map((e) => e.property)).toEqual(['itens']);

    const semMaterial = await errosDe({ itens: [{ quantidade: 3 }] });
    expect(semMaterial[0].children?.[0]?.children?.map((e) => e.property)).toEqual([
      'materialId',
    ]);
  });
});

describe('CreateObraDto.materiaisPrevistos', () => {
  const corpo = (quantidade: number) =>
    plainToInstance(CreateObraDto, {
      titulo: 'Obra Teste',
      clienteNome: 'Cliente Teste',
      valorTotal: 1000,
      materiaisPrevistos: [{ materialId: 'mat-cal', quantidade }],
    });

  it('recusa item com quantidade invalida tambem na criacao da obra', async () => {
    const erros = await validate(corpo(0));
    expect(erros.map((e) => e.property)).toEqual(['materiaisPrevistos']);
  });

  it('aceita item valido na criacao da obra', async () => {
    expect(await validate(corpo(20))).toEqual([]);
  });
});
