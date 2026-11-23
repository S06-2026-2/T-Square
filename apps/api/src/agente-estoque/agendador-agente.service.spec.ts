import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SchedulerRegistry } from '@nestjs/schedule';
import { Test, TestingModule } from '@nestjs/testing';
import { OrigemAnaliseEstoque, StatusAnaliseEstoque } from '@prisma/client';
import { CronJob } from 'cron';

import { PrismaService } from '../prisma/prisma.service';
import { AgendadorAgenteService } from './agendador-agente.service';
import { AgenteEstoqueService } from './agente-estoque.service';

/**
 * Cobre EAP-18, 19, 20 e 24 (lado do agendador) de
 * .claude/specs/features/estoque-agente-proativo/spec.md
 * Prisma, ConfigService e AgenteEstoqueService sao mocks; o relogio e fake.
 */
describe('AgendadorAgenteService', () => {
  const AGORA = new Date('2026-10-27T12:00:00.000Z');
  const HORA_MS = 60 * 60 * 1000;

  let service: AgendadorAgenteService;
  let env: Record<string, string | undefined>;
  let registro: { addCronJob: jest.Mock };
  let agente: { analisar: jest.Mock };
  let prisma: { analiseEstoque: { findFirst: jest.Mock } };
  let jobs: CronJob[];
  let logErro: jest.SpyInstance;
  let consoleErro: jest.SpyInstance;

  /** O catch-up roda sem await no boot; espera as promessas pendentes terminarem. */
  const esperarCatchUp = () => new Promise((resolve) => setImmediate(resolve));

  const cronRegistrado = (): CronJob => registro.addCronJob.mock.calls[0][1];

  beforeEach(async () => {
    jest.useFakeTimers({ now: AGORA, doNotFake: ['setImmediate'] });
    // Logger do service e o console.error que o cron usa quando o onTick rejeita.
    logErro = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    consoleErro = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    env = { AGENTE_AUTOMATICO: 'true' };
    jobs = [];
    registro = {
      addCronJob: jest.fn((_nome: string, job: CronJob) => jobs.push(job)),
    };
    agente = { analisar: jest.fn().mockResolvedValue(null) };
    prisma = { analiseEstoque: { findFirst: jest.fn().mockResolvedValue(null) } };

    const modulo: TestingModule = await Test.createTestingModule({
      providers: [
        AgendadorAgenteService,
        { provide: PrismaService, useValue: prisma },
        { provide: ConfigService, useValue: { get: (chave: string) => env[chave] } },
        { provide: SchedulerRegistry, useValue: registro },
        { provide: AgenteEstoqueService, useValue: agente },
      ],
    }).compile();

    service = modulo.get(AgendadorAgenteService);
  });

  afterEach(async () => {
    await Promise.all(jobs.map((job) => job.stop()));
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  describe('AGENTE_AUTOMATICO=true', () => {
    it('registra o cron das 06:00 no fuso America/Sao_Paulo (EAP-18)', async () => {
      service.onApplicationBootstrap();
      await esperarCatchUp();

      expect(registro.addCronJob).toHaveBeenCalledTimes(1);
      const job = cronRegistrado();
      expect(job.cronTime.source).toBe('0 0 6 * * *');
      expect(job.cronTime.timeZone).toBe('America/Sao_Paulo');
      expect(job.isActive).toBe(true);
    });

    it('o próximo disparo cai às 06:00 de Brasília (09:00 UTC)', async () => {
      service.onApplicationBootstrap();
      await esperarCatchUp();

      expect(cronRegistrado().nextDate().toUTC().toISO()).toBe('2026-10-28T09:00:00.000Z');
    });

    it('o tick do cron dispara analisar(AGENDADA) (EAP-18)', async () => {
      prisma.analiseEstoque.findFirst.mockResolvedValue({
        iniciadoEm: new Date(AGORA.getTime() - HORA_MS),
      });
      service.onApplicationBootstrap();
      await esperarCatchUp();
      agente.analisar.mockClear();

      await cronRegistrado().fireOnTick();

      expect(agente.analisar).toHaveBeenCalledTimes(1);
      expect(agente.analisar).toHaveBeenCalledWith(OrigemAnaliseEstoque.AGENDADA);
    });

    it('nunca houve análise → analisar(CATCH_UP) no boot (EAP-19)', async () => {
      prisma.analiseEstoque.findFirst.mockResolvedValue(null);

      service.onApplicationBootstrap();
      await esperarCatchUp();

      expect(agente.analisar).toHaveBeenCalledTimes(1);
      expect(agente.analisar).toHaveBeenCalledWith(OrigemAnaliseEstoque.CATCH_UP);
    });

    it('última análise terminada começou há mais de 24h → analisar(CATCH_UP) (EAP-19)', async () => {
      prisma.analiseEstoque.findFirst.mockResolvedValue({
        iniciadoEm: new Date(AGORA.getTime() - 24 * HORA_MS - 1),
      });

      service.onApplicationBootstrap();
      await esperarCatchUp();

      expect(agente.analisar).toHaveBeenCalledWith(OrigemAnaliseEstoque.CATCH_UP);
      const consulta = prisma.analiseEstoque.findFirst.mock.calls[0][0];
      expect(consulta.where).toEqual({ status: { not: StatusAnaliseEstoque.EM_ANDAMENTO } });
      expect(consulta.orderBy).toEqual({ iniciadoEm: 'desc' });
    });

    it.each([
      ['há 23h', 23 * HORA_MS],
      ['há exatamente 24h', 24 * HORA_MS],
    ])('última análise terminada começou %s → não dispara catch-up (EAP-19)', async (_d, ms) => {
      prisma.analiseEstoque.findFirst.mockResolvedValue({
        iniciadoEm: new Date(AGORA.getTime() - ms),
      });

      service.onApplicationBootstrap();
      await esperarCatchUp();

      expect(agente.analisar).not.toHaveBeenCalled();
    });

    it('tick do cron durante o catch-up em andamento e pulado (analisar → null) sem erro nem log de falha (EAP-24)', async () => {
      // Imita o contrato do AgenteEstoqueService: com uma analise rodando, o disparo automatico
      // devolve null sem criar registro (a regra em si e testada em agente-estoque.service.spec).
      let liberar!: () => void;
      let emExecucao = false;
      agente.analisar.mockImplementation(async () => {
        if (emExecucao) return null;
        emExecucao = true;
        await new Promise<void>((resolve) => (liberar = resolve));
        emExecucao = false;
        return { id: 'an-catch-up' };
      });

      expect(() => service.onApplicationBootstrap()).not.toThrow();
      await esperarCatchUp();
      expect(agente.analisar).toHaveBeenCalledWith(OrigemAnaliseEstoque.CATCH_UP);

      await cronRegistrado().fireOnTick();
      await esperarCatchUp();

      expect(agente.analisar).toHaveBeenCalledTimes(2);
      expect(agente.analisar).toHaveBeenLastCalledWith(OrigemAnaliseEstoque.AGENDADA);
      await expect(agente.analisar.mock.results[1].value).resolves.toBeNull();
      // O pulo nao e falha: nada vai para o log de erro nem escapa do onTick para o cron.
      expect(logErro).not.toHaveBeenCalled();
      expect(consoleErro).not.toHaveBeenCalled();

      liberar();
      await esperarCatchUp();
      await expect(agente.analisar.mock.results[0].value).resolves.toEqual({ id: 'an-catch-up' });
      // Nao tenta de novo o disparo pulado: ele so volta no proximo tick.
      expect(agente.analisar).toHaveBeenCalledTimes(2);
      expect(logErro).not.toHaveBeenCalled();
    });

    it('erro na analise agendada nao rejeita o tick do cron e vai para o log', async () => {
      prisma.analiseEstoque.findFirst.mockResolvedValue({
        iniciadoEm: new Date(AGORA.getTime() - HORA_MS),
      });
      service.onApplicationBootstrap();
      await esperarCatchUp();
      agente.analisar.mockRejectedValue(new Error('llm fora'));

      await expect(cronRegistrado().fireOnTick()).resolves.toBeUndefined();
      await esperarCatchUp();

      expect(agente.analisar).toHaveBeenCalledWith(OrigemAnaliseEstoque.AGENDADA);
      expect(logErro).toHaveBeenCalledTimes(1);
      expect(logErro).toHaveBeenCalledWith(expect.stringContaining('AGENDADA'));
      expect(logErro).toHaveBeenCalledWith(expect.stringContaining('llm fora'));
      // O erro foi tratado pelo service: o onTick nao rejeitou (o cron so loga quando rejeita).
      expect(consoleErro).not.toHaveBeenCalled();
    });

    it('falha ao consultar a ultima analise no boot nao rejeita: o catch-up registra o erro e o cron segue', async () => {
      prisma.analiseEstoque.findFirst.mockRejectedValue(new Error('banco fora'));

      expect(() => service.onApplicationBootstrap()).not.toThrow();
      await esperarCatchUp();

      // O catch-up roda sem await: so o try/catch dele impede uma rejeicao nao tratada.
      // A prova de que o erro foi capturado e o registro no log do service.
      expect(logErro).toHaveBeenCalledTimes(1);
      expect(logErro).toHaveBeenCalledWith(expect.stringContaining('catch-up'));
      expect(logErro).toHaveBeenCalledWith(expect.stringContaining('banco fora'));
      expect(agente.analisar).not.toHaveBeenCalled();
      expect(registro.addCronJob).toHaveBeenCalledTimes(1);
      expect(cronRegistrado().isActive).toBe(true);
    });

    it('erro no catch-up não derruba o boot', async () => {
      agente.analisar.mockRejectedValue(new Error('banco fora'));

      expect(() => service.onApplicationBootstrap()).not.toThrow();
      await esperarCatchUp();

      expect(registro.addCronJob).toHaveBeenCalledTimes(1);
    });
  });

  describe.each([
    ['false', 'false'],
    ['ausente', undefined],
  ])('AGENTE_AUTOMATICO %s (EAP-20)', (_nome, valor) => {
    it('não registra o cron e não executa o catch-up', async () => {
      env.AGENTE_AUTOMATICO = valor;

      service.onApplicationBootstrap();
      await esperarCatchUp();

      expect(registro.addCronJob).not.toHaveBeenCalled();
      expect(prisma.analiseEstoque.findFirst).not.toHaveBeenCalled();
      expect(agente.analisar).not.toHaveBeenCalled();
    });
  });
});
