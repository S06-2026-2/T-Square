import { Prisma } from '@prisma/client';

/**
 * Formulas do agente de estoque, sem I/O.
 * Spec: .claude/specs/features/estoque-agente-proativo/spec.md (Assumptions).
 *
 * Toda conta usa Prisma.Decimal; Number() fica so na serializacao.
 */

type Decimal = Prisma.Decimal;
const Decimal = Prisma.Decimal;

const ZERO = new Decimal(0);
const DIA_MS = 24 * 60 * 60 * 1000;

export const JANELA_MIN_DIAS = 7;
export const JANELA_MAX_DIAS = 30;
export const HORIZONTE_DIAS = 7;
export const COBERTURA_DIAS = 30;

/** Motivo do indicador: obrigatorio (ABAIXO_DO_MINIMO / NO_MINIMO_COM_CONSUMO) ou previsao. */
export type MotivoIndicador = 'ABAIXO_DO_MINIMO' | 'NO_MINIMO_COM_CONSUMO' | 'PREVISAO';

export interface EntradaIndicador {
  saldoAtual: Decimal;
  estoqueMinimo: Decimal;
  /** Pendente de cada obra FECHADA/ANDAMENTO que preve o material. */
  pendentes: Decimal[];
  /** Soma das SAIDAs soltas dentro da janela. */
  consumoSolto: Decimal;
  diasJanela: number;
}

export interface IndicadorMaterial {
  reservado: Decimal;
  saldoLivre: Decimal;
  ritmoDiario: Decimal;
  /** null quando ritmoDiario = 0 */
  diasAteMinimo: Decimal | null;
  /** Formula C: ceil(ritmoDiario x 30 + estoqueMinimo - saldoLivre) */
  calculado: Decimal;
  obrigatorio: boolean;
  motivo: MotivoIndicador | null;
}

/** utilizado = max(0, saidas - entradas) da obra para o material. */
export function utilizadoObra(saidas: Decimal, entradas: Decimal): Decimal {
  return Decimal.max(ZERO, saidas.minus(entradas));
}

/** pendente = max(0, previsto - utilizado). */
export function pendenteObra(previsto: Decimal, utilizado: Decimal): Decimal {
  return Decimal.max(ZERO, previsto.minus(utilizado));
}

/** excedente = max(0, utilizado - previsto). */
export function excedenteObra(previsto: Decimal, utilizado: Decimal): Decimal {
  return Decimal.max(ZERO, utilizado.minus(previsto));
}

/** diasJanela = max(7, min(30, dias inteiros desde a criacao do material)). */
export function diasJanela(criadoEm: Date, agora: Date): number {
  const dias = Math.floor((agora.getTime() - criadoEm.getTime()) / DIA_MS);
  return Math.max(JANELA_MIN_DIAS, Math.min(JANELA_MAX_DIAS, dias));
}

export function calcularIndicador(entrada: EntradaIndicador): IndicadorMaterial {
  const { saldoAtual, estoqueMinimo, consumoSolto } = entrada;
  const dias = new Decimal(entrada.diasJanela);

  const reservado = entrada.pendentes.reduce((soma, p) => soma.plus(p), ZERO);
  const saldoLivre = saldoAtual.minus(reservado);
  const ritmoDiario = consumoSolto.div(dias);
  const temConsumo = consumoSolto.gt(0);

  // Multiplica antes de dividir para nao arredondar o ritmo no meio da conta
  // (ex.: 20/30 = 0,666...67; x 30 passaria de 20 e o ceil daria 21).
  // Piso 0: abaixo do minimo ja e indicado por motivo = ABAIXO_DO_MINIMO.
  const diasAteMinimo = temConsumo
    ? Decimal.max(ZERO, saldoLivre.minus(estoqueMinimo).times(dias).div(consumoSolto))
    : null;
  const consumoCobertura = consumoSolto.times(COBERTURA_DIAS).div(dias);
  const calculado = consumoCobertura.plus(estoqueMinimo).minus(saldoLivre).ceil();

  const abaixo = saldoLivre.lt(estoqueMinimo);
  const noMinimoComConsumo = saldoLivre.eq(estoqueMinimo) && temConsumo;
  const obrigatorio = abaixo || noMinimoComConsumo;

  let motivo: MotivoIndicador | null = null;
  if (abaixo) {
    motivo = 'ABAIXO_DO_MINIMO';
  } else if (noMinimoComConsumo) {
    motivo = 'NO_MINIMO_COM_CONSUMO';
  } else if (diasAteMinimo && diasAteMinimo.lte(HORIZONTE_DIAS)) {
    motivo = 'PREVISAO';
  }

  return { reservado, saldoLivre, ritmoDiario, diasAteMinimo, calculado, obrigatorio, motivo };
}
