import { Injectable, NotFoundException, NotImplementedException } from '@nestjs/common';
import { TipoLancamento } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { CreateGesseiroDto } from './dto/create-gesseiro.dto';
import { CreateLancamentoDto } from './dto/create-lancamento.dto';
import { UpdateGesseiroDto } from './dto/update-gesseiro.dto';

/**
 * ESQUELETO. O que ja esta pronto:
 *   - findAll
 *   - extrato / calculo de saldo (contraparte da regra de credito automatico)
 *
 * O que a equipe precisa implementar (veja ObrasService como modelo):
 *   - create, update, remove
 *   - registrarLancamento (vale e pagamento)
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

  // --------------------------------------------------------------------- TODO

  async create(_dto: CreateGesseiroDto) {
    // TODO(equipe): this.prisma.gesseiro.create({ data: _dto })
    throw new NotImplementedException('create ainda nao implementado');
  }

  async update(_id: string, _dto: UpdateGesseiroDto) {
    // TODO(equipe): validar existencia com findOne e depois prisma.gesseiro.update
    throw new NotImplementedException('update ainda nao implementado');
  }

  async remove(_id: string) {
    // TODO(equipe): preferir desativar (ativo = false) a apagar, por causa do historico
    throw new NotImplementedException('remove ainda nao implementado');
  }

  async registrarLancamento(_gesseiroId: string, _dto: CreateLancamentoDto) {
    // TODO(equipe): bloquear a criacao manual de CREDITO — esse tipo so deve nascer
    // automaticamente em ObrasService.concluir()
    throw new NotImplementedException('registrarLancamento ainda nao implementado');
  }
}
