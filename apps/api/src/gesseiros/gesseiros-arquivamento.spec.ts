import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { StatusObra, TipoLancamento } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { GesseirosService } from './gesseiros.service';

/** ARQ-06, ARQ-07, ARQ-09 e ARQ-10 (API) de arquivar-e-limpar-registros. */
describe('GesseirosService: arquivamento', () => {
  const AGORA = new Date('2026-11-20T15:00:00.000Z');
  let service: GesseirosService;

  /** Cliente da transação, separado do prisma (AD-012). */
  let tx: {
    gesseiro: { findUnique: jest.Mock; updateMany: jest.Mock; findUniqueOrThrow: jest.Mock };
    lancamento: { groupBy: jest.Mock };
  };
  let prisma: {
    gesseiro: {
      findUnique: jest.Mock;
      findMany: jest.Mock;
      updateMany: jest.Mock;
      findUniqueOrThrow: jest.Mock;
    };
    $transaction: jest.Mock;
  };

  const alocacao = (status: StatusObra, titulo = `Obra ${status}`) => ({
    obra: { status, titulo },
  });
  const gesseiro = (extra: object = {}) => ({
    id: 'g-1',
    nome: 'João',
    ativo: true,
    arquivadoEm: null,
    alocacoes: [],
    lancamentos: [],
    ...extra,
  });
  const saldo = (valor: number) => [
    { gesseiroId: 'g-1', tipo: TipoLancamento.CREDITO, _sum: { valor: String(2000 + valor) } },
    { gesseiroId: 'g-1', tipo: TipoLancamento.PAGAMENTO, _sum: { valor: '2000' } },
  ];

  beforeEach(async () => {
    jest.useFakeTimers().setSystemTime(AGORA);
    tx = {
      gesseiro: {
        findUnique: jest.fn().mockResolvedValue(gesseiro()),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findUniqueOrThrow: jest.fn().mockResolvedValue({ id: 'g-1' }),
      },
      lancamento: { groupBy: jest.fn().mockResolvedValue(saldo(0)) },
    };
    prisma = {
      gesseiro: {
        findUnique: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        updateMany: jest.fn(),
        findUniqueOrThrow: jest.fn(),
      },
      $transaction: jest.fn((callback: (t: unknown) => unknown) => callback(tx)),
    };
    const modulo: TestingModule = await Test.createTestingModule({
      providers: [GesseirosService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = modulo.get(GesseirosService);
  });

  afterEach(() => jest.useRealTimers());

  describe('arquivar', () => {
    it('saldo 0 e sem obra aberta: grava arquivadoEm e ativo=false, condicional, no tx', async () => {
      const resultado = await service.arquivar('g-1');

      expect(tx.gesseiro.updateMany).toHaveBeenCalledWith({
        where: { id: 'g-1', arquivadoEm: null },
        data: { arquivadoEm: AGORA, ativo: false },
      });
      expect(tx.lancamento.groupBy).toHaveBeenCalledWith(
        expect.objectContaining({ where: { gesseiroId: { in: ['g-1'] } } }),
      );
      expect(prisma.gesseiro.updateMany).not.toHaveBeenCalled();
      expect(resultado).toEqual({ id: 'g-1' });
    });

    it.each([
      [350.5, 'O gesseiro ainda tem saldo de R$ 350,50; zere o saldo antes de arquivar'],
      [-120, 'O gesseiro ainda tem saldo de -R$ 120,00; zere o saldo antes de arquivar'],
    ])('saldo %p: 400 com o valor em reais, sem update', async (valor, mensagem) => {
      tx.lancamento.groupBy.mockResolvedValue(saldo(valor));

      const promessa = service.arquivar('g-1');

      await expect(promessa).rejects.toBeInstanceOf(BadRequestException);
      await expect(promessa).rejects.toThrow(mensagem);
      expect(tx.gesseiro.updateMany).not.toHaveBeenCalled();
    });

    it('alocado em obras abertas: 400 com os títulos, sem update', async () => {
      tx.gesseiro.findUnique.mockResolvedValue(
        gesseiro({
          alocacoes: [
            alocacao(StatusObra.ORCAMENTO, 'Forro sala'),
            alocacao(StatusObra.ANDAMENTO, 'Sanca quarto'),
            alocacao(StatusObra.CONCLUIDA, 'Antiga'),
          ],
        }),
      );

      await expect(service.arquivar('g-1')).rejects.toThrow(
        'O gesseiro está alocado em Forro sala, Sanca quarto; remova-o dessas obras antes de arquivar',
      );
      expect(tx.gesseiro.updateMany).not.toHaveBeenCalled();
    });

    it('FECHADA também bloqueia', async () => {
      tx.gesseiro.findUnique.mockResolvedValue(
        gesseiro({ alocacoes: [alocacao(StatusObra.FECHADA)] }),
      );

      await expect(service.arquivar('g-1')).rejects.toThrow(
        'O gesseiro está alocado em Obra FECHADA',
      );
    });

    it('alocações só em obras CONCLUIDA e CANCELADA não bloqueiam', async () => {
      tx.gesseiro.findUnique.mockResolvedValue(
        gesseiro({ alocacoes: [alocacao(StatusObra.CONCLUIDA), alocacao(StatusObra.CANCELADA)] }),
      );

      await service.arquivar('g-1');

      expect(tx.gesseiro.updateMany).toHaveBeenCalledTimes(1);
    });

    it('já arquivado: 400 sem consultar saldo', async () => {
      tx.gesseiro.findUnique.mockResolvedValue(gesseiro({ arquivadoEm: AGORA }));

      await expect(service.arquivar('g-1')).rejects.toThrow('O gesseiro já está arquivado');
      expect(tx.gesseiro.updateMany).not.toHaveBeenCalled();
      expect(tx.lancamento.groupBy).not.toHaveBeenCalled();
    });

    it('corrida: count 0 responde 400 já arquivado', async () => {
      tx.gesseiro.updateMany.mockResolvedValue({ count: 0 });

      await expect(service.arquivar('g-1')).rejects.toThrow('O gesseiro já está arquivado');
      expect(tx.gesseiro.findUniqueOrThrow).not.toHaveBeenCalled();
    });

    it('inexistente: 404', async () => {
      tx.gesseiro.findUnique.mockResolvedValue(null);

      await expect(service.arquivar('x')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('restaurar', () => {
    it('limpa arquivadoEm e volta ativo=true, condicional', async () => {
      prisma.gesseiro.updateMany.mockResolvedValue({ count: 1 });
      prisma.gesseiro.findUniqueOrThrow.mockResolvedValue({ id: 'g-1', ativo: true });

      expect(await service.restaurar('g-1')).toEqual({ id: 'g-1', ativo: true });
      expect(prisma.gesseiro.updateMany).toHaveBeenCalledWith({
        where: { id: 'g-1', arquivadoEm: { not: null } },
        data: { arquivadoEm: null, ativo: true },
      });
    });

    it('não arquivado: 400 com a mensagem exata', async () => {
      prisma.gesseiro.updateMany.mockResolvedValue({ count: 0 });
      prisma.gesseiro.findUnique.mockResolvedValue(gesseiro());

      await expect(service.restaurar('g-1')).rejects.toThrow('O gesseiro não está arquivado');
    });

    it('inexistente: 404', async () => {
      prisma.gesseiro.updateMany.mockResolvedValue({ count: 0 });
      prisma.gesseiro.findUnique.mockResolvedValue(null);

      await expect(service.restaurar('x')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('findAll', () => {
    it('sem flag: só não arquivados, por nome', async () => {
      await service.findAll();

      expect(prisma.gesseiro.findMany).toHaveBeenCalledWith({
        where: { arquivadoEm: null },
        orderBy: { nome: 'asc' },
      });
    });

    it('com flag: só arquivados, do mais recente', async () => {
      await service.findAll(true);

      expect(prisma.gesseiro.findMany).toHaveBeenCalledWith({
        where: { arquivadoEm: { not: null } },
        orderBy: { arquivadoEm: 'desc' },
      });
    });
  });
});
