# Estoque — Materiais e Movimentação Validation (EST-01..09)

**Verdict**: PASS ✅

**Date**: 2026-11-09
**Spec**: `.claude/specs/features/estoque-materiais-movimentacao/spec.md`
**Diff range**: working tree vs `HEAD` (`8e99dc8`). Código de produção sem mudança; só testes: `estoque.service.spec.ts` (modificado), `dto/create-movimentacao.dto.spec.ts` e `dto/create-material.dto.spec.ts` (novos).
**Verifier**: sub-agente `auditor-de-testes` (`.claude/agents/auditor-de-testes.md`), independente do autor; cada mutação apontada foi aplicada no código e a suíte rodada.

> Paths abaixo são relativos a `apps/api/src/estoque/`.

---

## Contexto

O código da feature entrou na PR #4 (outubro) e o EST-09 em `aa52d2a`, mas a rastreabilidade ficou em `Design | Pending`. Esta rodada fecha a spec pela regra da AD-009: nenhum requisito vira `Verified` sem o auditor.

## Auditoria de testes

**Veredito do auditor (antes)**: cobertura parcial. Entrada, saída, saldo insuficiente, os 404, o status da obra e o alerta estavam bem cobertos. A atomicidade da transação e o conteúdo gravado na SAIDA não tinham prova.

O achado central: o mock de `$transaction` passava o próprio `prisma` como `tx`, então nenhum teste distinguia uma escrita dentro da transação de uma feita fora dela. O mock agora entrega um `tx` próprio, cujas escritas são promessas preguiçosas como as do Prisma real: só contam como executadas quando aguardadas.

| # | Arquivo:linha | Mutação | Antes | Teste que pega agora | Mutação aplicada |
| --- | --- | --- | --- | --- | --- |
| 1 | `estoque.service.ts:82, 88, 99` | `tx.` → `this.prisma.` | nenhum | EST-03 e EST-04 (escritas no `tx`, nenhuma no `prisma`) | 3 testes falham |
| 2 | `estoque.service.ts:82` | sem `await` no `update` | nenhum | EST-03 (só escrita aguardada conta como executada) | 2 testes falham |
| 3 | `estoque.service.ts:76` | checagem de saldo vale também para ENTRADA | nenhum | "ENTRADA em material com saldo 0 e aceita" | 1 teste falha |
| 4 | `estoque.service.ts:103` | SAIDA gravada como ENTRADA | nenhum | EST-04 (confere `tipo` e `quantidade` gravados) | 1 teste falha |
| 5 | `estoque.service.ts:47` | qualquer erro conhecido do Prisma vira 409 | nenhum | "so traduz para 409 o nome duplicado (P2002)…" | 1 teste falha |
| 6 | `dto/create-material.dto.ts:7` | sem `@MinLength(2)` | nenhum | `create-material.dto.spec.ts` | 1 teste falha |
| 7 | `dto/create-movimentacao.dto.ts:16` | sem `@Min(0.01)` | nenhum | `create-movimentacao.dto.spec.ts` (ENTRADA e SAIDA) | 4 testes falham |
| 8 | `estoque.service.ts:29` | listagem sem `where` | nenhum | `listarMovimentacoes` › "filtra pelo material…" | 1 teste falha |
| 9–14 | vários | `?? 0`, `<` por `<=`, `gte`, `count === 0`, os 404, enum de obra encerrada, `<=` e `Number()` no alerta | já cobertos | testes que já existiam | — |

Cada mutação foi aplicada no código, a suíte foi rodada e o arquivo restaurado em seguida. As oito derrubaram pelo menos um teste.

**Aceitos sem teste**:

- **O 201 do EST-01, EST-03 e EST-04**: é o padrão do `@Post()` do NestJS e `estoque.controller.ts` não tem `@HttpCode`. Não há e2e de estoque; um e2e futuro cobriria.
- **O rollback de verdade**: o teste novo prova que um erro ao gravar a movimentação escapa do callback da `$transaction`. Desfazer o saldo a partir daí é comportamento do Prisma com o Postgres, que mock não testa.

## Critérios de sucesso

- Cadastro e movimentação sem Prisma Studio: pela UI, via FRM-08 e FRM-09 de `front-formularios` (Verified).
- `saldoAtual` nunca negativo: SAIDA maior que o saldo (EST-05), SAIDA concorrente (`count === 0`) e quantidade ≤ 0 recusada pelo DTO, nos dois tipos.
- Alerta reflete o saldo mais recente: `abaixoDoMinimo()` lê do banco a cada chamada, sem cache.

## Testes

- Módulo estoque: 4 suítes, 56 testes passando (`npx jest src/estoque`).
- `estoque.service.spec.ts`: de 19 para 24 testes. Os antigos continuam, com as asserções de escrita apontando para o `tx`.

## Rastreabilidade

EST-01 a EST-09 → `Execute | Verified`.
