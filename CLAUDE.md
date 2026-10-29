# Gesso Manager (T-Square)

Sistema de gestão para firma de gesso: obras, gesseiros e estoque. Projeto de Engenharia de Produto
de Software (S06 — INATEL), feito por um time de 3.

## Stack

- **API**: NestJS + TypeScript, `apps/api/`
- **Front**: React 18 + Vite + TypeScript + React Router, `apps/web/`
- **Banco**: PostgreSQL 16 via **Prisma ORM** (não TypeORM) — schema em `apps/api/prisma/schema.prisma`
- **Testes**: Jest + Supertest (API), Jest + Testing Library (web)
- **Container**: Docker Compose (`docker-compose.yml`)

Setup e endpoints completos: `README.md`. Decisões de arquitetura: `docs/ARQUITETURA.md`.

## Convenções de código

- **Controller fino, Service gordo**: controller só valida DTO (`class-validator`) e delega; toda
  regra de negócio e transação vive no service.
- **Módulo de referência**: `apps/api/src/obras/` (controller + service + dtos +
  `obras.service.spec.ts`) é o padrão a seguir para qualquer TODO pendente (`gesseiros`, `estoque`)
  ou módulo novo.
- **Dinheiro é sempre `Decimal(12,2)`**, nunca `Float`. Prisma devolve Decimal/string; o front
  converte com `Number()` só na exibição (`lib/formato.ts`).
- **Nunca hard-delete** entidades com histórico financeiro/relacional (ex: `Gesseiro`). "Remover"
  significa `ativo=false`. Ver decisão `AD-003` em `.claude/specs/STATE.md`.
- **Saldo é sempre derivado de lançamentos** (`Lancamento`), nunca um campo solto tipo `saldo`.
- **`prisma.$transaction`** para qualquer operação que grava mais de uma entidade atomicamente
  (ex: `ObrasService.concluir()`, e `EstoqueService.movimentar()` quando implementado).

## Fluxo de especificação (spec-driven)

Specs de feature vivem em `.claude/specs/features/<slug>/spec.md` (formato EARS). Decisões de
projeto ficam em `.claude/specs/STATE.md` (log `AD-NNN`). Leia o `spec.md` de uma feature antes de
implementá-la. Specs existentes: `gesseiros-crud-financeiro`, `estoque-materiais-movimentacao`,
`front-formularios`, `front-dashboard-resumo`, `obras-transicoes-status`.

## Ambiente de desenvolvimento

- `docker compose up --build` sobe banco + API + web (ver README para migration/seed na primeira vez).
- **Gotcha conhecido**: `node:20-alpine` não vem com `openssl`, e o Prisma schema engine precisa
  dele — sem isso a API entra em loop de restart. Já corrigido em `apps/api/Dockerfile` e
  `Dockerfile.dev` (`RUN apk add --no-cache openssl`) — não remover essa linha.
- **Portas**: `POSTGRES_PORT` no `.env` raiz pode precisar mudar se `5432` já estiver em uso por
  outro projeto local — checar `docker ps` antes de assumir a porta padrão.
- **Hot-reload não confiável (API e web)**: com o repositório numa pasta sincronizada pelo
  OneDrive, o bind mount do Docker nem sempre recebe o evento de mudança do arquivo, então nem o
  `nest start --watch` nem o Vite percebem a edição. Se editar `apps/api/src/**` e a API continuar
  respondendo com o comportamento antigo, rodar `docker restart gesso_api`; se editar
  `apps/web/src/**` e a tela não mudar, rodar `docker restart gesso_web` (e Ctrl+F5 no navegador).
  Para confirmar que o Vite está servindo o código novo:
  `curl -s http://localhost:5173/src/<caminho do arquivo> | grep "<trecho novo>"`. Conferir isso
  antes de investigar qualquer outra coisa.

## Testes

Todo service novo (ou TODO implementado) precisa de um `.spec.ts` cobrindo os cenários da spec
correspondente, seguindo o estilo de `apps/api/src/obras/obras.service.spec.ts`.
