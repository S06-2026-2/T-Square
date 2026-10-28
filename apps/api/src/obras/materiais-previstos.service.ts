import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, StatusObra, TipoMovimentacao } from '@prisma/client';

import { excedenteObra, pendenteObra, utilizadoObra } from '../estoque/calculo-estoque';
import { PrismaService } from '../prisma/prisma.service';
import { MaterialPrevistoDto } from './dto/materiais-previstos.dto';

type Decimal = Prisma.Decimal;
const Decimal = Prisma.Decimal;

const STATUS_SEM_EDICAO: StatusObra[] = [StatusObra.CONCLUIDA, StatusObra.CANCELADA];

/** Cliente Prisma ou o `tx` de uma transacao. */
type ClientePrisma = Pick<PrismaService, 'material'>;

/**
 * Cadastro e consulta dos materiais previstos por obra.
 * Spec: .claude/specs/features/estoque-agente-proativo/spec.md (EAP-38..42, EAP-54)
 */
@Injectable()
export class MateriaisPrevistosService {
  constructor(private readonly prisma: PrismaService) {}

  /** Material repetido → 400; material inexistente → 404. Nao grava nada. */
  async validarItens(itens: MaterialPrevistoDto[], tx: ClientePrisma = this.prisma) {
    const ids = itens.map((item) => item.materialId);

    const repetido = ids.find((id, indice) => ids.indexOf(id) !== indice);
    if (repetido) {
      throw new BadRequestException(
        `Material ${repetido} aparece mais de uma vez nos materiais previstos`,
      );
    }

    if (ids.length === 0) return;

    const existentes = await tx.material.findMany({
      where: { id: { in: ids } },
      select: { id: true },
    });
    const encontrados = new Set(existentes.map((m) => m.id));
    const inexistente = ids.find((id) => !encontrados.has(id));
    if (inexistente) {
      throw new NotFoundException(`Material ${inexistente} não encontrado`);
    }
  }

  /** Troca a lista inteira de previstos da obra (lista vazia remove tudo). */
  async substituir(obraId: string, itens: MaterialPrevistoDto[]) {
    const obra = await this.buscarObra(obraId);

    if (STATUS_SEM_EDICAO.includes(obra.status)) {
      throw new BadRequestException(
        `Não é possível alterar materiais previstos de uma obra com status ${obra.status}`,
      );
    }

    await this.validarItens(itens);

    return this.prisma.$transaction(async (tx) => {
      await tx.materialPrevistoObra.deleteMany({ where: { obraId } });

      if (itens.length > 0) {
        await tx.materialPrevistoObra.createMany({
          data: itens.map((item) => ({
            obraId,
            materialId: item.materialId,
            quantidade: item.quantidade,
          })),
        });
      }

      return tx.materialPrevistoObra.findMany({
        where: { obraId },
        include: { material: true },
        orderBy: { material: { nome: 'asc' } },
      });
    });
  }

  /** Uma linha por material previsto: previsto x utilizado, pendente e excedente. */
  async listarComUtilizado(obraId: string) {
    await this.buscarObra(obraId);

    const [previstos, movimentacoes] = await Promise.all([
      this.prisma.materialPrevistoObra.findMany({
        where: { obraId },
        include: { material: true },
        orderBy: { material: { nome: 'asc' } },
      }),
      this.prisma.movimentacaoEstoque.findMany({
        where: { obraId },
        select: { materialId: true, tipo: true, quantidade: true },
      }),
    ]);

    const somar = (materialId: string, tipo: TipoMovimentacao): Decimal =>
      movimentacoes
        .filter((m) => m.materialId === materialId && m.tipo === tipo)
        .reduce((soma, m) => soma.plus(m.quantidade), new Decimal(0));

    return previstos.map((p) => {
      const utilizado = utilizadoObra(
        somar(p.materialId, TipoMovimentacao.SAIDA),
        somar(p.materialId, TipoMovimentacao.ENTRADA),
      );
      return {
        materialId: p.materialId,
        material: p.material.nome,
        unidade: p.material.unidade,
        previsto: p.quantidade,
        utilizado,
        pendente: pendenteObra(p.quantidade, utilizado),
        excedente: excedenteObra(p.quantidade, utilizado),
      };
    });
  }

  private async buscarObra(obraId: string) {
    const obra = await this.prisma.obra.findUnique({
      where: { id: obraId },
      select: { id: true, status: true },
    });
    if (!obra) {
      throw new NotFoundException(`Obra ${obraId} não encontrada`);
    }
    return obra;
  }
}
