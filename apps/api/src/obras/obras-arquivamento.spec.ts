import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { StatusObra, TipoLancamento } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { MateriaisPrevistosService } from './materiais-previstos.service';
import { ObrasService } from './obras.service';

/**
 * ARQ-03, ARQ-07 (obra) e ARQ-15 (arquivar concorrente) de
 * .claude/specs/features/arquivar-e-limpar-registros/spec.md.
 */
describe('ObrasService: arquivamento', () => {
  const AGORA = new Date('2026-11-20T15:00:00.000Z');
  let service: ObrasService;

  /** Cliente da transação, separado do prisma (AD-012). */
  let tx: {
    obra: { findUnique: jest.Mock; updateMany: jest.Mock; findUniqueOrThrow: jest.Mock };
    lancamento: { groupBy: jest.Mock };
  };
  let prisma: {
    obra: {
      findUnique: jest.Mock;
      updateMany: jest.Mock;
      findUniqueOrThrow: jest.Mock;
      findMany: jest.Mock;
      groupBy: jest.Mock;
    };
    lancamento: { groupBy: jest.Mock };
    gesseiro: { findUnique: jest.Mock };
    obraGesseiro: { upsert: jest.Mock };
    $transaction: jest.Mock;
  };

  const joao = { gesseiroId: 'g-1', gesseiro: { id: 'g-1', nome: 'João' } };
  const pedro = { gesseiroId: 'g-2', gesseiro: { id: 'g-2', nome: 'Pedro' } };

  const obra = (extra: object = {}) => ({
    id: 'obra-1',
    titulo: 'Forro',
    status: StatusObra.CONCLUIDA,
    valorTotal: '8500.00',
    valorRecebido: '8500.00',
    arquivadoEm: null,
    gesseiros: [joao, pedro],
    ...extra,
  });

  /** Linhas do groupBy por gesseiro e tipo. */
  const lancamentos = (saldos: Record<string, number>) =>
    Object.entries(saldos).flatMap(([gesseiroId, saldo]) => [
      { gesseiroId, tipo: TipoLancamento.CREDITO, _sum: { valor: String(1000 + saldo) } },
      { gesseiroId, tipo: TipoLancamento.PAGAMENTO, _sum: { valor: '1000' } },
    ]);

  beforeEach(async () => {
    jest.useFakeTimers().setSystemTime(AGORA);
    tx = {
      obra: {
        findUnique: jest.fn().mockResolvedValue(obra()),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findUniqueOrThrow: jest.fn().mockResolvedValue({ id: 'obra-1' }),
      },
      lancamento: { groupBy: jest.fn().mockResolvedValue(lancamentos({ 'g-1': 0, 'g-2': 0 })) },
    };
    prisma = {
      obra: {
        findUnique: jest.fn(),
        updateMany: jest.fn(),
        findUniqueOrThrow: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        groupBy: jest.fn().mockResolvedValue([]),
      },
      lancamento: { groupBy: jest.fn() },
      gesseiro: { findUnique: jest.fn() },
      obraGesseiro: { upsert: jest.fn() },
      $transaction: jest.fn((callback: (t: unknown) => unknown) => callback(tx)),
    };

    const modulo: TestingModule = await Test.createTestingModule({
      providers: [
        ObrasService,
        MateriaisPrevistosService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = modulo.get(ObrasService);
  });

  afterEach(() => jest.useRealTimers());

  describe('situacaoArquivamento', () => {
    beforeEach(() => {
      prisma.obra.findUnique.mockImplementation(tx.obra.findUnique);
      prisma.lancamento.groupBy.mockImplementation(tx.lancamento.groupBy);
    });

    it('concluída, quitada e equipe paga: podeArquivar', async () => {
      expect(await service.situacaoArquivamento('obra-1')).toEqual({
        concluida: true,
        arquivada: false,
        valorRecebido: 8500,
        valorTotal: 8500,
        clienteQuitado: true,
        gesseirosPendentes: [],
        podeArquivar: true,
      });
      expect(prisma.lancamento.groupBy).toHaveBeenCalledWith(
        expect.objectContaining({ where: { gesseiroId: { in: ['g-1', 'g-2'] } } }),
      );
    });

    it('gesseiro com saldo a receber vira pendente com nome e saldo; saldo negativo não pende', async () => {
      tx.lancamento.groupBy.mockResolvedValue(lancamentos({ 'g-1': 350.5, 'g-2': -20 }));

      const situacao = await service.situacaoArquivamento('obra-1');

      expect(situacao.gesseirosPendentes).toEqual([{ id: 'g-1', nome: 'João', saldo: 350.5 }]);
      expect(situacao.podeArquivar).toBe(false);
    });

    it('cliente sem quitar: clienteQuitado false', async () => {
      tx.obra.findUnique.mockResolvedValue(obra({ valorRecebido: '8499.99' }));

      const situacao = await service.situacaoArquivamento('obra-1');

      expect(situacao.clienteQuitado).toBe(false);
      expect(situacao.podeArquivar).toBe(false);
    });

    it.each([StatusObra.ANDAMENTO, StatusObra.CANCELADA])(
      'obra %s: não pode arquivar',
      async (status) => {
        tx.obra.findUnique.mockResolvedValue(obra({ status }));

        const situacao = await service.situacaoArquivamento('obra-1');

        expect(situacao.concluida).toBe(false);
        expect(situacao.podeArquivar).toBe(false);
      },
    );

    it('equipe vazia passa na condição dos gesseiros', async () => {
      tx.obra.findUnique.mockResolvedValue(obra({ gesseiros: [] }));

      const situacao = await service.situacaoArquivamento('obra-1');

      expect(situacao.gesseirosPendentes).toEqual([]);
      expect(situacao.podeArquivar).toBe(true);
      expect(prisma.lancamento.groupBy).not.toHaveBeenCalled();
    });

    it('já arquivada: podeArquivar false', async () => {
      tx.obra.findUnique.mockResolvedValue(obra({ arquivadoEm: AGORA }));

      expect((await service.situacaoArquivamento('obra-1')).podeArquivar).toBe(false);
    });

    it('inexistente: 404', async () => {
      prisma.obra.findUnique.mockResolvedValue(null);

      await expect(service.situacaoArquivamento('x')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('arquivar', () => {
    it('sucesso: updateMany condicional no tx, com a data de agora', async () => {
      const resultado = await service.arquivar('obra-1');

      expect(tx.obra.updateMany).toHaveBeenCalledWith({
        where: { id: 'obra-1', status: StatusObra.CONCLUIDA, arquivadoEm: null },
        data: { arquivadoEm: AGORA },
      });
      expect(tx.lancamento.groupBy).toHaveBeenCalled();
      expect(prisma.obra.updateMany).not.toHaveBeenCalled();
      expect(resultado).toEqual({ id: 'obra-1' });
    });

    it('não concluída: 400 com a mensagem exata, sem update', async () => {
      tx.obra.findUnique.mockResolvedValue(
        obra({ status: StatusObra.ANDAMENTO, valorRecebido: '0' }),
      );

      const promessa = service.arquivar('obra-1');

      await expect(promessa).rejects.toBeInstanceOf(BadRequestException);
      await expect(promessa).rejects.toThrow('Só é possível arquivar uma obra concluída');
      expect(tx.obra.updateMany).not.toHaveBeenCalled();
    });

    it('cliente sem quitar: 400 com recebido e total em reais', async () => {
      tx.obra.findUnique.mockResolvedValue(obra({ valorRecebido: '4250.50' }));
      tx.lancamento.groupBy.mockResolvedValue(lancamentos({ 'g-1': 10 }));

      await expect(service.arquivar('obra-1')).rejects.toThrow(
        'O cliente ainda não pagou tudo: recebido R$ 4.250,50 de R$ 8.500,00',
      );
      expect(tx.obra.updateMany).not.toHaveBeenCalled();
    });

    it('gesseiros a pagar: 400 listando nome e saldo de cada um', async () => {
      tx.lancamento.groupBy.mockResolvedValue(lancamentos({ 'g-1': 350.5, 'g-2': 1200 }));

      await expect(service.arquivar('obra-1')).rejects.toThrow(
        'Ainda há gesseiros a pagar: João (R$ 350,50), Pedro (R$ 1.200,00)',
      );
      expect(tx.obra.updateMany).not.toHaveBeenCalled();
    });

    it('já arquivada: 400', async () => {
      tx.obra.findUnique.mockResolvedValue(obra({ arquivadoEm: AGORA }));

      await expect(service.arquivar('obra-1')).rejects.toThrow('A obra já está arquivada');
      expect(tx.obra.updateMany).not.toHaveBeenCalled();
    });

    it('corrida: updateMany com count 0 responde 400 já arquivada', async () => {
      tx.obra.updateMany.mockResolvedValue({ count: 0 });

      await expect(service.arquivar('obra-1')).rejects.toThrow('A obra já está arquivada');
      expect(tx.obra.findUniqueOrThrow).not.toHaveBeenCalled();
    });

    it('inexistente: 404', async () => {
      tx.obra.findUnique.mockResolvedValue(null);

      await expect(service.arquivar('x')).rejects.toThrow('Obra x nao encontrada');
    });
  });

  describe('restaurar', () => {
    it('limpa arquivadoEm de forma condicional e devolve a obra', async () => {
      prisma.obra.updateMany.mockResolvedValue({ count: 1 });
      prisma.obra.findUniqueOrThrow.mockResolvedValue({
        id: 'obra-1',
        status: StatusObra.CONCLUIDA,
      });

      const resultado = await service.restaurar('obra-1');

      expect(prisma.obra.updateMany).toHaveBeenCalledWith({
        where: { id: 'obra-1', arquivadoEm: { not: null } },
        data: { arquivadoEm: null },
      });
      expect(resultado).toEqual({ id: 'obra-1', status: StatusObra.CONCLUIDA });
    });

    it('não arquivada: 400 com a mensagem exata', async () => {
      prisma.obra.updateMany.mockResolvedValue({ count: 0 });
      prisma.obra.findUnique.mockResolvedValue(obra());

      await expect(service.restaurar('obra-1')).rejects.toThrow('A obra não está arquivada');
    });

    it('inexistente: 404', async () => {
      prisma.obra.updateMany.mockResolvedValue({ count: 0 });
      prisma.obra.findUnique.mockResolvedValue(null);

      await expect(service.restaurar('x')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  /** ARQ-04 e ARQ-06 (obra). */
  describe('listas', () => {
    it('GET /obras esconde as arquivadas e mantém a ordem por criação', async () => {
      await service.findAll({ status: StatusObra.CONCLUIDA });

      const consulta = prisma.obra.findMany.mock.calls[0][0];
      expect(consulta.where).toEqual({ arquivadoEm: null, status: StatusObra.CONCLUIDA });
      expect(consulta.orderBy).toEqual({ criadoEm: 'desc' });
    });

    it('?arquivados=true: só as arquivadas, da mais recente para a mais antiga', async () => {
      await service.findAll({ arquivados: true, busca: 'forro' });

      const consulta = prisma.obra.findMany.mock.calls[0][0];
      expect(consulta.where).toEqual(
        expect.objectContaining({ arquivadoEm: { not: null }, OR: expect.any(Array) }),
      );
      expect(consulta.orderBy).toEqual({ arquivadoEm: 'desc' });
    });

    it('o resumo do dashboard não conta as arquivadas', async () => {
      await service.resumo();

      expect(prisma.obra.groupBy).toHaveBeenCalledWith(
        expect.objectContaining({ where: { arquivadoEm: null } }),
      );
    });
  });

  /** ARQ-10: gesseiro arquivado não entra em obra nova. */
  describe('alocarGesseiro', () => {
    beforeEach(() =>
      prisma.obra.findUnique.mockResolvedValue(obra({ status: StatusObra.FECHADA })),
    );

    it('gesseiro arquivado: 400 com o nome, sem alocar', async () => {
      prisma.gesseiro.findUnique.mockResolvedValue({ id: 'g-1', nome: 'João', arquivadoEm: AGORA });

      const promessa = service.alocarGesseiro('obra-1', { gesseiroId: 'g-1', valorCombinado: 100 });

      await expect(promessa).rejects.toBeInstanceOf(BadRequestException);
      await expect(promessa).rejects.toThrow('O gesseiro João está arquivado');
      expect(prisma.obraGesseiro.upsert).not.toHaveBeenCalled();
    });

    it('gesseiro não arquivado: aloca', async () => {
      prisma.gesseiro.findUnique.mockResolvedValue({ id: 'g-1', nome: 'João', arquivadoEm: null });

      await service.alocarGesseiro('obra-1', { gesseiroId: 'g-1', valorCombinado: 100 });

      expect(prisma.obraGesseiro.upsert).toHaveBeenCalledTimes(1);
    });
  });
});
