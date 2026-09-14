import {
  BadRequestException,
  Injectable,
  NotFoundException,
  NotImplementedException,
} from '@nestjs/common';
import { TipoLancamento } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { CreateGesseiroDto } from './dto/create-gesseiro.dto';
import { CreateLancamentoDto } from './dto/create-lancamento.dto';
import { UpdateGesseiroDto } from './dto/update-gesseiro.dto';

/**
 * O que ja esta pronto:
 *   - findAll, findOne
 *   - extrato / calculo de saldo (contraparte da regra de credito automatico)
 *   - create, registrarLancamento (vale e pagamento)
 *
 * O que a equipe ainda precisa implementar (veja ObrasService como modelo):
 *   - update, remove
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

  async update(_id: string, _dto: UpdateGesseiroDto) {
    // TODO(equipe): validar existencia com findOne e depois prisma.gesseiro.update
    throw new NotImplementedException('update ainda nao implementado');
  }

  async remove(_id: string) {
    // TODO(equipe): preferir desativar (ativo = false) a apagar, por causa do historico
    throw new NotImplementedException('remove ainda nao implementado');
  }
}
