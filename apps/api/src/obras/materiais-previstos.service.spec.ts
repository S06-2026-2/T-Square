import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Prisma, StatusObra, TipoMovimentacao } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { MateriaisPrevistosService } from './materiais-previstos.service';

const D = (valor: number | string) => new Prisma.Decimal(valor);

/**
 * Cobre EAP-38, 39, 40, 42 e 54 de .claude/specs/features/estoque-agente-proativo/spec.md
 * (EAP-41 fica no spec do DTO). O Prisma e substituido por um mock, entao a suite roda sem banco.
 */
describe('MateriaisPrevistosService', () => {
  let service: MateriaisPrevistosService;
  let prisma: {
    obra: { findUnique: jest.Mock };
    material: { findMany: jest.Mock };
    materialPrevistoObra: { deleteMany: jest.Mock; createMany: jest.Mock; findMany: jest.Mock };
    movimentacaoEstoque: { findMany: jest.Mock };
    $transaction: jest.Mock;
  };

  const materiaisExistentes = (...ids: string[]) =>
    prisma.material.findMany.mockResolvedValue(ids.map((id) => ({ id })));

  const expectNadaGravado = () => {
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.materialPrevistoObra.deleteMany).not.toHaveBeenCalled();
    expect(prisma.materialPrevistoObra.createMany).not.toHaveBeenCalled();
  };

  beforeEach(async () => {
    prisma = {
      obra: { findUnique: jest.fn() },
      material: { findMany: jest.fn() },
      materialPrevistoObra: { deleteMany: jest.fn(), createMany: jest.fn(), findMany: jest.fn() },
      movimentacaoEstoque: { findMany: jest.fn() },
      // Executa o callback da transacao passando o proprio mock como "tx".
      $transaction: jest.fn((callback: (tx: unknown) => unknown) => callback(prisma)),
    };

    const modulo: TestingModule = await Test.createTestingModule({
      providers: [MateriaisPrevistosService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = modulo.get<MateriaisPrevistosService>(MateriaisPrevistosService);
  });

  describe('substituir', () => {
    it.each([StatusObra.ORCAMENTO, StatusObra.FECHADA, StatusObra.ANDAMENTO])(
      'substitui a lista de previstos de uma obra %s e devolve a lista gravada',
      async (status) => {
        prisma.obra.findUnique.mockResolvedValue({ id: 'obra-1', status });
        materiaisExistentes('mat-cal', 'mat-gesso');
        const gravada = [
          { obraId: 'obra-1', materialId: 'mat-cal', quantidade: D(20) },
          { obraId: 'obra-1', materialId: 'mat-gesso', quantidade: D('7.5') },
        ];
        prisma.materialPrevistoObra.findMany.mockResolvedValue(gravada);

        const resultado = await service.substituir('obra-1', [
          { materialId: 'mat-cal', quantidade: 20 },
          { materialId: 'mat-gesso', quantidade: 7.5 },
        ]);

        expect(prisma.$transaction).toHaveBeenCalledTimes(1);
        expect(prisma.materialPrevistoObra.deleteMany).toHaveBeenCalledWith({
          where: { obraId: 'obra-1' },
        });
        expect(prisma.materialPrevistoObra.createMany).toHaveBeenCalledWith({
          data: [
            { obraId: 'obra-1', materialId: 'mat-cal', quantidade: 20 },
            { obraId: 'obra-1', materialId: 'mat-gesso', quantidade: 7.5 },
          ],
        });
        // Remove antes de criar: a lista enviada substitui a antiga.
        expect(prisma.materialPrevistoObra.deleteMany.mock.invocationCallOrder[0]).toBeLessThan(
          prisma.materialPrevistoObra.createMany.mock.invocationCallOrder[0],
        );
        expect(prisma.materialPrevistoObra.findMany).toHaveBeenCalledWith(
          expect.objectContaining({ where: { obraId: 'obra-1' } }),
        );
        expect(resultado).toBe(gravada);
      },
    );

    it('lista vazia remove todos os previstos da obra', async () => {
      prisma.obra.findUnique.mockResolvedValue({ id: 'obra-1', status: StatusObra.FECHADA });
      prisma.materialPrevistoObra.findMany.mockResolvedValue([]);

      const resultado = await service.substituir('obra-1', []);

      expect(prisma.materialPrevistoObra.deleteMany).toHaveBeenCalledWith({
        where: { obraId: 'obra-1' },
      });
      expect(prisma.materialPrevistoObra.createMany).not.toHaveBeenCalled();
      expect(resultado).toEqual([]);
    });

    it.each([StatusObra.CONCLUIDA, StatusObra.CANCELADA])(
      'recusa com 400 em obra %s sem alterar nada',
      async (status) => {
        prisma.obra.findUnique.mockResolvedValue({ id: 'obra-1', status });
        materiaisExistentes('mat-cal');

        const promessa = service.substituir('obra-1', [{ materialId: 'mat-cal', quantidade: 5 }]);

        await expect(promessa).rejects.toBeInstanceOf(BadRequestException);
        await expect(promessa).rejects.toThrow(
          `Não é possível alterar materiais previstos de uma obra com status ${status}`,
        );
        expectNadaGravado();
      },
    );

    it('material repetido na lista → 400 sem gravar nenhum item', async () => {
      prisma.obra.findUnique.mockResolvedValue({ id: 'obra-1', status: StatusObra.ANDAMENTO });
      materiaisExistentes('mat-cal');

      const promessa = service.substituir('obra-1', [
        { materialId: 'mat-cal', quantidade: 5 },
        { materialId: 'mat-cal', quantidade: 3 },
      ]);

      await expect(promessa).rejects.toBeInstanceOf(BadRequestException);
      await expect(promessa).rejects.toThrow(
        'Material mat-cal aparece mais de uma vez nos materiais previstos',
      );
      expectNadaGravado();
    });

    it('material inexistente → 404 sem gravar nenhum item', async () => {
      prisma.obra.findUnique.mockResolvedValue({ id: 'obra-1', status: StatusObra.ORCAMENTO });
      materiaisExistentes('mat-cal');

      const promessa = service.substituir('obra-1', [
        { materialId: 'mat-cal', quantidade: 5 },
        { materialId: 'mat-fantasma', quantidade: 3 },
      ]);

      await expect(promessa).rejects.toBeInstanceOf(NotFoundException);
      await expect(promessa).rejects.toThrow('Material mat-fantasma não encontrado');
      expectNadaGravado();
    });

    it('obra inexistente → 404', async () => {
      prisma.obra.findUnique.mockResolvedValue(null);

      const promessa = service.substituir('nao-existe', []);

      await expect(promessa).rejects.toBeInstanceOf(NotFoundException);
      await expect(promessa).rejects.toThrow('Obra nao-existe não encontrada');
      expectNadaGravado();
    });
  });

  describe('listarComUtilizado', () => {
    const previsto = (materialId: string, nome: string, quantidade: number) => ({
      obraId: 'obra-1',
      materialId,
      quantidade: D(quantidade),
      material: { id: materialId, nome, unidade: 'saco' },
    });
    const mov = (
      materialId: string,
      tipo: TipoMovimentacao,
      quantidade: number,
      nome = materialId,
    ) => ({
      materialId,
      tipo,
      quantidade: D(quantidade),
      material: { nome, unidade: 'rolo' },
    });

    const comoNumeros = (linha: Record<string, unknown>) =>
      Object.fromEntries(
        Object.entries(linha).map(([k, v]) => [k, v instanceof Prisma.Decimal ? v.toNumber() : v]),
      );

    beforeEach(() => {
      prisma.obra.findUnique.mockResolvedValue({ id: 'obra-1', status: StatusObra.ANDAMENTO });
    });

    it('calcula pendente, excedente e abate devolucoes do utilizado', async () => {
      prisma.materialPrevistoObra.findMany.mockResolvedValue([
        previsto('mat-cal', 'Cal', 20),
        previsto('mat-gesso', 'Gesso', 10),
        previsto('mat-massa', 'Massa', 12),
      ]);
      prisma.movimentacaoEstoque.findMany.mockResolvedValue([
        // Cal: 8 saem, 3 voltam → utilizado 5, pendente 15
        mov('mat-cal', TipoMovimentacao.SAIDA, 8),
        mov('mat-cal', TipoMovimentacao.ENTRADA, 3),
        // Gesso: 15 saem com 10 previstos → +5 alem do previsto
        mov('mat-gesso', TipoMovimentacao.SAIDA, 10),
        mov('mat-gesso', TipoMovimentacao.SAIDA, 5),
        // Massa: exatamente o previsto
        mov('mat-massa', TipoMovimentacao.SAIDA, 12),
      ]);

      const linhas = await service.listarComUtilizado('obra-1');

      expect(prisma.movimentacaoEstoque.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { obraId: 'obra-1' } }),
      );
      expect(linhas.map(comoNumeros)).toEqual([
        {
          materialId: 'mat-cal',
          material: 'Cal',
          unidade: 'saco',
          previsto: 20,
          utilizado: 5,
          pendente: 15,
          excedente: 0,
          semPrevisao: false,
        },
        {
          materialId: 'mat-gesso',
          material: 'Gesso',
          unidade: 'saco',
          previsto: 10,
          utilizado: 15,
          pendente: 0,
          excedente: 5,
          semPrevisao: false,
        },
        {
          materialId: 'mat-massa',
          material: 'Massa',
          unidade: 'saco',
          previsto: 12,
          utilizado: 12,
          pendente: 0,
          excedente: 0,
          semPrevisao: false,
        },
      ]);
    });

    it('devolucoes acima das saidas: utilizado 0 e pendente nunca passa do previsto', async () => {
      prisma.materialPrevistoObra.findMany.mockResolvedValue([previsto('mat-cal', 'Cal', 20)]);
      prisma.movimentacaoEstoque.findMany.mockResolvedValue([
        mov('mat-cal', TipoMovimentacao.SAIDA, 2),
        mov('mat-cal', TipoMovimentacao.ENTRADA, 6),
      ]);

      const [linha] = await service.listarComUtilizado('obra-1');

      expect(comoNumeros(linha)).toEqual(
        expect.objectContaining({ previsto: 20, utilizado: 0, pendente: 20, excedente: 0 }),
      );
    });

    it('obra sem previstos nem movimentacoes devolve lista vazia', async () => {
      prisma.materialPrevistoObra.findMany.mockResolvedValue([]);
      prisma.movimentacaoEstoque.findMany.mockResolvedValue([]);

      await expect(service.listarComUtilizado('obra-1')).resolves.toEqual([]);
    });

    it('material usado sem previsao entra depois dos previstos, com previsto 0 e tudo excedente (EAP-70)', async () => {
      prisma.materialPrevistoObra.findMany.mockResolvedValue([previsto('mat-cal', 'Cal', 20)]);
      prisma.movimentacaoEstoque.findMany.mockResolvedValue([
        mov('mat-cal', TipoMovimentacao.SAIDA, 5),
        // Fita: 7 + 4 saem para a obra sem previsao, 1 volta → utilizado 10
        mov('mat-fita', TipoMovimentacao.SAIDA, 7, 'Fita para juntas'),
        mov('mat-fita', TipoMovimentacao.SAIDA, 4, 'Fita para juntas'),
        mov('mat-fita', TipoMovimentacao.ENTRADA, 1, 'Fita para juntas'),
        mov('mat-areia', TipoMovimentacao.SAIDA, 2, 'Areia'),
      ]);

      const linhas = await service.listarComUtilizado('obra-1');

      expect(linhas.map(comoNumeros)).toEqual([
        expect.objectContaining({ materialId: 'mat-cal', previsto: 20, semPrevisao: false }),
        {
          materialId: 'mat-areia',
          material: 'Areia',
          unidade: 'rolo',
          previsto: 0,
          utilizado: 2,
          pendente: 0,
          excedente: 2,
          semPrevisao: true,
        },
        {
          materialId: 'mat-fita',
          material: 'Fita para juntas',
          unidade: 'rolo',
          previsto: 0,
          utilizado: 10,
          pendente: 0,
          excedente: 10,
          semPrevisao: true,
        },
      ]);
    });

    it('material sem previsao com devolucao total (utilizado 0) nao gera linha (EAP-70)', async () => {
      prisma.materialPrevistoObra.findMany.mockResolvedValue([]);
      prisma.movimentacaoEstoque.findMany.mockResolvedValue([
        mov('mat-fita', TipoMovimentacao.SAIDA, 3),
        mov('mat-fita', TipoMovimentacao.ENTRADA, 3),
      ]);

      await expect(service.listarComUtilizado('obra-1')).resolves.toEqual([]);
    });

    it('obra inexistente → 404', async () => {
      prisma.obra.findUnique.mockResolvedValue(null);

      const promessa = service.listarComUtilizado('nao-existe');

      await expect(promessa).rejects.toBeInstanceOf(NotFoundException);
      await expect(promessa).rejects.toThrow('Obra nao-existe não encontrada');
    });
  });
});
