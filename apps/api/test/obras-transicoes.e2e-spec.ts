import { randomUUID } from 'node:crypto';

import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { StatusObra, TipoLancamento } from '@prisma/client';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { configurarCors } from '../src/cors';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * TRN-06 e TRN-07 de .claude/specs/features/obras-transicoes-status/spec.md, de ponta a ponta no
 * Postgres do Docker (trava em test/trava-banco-local.ts, via setupFiles). Todo dado criado leva o
 * prefixo `[e2e]` e e apagado no afterAll, mesmo com falha. Roda com --runInBand: o
 * idempotencia.e2e-spec.ts usa o mesmo prefixo.
 */
const MARCADOR = '[e2e]';

describe('Obras: transicoes de status (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let token: string;

  const http = () => request(app.getHttpServer());
  const autenticado = <T extends request.Test>(req: T) => req.set('Authorization', `Bearer ${token}`);
  const sufixo = () => randomUUID().slice(0, 8);

  const novaObra = (extra: object = {}) =>
    autenticado(http().post('/api/obras')).send({
      titulo: `${MARCADOR} Obra ${sufixo()}`,
      clienteNome: 'Cliente e2e',
      valorTotal: 5000,
      ...extra,
    });

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

    const login = await http()
      .post('/api/auth/login')
      .send({ email: 'admin@gesso.com', senha: 'admin123' });
    expect(login.status).toBe(200);
    token = login.body.accessToken;
  });

  afterAll(async () => {
    if (prisma) {
      const doTeste = { titulo: { startsWith: MARCADOR } };
      await prisma.lancamento.deleteMany({ where: { obra: doTeste } });
      // As alocacoes saem em cascata com a obra.
      await prisma.obra.deleteMany({ where: doTeste });
      await prisma.gesseiro.deleteMany({ where: { nome: { startsWith: MARCADOR } } });
    }
    await app?.close();
  });

  it('POST /obras com status responde 400 e nao cria a obra (TRN-06)', async () => {
    const titulo = `${MARCADOR} Atalho ${sufixo()}`;

    const res = await autenticado(http().post('/api/obras')).send({
      titulo,
      clienteNome: 'Cliente e2e',
      valorTotal: 5000,
      status: StatusObra.CONCLUIDA,
    });

    expect(res.status).toBe(400);
    expect(res.body.message).toEqual(['property status should not exist']);
    expect(await prisma.obra.count({ where: { titulo } })).toBe(0);
  });

  it('POST /obras sem status cria a obra em ORCAMENTO (TRN-06)', async () => {
    const res = await novaObra();

    expect(res.status).toBe(201);
    expect(res.body.status).toBe(StatusObra.ORCAMENTO);
  });

  it('PATCH /obras/:id com status responde 400 e nao altera a obra (TRN-06)', async () => {
    const criada = await novaObra();
    const id = criada.body.id as string;

    const res = await autenticado(http().patch(`/api/obras/${id}`)).send({
      status: StatusObra.CONCLUIDA,
      clienteNome: 'Outro nome',
    });

    expect(res.status).toBe(400);
    expect(res.body.message).toEqual(['property status should not exist']);
    const depois = await prisma.obra.findUniqueOrThrow({ where: { id } });
    expect(depois.status).toBe(StatusObra.ORCAMENTO);
    expect(depois.clienteNome).toBe('Cliente e2e');
  });

  it('PATCH /obras/:id/cancelar valida o motivo pelo DTO e grava sem espacos, sem lancamento (TRN-09)', async () => {
    const criada = await novaObra();
    const id = criada.body.id as string;
    const cancelar = (motivo: string) =>
      autenticado(http().patch(`/api/obras/${id}/cancelar`)).send({ motivo });

    const curto = await cancelar('  ab  ');
    expect(curto.status).toBe(400);
    expect((await prisma.obra.findUniqueOrThrow({ where: { id } })).status).toBe(StatusObra.ORCAMENTO);

    const ok = await cancelar('  Cliente desistiu  ');
    expect(ok.status).toBe(200);
    expect(ok.body.status).toBe(StatusObra.CANCELADA);
    const gravada = await prisma.obra.findUniqueOrThrow({ where: { id } });
    expect(gravada.status).toBe(StatusObra.CANCELADA);
    expect(gravada.motivoCancelamento).toBe('Cliente desistiu');
    expect(await prisma.lancamento.count({ where: { obraId: id } })).toBe(0);

    const repetido = await cancelar('Outro motivo');
    expect(repetido.status).toBe(400);
    expect(repetido.body.message).toBe('Não é possível cancelar uma obra com status CANCELADA');
  });

  it('dois concluir em paralelo: um 200, um 400 e exatamente 1 CREDITO por gesseiro (TRN-07)', async () => {
    const [g1, g2] = await Promise.all(
      [1, 2].map((n) =>
        prisma.gesseiro.create({ data: { nome: `${MARCADOR} Gesseiro ${n} ${sufixo()}` } }),
      ),
    );
    const criada = await novaObra();
    const id = criada.body.id as string;

    // Leva a obra ate ANDAMENTO pelas rotas.
    expect((await autenticado(http().patch(`/api/obras/${id}/fechar`))).status).toBe(200);
    for (const [gesseiro, valor] of [
      [g1, 2500],
      [g2, 1500],
    ] as const) {
      const alocacao = await autenticado(http().post(`/api/obras/${id}/gesseiros`)).send({
        gesseiroId: gesseiro.id,
        valorCombinado: valor,
      });
      expect(alocacao.status).toBe(201);
    }
    const iniciada = await autenticado(http().patch(`/api/obras/${id}/iniciar`));
    expect(iniciada.status).toBe(200);
    expect(iniciada.body.status).toBe(StatusObra.ANDAMENTO);

    const respostas = await Promise.all([
      autenticado(http().patch(`/api/obras/${id}/concluir`)),
      autenticado(http().patch(`/api/obras/${id}/concluir`)),
    ]);

    expect(respostas.map((r) => r.status).sort()).toEqual([200, 400]);
    const recusada = respostas.find((r) => r.status === 400)!;
    expect(recusada.body.message).toBe('Não é possível concluir uma obra com status CONCLUIDA');

    const creditos = await prisma.lancamento.findMany({
      where: { obraId: id, tipo: TipoLancamento.CREDITO },
      orderBy: { valor: 'desc' },
    });
    expect(creditos.map((c) => [c.gesseiroId, Number(c.valor)])).toEqual([
      [g1.id, 2500],
      [g2.id, 1500],
    ]);
    const obra = await prisma.obra.findUniqueOrThrow({ where: { id } });
    expect(obra.status).toBe(StatusObra.CONCLUIDA);
    expect(obra.dataConclusao).not.toBeNull();
  });
});
