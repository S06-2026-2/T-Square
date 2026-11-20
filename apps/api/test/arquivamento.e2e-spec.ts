import { randomUUID } from 'node:crypto';

import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { StatusObra, TipoLancamento } from '@prisma/client';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { configurarCors } from '../src/cors';
import { LimpezaService } from '../src/limpeza/limpeza.service';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * ARQ-03, ARQ-12, ARQ-13 e ARQ-15 de .claude/specs/features/arquivar-e-limpar-registros/spec.md,
 * de ponta a ponta no Postgres do Docker (trava em test/trava-banco-local.ts). Todo dado criado
 * leva o prefixo `[e2e]` e é apagado no afterAll. Roda com --runInBand.
 *
 * Atenção: o `limpar()` apaga todo arquivado vencido do banco, não só os `[e2e]` (é o mesmo que
 * o cron das 3h faria). Os testes recuam o `arquivadoEm` só dos próprios registros.
 */
const MARCADOR = '[e2e]';
const DIA_MS = 24 * 60 * 60 * 1000;

describe('Arquivamento e limpeza (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let limpeza: LimpezaService;
  let token: string;

  const http = () => request(app.getHttpServer());
  const autenticado = <T extends request.Test>(req: T) =>
    req.set('Authorization', `Bearer ${token}`);
  const sufixo = () => randomUUID().slice(0, 8);
  const diasAtras = (dias: number) => new Date(Date.now() - dias * DIA_MS);

  /** Obra concluída pelas rotas, com o gesseiro (se vier) alocado por `valor`. */
  async function obraConcluida(gesseiroId?: string, valor = 2500) {
    const criada = await autenticado(http().post('/api/obras')).send({
      titulo: `${MARCADOR} Arquivo ${sufixo()}`,
      clienteNome: 'Cliente e2e',
      valorTotal: 8000,
    });
    const id = criada.body.id as string;
    expect((await autenticado(http().patch(`/api/obras/${id}/fechar`))).status).toBe(200);
    if (gesseiroId) {
      const alocacao = await autenticado(http().post(`/api/obras/${id}/gesseiros`)).send({
        gesseiroId,
        valorCombinado: valor,
      });
      expect(alocacao.status).toBe(201);
    } else {
      // Sem equipe a obra não inicia pela rota; o e2e só precisa dela concluída.
      await prisma.obra.update({ where: { id }, data: { status: StatusObra.ANDAMENTO } });
    }
    if (gesseiroId) {
      expect((await autenticado(http().patch(`/api/obras/${id}/iniciar`))).status).toBe(200);
    }
    expect((await autenticado(http().patch(`/api/obras/${id}/concluir`))).status).toBe(200);
    return id;
  }

  const quitar = (obraId: string) =>
    autenticado(http().patch(`/api/obras/${obraId}`)).send({ valorRecebido: 8000 });

  const extrato = async (gesseiroId: string) =>
    (await autenticado(http().get(`/api/gesseiros/${gesseiroId}/extrato`))).body;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    // Mesma montagem do main.ts.
    app.setGlobalPrefix('api');
    configurarCors(app);
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    await app.init();

    prisma = app.get(PrismaService);
    limpeza = app.get(LimpezaService);

    const login = await http()
      .post('/api/auth/login')
      .send({ email: 'admin@gesso.com', senha: 'admin123' });
    expect(login.status).toBe(200);
    token = login.body.accessToken;
  });

  afterAll(async () => {
    if (prisma) {
      const obras = { titulo: { startsWith: MARCADOR } };
      await prisma.lancamento.deleteMany({ where: { obra: obras } });
      // Equipe, pagamento e previstos saem em cascata com a obra.
      await prisma.obra.deleteMany({ where: obras });
      // Lançamentos (inclusive os que ficaram sem obra) saem em cascata com o gesseiro.
      await prisma.gesseiro.deleteMany({ where: { nome: { startsWith: MARCADOR } } });
      await prisma.material.deleteMany({ where: { nome: { startsWith: MARCADOR } } });
    }
    await app?.close();
  });

  it('obra quitada: arquiva uma vez só, e a limpeza preserva saldo e créditos do gesseiro', async () => {
    const gesseiro = await prisma.gesseiro.create({
      data: { nome: `${MARCADOR} Gesseiro ${sufixo()}` },
    });
    const obraId = await obraConcluida(gesseiro.id, 2500);

    // Antes de pagar: o painel mostra a pendência e a API recusa.
    const pendente = await autenticado(http().get(`/api/obras/${obraId}/arquivamento`));
    expect(pendente.body).toEqual(
      expect.objectContaining({
        concluida: true,
        clienteQuitado: false,
        gesseirosPendentes: [{ id: gesseiro.id, nome: gesseiro.nome, saldo: 2500 }],
        podeArquivar: false,
      }),
    );
    const recusada = await autenticado(http().patch(`/api/obras/${obraId}/arquivar`));
    expect(recusada.status).toBe(400);
    expect(recusada.body.message).toBe(
      'O cliente ainda não pagou tudo: recebido R$ 0,00 de R$ 8.000,00',
    );

    // Paga o gesseiro e registra o recebido total.
    const pagamento = await autenticado(
      http().post(`/api/gesseiros/${gesseiro.id}/lancamentos`),
    ).send({
      tipo: TipoLancamento.PAGAMENTO,
      valor: 2500,
    });
    expect(pagamento.status).toBe(201);
    expect((await quitar(obraId)).status).toBe(200);
    const pronta = await autenticado(http().get(`/api/obras/${obraId}/arquivamento`));
    expect(pronta.body.podeArquivar).toBe(true);

    // ARQ-15: dois arquivar ao mesmo tempo.
    const respostas = await Promise.all([
      autenticado(http().patch(`/api/obras/${obraId}/arquivar`)),
      autenticado(http().patch(`/api/obras/${obraId}/arquivar`)),
    ]);
    expect(respostas.map((r) => r.status).sort()).toEqual([200, 400]);
    expect(respostas.find((r) => r.status === 400)!.body.message).toBe('A obra já está arquivada');

    // Some da lista normal e aparece nos arquivados.
    const lista = await autenticado(http().get('/api/obras'));
    expect(lista.body.map((o: { id: string }) => o.id)).not.toContain(obraId);
    const arquivadas = await autenticado(http().get('/api/obras?arquivados=true'));
    expect(arquivadas.body.map((o: { id: string }) => o.id)).toContain(obraId);

    const antes = await extrato(gesseiro.id);
    await prisma.obra.update({ where: { id: obraId }, data: { arquivadoEm: diasAtras(8) } });

    const resultado = await limpeza.limpar();

    expect(resultado.falhas).toEqual([]);
    expect(await prisma.obra.findUnique({ where: { id: obraId } })).toBeNull();
    const lancamentos = await prisma.lancamento.findMany({ where: { gesseiroId: gesseiro.id } });
    expect(lancamentos).toHaveLength(2);
    expect(lancamentos.every((l) => l.obraId === null)).toBe(true);
    const depois = await extrato(gesseiro.id);
    expect(depois.saldoAReceber).toBe(antes.saldoAReceber);
    expect(depois.saldoAReceber).toBe(0);
    expect(depois.creditos).toBe(antes.creditos);
    expect(depois.creditos).toBe(2500);

    // O gesseiro (saldo 0, sem obra aberta) também pode ser arquivado e limpo.
    expect((await autenticado(http().patch(`/api/gesseiros/${gesseiro.id}/arquivar`))).status).toBe(
      200,
    );
    await prisma.gesseiro.update({
      where: { id: gesseiro.id },
      data: { arquivadoEm: diasAtras(8) },
    });

    await limpeza.limpar();

    expect(await prisma.gesseiro.findUnique({ where: { id: gesseiro.id } })).toBeNull();
    expect(await prisma.lancamento.count({ where: { gesseiroId: gesseiro.id } })).toBe(0);
  });

  it('obra arquivada há 6 dias fica; restaurada antes do job também fica', async () => {
    const recente = await obraConcluida();
    const restaurada = await obraConcluida();
    for (const id of [recente, restaurada]) {
      expect((await quitar(id)).status).toBe(200);
      expect((await autenticado(http().patch(`/api/obras/${id}/arquivar`))).status).toBe(200);
    }
    await prisma.obra.update({ where: { id: recente }, data: { arquivadoEm: diasAtras(6) } });
    await prisma.obra.update({ where: { id: restaurada }, data: { arquivadoEm: diasAtras(8) } });
    const volta = await autenticado(http().patch(`/api/obras/${restaurada}/restaurar`));
    expect(volta.status).toBe(200);
    expect(volta.body.status).toBe(StatusObra.CONCLUIDA);
    expect(volta.body.arquivadoEm).toBeNull();

    await limpeza.limpar();

    expect(await prisma.obra.findUnique({ where: { id: recente } })).not.toBeNull();
    expect(await prisma.obra.findUnique({ where: { id: restaurada } })).not.toBeNull();
  });

  it('material: 409 para o nome arquivado e limpeza depois de 7 dias', async () => {
    const nome = `${MARCADOR} Material ${sufixo()}`;
    const criado = await autenticado(http().post('/api/estoque/materiais')).send({
      nome,
      unidade: 'saco',
    });
    expect(criado.status).toBe(201);
    const id = criado.body.id as string;
    expect((await autenticado(http().patch(`/api/estoque/materiais/${id}/arquivar`))).status).toBe(
      200,
    );

    const repetido = await autenticado(http().post('/api/estoque/materiais')).send({
      nome,
      unidade: 'saco',
    });
    expect(repetido.status).toBe(409);
    expect(repetido.body.message).toBe(
      'Existe um material arquivado com esse nome. Restaure-o em "Ver arquivados".',
    );

    await prisma.material.update({ where: { id }, data: { arquivadoEm: diasAtras(8) } });
    await limpeza.limpar();

    expect(await prisma.material.findUnique({ where: { id } })).toBeNull();
  });
});
