# Arquitetura

## Visão geral

```
┌──────────────┐        HTTP/JSON        ┌──────────────┐      Prisma      ┌────────────┐
│  React+Vite  │ ──────────────────────► │   NestJS API │ ───────────────► │ PostgreSQL │
│   (Vercel)   │   Bearer JWT            │   (Render)   │                  │  (Render)  │
└──────────────┘                         └──────────────┘                  └────────────┘
```

Em desenvolvimento os três serviços sobem juntos pelo `docker-compose.yml`.

## Camadas da API

```
Controller  →  valida o DTO (class-validator) e delega. Sem regra de negócio.
Service     →  regra de negócio e transações. É o que os testes cobrem.
PrismaService → acesso ao banco, injetado nos services.
```

O `JwtAuthGuard` é registrado como `APP_GUARD` global: **toda rota exige token**,
e liberamos exceções com o decorator `@Public()` (usado em `/health`, `/auth/login`
e `/auth/register`).

## Modelo de dados

```
Usuario                        (acesso ao sistema)

Obra ──1:1── Pagamento         (forma, parcelas, entrada)
  │
  ├──1:N── ObraGesseiro ──N:1── Gesseiro      (quem trabalha e quanto foi combinado)
  │
  ├──1:N── Lancamento ────N:1── Gesseiro      (extrato: CREDITO, VALE, PAGAMENTO)
  │
  └──1:N── MovimentacaoEstoque ──N:1── Material
```

### Por que `Lancamento` em vez de um campo `saldo` no gesseiro

Guardar um número solto (`gesseiro.saldo`) esconde a história: ninguém sabe de onde
veio o valor nem consegue auditar. Com lançamentos, o saldo é **derivado**:

```
saldo a receber = Σ CREDITO − Σ VALE − Σ PAGAMENTO
```

Cada linha diz de qual obra veio e quando aconteceu — é exatamente o que o dono da
firma quer ver quando o gesseiro pergunta "quanto eu tenho pra receber?".

### Por que `Decimal` e não `Float`

Dinheiro em ponto flutuante acumula erro de arredondamento. O schema usa
`Decimal(12,2)`, e o Prisma devolve esses campos como string/Decimal — por isso o
front converte com `Number()` antes de exibir.

## Fluxo da regra automática

```
PATCH /api/obras/:id/concluir
  │
  ├─ obra existe? não → 404
  ├─ já está CONCLUIDA ou CANCELADA? → 400 (evita crédito duplicado)
  │
  └─ $transaction:
       1. obra.status = CONCLUIDA, dataConclusao = agora
       2. para cada gesseiro alocado:
            Lancamento { tipo: CREDITO, valor: valorCombinado, obraId }
```

As duas operações estão na mesma transação: ou a obra fecha **e** os créditos entram,
ou nada acontece. Nunca sobra uma obra concluída com gesseiro sem receber.

## Autenticação

1. `POST /auth/login` valida a senha com bcrypt e devolve um JWT (`sub`, `email`, `papel`).
2. O front guarda o token e o envia em `Authorization: Bearer <token>`.
3. `JwtStrategy` valida a assinatura e popula `request.user`.
4. Resposta 401 no front → limpa o token e volta pra tela de login.

`JWT_SECRET` **nunca** vai pro Git: fica em `.env` local e nas variáveis de ambiente
do Render em produção.

## Deploy

**API no Render:** Web Service apontando para `apps/api` com o `Dockerfile`.
Variáveis: `DATABASE_URL` (do Postgres do próprio Render), `JWT_SECRET`, `CORS_ORIGIN`
(a URL da Vercel). O container roda `prisma migrate deploy` antes de subir.

**Web na Vercel:** Root Directory `apps/web`, framework Vite.
Variável: `VITE_API_URL` com a URL pública da API.

O `vercel.json` já reescreve todas as rotas para `index.html` — sem isso, dar F5 em
`/obras` retorna 404 na Vercel.
