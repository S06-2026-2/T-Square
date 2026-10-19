# Front — Formulários Tasks

## Execution Protocol (MANDATORY -- do not skip)

Implement these tasks with the `tlc-spec-driven` skill: **activate it by name and follow its Execute flow and Critical Rules.** Do not search for skill files by filesystem path. The skill is the source of truth for the full flow (per-task cycle, sub-agent delegation, adequacy review, Verifier, discrimination sensor).

**If the skill cannot be activated, STOP and tell the user - do not proceed without it.**

> Projeto: o time commita manualmente. Ao final de cada task, o agente **propõe** a mensagem de commit (Conventional Commits) e não executa `git commit` sem pedido explícito.

---

**Design**: `.claude/specs/features/front-formularios/design.md`
**Status**: Done (Fases 1–4 verificadas pelo Verifier; testes manuais de T6, T9 e T12 pendentes)

---

## Test Coverage Matrix

> Generated from codebase, project guidelines, and spec - confirm before Execute. Guidelines found: `CLAUDE.md` (seção Testes: todo código novo com teste cobrindo os cenários da spec), `apps/web/jest.config.cjs` (sem threshold de cobertura), `.github/workflows` (CI roda `test` e `build` de `apps/web`), amostra `apps/web/src/components/StatusBadge.test.tsx`. Strong defaults applied where silent.

| Code Layer | Required Test Type | Coverage Expectation | Location Pattern | Run Command |
| --- | --- | --- | --- | --- |
| Helpers puros (`lib/corpo.ts`) | unit | Todas as branches (vazio, espaços, número, texto); 1:1 com FRM-12 | `apps/web/src/lib/*.test.ts` | `npm test --workspace apps/web` |
| Hook (`lib/useEnvio.ts`) | unit | Sucesso, erro com `ApiError`, erro genérico, `enviando` durante e depois (FRM-10/11) | `apps/web/src/lib/*.test.ts` | `npm test --workspace apps/web` |
| Componente de formulário (`components/forms/*`) | unit (component, `lib/api` mockado via `jest.mock` com factory, `fireEvent`) | Cada AC da story do form + FRM-10 (erro preserva dados), FRM-11 (botão desabilitado), FRM-12 (corpo exato enviado em `api.post`) | `apps/web/src/components/forms/*.test.tsx` | `npm test --workspace apps/web` |
| Página (`pages/*`) | unit (component, `lib/api` mockado) | Comportamentos de integração da spec que vivem na página: reset de filtro (FRM-01), form de alocação oculto em obra finalizada (FRM-05 AC3), form de lançamento só com extrato aberto (FRM-07 AC3), re-fetch após `onSalvo` | `apps/web/src/pages/*.test.tsx` | `npm test --workspace apps/web` |
| Estilo (`index.css`) | none | - (build gate only) | - | build gate only |

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

Helpers compartilhados e estilo. Sem dependências entre si.

```
T1
T2
T3
```

### Phase 2: Obras (P1 / MVP)

```
T1 → T4
T2 → T4
T1 → T5
T2 → T5
T3 → T6
T4 → T6
T5 → T6
```

### Phase 3: Gesseiros (P2)

```
T1 → T7
T2 → T7
T1 → T8
T2 → T8
T3 → T9
T7 → T9
T8 → T9
```

### Phase 4: Estoque (P2) — liberada (backend implementado no commit `af03bd2`)

A fase só fecha depois do Independent Test manual com o backend real.

```
T1 → T10
T2 → T10
T1 → T11
T2 → T11
T3 → T12
T10 → T12
T11 → T12
```

---

## Task Breakdown

### T1: Criar helpers de montagem de corpo ✅

**What**: `numero`, `numeroOpcional`, `textoOpcional`, `semVazios` conforme design.
**Where**: `apps/web/src/lib/corpo.ts`
**Depends on**: None
**Reuses**: —
**Requirement**: FRM-12

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] `numeroOpcional('')` e `numeroOpcional('  ')` retornam `undefined`; `numeroOpcional('2.5')` retorna `2.5`
- [x] `textoOpcional('  ')` retorna `undefined`; `textoOpcional(' a ')` retorna `'a'`
- [x] `semVazios` remove só chaves `undefined` (mantém `0` e `false`)
- [x] `corpo.test.ts` co-localizado cobre os casos acima
- [x] Gate check passes: `npm test --workspace apps/web`
- [x] Test count: testes existentes + novos passam (nenhuma remoção)

**Tests**: unit
**Gate**: quick

**Commit**: `feat(web): adiciona helpers de montagem do corpo dos formularios`

---

### T2: Criar hook useEnvio ✅

**What**: Hook `useEnvio()` com `enviando`, `erro`, `enviar(fn)` retornando `boolean`.
**Where**: `apps/web/src/lib/useEnvio.ts`
**Depends on**: None
**Reuses**: padrão `e instanceof Error ? e.message : ...` das páginas
**Requirement**: FRM-10, FRM-11

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] `enviando` é `true` enquanto `fn` não resolve e `false` depois (sucesso e erro)
- [x] Erro guarda `message` e `enviar` resolve `false`; sucesso zera `erro` e resolve `true`
- [x] `useEnvio.test.ts` usa `renderHook` de `@testing-library/react`
- [x] Gate check passes: `npm test --workspace apps/web`
- [x] Test count: anteriores + novos passam

**Tests**: unit
**Gate**: quick

**Commit**: `feat(web): adiciona hook useEnvio para estado de submit`

---

### T3: Estilos de formulário ✅

**What**: Estilo para `select`/`textarea` (igual a `input`) e classe `.formulario` (grid com gap).
**Where**: `apps/web/src/index.css`
**Depends on**: None
**Reuses**: variáveis `--borda`, `--raio`, `--texto` já existentes
**Requirement**: FRM-01

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Build passa: `npm run build --workspace apps/web && npm test --workspace apps/web`

**Tests**: none
**Gate**: build

**Commit**: `style(web): adiciona estilos base de formulario`

---

### T4: NovaObraForm ✅

**What**: Componente de criação de obra com pagamento, planta baixa e linhas de equipe, mais a função pura exportada `montarCorpoObra`.
**Where**: `apps/web/src/components/forms/NovaObraForm.tsx`
**Depends on**: T1, T2
**Reuses**: `lib/corpo.ts`, `lib/useEnvio.ts`, `api.post`, tipos `FormaPagamento`/`Gesseiro`
**Requirement**: FRM-01, FRM-02, FRM-03, FRM-04, FRM-10, FRM-11, FRM-12

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Submit válido chama `api.post('/obras', corpo)` com `valorTotal` numérico, chama `onSalvo` e limpa os campos (FRM-01)
- [x] Sem forma de pagamento, o corpo não tem `pagamento`; com forma, ele contém `{ forma, parcelas?, valorEntrada? }` numéricos (FRM-02)
- [x] `plantaBaixaUrl` é enviada quando preenchida e omitida quando vazia; os opcionais vazios são omitidos (FRM-03)
- [x] Os selects de equipe listam só ativos e escondem o gesseiro já escolhido em outra linha; o corpo não contém a chave interna da linha; sem linhas, não há `gesseiros` (FRM-04)
- [x] Com `api.post` rejeitando, a mensagem aparece e os valores digitados continuam nos inputs (FRM-10)
- [x] O botão fica `disabled` enquanto a promise está pendente (FRM-11)
- [x] `NovaObraForm.test.tsx` cobre todos os itens acima, com `jest.mock('../../lib/api', factory)`; o padrão de mock é validado aqui (ver Risks no design)
- [x] Gate check passes: `npm test --workspace apps/web`
- [x] Test count: anteriores + novos passam

**Tests**: unit
**Gate**: quick

**Commit**: `feat(web): adiciona formulario de nova obra`

---

### T5: AlocarGesseiroForm ✅

**What**: Componente que aloca/atualiza gesseiro numa obra existente.
**Where**: `apps/web/src/components/forms/AlocarGesseiroForm.tsx`
**Depends on**: T1, T2
**Reuses**: `lib/corpo.ts`, `lib/useEnvio.ts`, `api.post`
**Requirement**: FRM-05, FRM-10, FRM-11, FRM-12

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Submit chama `api.post('/obras/<obraId>/gesseiros', { gesseiroId, valorCombinado: number, funcao? })` e chama `onSalvo` (FRM-05 AC1/AC2: o mesmo corpo serve para o upsert)
- [x] O select só lista gesseiros ativos (AD-004)
- [x] Um erro 404 mostra a mensagem, não chama `onSalvo` e preserva os campos (FRM-05 AC4, FRM-10)
- [x] O botão fica desabilitado durante o envio (FRM-11)
- [x] `AlocarGesseiroForm.test.tsx` cobre os itens acima
- [x] Gate check passes: `npm test --workspace apps/web`
- [x] Test count: anteriores + novos passam

**Tests**: unit
**Gate**: quick

**Commit**: `feat(web): adiciona formulario de alocacao de gesseiro`

---

### T6: Integrar formulários em Obras.tsx ✅

**What**: Busca de gesseiros, botão "Nova obra" com `NovaObraForm`, `AlocarGesseiroForm` por card em status aberto, e `onSalvo` com reset de filtro e re-fetch.
**Where**: `apps/web/src/pages/Obras.tsx`
**Depends on**: T3, T4, T5
**Reuses**: `carregar()`, `filtro` existentes
**Requirement**: FRM-01, FRM-05

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Depois de criar com o filtro "Fechadas" ativo, o filtro vira "Todas" e `GET /obras` é chamado sem `?status`. Com o filtro já em "Todas", `GET /obras` é chamado de novo (FRM-01)
- [x] Cards `CONCLUIDA`/`CANCELADA` não renderizam o formulário de alocação; `ORCAMENTO`/`FECHADA`/`ANDAMENTO` renderizam (FRM-05 AC3)
- [x] Depois da alocação, a lista é recarregada (FRM-05 AC1)
- [x] O TODO do cabeçalho foi removido
- [x] `Obras.test.tsx` cobre os itens acima (API mockada)
- [x] Gate check passes: `npm run build --workspace apps/web && npm test --workspace apps/web`
- [x] Test count: anteriores + novos passam
- [ ] Manual: Independent Tests de FRM-01 e FRM-05 com `docker compose up`

**Tests**: unit
**Gate**: build

**Commit**: `feat(web): integra formularios de obra e alocacao na tela de obras`

---

### T7: NovoGesseiroForm ✅

**What**: Componente de cadastro de gesseiro.
**Where**: `apps/web/src/components/forms/NovoGesseiroForm.tsx`
**Depends on**: T1, T2
**Reuses**: `lib/corpo.ts`, `lib/useEnvio.ts`, `api.post`
**Requirement**: FRM-06, FRM-10, FRM-11, FRM-12

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Submit chama `api.post('/gesseiros', { nome, telefone?, chavePix? })`, omitindo opcionais vazios, chama `onSalvo` e limpa os campos (FRM-06)
- [x] `nome` tem `required` e `minLength=3`
- [x] Erro preserva os dados; botão desabilitado durante o envio (FRM-10/11)
- [x] `NovoGesseiroForm.test.tsx` cobre os itens acima
- [x] Gate check passes: `npm test --workspace apps/web`
- [x] Test count: anteriores + novos passam

**Tests**: unit
**Gate**: quick

**Commit**: `feat(web): adiciona formulario de cadastro de gesseiro`

---

### T8: LancamentoForm ✅

**What**: Componente de registro de vale/pagamento.
**Where**: `apps/web/src/components/forms/LancamentoForm.tsx`
**Depends on**: T1, T2
**Reuses**: `lib/corpo.ts`, `lib/useEnvio.ts`, `api.post`
**Requirement**: FRM-07, FRM-10, FRM-11, FRM-12

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] O select de tipo tem exatamente as opções `VALE` e `PAGAMENTO`, sem `CREDITO` (FRM-07 AC2)
- [x] Submit chama `api.post('/gesseiros/<id>/lancamentos', { tipo, valor: number, descricao? })` e `onSalvo` (FRM-07 AC1)
- [x] Erro preserva os dados; botão desabilitado durante o envio (FRM-07 AC4, FRM-10/11)
- [x] `LancamentoForm.test.tsx` cobre os itens acima
- [x] Gate check passes: `npm test --workspace apps/web`
- [x] Test count: anteriores + novos passam

**Tests**: unit
**Gate**: quick

**Commit**: `feat(web): adiciona formulario de vale e pagamento`

---

### T9: Integrar formulários em Gesseiros.tsx ✅

**What**: Extrai `carregar()`, renderiza `NovoGesseiroForm` no cabeçalho e `LancamentoForm` dentro do extrato, com re-fetch do extrato no `onSalvo`.
**Where**: `apps/web/src/pages/Gesseiros.tsx`
**Depends on**: T3, T7, T8
**Reuses**: `abrirExtrato()` existente
**Requirement**: FRM-06, FRM-07

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Depois do cadastro, `GET /gesseiros` é chamado de novo (FRM-06 AC1)
- [x] Sem extrato aberto, o formulário de lançamento não aparece (FRM-07 AC3)
- [x] Depois de um lançamento, `GET /gesseiros/<id>/extrato` é chamado de novo (FRM-07 AC1)
- [x] O TODO do cabeçalho foi removido
- [x] `Gesseiros.test.tsx` cobre os itens acima
- [x] Gate check passes: `npm run build --workspace apps/web && npm test --workspace apps/web`
- [x] Test count: anteriores + novos passam
- [ ] Manual: Independent Tests de FRM-06 e FRM-07 com `docker compose up`

**Tests**: unit
**Gate**: build

**Commit**: `feat(web): integra formularios na tela de gesseiros`

---

### T10: NovoMaterialForm ✅

**What**: Componente de cadastro de material.
**Where**: `apps/web/src/components/forms/NovoMaterialForm.tsx`
**Depends on**: T1, T2
**Reuses**: `lib/corpo.ts`, `lib/useEnvio.ts`, `api.post`
**Requirement**: FRM-08, FRM-10, FRM-11, FRM-12

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Submit chama `api.post('/estoque/materiais', { nome, unidade, estoqueMinimo? })` e omite `estoqueMinimo` quando vazio (FRM-08 AC1/AC2)
- [x] Um 409 mostra a mensagem e preserva os dados (FRM-08 AC3)
- [x] Botão desabilitado durante o envio (FRM-11)
- [x] `NovoMaterialForm.test.tsx` cobre os itens acima
- [x] Gate check passes: `npm test --workspace apps/web`
- [x] Test count: anteriores + novos passam

**Tests**: unit
**Gate**: quick

**Commit**: `feat(web): adiciona formulario de cadastro de material`

---

### T11: MovimentacaoForm ✅

**What**: Componente de entrada/saída de material com obra opcional na saída.
**Where**: `apps/web/src/components/forms/MovimentacaoForm.tsx`
**Depends on**: T1, T2
**Reuses**: `lib/corpo.ts`, `lib/useEnvio.ts`, `api.post`
**Requirement**: FRM-09, FRM-10, FRM-11, FRM-12

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Submit chama `api.post('/estoque/movimentacoes', { materialId, tipo, quantidade: number, obraId?, observacao? })` e `onSalvo` (FRM-09 AC1)
- [x] O select de obra só aparece com `SAIDA`; ao trocar para `ENTRADA`, o corpo não leva `obraId` (FRM-09 AC2)
- [x] Um 400 (saldo insuficiente) mostra a mensagem, não chama `onSalvo` e preserva os dados (FRM-09 AC3)
- [x] Botão desabilitado durante o envio (FRM-11)
- [x] `MovimentacaoForm.test.tsx` cobre os itens acima
- [x] Gate check passes: `npm test --workspace apps/web`
- [x] Test count: anteriores + novos passam

**Tests**: unit
**Gate**: quick

**Commit**: `feat(web): adiciona formulario de movimentacao de estoque`

---

### T12: Integrar formulários em Estoque.tsx ✅

**What**: Extrai `carregar()`, busca `GET /obras` e renderiza `NovoMaterialForm` + `MovimentacaoForm` com re-fetch no `onSalvo`.
**Where**: `apps/web/src/pages/Estoque.tsx`
**Depends on**: T3, T10, T11
**Reuses**: fetch de materiais existente
**Requirement**: FRM-08, FRM-09

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Depois de cadastrar material ou movimentar, `GET /estoque/materiais` é chamado de novo (FRM-08 AC1, FRM-09 AC1)
- [x] `MovimentacaoForm` recebe os materiais e as obras carregados
- [x] O TODO do cabeçalho foi removido
- [x] `Estoque.test.tsx` cobre os itens acima
- [x] Gate check passes: `npm run build --workspace apps/web && npm test --workspace apps/web`
- [x] Test count: anteriores + novos passam
- [ ] Manual: Independent Tests de FRM-08 e FRM-09 com `docker compose up`

**Tests**: unit
**Gate**: build

**Commit**: `feat(web): integra formularios na tela de estoque`

---

## Phase Execution Map

```
Phase 1:  T1 | T2 | T3                       (independentes)
Phase 2:  T4, T5  =>  T6                     (Obras, P1)
Phase 3:  T7, T8  =>  T9                     (Gesseiros, P2)
Phase 4:  T10, T11 => T12                    (Estoque, P2)
```

Execution is strictly sequential - a single agent works one task at a time, in order. Com 12 tasks, o Execute vai oferecer sub-agentes por lote (~2 lotes: Fases 1–2 e Fases 3–4).

---

## Task Granularity Check

| Task | Scope | Status |
| --- | --- | --- |
| T1: helpers de corpo | 1 arquivo, 4 funções puras coesas | ✅ Granular |
| T2: useEnvio | 1 hook | ✅ Granular |
| T3: estilos | 1 arquivo CSS | ✅ Granular |
| T4: NovaObraForm | 1 componente (+ função pura do mesmo arquivo) | ⚠️ Maior da lista, mas coeso |
| T5: AlocarGesseiroForm | 1 componente | ✅ Granular |
| T6: Obras.tsx | 1 página | ✅ Granular |
| T7: NovoGesseiroForm | 1 componente | ✅ Granular |
| T8: LancamentoForm | 1 componente | ✅ Granular |
| T9: Gesseiros.tsx | 1 página | ✅ Granular |
| T10: NovoMaterialForm | 1 componente | ✅ Granular |
| T11: MovimentacaoForm | 1 componente | ✅ Granular |
| T12: Estoque.tsx | 1 página | ✅ Granular |

## Diagram-Definition Cross-Check

| Task | Depends On (task body) | Diagram Shows | Status |
| --- | --- | --- | --- |
| T1 | None | None | ✅ Match |
| T2 | None | None | ✅ Match |
| T3 | None | None | ✅ Match |
| T4 | T1, T2 | T1→T4, T2→T4 | ✅ Match |
| T5 | T1, T2 | T1→T5, T2→T5 | ✅ Match |
| T6 | T3, T4, T5 | T3→T6, T4→T6, T5→T6 | ✅ Match |
| T7 | T1, T2 | T1→T7, T2→T7 | ✅ Match |
| T8 | T1, T2 | T1→T8, T2→T8 | ✅ Match |
| T9 | T3, T7, T8 | T3→T9, T7→T9, T8→T9 | ✅ Match |
| T10 | T1, T2 | T1→T10, T2→T10 | ✅ Match |
| T11 | T1, T2 | T1→T11, T2→T11 | ✅ Match |
| T12 | T3, T10, T11 | T3→T12, T10→T12, T11→T12 | ✅ Match |

## Test Co-location Validation

| Task | Code Layer Created/Modified | Matrix Requires | Task Says | Status |
| --- | --- | --- | --- | --- |
| T1 | Helpers puros | unit | unit | ✅ OK |
| T2 | Hook | unit | unit | ✅ OK |
| T3 | Estilo | none | none | ✅ OK |
| T4 | Componente de formulário | unit | unit | ✅ OK |
| T5 | Componente de formulário | unit | unit | ✅ OK |
| T6 | Página | unit | unit | ✅ OK |
| T7 | Componente de formulário | unit | unit | ✅ OK |
| T8 | Componente de formulário | unit | unit | ✅ OK |
| T9 | Página | unit | unit | ✅ OK |
| T10 | Componente de formulário | unit | unit | ✅ OK |
| T11 | Componente de formulário | unit | unit | ✅ OK |
| T12 | Página | unit | unit | ✅ OK |
