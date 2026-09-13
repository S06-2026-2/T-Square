import { Injectable, NotImplementedException } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { CreateMaterialDto } from './dto/create-material.dto';
import { CreateMovimentacaoDto } from './dto/create-movimentacao.dto';

/**
 * ESQUELETO. Apenas a listagem esta pronta.
 *
 * Roteiro sugerido para a equipe (use ObrasService como modelo):
 *  1. criarMaterial -> prisma.material.create
 *  2. movimentar    -> transacao que cria a MovimentacaoEstoque E atualiza
 *                      material.saldoAtual (increment na ENTRADA, decrement na SAIDA),
 *                      recusando SAIDA maior que o saldo disponivel
 *  3. abaixoDoMinimo -> lista os materiais com saldoAtual <= estoqueMinimo
 *                       (alerta de reposicao na tela)
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

  // --------------------------------------------------------------------- TODO

  async criarMaterial(_dto: CreateMaterialDto) {
    // TODO(equipe)
    throw new NotImplementedException('criarMaterial ainda nao implementado');
  }

  async movimentar(_dto: CreateMovimentacaoDto) {
    // TODO(equipe): usar this.prisma.$transaction para gravar a movimentacao
    // e atualizar o saldo do material na mesma operacao
    throw new NotImplementedException('movimentar ainda nao implementado');
  }

  async abaixoDoMinimo() {
    // TODO(equipe): Prisma nao compara duas colunas direto no where;
    // use this.prisma.$queryRaw ou filtre em memoria a partir de listarMateriais()
    throw new NotImplementedException('abaixoDoMinimo ainda nao implementado');
  }
}
