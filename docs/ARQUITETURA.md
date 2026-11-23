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

**Ordem:** API primeiro (o front precisa da URL dela), depois o front, e por último o
`CORS_ORIGIN` da API com a URL do front.

**API + banco no Render (Blueprint):** o `render.yaml` na raiz declara o Postgres e o Web Service
(Docker, `Dockerfile Path` = `apps/api/Dockerfile`, contexto na raiz; ver AD-011). No Render:
*New → Blueprint* → este repositório. Build local da mesma imagem:
`docker build -f apps/api/Dockerfile -t gesso-api .`

- `JWT_SECRET` é gerado pelo próprio Render. Em produção a API se recusa a subir sem um segredo
  próprio, ou com o valor padrão deste repositório (`auth/segredo-jwt.ts`); o CI testa isso.
- `CORS_ORIGIN`: a URL da Vercel. Pode ficar em branco na criação (vazio libera qualquer origem) e
  ser preenchida depois. Espaços e barra no final são ignorados.
- O deploy automático só publica commit da `main` com o CI verde (`autoDeployTrigger: checksPass`).
- O container roda `prisma migrate deploy` antes de subir.

**Front na Vercel:** Root Directory `apps/web`, framework Vite. Variável `VITE_API_URL` = URL da
API **sem `/api`** e sem barra no final (o front acrescenta `/api`). Ela entra no build: mudou,
precisa de redeploy. O `vercel.json` reescreve todas as rotas para `index.html` — sem isso, dar F5
em `/obras` retorna 404 na Vercel.

**Como o front está publicado hoje (2026-11-23):** pela CLI da Vercel, no projeto `t-square` da
conta pessoal do André (`https://t-square-five.vercel.app`), porque o app da Vercel ainda espera a
aprovação de um dono da organização S06-2026-2 no GitHub. Por isso **não há deploy automático**:
para publicar uma mudança no front, quem tem acesso ao projeto roda, dentro de `apps/web`,
`npx vercel --prod`. Quando o app for aprovado, `npx vercel git connect` (também em `apps/web`)
liga o projeto ao repositório e cada push na `main` passa a publicar sozinho.

**Primeiro usuário:** o banco de produção nasce vazio e não roda seed (a senha do seed está neste
repositório). Criar pelo Swagger: `https://<api>/docs` → `POST /api/auth/register`. Enquanto a
AD-002 valer, essa rota fica aberta: qualquer pessoa com a URL consegue criar conta.

**Limites do plano gratuito:**

- A API dorme após 15 min sem tráfego e a primeira requisição depois disso leva cerca de 1 min.
  Antes de uma apresentação, abrir `https://<api>/api/health` e esperar responder.
- O Postgres gratuito expira 30 dias após a criação (mais 14 de carência, depois é apagado) e só
  pode existir um por workspace do Render.
