// Fixture da auditoria de responsividade (apps/web/scripts/audit-responsive.mjs).
// Monta os dados dos estados do agente de estoque e a obra CANCELADA com motivo longo
// (obras-transicoes-status, story "Ações de status no celular") que a auditoria mede, e apaga
// tudo depois.
//
// Uso (dentro do container da API, que tem o Prisma Client gerado):
//   docker exec gesso_api node scripts/fixture-auditoria.mjs preparar   -> imprime { alertaId, materialId, quantidade, obraCanceladaId }
//   docker exec gesso_api node scripts/fixture-auditoria.mjs limpar
//   docker exec gesso_api node scripts/fixture-auditoria.mjs contar     -> imprime { restos }
//
// Tudo que a fixture cria leva o marcador "[audit]": o nome dos materiais, o `modelo` da análise
// e o título da obra.
// A análise é datada de 2000-01-01, então nunca vira a "última análise" (as consultas ordenam por
// iniciadoEm desc) nem muda o catch-up do agendador. O agente LLM não é chamado.
// Não rodar durante uma análise real nem perto de uma demonstração do agente.
//
// Trava: só roda contra banco local (localhost, 127.0.0.1, ::1 ou "db", o host do Postgres no
// docker-compose). Com qualquer outro host no DATABASE_URL (ex.: o Postgres do Render), sai com
// código 3 antes de abrir conexão, em todos os comandos, inclusive limpar e contar.
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

const HOSTS_LOCAIS = new Set(['localhost', '127.0.0.1', '::1', '[::1]', 'db']);

/** Host do DATABASE_URL se for local; senão encerra o processo com erro. */
function exigirBancoLocal(url) {
  let host;
  try {
    host = new URL(url ?? '').hostname;
  } catch {
    host = null;
  }
  if (!host || !HOSTS_LOCAIS.has(host)) {
    console.error(
      `[audit] RECUSADO: a fixture só grava em banco local (${[...HOSTS_LOCAIS].join(', ')}). ` +
        `DATABASE_URL aponta para "${host ?? 'URL ausente ou inválida'}". Nada foi feito.`,
    );
    process.exit(3);
  }
  return host;
}

exigirBancoLocal(process.env.DATABASE_URL);

const { PrismaClient } = require('@prisma/client');

const MARCADOR = '[audit]';
const QUANTIDADE = 20;

const prisma = new PrismaClient();

// Interrompido no meio (Ctrl+C no docker exec, docker stop): o `preparar` grava tudo numa
// $transaction, então o PostgreSQL desfaz o que estiver pela metade. Aqui só se fecha a conexão.
for (const sinal of ['SIGINT', 'SIGTERM']) {
  process.on(sinal, () => {
    prisma.$disconnect().finally(() => process.exit(130));
  });
}

const filtroMateriais = { nome: { startsWith: MARCADOR } };
const filtroAnalises = { modelo: MARCADOR };
const filtroObras = { titulo: { startsWith: MARCADOR } };

/**
 * Motivo de 500 caracteres (o máximo do CancelarObraDto) com um trecho de 120 sem espaço:
 * prova que o card quebra o texto em vez de alargar a página a 320px.
 */
const MOTIVO_LONGO = (
  'Cliente desistiu depois de ver o orçamento revisado ' +
  'x'.repeat(120) +
  ' ' +
  'e pediu para guardar o projeto para o ano que vem. '.repeat(10)
).slice(0, 500);

async function limpar() {
  // Os alertas apontam para material e análise; saem primeiro (a análise não tem cascade).
  await prisma.alertaEstoque.deleteMany({
    where: { OR: [{ material: filtroMateriais }, { analise: filtroAnalises }] },
  });
  await prisma.analiseEstoque.deleteMany({ where: filtroAnalises });
  await prisma.material.deleteMany({ where: filtroMateriais });
  await prisma.obra.deleteMany({ where: filtroObras });
}

async function contar() {
  const [materiais, analises, alertas, obras] = await Promise.all([
    prisma.material.count({ where: filtroMateriais }),
    prisma.analiseEstoque.count({ where: filtroAnalises }),
    prisma.alertaEstoque.count({
      where: { OR: [{ material: filtroMateriais }, { analise: filtroAnalises }] },
    }),
    prisma.obra.count({ where: filtroObras }),
  ]);
  return materiais + analises + alertas + obras;
}

async function preparar() {
  await limpar();

  return prisma.$transaction(async (tx) => {
    const ativo = await tx.material.create({
      data: { nome: `${MARCADOR} Alerta ativo`, unidade: 'saco', saldoAtual: 0, estoqueMinimo: 10 },
    });
    const silenciado = await tx.material.create({
      data: { nome: `${MARCADOR} Silenciado`, unidade: 'saco', saldoAtual: 0, estoqueMinimo: 10 },
    });
    const inicio = new Date('2000-01-01T00:00:00.000Z');
    const analise = await tx.analiseEstoque.create({
      data: {
        origem: 'MANUAL',
        status: 'SUCESSO',
        iniciadoEm: inicio,
        finalizadoEm: inicio,
        totalAlertas: 2,
        modelo: MARCADOR,
      },
    });
    const numeros = { saldoLivre: 0, estoqueMinimo: 10, ritmoDiario: 0, origemTexto: 'AGENTE' };
    const alerta = await tx.alertaEstoque.create({
      data: {
        ...numeros,
        materialId: ativo.id,
        analiseId: analise.id,
        tipo: 'REPOSICAO',
        status: 'ATIVO',
        quantidadeSugerida: QUANTIDADE,
        justificativa: `${MARCADOR} Saldo zerado e abaixo do mínimo de 10 sacos; repor ${QUANTIDADE} cobre o mínimo com folga.`,
      },
    });
    await tx.alertaEstoque.create({
      data: {
        ...numeros,
        materialId: silenciado.id,
        analiseId: analise.id,
        tipo: 'REPOSICAO',
        status: 'DISPENSADO',
        quantidadeSugerida: QUANTIDADE,
        dispensadoEm: new Date(),
        justificativa: `${MARCADOR} Alerta dispensado pelo operador.`,
      },
    });
    const cancelada = await tx.obra.create({
      data: {
        titulo: `${MARCADOR} Cancelada`,
        clienteNome: 'Cliente auditoria',
        valorTotal: 1000,
        status: 'CANCELADA',
        motivoCancelamento: MOTIVO_LONGO,
      },
    });
    return {
      alertaId: alerta.id,
      materialId: ativo.id,
      quantidade: QUANTIDADE,
      obraCanceladaId: cancelada.id,
    };
  });
}

const comando = process.argv[2];

try {
  if (comando === 'preparar') {
    console.log(JSON.stringify(await preparar()));
  } else if (comando === 'limpar') {
    await limpar();
    console.log(JSON.stringify({ restos: await contar() }));
  } else if (comando === 'contar') {
    console.log(JSON.stringify({ restos: await contar() }));
  } else {
    console.error('Uso: node scripts/fixture-auditoria.mjs preparar|limpar|contar');
    process.exitCode = 2;
  }
} catch (erro) {
  console.error(erro);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
