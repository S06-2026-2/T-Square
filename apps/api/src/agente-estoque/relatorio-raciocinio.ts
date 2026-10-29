import { AnaliseEstoque } from '@prisma/client';

import type { PassoAgente } from './agente-estoque.service';

/** Campos da AnaliseEstoque que o relatorio usa (passos e marcadores como gravados). */
export type AnaliseParaRelatorio = Pick<
  AnaliseEstoque,
  | 'id'
  | 'origem'
  | 'status'
  | 'iniciadoEm'
  | 'finalizadoEm'
  | 'totalAlertas'
  | 'chamadasFerramenta'
  | 'modelo'
  | 'erro'
  | 'passos'
  | 'marcadores'
>;

const ROTULO_PASSO: Record<PassoAgente['tipo'], string> = {
  texto: 'Agente',
  ferramenta: 'Ferramenta',
  limite: 'Limite atingido',
  erro: 'Erro',
};

const CSS = `
  body { font-family: system-ui, -apple-system, "Segoe UI", sans-serif; margin: 0; padding: 24px 16px;
    background: #f6f7f9; color: #1d2330; line-height: 1.5; }
  main { max-width: 860px; margin: 0 auto; }
  h1 { font-size: 1.5rem; margin: 0 0 4px; }
  h2 { font-size: 1.1rem; margin: 32px 0 12px; }
  .sub { color: #5b6475; margin: 0 0 16px; }
  section.card, .passo { background: #fff; border: 1px solid #dfe3ea; border-radius: 8px; padding: 12px 16px; }
  dl { display: grid; grid-template-columns: max-content 1fr; gap: 4px 16px; margin: 0; }
  dt { color: #5b6475; }
  dd { margin: 0; font-weight: 600; }
  table { border-collapse: collapse; width: 100%; }
  th, td { text-align: left; padding: 6px 8px; border-bottom: 1px solid #dfe3ea; }
  ol { list-style: none; padding: 0; margin: 0; display: grid; gap: 12px; }
  .passo { border-left: 4px solid #8a94a6; }
  .passo.texto { border-left-color: #2f6fde; }
  .passo.ferramenta { border-left-color: #1f9d6b; }
  .passo.ferramenta.erro, .passo.erro { border-left-color: #c93c3c; }
  .passo.limite { border-left-color: #d08a12; }
  .rotulo { font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.04em; color: #5b6475; margin: 0 0 6px; }
  .recusa { color: #c93c3c; font-weight: 600; }
  p.texto { margin: 0; white-space: pre-wrap; }
  pre { background: #f1f3f6; border-radius: 6px; padding: 8px; margin: 4px 0 8px; overflow-x: auto;
    white-space: pre-wrap; word-break: break-word; font-size: 0.85rem; }
  code { font-family: ui-monospace, Consolas, monospace; }
`;

/**
 * Gera o HTML standalone (CSS inline, sem recursos externos) com o raciocinio de uma analise,
 * para a apresentacao. Funcao pura: recebe a analise gravada e o titulo de cada obra (obraId ->
 * titulo). Os passos ficam exatamente como a LLM viu, com {{OBRA_n}}; o titulo so aparece na
 * legenda. Nenhum dado de cliente entra aqui.
 */
export function renderizarRaciocinio(
  analise: AnaliseParaRelatorio,
  titulosObras: Record<string, string>,
): string {
  const passos = Array.isArray(analise.passos) ? (analise.passos as unknown as PassoAgente[]) : [];
  const marcadores = ehObjeto(analise.marcadores)
    ? (analise.marcadores as Record<string, string>)
    : {};

  const linhasLegenda = Object.entries(marcadores).map(
    ([marcador, obraId]) =>
      `<tr><td><code>${escapar(marcador)}</code></td><td>${escapar(
        titulosObras[obraId] ?? 'obra não encontrada',
      )}</td></tr>`,
  );

  const legenda =
    linhasLegenda.length > 0
      ? `<table><thead><tr><th>Marcador</th><th>Obra</th></tr></thead><tbody>${linhasLegenda.join(
          '',
        )}</tbody></table>`
      : '<p>Nenhuma obra citada nesta análise.</p>';

  const blocos =
    passos.length > 0
      ? `<ol>${passos.map((passo, i) => renderizarPasso(passo, i + 1)).join('\n')}</ol>`
      : '<p>Nenhum passo gravado: a LLM não foi chamada nesta análise (ex.: sem chave) ou não respondeu.</p>';

  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Raciocínio do agente de estoque</title>
<style>${CSS}</style>
</head>
<body>
<main>
<h1>Raciocínio do agente de estoque</h1>
<p class="sub">Análise ${escapar(analise.id)}</p>

<section class="card" id="conclusao">
<dl>
<dt>Status</dt>
<dd>${escapar(analise.status)}</dd>
<dt>Origem</dt>
<dd>${escapar(analise.origem)}</dd>
<dt>Início</dt>
<dd>${dataHora(analise.iniciadoEm)}</dd>
<dt>Fim</dt>
<dd>${analise.finalizadoEm ? dataHora(analise.finalizadoEm) : '-'}</dd>
<dt>Modelo</dt>
<dd>${escapar(analise.modelo ?? '-')}</dd>
<dt>Alertas ativos</dt>
<dd>${analise.totalAlertas}</dd>
<dt>Chamadas de ferramenta</dt>
<dd>${analise.chamadasFerramenta}</dd>
<dt>Erro</dt>
<dd>${escapar(analise.erro ?? '-')}</dd>
</dl>
</section>

<h2>Legenda dos marcadores</h2>
<section class="card" id="legenda">
<p class="sub">A LLM nunca vê as obras: só os marcadores abaixo. O título é trocado pelo sistema.</p>
${legenda}
</section>

<h2>Passos</h2>
${blocos}
</main>
</body>
</html>
`;
}

function renderizarPasso(passo: PassoAgente, numero: number): string {
  const recusada = passo.tipo === 'ferramenta' && passo.erro === true;
  const classe = `passo ${passo.tipo}${recusada ? ' erro' : ''}`;
  const rotulo = ROTULO_PASSO[passo.tipo] ?? passo.tipo;

  const partes: string[] = [];
  if (passo.tipo === 'ferramenta') {
    partes.push(
      `<p><code>${escapar(passo.ferramenta ?? '?')}</code>${
        recusada ? ' <span class="recusa">recusada / erro</span>' : ''
      }</p>`,
    );
    partes.push(`<div>Entrada:</div><pre><code>${escapar(json(passo.entrada))}</code></pre>`);
    partes.push(
      `<div>Resultado:</div><pre><code>${escapar(resultadoLegivel(passo.resultado))}</code></pre>`,
    );
  } else {
    partes.push(`<p class="texto">${escapar(passo.texto ?? '')}</p>`);
  }

  return `<li class="${classe}"><p class="rotulo">${numero}. ${escapar(rotulo)}</p>${partes.join(
    '',
  )}</li>`;
}

/** Resultado vem resumido (500 caracteres); se ainda for JSON valido, indenta. */
function resultadoLegivel(resultado: string | undefined): string {
  if (resultado === undefined) return '';
  try {
    return JSON.stringify(JSON.parse(resultado), null, 2);
  } catch {
    return resultado;
  }
}

function json(valor: unknown): string {
  return valor === undefined ? '' : JSON.stringify(valor, null, 2);
}

function ehObjeto(valor: unknown): boolean {
  return typeof valor === 'object' && valor !== null && !Array.isArray(valor);
}

function dataHora(data: Date): string {
  return data.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
}

function escapar(texto: string): string {
  return texto
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
