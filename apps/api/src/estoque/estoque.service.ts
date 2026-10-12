import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, TipoMovimentacao } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { CreateMaterialDto } from './dto/create-material.dto';
import { CreateMovimentacaoDto } from './dto/create-movimentacao.dto';

/**
 * Spec: .claude/specs/features/estoque-materiais-movimentacao/spec.md
 * Modelo de referencia: ObrasService.
 */
@Injectable()
export class EstoqueService {
  constructor(private readonly prisma: PrismaService) {}

  async listarMateriais() {
    return this.prisma.material.findMany({ orderBy: { nome: 'asc' } });
  }

  async listarMovimentacoes(materialId?: string) {
    return this.prisma.movimentacaoEstoque.findMany({
      where: materialId ? { materialId } : undefined,
      include: { material: true, obra: true },
      orderBy: { criadoEm: 'desc' },
      take: 100,
    });
  }

  // EST-01 / EST-02: cadastro de material
  async criarMaterial(dto: CreateMaterialDto) {
    try {
      return await this.prisma.material.create({
        data: {
          nome: dto.nome,
          unidade: dto.unidade,
          estoqueMinimo: dto.estoqueMinimo ?? 0,
        },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException(`Ja existe um material chamado "${dto.nome}"`);
      }
      throw error;
    }
  }

  // EST-03 a EST-07: movimentacao de estoque
  async movimentar(dto: CreateMovimentacaoDto) {
    const material = await this.prisma.material.findUnique({ where: { id: dto.materialId } });
    if (!material) {
      throw new NotFoundException(`Material ${dto.materialId} nao encontrado`);
    }

    if (dto.obraId) {
      const obra = await this.prisma.obra.findUnique({ where: { id: dto.obraId } });
      if (!obra) {
        throw new NotFoundException(`Obra ${dto.obraId} nao encontrada`);
      }
    }

    // Falha rapida (e com mensagem util) sem abrir transacao.
    if (dto.tipo === TipoMovimentacao.SAIDA && Number(material.saldoAtual) < dto.quantidade) {
      throw this.saldoInsuficiente(material.nome, Number(material.saldoAtual), dto.quantidade);
    }

    return this.prisma.$transaction(async (tx) => {
      if (dto.tipo === TipoMovimentacao.ENTRADA) {
        await tx.material.update({
          where: { id: dto.materialId },
          data: { saldoAtual: { increment: dto.quantidade } },
        });
      } else {
        // Guarda atomica: so decrementa se ainda houver saldo suficiente.
        const { count } = await tx.material.updateMany({
          where: { id: dto.materialId, saldoAtual: { gte: dto.quantidade } },
          data: { saldoAtual: { decrement: dto.quantidade } },
        });

        if (count === 0) {
          // Outra saida consumiu o saldo entre a leitura e a transacao.
          throw this.saldoInsuficiente(material.nome, Number(material.saldoAtual), dto.quantidade);
        }
      }

      return tx.movimentacaoEstoque.create({
        data: {
          materialId: dto.materialId,
          obraId: dto.obraId,
          tipo: dto.tipo,
          quantidade: dto.quantidade,
          observacao: dto.observacao,
        },
        include: { material: true },
      });
    });
  }

  // EST-08: alerta de reposicao (saldo igual ao minimo conta)
  async abaixoDoMinimo() {
    const materiais = await this.listarMateriais();
    return materiais.filter((m) => Number(m.saldoAtual) <= Number(m.estoqueMinimo));
  }

  private saldoInsuficiente(nome: string, disponivel: number, solicitado: number) {
    return new BadRequestException(
      `Saldo insuficiente de "${nome}": disponivel ${disponivel}, solicitado ${solicitado}`,
    );
  }
}