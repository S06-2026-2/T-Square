# Front — Dashboard de Resumo Tasks

## Execution Protocol (MANDATORY -- do not skip)

Implement these tasks with the `tlc-spec-driven` skill: **activate it by name and follow its Execute flow and Critical Rules.** Do not search for skill files by filesystem path. The skill is the source of truth for the full flow (per-task cycle, sub-agent delegation, adequacy review, Verifier, discrimination sensor).

**If the skill cannot be activated, STOP and tell the user - do not proceed without it.**

> Projeto: o time commita manualmente. Ao final de cada task, o agente **propõe** a mensagem de commit (Conventional Commits) e não executa `git commit` sem pedido explícito.

---

**Design**: pulado (feature Medium, sem decisão arquitetural — segue o padrão de `pages/Obras.tsx`)
**Status**: Done (Verifier rodada 2: PASS)

---

## Test Coverage Matrix

> Generated from codebase, project guidelines, and spec - confirm before Execute. Guidelines found: `CLAUDE.md` (seção Testes), `apps/web/jest.config.cjs` (sem threshold), `.github/workflows` (CI roda `test` e `build` de `apps/web`), amostras `apps/web/src/pages/Obras.test.tsx`, `apps/web/src/components/StatusBadge.test.tsx`.

| Code Layer | Required Test Type | Coverage Expectation | Location Pattern | Run Command |
| --- | --- | --- | --- | --- |
| Helpers puros (`lib/status.ts`) | unit | Todos os 5 status com o rótulo da spec, na ordem do funil | `apps/web/src/lib/*.test.ts` | `npm test --workspace apps/web` |
| Página (`pages/Dashboard.tsx`) | unit (component, `lib/api` mockado via `jest.mock`) | DSH-01, DSH-02, DSH-03 + edge case "nenhuma obra"; valores exatos em BRL | `apps/web/src/pages/*.test.tsx` | `npm test --workspace apps/web` |
| Roteamento/menu (`App.tsx`, `Layout.tsx`) | unit (component, `MemoryRouter`) | `/` redireciona para `/dashboard`; aba "Visão geral" aponta para `/dashboard` | `apps/web/src/*.test.tsx` | `npm test --workspace apps/web` |
| Estilo (`index.css`), ícones (`Icone.tsx`) | none | - (build gate only) | - | build gate only |

## Gate Check Commands

> Generated from codebase - confirm before Execute.

| Gate Level | When to Use | Command |
| --- | --- | --- |
| Quick | Após tasks com testes unit/component | `npm test --workspace apps/web` |
| Full | Igual ao Quick (não há e2e no front) | `npm test --workspace apps/web` |
| Build | Fim de cada fase e tasks sem teste | `npm run build --workspace apps/web && npm test --workspace apps/web` |

---

## Execution Plan

Phases are ordered and run sequentially - each phase completes before the next begins, and tasks within a phase execute in order.

### Phase 1: Foundation

Rótulos compartilhados e estilo. Sem dependências entre si.

```
T1
T2
```

### Phase 2: Dashboard (P1 / MVP)

```
T3 → T4
```

---

## Task Breakdown

### T1: Extrair rótulos do funil para `lib/status.ts` ✅

**What**: Módulo com `STATUS_FUNIL` (os 5 `StatusObra` na ordem do funil) e `rotuloPlural` (ORCAMENTO→"Aguardando cliente", FECHADA→"Fechadas", ANDAMENTO→"Em andamento", CONCLUIDA→"Concluidas", CANCELADA→"Canceladas"); `pages/Obras.tsx` monta `filtros` a partir dele (sem `CANCELADA`, como hoje).
**Where**: `apps/web/src/lib/status.ts` (+ uso em `apps/web/src/pages/Obras.tsx`)
**Depends on**: None
**Reuses**: rótulos de `filtros` em `pages/Obras.tsx`
**Requirement**: DSH-01

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] `STATUS_FUNIL` e `rotuloPlural` exportados com os 5 status
- [x] `Obras.tsx` usa `rotuloPlural`; `Obras.test.tsx` continua verde
- [x] Gate check passes: `npm test --workspace apps/web`
- [x] Test count: 30 tests pass (28 + 2)

**Tests**: unit
**Gate**: quick

**Commit**: `refactor(web): extrai rotulos do funil de obras para lib/status`

---

### T2: Estilo dos cards de resumo ✅

**What**: Classes `.grade-resumo` e `.card-resumo[data-status]` (borda colorida por status, mesmas cores de `.card-obra`).
**Where**: `apps/web/src/index.css`
**Depends on**: None
**Reuses**: cores de `.card-obra[data-status]`, `.valor`
**Requirement**: DSH-01

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Classes adicionadas
- [x] Gate check passes: `npm run build --workspace apps/web && npm test --workspace apps/web`

**Tests**: none
**Gate**: build

**Commit**: `style(web): adiciona estilo dos cards do dashboard`

---

### T3: Página `Dashboard` ✅

**What**: `pages/Dashboard.tsx` chama `GET /obras/resumo`, completa os status ausentes com zero e exibe um card por status com quantidade e `moeda(valorTotal)`; erro no padrão `erro`. Tipo `ResumoStatus` em `types.ts`.
**Where**: `apps/web/src/pages/Dashboard.tsx` (+ `ResumoStatus` em `apps/web/src/types.ts`)
**Depends on**: T1, T2 (fase anterior)
**Reuses**: `api` (`lib/api.ts`), `moeda` (`lib/formato.ts`), `STATUS_FUNIL`/`rotuloPlural` (`lib/status.ts`), padrão `erro`/`carregando` de `pages/Obras.tsx`
**Requirement**: DSH-01, DSH-02, DSH-03

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] DSH-01: resposta do seed mostra "R$ 8.500,00"/1 em "Em andamento" e "R$ 14.200,00"/1 em "Aguardando cliente"; chamada a `/obras/resumo`
- [x] DSH-02: status ausentes mostram 0 e "R$ 0,00"; 5 cards na ordem do funil
- [x] Edge: resposta `[]` mostra 5 cards zerados
- [x] DSH-03: falha da API exibe a mensagem de erro
- [x] Gate check passes: `npm test --workspace apps/web`
- [x] Test count: 34 tests pass (30 + 4)

**Tests**: unit
**Gate**: quick

**Commit**: `feat(web): adiciona tela de dashboard com resumo do funil de obras`

---

### T4: Rota, aba e página inicial ✅

**What**: Rota `/dashboard` e `/` → `/dashboard` em `App.tsx`; aba "Visão geral" (primeira) em `Layout.tsx` com ícone novo em `Icone.tsx`; `Login.tsx` navega para `/` após entrar.
**Where**: `apps/web/src/App.tsx` (+ `components/Layout.tsx`, `components/Icone.tsx`, `pages/Login.tsx`)
**Depends on**: T3
**Reuses**: padrão de rotas/abas existente
**Requirement**: DSH-01

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Acessar `/` logado renderiza o Dashboard
- [x] Aba "Visao geral" aponta para `/dashboard`
- [x] Gate check passes: `npm run build --workspace apps/web && npm test --workspace apps/web`
- [x] Test count: 36 tests pass (34 + 2)

**Tests**: unit
**Gate**: build

**Commit**: `feat(web): torna o dashboard a pagina inicial e adiciona aba visao geral`

---

### T5 (fix, Verifier rodada 1): fechar mutantes M11 e M12 ✅

**What**: DSH-03 passa a dizer que os cards não aparecem na falha, com a asserção correspondente em `Dashboard.test.tsx`; `Login.test.tsx` cobre o redirect para `/` depois do login.
**Where**: `apps/web/src/pages/Dashboard.test.tsx` (+ `apps/web/src/pages/Login.test.tsx`)
**Depends on**: T4
**Requirement**: DSH-01, DSH-03

**Done when**:

- [x] Falha da API não renderiza nenhum `article` (M12)
- [x] Login bem-sucedido navega para `/` (M11)
- [x] Gate check passes: `npm test --workspace apps/web`
- [x] Test count: 37 tests pass (36 + 1)
- [x] Pós-Verifier rodada 2: teste do estado de carregamento (M16) em `Dashboard.test.tsx` + edge case no `spec.md`

**Tests**: unit
**Gate**: quick

**Commit**: `test(web): cobre cards ocultos no erro do dashboard e redirect do login`

---

## Phase Execution Map

```
Phase 1 → Phase 2

Phase 1:  T1 ------→ T2
Phase 2:  T3 ------→ T4
```

---

## Task Granularity Check

| Task | Scope | Status |
| --- | --- | --- |
| T1: lib/status | 1 módulo (+ troca de import em Obras) | ✅ Granular (coeso) |
| T2: CSS | 1 arquivo | ✅ Granular |
| T3: Dashboard | 1 página (+ 1 tipo) | ✅ Granular (coeso) |
| T4: Rota/aba | ligação da página no app (4 edições de 1–2 linhas) | ⚠️ OK — coeso, uma única mudança de navegação |

## Diagram-Definition Cross-Check

| Task | Depends On (task body) | Diagram Shows | Status |
| --- | --- | --- | --- |
| T1 | None | — | ✅ Match |
| T2 | None | — | ✅ Match |
| T3 | T1, T2 (fase anterior) | início da Fase 2 | ✅ Match |
| T4 | T3 | T3 → T4 | ✅ Match |

## Test Co-location Validation

| Task | Code Layer Created/Modified | Matrix Requires | Task Says | Status |
| --- | --- | --- | --- | --- |
| T1 | Helpers puros | unit | unit | ✅ OK |
| T2 | Estilo | none | none | ✅ OK |
| T3 | Página | unit | unit | ✅ OK |
| T4 | Roteamento/menu (+ ícone) | unit | unit | ✅ OK |
