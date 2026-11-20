import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { StatusObra, TipoLancamento } from '@prisma/client';

import { filtroArquivados } from '../comum/arquivados';
import { reais } from '../comum/moeda';
import { ClientePrisma } from '../idempotencia/tipos';
import { PrismaService } from '../prisma/prisma.service';
import { CreateGesseiroDto } from './dto/create-gesseiro.dto';
import { CreateLancamentoDto } from './dto/create-lancamento.dto';
import { UpdateGesseiroDto } from './dto/update-gesseiro.dto';
import { saldosPorGesseiro, totaisDe } from './saldo';

/** Obra nesses status ainda nao terminou — alocacao aqui bloqueia o arquivamento (ARQ-09). */
const STATUS_EM_ABERTO: StatusObra[] = [
  StatusObra.ORCAMENTO,
  StatusObra.FECHADA,
  StatusObra.ANDAMENTO,
];

/**
 * O que ja esta pronto:
 *   - findAll, findOne
 *   - extrato / calculo de saldo (contraparte da regra de credito automatico)
 *   - create, registrarLancamento (vale e pagamento)
 *   - update
 *   - arquivar/restaurar (AD-015: arquivado some das listas; a limpeza apaga depois de 7 dias)
 */
@Injectable()
export class GesseirosService {
  constructor(private readonly prisma: PrismaService) {}

  /** ARQ-06/ARQ-10: a lista normal esconde os arquivados; com a flag, só eles. */
  async findAll(arquivados?: boolean) {
    const arquivo = filtroArquivados(arquivados);
    return this.prisma.gesseiro.findMany({
      where: arquivo.where,
      orderBy: arquivo.orderBy ?? { nome: 'asc' },
    });
  }

  async findOne(id: string, tx: ClientePrisma = this.prisma) {
    const gesseiro = await tx.gesseiro.findUnique({
      where: { id },
      include: {
        alocacoes: { include: { obra: true } },
        lancamentos: { orderBy: { criadoEm: 'desc' }, include: { obra: true } },
      },
    });

    if (!gesseiro) {
      throw new NotFoundException(`Gesseiro ${id} nao encontrado`);
    }

    return gesseiro;
  }

  /**
   * Extrato do gesseiro.
   * saldo a receber = creditos (obras concluidas) - vales - pagamentos ja feitos.
   */
  async extrato(id: string) {
    const gesseiro = await this.findOne(id);

    const somaPorTipo = await this.prisma.lancamento.groupBy({
      by: ['tipo'],
      where: { gesseiroId: id },
      _sum: { valor: true },
    });

    const { creditos, vales, pagamentos, saldo } = totaisDe(somaPorTipo);

    return {
      gesseiro: { id: gesseiro.id, nome: gesseiro.nome },
      creditos,
      vales,
      pagamentos,
      saldoAReceber: saldo,
      lancamentos: gesseiro.lancamentos,
    };
  }

  async create(dto: CreateGesseiroDto, tx: ClientePrisma = this.prisma) {
    return tx.gesseiro.create({ data: dto });
  }

  /**
   * Registra um vale (adiantamento) ou pagamento para o gesseiro.
   * CREDITO nunca pode ser criado por aqui — so nasce automaticamente em
   * ObrasService.concluir(), quando a obra e finalizada.
   */
  async registrarLancamento(
    gesseiroId: string,
    dto: CreateLancamentoDto,
    tx: ClientePrisma = this.prisma,
  ) {
    if (dto.tipo === TipoLancamento.CREDITO) {
      throw new BadRequestException(
        'CREDITO e gerado automaticamente pela conclusao da obra, nao pode ser criado manualmente',
      );
    }

    if (dto.valor <= 0) {
      throw new BadRequestException('valor deve ser maior que zero');
    }

    await this.findOne(gesseiroId, tx);

    if (dto.obraId) {
      const obra = await tx.obra.findUnique({ where: { id: dto.obraId } });
      if (!obra) {
        throw new NotFoundException(`Obra ${dto.obraId} nao encontrada`);
      }
    }

    return tx.lancamento.create({ data: { gesseiroId, ...dto } });
  }

  // --------------------------------------------------------------------- TODO

  async update(id: string, dto: UpdateGesseiroDto) {
    if (Object.keys(dto).length === 0) {
      throw new BadRequestException('Nenhum dado fornecido para atualização');
    }

    await this.findOne(id);

    return this.prisma.gesseiro.update({
      where: { id },
      data: dto,
    });
  }

  /**
   * ARQ-09: arquiva o gesseiro com saldo exatamente 0 e sem obra em aberto. Grava também
   * `ativo = false`, que é o filtro dos selects de alocação (AD-004). Update condicional.
   */
  async arquivar(id: string) {
    return this.prisma.$transaction(async (tx) => {
      const gesseiro = await this.findOne(id, tx);
      if (gesseiro.arquivadoEm) {
        throw new BadRequestException('O gesseiro já está arquivado');
      }

      const saldo = (await saldosPorGesseiro(tx, [id])).get(id) ?? 0;
      if (saldo !== 0) {
        throw new BadRequestException(
          `O gesseiro ainda tem saldo de ${reais(saldo)}; zere o saldo antes de arquivar`,
        );
      }

      const emAberto = gesseiro.alocacoes.filter((alocacao) =>
        STATUS_EM_ABERTO.includes(alocacao.obra.status),
      );
      if (emAberto.length > 0) {
        const titulos = emAberto.map((alocacao) => alocacao.obra.titulo).join(', ');
        throw new BadRequestException(
          `O gesseiro está alocado em ${titulos}; remova-o dessas obras antes de arquivar`,
        );
      }

      const { count } = await tx.gesseiro.updateMany({
        where: { id, arquivadoEm: null },
        data: { arquivadoEm: new Date(), ativo: false },
      });
      if (count === 0) {
        throw new BadRequestException('O gesseiro já está arquivado');
      }
      return tx.gesseiro.findUniqueOrThrow({ where: { id } });
    });
  }

  /** ARQ-07: volta para a lista e para os selects de alocação. */
  async restaurar(id: string) {
    const { count } = await this.prisma.gesseiro.updateMany({
      where: { id, arquivadoEm: { not: null } },
      data: { arquivadoEm: null, ativo: true },
    });
    if (count === 0) {
      await this.findOne(id);
      throw new BadRequestException('O gesseiro não está arquivado');
    }
    return this.prisma.gesseiro.findUniqueOrThrow({ where: { id } });
  }
}
