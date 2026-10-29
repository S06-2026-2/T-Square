import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  AlertaEstoque,
  ResolvidoPor,
  StatusAlertaEstoque,
  StatusAnaliseEstoque,
  TipoAlertaEstoque,
} from '@prisma/client';

import { MotivoIndicador } from '../estoque/calculo-estoque';
import { PrismaService } from '../prisma/prisma.service';
import { silencioDoMaterial } from './ferramentas-agente';

type CamposUrgencia = Pick<
  AlertaEstoque,
  'tipo' | 'saldoLivre' | 'estoqueMinimo' | 'diasAteMinimo'
>;

/**
 * Faixa de urgencia do alerta, a partir dos numeros gravados:
 * 0 abaixo do minimo, 1 no minimo com consumo, 2 previsao, 3 informativo.
 */
function faixaUrgencia(a: CamposUrgencia): number {
  if (a.tipo === TipoAlertaEstoque.INFORMATIVO) return 3;
  if (a.saldoLivre.lt(a.estoqueMinimo)) return 0;
  if (a.saldoLivre.eq(a.estoqueMinimo)) return 1;
  return 2;
}

/** ABAIXO_DO_MINIMO → NO_MINIMO_COM_CONSUMO → PREVISAO (diasAteMinimo crescente) → INFORMATIVO. */
function porUrgencia(a: CamposUrgencia, b: CamposUrgencia): number {
  const faixa = faixaUrgencia(a) - faixaUrgencia(b);
  if (faixa !== 0 || faixaUrgencia(a) !== 2) return faixa;
  // Previsao sem dias (ritmo 0) vai para o fim da faixa.
  if (a.diasAteMinimo === null || b.diasAteMinimo === null) {
    return (a.diasAteMinimo === null ? 1 : 0) - (b.diasAteMinimo === null ? 1 : 0);
  }
  return a.diasAteMinimo.comparedTo(b.diasAteMinimo);
}

/**
 * Motivo do alerta para a tela, a partir dos numeros gravados (o front so exibe, nao recalcula):
 * INFORMATIVO -> null; saldo livre < minimo -> ABAIXO_DO_MINIMO; = minimo -> NO_MINIMO_COM_CONSUMO;
 * acima do minimo com ritmo > 0 -> PREVISAO; senao null ("sem consumo recente").
 */
export function motivoAlerta(
  a: Pick<AlertaEstoque, 'tipo' | 'saldoLivre' | 'estoqueMinimo' | 'ritmoDiario'>,
): MotivoIndicador | null {
  if (a.tipo === TipoAlertaEstoque.INFORMATIVO) return null;
  if (a.saldoLivre.lt(a.estoqueMinimo)) return 'ABAIXO_DO_MINIMO';
  if (a.saldoLivre.eq(a.estoqueMinimo)) return 'NO_MINIMO_COM_CONSUMO';
  if (a.ritmoDiario.gt(0)) return 'PREVISAO';
  return null;
}

/**
 * Leitura dos alertas do agente e acoes do operador (dispensar / resolver).
 * Spec: .claude/specs/features/estoque-agente-proativo/spec.md (EAP-46..49)
 */
@Injectable()
export class AlertasEstoqueService {
  constructor(private readonly prisma: PrismaService) {}

  /** Alertas ATIVO com o material, mais a ultima analise que ja terminou (ou null). */
  async listarAtivos() {
    const [alertas, ultimaAnalise] = await Promise.all([
      this.prisma.alertaEstoque.findMany({
        where: { status: StatusAlertaEstoque.ATIVO },
        include: { material: true },
        orderBy: { criadoEm: 'asc' },
      }),
      this.prisma.analiseEstoque.findFirst({
        where: { status: { not: StatusAnaliseEstoque.EM_ANDAMENTO } },
        orderBy: { iniciadoEm: 'desc' },
      }),
    ]);

    // sort e estavel: no empate fica a ordem de criadoEm crescente da consulta.
    const ordenados = [...alertas].sort(porUrgencia);
    return {
      ultimaAnalise,
      alertas: ordenados.map((alerta) => ({ ...alerta, motivo: motivoAlerta(alerta) })),
    };
  }

  /**
   * Materiais que o agente nao vai alertar agora porque o operador dispensou ou resolveu o
   * ultimo alerta (mesma regra de silencioDoMaterial), o que termina primeiro no topo.
   */
  async listarSilenciados() {
    const agora = new Date();
    const ultimos = await this.prisma.alertaEstoque.findMany({
      distinct: ['materialId', 'tipo'],
      orderBy: { atualizadoEm: 'desc' },
      include: { material: { select: { nome: true, unidade: true } } },
    });

    const porMaterial = new Map<string, typeof ultimos>();
    for (const alerta of ultimos) {
      porMaterial.set(alerta.materialId, [...(porMaterial.get(alerta.materialId) ?? []), alerta]);
    }

    const silenciados = [];
    for (const alertas of porMaterial.values()) {
      const silencio = silencioDoMaterial(alertas, agora);
      if (!silencio.alerta || !silencio.ate) continue;
      const alerta = alertas.find((a) => a.id === silencio.alerta!.id)!;
      silenciados.push({
        alertaId: alerta.id,
        materialId: alerta.materialId,
        material: alerta.material,
        tipo: alerta.tipo,
        acao: alerta.status,
        em: alerta.dispensadoEm ?? alerta.resolvidoEm,
        ate: silencio.ate,
        // TUDO: nenhum alerta do material; INFORMATIVO: so novas observacoes ficam de fora.
        abrangencia: silencio.tudo ? 'TUDO' : 'INFORMATIVO',
      });
    }

    return silenciados.sort((a, b) => a.ate.getTime() - b.ate.getTime());
  }

  async dispensar(id: string) {
    await this.buscarAtivo(id);

    return this.prisma.alertaEstoque.update({
      where: { id },
      data: { status: StatusAlertaEstoque.DISPENSADO, dispensadoEm: new Date() },
    });
  }

  async resolver(id: string) {
    await this.buscarAtivo(id);

    return this.prisma.alertaEstoque.update({
      where: { id },
      data: {
        status: StatusAlertaEstoque.RESOLVIDO,
        resolvidoPor: ResolvidoPor.OPERADOR,
        resolvidoEm: new Date(),
      },
    });
  }

  /** O operador so age sobre alerta ATIVO; senao 404 (inexistente) ou 400 (ja fechado). */
  private async buscarAtivo(id: string) {
    const alerta = await this.prisma.alertaEstoque.findUnique({ where: { id } });

    if (!alerta) {
      throw new NotFoundException(`Alerta ${id} não encontrado`);
    }
    if (alerta.status !== StatusAlertaEstoque.ATIVO) {
      throw new BadRequestException(`Alerta ${id} não está ativo`);
    }

    return alerta;
  }
}
