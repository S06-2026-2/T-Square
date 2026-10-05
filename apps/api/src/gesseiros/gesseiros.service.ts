import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { StatusObra, TipoLancamento } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { CreateGesseiroDto } from './dto/create-gesseiro.dto';
import { CreateLancamentoDto } from './dto/create-lancamento.dto';
import { UpdateGesseiroDto } from './dto/update-gesseiro.dto';

/** Obra nesses status ainda nao terminou — alocacao aqui bloqueia a desativacao. */
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
 *   - update, remove (soft delete: nunca apaga a linha)
 */
@Injectable()
export class GesseirosService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll() {
    return this.prisma.gesseiro.findMany({ orderBy: { nome: 'asc' } });
  }

  async findOne(id: string) {
    const gesseiro = await this.prisma.gesseiro.findUnique({
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

    const total = (tipo: TipoLancamento) =>
      Number(somaPorTipo.find((linha) => linha.tipo === tipo)?._sum.valor ?? 0);

    const creditos = total(TipoLancamento.CREDITO);
    const vales = total(TipoLancamento.VALE);
    const pagamentos = total(TipoLancamento.PAGAMENTO);

    return {
      gesseiro: { id: gesseiro.id, nome: gesseiro.nome },
      creditos,
      vales,
      pagamentos,
      saldoAReceber: creditos - vales - pagamentos,
      lancamentos: gesseiro.lancamentos,
    };
  }

  async create(dto: CreateGesseiroDto) {
    return this.prisma.gesseiro.create({ data: dto });
  }

  /**
   * Registra um vale (adiantamento) ou pagamento para o gesseiro.
   * CREDITO nunca pode ser criado por aqui — so nasce automaticamente em
   * ObrasService.concluir(), quando a obra e finalizada.
   */
  async registrarLancamento(gesseiroId: string, dto: CreateLancamentoDto) {
    if (dto.tipo === TipoLancamento.CREDITO) {
      throw new BadRequestException(
        'CREDITO e gerado automaticamente pela conclusao da obra, nao pode ser criado manualmente',
      );
    }

    if (dto.valor <= 0) {
      throw new BadRequestException('valor deve ser maior que zero');
    }

    await this.findOne(gesseiroId);

    if (dto.obraId) {
      const obra = await this.prisma.obra.findUnique({ where: { id: dto.obraId } });
      if (!obra) {
        throw new NotFoundException(`Obra ${dto.obraId} nao encontrada`);
      }
    }

    return this.prisma.lancamento.create({ data: { gesseiroId, ...dto } });
  }

  // --------------------------------------------------------------------- TODO

  async update(id: string, dto: UpdateGesseiroDto) {
    if (Object.keys(dto).length === 0) {
      throw new BadRequestException('Nenhum dado fornecido para atualização');
    }

    await this.findOne(id);

    return this.prisma.gesseiro.update({
      where: { id },
      data: dto
    });
  }

  async remove(id: string) {
    const gesseiro = await this.findOne(id);

    // Separa o cadastro das listas que vieram pelo include, para que os dois
    // caminhos de sucesso devolvam exatamente o mesmo formato.
    const { alocacoes, lancamentos, ...cadastro } = gesseiro;

    if (!gesseiro.ativo) {
      return cadastro;
    }

    const emAberto = alocacoes.filter((alocacao) =>
      STATUS_EM_ABERTO.includes(alocacao.obra.status),
    );

    if (emAberto.length > 0) {
      const titulos = emAberto.map((alocacao) => alocacao.obra.titulo).join(', ');
      throw new BadRequestException(
        `Não é possível desativar: o gesseiro ainda está alocado em ${titulos}. ` +
          'Remova-o dessas obras antes de desativar.',
      );
    }

    return this.prisma.gesseiro.update({
      where: { id },
      data: { ativo: false },
    });
  }
}
