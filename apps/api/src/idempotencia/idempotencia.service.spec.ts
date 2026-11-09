import { ConflictException, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { IdempotenciaService } from './idempotencia.service';

/**
 * Cobre IDP-02 a IDP-06 de .claude/specs/features/pwa-instalavel-responsivo/spec.md
 * (lado do servidor). Mesmo padrao de obras.service.spec.ts, com uma diferenca: o `tx`
 * entregue ao callback da $transaction e um mock SEPARADO do `prisma`, para provar que a
 * criacao e a chave usam o cliente da transacao.
 */
describe('IdempotenciaService', () => {
  const AGORA = new Date('2026-11-09T12:00:00.000Z');
  const DIA_MS = 24 * 60 * 60 * 1000;

  const ctx = {
    chave: '3f2b8c1e-9a4d-4e6f-b1c2-7d8e9f0a1b2c',
    usuarioId: 'usuario-1',
    rota: 'POST /api/gesseiros/g-1/lancamentos',
    hashCorpo: 'a'.repeat(64),
  };

  let service: IdempotenciaService;
  let tx: {
    $queryRaw: jest.Mock;
    chaveIdempotencia: { findUnique: jest.Mock; delete: jest.Mock; create: jest.Mock };
  };
  let prisma: {
    $transaction: jest.Mock;
    chaveIdempotencia: { deleteMany: jest.Mock };
  };
  let criar: jest.Mock;

  /** Linha gravada ha `idadeMs`. */
  const linha = (idadeMs: number, hashCorpo = ctx.hashCorpo) => ({
    id: 'linha-1',
    ...ctx,
    hashCorpo,
    statusHttp: 201,
    resposta: { id: 'lanc-original', valor: '150.5' },
    criadoEm: new Date(AGORA.getTime() - idadeMs),
  });

  beforeEach(async () => {
    jest.spyOn(Date, 'now').mockReturnValue(AGORA.getTime());

    tx = {
      $queryRaw: jest.fn().mockResolvedValue([{ ok: true }]),
      chaveIdempotencia: {
        findUnique: jest.fn().mockResolvedValue(null),
        delete: jest.fn().mockResolvedValue({}),
        create: jest.fn().mockResolvedValue({}),
      },
    };
    prisma = {
      // Executa o callback da transacao com o `tx` separado.
      $transaction: jest.fn((callback: (t: unknown) => unknown) => callback(tx)),
      chaveIdempotencia: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
    };
    criar = jest.fn().mockResolvedValue({ id: 'lanc-novo' });

    const modulo: TestingModule = await Test.createTestingModule({
      providers: [IdempotenciaService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = modulo.get(IdempotenciaService);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('sem Idempotency-Key (IDP-06)', () => {
    it('chama criar sem cliente (o service segue o proprio caminho) e nao abre transacao', async () => {
      const resultado = await service.executar(null, criar);

      expect(criar).toHaveBeenCalledTimes(1);
      expect(criar.mock.calls[0]).toEqual([]);
      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(resultado).toEqual({ id: 'lanc-novo' });
    });
  });

  describe('com Idempotency-Key', () => {
    it('roda tudo numa unica $transaction com timeout de 15 s, na ordem trava, busca, criar, chave', async () => {
      await service.executar(ctx, criar);

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), { timeout: 15_000 });

      const ordem = [
        tx.$queryRaw.mock.invocationCallOrder[0],
        tx.chaveIdempotencia.findUnique.mock.invocationCallOrder[0],
        criar.mock.invocationCallOrder[0],
        tx.chaveIdempotencia.create.mock.invocationCallOrder[0],
      ];
      expect(ordem).toEqual([...ordem].sort((a, b) => a - b));
      expect(tx.chaveIdempotencia.findUnique).toHaveBeenCalledWith({
        where: {
          usuarioId_rota_chave: { usuarioId: ctx.usuarioId, rota: ctx.rota, chave: ctx.chave },
        },
      });
    });

    it('a trava consultiva e por usuario, rota e chave', async () => {
      await service.executar(ctx, criar);

      const [sql, ...valores] = tx.$queryRaw.mock.calls[0];
      expect(sql.join('?')).toContain('pg_try_advisory_xact_lock');
      expect(valores).toEqual([`${ctx.usuarioId} ${ctx.rota} ${ctx.chave}`]);
    });

    it('trava negada da 409 sem criar nem gravar a chave (IDP-04)', async () => {
      tx.$queryRaw.mockResolvedValue([{ ok: false }]);

      const promessa = service.executar(ctx, criar);

      await expect(promessa).rejects.toBeInstanceOf(ConflictException);
      await expect(promessa).rejects.toThrow('Este envio ainda está sendo processado.');
      await expect(promessa).rejects.toMatchObject({
        response: { message: 'Este envio ainda está sendo processado.', codigo: 'EM_PROCESSAMENTO' },
      });
      expect(tx.chaveIdempotencia.findUnique).not.toHaveBeenCalled();
      expect(criar).not.toHaveBeenCalled();
      expect(tx.chaveIdempotencia.create).not.toHaveBeenCalled();
    });

    it('chave com menos de 24 h e outro corpo da 422 sem criar (IDP-03)', async () => {
      tx.chaveIdempotencia.findUnique.mockResolvedValue(linha(60_000, 'b'.repeat(64)));

      const promessa = service.executar(ctx, criar);

      await expect(promessa).rejects.toBeInstanceOf(UnprocessableEntityException);
      await expect(promessa).rejects.toThrow(
        'Esta Idempotency-Key já foi usada com outros dados.',
      );
      expect(criar).not.toHaveBeenCalled();
      expect(tx.chaveIdempotencia.create).not.toHaveBeenCalled();
    });

    it('chave com menos de 24 h e o mesmo corpo devolve a resposta guardada sem gravar (IDP-02)', async () => {
      tx.chaveIdempotencia.findUnique.mockResolvedValue(linha(60_000));

      const resultado = await service.executar(ctx, criar);

      expect(resultado).toEqual({ id: 'lanc-original', valor: '150.5' });
      expect(criar).not.toHaveBeenCalled();
      expect(tx.chaveIdempotencia.create).not.toHaveBeenCalled();
      expect(tx.chaveIdempotencia.delete).not.toHaveBeenCalled();
    });

    it('chave com 24 h + 1 ms vence: apaga a linha e processa como nova (IDP-05)', async () => {
      tx.chaveIdempotencia.findUnique.mockResolvedValue(linha(DIA_MS + 1, 'b'.repeat(64)));

      const resultado = await service.executar(ctx, criar);

      expect(tx.chaveIdempotencia.delete).toHaveBeenCalledWith({ where: { id: 'linha-1' } });
      expect(criar).toHaveBeenCalledTimes(1);
      expect(tx.chaveIdempotencia.create).toHaveBeenCalledTimes(1);
      expect(resultado).toEqual({ id: 'lanc-novo' });
    });

    it('chave com 24 h - 1 ms ainda vale (IDP-05)', async () => {
      tx.chaveIdempotencia.findUnique.mockResolvedValue(linha(DIA_MS - 1));

      const resultado = await service.executar(ctx, criar);

      expect(resultado).toEqual({ id: 'lanc-original', valor: '150.5' });
      expect(tx.chaveIdempotencia.delete).not.toHaveBeenCalled();
      expect(criar).not.toHaveBeenCalled();
    });

    it('criar recebe o tx; grava a resposta serializada (Decimal e Date) com status 201', async () => {
      criar.mockResolvedValue({
        id: 'lanc-novo',
        valor: new Prisma.Decimal('150.50'),
        criadoEm: new Date('2026-11-09T11:59:00.000Z'),
      });
      const serializada = { id: 'lanc-novo', valor: '150.5', criadoEm: '2026-11-09T11:59:00.000Z' };

      const resultado = await service.executar(ctx, criar);

      expect(criar).toHaveBeenCalledWith(tx);
      expect(criar.mock.calls[0][0]).not.toBe(prisma);
      expect(tx.chaveIdempotencia.create).toHaveBeenCalledWith({
        data: {
          chave: ctx.chave,
          usuarioId: ctx.usuarioId,
          rota: ctx.rota,
          hashCorpo: ctx.hashCorpo,
          statusHttp: 201,
          resposta: serializada,
        },
      });
      expect(resultado).toEqual(serializada);
    });

    it('erro em criar sobe o mesmo erro e a chave nao e gravada', async () => {
      const erro = new NotFoundException('Gesseiro g-1 nao encontrado');
      criar.mockRejectedValue(erro);

      await expect(service.executar(ctx, criar)).rejects.toBe(erro);
      expect(tx.chaveIdempotencia.create).not.toHaveBeenCalled();
    });

    it('P2002 ao gravar a chave vira 409', async () => {
      tx.chaveIdempotencia.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
          code: 'P2002',
          clientVersion: '5.22.0',
        }),
      );

      const promessa = service.executar(ctx, criar);
      await expect(promessa).rejects.toBeInstanceOf(ConflictException);
      await expect(promessa).rejects.toMatchObject({ response: { codigo: 'EM_PROCESSAMENTO' } });
    });
  });

  describe('limparVencidas (IDP-05)', () => {
    it('apaga as chaves criadas ha mais de 24 h', async () => {
      await service.limparVencidas();

      expect(prisma.chaveIdempotencia.deleteMany).toHaveBeenCalledWith({
        where: { criadoEm: { lt: new Date(AGORA.getTime() - DIA_MS) } },
      });
    });
  });
});
