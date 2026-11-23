// Checagem deterministica da AD-012: nenhum requisito vira `Verified` sem auditoria de testes
// registrada. Roda no CI para todo mundo, use a pessoa o Claude ou nao.
//
// Regra: se o spec.md de uma feature tem algum requisito com status `Verified` na tabela de
// rastreabilidade, o validation.md da mesma pasta tem que existir e ter uma secao
// `## Auditoria de testes` com conteudo. Sem dependencias: so Node.
//
// Uso: node .github/scripts/checar-auditoria.mjs [pasta-das-features]

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const pasta = process.argv[2] ?? '.claude/specs/features';

// Linha da tabela de rastreabilidade com o ultimo campo `Verified`, ex.: `| EST-01 | ... | Verified |`.
const LINHA_VERIFIED = /^\|\s*[A-Z]{2,5}-\d+\s*\|.*\|\s*Verified\s*\|\s*$/gm;
const TITULO_AUDITORIA = /^## Auditoria de testes\s*$/m;
// Linhas com conteudo que a secao precisa ter para nao contar como vazia.
const MINIMO_DE_LINHAS = 3;

/** Texto da secao `## Auditoria de testes`, ate o proximo titulo de nivel 2 (ou o fim). */
export function secaoDeAuditoria(validation) {
  const inicio = validation.search(TITULO_AUDITORIA);
  if (inicio === -1) return null;
  const resto = validation.slice(inicio).split('\n').slice(1);
  const fim = resto.findIndex((linha) => /^## /.test(linha));
  return (fim === -1 ? resto : resto.slice(0, fim)).join('\n');
}

/** Problemas de uma feature, ou lista vazia se ela esta em dia. */
export function problemasDaFeature(spec, validation) {
  const verified = spec.match(LINHA_VERIFIED) ?? [];
  if (verified.length === 0) return [];
  if (validation === null) {
    return [`${verified.length} requisito(s) Verified e nenhum validation.md`];
  }
  const secao = secaoDeAuditoria(validation);
  if (secao === null) {
    return [`${verified.length} requisito(s) Verified e o validation.md sem "## Auditoria de testes"`];
  }
  const linhas = secao.split('\n').filter((linha) => linha.trim().length > 0).length;
  if (linhas < MINIMO_DE_LINHAS) {
    return ['a secao "## Auditoria de testes" do validation.md esta vazia'];
  }
  return [];
}

function lerSeExistir(caminho) {
  return existsSync(caminho) ? readFileSync(caminho, 'utf8') : null;
}

function main() {
  if (!existsSync(pasta)) {
    console.error(`Pasta de features nao encontrada: ${pasta}`);
    process.exit(2);
  }
  const features = readdirSync(pasta)
    .filter((nome) => statSync(join(pasta, nome)).isDirectory())
    .filter((nome) => existsSync(join(pasta, nome, 'spec.md')))
    .sort();

  const falhas = [];
  for (const nome of features) {
    const spec = readFileSync(join(pasta, nome, 'spec.md'), 'utf8');
    const validation = lerSeExistir(join(pasta, nome, 'validation.md'));
    for (const problema of problemasDaFeature(spec, validation)) {
      falhas.push(`- ${nome}: ${problema}`);
    }
  }

  if (falhas.length > 0) {
    console.error('Auditoria de testes faltando (AD-012):');
    console.error(falhas.join('\n'));
    console.error(
      '\nRode o sub-agente auditor-de-testes na feature (ou peca a quem usa o Claude) e registre o ' +
        'resultado numa secao "## Auditoria de testes" do validation.md. O workflow ' +
        '"Auditoria de testes" ja comenta o relatorio em todo PR que mexe em apps/.',
    );
    process.exit(1);
  }
  console.log(`Auditoria registrada em todas as features com requisito Verified (${features.length} specs).`);
}

// So roda a checagem quando chamado direto. pathToFileURL resolve tambem os caminhos do Windows
// (C:\...), que uma comparacao com `file://${argv[1]}` nunca acertaria.
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main();
}
