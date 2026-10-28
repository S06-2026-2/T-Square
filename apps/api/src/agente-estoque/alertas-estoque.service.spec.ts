import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
  Prisma,
  ResolvidoPor,
  StatusAlertaEstoque,
  StatusAnaliseEstoque,
  TipoAlertaEstoque,
} from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { AlertasEstoqueService } from './alertas-estoque.service';

/**
 * Cobre EAP-46, 47, 48 e 49 de .claude/specs/features/estoque-agente-proativo/spec.md
 * (e o contrato `GET /estoque/agente/alertas` → `{ ultimaAnalise, alertas }`).
 * O Prisma e substituido por um mock, entao a suite roda sem banco.
 */
describe('AlertasEstoqueService', () => {
  let service: AlertasEstoqueService;
  let prisma: {
    alertaEstoque: { findMany: jest.Mock; findUnique: jest.Mock; update: jest.Mock };
    analiseEstoque: { findFirst: jest.Mock };
  };

  const AGORA = new Date('2026-10-27T12:00:00.000Z');

  const alerta = (status: StatusAlertaEstoque) => ({
    id: 'alerta-1',
    materialId: 'mat-1',
    tipo: TipoAlertaEstoque.REPOSICAO,
    status,
  });

  beforeEach(async () => {
    jest.useFakeTimers({ now: AGORA });
    prisma = {
      alertaEstoque: { findMany: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
      analiseEstoque: { findFirst: jest.fn() },
    };

    const modulo: TestingModule = await Test.createTestingModule({
      providers: [AlertasEstoqueService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = modulo.get<AlertasEstoqueService>(AlertasEstoqueService);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('listarAtivos', () => {
    it('lista só os alertas ATIVO, com o material incluído', async () => {
      const ativos = [{ ...alerta(StatusAlertaEstoque.ATIVO), material: { nome: 'Cal' } }];
      prisma.alertaEstoque.findMany.mockResolvedValue(ativos);
      prisma.analiseEstoque.findFirst.mockResolvedValue(null);

      const resultado = await service.listarAtivos();

      const consulta = prisma.alertaEstoque.findMany.mock.calls[0][0];
      expect(consulta.where).toEqual({ status: StatusAlertaEstoque.ATIVO });
      expect(consulta.include).toEqual({ material: true });
      expect(consulta.orderBy).toEqual({ criadoEm: 'asc' });
      expect(resultado.alertas).toEqual(ativos);
    });

    it('ordena por urgência: abaixo → no mínimo → previsão (dias crescente) → informativo; empate por criadoEm', async () => {
      const d = (v: number | string) => new Prisma.Decimal(v);
      const a = (
        id: string,
        tipo: TipoAlertaEstoque,
        saldoLivre: number,
        diasAteMinimo: number | null,
      ) => ({
        id,
        tipo,
        status: StatusAlertaEstoque.ATIVO,
        saldoLivre: d(saldoLivre),
        estoqueMinimo: d(10),
        diasAteMinimo: diasAteMinimo === null ? null : d(diasAteMinimo),
      });
      // Ordem de criadoEm crescente, como a consulta devolve.
      prisma.alertaEstoque.findMany.mockResolvedValue([
        a('info', TipoAlertaEstoque.INFORMATIVO, 40, 30),
        a('prev-6', TipoAlertaEstoque.REPOSICAO, 22, 6),
        a('prev-sem-dias', TipoAlertaEstoque.REPOSICAO, 12, null),
        a('no-minimo', TipoAlertaEstoque.REPOSICAO, 10, 0),
        a('prev-2', TipoAlertaEstoque.REPOSICAO, 14, 2),
        a('abaixo-1', TipoAlertaEstoque.REPOSICAO, 5, 0),
        a('abaixo-2', TipoAlertaEstoque.REPOSICAO, -3, 0),
      ]);
      prisma.analiseEstoque.findFirst.mockResolvedValue(null);

      const resultado = await service.listarAtivos();

      expect(resultado.alertas.map((x) => x.id)).toEqual([
        'abaixo-1',
        'abaixo-2',
        'no-minimo',
        'prev-2',
        'prev-6',
        'prev-sem-dias',
        'info',
      ]);
    });

    it('ultimaAnalise é a mais recente que não está EM_ANDAMENTO', async () => {
      const terminada = { id: 'an-1', status: StatusAnaliseEstoque.FALHA };
      prisma.alertaEstoque.findMany.mockResolvedValue([]);
      prisma.analiseEstoque.findFirst.mockResolvedValue(terminada);

      const resultado = await service.listarAtivos();

      const consulta = prisma.analiseEstoque.findFirst.mock.calls[0][0];
      expect(consulta.where).toEqual({ status: { not: StatusAnaliseEstoque.EM_ANDAMENTO } });
      expect(consulta.orderBy).toEqual({ iniciadoEm: 'desc' });
      expect(resultado.ultimaAnalise).toBe(terminada);
    });

    it('sem nenhuma análise, ultimaAnalise é null', async () => {
      prisma.alertaEstoque.findMany.mockResolvedValue([]);
      prisma.analiseEstoque.findFirst.mockResolvedValue(null);

      const resultado = await service.listarAtivos();

      expect(resultado).toEqual({ ultimaAnalise: null, alertas: [] });
    });
  });

  describe('dispensar (EAP-46)', () => {
    it('muda o status para DISPENSADO e grava a data', async () => {
      prisma.alertaEstoque.findUnique.mockResolvedValue(alerta(StatusAlertaEstoque.ATIVO));
      prisma.alertaEstoque.update.mockImplementation(({ data }) => ({
        ...alerta(StatusAlertaEstoque.ATIVO),
        ...data,
      }));

      const resultado = await service.dispensar('alerta-1');

      expect(prisma.alertaEstoque.update).toHaveBeenCalledWith({
        where: { id: 'alerta-1' },
        data: { status: StatusAlertaEstoque.DISPENSADO, dispensadoEm: AGORA },
      });
      expect(resultado.status).toBe(StatusAlertaEstoque.DISPENSADO);
      expect(resultado.dispensadoEm).toEqual(AGORA);
    });
  });

  describe('resolver (EAP-47)', () => {
    it('muda o status para RESOLVIDO com resolvidoPor OPERADOR e grava a data', async () => {
      prisma.alertaEstoque.findUnique.mockResolvedValue(alerta(StatusAlertaEstoque.ATIVO));
      prisma.alertaEstoque.update.mockImplementation(({ data }) => ({
        ...alerta(StatusAlertaEstoque.ATIVO),
        ...data,
      }));

      const resultado = await service.resolver('alerta-1');

      expect(prisma.alertaEstoque.update).toHaveBeenCalledWith({
        where: { id: 'alerta-1' },
        data: {
          status: StatusAlertaEstoque.RESOLVIDO,
          resolvidoPor: ResolvidoPor.OPERADOR,
          resolvidoEm: AGORA,
        },
      });
      expect(resultado.status).toBe(StatusAlertaEstoque.RESOLVIDO);
      expect(resultado.resolvidoPor).toBe(ResolvidoPor.OPERADOR);
      expect(resultado.resolvidoEm).toEqual(AGORA);
    });
  });

  describe.each([
    ['dispensar', (s: AlertasEstoqueService, id: string) => s.dispensar(id)],
    ['resolver', (s: AlertasEstoqueService, id: string) => s.resolver(id)],
  ])('%s: erros', (_nome, acao) => {
    it.each([StatusAlertaEstoque.DISPENSADO, StatusAlertaEstoque.RESOLVIDO])(
      'alerta %s → 400 "Alerta <id> não está ativo" sem alterá-lo (EAP-48)',
      async (status) => {
        prisma.alertaEstoque.findUnique.mockResolvedValue(alerta(status));

        const promessa = acao(service, 'alerta-1');

        await expect(promessa).rejects.toBeInstanceOf(BadRequestException);
        await expect(promessa).rejects.toThrow('Alerta alerta-1 não está ativo');
        expect(prisma.alertaEstoque.update).not.toHaveBeenCalled();
      },
    );

    it('id inexistente → 404 "Alerta <id> não encontrado" (EAP-49)', async () => {
      prisma.alertaEstoque.findUnique.mockResolvedValue(null);

      const promessa = acao(service, 'nao-existe');

      await expect(promessa).rejects.toBeInstanceOf(NotFoundException);
      await expect(promessa).rejects.toThrow('Alerta nao-existe não encontrado');
      expect(prisma.alertaEstoque.update).not.toHaveBeenCalled();
    });
  });
});
