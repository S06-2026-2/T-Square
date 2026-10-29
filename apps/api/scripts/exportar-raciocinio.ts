/**
 * Exporta o raciocinio de uma AnaliseEstoque em HTML standalone (apresentacao).
 * So le o banco e grava o arquivo; o HTML e montado por renderizarRaciocinio.
 *
 * Uso: npm run agente:exportar --workspace apps/api -- [analiseId] [arquivo.html]
 * Sem id, usa a analise mais recente que tenha passos. Grava em apps/api/tmp/ (fora do Git).
 */
import { mkdirSync, writeFileSync } from 'fs';
import { basename, join } from 'path';
import { PrismaClient } from '@prisma/client';

import { renderizarRaciocinio } from '../src/agente-estoque/relatorio-raciocinio';

const prisma = new PrismaClient();

async function main() {
  const [id, arquivo] = process.argv.slice(2);

  const analise = id
    ? await prisma.analiseEstoque.findUnique({ where: { id } })
    : await prisma.analiseEstoque.findFirst({
        where: { NOT: { passos: { equals: [] } } },
        orderBy: { iniciadoEm: 'desc' },
      });
  if (!analise) {
    throw new Error(id ? `Análise ${id} não encontrada` : 'Nenhuma análise com passos gravados');
  }

  // So o titulo: nenhum dado de cliente chega ao HTML.
  const obraIds = Object.values((analise.marcadores ?? {}) as Record<string, string>);
  const obras = await prisma.obra.findMany({
    where: { id: { in: obraIds } },
    select: { id: true, titulo: true },
  });
  const titulos = Object.fromEntries(obras.map((o) => [o.id, o.titulo]));

  const pasta = join(__dirname, '..', 'tmp');
  mkdirSync(pasta, { recursive: true });
  const destino = join(pasta, basename(arquivo ?? `raciocinio-${analise.id}.html`));
  writeFileSync(destino, renderizarRaciocinio(analise, titulos), 'utf8');
  console.log(`HTML gravado em ${destino}`);
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
