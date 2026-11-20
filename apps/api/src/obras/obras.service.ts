import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Obra, ObraGesseiro, Prisma, TipoLancamento } from '@prisma/client';

import { ClientePrisma } from '../idempotencia/tipos';
import { PrismaService } from '../prisma/prisma.service';
import { AlocacaoGesseiroDto, CreateObraDto } from './dto/create-obra.dto';
import { QueryObraDto } from './dto/query-obra.dto';
import { UpdateObraDto } from './dto/update-obra.dto';
import { MateriaisPrevistosService } from './materiais-previstos.service';
import { AcaoObra, mensagemTransicaoInvalida, TRANSICOES } from './transicoes-obra';

type ObraComEquipe = Obra & { gesseiros: ObraGesseiro[] };

interface OpcoesTransicao {
  /** Campos gravados junto com o novo status (datas, motivo). */
  dados?: Omit<Prisma.ObraUpdateManyMutationInput, 'status'>;
  /** Pre-condicao da acao, checada depois da origem (ex.: iniciar exige equipe). */
  validar?: (obra: ObraComEquipe) => void;
  /** Efeito na mesma transacao, depois da troca de status (ex.: creditos da conclusao). */
  depois?: (tx: Prisma.TransactionClient, obra: ObraComEquipe) => Promise<void>;
}

/**
 * Modulo de referencia do projeto: use este arquivo como modelo
 * ao implementar Gesseiros e Estoque.
 */
@Injectable()
export class ObrasService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly materiaisPrevistos: MateriaisPrevistosService,
  ) {}

  private readonly include = {
    pagamento: true,
    gesseiros: { include: { gesseiro: true } },
  } satisfies Prisma.ObraInclude;

  async create(dto: CreateObraDto, tx: ClientePrisma = this.prisma) {
    const { pagamento, gesseiros, materiaisPrevistos, ...dadosObra } = dto;

    // Material repetido (400) ou inexistente (404) recusa antes de criar a obra.
    if (materiaisPrevistos?.length) {
      await this.materiaisPrevistos.validarItens(materiaisPrevistos, tx);
    }

    // Escrita aninhada: obra e previstos entram na mesma operacao atomica do Prisma.
    return tx.obra.create({
      data: {
        ...dadosObra,
        pagamento: pagamento ? { create: pagamento } : undefined,
        gesseiros: gesseiros?.length ? { create: gesseiros } : undefined,
        materiaisPrevistos: materiaisPrevistos?.length
          ? {
              create: materiaisPrevistos.map(({ materialId, quantidade }) => ({
                materialId,
                quantidade,
              })),
            }
          : undefined,
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

  /**
   * Remove a alocacao em qualquer status em aberto, inclusive o ultimo gesseiro de uma obra
   * ANDAMENTO (TRN-08): a equipe so e exigida no momento de iniciar.
   */
  async removerGesseiro(obraId: string, gesseiroId: string) {
    await this.findOne(obraId);

    const alocacao = await this.prisma.obraGesseiro.findUnique({
      where: { obraId_gesseiroId: { obraId, gesseiroId } },
    });
    if (!alocacao) {
      // TRN-12: antes virava o P2025 do Prisma (500).
      throw new NotFoundException(`Gesseiro ${gesseiroId} não está alocado nesta obra`);
    }

    await this.prisma.obraGesseiro.delete({
      where: { obraId_gesseiroId: { obraId, gesseiroId } },
    });
    return { removido: true, obraId, gesseiroId };
  }

  // -------------------------------------------------------------------------
  // Transicoes de status (AD-007): ORCAMENTO -> FECHADA -> ANDAMENTO -> CONCLUIDA, ou CANCELADA
  // -------------------------------------------------------------------------

  /** TRN-01: o cliente aprovou o orcamento. */
  async fechar(id: string) {
    return this.transicionar('fechar', id);
  }

  /** TRN-02: comeca a obra; exige pelo menos um gesseiro alocado. */
  async iniciar(id: string) {
    return this.transicionar('iniciar', id, {
      dados: { dataInicio: new Date() },
      validar: (obra) => {
        if (obra.gesseiros.length === 0) {
          throw new BadRequestException(
            'A obra precisa de pelo menos um gesseiro alocado para ser iniciada',
          );
        }
      },
    });
  }

  /**
   * TRN-03: conclui a obra e, na mesma transacao, lanca o CREDITO de cada gesseiro alocado.
   * A equipe e lida dentro da transacao, depois da troca de status. Repetir a conclusao responde
   * 400 sem efeito, entao o credito nasce uma vez so (TRN-07).
   */
  async concluir(id: string) {
    return this.transicionar('concluir', id, {
      dados: { dataConclusao: new Date() },
      depois: async (tx, obra) => {
        const equipe = await tx.obraGesseiro.findMany({ where: { obraId: id } });
        if (equipe.length === 0) {
          return;
        }
        await tx.lancamento.createMany({
          data: equipe.map((alocacao) => ({
            gesseiroId: alocacao.gesseiroId,
            obraId: id,
            tipo: TipoLancamento.CREDITO,
            valor: alocacao.valorCombinado,
            descricao: `Credito automatico pela conclusao da obra "${obra.titulo}"`,
          })),
        });
      },
    });
  }

  /** TRN-09: cancela com motivo (ja sem espacos nas pontas, pelo DTO). Nao cria lancamento. */
  async cancelar(id: string, motivo: string) {
    return this.transicionar('cancelar', id, { dados: { motivoCancelamento: motivo } });
  }

  /**
   * Aplica uma transicao: le a obra, confere a origem (400 se invalida) e a pre-condicao, e faz um
   * update condicionado ao status de origem. Se outra chamada mudou o status no meio, o update
   * nao muda linha nenhuma (count 0) e esta chamada recebe o mesmo 400 (TRN-07).
   */
  private async transicionar(acao: AcaoObra, id: string, opcoes: OpcoesTransicao = {}) {
    const { de, para } = TRANSICOES[acao];

    return this.prisma.$transaction(async (tx) => {
      const obra = await tx.obra.findUnique({ where: { id }, include: { gesseiros: true } });
      if (!obra) {
        throw new NotFoundException(`Obra ${id} nao encontrada`);
      }
      if (!de.includes(obra.status)) {
        throw new BadRequestException(mensagemTransicaoInvalida(acao, obra.status));
      }
      opcoes.validar?.(obra);

      const { count } = await tx.obra.updateMany({
        where: { id, status: { in: de } },
        data: { ...opcoes.dados, status: para },
      });
      if (count === 0) {
        const atual = await tx.obra.findUnique({ where: { id }, select: { status: true } });
        if (!atual) {
          throw new NotFoundException(`Obra ${id} nao encontrada`);
        }
        throw new BadRequestException(mensagemTransicaoInvalida(acao, atual.status));
      }

      await opcoes.depois?.(tx, obra);

      return tx.obra.findUniqueOrThrow({ where: { id }, include: this.include });
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
