import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { TipoMovimentacao } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { MateriaisPrevistosService } from '../obras/materiais-previstos.service';
import { EstoqueService } from './estoque.service';

/** ARQ-06, ARQ-07, ARQ-11 (AC1, AC3) e ARQ-12 (AC4) de arquivar-e-limpar-registros. */
describe('Estoque: arquivamento de material', () => {
  const AGORA = new Date('2026-11-20T15:00:00.000Z');
  let estoque: EstoqueService;
  let previstos: MateriaisPrevistosService;
  let prisma: {
    material: {
      findUnique: jest.Mock;
      findMany: jest.Mock;
      updateMany: jest.Mock;
      findUniqueOrThrow: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
    };
    obra: { findUnique: jest.Mock };
    materialPrevistoObra: { findMany: jest.Mock; deleteMany: jest.Mock; createMany: jest.Mock };
    movimentacaoEstoque: { create: jest.Mock };
    $transaction: jest.Mock;
  };

  const gesso = (extra: object = {}) => ({
    id: 'm-1',
    nome: 'Gesso em pó',
    unidade: 'saco',
    saldoAtual: '30',
    estoqueMinimo: '10',
    arquivadoEm: null,
    ...extra,
  });

  beforeEach(async () => {
    jest.useFakeTimers().setSystemTime(AGORA);
    prisma = {
      material: {
        findUnique: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        updateMany: jest.fn(),
        findUniqueOrThrow: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      obra: { findUnique: jest.fn() },
      materialPrevistoObra: {
        findMany: jest.fn().mockResolvedValue([]),
        deleteMany: jest.fn(),
        createMany: jest.fn(),
      },
      movimentacaoEstoque: { create: jest.fn() },
      $transaction: jest.fn(),
    };
    const modulo: TestingModule = await Test.createTestingModule({
      providers: [
        EstoqueService,
        MateriaisPrevistosService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    estoque = modulo.get(EstoqueService);
    previstos = modulo.get(MateriaisPrevistosService);
  });

  afterEach(() => jest.useRealTimers());

  describe('arquivarMaterial', () => {
    it('com qualquer saldo: updateMany condicional com a data de agora', async () => {
      prisma.material.updateMany.mockResolvedValue({ count: 1 });
      prisma.material.findUniqueOrThrow.mockResolvedValue(gesso({ arquivadoEm: AGORA }));

      const resultado = await estoque.arquivarMaterial('m-1');

      expect(prisma.material.updateMany).toHaveBeenCalledWith({
        where: { id: 'm-1', arquivadoEm: null },
        data: { arquivadoEm: AGORA },
      });
      expect(resultado.arquivadoEm).toBe(AGORA);
    });

    it('já arquivado: 400', async () => {
      prisma.material.updateMany.mockResolvedValue({ count: 0 });
      prisma.material.findUnique.mockResolvedValue(gesso({ arquivadoEm: AGORA }));

      const promessa = estoque.arquivarMaterial('m-1');

      await expect(promessa).rejects.toBeInstanceOf(BadRequestException);
      await expect(promessa).rejects.toThrow('O material já está arquivado');
    });

    it('inexistente: 404', async () => {
      prisma.material.updateMany.mockResolvedValue({ count: 0 });
      prisma.material.findUnique.mockResolvedValue(null);

      await expect(estoque.arquivarMaterial('x')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('restaurarMaterial', () => {
    it('limpa arquivadoEm de forma condicional', async () => {
      prisma.material.updateMany.mockResolvedValue({ count: 1 });
      prisma.material.findUniqueOrThrow.mockResolvedValue(gesso());

      await estoque.restaurarMaterial('m-1');

      expect(prisma.material.updateMany).toHaveBeenCalledWith({
        where: { id: 'm-1', arquivadoEm: { not: null } },
        data: { arquivadoEm: null },
      });
    });

    it('não arquivado: 400 com a mensagem exata', async () => {
      prisma.material.updateMany.mockResolvedValue({ count: 0 });
      prisma.material.findUnique.mockResolvedValue(gesso());

      await expect(estoque.restaurarMaterial('m-1')).rejects.toThrow(
        'O material não está arquivado',
      );
    });

    it('inexistente: 404', async () => {
      prisma.material.updateMany.mockResolvedValue({ count: 0 });
      prisma.material.findUnique.mockResolvedValue(null);

      await expect(estoque.restaurarMaterial('x')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('listas', () => {
    it('listarMateriais sem flag esconde os arquivados, por nome', async () => {
      await estoque.listarMateriais();

      expect(prisma.material.findMany).toHaveBeenCalledWith({
        where: { arquivadoEm: null },
        orderBy: { nome: 'asc' },
      });
    });

    it('com flag: só arquivados, do mais recente', async () => {
      await estoque.listarMateriais(true);

      expect(prisma.material.findMany).toHaveBeenCalledWith({
        where: { arquivadoEm: { not: null } },
        orderBy: { arquivadoEm: 'desc' },
      });
    });

    it('abaixoDoMinimo usa a lista sem arquivados', async () => {
      prisma.material.findMany.mockResolvedValue([gesso({ saldoAtual: '2' })]);

      expect(await estoque.abaixoDoMinimo()).toHaveLength(1);
      expect(prisma.material.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { arquivadoEm: null } }),
      );
    });
  });

  describe('criarMaterial (ARQ-12 AC4)', () => {
    it('nome de material arquivado: 409 com a mensagem exata, sem criar', async () => {
      prisma.material.findUnique.mockResolvedValue(gesso({ arquivadoEm: AGORA }));

      const promessa = estoque.criarMaterial({ nome: 'Gesso em pó', unidade: 'saco' });

      await expect(promessa).rejects.toBeInstanceOf(ConflictException);
      await expect(promessa).rejects.toThrow(
        'Existe um material arquivado com esse nome. Restaure-o em "Ver arquivados".',
      );
      expect(prisma.material.findUnique).toHaveBeenCalledWith({ where: { nome: 'Gesso em pó' } });
      expect(prisma.material.create).not.toHaveBeenCalled();
    });

    it('nome livre: cria normalmente', async () => {
      prisma.material.findUnique.mockResolvedValue(null);
      prisma.material.create.mockResolvedValue(gesso());

      await estoque.criarMaterial({ nome: 'Gesso em pó', unidade: 'saco' });

      expect(prisma.material.create).toHaveBeenCalledTimes(1);
    });
  });

  describe('uso de material arquivado (ARQ-11 AC3)', () => {
    it('movimentação: 400 com o nome, sem gravar', async () => {
      prisma.material.findUnique.mockResolvedValue(gesso({ arquivadoEm: AGORA }));

      const promessa = estoque.movimentar({
        materialId: 'm-1',
        tipo: TipoMovimentacao.ENTRADA,
        quantidade: 5,
      });

      await expect(promessa).rejects.toBeInstanceOf(BadRequestException);
      await expect(promessa).rejects.toThrow('O material Gesso em pó está arquivado');
      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(prisma.movimentacaoEstoque.create).not.toHaveBeenCalled();
    });

    it('previsto novo com material arquivado: 400 com o nome', async () => {
      prisma.material.findMany.mockResolvedValue([
        { id: 'm-1', nome: 'Gesso em pó', arquivadoEm: AGORA },
      ]);

      await expect(previstos.validarItens([{ materialId: 'm-1', quantidade: 3 }])).rejects.toThrow(
        'O material Gesso em pó está arquivado',
      );
    });

    it('a validação lê nome e arquivadoEm do material (auditor #1)', async () => {
      prisma.material.findMany.mockResolvedValue([{ id: 'm-2', nome: 'Cal', arquivadoEm: null }]);

      await previstos.validarItens([{ materialId: 'm-2', quantidade: 1 }]);

      expect(prisma.material.findMany).toHaveBeenCalledWith({
        where: { id: { in: ['m-2'] } },
        select: { id: true, nome: true, arquivadoEm: true },
      });
    });

    it('substituir com material arquivado que a obra não previa: 400 sem transação (auditor #2)', async () => {
      prisma.obra.findUnique.mockResolvedValue({ id: 'o-1', status: 'ANDAMENTO' });
      prisma.materialPrevistoObra.findMany.mockResolvedValueOnce([{ materialId: 'm-2' }]);
      prisma.material.findMany.mockResolvedValue([
        { id: 'm-1', nome: 'Gesso em pó', arquivadoEm: AGORA },
      ]);

      await expect(
        previstos.substituir('o-1', [{ materialId: 'm-1', quantidade: 3 }]),
      ).rejects.toThrow('O material Gesso em pó está arquivado');
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('material arquivado que a obra já previa continua aceito', async () => {
      prisma.material.findMany.mockResolvedValue([
        { id: 'm-1', nome: 'Gesso em pó', arquivadoEm: AGORA },
      ]);

      await expect(
        previstos.validarItens([{ materialId: 'm-1', quantidade: 3 }], undefined, ['m-1']),
      ).resolves.toBeUndefined();
    });

    it('substituir passa os previstos atuais da obra para a validação', async () => {
      prisma.obra.findUnique.mockResolvedValue({ id: 'o-1', status: 'ANDAMENTO' });
      prisma.materialPrevistoObra.findMany.mockResolvedValueOnce([{ materialId: 'm-1' }]);
      prisma.material.findMany.mockResolvedValue([
        { id: 'm-1', nome: 'Gesso em pó', arquivadoEm: AGORA },
        { id: 'm-2', nome: 'Cal', arquivadoEm: null },
      ]);
      prisma.$transaction.mockResolvedValue([]);

      await previstos.substituir('o-1', [
        { materialId: 'm-1', quantidade: 3 },
        { materialId: 'm-2', quantidade: 1 },
      ]);

      expect(prisma.materialPrevistoObra.findMany).toHaveBeenCalledWith({
        where: { obraId: 'o-1' },
        select: { materialId: true },
      });
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    });
  });
});
