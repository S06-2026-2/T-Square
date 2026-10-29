import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SchedulerRegistry } from '@nestjs/schedule';
import { OrigemAnaliseEstoque, StatusAnaliseEstoque } from '@prisma/client';
import { CronJob } from 'cron';

import { PrismaService } from '../prisma/prisma.service';
import { AgenteEstoqueService } from './agente-estoque.service';

export const NOME_CRON_AGENTE = 'agente-estoque-diario';
export const EXPRESSAO_CRON_AGENTE = '0 0 6 * * *';
export const FUSO_CRON_AGENTE = 'America/Sao_Paulo';
const CATCH_UP_MS = 24 * 60 * 60 * 1000;

/**
 * Execucao automatica do agente: cron diario as 06:00 e catch-up no boot.
 * So liga com AGENTE_AUTOMATICO=true. O cron e registrado dinamicamente (e nao com @Cron)
 * porque, com a flag desligada, ele nao pode nem existir (EAP-20).
 * Spec: .claude/specs/features/estoque-agente-proativo/spec.md (EAP-18, 19, 20, 24)
 */
@Injectable()
export class AgendadorAgenteService implements OnApplicationBootstrap {
  private readonly logger = new Logger(AgendadorAgenteService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly registro: SchedulerRegistry,
    private readonly agente: AgenteEstoqueService,
  ) {}

  onApplicationBootstrap(): void {
    if (!this.automaticoLigado()) return;

    const job = CronJob.from({
      cronTime: EXPRESSAO_CRON_AGENTE,
      timeZone: FUSO_CRON_AGENTE,
      onTick: () => this.disparar(OrigemAnaliseEstoque.AGENDADA),
    });
    this.registro.addCronJob(NOME_CRON_AGENTE, job);
    job.start();

    // Sem await: o catch-up pode levar ate ~2 min e nao deve atrasar o boot da API.
    void this.catchUp();
  }

  private automaticoLigado(): boolean {
    return (this.config.get<string>('AGENTE_AUTOMATICO') ?? '').trim().toLowerCase() === 'true';
  }

  /** Roda uma analise CATCH_UP se a ultima terminada comecou ha mais de 24h (ou nunca houve). */
  private async catchUp(): Promise<void> {
    try {
      const ultima = await this.prisma.analiseEstoque.findFirst({
        where: { status: { not: StatusAnaliseEstoque.EM_ANDAMENTO } },
        orderBy: { iniciadoEm: 'desc' },
      });
      if (ultima && Date.now() - ultima.iniciadoEm.getTime() <= CATCH_UP_MS) return;

      await this.disparar(OrigemAnaliseEstoque.CATCH_UP);
    } catch (erro) {
      this.logger.error(`Falha no catch-up do agente de estoque: ${String(erro)}`);
    }
  }

  /** Disparo automatico: se outra analise estiver rodando, analisar() devolve null e nada acontece. */
  private async disparar(origem: OrigemAnaliseEstoque): Promise<void> {
    try {
      await this.agente.analisar(origem);
    } catch (erro) {
      this.logger.error(`Falha na análise ${origem} do agente de estoque: ${String(erro)}`);
    }
  }
}
