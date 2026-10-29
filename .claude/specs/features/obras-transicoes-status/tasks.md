# Obras — Transições de Status Tasks

## Execution Protocol (MANDATORY -- do not skip)

Implement these tasks with the `tlc-spec-driven` skill: **activate it by name and follow its Execute flow and Critical Rules.** Do not search for skill files by filesystem path. The skill is the source of truth for the full flow (per-task cycle, sub-agent delegation, adequacy review, Verifier, discrimination sensor).

**If the skill cannot be activated, STOP and tell the user - do not proceed without it.**

**Commits:** o time commita manualmente. Cada task traz a mensagem sugerida em `Commit`; o agente não roda `git commit`, `git add` nem `git push`. O pacote de commit é entregue ao usuário no fim de cada fase.

---

**Design**: `.claude/specs/features/obras-transicoes-status/design.md`
**Status**: Approved (2026-10-29) — Execute adiado pelo usuário

---

## Test Coverage Matrix

> Generated from codebase, project guidelines, and spec - confirm before Execute. Guidelines found: `CLAUDE.md` ("todo service novo (ou TODO implementado) precisa de um `.spec.ts` cobrindo os cenários da spec, no estilo de `obras.service.spec.ts`"), `apps/api/package.json` (jest `.*\.spec\.ts$`; `test:e2e` com `test/jest-e2e.json`), `apps/web/src/**/*.test.tsx` (Testing Library), `.github/workflows/ci.yml` (test + build; sem script de lint nos workspaces). Decisão do usuário (2026-10-29): unit + 1 e2e no Postgres do Docker.

| Code Layer | Required Test Type | Coverage Expectation | Location Pattern | Run Command |
| --- | --- | --- | --- | --- |
| Tabela de transições (função pura) | unit | Toda ação × todo status (origem válida e inválida) e o texto exato da mensagem | `apps/api/src/obras/transicoes-obra.spec.ts` | `npm run test --workspace apps/api` |
| Service (API) | unit (Prisma mockado, `$transaction` executando o callback) | Todos os ramos; 1:1 com os ACs TRN da task; todo edge case listado (404, repetição, rollback, corrida com `count === 0`, conclusão sem equipe) | `apps/api/src/obras/obras.service.spec.ts` | `npm run test --workspace apps/api` |
| DTO | unit (`plainToInstance` + `validate()` com `whitelist` e `forbidNonWhitelisted`) | Cada restrição da spec (`status` proibido; motivo ausente, < 3, > 500, trim) | `apps/api/src/obras/dto/*.spec.ts` | `npm run test --workspace apps/api` |
| Controller (API) | none | Controller fino só delega (padrão do repo: nenhum teste de controller); as rotas são exercitadas pelo e2e | - | build gate |
| Rotas HTTP + banco (concorrência, `status` no corpo) | e2e (Postgres do Docker, dados `[e2e]` apagados no `afterAll`) | TRN-06 e TRN-07 de ponta a ponta: 400 por `status` no `POST`/`PATCH`, dois `concluir` em paralelo → um 200, um 400, créditos exatos | `apps/api/test/*.e2e-spec.ts` | `docker exec gesso_api npm run test:e2e` |
| Schema / migration | none | build gate + `prisma migrate dev` aplicada | - | build gate |
| Helper (web) | unit | Mapa de ação por status e texto exato da confirmação (com e sem equipe) | `apps/web/src/lib/*.test.ts` | `npm run test --workspace apps/web` |
| Componente / página (web) | unit (Testing Library, `api` e `window.confirm` mockados) | Todo AC de UI da task: botões por status, desabilitado sem equipe, confirmação aceita/recusada, ocupado, erro, recarga, formulário de cancelamento | `apps/web/src/**/*.test.tsx` | `npm run test --workspace apps/web` |

## Gate Check Commands

> Generated from codebase - confirm before Execute.

| Gate Level | When to Use | Command |
| --- | --- | --- |
| Quick | Tasks com testes unitários de um workspace | `npm run test --workspace apps/api` ou `npm run test --workspace apps/web` (o do workspace tocado) |
| Full | Task do e2e e fim de fase da API | `npm run test --workspace apps/api && docker exec gesso_api npm run test:e2e` |
| Build | Schema, controller, fim de fase | `npm run build && npm test` (raiz: build de API e web, depois as duas suítes) |

Base antes da feature: API 236 testes, web 137 (branch `feat/obras-transicoes-status` em `cc27963`). Nenhuma task pode terminar com menos testes do que começou.

---

## Execution Plan

Phases are ordered and run sequentially - each phase completes before the next begins, and tasks within a phase execute in order.

### Phase 1: Fundação da API

Regra pura, campo novo e DTOs. Nenhuma task depende de outra.

```
T1
T2
T3
T4
```

### Phase 2: Transições no service, rotas e e2e

```
T5 → T6
T5 → T7
T5 → T8
T9
T6 → T10
T7 → T10
T8 → T10
T10 → T11
```

### Phase 3: Front

```
T12 → T13 → T14 → T15
```

---

## Task Breakdown

### Phase 1: Fundação da API

#### T1: Tabela de transições e mensagem padrão

**What**: Criar `TRANSICOES` (`fechar`: `ORCAMENTO → FECHADA`; `iniciar`: `FECHADA → ANDAMENTO`; `concluir`: `ANDAMENTO → CONCLUIDA`; `cancelar`: `ORCAMENTO|FECHADA|ANDAMENTO → CANCELADA`), `type AcaoObra` e `mensagemTransicaoInvalida(acao, status)` → `Não é possível <acao> uma obra com status <STATUS>`.
**Where**: `apps/api/src/obras/transicoes-obra.ts`
**Depends on**: None
**Reuses**: enum `StatusObra` do Prisma
**Requirement**: TRN-04 (base de TRN-01, TRN-03, TRN-09)

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] `transicoes-obra.spec.ts` cobre as 4 ações × 5 status: origem aceita só onde a spec manda, e destino certo
- [ ] Mensagem exata com acento, para cada ação (ex.: `Não é possível concluir uma obra com status CONCLUIDA`)
- [ ] Gate check passes: `npm run test --workspace apps/api`
- [ ] Test count: API ≥ 236 + novos, nenhum removido

**Tests**: unit
**Gate**: quick

**Commit**: `feat(obras): adiciona tabela de transicoes de status da obra`

---

#### T2: Campo `motivoCancelamento` na obra

**What**: Acrescentar `motivoCancelamento String?` ao model `Obra` e gerar a migration `obra_motivo_cancelamento` (só `ADD COLUMN`, nullable).
**Where**: `apps/api/prisma/schema.prisma`
**Depends on**: None
**Reuses**: fluxo de migration do README (`docker compose exec api npx prisma migrate dev --name ...`)
**Requirement**: TRN-09

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Migration criada em `apps/api/prisma/migrations/` e aplicada no banco local, sem perder dados (obras do seed e "Moldura - Bairro Centro" continuam lá)
- [ ] Prisma Client regenerado no container (`gesso_api` reiniciado e `/api/health` 200)
- [ ] Gate check passes: `npm run build && npm test`

**Tests**: none
**Gate**: build

**Commit**: `feat(db): adiciona motivo do cancelamento na obra`

---

#### T3: `status` fora do `CreateObraDto` (e do `UpdateObraDto`)

**What**: Remover o campo `status` do `CreateObraDto`; o `UpdateObraDto` herda a remoção. Obra nova nasce com o default `ORCAMENTO` do schema.
**Where**: `apps/api/src/obras/dto/create-obra.dto.ts`
**Depends on**: None
**Reuses**: `ValidationPipe` global com `forbidNonWhitelisted` (`apps/api/src/main.ts:18`)
**Requirement**: TRN-06

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] `dto/obra-status.dto.spec.ts`: `validate()` com `whitelist` + `forbidNonWhitelisted` dá erro em `status` para `CreateObraDto` e `UpdateObraDto`; corpo válido sem `status` passa nos dois (P1 Atalhos AC1–4)
- [ ] Teste de service: `create` sem `status` não grava `status` explícito (o default do schema vale)
- [ ] Gate check passes: `npm run test --workspace apps/api`
- [ ] Test count: nenhum removido

**Tests**: unit
**Gate**: quick

**Commit**: `fix(obras): remove status dos dtos de criacao e edicao da obra`

---

#### T4: `CancelarObraDto`

**What**: DTO com `motivo: string`: `@Transform` de trim, `@IsString()`, `@Length(3, 500)`, com `@ApiProperty`.
**Where**: `apps/api/src/obras/dto/cancelar-obra.dto.ts`
**Depends on**: None
**Reuses**: estilo dos DTOs de `create-obra.dto.ts`
**Requirement**: TRN-09

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] `dto/cancelar-obra.dto.spec.ts`: motivo ausente, `"  ab  "` (2 depois do trim) e 501 caracteres falham; 3 e 500 passam; `"  Cliente desistiu  "` vira `"Cliente desistiu"` (P2 AC1, AC3)
- [ ] Gate check passes: `npm run test --workspace apps/api`

**Tests**: unit
**Gate**: quick

**Commit**: `feat(obras): adiciona dto de cancelamento com motivo`

---

### Phase 2: Transições no service, rotas e e2e

#### T5: `transicionar()` e `concluir()` sobre ele

**What**: Método privado `transicionar(acao, id, { dados?, validar?, depois? })` com o fluxo do design (lê na `$transaction` → 404 → origem inválida 400 → `validar` → `updateMany` condicional → `count === 0` relê e 400 → `depois(tx, obra)` → devolve a obra com o `include` padrão). `concluir()` passa a usá-lo: grava `dataConclusao` e cria um `CREDITO` por gesseiro, lendo a equipe dentro da transação.
**Where**: `apps/api/src/obras/obras.service.ts`
**Depends on**: None
**Reuses**: `include`, `createMany` de créditos atual (`obras.service.ts:171-181`), `transicoes-obra.ts` (T1)
**Requirement**: TRN-03, TRN-04, TRN-07 (lado unitário)

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] `obras.service.spec.ts` (mock ganha `updateMany` e `obraGesseiro`): concluir `ANDAMENTO` com 2 gesseiros → `updateMany` com `where: { id, status: { in: ['ANDAMENTO'] } }`, `dataConclusao`, 2 `CREDITO` com o `valorCombinado` (P1 AC4)
- [ ] Concluir a partir de `ORCAMENTO`, `FECHADA`, `CONCLUIDA` e `CANCELADA` → 400 com a mensagem exata, sem `updateMany` e sem `createMany` (P1 AC5, edge de repetição)
- [ ] Corrida: `updateMany` devolve `count: 0` e a releitura mostra `CONCLUIDA` → 400 `Não é possível concluir uma obra com status CONCLUIDA`, sem `createMany`
- [ ] `createMany` rejeita → o erro propaga pela transação (rollback, edge case)
- [ ] `ANDAMENTO` sem equipe → conclui sem `createMany` (edge case)
- [ ] Obra inexistente → 404 `Obra <id> nao encontrada`
- [ ] Os testes antigos de `concluir` passam com a mensagem nova (o "nao credita duas vezes" passa a esperar `Não é possível concluir uma obra com status CONCLUIDA`)
- [ ] Gate check passes: `npm run test --workspace apps/api`
- [ ] Test count: nenhum removido

**Tests**: unit
**Gate**: quick

**Commit**: `fix(obras): conclui obra so a partir de andamento, com transicao atomica`

---

#### T6: `fechar()`

**What**: `fechar(id)` = `transicionar('fechar', id)`.
**Where**: `apps/api/src/obras/obras.service.ts`
**Depends on**: T5
**Reuses**: `transicionar()`
**Requirement**: TRN-01

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] `ORCAMENTO` → `updateMany` para `FECHADA` e devolve a obra (P1 AC1)
- [ ] `FECHADA`, `ANDAMENTO`, `CONCLUIDA`, `CANCELADA` → 400 `Não é possível fechar uma obra com status <STATUS>`, sem `updateMany`
- [ ] Gate check passes: `npm run test --workspace apps/api`

**Tests**: unit
**Gate**: quick

**Commit**: `feat(obras): adiciona transicao de fechar a obra`

---

#### T7: `iniciar()`

**What**: `iniciar(id)` = `transicionar('iniciar', id, { dados: { dataInicio: agora }, validar: exige ≥ 1 gesseiro })`.
**Where**: `apps/api/src/obras/obras.service.ts`
**Depends on**: T5
**Reuses**: `transicionar()`
**Requirement**: TRN-02

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] `FECHADA` com 1 gesseiro → `ANDAMENTO` com `dataInicio` igual ao instante da chamada (relógio fixo no teste) (P1 AC2)
- [ ] `FECHADA` sem gesseiro → 400 `A obra precisa de pelo menos um gesseiro alocado para ser iniciada`, sem `updateMany` (P1 AC3)
- [ ] `ORCAMENTO` sem gesseiro → 400 de transição inválida (a origem vem antes da equipe)
- [ ] Demais status → 400 `Não é possível iniciar uma obra com status <STATUS>`
- [ ] Gate check passes: `npm run test --workspace apps/api`

**Tests**: unit
**Gate**: quick

**Commit**: `feat(obras): adiciona transicao de iniciar a obra com equipe obrigatoria`

---

#### T8: `cancelar()`

**What**: `cancelar(id, motivo)` = `transicionar('cancelar', id, { dados: { motivoCancelamento: motivo } })`, sem criar lançamento.
**Where**: `apps/api/src/obras/obras.service.ts`
**Depends on**: T5
**Reuses**: `transicionar()`, campo da T2, DTO da T4
**Requirement**: TRN-09

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] `ORCAMENTO`, `FECHADA` e `ANDAMENTO` → `CANCELADA` com `motivoCancelamento` gravado (P2 AC1)
- [ ] Nenhum `lancamento.createMany`/`create`/`update`/`delete` chamado (P2 AC2)
- [ ] `CONCLUIDA` e `CANCELADA` → 400 `Não é possível cancelar uma obra com status <STATUS>` (P2 AC4)
- [ ] Gate check passes: `npm run test --workspace apps/api`

**Tests**: unit
**Gate**: quick

**Commit**: `feat(obras): adiciona cancelamento de obra com motivo`

---

#### T9: `removerGesseiro()` com 404 e remoção livre em obra aberta

**What**: Ler a obra (`findOne`, 404) e a alocação antes de apagar; alocação inexistente → 404 `Gesseiro <gesseiroId> não está alocado nesta obra`. Nenhuma regra de status nova: remover o último gesseiro de obra `ANDAMENTO` continua permitido.
**Where**: `apps/api/src/obras/obras.service.ts`
**Depends on**: None
**Reuses**: `findOne`
**Requirement**: TRN-08, TRN-12

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Último gesseiro de obra `ANDAMENTO` é removido (`delete` chamado) — regressão da decisão do usuário (P1 Atalhos AC6)
- [ ] Remoção em `ORCAMENTO` e `FECHADA` continua funcionando
- [ ] Gesseiro não alocado → 404 com a mensagem exata, sem `delete` (P1 Atalhos AC7)
- [ ] Obra inexistente → 404 `Obra <id> nao encontrada`
- [ ] Gate check passes: `npm run test --workspace apps/api`

**Tests**: unit
**Gate**: quick

**Commit**: `fix(obras): responde 404 ao remover gesseiro nao alocado na obra`

---

#### T10: Rotas `/fechar`, `/iniciar` e `/cancelar`

**What**: `PATCH :id/fechar`, `PATCH :id/iniciar` e `PATCH :id/cancelar` (corpo `CancelarObraDto`), com `@ApiOperation`; só delegam ao service.
**Where**: `apps/api/src/obras/obras.controller.ts`
**Depends on**: T6, T7, T8
**Reuses**: padrão do `PATCH :id/concluir` (`obras.controller.ts:83`)
**Requirement**: TRN-01, TRN-02, TRN-09

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] As três rotas aparecem no Swagger (`/docs`) depois de `docker restart gesso_api`
- [ ] Gate check passes: `npm run build && npm test`

**Tests**: none
**Gate**: build

**Commit**: `feat(obras): expoe rotas de fechar, iniciar e cancelar obra`

---

#### T11: e2e de concorrência e de `status` no corpo

**What**: `obras-transicoes.e2e-spec.ts`: faz login com o admin do seed, cria um gesseiro e uma obra `[e2e]`, leva a obra até `ANDAMENTO` pelas rotas, dispara dois `PATCH /concluir` em paralelo e confere um 200 + um 400 e exatamente 1 `CREDITO` por gesseiro no banco. Também confere 400 em `POST /obras` com `status` e em `PATCH /obras/:id` com `status`. Limpeza num `afterAll` que roda mesmo com falha, apagando só registros com prefixo `[e2e]` (lançamentos → obras → gesseiros).
**Where**: `apps/api/test/obras-transicoes.e2e-spec.ts`
**Depends on**: T10
**Reuses**: `test/app.e2e-spec.ts` (sobe o `AppModule`), `PrismaService` para conferir e limpar
**Requirement**: TRN-06, TRN-07

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] `docker exec gesso_api npm run test:e2e` passa (inclui os 2 testes antigos)
- [ ] Depois de rodar: zero obras, gesseiros e lançamentos com `[e2e]` no banco (conferido por `psql`)
- [ ] Gate check passes: `npm run test --workspace apps/api && docker exec gesso_api npm run test:e2e`

**Tests**: e2e
**Gate**: full

**Commit**: `test(obras): adiciona e2e de conclusao concorrente e status bloqueado no corpo`

---

### Phase 3: Front

#### T12: Tipo da obra e helpers de status

**What**: `Obra.motivoCancelamento?: string | null` em `types.ts`; em `lib/status.ts`, `acaoDeAvanco` (`ORCAMENTO` → `fechar`/"Cliente aprovou", `FECHADA` → `iniciar`/"Iniciar obra", `ANDAMENTO` → `concluir`/"Concluir obra") e `textoConfirmacaoConclusao(obra)` (uma linha `<nome> — <moeda(valorCombinado)>` por gesseiro, ou `Nenhum gesseiro alocado: nenhum crédito será gerado.`).
**Where**: `apps/web/src/lib/status.ts`
**Depends on**: None
**Reuses**: `moeda()` de `lib/formato.ts`, `rotulo` de `lib/status.ts`
**Requirement**: TRN-05, TRN-11

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] `lib/status.test.ts`: ação de cada status (nenhuma em `CONCLUIDA`/`CANCELADA`); texto com 2 gesseiros (nomes e valores em BRL) e texto exato sem equipe (P1 AC10)
- [ ] `types.ts` atualizado (mudança de tipo, coberta pelo build)
- [ ] Gate check passes: `npm run test --workspace apps/web`

**Tests**: unit
**Gate**: quick

**Commit**: `feat(web): adiciona acao de avanco e texto de confirmacao da conclusao`

---

#### T13: `AcoesStatusObra` — avanço no funil

**What**: Componente com o botão de avanço do status atual; "Iniciar obra" desabilitado sem equipe, com "Aloque pelo menos um gesseiro para iniciar" abaixo; "Concluir obra" com `window.confirm(textoConfirmacaoConclusao(obra))`; botões desabilitados durante a chamada; sucesso → `onAlterada()`, erro → `onErro(mensagem)`.
**Where**: `apps/web/src/components/AcoesStatusObra.tsx`
**Depends on**: T12
**Reuses**: `api.patch`, classes `.btn`/`.card-acoes`
**Requirement**: TRN-05, TRN-11

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] `AcoesStatusObra.test.tsx`: rótulo certo por status e nenhum em `CONCLUIDA`/`CANCELADA` (P1 AC6)
- [ ] `FECHADA` sem gesseiro: botão desabilitado + texto exato; com gesseiro: habilitado e chama `PATCH /obras/:id/iniciar` (P1 AC6)
- [ ] "Concluir obra": `confirm` recebe o texto com nomes e valores; recusado → nenhuma chamada; aceito → `PATCH /obras/:id/concluir` (P1 AC7, AC10)
- [ ] Durante a chamada os botões ficam desabilitados (edge case); sucesso chama `onAlterada`; erro chama `onErro` com a mensagem da API (P1 AC8, AC9)
- [ ] Gate check passes: `npm run test --workspace apps/web`

**Tests**: unit
**Gate**: quick

**Commit**: `feat(web): adiciona acoes de avanco da obra no funil`

---

#### T14: `AcoesStatusObra` — cancelar com motivo

**What**: Ação "Cancelar obra" em `ORCAMENTO`/`FECHADA`/`ANDAMENTO` que abre no card um formulário com "Motivo" obrigatório; envia `PATCH /obras/:id/cancelar` com `{ motivo }`; erro aparece no formulário e o motivo digitado fica.
**Where**: `apps/web/src/components/AcoesStatusObra.tsx`
**Depends on**: T13
**Reuses**: padrão de formulário e `.erro` dos forms em `components/forms/`
**Requirement**: TRN-10

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] "Cancelar obra" só aparece nos 3 status em aberto e abre o formulário (P2 AC5)
- [ ] Motivo válido → `PATCH /obras/:id/cancelar` com `{ motivo }` e `onAlterada` (P2 AC6)
- [ ] Erro da API → mensagem dentro do formulário, motivo preservado, `onErro` não chamado (P2 AC7)
- [ ] Gate check passes: `npm run test --workspace apps/web`

**Tests**: unit
**Gate**: quick

**Commit**: `feat(web): adiciona cancelamento de obra com motivo no card`

---

#### T15: `Obras.tsx` usa `AcoesStatusObra` e mostra o motivo

**What**: Trocar o bloco do "Concluir obra" (`Obras.tsx:155-165`) por `<AcoesStatusObra obra onAlterada={carregar} onErro={setErro} />` e mostrar "Motivo do cancelamento: …" no card `CANCELADA`.
**Where**: `apps/web/src/pages/Obras.tsx`
**Depends on**: T14
**Reuses**: `carregar()` e `erro` da página
**Requirement**: TRN-05, TRN-10

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] `Obras.test.tsx`: transição com sucesso recarrega com o filtro atual (`GET /obras?status=...`) (P1 AC8)
- [ ] Erro de transição aparece no `erro` da página e o card fica como estava (P1 AC9)
- [ ] Card `CANCELADA` mostra o motivo (P2 AC8)
- [ ] Gate check passes: `npm run build && npm test`
- [ ] Teste manual: o Independent Test da P1 e da P2 pela UI (`gesso_web` reiniciado)

**Tests**: unit
**Gate**: build

**Commit**: `feat(web): leva a obra pelo funil na tela de obras`

---

## Phase Execution Map

```
Phase 1 → Phase 2 → Phase 3

Phase 1:  T1   T2   T3   T4            (independentes)
Phase 2:  T5 → T6 ┐
          T5 → T7 ├→ T10 → T11
          T5 → T8 ┘
          T9                           (independente)
Phase 3:  T12 → T13 → T14 → T15
```

Execução sequencial: uma task por vez, na ordem T1 → T15. São 15 tasks: no Execute, ofereço sub-agentes em 3 lotes (Fase 1 = 4 tasks; Fase 2 = 7; Fase 3 = 4), um depois do outro.

---

## Task Granularity Check

| Task | Scope | Status |
| --- | --- | --- |
| T1: Tabela de transições | 1 arquivo puro | ✅ Granular |
| T2: Campo `motivoCancelamento` | 1 campo + migration gerada | ✅ Granular |
| T3: `status` fora do DTO | 1 campo removido | ✅ Granular |
| T4: `CancelarObraDto` | 1 DTO | ✅ Granular |
| T5: `transicionar()` + `concluir()` | 1 método privado + o método que ele substitui | ⚠️ 2 coesos no mesmo arquivo (o `concluir` é o primeiro uso do `transicionar`) |
| T6: `fechar()` | 1 método | ✅ Granular |
| T7: `iniciar()` | 1 método | ✅ Granular |
| T8: `cancelar()` | 1 método | ✅ Granular |
| T9: `removerGesseiro()` | 1 método | ✅ Granular |
| T10: 3 rotas | 1 arquivo, 3 delegações de 1 linha | ⚠️ 3 coesos no mesmo arquivo |
| T11: e2e | 1 arquivo de teste | ✅ Granular |
| T12: helpers de status | 2 funções no mesmo arquivo + 1 campo de tipo | ⚠️ coesos |
| T13: avanço | 1 componente | ✅ Granular |
| T14: cancelar | 1 formulário no mesmo componente | ✅ Granular |
| T15: integração na página | 1 página | ✅ Granular |

## Diagram-Definition Cross-Check

| Task | Depends On (task body) | Diagram Shows | Status |
| --- | --- | --- | --- |
| T1 | None | (sem seta) | ✅ Match |
| T2 | None | (sem seta) | ✅ Match |
| T3 | None | (sem seta) | ✅ Match |
| T4 | None | (sem seta) | ✅ Match |
| T5 | None (T1 é da fase anterior) | (sem seta de entrada) | ✅ Match |
| T6 | T5 | T5 → T6 | ✅ Match |
| T7 | T5 | T5 → T7 | ✅ Match |
| T8 | T5 | T5 → T8 | ✅ Match |
| T9 | None | (sem seta) | ✅ Match |
| T10 | T6, T7, T8 | T6 → T10, T7 → T10, T8 → T10 | ✅ Match |
| T11 | T10 | T10 → T11 | ✅ Match |
| T12 | None | (sem seta de entrada) | ✅ Match |
| T13 | T12 | T12 → T13 | ✅ Match |
| T14 | T13 | T13 → T14 | ✅ Match |
| T15 | T14 | T14 → T15 | ✅ Match |

## Test Co-location Validation

| Task | Code Layer Created/Modified | Matrix Requires | Task Says | Status |
| --- | --- | --- | --- | --- |
| T1 | Tabela de transições | unit | unit | ✅ OK |
| T2 | Schema / migration | none | none | ✅ OK |
| T3 | DTO | unit | unit | ✅ OK |
| T4 | DTO | unit | unit | ✅ OK |
| T5 | Service | unit | unit | ✅ OK |
| T6 | Service | unit | unit | ✅ OK |
| T7 | Service | unit | unit | ✅ OK |
| T8 | Service | unit | unit | ✅ OK |
| T9 | Service | unit | unit | ✅ OK |
| T10 | Controller | none | none | ✅ OK |
| T11 | Rotas HTTP + banco | e2e | e2e | ✅ OK |
| T12 | Helper (web) | unit | unit | ✅ OK |
| T13 | Componente (web) | unit | unit | ✅ OK |
| T14 | Componente (web) | unit | unit | ✅ OK |
| T15 | Página (web) | unit | unit | ✅ OK |

---

## Requirement Traceability (tasks)

| Requirement | Tasks |
| --- | --- |
| TRN-01 | T1, T6, T10 |
| TRN-02 | T7, T10 |
| TRN-03 | T1, T5 |
| TRN-04 | T1, T5, T6, T7, T8 |
| TRN-05 | T12, T13, T15 |
| TRN-06 | T3, T11 |
| TRN-07 | T5, T11 |
| TRN-08 | T9 |
| TRN-09 | T2, T4, T8, T10 |
| TRN-10 | T14, T15 |
| TRN-11 | T12, T13 |
| TRN-12 | T9 |

12 de 12 requisitos mapeados.
