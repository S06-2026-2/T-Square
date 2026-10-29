import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { StatusObra, TipoLancamento } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { MateriaisPrevistosService } from './materiais-previstos.service';
import { ObrasService } from './obras.service';

/**
 * Teste de referencia do projeto.
 * O Prisma e substituido por um mock, entao a suite roda sem banco.
 */
describe('ObrasService', () => {
  let service: ObrasService;
  let prisma: {
    obra: { findUnique: jest.Mock; update: jest.Mock; create: jest.Mock };
    material: { findMany: jest.Mock };
    lancamento: { createMany: jest.Mock };
    $transaction: jest.Mock;
  };

  beforeEach(async () => {
    prisma = {
      obra: { findUnique: jest.fn(), update: jest.fn(), create: jest.fn() },
      material: { findMany: jest.fn() },
      lancamento: { createMany: jest.fn() },
      // Executa o callback da transacao passando o proprio mock como "tx".
      $transaction: jest.fn((callback: (tx: unknown) => unknown) => callback(prisma)),
    };

    // MateriaisPrevistosService real (validarItens), sobre o mesmo Prisma mockado.
    const modulo: TestingModule = await Test.createTestingModule({
      providers: [
        ObrasService,
        MateriaisPrevistosService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = modulo.get<ObrasService>(ObrasService);
  });

  it('deve ser definido', () => {
    expect(service).toBeDefined();
  });

  /** EAP-37, 40 e 42 de .claude/specs/features/estoque-agente-proativo/spec.md */
  describe('create com materiais previstos', () => {
    const dadosObra = {
      titulo: 'Forro Residencia Teste',
      clienteNome: 'Cliente Teste',
      valorTotal: 8500,
    };

    it('grava os materiais previstos aninhados na criacao da obra', async () => {
      prisma.material.findMany.mockResolvedValue([{ id: 'mat-cal' }, { id: 'mat-gesso' }]);
      prisma.obra.create.mockResolvedValue({ id: 'obra-nova' });

      const resultado = await service.create({
        ...dadosObra,
        materiaisPrevistos: [
          { materialId: 'mat-cal', quantidade: 20 },
          { materialId: 'mat-gesso', quantidade: 7.5 },
        ],
      });

      expect(prisma.obra.create).toHaveBeenCalledTimes(1);
      const { data } = prisma.obra.create.mock.calls[0][0];
      expect(data).toEqual(
        expect.objectContaining({
          ...dadosObra,
          materiaisPrevistos: {
            create: [
              { materialId: 'mat-cal', quantidade: 20 },
              { materialId: 'mat-gesso', quantidade: 7.5 },
            ],
          },
        }),
      );
      expect(resultado).toEqual({ id: 'obra-nova' });
    });

    it('sem materiais previstos mantem a criacao atual', async () => {
      prisma.obra.create.mockResolvedValue({ id: 'obra-nova' });

      await service.create({ ...dadosObra, gesseiros: [{ gesseiroId: 'g-1', valorCombinado: 900 }] });

      expect(prisma.material.findMany).not.toHaveBeenCalled();
      const { data } = prisma.obra.create.mock.calls[0][0];
      expect(data).toEqual({
        ...dadosObra,
        pagamento: undefined,
        gesseiros: { create: [{ gesseiroId: 'g-1', valorCombinado: 900 }] },
        materiaisPrevistos: undefined,
      });
    });

    it('material repetido rejeita com 400 antes de criar a obra', async () => {
      prisma.material.findMany.mockResolvedValue([{ id: 'mat-cal' }]);

      const promessa = service.create({
        ...dadosObra,
        materiaisPrevistos: [
          { materialId: 'mat-cal', quantidade: 5 },
          { materialId: 'mat-cal', quantidade: 2 },
        ],
      });

      await expect(promessa).rejects.toBeInstanceOf(BadRequestException);
      await expect(promessa).rejects.toThrow(
        'Material mat-cal aparece mais de uma vez nos materiais previstos',
      );
      expect(prisma.obra.create).not.toHaveBeenCalled();
    });

    it('material inexistente rejeita com 404 antes de criar a obra', async () => {
      prisma.material.findMany.mockResolvedValue([]);

      const promessa = service.create({
        ...dadosObra,
        materiaisPrevistos: [{ materialId: 'mat-fantasma', quantidade: 5 }],
      });

      await expect(promessa).rejects.toBeInstanceOf(NotFoundException);
      await expect(promessa).rejects.toThrow('Material mat-fantasma não encontrado');
      expect(prisma.obra.create).not.toHaveBeenCalled();
    });
  });

  describe('concluir', () => {
    it('credita automaticamente cada gesseiro alocado ao concluir a obra', async () => {
      prisma.obra.findUnique.mockResolvedValue({
        id: 'obra-1',
        titulo: 'Forro Residencia Silva',
        status: StatusObra.ANDAMENTO,
        gesseiros: [
          { gesseiroId: 'g-1', valorCombinado: 2500 },
          { gesseiroId: 'g-2', valorCombinado: 1500 },
        ],
      });
      prisma.obra.update.mockResolvedValue({ id: 'obra-1', status: StatusObra.CONCLUIDA });

      const resultado = await service.concluir('obra-1');

      expect(prisma.obra.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'obra-1' },
          data: expect.objectContaining({ status: StatusObra.CONCLUIDA }),
        }),
      );

      expect(prisma.lancamento.createMany).toHaveBeenCalledWith({
        data: [
          expect.objectContaining({
            gesseiroId: 'g-1',
            obraId: 'obra-1',
            tipo: TipoLancamento.CREDITO,
            valor: 2500,
          }),
          expect.objectContaining({
            gesseiroId: 'g-2',
            tipo: TipoLancamento.CREDITO,
            valor: 1500,
          }),
        ],
      });

      expect(resultado.status).toBe(StatusObra.CONCLUIDA);
    });

    it('nao gera lancamento quando a obra nao tem gesseiro alocado', async () => {
      prisma.obra.findUnique.mockResolvedValue({
        id: 'obra-2',
        titulo: 'Obra sem equipe',
        status: StatusObra.FECHADA,
        gesseiros: [],
      });
      prisma.obra.update.mockResolvedValue({ id: 'obra-2', status: StatusObra.CONCLUIDA });

      await service.concluir('obra-2');

      expect(prisma.lancamento.createMany).not.toHaveBeenCalled();
    });

    it('nao credita duas vezes se a obra ja estiver concluida', async () => {
      prisma.obra.findUnique.mockResolvedValue({
        id: 'obra-3',
        status: StatusObra.CONCLUIDA,
        gesseiros: [],
      });

      await expect(service.concluir('obra-3')).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.lancamento.createMany).not.toHaveBeenCalled();
    });

    it('erro 404 quando a obra nao existe', async () => {
      prisma.obra.findUnique.mockResolvedValue(null);

      await expect(service.concluir('nao-existe')).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
