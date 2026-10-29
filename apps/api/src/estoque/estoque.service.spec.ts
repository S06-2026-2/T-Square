import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma, TipoMovimentacao } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { EstoqueService } from './estoque.service';

/**
 * Cobre os cenarios de .claude/specs/features/estoque-materiais-movimentacao/spec.md
 * O Prisma e substituido por um mock, entao a suite roda sem banco.
 */
describe('EstoqueService', () => {
  let service: EstoqueService;
  let prisma: {
    material: {
      findMany: jest.Mock;
      findUnique: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      updateMany: jest.Mock;
    };
    obra: { findUnique: jest.Mock };
    movimentacaoEstoque: { findMany: jest.Mock; create: jest.Mock };
    $transaction: jest.Mock;
  };

  const dec = (valor: number) => new Prisma.Decimal(valor);

  beforeEach(async () => {
    prisma = {
      material: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
      obra: { findUnique: jest.fn() },
      movimentacaoEstoque: { findMany: jest.fn(), create: jest.fn() },
      // Executa o callback da transacao passando o proprio mock como "tx".
      $transaction: jest.fn((callback: (tx: unknown) => unknown) => callback(prisma)),
    };

    const modulo: TestingModule = await Test.createTestingModule({
      providers: [EstoqueService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = modulo.get<EstoqueService>(EstoqueService);
  });

  it('deve ser definido', () => {
    expect(service).toBeDefined();
  });

  // ---------------------------------------------------------------- EST-01/02
  describe('criarMaterial', () => {
    it('cria o material usando estoqueMinimo 0 quando omitido (EST-01)', async () => {
      prisma.material.create.mockResolvedValue({ id: 'm-1', nome: 'Cal', saldoAtual: dec(0) });

      const resultado = await service.criarMaterial({ nome: 'Cal', unidade: 'saco' });

      expect(prisma.material.create).toHaveBeenCalledWith({
        data: { nome: 'Cal', unidade: 'saco', estoqueMinimo: 0 },
      });
      expect(Number(resultado.saldoAtual)).toBe(0);
    });

    it('respeita o estoqueMinimo informado', async () => {
      prisma.material.create.mockResolvedValue({ id: 'm-2' });

      await service.criarMaterial({ nome: 'Gesso', unidade: 'saco', estoqueMinimo: 20 });

      expect(prisma.material.create).toHaveBeenCalledWith({
        data: { nome: 'Gesso', unidade: 'saco', estoqueMinimo: 20 },
      });
    });

    it('retorna 409 quando ja existe material com o mesmo nome (EST-02)', async () => {
      prisma.material.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
          code: 'P2002',
          clientVersion: 'test',
        }),
      );

      await expect(service.criarMaterial({ nome: 'Cal', unidade: 'saco' })).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('nao mascara erros inesperados como 409', async () => {
      prisma.material.create.mockRejectedValue(new Error('conexao perdida'));

      await expect(service.criarMaterial({ nome: 'Cal', unidade: 'saco' })).rejects.toThrow(
        'conexao perdida',
      );
    });
  });

  // ---------------------------------------------------------------- EST-03..07
  describe('movimentar', () => {
    const material = { id: 'm-1', nome: 'Cal', saldoAtual: dec(10), estoqueMinimo: dec(5) };

    beforeEach(() => {
      prisma.material.findUnique.mockResolvedValue(material);
    });

    it('ENTRADA cria a movimentacao e incrementa o saldo na mesma transacao (EST-03)', async () => {
      prisma.movimentacaoEstoque.create.mockResolvedValue({ id: 'mov-1' });

      await service.movimentar({ materialId: 'm-1', tipo: TipoMovimentacao.ENTRADA, quantidade: 5 });

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(prisma.material.update).toHaveBeenCalledWith({
        where: { id: 'm-1' },
        data: { saldoAtual: { increment: 5 } },
      });
      expect(prisma.movimentacaoEstoque.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            materialId: 'm-1',
            tipo: TipoMovimentacao.ENTRADA,
            quantidade: 5,
          }),
        }),
      );
    });

    it('SAIDA dentro do saldo decrementa e registra a movimentacao (EST-04)', async () => {
      prisma.material.updateMany.mockResolvedValue({ count: 1 });
      prisma.movimentacaoEstoque.create.mockResolvedValue({ id: 'mov-2' });

      const resultado = await service.movimentar({
        materialId: 'm-1',
        tipo: TipoMovimentacao.SAIDA,
        quantidade: 5,
      });

      expect(prisma.material.updateMany).toHaveBeenCalledWith({
        where: { id: 'm-1', saldoAtual: { gte: 5 } },
        data: { saldoAtual: { decrement: 5 } },
      });
      expect(prisma.movimentacaoEstoque.create).toHaveBeenCalled();
      expect(resultado).toEqual({ id: 'mov-2' });
    });

    it('SAIDA exatamente igual ao saldo e permitida (saldo vai a zero)', async () => {
      prisma.material.updateMany.mockResolvedValue({ count: 1 });
      prisma.movimentacaoEstoque.create.mockResolvedValue({ id: 'mov-3' });

      await expect(
        service.movimentar({ materialId: 'm-1', tipo: TipoMovimentacao.SAIDA, quantidade: 10 }),
      ).resolves.toBeDefined();
    });

    it('SAIDA maior que o saldo retorna 400 sem gravar nada (EST-05)', async () => {
      await expect(
        service.movimentar({ materialId: 'm-1', tipo: TipoMovimentacao.SAIDA, quantidade: 100 }),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(prisma.material.updateMany).not.toHaveBeenCalled();
      expect(prisma.movimentacaoEstoque.create).not.toHaveBeenCalled();
    });

    it('SAIDA concorrente: se o saldo acabou entre a leitura e a transacao, recusa e nao grava (EST-05)', async () => {
      // A leitura inicial viu saldo 10, mas o UPDATE condicional nao encontrou saldo suficiente.
      prisma.material.updateMany.mockResolvedValue({ count: 0 });

      await expect(
        service.movimentar({ materialId: 'm-1', tipo: TipoMovimentacao.SAIDA, quantidade: 8 }),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(prisma.movimentacaoEstoque.create).not.toHaveBeenCalled();
    });

    it('retorna 404 quando o material nao existe (EST-06)', async () => {
      prisma.material.findUnique.mockResolvedValue(null);

      await expect(
        service.movimentar({ materialId: 'nao-existe', tipo: TipoMovimentacao.ENTRADA, quantidade: 1 }),
      ).rejects.toBeInstanceOf(NotFoundException);

      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('retorna 404 quando a obra informada nao existe (EST-07)', async () => {
      prisma.obra.findUnique.mockResolvedValue(null);

      await expect(
        service.movimentar({
          materialId: 'm-1',
          obraId: 'obra-fantasma',
          tipo: TipoMovimentacao.SAIDA,
          quantidade: 1,
        }),
      ).rejects.toBeInstanceOf(NotFoundException);

      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it.each(['CONCLUIDA', 'CANCELADA'])(
      'SAIDA para obra %s retorna 400 sem gravar nada (EST-09)',
      async (status) => {
        prisma.obra.findUnique.mockResolvedValue({ id: 'obra-1', status });

        await expect(
          service.movimentar({
            materialId: 'm-1',
            obraId: 'obra-1',
            tipo: TipoMovimentacao.SAIDA,
            quantidade: 1,
          }),
        ).rejects.toBeInstanceOf(BadRequestException);

        expect(prisma.$transaction).not.toHaveBeenCalled();
      },
    );

    it('ENTRADA (devolucao) para obra CONCLUIDA continua aceita (EST-09)', async () => {
      prisma.obra.findUnique.mockResolvedValue({ id: 'obra-1', status: 'CONCLUIDA' });
      prisma.movimentacaoEstoque.create.mockResolvedValue({ id: 'mov-6' });

      await service.movimentar({
        materialId: 'm-1',
        obraId: 'obra-1',
        tipo: TipoMovimentacao.ENTRADA,
        quantidade: 2,
      });

      expect(prisma.movimentacaoEstoque.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ obraId: 'obra-1' }) }),
      );
    });

    it('aceita obra existente e a vincula a movimentacao', async () => {
      prisma.obra.findUnique.mockResolvedValue({ id: 'obra-1', status: 'ANDAMENTO' });
      prisma.material.updateMany.mockResolvedValue({ count: 1 });
      prisma.movimentacaoEstoque.create.mockResolvedValue({ id: 'mov-4' });

      await service.movimentar({
        materialId: 'm-1',
        obraId: 'obra-1',
        tipo: TipoMovimentacao.SAIDA,
        quantidade: 2,
      });

      expect(prisma.movimentacaoEstoque.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ obraId: 'obra-1' }) }),
      );
    });

    it('nao consulta obra quando obraId nao e informado', async () => {
      prisma.movimentacaoEstoque.create.mockResolvedValue({ id: 'mov-5' });

      await service.movimentar({ materialId: 'm-1', tipo: TipoMovimentacao.ENTRADA, quantidade: 1 });

      expect(prisma.obra.findUnique).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------- EST-08
  describe('abaixoDoMinimo', () => {
    it('lista materiais com saldo menor ou igual ao minimo (EST-08)', async () => {
      prisma.material.findMany.mockResolvedValue([
        { id: 'a', nome: 'Abaixo', saldoAtual: dec(2), estoqueMinimo: dec(5) },
        { id: 'b', nome: 'Igual', saldoAtual: dec(5), estoqueMinimo: dec(5) },
        { id: 'c', nome: 'Acima', saldoAtual: dec(10), estoqueMinimo: dec(5) },
      ]);

      const alertas = await service.abaixoDoMinimo();

      expect(alertas.map((m) => m.id)).toEqual(['a', 'b']);
    });

    it('retorna lista vazia, sem erro, quando nenhum material esta abaixo do minimo', async () => {
      prisma.material.findMany.mockResolvedValue([
        { id: 'c', nome: 'Acima', saldoAtual: dec(10), estoqueMinimo: dec(5) },
      ]);

      await expect(service.abaixoDoMinimo()).resolves.toEqual([]);
    });
  });
});