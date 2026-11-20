import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Obra, ObraGesseiro, Prisma, StatusObra, TipoLancamento } from '@prisma/client';

import { filtroArquivados } from '../comum/arquivados';
import { reais } from '../comum/moeda';
import { saldosPorGesseiro } from '../gesseiros/saldo';
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
    // ARQ-04/ARQ-06: a lista normal esconde as arquivadas; ?arquivados=true mostra só elas.
    const arquivo = filtroArquivados(query.arquivados);
    return this.prisma.obra.findMany({
      where: {
        ...arquivo.where,
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
      orderBy: arquivo.orderBy ?? { criadoEm: 'desc' },
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
    const atual = await this.findOne(id);
    const { pagamento, ...dadosObra } = dto;

    // ARQ-01: o recebido nunca passa do total, nem quando o PATCH so diminui o total.
    const total = new Prisma.Decimal(dto.valorTotal ?? atual.valorTotal);
    const recebido = new Prisma.Decimal(dto.valorRecebido ?? atual.valorRecebido);
    if (recebido.greaterThan(total)) {
      throw new BadRequestException(
        `O valor recebido não pode passar do valor total (${reais(total)})`,
      );
    }

    return this.prisma.obra.update({
      where: { id },
      data: {
        ...dadosObra,
        pagamento: pagamento ? { upsert: { create: pagamento, update: pagamento } } : undefined,
      },
      include: this.include,
    });
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
    if (gesseiro.arquivadoEm) {
      throw new BadRequestException(`O gesseiro ${gesseiro.nome} está arquivado`);
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

  // -------------------------------------------------------------------------
  // Arquivamento (arquivar-e-limpar-registros, AD-015)
  // -------------------------------------------------------------------------

  /**
   * ARQ-03: as três condições para arquivar, numa fonte só. O `arquivar` chama dentro da
   * transação, e o diálogo do front lê por GET /obras/:id/arquivamento. "Gesseiro pago" é o saldo
   * geral ≤ 0, porque vale e pagamento não levam a obra (decisão do usuário, 2026-11-20).
   */
  async situacaoArquivamento(id: string, cliente: ClientePrisma = this.prisma) {
    const obra = await cliente.obra.findUnique({
      where: { id },
      include: { gesseiros: { include: { gesseiro: true } } },
    });
    if (!obra) {
      throw new NotFoundException(`Obra ${id} nao encontrada`);
    }

    const saldos = await saldosPorGesseiro(
      cliente,
      obra.gesseiros.map((alocacao) => alocacao.gesseiroId),
    );
    const gesseirosPendentes = obra.gesseiros
      .map((alocacao) => ({
        id: alocacao.gesseiroId,
        nome: alocacao.gesseiro.nome,
        saldo: saldos.get(alocacao.gesseiroId) ?? 0,
      }))
      .filter((pendente) => pendente.saldo > 0);

    const concluida = obra.status === StatusObra.CONCLUIDA;
    const clienteQuitado = new Prisma.Decimal(obra.valorRecebido).equals(obra.valorTotal);

    return {
      concluida,
      arquivada: obra.arquivadoEm !== null,
      valorRecebido: Number(obra.valorRecebido),
      valorTotal: Number(obra.valorTotal),
      clienteQuitado,
      gesseirosPendentes,
      podeArquivar:
        concluida && clienteQuitado && gesseirosPendentes.length === 0 && obra.arquivadoEm === null,
    };
  }

  /** ARQ-03/ARQ-15: arquiva a obra concluída e quitada; o update é condicional (sem duplo efeito). */
  async arquivar(id: string) {
    return this.prisma.$transaction(async (tx) => {
      const situacao = await this.situacaoArquivamento(id, tx);
      if (situacao.arquivada) {
        throw new BadRequestException('A obra já está arquivada');
      }
      if (!situacao.concluida) {
        throw new BadRequestException('Só é possível arquivar uma obra concluída');
      }
      if (!situacao.clienteQuitado) {
        throw new BadRequestException(
          `O cliente ainda não pagou tudo: recebido ${reais(situacao.valorRecebido)} de ${reais(situacao.valorTotal)}`,
        );
      }
      if (situacao.gesseirosPendentes.length > 0) {
        const lista = situacao.gesseirosPendentes
          .map((pendente) => `${pendente.nome} (${reais(pendente.saldo)})`)
          .join(', ');
        throw new BadRequestException(`Ainda há gesseiros a pagar: ${lista}`);
      }

      const { count } = await tx.obra.updateMany({
        where: { id, status: StatusObra.CONCLUIDA, arquivadoEm: null },
        data: { arquivadoEm: new Date() },
      });
      if (count === 0) {
        throw new BadRequestException('A obra já está arquivada');
      }
      return tx.obra.findUniqueOrThrow({ where: { id }, include: this.include });
    });
  }

  /** ARQ-07: a obra volta para a lista como CONCLUIDA (o status nunca mudou). */
  async restaurar(id: string) {
    const { count } = await this.prisma.obra.updateMany({
      where: { id, arquivadoEm: { not: null } },
      data: { arquivadoEm: null },
    });
    if (count === 0) {
      await this.findOne(id);
      throw new BadRequestException('A obra não está arquivada');
    }
    return this.prisma.obra.findUniqueOrThrow({ where: { id }, include: this.include });
  }

  /** Resumo do funil para o dashboard: quantidade e valor por status. */
  async resumo() {
    const agrupado = await this.prisma.obra.groupBy({
      by: ['status'],
      where: { arquivadoEm: null },
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
