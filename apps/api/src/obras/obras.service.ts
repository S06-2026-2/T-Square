import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, StatusObra, TipoLancamento } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { AlocacaoGesseiroDto, CreateObraDto } from './dto/create-obra.dto';
import { QueryObraDto } from './dto/query-obra.dto';
import { UpdateObraDto } from './dto/update-obra.dto';

/**
 * Modulo de referencia do projeto: use este arquivo como modelo
 * ao implementar Gesseiros e Estoque.
 */
@Injectable()
export class ObrasService {
  constructor(private readonly prisma: PrismaService) {}

  private readonly include = {
    pagamento: true,
    gesseiros: { include: { gesseiro: true } },
  } satisfies Prisma.ObraInclude;

  async create(dto: CreateObraDto) {
    const { pagamento, gesseiros, ...dadosObra } = dto;

    return this.prisma.obra.create({
      data: {
        ...dadosObra,
        pagamento: pagamento ? { create: pagamento } : undefined,
        gesseiros: gesseiros?.length ? { create: gesseiros } : undefined,
      },
      include: this.include,
    });
  }

  async findAll(query: QueryObraDto) {
    return this.prisma.obra.findMany({
      where: {
        status: query.status,
        ...(query.busca
          ? {
              OR: [
                { titulo: { contains: query.busca, mode: 'insensitive' } },
                { clienteNome: { contains: query.busca, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      include: this.include,
      orderBy: { criadoEm: 'desc' },
    });
  }

  async findOne(id: string) {
    const obra = await this.prisma.obra.findUnique({
      where: { id },
      include: {
        ...this.include,
        lancamentos: true,
        movimentacoes: { include: { material: true } },
      },
    });

    if (!obra) {
      throw new NotFoundException(`Obra ${id} nao encontrada`);
    }

    return obra;
  }

  async update(id: string, dto: UpdateObraDto) {
    await this.findOne(id);
    const { pagamento, ...dadosObra } = dto;

    return this.prisma.obra.update({
      where: { id },
      data: {
        ...dadosObra,
        pagamento: pagamento ? { upsert: { create: pagamento, update: pagamento } } : undefined,
      },
      include: this.include,
    });
  }

  async remove(id: string) {
    await this.findOne(id);
    await this.prisma.obra.delete({ where: { id } });
    return { removido: true, id };
  }

  // -------------------------------------------------------------------------
  // Alocacao de gesseiros
  // -------------------------------------------------------------------------

  async alocarGesseiro(obraId: string, dto: AlocacaoGesseiroDto) {
    await this.findOne(obraId);

    const gesseiro = await this.prisma.gesseiro.findUnique({ where: { id: dto.gesseiroId } });
    if (!gesseiro) {
      throw new NotFoundException(`Gesseiro ${dto.gesseiroId} nao encontrado`);
    }

    return this.prisma.obraGesseiro.upsert({
      where: { obraId_gesseiroId: { obraId, gesseiroId: dto.gesseiroId } },
      create: { obraId, ...dto },
      update: { valorCombinado: dto.valorCombinado, funcao: dto.funcao },
      include: { gesseiro: true },
    });
  }

  async removerGesseiro(obraId: string, gesseiroId: string) {
    await this.prisma.obraGesseiro.delete({
      where: { obraId_gesseiroId: { obraId, gesseiroId } },
    });
    return { removido: true, obraId, gesseiroId };
  }

  // -------------------------------------------------------------------------
  // Regra central do sistema
  // -------------------------------------------------------------------------

  /**
   * Conclui a obra e, na mesma transacao, lanca automaticamente o CREDITO
   * de cada gesseiro alocado. A partir dai o valor entra no "a receber" dele,
   * sem ninguem precisar digitar nada.
   *
   * A operacao e idempotente: se a obra ja estiver CONCLUIDA, nao duplica credito.
   */
  async concluir(id: string) {
    const obra = await this.prisma.obra.findUnique({
      where: { id },
      include: { gesseiros: true },
    });

    if (!obra) {
      throw new NotFoundException(`Obra ${id} nao encontrada`);
    }

    if (obra.status === StatusObra.CONCLUIDA) {
      throw new BadRequestException('Esta obra ja foi concluida');
    }

    if (obra.status === StatusObra.CANCELADA) {
      throw new BadRequestException('Nao e possivel concluir uma obra cancelada');
    }

    return this.prisma.$transaction(async (tx) => {
      const atualizada = await tx.obra.update({
        where: { id },
        data: { status: StatusObra.CONCLUIDA, dataConclusao: new Date() },
        include: this.include,
      });

      if (obra.gesseiros.length > 0) {
        await tx.lancamento.createMany({
          data: obra.gesseiros.map((alocacao) => ({
            gesseiroId: alocacao.gesseiroId,
            obraId: obra.id,
            tipo: TipoLancamento.CREDITO,
            valor: alocacao.valorCombinado,
            descricao: `Credito automatico pela conclusao da obra "${obra.titulo}"`,
          })),
        });
      }

      return atualizada;
    });
  }

  /** Resumo do funil para o dashboard: quantidade e valor por status. */
  async resumo() {
    const agrupado = await this.prisma.obra.groupBy({
      by: ['status'],
      _count: { _all: true },
      _sum: { valorTotal: true },
    });

    return agrupado.map((linha) => ({
      status: linha.status,
      quantidade: linha._count._all,
      valorTotal: Number(linha._sum.valorTotal ?? 0),
    }));
  }
}
