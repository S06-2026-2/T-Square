# Front — Dashboard de Resumo Validation (T1–T5) — Rodada 2

**Verdict**: PASS ✅

**Date**: 2026-10-19
**Spec**: `.claude/specs/features/front-dashboard-resumo/spec.md`
**Diff range**: working tree vs `HEAD` (`0514661`), sem commits da feature. Superfície: `apps/web/src/lib/status.ts`, `lib/status.test.ts`, `pages/Dashboard.tsx`, `pages/Dashboard.test.tsx`, `pages/Login.test.tsx`, `App.tsx`, `App.test.tsx` (novos ou modificados), `components/Layout.tsx`, `components/Icone.tsx`, `pages/Login.tsx`, `pages/Obras.tsx`, `types.ts`, `index.css` (modificados).
**Verifier**: sub-agente independente (author ≠ verifier), rodada 2 de re-verificação

> Paths abaixo são relativos a `apps/web/src/`.

---

## Histórico

- **Rodada 1 (FAIL ❌)**: 36 testes verdes, build ok, sensor 12/14. Sobreviveram M11 (`Login.tsx:24` navegando para `/obras`, sem teste) e M12 (cards zerados exibidos junto com o erro, comportamento que o DSH-03 não definia). Cosmético: spec dizia "Visão geral", a UI usa "Visao geral".
- **Correção do autor (T5)**: só testes e spec. `spec.md:51` (DSH-03) agora diz "SHALL NOT exibir os cards de status (nem zerados)"; `Dashboard.test.tsx:79` ganhou `expect(screen.queryAllByRole('article')).toHaveLength(0)`; novo `pages/Login.test.tsx`; `spec.md:28` registra "Visao geral" sem acento como convenção da UI. Código de produção não mudou: as linhas citadas na rodada 1 (`Dashboard.tsx:15/22-23/35/38/44`, `Login.tsx:24`, `App.tsx:26-27`, `Layout.tsx:8`, `status.ts:4/7-13`) são as mesmas.

---

## Task Completion

| Task | Status | Notes |
| ---- | ------ | ----- |
| T1 `lib/status.ts` | ✅ Done | `lib/status.test.ts:5`, `:9-15`; `Obras.tsx` monta `filtros` a partir de `STATUS_FUNIL` sem `CANCELADA`, e `Obras.test.tsx` continua verde |
| T2 `index.css` | ✅ Done | Build gate |
| T3 `pages/Dashboard.tsx` | ✅ Done | `pages/Dashboard.test.tsx` (4 testes) |
| T4 rota, aba, página inicial | ✅ Done | `App.test.tsx` (2 testes) + `Login.test.tsx` (gap da rodada 1 fechado) |
| T5 fix M11/M12 | ✅ Done | `Dashboard.test.tsx:79`, `Login.test.tsx:33` |

---

## Spec-Anchored Acceptance Criteria

### P1: Ver resumo do funil por status (DSH-01..03)

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --- | --- | --- | --- |
| DSH-01: acessar `/dashboard` chama `GET /obras/resumo` | chamada exata a `/obras/resumo` | `pages/Dashboard.test.tsx:42` - `expect(get).toHaveBeenCalledWith('/obras/resumo')` | ✅ |
| DSH-01: card por status com `quantidade` | seed: 1 em "Em andamento", 1 em "Aguardando cliente" | `Dashboard.test.tsx:35` - `andamento.getByTestId('quantidade')).toHaveTextContent(/^1$/)`; `:39` idem para `orcamento` | ✅ |
| DSH-01: `valorTotal` em BRL via `moeda()` | "R$ 8.500,00" e "R$ 14.200,00" (Independent Test) | `Dashboard.test.tsx:36` - `toHaveTextContent(/^R\$\s8\.500,00$/)`; `:40` - `toHaveTextContent(/^R\$\s14\.200,00$/)`; código usa `moeda(linha.valorTotal)` (`Dashboard.tsx:44`) | ✅ |
| DSH-01: um card por status, os 5 | 5 cards na ordem do funil, rótulos de `Obras.tsx` + "Canceladas" | `Dashboard.test.tsx:57` - `expect(titulos).toEqual(['Aguardando cliente', 'Fechadas', 'Em andamento', 'Concluidas', 'Canceladas'])`; `lib/status.test.ts:5` - `expect(STATUS_FUNIL).toEqual([...5 status])`; `:9-15` - `expect(rotuloPlural).toEqual({..., CANCELADA: 'Canceladas'})` | ✅ |
| DSH-02: status ausente com `quantidade: 0` e `R$ 0,00` | 0 e "R$ 0,00" em Fechadas/Concluidas/Canceladas | `Dashboard.test.tsx:50-54` - `toHaveTextContent(/^0$/)` e `toHaveTextContent(/^R\$\s0,00$/)` no loop | ✅ |
| DSH-03: falha da API exibe mensagem no padrão `erro` | texto em elemento `.erro` | `Dashboard.test.tsx:77` - `findByText('Erro ao comunicar com a API')`; `:78` - `expect(erro).toHaveClass('erro')` | ✅ |
| DSH-03: SHALL NOT exibir os cards (nem zerados) | nenhum card no erro | `Dashboard.test.tsx:79` - `expect(screen.queryAllByRole('article')).toHaveLength(0)` | ✅ (era ⚠️ na rodada 1) |

### Assumptions que viram comportamento

| Decisão (spec) | Outcome | `file:line` + assertion | Result |
| --- | --- | --- | --- |
| Rota `/dashboard` | renderiza o Dashboard | `App.test.tsx:30` - `findByRole('heading', { level: 1, name: 'Visao geral' })` | ✅ |
| `/` redireciona para `/dashboard` | aba "Visao geral" ativa ao abrir `/` | `App.test.tsx:31` - `getByRole('link', { name: 'Visao geral' })).toHaveClass('ativo')` | ✅ |
| Aba "Visao geral" no menu apontando para `/dashboard` | primeiro link do `nav`, `href="/dashboard"` | `App.test.tsx:38` - `expect(links[0]).toHaveTextContent('Visao geral')`; `:39` - `toHaveAttribute('href', '/dashboard')` | ✅ (convenção sem acento registrada em `spec.md:28`) |
| Login navega para `/` | depois de entrar, a rota `/` é renderizada (e não `/obras`) | `pages/Login.test.tsx:33` - `expect(await screen.findByText('pagina inicial')).toBeInTheDocument()`; a rota `/obras` existe no teste (`:26`), então um redirect errado não passa | ✅ (era ❌ na rodada 1). Assumption continua `n — confirmar com o time` em `spec.md:31` |

**Status**: ✅ todos os ACs e assumptions com comportamento cobertos por valor.

---

## Edge Cases

- [x] **Nenhuma obra → 5 cards zerados**: `Dashboard.test.tsx:66` - `expect(cards).toHaveLength(5)`; `:68-69` - cada card com `/^0$/` e `/^R\$\s0,00$/`.
- [x] **401 → comportamento existente de `lib/api.ts`**: nenhum código novo. `Dashboard.tsx:15` usa `api.get`, que no 401 faz `auth.logout()` e lança `ApiError('Sessao expirada...')`; a mensagem cai no `.erro` de DSH-03 e os cards somem. n/a (o projeto não tem teste de `lib/api.ts`, igual às outras páginas).

---

## Discrimination Sensor

Isolamento: `git status --porcelain` gravado antes. Cópia nova de `apps/web` (sem `node_modules`/`dist`) em `C:\Users\Kaik\AppData\Local\Temp\claude\verifier-dash\web`, com junction `node_modules` apontando para o `node_modules` da raiz. Baseline da cópia: 37/37 verdes. Cada mutação foi aplicada só na cópia, por script Node (string exata, 1 ocorrência), com `jest --ci` rodado lá e o arquivo restaurado byte a byte em `finally`. No fim, a junction foi removida com `rmdir` (alvo intacto) e a pasta apagada.

**Conferência do porcelain**: todas as linhas do baseline continuam iguais, e nenhum arquivo da superfície desta feature mudou. O porcelain final tem linhas **a mais**: `front-formularios/tasks.md`, `pages/Gesseiros.tsx`, `pages/Gesseiros.test.tsx` e `components/forms/{LancamentoForm,MovimentacaoForm,NovoGesseiroForm,NovoMaterialForm}*`, com mtime entre 09:05 e 09:09, durante a rodada do sensor. Esses arquivos são de outra frente de trabalho (Fases 3–4 de `front-formularios`) sendo editada em paralelo na árvore real. O script do sensor só escreve em `<scratch>/web` e nunca tocou nesses arquivos (o scratch nem os tinha). O isolamento desta rodada está ok; a diferença vem de trabalho concorrente.

| # | File:line | Mutação | Killed? (teste que matou) |
| - | --------- | ------- | ------- |
| M1 | `pages/Dashboard.tsx:22` | sem zero-fill, só os status presentes | ✅ Killed (DSH-02; "sem nenhuma obra") |
| M2 | `lib/status.ts:4` | `STATUS_FUNIL` sem `CANCELADA` | ✅ Killed (3 testes) |
| M3 | `pages/Dashboard.tsx:44` | sem `moeda()` | ✅ Killed (3 testes) |
| M4 | `pages/Dashboard.tsx:35` | não renderiza o erro | ✅ Killed (DSH-03) |
| M5 | `pages/Dashboard.tsx:35` | erro com classe `aviso` | ✅ Killed (DSH-03) |
| M6 | `pages/Dashboard.tsx:15` | endpoint `/obras` | ✅ Killed (DSH-01) |
| M7 | `App.tsx:26` | `/` → `/obras` | ✅ Killed (`abre o dashboard...`) |
| M8 | `components/Layout.tsx:8` | remove a aba | ✅ Killed (2 testes de `App`) |
| M9 | `lib/status.ts:12` | `CANCELADA: 'Cancelada'` | ✅ Killed (2 testes) |
| M10 | `pages/Dashboard.tsx:23` | zero-fill com `quantidade: 1` | ✅ Killed (2 testes) |
| M11 | `pages/Login.tsx:24` | `navigate('/obras')` | ✅ Killed (`Login > leva para a pagina inicial...`) — sobrevivia na rodada 1 |
| M12 | `pages/Dashboard.tsx:38` | `{!carregando && (` (cards zerados junto com o erro) | ✅ Killed (DSH-03) — sobrevivia na rodada 1 |
| M13 | `App.tsx:27` | `/dashboard` renderiza `Obras` | ✅ Killed |
| M14 | `lib/status.ts:4` | ordem do funil trocada | ✅ Killed (2 testes) |
| M15 | `pages/Login.tsx:24` | remove o `navigate` | ✅ Killed (`Login`) — novo |
| M16 | `pages/Dashboard.tsx:38` | `{!erro && (` (cards zerados aparecem durante o carregamento) | ❌ Survived — fora do spec, ver Gaps |

**Sensor depth**: P1/MVP, expandido: os 14 da rodada 1 re-rodados e mais 2 novos.
**Result**: 15/16 killed. Todos os mutantes ligados a AC, edge case ou assumption morreram. O único sobrevivente (M16) mexe no estado de carregamento, que nenhum AC, edge case ou Done-when define. Por isso o resultado conta como PASS ✅, com uma recomendação não bloqueante.

---

## Code Quality

| Principle | Status |
| --- | --- |
| Minimum code | ✅ |
| Surgical changes | ✅ T5 só mexeu em testes e no spec |
| No scope creep | ✅ |
| Matches patterns | ✅ `erro`/`carregando` como em `pages/Obras.tsx`; `moeda()`; `jest.mock('../lib/api')`; `MemoryRouter` com as flags `future` iguais a `App.test.tsx` |
| Spec-anchored outcome check | ✅ |
| Per-layer Coverage Expectation (`tasks.md`) | ✅ helpers, página e roteamento (incluindo login) |
| Every test maps to a spec requirement | ✅ 9 testes novos: T1 ×2, DSH-01/02/03 + edge ×4, T4 ×2, login ×1 |
| Documented guidelines followed: `CLAUDE.md` (Testes), Test Coverage Matrix de `tasks.md` | ✅ |

---

## Gate Check

- **Gate command**: `npm test --workspace apps/web` e `npm run build --workspace apps/web` (a partir da raiz)
- **Test**: 10 suites, **37 passed, 0 failed, 0 skipped** — exit 0 (rodado antes de os arquivos da outra frente aparecerem)
- **Build**: `tsc --noEmit && vite build` — exit 0
- **Test count before feature**: 28
- **Rodada 1**: 36 → **rodada 2**: 37 (+1: `Login.test.tsx`; a asserção de M12 entrou num teste existente). Nenhum teste removido nem enfraquecido.
- **validate_state.py**: não executado (Python não instalado). Conferido lendo: veredito preenchido como PASS e evidência `file:line` presente.

---

## Gaps (não bloqueantes)

1. **M16, estado de carregamento (Minor)**: enquanto `GET /obras/resumo` não responde, o código mostra "Carregando..." e esconde os cards (`Dashboard.tsx:36-38`). Nenhum teste trava isso: se o `!carregando` sair, os 5 cards "R$ 0,00" piscam antes dos dados reais. Se o time quiser travar, a sugestão é acrescentar ao spec "WHILE carregando THEN SHALL NOT exibir os cards" e, num teste com `get` pendente (`new Promise(() => {})`), verificar `getByText('Carregando...')` e `queryAllByRole('article')).toHaveLength(0)`.
2. **Assumption do login ainda `n` (`spec.md:31`)**: o comportamento está coberto, mas falta o time confirmar e marcar `y`.

---

## Requirement Traceability Update

| Requirement | Rodada 1 | Rodada 2 |
| --- | --- | --- |
| DSH-01 | ✅ (login sem teste) | ✅ Verified |
| DSH-02 | ✅ | ✅ Verified |
| DSH-03 | ⚠️ (cards no erro) | ✅ Verified |

(Este Verifier não alterou o `spec.md`; a atualização de status fica com o orquestrador.)

---

## Summary

**Overall**: ✅ Ready

**Spec-anchored check**: 3/3 ACs + edge cases + assumptions com asserção no valor do spec; nenhum spec-precision gap em AC
**Sensor**: 15/16 killed (M11 e M12 agora mortos; M16 fora do spec, não bloqueante)
**Gate**: 37 passed, 0 failed; build ok

**What works**: os 2 gaps da rodada 1 estão fechados, com asserções que matam os mutantes correspondentes; os 12 mutantes mortos na rodada 1 continuam mortos.

**Next steps**: confirmar a assumption do login com o time; decidir se trava o estado de carregamento (gap 1); propor os commits (o time commita manualmente).
