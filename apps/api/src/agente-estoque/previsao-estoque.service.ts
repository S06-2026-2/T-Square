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

/**
 * Obra nao cancelada que recebeu SAIDA do material na janela sem prever o material (EAP-71).
 * Essas saidas continuam no consumo solto; o agente so passa a saber de onde vieram.
 */
export interface UsoSemPrevisaoObra {
  obraId: string;
  titulo: string;
  status: StatusObra;
  /** SAIDA - ENTRADA da obra para o material, de todo o historico (piso 0). */
  utilizado: Decimal;
  /** SAIDAs para a obra dentro da janela: a parte do consumo solto que foi para ela. */
  saidasNaJanela: Decimal;
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
  usoSemPrevisao: UsoSemPrevisaoObra[];
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
          obra: { select: { titulo: true, status: true } },
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

      const saidasSoltas = movimentacoes.filter(
        (m) =>
          m.materialId === material.id &&
          m.tipo === TipoMovimentacao.SAIDA &&
          m.criadoEm.getTime() >= inicioJanela &&
          (!m.obraId ||
            (m.obra?.status !== StatusObra.CANCELADA &&
              !comPrevisao.has(chave(m.obraId, material.id)))),
      );
      const consumoSolto = saidasSoltas.reduce(
        (soma, m) => soma.plus(m.quantidade),
        new Decimal(0),
      );

      // Parte do consumo solto que foi para obras sem previsao do material (EAP-71).
      const porObra = new Map<string, UsoSemPrevisaoObra>();
      for (const m of saidasSoltas) {
        if (!m.obraId || !m.obra) continue;
        const k = chave(m.obraId, material.id);
        const atual = porObra.get(m.obraId) ?? {
          obraId: m.obraId,
          titulo: m.obra.titulo,
          status: m.obra.status,
          utilizado: utilizadoObra(
            saidasObra.get(k) ?? new Decimal(0),
            entradasObra.get(k) ?? new Decimal(0),
          ),
          saidasNaJanela: new Decimal(0),
        };
        porObra.set(m.obraId, {
          ...atual,
          saidasNaJanela: atual.saidasNaJanela.plus(m.quantidade),
        });
      }
      const usoSemPrevisao = [...porObra.values()];

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
        usoSemPrevisao,
        ultimosAlertas: alertas.filter((a) => a.materialId === material.id),
      };
    });

    return { geradoEm: agora, materiais: resultado };
  }
}
