# Gesso Manager

Sistema de gestão para firma de gesso: obras, gesseiros e estoque em um só lugar.
Projeto da disciplina de Engenharia de Produto de Software (S06 — INATEL).

## O que o sistema faz

| Módulo        | Responsabilidade                                                                 |
| ------------- | -------------------------------------------------------------------------------- |
| **Obras**     | Funil (aguardando cliente → fechada → em andamento → concluída), dados do cliente, planta baixa, forma de pagamento e gesseiros alocados |
| **Gesseiros** | Cadastro, alocação por obra e extrato de vale / haver / saldo a receber           |
| **Estoque**   | Materiais, entradas e saídas, alerta de estoque mínimo                            |

**A regra que amarra tudo:** ao concluir uma obra (`PATCH /api/obras/:id/concluir`), o sistema
lança automaticamente, na mesma transação, o crédito de cada gesseiro alocado. O valor entra no
"a receber" dele sem ninguém digitar nada. Está em `apps/api/src/obras/obras.service.ts` → `concluir()`.

## Stack

| Camada       | Tecnologia                                   |
| ------------ | -------------------------------------------- |
| Front-end    | React 18 + Vite + TypeScript + React Router  |
| Back-end     | Node.js + NestJS + TypeScript                |
| Banco        | PostgreSQL 16 + Prisma ORM                   |
| Testes       | Jest (API e web) + Supertest + Testing Library |
| Container    | Docker + Docker Compose                      |
| Hospedagem   | Vercel (web) + Render (API + Postgres)       |

## Estrutura

```
gesso-manager/
├── docker-compose.yml        # sobe db + api + web de uma vez
├── .env.example              # variáveis do compose
├── apps/
│   ├── api/                  # NestJS
│   │   ├── prisma/
│   │   │   ├── schema.prisma # modelo do banco
│   │   │   └── seed.ts       # dados de exemplo
│   │   └── src/
│   │       ├── auth/         # login JWT + guard global
│   │       ├── prisma/       # PrismaService (injetável)
│   │       ├── obras/        # MÓDULO DE REFERÊNCIA (completo)
│   │       ├── gesseiros/    # esqueleto com TODOs
│   │       └── estoque/      # esqueleto com TODOs
│   └── web/                  # React + Vite
│       └── src/
│           ├── lib/api.ts    # cliente HTTP único (token + erros)
│           ├── components/
│           └── pages/
└── .github/workflows/ci.yml  # build + testes a cada PR
```

## Como rodar

### Opção 1 — Docker (recomendado, sobe tudo)

```bash
cp .env.example .env
docker compose up --build
```

Na primeira vez, rode o seed em outro terminal:

```bash
docker compose exec api npx prisma migrate dev --name init
docker compose exec api npm run db:seed
```

- Web: http://localhost:5173
- API: http://localhost:3000/api
- Swagger: http://localhost:3000/docs
- Login: `admin@gesso.com` / `admin123`

### Opção 2 — Local (só o banco no Docker)

```bash
npm install
docker compose up -d db

cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env

npm run db:migrate        # cria as tabelas
npm run db:seed           # popula dados de exemplo

npm run dev:api           # terminal 1
npm run dev:web           # terminal 2
```

## Comandos úteis

| Comando                | O que faz                                     |
| ---------------------- | --------------------------------------------- |
| `npm run dev:api`      | API em modo watch                             |
| `npm run dev:web`      | Front em modo watch                           |
| `npm test`             | Roda os testes da API e do front              |
| `npm run build`        | Compila os dois projetos                      |
| `npm run db:migrate`   | Cria/aplica migration a partir do schema      |
| `npm run db:seed`      | Popula o banco com dados de exemplo           |
| `npm run db:studio`    | Abre o Prisma Studio (banco no navegador)     |
| `npm run docker:reset` | Derruba tudo e apaga o volume do Postgres     |

## Principais endpoints

Todas as rotas exigem `Authorization: Bearer <token>`, exceto as marcadas como públicas.

| Método | Rota                                | Descrição                          |
| ------ | ----------------------------------- | ---------------------------------- |
| GET    | `/api/health`                       | Health check (público)             |
| POST   | `/api/auth/login`                   | Login, devolve JWT (público)       |
| POST   | `/api/auth/register`                | Cria usuário (público)             |
| GET    | `/api/obras?status=ANDAMENTO`       | Lista obras filtrando pelo funil   |
| GET    | `/api/obras/resumo`                 | Quantidade e valor por status      |
| POST   | `/api/obras`                        | Cria obra com pagamento e equipe   |
| POST   | `/api/obras/:id/gesseiros`          | Aloca gesseiro na obra             |
| PATCH  | `/api/obras/:id/concluir`           | **Conclui e credita os gesseiros** |
| GET    | `/api/gesseiros/:id/extrato`        | Vale, haver e saldo a receber      |
| GET    | `/api/estoque/materiais`            | Lista materiais                    |
| POST   | `/api/estoque/movimentacoes`        | Entrada/saída de material          |

A documentação completa e testável fica em `/docs` (Swagger).

## Divisão de trabalho sugerida

O módulo **Obras** está implementado ponta a ponta de propósito: use
`obras.service.ts`, `obras.controller.ts`, os DTOs e `obras.service.spec.ts` como
modelo. Os outros módulos têm a estrutura pronta e `TODO(equipe)` marcando o que falta.

| Frente                 | O que fazer                                                              |
| ---------------------- | ------------------------------------------------------------------------ |
| Gesseiros (API)        | `create`, `update`, `remove` e `registrarLancamento` (vale/pagamento)     |
| Estoque (API)          | `criarMaterial`, `movimentar` (transação que atualiza saldo) e `abaixoDoMinimo` |
| Front — formulários    | Cadastro de obra, alocação de gesseiro, vale/pagamento, movimentação      |
| Front — dashboard      | Consumir `/obras/resumo` e montar a visão geral                          |
| Upload de planta baixa | Hoje é só uma URL no banco; avaliar upload de arquivo                     |
| Testes                 | Cobrir os serviços novos seguindo `obras.service.spec.ts`                 |

## Convenções

- Branches: `main` (estável) e `develop` (integração); features em `feat/<nome>`.
- Commits: [Conventional Commits](https://www.conventionalcommits.org) — `feat:`, `fix:`, `docs:`, `test:`, `refactor:`.
- PR só entra com o CI verde (build + testes).
- Nada de regra de negócio no controller: controller valida e delega, service decide.
