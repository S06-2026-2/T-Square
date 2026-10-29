/**
 * Popula o banco com dados minimos para a equipe conseguir testar as telas.
 * Rode com: npm run db:seed --workspace apps/api
 */
import {
  PrismaClient,
  StatusObra,
  FormaPagamento,
  TipoLancamento,
  TipoMovimentacao,
} from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const senhaHash = await bcrypt.hash('admin123', 10);

  const admin = await prisma.usuario.upsert({
    where: { email: 'admin@gesso.com' },
    update: {},
    create: {
      nome: 'Administrador',
      email: 'admin@gesso.com',
      senhaHash,
      papel: 'ADMIN',
    },
  });

  const [joao, pedro] = await Promise.all([
    prisma.gesseiro.upsert({
      where: { id: '11111111-1111-1111-1111-111111111111' },
      update: {},
      create: {
        id: '11111111-1111-1111-1111-111111111111',
        nome: 'Joao Ferreira',
        telefone: '(35) 99999-0001',
        chavePix: 'joao@pix.com',
      },
    }),
    prisma.gesseiro.upsert({
      where: { id: '22222222-2222-2222-2222-222222222222' },
      update: {},
      create: {
        id: '22222222-2222-2222-2222-222222222222',
        nome: 'Pedro Alves',
        telefone: '(35) 99999-0002',
      },
    }),
  ]);

  const obra = await prisma.obra.upsert({
    where: { id: '33333333-3333-3333-3333-333333333333' },
    update: {},
    create: {
      id: '33333333-3333-3333-3333-333333333333',
      titulo: 'Forro de gesso - Residencia Silva',
      descricao: 'Forro liso em 3 quartos e sala, com sanca aberta na sala.',
      clienteNome: 'Maria Silva',
      clienteTelefone: '(35) 98888-0001',
      endereco: 'Rua das Flores, 120 - Campos Gerais/MG',
      status: StatusObra.ANDAMENTO,
      valorTotal: 8500,
      dataInicio: new Date(),
      pagamento: {
        create: {
          forma: FormaPagamento.PIX,
          parcelas: 3,
          valorEntrada: 2000,
        },
      },
      gesseiros: {
        create: [
          { gesseiroId: joao.id, valorCombinado: 2500, funcao: 'Forro' },
          { gesseiroId: pedro.id, valorCombinado: 1500, funcao: 'Sanca' },
        ],
      },
    },
  });

  await prisma.obra.upsert({
    where: { id: '44444444-4444-4444-4444-444444444444' },
    update: {},
    create: {
      id: '44444444-4444-4444-4444-444444444444',
      titulo: 'Drywall - Escritorio Centro',
      clienteNome: 'Construtora Horizonte',
      status: StatusObra.ORCAMENTO,
      valorTotal: 14200,
    },
  });

  // Um vale ja adiantado para o Joao, para o extrato nao nascer zerado.
  const jaTemVale = await prisma.lancamento.findFirst({
    where: { gesseiroId: joao.id, tipo: TipoLancamento.VALE },
  });
  if (!jaTemVale) {
    await prisma.lancamento.create({
      data: {
        gesseiroId: joao.id,
        obraId: obra.id,
        tipo: TipoLancamento.VALE,
        valor: 500,
        descricao: 'Vale adiantado em dinheiro',
      },
    });
  }

  await prisma.material.upsert({
    where: { nome: 'Placa de gesso 1,20x1,80' },
    update: {},
    create: { nome: 'Placa de gesso 1,20x1,80', unidade: 'un', saldoAtual: 120, estoqueMinimo: 30 },
  });
  await prisma.material.upsert({
    where: { nome: 'Gesso em po' },
    update: {},
    create: { nome: 'Gesso em po', unidade: 'saco', saldoAtual: 45, estoqueMinimo: 10 },
  });

  await seedDemonstracaoAgente(pedro.id);

  console.log('Seed concluido. Login: admin@gesso.com / admin123');
  console.log(`Usuario admin: ${admin.id}`);
}

const DIA_MS = 24 * 60 * 60 * 1000;

/**
 * Cenario de demonstracao do agente de estoque (feature estoque-agente-proativo, T25).
 * Sem chave da Claude API, "Rodar analise agora" ja gera os alertas obrigatorios:
 * - Gesso cola: saldo 6, minimo 10 (abaixo do minimo, com consumo solto);
 * - Perfil montante 48mm: saldo 20 = minimo 20, com consumo solto (no minimo);
 * - Placa de drywall ST: saldo 70, mas a obra FECHADA reserva 60 -> saldo livre 10 < minimo 20;
 * - Fita para juntas: cruza o minimo em ~6 dias (previsao; fica a criterio do agente).
 * - Massa para drywall: sem risco (saldo 25, minimo 5), mas a obra em ANDAMENTO previu 10 e
 *   ja usou 15 (excedente 5). Excedente nao reserva nem entra no consumo solto, entao
 *   calculado <= 0: cenario para o agente registrar um INFORMATIVO (T28, EAP-67).
 *
 * Idempotente: materiais por nome, obra/previsto/movimentacoes por id fixo.
 * Rodar de novo nao duplica nada; so traz as datas das movimentacoes para perto de "agora",
 * para as saidas continuarem dentro da janela de 30 dias.
 * O saldoAtual de cada material bate com as movimentacoes (entrada inicial - saidas).
 */
async function seedDemonstracaoAgente(gesseiroId: string) {
  const agora = new Date();
  const diasAtras = (dias: number) => new Date(agora.getTime() - dias * DIA_MS);

  // Criados ha 40 dias: a janela de consumo do agente fica em 30 dias.
  const material = (nome: string, unidade: string, saldoAtual: number, estoqueMinimo: number) =>
    prisma.material.upsert({
      where: { nome },
      update: {},
      create: { nome, unidade, saldoAtual, estoqueMinimo, criadoEm: diasAtras(40) },
    });

  const gessoCola = await material('Gesso cola', 'saco', 6, 10);
  const perfil = await material('Perfil montante 48mm', 'barra', 20, 20);
  const placaDrywall = await material('Placa de drywall ST 1,20x1,80', 'un', 70, 20);
  const fita = await material('Fita para juntas', 'rolo', 11, 5);
  const massa = await material('Massa para drywall', 'balde', 25, 5);

  const obraFechada = await prisma.obra.upsert({
    where: { id: '55555555-5555-5555-5555-555555555555' },
    update: {},
    create: {
      id: '55555555-5555-5555-5555-555555555555',
      titulo: 'Drywall - Clinica Bem Estar',
      descricao: 'Divisorias em drywall nas 4 salas de atendimento.',
      clienteNome: 'Clinica Bem Estar Ltda',
      clienteTelefone: '(35) 98888-0003',
      endereco: 'Av. Brasil, 455 - Campos Gerais/MG',
      status: StatusObra.FECHADA,
      valorTotal: 9800,
    },
  });

  await prisma.materialPrevistoObra.upsert({
    where: { obraId_materialId: { obraId: obraFechada.id, materialId: placaDrywall.id } },
    update: {},
    create: { obraId: obraFechada.id, materialId: placaDrywall.id, quantidade: 60 },
  });

  const obraAndamento = await prisma.obra.upsert({
    where: { id: '77777777-7777-7777-7777-777777777777' },
    update: {},
    create: {
      id: '77777777-7777-7777-7777-777777777777',
      titulo: 'Drywall - Loja Avenida',
      descricao: 'Parede de drywall separando estoque e salao de vendas.',
      clienteNome: 'Loja Avenida Ltda',
      clienteTelefone: '(35) 98888-0004',
      endereco: 'Av. Sete de Setembro, 80 - Campos Gerais/MG',
      status: StatusObra.ANDAMENTO,
      valorTotal: 6200,
      dataInicio: diasAtras(14),
      gesseiros: { create: [{ gesseiroId, valorCombinado: 1800, funcao: 'Drywall' }] },
    },
  });

  await prisma.materialPrevistoObra.upsert({
    where: { obraId_materialId: { obraId: obraAndamento.id, materialId: massa.id } },
    update: {},
    create: { obraId: obraAndamento.id, materialId: massa.id, quantidade: 10 },
  });

  const { ENTRADA, SAIDA } = TipoMovimentacao;
  const movimentacoes: {
    id: string;
    materialId: string;
    tipo: TipoMovimentacao;
    quantidade: number;
    dias: number;
    observacao: string;
    obraId?: string;
  }[] = [
    {
      id: '66666666-6666-6666-6666-666666666601',
      materialId: gessoCola.id,
      tipo: ENTRADA,
      quantidade: 30,
      dias: 35,
      observacao: 'Compra inicial',
    },
    {
      id: '66666666-6666-6666-6666-666666666602',
      materialId: gessoCola.id,
      tipo: SAIDA,
      quantidade: 8,
      dias: 20,
      observacao: 'Retirada para reparos',
    },
    {
      id: '66666666-6666-6666-6666-666666666603',
      materialId: gessoCola.id,
      tipo: SAIDA,
      quantidade: 10,
      dias: 9,
      observacao: 'Retirada para reparos',
    },
    {
      id: '66666666-6666-6666-6666-666666666604',
      materialId: gessoCola.id,
      tipo: SAIDA,
      quantidade: 6,
      dias: 3,
      observacao: 'Retirada para reparos',
    },
    {
      id: '66666666-6666-6666-6666-666666666605',
      materialId: perfil.id,
      tipo: ENTRADA,
      quantidade: 50,
      dias: 35,
      observacao: 'Compra inicial',
    },
    {
      id: '66666666-6666-6666-6666-666666666606',
      materialId: perfil.id,
      tipo: SAIDA,
      quantidade: 18,
      dias: 15,
      observacao: 'Retirada avulsa',
    },
    {
      id: '66666666-6666-6666-6666-666666666607',
      materialId: perfil.id,
      tipo: SAIDA,
      quantidade: 12,
      dias: 5,
      observacao: 'Retirada avulsa',
    },
    {
      id: '66666666-6666-6666-6666-666666666608',
      materialId: placaDrywall.id,
      tipo: ENTRADA,
      quantidade: 80,
      dias: 35,
      observacao: 'Compra inicial',
    },
    {
      id: '66666666-6666-6666-6666-666666666609',
      materialId: placaDrywall.id,
      tipo: SAIDA,
      quantidade: 10,
      dias: 12,
      observacao: 'Retirada avulsa',
    },
    {
      id: '66666666-6666-6666-6666-666666666610',
      materialId: fita.id,
      tipo: ENTRADA,
      quantidade: 40,
      dias: 35,
      observacao: 'Compra inicial',
    },
    {
      id: '66666666-6666-6666-6666-666666666611',
      materialId: fita.id,
      tipo: SAIDA,
      quantidade: 14,
      dias: 20,
      observacao: 'Retirada avulsa',
    },
    {
      id: '66666666-6666-6666-6666-666666666612',
      materialId: fita.id,
      tipo: SAIDA,
      quantidade: 15,
      dias: 6,
      observacao: 'Retirada avulsa',
    },
    {
      id: '66666666-6666-6666-6666-666666666613',
      materialId: massa.id,
      tipo: ENTRADA,
      quantidade: 40,
      dias: 35,
      observacao: 'Compra inicial',
    },
    {
      id: '66666666-6666-6666-6666-666666666614',
      materialId: massa.id,
      tipo: SAIDA,
      quantidade: 8,
      dias: 10,
      observacao: 'Saida para a obra',
      obraId: obraAndamento.id,
    },
    {
      id: '66666666-6666-6666-6666-666666666615',
      materialId: massa.id,
      tipo: SAIDA,
      quantidade: 7,
      dias: 4,
      observacao: 'Saida para a obra',
      obraId: obraAndamento.id,
    },
  ];

  for (const { dias, ...mov } of movimentacoes) {
    await prisma.movimentacaoEstoque.upsert({
      where: { id: mov.id },
      update: { criadoEm: diasAtras(dias) },
      create: { ...mov, criadoEm: diasAtras(dias) },
    });
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
