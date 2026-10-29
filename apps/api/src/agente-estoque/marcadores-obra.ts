import { OrigemTextoAlerta } from '@prisma/client';

/**
 * As obras chegam a LLM so como {{OBRA_n}}; o titulo volta depois da resposta.
 * Nenhum dado de cliente passa por aqui (so obraId e titulo, e o titulo fica no servidor).
 * Spec: .claude/specs/features/estoque-agente-proativo/spec.md (EAP-11, 12, 13, 61)
 */
export class MapaMarcadores {
  private readonly porObra = new Map<string, string>();
  private readonly porMarcador = new Map<string, { obraId: string; titulo: string }>();

  /** Devolve o marcador da obra, criando o proximo {{OBRA_n}} na primeira vez. */
  marcar(obraId: string, titulo: string): string {
    const existente = this.porObra.get(obraId);
    if (existente) return existente;

    const marcador = `{{OBRA_${this.porObra.size + 1}}}`;
    this.porObra.set(obraId, marcador);
    this.porMarcador.set(marcador, { obraId, titulo });
    return marcador;
  }

  /** Marcador ja emitido para a obra, ou undefined. */
  marcadorDe(obraId: string): string | undefined {
    return this.porObra.get(obraId);
  }

  titulo(marcador: string): string | undefined {
    return this.porMarcador.get(marcador)?.titulo;
  }

  /** marcador -> obraId (gravado em AnaliseEstoque.marcadores). */
  paraJson(): Record<string, string> {
    const json: Record<string, string> = {};
    this.porMarcador.forEach(({ obraId }, marcador) => {
      json[marcador] = obraId;
    });
    return json;
  }
}

export interface ObraCitavel {
  obraId: string;
  titulo: string;
}

const TRECHO_MARCADOR = /\{\{[^}]*\}\}/g;

/**
 * Prepara a justificativa do agente para gravacao:
 * - qualquer {{...}} que nao seja marcador emitido -> texto padrao (PADRAO);
 * - nenhum marcador das obras que reservam o material -> mantem e acrescenta "Reservado para: ...";
 * - troca cada marcador pelo titulo da obra.
 */
export function finalizarJustificativa(
  texto: string,
  mapa: MapaMarcadores,
  obrasQueReservam: ObraCitavel[],
  textoPadrao: string,
): { texto: string; origemTexto: OrigemTextoAlerta } {
  const trechos: string[] = texto.match(TRECHO_MARCADOR) ?? [];
  if (trechos.some((trecho) => mapa.titulo(trecho) === undefined)) {
    return { texto: textoPadrao, origemTexto: OrigemTextoAlerta.PADRAO };
  }

  const citaReservante = obrasQueReservam.some((obra) => {
    const marcador = mapa.marcadorDe(obra.obraId);
    return marcador !== undefined && trechos.includes(marcador);
  });

  let final = texto.replace(TRECHO_MARCADOR, (marcador) => mapa.titulo(marcador) as string);
  if (obrasQueReservam.length > 0 && !citaReservante) {
    const base = final.trimEnd();
    const separador = base.endsWith('.') ? ' ' : '. ';
    final = `${base}${separador}Reservado para: ${obrasQueReservam.map((o) => o.titulo).join(', ')}.`;
  }

  return { texto: final, origemTexto: OrigemTextoAlerta.AGENTE };
}
