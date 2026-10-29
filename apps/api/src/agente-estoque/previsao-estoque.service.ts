import { Injectable } from '@nestjs/common';
import { AlertaEstoque, Prisma, StatusObra, TipoMovimentacao } from '@prisma/client';

import {
  calcularIndicador,
  diasJanela,
  excedenteObra,
  IndicadorMaterial,
  JANELA_MAX_DIAS,
  pendenteObra,
  utilizadoObra,
} from '../estoque/calculo-estoque';
import { PrismaService } from '../prisma/prisma.service';

type Decimal = Prisma.Decimal;
const Decimal = Prisma.Decimal;

const DIA_MS = 24 * 60 * 60 * 1000;
const STATUS_QUE_RESERVAM: StatusObra[] = [StatusObra.FECHADA, StatusObra.ANDAMENTO];

/** Obra FECHADA/ANDAMENTO com pendente > 0 para o material. */
export interface ObraReservando {
  obraId: string;
  titulo: string;
  pendente: Decimal;
}

/** Previsto x utilizado de uma obra (qualquer status) para o material. */
export interface PrevistoUtilizadoObra {
  obraId: string;
  titulo: string;
  status: StatusObra;
  previsto: Decimal;
  utilizado: Decimal;
  pendente: Decimal;
  excedente: Decimal;
}

export interface MaterialSnapshot {
  id: string;
  nome: string;
  unidade: string;
  saldoAtual: Decimal;
  estoqueMinimo: Decimal;
  diasJanela: number;
  consumoSolto: Decimal;
  indicador: IndicadorMaterial;
  obrasQueReservam: ObraReservando[];
  previstoVsUtilizado: PrevistoUtilizadoObra[];
  /** Ultimo alerta do material por tipo, mais recente primeiro (silencio/reabertura). */
  ultimosAlertas: AlertaEstoque[];
}

export interface SnapshotEstoque {
  geradoEm: Date;
  materiais: MaterialSnapshot[];
}

/**
 * Le o banco uma vez e monta os indicadores de cada material para a analise do agente.
 * Somente leitura. Spec: .claude/specs/features/estoque-agente-proativo/spec.md
 */
@Injectable()
export class PrevisaoEstoqueService {
  constructor(private readonly prisma: PrismaService) {}

  async montarSnapshot(agora: Date): Promise<SnapshotEstoque> {
    const inicioJanelaMaxima = new Date(agora.getTime() - JANELA_MAX_DIAS * DIA_MS);

    const [materiais, previstos, movimentacoes, alertas] = await Promise.all([
      this.prisma.material.findMany({ orderBy: { nome: 'asc' } }),
      this.prisma.materialPrevistoObra.findMany({
        include: { obra: { select: { id: true, titulo: true, status: true } } },
      }),
      // Utilizado usa todo o historico das obras; consumo solto so a janela.
      this.prisma.movimentacaoEstoque.findMany({
        where: { OR: [{ obraId: { not: null } }, { criadoEm: { gte: inicioJanelaMaxima } }] },
        select: {
          materialId: true,
          obraId: true,
          tipo: true,
          quantidade: true,
          criadoEm: true,
          obra: { select: { status: true } },
        },
      }),
      this.prisma.alertaEstoque.findMany({
        distinct: ['materialId', 'tipo'],
        orderBy: { atualizadoEm: 'desc' },
      }),
    ]);

    const chave = (obraId: string, materialId: string) => `${obraId}|${materialId}`;
    const comPrevisao = new Set(previstos.map((p) => chave(p.obraId, p.materialId)));

    // Saidas e entradas por (obra, material), de todo o historico.
    const saidasObra = new Map<string, Decimal>();
    const entradasObra = new Map<string, Decimal>();
    for (const m of movimentacoes) {
      if (!m.obraId) continue;
      const mapa = m.tipo === TipoMovimentacao.SAIDA ? saidasObra : entradasObra;
      const k = chave(m.obraId, m.materialId);
      mapa.set(k, (mapa.get(k) ?? new Decimal(0)).plus(m.quantidade));
    }

    const resultado = materiais.map((material): MaterialSnapshot => {
      const janela = diasJanela(material.criadoEm, agora);
      const inicioJanela = agora.getTime() - janela * DIA_MS;

      const consumoSolto = movimentacoes
        .filter(
          (m) =>
            m.materialId === material.id &&
            m.tipo === TipoMovimentacao.SAIDA &&
            m.criadoEm.getTime() >= inicioJanela &&
            (!m.obraId ||
              (m.obra?.status !== StatusObra.CANCELADA &&
                !comPrevisao.has(chave(m.obraId, material.id)))),
        )
        .reduce((soma, m) => soma.plus(m.quantidade), new Decimal(0));

      const previstoVsUtilizado = previstos
        .filter((p) => p.materialId === material.id)
        .map((p): PrevistoUtilizadoObra => {
          const k = chave(p.obraId, material.id);
          const utilizado = utilizadoObra(
            saidasObra.get(k) ?? new Decimal(0),
            entradasObra.get(k) ?? new Decimal(0),
          );
          return {
            obraId: p.obraId,
            titulo: p.obra.titulo,
            status: p.obra.status,
            previsto: p.quantidade,
            utilizado,
            pendente: pendenteObra(p.quantidade, utilizado),
            excedente: excedenteObra(p.quantidade, utilizado),
          };
        });

      const obrasQueReservam = previstoVsUtilizado
        .filter((l) => STATUS_QUE_RESERVAM.includes(l.status) && l.pendente.gt(0))
        .map(({ obraId, titulo, pendente }) => ({ obraId, titulo, pendente }));

      const indicador = calcularIndicador({
        saldoAtual: material.saldoAtual,
        estoqueMinimo: material.estoqueMinimo,
        pendentes: obrasQueReservam.map((o) => o.pendente),
        consumoSolto,
        diasJanela: janela,
      });

      return {
        id: material.id,
        nome: material.nome,
        unidade: material.unidade,
        saldoAtual: material.saldoAtual,
        estoqueMinimo: material.estoqueMinimo,
        diasJanela: janela,
        consumoSolto,
        indicador,
        obrasQueReservam,
        previstoVsUtilizado,
        ultimosAlertas: alertas.filter((a) => a.materialId === material.id),
      };
    });

    return { geradoEm: agora, materiais: resultado };
  }
}
