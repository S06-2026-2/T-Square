# Front — Formulários Validation (Fases 1–2: T1–T6) — Rodada 2

**Verdict**: PASS ✅

**Date**: 2026-10-07
**Spec**: `.claude/specs/features/front-formularios/spec.md`
**Diff range**: working tree vs `HEAD` (`74fd6dc`), sem commits da feature. Superfície funcional: `apps/web/src/lib/corpo.ts`, `corpo.test.ts`, `lib/useEnvio.ts`, `useEnvio.test.ts`, `components/forms/NovaObraForm.tsx`, `NovaObraForm.test.tsx`, `components/forms/AlocarGesseiroForm.tsx`, `AlocarGesseiroForm.test.tsx`, `pages/Obras.tsx`, `pages/Obras.test.tsx`. Mudanças só visuais (repaginação pedida depois da rodada 1) em `index.html`, `index.css`, `components/Layout.tsx`, `components/Icone.tsx`, `lib/formato.ts` (`iniciais`), `pages/Login.tsx`, `Gesseiros.tsx`, `Estoque.tsx` ficam fora do escopo funcional; o markup novo de `Obras.tsx` foi conferido (seção própria abaixo).
**Escopo**: FRM-01..05 completos; FRM-10/11/12 e edge case "obrigatório vazio bloqueia submit" só para `NovaObraForm`, `AlocarGesseiroForm` e `pages/Obras.tsx`. FRM-06..09 fora (Fases 3–4).
**Verifier**: sub-agente independente (author ≠ verifier), rodada 2 de re-verificação

> Paths abaixo são relativos a `apps/web/src/`.

---

## Histórico

- **Rodada 1 (FAIL ❌)**: 27 testes verdes, build ok, sensor 16/19. Sobreviveram M12/M13 (`required` do `AlocarGesseiroForm`) e M14 (`required` da linha de equipe do `NovaObraForm`). Parciais: re-fetch de FRM-01 e FRM-05 AC1 não observava o resultado na tela, e as 6 formas de pagamento não eram asseridas.
- **Correção do autor**: só testes. Esta rodada conferiu de forma independente: os forms são untracked (sem diff possível), mas o código nas linhas citadas pela rodada 1 (`required` em `AlocarGesseiroForm.tsx:48/67` e `NovaObraForm.tsx:253/271`, filtro de ativos `:92`, `disabled` `:297`, lista de formas `:8-15`) continua igual. As mudanças em `Obras.tsx` desde então são só de markup, e a lógica (`aceitaAlocacao`, `obraCriada`, `onSalvo={carregar}`) está idêntica.

---

## Task Completion

| Task | Status | Notes |
| ---- | ------ | ----- |
| T1 corpo.ts | ✅ Done | `lib/corpo.test.ts:5-29` |
| T2 useEnvio | ✅ Done | `lib/useEnvio.test.ts:17-65` (`renderHook`) |
| T3 index.css | ✅ Done | Build gate. O CSS foi reescrito na repaginação; `.formulario`, `.linha-form`, `.form-card` continuam em uso |
| T4 NovaObraForm | ✅ Done | Gap da rodada 1 fechado (`NovaObraForm.test.tsx:128-129`) |
| T5 AlocarGesseiroForm | ✅ Done | Gap da rodada 1 fechado (`AlocarGesseiroForm.test.tsx:32-34`) |
| T6 Obras.tsx | ✅ Done (automatizado) | Todos os Done-when automatizados ok. Item manual "Independent Tests de FRM-01 e FRM-05 com docker compose" continua `[ ]` em `tasks.md`: não bloqueia, porque o resultado visível agora é asserido nos testes, mas deve ser rodado no UAT |

---

## Spec-Anchored Acceptance Criteria

### P1: Criar nova obra (FRM-01..04, FRM-10..12)

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --- | --- | --- | --- |
| FRM-01: obrigatórios → `POST /obras` | corpo exato, `valorTotal` number, sem `status` | `components/forms/NovaObraForm.test.tsx:60` - `expect(post).toHaveBeenCalledWith('/obras', { titulo: 'Forro sala', clienteNome: 'Maria Silva', valorTotal: 8500 })` | ✅ |
| FRM-01: limpa o formulário | inputs vazios | `NovaObraForm.test.tsx:65-67` - `toHaveValue('')` ×2, `toHaveValue(null)` | ✅ |
| FRM-01: volta o filtro para "Todas" | `GET /obras` sem `?status`, chip Todas ativo | `pages/Obras.test.tsx:67` - `expect(ultimaChamadaObras()).toBe('/obras')`; `:68` - `toHaveClass('ativo')` | ✅ |
| FRM-01: recarrega a lista (filtro já em Todas) | novo `GET /obras` | `pages/Obras.test.tsx:82` - `toHaveLength(antes + 1)`; `:83` - `toBe('/obras')` | ✅ |
| FRM-01: obra nova aparece com status `ORCAMENTO` | card da obra nova com o rótulo de ORCAMENTO | `pages/Obras.test.tsx:84-87` - `findByRole('heading', { name: 'Obra nova' })` + `within(nova.closest('article')).getByText('Aguardando cliente')` (rótulo de `ORCAMENTO` em `components/StatusBadge.tsx:4`); o 2º `GET /obras` passa a devolver a obra nova (`:76-78`) | ✅ (era ⚠️ na rodada 1) |
| FRM-03/AC2: opcionais enviados quando preenchidos | valores trimados no corpo | `NovaObraForm.test.tsx:96-105` - `toHaveBeenCalledWith('/obras', {..., descricao: 'Forro com sanca', clienteTelefone: '(35) 98888-0001', endereco: 'Rua A, 10', ...})` | ✅ |
| FRM-03/AC2: opcionais vazios omitidos | chaves ausentes | `NovaObraForm.test.tsx:60` (corpo exato) + `lib/corpo.test.ts:17-18`, `:29` - `Object.keys(semVazios({ b: undefined }))).toEqual([])` | ✅ |
| FRM-02: as 6 formas oferecidas | `PIX, DINHEIRO, CARTAO_CREDITO, CARTAO_DEBITO, BOLETO, TRANSFERENCIA` | `NovaObraForm.test.tsx:82-89` - `expect(opcoes(screen.getByLabelText('Forma de pagamento'))).toEqual(['PIX','DINHEIRO','CARTAO_CREDITO','CARTAO_DEBITO','BOLETO','TRANSFERENCIA'])` | ✅ (era ⚠️ na rodada 1) |
| FRM-02: forma → `pagamento: { forma, parcelas?, valorEntrada? }` numéricos | `{ forma: 'CARTAO_CREDITO', parcelas: 3, valorEntrada: 1000 }` | `NovaObraForm.test.tsx:104` | ✅ |
| FRM-02: parcelas/entrada vazias omitidas | `{ forma: 'PIX' }` | `NovaObraForm.test.tsx:117` - `expect(post.mock.calls[0][1].pagamento).toEqual({ forma: 'PIX' })` | ✅ |
| FRM-02: sem forma → omite `pagamento` | sem chave | `NovaObraForm.test.tsx:60` (corpo exato) | ✅ |
| FRM-03/AC4: `plantaBaixaUrl` `type="url"` e enviada | atributo + valor no corpo | `NovaObraForm.test.tsx:79` - `toHaveAttribute('type', 'url')`; `:103` | ✅ |
| FRM-04: só ativos | `['g-ana', 'g-beto']` | `NovaObraForm.test.tsx:127` | ✅ |
| FRM-04: sem gesseiro já escolhido em outra linha | 2ª linha `['g-beto']` | `NovaObraForm.test.tsx:139` | ✅ |
| FRM-04: `gesseiros` sem chave interna, números, `funcao` opcional | `[{ gesseiroId:'g-ana', valorCombinado:500, funcao:'Forro' }, { gesseiroId:'g-beto', valorCombinado:300 }]` | `NovaObraForm.test.tsx:148-151` | ✅ |
| FRM-04: remover linha; 0 linhas → sem `gesseiros` | linha some, sem chave | `NovaObraForm.test.tsx:161`, `:165` | ✅ |
| FRM-01 AC6 / FRM-10: erro preserva dados | mensagem da API, `onSalvo` não chamado, campos intactos | `NovaObraForm.test.tsx:177-183` | ✅ |
| FRM-11: botão desabilitado durante envio | `disabled` pendente, `enabled` depois | `NovaObraForm.test.tsx:194`, `:197` | ✅ |

### P1: Alocar gesseiro (FRM-05, FRM-10..12)

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --- | --- | --- | --- |
| FRM-05 AC1: `POST /obras/:id/gesseiros` com corpo exato | `{ gesseiroId: 'g-ana', valorCombinado: 1200, funcao: 'Forro' }` | `components/forms/AlocarGesseiroForm.test.tsx:58-62` | ✅ |
| FRM-05 AC1 / FRM-12: `funcao` vazia omitida | `{ gesseiroId: 'g-ana', valorCombinado: 1200 }` | `AlocarGesseiroForm.test.tsx:75` | ✅ |
| FRM-05 AC1: só ativos (AD-004) | `['g-ana']` | `AlocarGesseiroForm.test.tsx:44` | ✅ |
| FRM-05 AC1: recarrega a lista | novo `GET /obras` + POST exato | `pages/Obras.test.tsx:124` - `toHaveLength(antes + 1)`; `:125-128` - `toHaveBeenCalledWith('/obras/orc/gesseiros', { gesseiroId: 'g-ana', valorCombinado: 700 })` | ✅ |
| FRM-05 AC1: mostra o gesseiro entre os alocados | gesseiro + valor no card | `pages/Obras.test.tsx:129-134` - `.lista-gesseiros` do card `Obra orc` com `toHaveTextContent(/Ana - R\$\s700,00/)`; o 2º `GET /obras` devolve a alocação (`:112-119`) | ✅ (era ⚠️ na rodada 1) |
| FRM-05 AC2: upsert, sem duplicar | comportamento do backend | O front manda o mesmo corpo (`AlocarGesseiroForm.test.tsx:58`); "não duplicou" só é observável no backend | ⚠️ Spec-precision gap de camada (aceito, igual à rodada 1) |
| FRM-05 AC3: form oculto em `CONCLUIDA`/`CANCELADA` | botão "Alocar" ausente nesses cards, presente nos outros 3 | `pages/Obras.test.tsx:95` - `getByRole('button', { name: 'Alocar' })).toBeInTheDocument()`; `:98` - `queryByRole(...)).not.toBeInTheDocument()` | ✅ |
| FRM-05 AC4 / FRM-10: 404 sem alterar lista nem perder dados | mensagem, sem `onSalvo`, campos intactos | `AlocarGesseiroForm.test.tsx:87-90` | ✅ |
| FRM-11: botão desabilitado | `disabled` pendente | `AlocarGesseiroForm.test.tsx:102`, `:104` | ✅ |
| Limpa o form após sucesso | `valorCombinado` vazio | `AlocarGesseiroForm.test.tsx:63` - `toHaveValue(null)` | ✅ |

### FRM-12 (T1) e hook (T2)

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --- | --- | --- | --- |
| `numeroOpcional` vazio/espaço → `undefined`; `'2.5'` → `2.5`; `'0'` → `0` | T1 | `lib/corpo.test.ts:10-13` | ✅ |
| `textoOpcional` | T1 | `lib/corpo.test.ts:17-19` | ✅ |
| `semVazios` remove só `undefined` | T1 | `lib/corpo.test.ts:23-29` | ✅ |
| `enviando` durante/depois; sucesso → `true` | T2 | `lib/useEnvio.test.ts:17`, `:25-27` | ✅ |
| Erro → `message`, resolve `false`; não-`Error` → `'Erro ao salvar'` | T2 | `lib/useEnvio.test.ts:40-42`, `:52` | ✅ |

### Edge cases (em escopo)

| Edge case | Spec-defined outcome | `file:line` + assertion | Result |
| --- | --- | --- | --- |
| Obrigatório vazio bloqueia submit — NovaObraForm topo | `required` em titulo/cliente/valor | `NovaObraForm.test.tsx:46-48` - `toBeRequired()` ×3 | ✅ |
| Idem — linhas de equipe | `required` no select e no valor da linha | `NovaObraForm.test.tsx:128` - `expect(primeiro).toBeRequired()`; `:129` - `expect(screen.getAllByLabelText('Valor combinado')[0]).toBeRequired()` | ✅ (era ❌) |
| Idem — AlocarGesseiroForm | `required` em gesseiro e valor; `funcao` opcional | `AlocarGesseiroForm.test.tsx:32` - `getByLabelText('Gesseiro')).toBeRequired()`; `:33` - `getByLabelText('Valor combinado')).toBeRequired()`; `:34` - `getByLabelText('Funcao')).not.toBeRequired()` | ✅ (era ❌) |
| Botão desabilitado durante submit | FRM-11 | ver acima | ✅ |
| Corpo: números, opcionais omitidos, nada fora do DTO | FRM-12 | `NovaObraForm.test.tsx:60,96,117,148`; `AlocarGesseiroForm.test.tsx:58,75` | ✅ |
| 401 segue `lib/api.ts` | nenhum form trata 401 | sem código novo | n/a |

**Payload/conjunction rule**: todos os `api.post` em escopo são asseridos por valor. Ressalva mantida da rodada 1: `toHaveBeenCalledWith` ignora chaves `undefined`; essa regressão é pega em `lib/corpo.test.ts:29`.

**Status**: ✅ todos os ACs em escopo cobertos; 1 ⚠️ spec-precision gap de camada (FRM-05 AC2, upsert é do backend), não bloqueante.

---

## Markup novo de `Obras.tsx` (repaginação)

Conferido contra o diff (`git diff apps/web/src/pages/Obras.tsx`):

| Mudança | Risco para AC em escopo | Evidência | Quebrou? |
| --- | --- | --- | --- |
| Botão "Nova obra" com `<Icone nome="mais" />` (`Obras.tsx:82-89`) | Nome acessível do botão | `Icone.tsx:31` usa `aria-hidden="true"`; `Obras.test.tsx:43` acha `getByRole('button', { name: 'Nova obra' })` e o fluxo de criação passa | Não |
| Subtítulo `subtitulo-pagina` (`:80`) | nenhum | — | Não |
| `card card-obra` + `data-status` (`:112`) | `card()` do teste usa `closest('article')` | `Obras.test.tsx` 4/4 verdes | Não |
| "Concluir obra" dentro de `.card-acoes` com `btn-secundario` (`:151-161`) | Texto e condição de ocultação | Texto e condição `!== 'CONCLUIDA' && !== 'CANCELADA'` iguais ao `HEAD` | Não |
| Alocação dentro de `<details><summary>Alocar gesseiro</summary>` (`:163-168`) | AC3 (ocultação) e AC1 | Condição `aceitaAlocacao.includes(obra.status)` (`:12`, `:163`) intacta; M7 morto. No navegador o form fica recolhido até o clique no summary, o que é compatível com "inline no card" | Não |
| Estado vazio com ícone (`:173-178`) | nenhum AC em escopo | texto "Nenhuma obra neste filtro." mantido | Não |
| Reset de filtro e re-fetch (`obraCriada`, `:55-64`; `onSalvo={carregar}`, `:166`) | FRM-01 / FRM-05 AC1 | Lógica idêntica à rodada 1; M6, M19, M22, M23 mortos | Não |

---

## Discrimination Sensor

Isolamento: `git status --porcelain` gravado antes. Cópia de `apps/web` (sem `node_modules`/`dist`) em `<repo>/verifier-scratch/web` (sem ponto no início; o `testMatch` padrão achou os testes, sem override). Baseline da cópia: 28/28 verdes. Cada mutação aplicada só na cópia por script com regex (tolerante a CRLF), `npx jest` rodado lá, e o arquivo restaurado byte a byte em `finally`. Depois, `diff -r apps/web/src verifier-scratch/web/src` vazio, pasta apagada e porcelain **idêntico** ao baseline. Linhas = arquivo real.

| # | File:line | Mutação | Killed? (teste que matou) |
| - | --------- | ------- | ------- |
| M12 | `components/forms/AlocarGesseiroForm.tsx:48` | remove `required` do select de gesseiro | ✅ Killed (`exige gesseiro e valor combinado antes de enviar`) |
| M13 | `AlocarGesseiroForm.tsx:67` | remove `required` de `valorCombinado` | ✅ Killed (idem) |
| M14 | `components/forms/NovaObraForm.tsx:253` | remove `required` do select de gesseiro da linha | ✅ Killed (`monta a equipe so com gesseiros ativos...`) |
| M20 | `NovaObraForm.tsx:271` | remove `required` do valor combinado da linha | ✅ Killed (idem) |
| M21 | `NovaObraForm.tsx:13` | tira `BOLETO` da lista de formas | ✅ Killed (`envia opcionais, planta baixa e pagamento...`) |
| M22 | `pages/Obras.tsx:35` | página mantém a lista antiga depois do 1º carregamento (`setObras(atual => atual.length ? atual : lista)`) | ✅ Killed (2 testes: re-fetch pós-criação e pós-alocação) |
| M23 | `pages/Obras.tsx:59-60` | `obraCriada` não recarrega com filtro já em TODAS | ✅ Killed (`recarrega a lista depois de criar... ja em Todas`) |
| M2 (re-run) | `NovaObraForm.tsx:92` | `ativos = gesseiros` | ✅ Killed |
| M6 (re-run) | `pages/Obras.tsx:62` | não reseta filtro para TODAS | ✅ Killed |
| M7 (re-run) | `pages/Obras.tsx:12` | `aceitaAlocacao` inclui `CONCLUIDA` | ✅ Killed |
| M9 (re-run) | `NovaObraForm.tsx:297` | `disabled={false}` | ✅ Killed |
| M17 (re-run) | `AlocarGesseiroForm.tsx:31` | `valorCombinado` enviado como string | ✅ Killed (3 testes) |
| M19 (re-run) | `pages/Obras.tsx:166` | `onSalvo` da alocação não recarrega | ✅ Killed |

**Sensor depth**: P1/MVP — expandido (13 mutações nesta rodada: 7 novas/re-injetadas dos gaps + 6 re-runs de mortas da rodada 1)
**Result**: 13/13 killed — PASS ✅

---

## Code Quality

| Principle | Status |
| --- | --- |
| Minimum code | ✅ |
| Surgical changes | ✅ no escopo funcional; a repaginação visual é uma mudança separada, pedida pelo usuário |
| No scope creep | ✅ nada de FRM-06..09 nem backend |
| Matches patterns | ✅ |
| Spec-anchored outcome check | ✅ (1 spec-precision gap de camada, aceito) |
| Per-layer Coverage Expectation (`tasks.md`) | ✅ componentes: AC + FRM-10/11/12 por valor; página: reset de filtro, ocultação, re-fetch com resultado visível |
| Every test maps to a spec requirement | ✅ 26 testes novos mapeiam para FRM-01..05/10..12 ou Done-when de T1/T2 |
| Documented guidelines followed: `CLAUDE.md` (Testes), Test Coverage Matrix de `tasks.md` | ✅ |

---

## Gate Check

- **Gate command**: `npm test --workspace apps/web` e `npm run build --workspace apps/web` (a partir da raiz)
- **Test**: 6 suites, **28 passed, 0 failed, 0 skipped** — exit 0
- **Build**: `tsc --noEmit && vite build` — exit 0
- **Test count before feature** (`HEAD`): 2 (`StatusBadge.test.tsx`)
- **validate_state.py** (feature espelhada em `<scratchpad>/vs/.specs/features/front-formularios`, `--root` apontando para lá): `validate_state: 0 error(s) across [front-formularios]`, exit 0
- **Rodada 1**: 27 → **rodada 2**: 28 (+1: teste de `required` do `AlocarGesseiroForm`; os outros fixes foram asserções a mais em testes existentes). Nenhum teste removido nem enfraquecido.

---

## Fix Plans

Nenhum bloqueante. Pendência não bloqueante:

- **UAT manual de T6** (Minor): rodar os Independent Tests de FRM-01 e FRM-05 com `docker compose up` e marcar o item em `tasks.md`.

---

## Requirement Traceability Update

| Requirement | Rodada 1 | Rodada 2 |
| --- | --- | --- |
| FRM-01 | ✅ (⚠️ "aparece") | ✅ Verified |
| FRM-02 | ✅ (⚠️ formas) | ✅ Verified |
| FRM-03 | ✅ | ✅ Verified |
| FRM-04 | ❌ Needs Fix | ✅ Verified |
| FRM-05 | ❌ Needs Fix | ✅ Verified (AC2 = spec-precision gap de camada) |
| FRM-10/11/12 (Obras) | ✅ | ✅ Verified (Gesseiros/Estoque pendentes, Fases 3–4) |

(Este Verifier não alterou o `spec.md`; a atualização de status fica com o orquestrador.)

---

## Summary

**Overall**: ✅ Ready (Fases 1–2)

**Spec-anchored check**: todos os ACs em escopo com evidência por valor; 1 spec-precision gap de camada (FRM-05 AC2)
**Sensor**: 13/13 killed
**Gate**: 28 passed, 0 failed; build ok

**What works**: os 4 gaps da rodada 1 estão fechados, com asserções que matam os mutantes correspondentes; o markup novo de `Obras.tsx` não quebrou nenhum AC em escopo.

**Next steps**: UAT manual de T6; seguir para a Fase 3 (Gesseiros).
