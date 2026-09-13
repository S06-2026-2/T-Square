import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { StatusObra, TipoLancamento } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { ObrasService } from './obras.service';

/**
 * Teste de referencia do projeto.
 * O Prisma e substituido por um mock, entao a suite roda sem banco.
 */
describe('ObrasService', () => {
  let service: ObrasService;
  let prisma: {
    obra: { findUnique: jest.Mock; update: jest.Mock };
    lancamento: { createMany: jest.Mock };
    $transaction: jest.Mock;
  };

  beforeEach(async () => {
    prisma = {
      obra: { findUnique: jest.fn(), update: jest.fn() },
      lancamento: { createMany: jest.fn() },
      // Executa o callback da transacao passando o proprio mock como "tx".
      $transaction: jest.fn((callback: (tx: unknown) => unknown) => callback(prisma)),
    };

    const modulo: TestingModule = await Test.createTestingModule({
      providers: [ObrasService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = modulo.get<ObrasService>(ObrasService);
  });

  it('deve ser definido', () => {
    expect(service).toBeDefined();
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
