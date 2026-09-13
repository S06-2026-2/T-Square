/**
 * Popula o banco com dados minimos para a equipe conseguir testar as telas.
 * Rode com: npm run db:seed --workspace apps/api
 */
import { PrismaClient, StatusObra, FormaPagamento, TipoLancamento } from '@prisma/client';
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

  console.log('Seed concluido. Login: admin@gesso.com / admin123');
  console.log(`Usuario admin: ${admin.id}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
