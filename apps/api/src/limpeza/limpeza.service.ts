import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';

/** Tempo que um registro fica arquivado antes de ser apagado de vez (AD-015). */
export const PRAZO_ARQUIVO_MS = 7 * 24 * 60 * 60 * 1000;

type Entidade = 'obra' | 'gesseiro' | 'material';

export interface ResultadoLimpeza {
  obras: number;
  gesseiros: number;
  materiais: number;
  falhas: { entidade: Entidade; id: string; erro: string }[];
}

/**
 * ARQ-13: apaga de vez o que está arquivado há 7 dias ou mais. Uma transação por registro: a
 * falha de um não desfaz os outros nem para o job. A ordem é obras → gesseiros → materiais, para
 * que uma obra apagada no mesmo dia já tenha liberado as alocações do gesseiro.
 */
@Injectable()
export class LimpezaService {
  private readonly logger = new Logger(LimpezaService.name);

  constructor(private readonly prisma: PrismaService) {}

  @Cron(CronExpression.EVERY_DAY_AT_3AM, {
    name: 'limpeza-arquivados',
    timeZone: 'America/Sao_Paulo',
  })
  async rodarAgendada() {
    const resultado = await this.limpar();
    this.logger.log(
      `Limpeza de arquivados: ${resultado.obras} obra(s), ${resultado.gesseiros} gesseiro(s), ` +
        `${resultado.materiais} material(is), ${resultado.falhas.length} falha(s)`,
    );
    return resultado;
  }

  async limpar(agora: Date = new Date()): Promise<ResultadoLimpeza> {
    const limite = new Date(agora.getTime() - PRAZO_ARQUIVO_MS);
    const vencidos = { arquivadoEm: { lte: limite } };
    const selecao = { id: true, arquivadoEm: true } as const;
    const resultado: ResultadoLimpeza = { obras: 0, gesseiros: 0, materiais: 0, falhas: [] };

    for (const obra of await this.prisma.obra.findMany({ where: vencidos, select: selecao })) {
      if (
        await this.apagar(
          'obra',
          obra.id,
          (tx) => this.apagarObra(tx, obra.id, limite, obra.arquivadoEm!),
          resultado,
        )
      ) {
        resultado.obras += 1;
      }
    }
    for (const gesseiro of await this.prisma.gesseiro.findMany({
      where: vencidos,
      select: selecao,
    })) {
      if (
        await this.apagar(
          'gesseiro',
          gesseiro.id,
          (tx) => this.apagarGesseiro(tx, gesseiro.id, limite, gesseiro.arquivadoEm!),
          resultado,
        )
      ) {
        resultado.gesseiros += 1;
      }
    }
    for (const material of await this.prisma.material.findMany({
      where: vencidos,
      select: selecao,
    })) {
      if (
        await this.apagar(
          'material',
          material.id,
          (tx) => this.apagarMaterial(tx, material.id, limite, material.arquivadoEm!),
          resultado,
        )
      ) {
        resultado.materiais += 1;
      }
    }
    return resultado;
  }

  /** Roda a limpeza de um registro na própria transação; erro vai para o log e não para o job. */
  private async apagar(
    entidade: Entidade,
    id: string,
    passo: (tx: Prisma.TransactionClient) => Promise<boolean>,
    resultado: ResultadoLimpeza,
  ): Promise<boolean> {
    try {
      return await this.prisma.$transaction(passo);
    } catch (erro) {
      const mensagem = erro instanceof Error ? erro.message : String(erro);
      this.logger.error(`Falha ao apagar ${entidade} ${id}: ${mensagem}`);
      resultado.falhas.push({ entidade, id, erro: mensagem });
      return false;
    }
  }

  /**
   * Reconfere e trava a linha: o update (com o mesmo valor) só pega a linha se ela ainda estiver
   * vencida, e segura o lock até o commit. Um "Restaurar" que chegou antes zera a contagem e o
   * registro fica; um que chega depois espera a transação (ARQ-15).
   */
  private async travarVencido(
    tx: Prisma.TransactionClient,
    entidade: Entidade,
    id: string,
    limite: Date,
    arquivadoEm: Date,
  ): Promise<boolean> {
    const args = { where: { id, arquivadoEm: { lte: limite } }, data: { arquivadoEm } };
    const { count } =
      entidade === 'obra'
        ? await tx.obra.updateMany(args)
        : entidade === 'gesseiro'
          ? await tx.gesseiro.updateMany(args)
          : await tx.material.updateMany(args);
    return count === 1;
  }

  /** Os lançamentos e as movimentações ficam, sem o vínculo; o saldo dos gesseiros não muda. */
  private async apagarObra(
    tx: Prisma.TransactionClient,
    id: string,
    limite: Date,
    arquivadoEm: Date,
  ) {
    if (!(await this.travarVencido(tx, 'obra', id, limite, arquivadoEm))) return false;
    await tx.lancamento.updateMany({ where: { obraId: id }, data: { obraId: null } });
    await tx.movimentacaoEstoque.updateMany({ where: { obraId: id }, data: { obraId: null } });
    // Equipe, pagamento e previstos saem em cascata.
    await tx.obra.delete({ where: { id } });
    return true;
  }

  /** As alocações não têm cascata; os lançamentos (saldo já era 0) saem com o gesseiro. */
  private async apagarGesseiro(
    tx: Prisma.TransactionClient,
    id: string,
    limite: Date,
    arquivadoEm: Date,
  ) {
    if (!(await this.travarVencido(tx, 'gesseiro', id, limite, arquivadoEm))) return false;
    await tx.obraGesseiro.deleteMany({ where: { gesseiroId: id } });
    await tx.gesseiro.delete({ where: { id } });
    return true;
  }

  /** Os previstos não têm cascata; movimentações e alertas saem com o material. */
  private async apagarMaterial(
    tx: Prisma.TransactionClient,
    id: string,
    limite: Date,
    arquivadoEm: Date,
  ) {
    if (!(await this.travarVencido(tx, 'material', id, limite, arquivadoEm))) return false;
    await tx.materialPrevistoObra.deleteMany({ where: { materialId: id } });
    await tx.material.delete({ where: { id } });
    return true;
  }
}
