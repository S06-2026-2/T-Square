import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { TipoLancamento } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { GesseirosService } from './gesseiros.service';

/**
 * Cobre a fatia P1 da spec .claude/specs/features/gesseiros-crud-financeiro/spec.md
 * (GES-01 a GES-06). Mesmo padrao de obras.service.spec.ts: Prisma mockado, sem banco real.
 */
describe('GesseirosService', () => {
  let service: GesseirosService;
  let prisma: {
    gesseiro: { findUnique: jest.Mock; create: jest.Mock };
    lancamento: { create: jest.Mock };
    obra: { findUnique: jest.Mock };
  };

  beforeEach(async () => {
    prisma = {
      gesseiro: { findUnique: jest.fn(), create: jest.fn() },
      lancamento: { create: jest.fn() },
      obra: { findUnique: jest.fn() },
    };

    const modulo: TestingModule = await Test.createTestingModule({
      providers: [GesseirosService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = modulo.get<GesseirosService>(GesseirosService);
  });

  it('deve ser definido', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('cria o gesseiro com os dados do DTO', async () => {
      const dto = { nome: 'Joao Ferreira', telefone: '(35) 99999-0001' };
      prisma.gesseiro.create.mockResolvedValue({ id: 'g-1', ativo: true, ...dto });

      const resultado = await service.create(dto);

      expect(prisma.gesseiro.create).toHaveBeenCalledWith({ data: dto });
      expect(resultado).toEqual(expect.objectContaining({ id: 'g-1', nome: 'Joao Ferreira' }));
    });
  });

  describe('registrarLancamento', () => {
    it('registra um VALE com sucesso', async () => {
      prisma.gesseiro.findUnique.mockResolvedValue({ id: 'g-1', lancamentos: [] });
      prisma.lancamento.create.mockResolvedValue({
        id: 'l-1',
        gesseiroId: 'g-1',
        tipo: TipoLancamento.VALE,
        valor: 100,
      });

      const resultado = await service.registrarLancamento('g-1', {
        tipo: TipoLancamento.VALE,
        valor: 100,
      });

      expect(prisma.lancamento.create).toHaveBeenCalledWith({
        data: { gesseiroId: 'g-1', tipo: TipoLancamento.VALE, valor: 100 },
      });
      expect(resultado.tipo).toBe(TipoLancamento.VALE);
    });

    it('registra um PAGAMENTO com sucesso', async () => {
      prisma.gesseiro.findUnique.mockResolvedValue({ id: 'g-1', lancamentos: [] });
      prisma.lancamento.create.mockResolvedValue({
        id: 'l-2',
        gesseiroId: 'g-1',
        tipo: TipoLancamento.PAGAMENTO,
        valor: 50,
      });

      await service.registrarLancamento('g-1', { tipo: TipoLancamento.PAGAMENTO, valor: 50 });

      expect(prisma.lancamento.create).toHaveBeenCalledWith({
        data: { gesseiroId: 'g-1', tipo: TipoLancamento.PAGAMENTO, valor: 50 },
      });
    });

    it('rejeita a criacao manual de CREDITO', async () => {
      await expect(
        service.registrarLancamento('g-1', { tipo: TipoLancamento.CREDITO, valor: 100 }),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(prisma.gesseiro.findUnique).not.toHaveBeenCalled();
      expect(prisma.lancamento.create).not.toHaveBeenCalled();
    });

    it('rejeita valor menor ou igual a zero', async () => {
      await expect(
        service.registrarLancamento('g-1', { tipo: TipoLancamento.VALE, valor: 0 }),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(prisma.lancamento.create).not.toHaveBeenCalled();
    });

    it('lanca 404 quando o gesseiro nao existe', async () => {
      prisma.gesseiro.findUnique.mockResolvedValue(null);

      await expect(
        service.registrarLancamento('nao-existe', { tipo: TipoLancamento.VALE, valor: 100 }),
      ).rejects.toBeInstanceOf(NotFoundException);

      expect(prisma.lancamento.create).not.toHaveBeenCalled();
    });

    it('lanca 404 quando a obraId informada nao existe', async () => {
      prisma.gesseiro.findUnique.mockResolvedValue({ id: 'g-1', lancamentos: [] });
      prisma.obra.findUnique.mockResolvedValue(null);

      await expect(
        service.registrarLancamento('g-1', {
          tipo: TipoLancamento.VALE,
          valor: 100,
          obraId: 'obra-inexistente',
        }),
      ).rejects.toBeInstanceOf(NotFoundException);

      expect(prisma.lancamento.create).not.toHaveBeenCalled();
    });
  });
});
