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

> **Puxou a feature do agente de estoque?** Rode `docker compose up --build -V` de novo. Ela traz
> duas dependências novas na API (`@anthropic-ai/sdk` e `@nestjs/schedule`) e uma migration nova
> (aplicada sozinha pelo `prisma migrate deploy` ao subir o container). O `-V` recria o volume
> anônimo do `node_modules`; sem ele o container reaproveita as dependências antigas e a API não
> encontra os módulos novos. O volume do banco não é apagado.

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

## Agente de estoque

Um agente (Claude API com ferramentas) analisa o estoque, prevê quais materiais vão cruzar o
mínimo e sugere quanto repor. Ele só sugere: nunca compra nem movimenta estoque. Sem chave da
API, a análise ainda gera os alertas básicos (material com saldo livre no mínimo ou abaixo).

Variáveis novas no `.env` da raiz (já repassadas ao container `api` pelo `docker-compose.yml`):

| Variável            | Padrão             | Para que serve                                                    |
| ------------------- | ------------------ | ----------------------------------------------------------------- |
| `ANTHROPIC_API_KEY` | vazia              | Chave da Claude API. Só no seu `.env`, **nunca** commitada        |
| `ANTHROPIC_MODEL`   | `claude-haiku-5-5` | Modelo usado pelo agente                                          |
| `AGENTE_AUTOMATICO` | `false`            | `true` liga a análise diária às 06:00 (Brasília) e o catch-up ao subir a API |

Depois de mudar o `.env`, rode `docker compose up -d api` para o container receber os valores novos.
A análise manual (`POST /api/estoque/agente/analisar`) funciona com qualquer valor de `AGENTE_AUTOMATICO`.

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
| POST   | `/api/estoque/agente/analisar`      | Roda uma análise do agente agora (1 a cada 5 min) |
| GET    | `/api/estoque/agente/alertas`       | Alertas ativos e a última análise  |
| PATCH  | `/api/estoque/agente/alertas/:id/dispensar` | Dispensa um alerta         |
| PATCH  | `/api/estoque/agente/alertas/:id/resolver`  | Marca o alerta como resolvido |

A documentação completa e testável fica em `/docs` (Swagger).

## Convenções

- Branches: `main` (estável) e `develop` (integração); features em `feat/<nome>`.
- Commits: [Conventional Commits](https://www.conventionalcommits.org) — `feat:`, `fix:`, `docs:`, `test:`, `refactor:`.
- PR só entra com o CI verde (build + testes).
- Nada de regra de negócio no controller: controller valida e delega, service decide.
