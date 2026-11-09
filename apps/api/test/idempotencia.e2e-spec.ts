import { randomUUID } from 'node:crypto';

import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { configurarCors } from '../src/cors';
import { CreateLancamentoDto } from '../src/gesseiros/dto/create-lancamento.dto';
import { GesseirosService } from '../src/gesseiros/gesseiros.service';
import { ClientePrisma } from '../src/idempotencia/tipos';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * Idempotencia dos POST de criacao e CORS (IDP-02/03/04/06/09) de
 * .claude/specs/features/pwa-instalavel-responsivo/spec.md, de ponta a ponta.
 * Usa o banco de dev do Docker (trava em test/trava-banco-local.ts): todo dado criado leva o
 * prefixo `[e2e]` e e apagado no afterAll.
 */
const MARCADOR = '[e2e]';

/**
 * Ganchos de teste no registro de lancamento: `antes` segura o pedido depois de ele obter a
 * trava (o `criar` roda depois dela); `depois` lanca erro depois do INSERT.
 */
const ganchos: { antes?: () => Promise<void>; depois?: () => Promise<void> } = {};

class GesseirosComGancho extends GesseirosService {
  async registrarLancamento(gesseiroId: string, dto: CreateLancamentoDto, tx?: ClientePrisma) {
    const antes = ganchos.antes;
    ganchos.antes = undefined;
    await antes?.();
    const lancamento = await super.registrarLancamento(gesseiroId, dto, tx);
    await ganchos.depois?.();
    return lancamento;
  }
}

describe('Idempotencia (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let token: string;
  const chavesUsadas: string[] = [];

  const novaChave = () => {
    const chave = randomUUID();
    chavesUsadas.push(chave);
    return chave;
  };

  const http = () => request(app.getHttpServer());

  const novoGesseiro = () =>
    prisma.gesseiro.create({ data: { nome: `${MARCADOR} Gesseiro ${randomUUID().slice(0, 8)}` } });

  const postVale = (gesseiroId: string, corpo: object, chave?: string) => {
    const req = http()
      .post(`/api/gesseiros/${gesseiroId}/lancamentos`)
      .set('Authorization', `Bearer ${token}`);
    if (chave) req.set('Idempotency-Key', chave);
    return req.send(corpo);
  };

  const contarLancamentos = (gesseiroId: string) => prisma.lancamento.count({ where: { gesseiroId } });

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(GesseirosService)
      .useClass(GesseirosComGancho)
      .compile();

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

  afterEach(() => {
    ganchos.antes = undefined;
    ganchos.depois = undefined;
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.chaveIdempotencia.deleteMany({ where: { chave: { in: chavesUsadas } } });
      // Lancamentos e movimentacoes saem em cascata com o gesseiro e o material.
      await prisma.gesseiro.deleteMany({ where: { nome: { startsWith: MARCADOR } } });
      await prisma.material.deleteMany({ where: { nome: { startsWith: MARCADOR } } });
      await prisma.obra.deleteMany({ where: { titulo: { startsWith: MARCADOR } } });
    }
    await app?.close();
  });

  it('preflight de POST de criacao aceita Idempotency-Key (IDP-09)', async () => {
    const res = await http()
      .options('/api/gesseiros/qualquer-id/lancamentos')
      .set('Origin', 'http://localhost:5173')
      .set('Access-Control-Request-Method', 'POST')
      .set('Access-Control-Request-Headers', 'content-type,authorization,idempotency-key');

    expect(res.status).toBe(204);
    expect(res.headers['access-control-allow-origin']).toBe('http://localhost:5173');
    expect(res.headers['access-control-allow-headers'].toLowerCase().split(',')).toContain(
      'idempotency-key',
    );
  });

  it('a lista de cabecalhos do CORS e explicita, nao o reflexo do pedido', async () => {
    const res = await http()
      .options('/api/gesseiros')
      .set('Origin', 'http://localhost:5173')
      .set('Access-Control-Request-Method', 'POST')
      .set('Access-Control-Request-Headers', 'content-type');

    expect(res.status).toBe(204);
    expect(res.headers['access-control-allow-headers']).toBe(
      'Content-Type,Authorization,Idempotency-Key',
    );
  });

  it('mesma chave e mesmo corpo: um lancamento e a mesma resposta com 201 (IDP-02)', async () => {
    const gesseiro = await novoGesseiro();
    const chave = novaChave();
    const corpo = { tipo: 'VALE', valor: 150.5, descricao: `${MARCADOR} vale` };

    const primeira = await postVale(gesseiro.id, corpo, chave);
    const segunda = await postVale(gesseiro.id, corpo, chave);

    expect(primeira.status).toBe(201);
    expect(segunda.status).toBe(201);
    expect(segunda.body).toEqual(primeira.body);
    expect(primeira.body.valor).toBe('150.5');
    expect(await contarLancamentos(gesseiro.id)).toBe(1);
  });

  it('mesma chave e mesmo corpo em dois gesseiros: dois lancamentos, um em cada (rota com o id)', async () => {
    const [a, b] = await Promise.all([novoGesseiro(), novoGesseiro()]);
    const chave = novaChave();
    const corpo = { tipo: 'VALE', valor: 80, descricao: `${MARCADOR} vale` };

    const paraA = await postVale(a.id, corpo, chave);
    const paraB = await postVale(b.id, corpo, chave);

    expect(paraA.status).toBe(201);
    expect(paraB.status).toBe(201);
    expect(paraA.body.gesseiroId).toBe(a.id);
    expect(paraB.body.gesseiroId).toBe(b.id);
    expect(paraB.body.id).not.toBe(paraA.body.id);
    expect(await contarLancamentos(a.id)).toBe(1);
    expect(await contarLancamentos(b.id)).toBe(1);
    expect(await prisma.chaveIdempotencia.count({ where: { chave } })).toBe(2);
  });

  it('mesma chave e outro valor: 422 e continua um lancamento (IDP-03)', async () => {
    const gesseiro = await novoGesseiro();
    const chave = novaChave();

    const primeira = await postVale(gesseiro.id, { tipo: 'VALE', valor: 100 }, chave);
    const outra = await postVale(gesseiro.id, { tipo: 'VALE', valor: 200 }, chave);

    expect(primeira.status).toBe(201);
    expect(outra.status).toBe(422);
    expect(outra.body.message).toBe('Esta Idempotency-Key já foi usada com outros dados.');
    expect(await contarLancamentos(gesseiro.id)).toBe(1);
  });

  it('dois POST simultaneos com a mesma chave: um 201, um 409 e um lancamento (IDP-04)', async () => {
    const gesseiro = await novoGesseiro();
    const chave = novaChave();
    const corpo = { tipo: 'VALE', valor: 80 };

    // O primeiro pedido para dentro do `criar` (ja com a trava) ate o segundo responder.
    let avisarQueEntrou!: () => void;
    const entrou = new Promise<void>((resolve) => (avisarQueEntrou = resolve));
    let soltar!: () => void;
    const solto = new Promise<void>((resolve) => (soltar = resolve));
    ganchos.antes = async () => {
      avisarQueEntrou();
      await solto;
    };

    const [primeira, segunda] = await Promise.all([
      postVale(gesseiro.id, corpo, chave).then((res) => res),
      entrou.then(async () => {
        const res = await postVale(gesseiro.id, corpo, chave);
        soltar();
        return res;
      }),
    ]);

    expect(primeira.status).toBe(201);
    expect(segunda.status).toBe(409);
    expect(segunda.body.message).toBe('Este envio ainda está sendo processado.');
    expect(await contarLancamentos(gesseiro.id)).toBe(1);
  });

  it('erro depois do INSERT desfaz lancamento e chave; o reenvio com a mesma chave grava um', async () => {
    const gesseiro = await novoGesseiro();
    const chave = novaChave();
    const corpo = { tipo: 'VALE', valor: 60 };
    ganchos.depois = async () => {
      throw new Error('falha simulada depois do INSERT');
    };

    const falha = await postVale(gesseiro.id, corpo, chave);

    expect(falha.status).toBe(500);
    expect(await contarLancamentos(gesseiro.id)).toBe(0);
    expect(await prisma.chaveIdempotencia.count({ where: { chave } })).toBe(0);

    ganchos.depois = undefined;
    const reenvio = await postVale(gesseiro.id, corpo, chave);

    expect(reenvio.status).toBe(201);
    expect(await contarLancamentos(gesseiro.id)).toBe(1);
    expect(await prisma.chaveIdempotencia.count({ where: { chave } })).toBe(1);
  });

  it('sem Idempotency-Key, dois POST criam dois lancamentos (IDP-06)', async () => {
    const gesseiro = await novoGesseiro();
    const corpo = { tipo: 'VALE', valor: 40 };

    const primeira = await postVale(gesseiro.id, corpo);
    const segunda = await postVale(gesseiro.id, corpo);

    expect(primeira.status).toBe(201);
    expect(segunda.status).toBe(201);
    expect(segunda.body.id).not.toBe(primeira.body.id);
    expect(await contarLancamentos(gesseiro.id)).toBe(2);
  });

  it('mesma chave em /estoque/movimentacoes move o saldo uma vez so (IDP-02)', async () => {
    const material = await prisma.material.create({
      data: { nome: `${MARCADOR} Material ${randomUUID().slice(0, 8)}`, unidade: 'saco' },
    });
    const chave = novaChave();
    const corpo = { materialId: material.id, tipo: 'ENTRADA', quantidade: 5 };
    const post = () =>
      http()
        .post('/api/estoque/movimentacoes')
        .set('Authorization', `Bearer ${token}`)
        .set('Idempotency-Key', chave)
        .send(corpo);

    const primeira = await post();
    const segunda = await post();

    expect(primeira.status).toBe(201);
    expect(segunda.status).toBe(201);
    expect(segunda.body).toEqual(primeira.body);
    const depois = await prisma.material.findUniqueOrThrow({ where: { id: material.id } });
    expect(Number(depois.saldoAtual)).toBe(5);
    expect(await prisma.movimentacaoEstoque.count({ where: { materialId: material.id } })).toBe(1);
  });

  describe('as outras rotas de criacao tambem repetem a resposta sem gravar de novo (IDP-02)', () => {
    const sufixo = () => randomUUID().slice(0, 8);

    it.each([
      {
        rota: '/api/gesseiros',
        corpo: () => ({ nome: `${MARCADOR} Gesseiro ${sufixo()}` }),
        contar: (corpo: { nome: string }) => prisma.gesseiro.count({ where: { nome: corpo.nome } }),
      },
      {
        rota: '/api/obras',
        corpo: () => ({ titulo: `${MARCADOR} Obra ${sufixo()}`, clienteNome: 'Cliente', valorTotal: 1000 }),
        contar: (corpo: { titulo: string }) => prisma.obra.count({ where: { titulo: corpo.titulo } }),
      },
      {
        rota: '/api/estoque/materiais',
        corpo: () => ({ nome: `${MARCADOR} Material ${sufixo()}`, unidade: 'saco' }),
        contar: (corpo: { nome: string }) => prisma.material.count({ where: { nome: corpo.nome } }),
      },
    ] as const)('POST $rota', async ({ rota, corpo: montar, contar }) => {
      const corpo = montar();
      const chave = novaChave();
      const post = () =>
        http()
          .post(rota)
          .set('Authorization', `Bearer ${token}`)
          .set('Idempotency-Key', chave)
          .send(corpo);

      const primeira = await post();
      const segunda = await post();

      expect(primeira.status).toBe(201);
      expect(segunda.status).toBe(201);
      expect(segunda.body).toEqual(primeira.body);
      expect(await (contar as (c: typeof corpo) => Promise<number>)(corpo)).toBe(1);
    });
  });
});
