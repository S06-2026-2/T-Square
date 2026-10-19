# Front — Formulários Validation

> Relatórios em ordem do mais recente para o mais antigo. A seção das Fases 1–2 (rodada 2) fica abaixo como histórico, sem alteração.

---

## Fases 3–4 (T7–T12) — Rodada 1

**Verdict**: PASS ✅

**Date**: 2026-10-19
**Spec**: `.claude/specs/features/front-formularios/spec.md`
**Diff range**: working tree vs `HEAD` (`0514661`), sem commits da feature. Superfície das Fases 3–4 (todas untracked, exceto as páginas, que são `M`): `components/forms/NovoGesseiroForm.tsx` + `.test.tsx`, `components/forms/LancamentoForm.tsx` + `.test.tsx`, `components/forms/NovoMaterialForm.tsx` + `.test.tsx`, `components/forms/MovimentacaoForm.tsx` + `.test.tsx`, `pages/Gesseiros.tsx` + `Gesseiros.test.tsx`, `pages/Estoque.tsx` + `Estoque.test.tsx`. Os outros arquivos alterados no tree (`App.tsx`, `Dashboard*`, `lib/status*`, `Login*`, `Layout.tsx`, `Icone.tsx`, `types.ts`) são da feature `front-dashboard-resumo` e ficaram fora.
**Escopo**: FRM-06, FRM-07, FRM-08, FRM-09; FRM-10/11/12 e os edge cases para os 4 forms novos. DTOs de referência: `apps/api/src/gesseiros/dto/create-gesseiro.dto.ts`, `create-lancamento.dto.ts`, `apps/api/src/estoque/dto/create-material.dto.ts`, `create-movimentacao.dto.ts`; `apps/api/src/main.ts:18-22` confirma `ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true })`.
**Verifier**: sub-agente independente (author ≠ verifier)

> Paths abaixo são relativos a `apps/web/src/`, salvo indicação.

### Task Completion

| Task | Status | Notes |
| ---- | ------ | ----- |
| T7 NovoGesseiroForm | ✅ Done | `required` + `minLength={3}` (`NovoGesseiroForm.tsx:42`); corpo via `semVazios`/`textoOpcional` (`:23-27`) |
| T8 LancamentoForm | ✅ Done | só `VALE`/`PAGAMENTO` (`LancamentoForm.tsx:13-16`); `valor: numero(valor)` (`:32`) |
| T9 Gesseiros.tsx | ✅ Done (automatizado) | `carregar()` extraído (`:16-22`), re-fetch no cadastro (`:28-31`), `LancamentoForm` só dentro de `extrato &&` (`:89-117`). TODO do cabeçalho removido. Manual FRM-06/07 `[ ]` |
| T10 NovoMaterialForm | ✅ Done | `minLength={2}` (`:42`), `unidade` `required` (`:50`), `numeroOpcional(estoqueMinimo)` (`:26`) |
| T11 MovimentacaoForm | ✅ Done | obra só em `SAIDA` (`:83`), `obraId` limpo ao voltar para `ENTRADA` (`:27`) e guardado no corpo (`:39`) |
| T12 Estoque.tsx | ✅ Done (automatizado) | `carregar()` (`:17-23`), `GET /obras` (`:27-30`), `salvo()` recarrega (`:37-40`). TODO removido. Manual FRM-08/09 `[ ]` |

Os itens manuais (Independent Tests de FRM-06..09 com `docker compose up`) estão pendentes de UAT humano. Isso não é FAIL: os resultados visíveis desses testes (gesseiro novo na lista, saldo do extrato, material com saldo 0, saldo decrementado) estão asseridos nos testes de página.

### Spec-Anchored Acceptance Criteria

#### P2: Cadastrar gesseiro (FRM-06)

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --- | --- | --- | --- |
| AC1: `nome` mínimo 3 | `required`, `minLength=3` | `components/forms/NovoGesseiroForm.test.tsx:26` - `toBeRequired()`; `:27` - `toHaveAttribute('minLength', '3')` | ✅ |
| AC1: chama `POST /gesseiros` | corpo exato, `nome` trimado | `NovoGesseiroForm.test.tsx:43-47` - `expect(post).toHaveBeenCalledWith('/gesseiros', { nome: 'Joao Ferreira', telefone: '(35) 99999-0001', chavePix: 'joao@pix.com' })` | ✅ |
| AC1: limpa o formulário | 3 inputs vazios | `NovoGesseiroForm.test.tsx:48-50` - `toHaveValue('')` ×3 | ✅ |
| AC1: recarrega a lista e o novo aparece | 2º `GET /gesseiros` e botão do novo gesseiro na lista | `pages/Gesseiros.test.tsx:48` - `findByRole('button', { name: 'Joao Ferreira' })`; `:49` - `expect(chamadas('/gesseiros')).toBe(2)` | ✅ |
| AC2: telefone/Pix opcionais, omitidos quando vazios | não `required`; corpo `{ nome }` | `NovoGesseiroForm.test.tsx:28-29` - `not.toBeRequired()`; `:62` - `expect(post.mock.calls[0][1]).toEqual({ nome: 'Joao Ferreira' })` (telefone `'   '` omitido) | ✅ |
| AC3: erro exibido sem perder dados | mensagem com classe `erro`, `onSalvo` não chamado, campos intactos | `NovoGesseiroForm.test.tsx:74` - `findByText(...)).toHaveClass('erro')`; `:75` - `onSalvo).not.toHaveBeenCalled()`; `:76-77` - `toHaveValue('Joao Ferreira')`, `toHaveValue('(35) 99999-0001')` | ✅ |

#### P2: Registrar vale ou pagamento (FRM-07)

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --- | --- | --- | --- |
| AC1: chama `POST /gesseiros/:id/lancamentos` | `{ tipo, valor: number, descricao? }` | `components/forms/LancamentoForm.test.tsx:51-55` - `toHaveBeenCalledWith('/gesseiros/g1/lancamentos', { tipo: 'PAGAMENTO', valor: 100, descricao: 'Acerto da semana' })`; `:66` - `toEqual({ tipo: 'VALE', valor: 50.5 })` | ✅ |
| AC1: `valor > 0` | `min=0.01`, `required` | `LancamentoForm.test.tsx:35` - `toBeRequired()`; `:36` - `toHaveAttribute('min', '0.01')` | ✅ |
| AC1: recarrega o extrato exibido | 2º `GET /gesseiros/g-ana/extrato` e saldo novo na tela | `pages/Gesseiros.test.tsx:83` - `expect(chamadas('/gesseiros/g-ana/extrato')).toBe(2)`; `:86` - `nextElementSibling).toHaveTextContent(/R\$\s0,00/)` (antes `R$ 100,00`, `:78`) — espelha o Independent Test | ✅ |
| AC2: só `VALE` e `PAGAMENTO`, nunca `CREDITO` | opções exatas | `LancamentoForm.test.tsx:29` - `expect(valores).toEqual(['VALE', 'PAGAMENTO'])` | ✅ |
| AC3: sem gesseiro selecionado, sem formulário | `Tipo` e botão `Registrar` ausentes; aparecem após abrir extrato | `pages/Gesseiros.test.tsx:60-61` - `queryByLabelText('Tipo')).not.toBeInTheDocument()`, `queryByRole('button', { name: 'Registrar' })).not.toBeInTheDocument()`; `:65` - `findByLabelText('Tipo')` | ✅ |
| AC4: erro sem fechar nem perder dados | mensagem `erro`, `onSalvo` não chamado, tipo/valor/descrição intactos | `LancamentoForm.test.tsx:79-83` - `toHaveClass('erro')`, `not.toHaveBeenCalled()`, `toHaveValue('PAGAMENTO')`, `toHaveValue(100)`, `toHaveValue('Acerto')` | ✅ |

#### P2: Cadastrar material (FRM-08)

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --- | --- | --- | --- |
| AC1: `nome` mínimo 2, `unidade` obrigatória, `estoqueMinimo` opcional | atributos | `components/forms/NovoMaterialForm.test.tsx:26-29` - `toBeRequired()`, `toHaveAttribute('minLength', '2')`, `Unidade toBeRequired()`, `Estoque minimo not.toBeRequired()` | ✅ |
| AC1: chama `POST /estoque/materiais` | `{ nome, unidade, estoqueMinimo: number }` | `NovoMaterialForm.test.tsx:43-47` - `toHaveBeenCalledWith('/estoque/materiais', { nome: 'Placa de gesso', unidade: 'un', estoqueMinimo: 10 })` | ✅ |
| AC1: limpa o formulário | inputs vazios | `NovoMaterialForm.test.tsx:48-50` - `toHaveValue('')` ×2, `toHaveValue(null)` | ✅ |
| AC1: recarrega a tabela (material aparece com saldo 0, Independent Test) | 2º `GET /estoque/materiais`; célula Saldo = `0` | `pages/Estoque.test.tsx:50` - `findByRole('cell', { name: 'Massa corrida' })`; `:51` - `expect(chamadasMateriais()).toBe(2)`; `:52` - `toHaveTextContent(/^0$/)` | ✅ |
| AC2: `estoqueMinimo` vazio omitido | corpo `{ nome, unidade }` | `NovoMaterialForm.test.tsx:62` - `toEqual({ nome: 'Placa de gesso', unidade: 'un' })` | ✅ |
| AC3: 409 exibido sem perder dados | mensagem `erro`, `onSalvo` não chamado, 3 campos intactos | `NovoMaterialForm.test.tsx:75-79` - `toHaveClass('erro')`, `not.toHaveBeenCalled()`, `toHaveValue('Placa de gesso')`, `toHaveValue('un')`, `toHaveValue(10)` | ✅ |

#### P2: Registrar movimentação (FRM-09)

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --- | --- | --- | --- |
| AC1: material/tipo/quantidade obrigatórios, `quantidade > 0`, tipos `ENTRADA`/`SAIDA` | atributos e opções | `components/forms/MovimentacaoForm.test.tsx:39-43` - `toBeRequired()` ×3, `toHaveAttribute('min', '0.01')`, `Observacao not.toBeRequired()`; `:47` - `toEqual(['ENTRADA', 'SAIDA'])` | ✅ |
| AC1: chama `POST /estoque/movimentacoes` | `{ materialId, tipo, quantidade: number, observacao? }` | `MovimentacaoForm.test.tsx:60-65` - `toHaveBeenCalledWith('/estoque/movimentacoes', { materialId: 'm-placa', tipo: 'ENTRADA', quantidade: 20, observacao: 'Compra da semana' })` | ✅ |
| AC1: recarrega a tabela com o novo saldo | 2º `GET /estoque/materiais`; Saldo 50 → 45 | `pages/Estoque.test.tsx:72` - `toHaveTextContent(/^50$/)`; `:80` - `chamadasMateriais()).toBe(2)`; `:81` - `toHaveTextContent(/^45$/)` | ✅ |
| AC2: obra opcional só na `SAIDA`, enviada como `obraId` | select ausente em `ENTRADA`, presente e não obrigatório em `SAIDA`; corpo com `obraId` | `MovimentacaoForm.test.tsx:72` - `queryByLabelText('Obra')).not.toBeInTheDocument()`; `:74` - `not.toBeRequired()`; `:81-86` - `toEqual({ materialId: 'm-placa', tipo: 'SAIDA', quantidade: 5, obraId: 'o-forro' })` | ✅ |
| AC2: `ENTRADA` não envia `obraId` | corpo sem `obraId` mesmo após escolher obra e voltar | `MovimentacaoForm.test.tsx:96` - select some; `:102` - `toEqual({ materialId: 'm-placa', tipo: 'ENTRADA', quantidade: 5 })` | ✅ |
| AC2: página repassa as obras | opção da obra carregada no select | `pages/Estoque.test.tsx:60` - `getByRole('option', { name: 'Placa de gesso (un)' })`; `:62` - `getByRole('option', { name: 'Forro sala' })` | ✅ |
| AC3: 400 exibido sem fechar nem alterar a tabela | mensagem `erro`, `onSalvo` não chamado, campos intactos; tabela não recarregada e saldo 50 | `MovimentacaoForm.test.tsx:115-122` - `toHaveClass('erro')`, `not.toHaveBeenCalled()`, `toHaveValue('SAIDA')`, `'m-placa'`, `80`, `'o-forro'`; `pages/Estoque.test.tsx:96` - `chamadasMateriais()).toBe(1)`; `:97` - `/^50$/`; `:98` - `Quantidade toHaveValue(80)` (form continua aberto) | ✅ |

#### Edge cases e FRM-10/11/12 (forms novos)

| Edge case | Spec-defined outcome | `file:line` + assertion | Result |
| --- | --- | --- | --- |
| Obrigatório vazio bloqueia submit (`required` HTML5) | `required` em todo campo obrigatório do DTO | `NovoGesseiroForm.test.tsx:26`; `LancamentoForm.test.tsx:35`; `NovoMaterialForm.test.tsx:26,28`; `MovimentacaoForm.test.tsx:39-41` - `toBeRequired()` | ✅ (atributo; o jsdom não executa a validação interativa — mesmo critério aceito nas Fases 1–2) |
| FRM-11: botão desabilitado durante submit | `disabled` com promise pendente, `enabled` depois | `NovoGesseiroForm.test.tsx:88,90`; `LancamentoForm.test.tsx:94,96`; `NovoMaterialForm.test.tsx:91,93`; `MovimentacaoForm.test.tsx:134,136-138` | ✅ |
| FRM-10: erro preserva dados | ver AC3/AC4 acima | `NovoGesseiroForm.test.tsx:76-77`; `LancamentoForm.test.tsx:81-83`; `NovoMaterialForm.test.tsx:77-79`; `MovimentacaoForm.test.tsx:119-122` | ✅ |
| FRM-12: números como `number` | `valor: 100`/`50.5`, `estoqueMinimo: 10`, `quantidade: 20`/`5` | `LancamentoForm.test.tsx:53,66`; `NovoMaterialForm.test.tsx:46`; `MovimentacaoForm.test.tsx:63,84,102` | ✅ |
| FRM-12: opcionais vazios omitidos | `toEqual` exato (pega chave `""`) | `NovoGesseiroForm.test.tsx:62`; `LancamentoForm.test.tsx:66`; `NovoMaterialForm.test.tsx:62`; `MovimentacaoForm.test.tsx:81,102` | ✅ |
| FRM-12: nada fora do DTO | corpos exatos ⊂ `CreateGesseiroDto` (`nome, telefone, chavePix`), `CreateLancamentoDto` (`tipo, valor, descricao`; `obraId` fora de escopo pela spec), `CreateMaterialDto` (`nome, unidade, estoqueMinimo`), `CreateMovimentacaoDto` (`materialId, tipo, quantidade, obraId, observacao`) | mesmas linhas acima, todas com `toEqual`/`toHaveBeenCalledWith` por valor; M4 do sensor (campo extra) morto | ✅ |
| 401 segue `lib/api.ts` | nenhum form trata 401 | `grep 401` nos 4 forms e 2 páginas: zero ocorrências; `useEnvio.ts:19` mostra o `message` do `ApiError` (`lib/api.ts:47-50`) | n/a (sem código novo) |

**Payload/conjunction rule**: todos os `api.post` dos 4 forms são asseridos por valor (corpo inteiro), nas duas camadas (form e página).

**Status**: ✅ todos os ACs de FRM-06..09 cobertos com evidência por valor; 1 ⚠️ spec-precision gap (texto do 401), não bloqueante.

### Discrimination Sensor

Isolamento: `git status --porcelain` gravado antes. Cópia de `apps/web` (sem `node_modules`/`dist`) em `C:\Users\Kaik\AppData\Local\Temp\claude\verifier-frm\web`, com junction `verifier-frm\node_modules` → `node_modules` da raiz (workspace hoisted). Baseline da cópia (forms + Gesseiros + Estoque): 8 suites, 43/43 verdes. Cada mutação aplicada só na cópia por script Node, `jest --testPathPattern` do form + página correspondente, arquivo restaurado byte a byte em seguida; depois do último mutante a cópia voltou a 43/43. Limpeza: junction removida com `rmdir` (alvo `node_modules\jest` conferido intacto), pasta apagada; porcelain do repo **idêntico** ao baseline. Linhas = arquivo real.

| # | File:line | Mutação | Killed? (teste que matou) |
| - | --------- | ------- | ------- |
| M1 | `components/forms/LancamentoForm.tsx:15` | adiciona opção `CREDITO` | ✅ `oferece apenas VALE e PAGAMENTO...` |
| M2 | `LancamentoForm.tsx:32` | `valor` enviado como string | ✅ 3 testes (form + página) |
| M3 | `LancamentoForm.tsx:32` | `descricao` vazia enviada como `""` | ✅ `omite a descricao vazia...` + página |
| M4 | `LancamentoForm.tsx:32` | campo fora do DTO (`gesseiroId`) no corpo | ✅ 3 testes |
| M5 | `LancamentoForm.tsx:72` | `disabled={false}` | ✅ `desabilita o botao...` |
| M24 | `LancamentoForm.tsx:35-39` | `onSalvo` chamado mesmo com erro | ✅ `mostra o 400 da API...` |
| M6 | `NovoGesseiroForm.tsx:25` | telefone vazio enviado como `""` | ✅ form + página |
| M7 | `NovoGesseiroForm.tsx:30-31` | `nome` limpo mesmo com erro | ✅ `mostra o erro da API...` |
| M8 | `NovoGesseiroForm.tsx:42` | `minLength` 3 → 2 | ✅ `exige nome com pelo menos 3...` |
| M9 | `NovoGesseiroForm.tsx:22` | endpoint `/gesseiro` | ✅ form + página |
| M23 | `NovoGesseiroForm.tsx:33` | `chavePix` não limpa após sucesso | ✅ `cadastra o gesseiro... limpa o formulario` |
| M10 | `NovoMaterialForm.tsx:26` | `estoqueMinimo` enviado como string | ✅ `cadastra o material com estoque minimo numerico...` |
| M11 | `NovoMaterialForm.tsx:30-35` | `onSalvo` chamado mesmo com erro | ✅ `mostra o 409...` |
| M12 | `NovoMaterialForm.tsx:50` | remove `required` de `unidade` | ✅ `exige nome (minimo 2) e unidade...` |
| M13 | `MovimentacaoForm.tsx:39` | `obraId: textoOpcional(obraId)` sem guarda de tipo | ⚪ Sobreviveu — **equivalente**: `trocarTipo` (`:27`) zera `obraId` ao ir para `ENTRADA`, o estado inicial é `ENTRADA`/`''` e o sucesso zera `obraId` (`:46`); não existe estado alcançável com `tipo==='ENTRADA' && obraId!==''` |
| M14 | `MovimentacaoForm.tsx:27` + `:39` | sem guarda no corpo **e** sem limpeza em `trocarTipo` | ✅ `nao envia obraId quando o tipo volta para ENTRADA...` |
| M15 | `MovimentacaoForm.tsx:83` | select de obra exibido em `ENTRADA` | ✅ 2 testes |
| M16 | `MovimentacaoForm.tsx:34` | endpoint `/estoque/movimentacao` | ✅ `registra uma entrada...` |
| M17 | `MovimentacaoForm.tsx:38` | `quantidade` enviada como string | ✅ 3 testes |
| M25 | `MovimentacaoForm.tsx:45` | `quantidade` não limpa após sucesso | ⚪ Sobreviveu — **fora do contrato**: FRM-09 não pede limpar o form, e `Estoque.tsx:38` fecha (desmonta) o form no sucesso, então não é observável |
| M18 | `pages/Gesseiros.tsx:30` | não recarrega a lista após cadastro | ✅ `recarrega a lista... (FRM-06)` |
| M19 | `pages/Gesseiros.tsx:116` | `onSalvo` do lançamento não recarrega o extrato | ✅ `recarrega o extrato... (FRM-07 AC1)` |
| M20 | `pages/Gesseiros.tsx:85` | `LancamentoForm` renderizado também sem extrato | ✅ `so mostra o formulario de lancamento com um extrato aberto (FRM-07 AC3)` |
| M21 | `pages/Estoque.tsx:39` | `salvo()` não recarrega materiais | ✅ 2 testes (FRM-08 AC1, FRM-09 AC1) |
| M22 | `pages/Estoque.tsx:70` | `obras={[]}` | ✅ `passa os materiais e as obras carregados...` |

**Sensor depth**: expandido (25 mutações nos 6 arquivos; ≥ 4 por form)
**Result**: 23/25 killed; os 2 sobreviventes são equivalente (M13) e fora do contrato da spec (M25). Nenhum sobrevivente aponta teste fraco para AC em escopo — PASS ✅

### Code Quality

| Principle | Status |
| --- | --- |
| Minimum code | ✅ os 4 forms seguem o mesmo molde de `AlocarGesseiroForm` (`useState` + `useEnvio` + `semVazios`) |
| Surgical changes | ✅ páginas: só `carregar()` extraído, toggle do form e integração |
| No scope creep | ✅ sem `obraId` no lançamento, sem editar/desativar gesseiro (Out of Scope respeitado) |
| Matches patterns | ✅ |
| Spec-anchored outcome check | ✅ (1 spec-precision gap de texto, não bloqueante) |
| Per-layer Coverage Expectation (`tasks.md`) | ✅ componentes: ACs + FRM-10/11/12 por valor; páginas: re-fetch com resultado visível, ocultação do lançamento, repasse de obras, erro não recarrega |
| Every test maps to a spec requirement | ✅ 29 testes novos (5+6+5+6 nos forms, 3+4 nas páginas) mapeiam para FRM-06..12 ou Done-when de T7–T12 |
| Documented guidelines followed: `CLAUDE.md` (Testes), Test Coverage Matrix de `tasks.md` | ✅ |

### Gate Check

- **Gate command**: `npm test --workspace apps/web` e `npm run build --workspace apps/web` (a partir da raiz)
- **Test**: 16 suites, **67 passed, 0 failed, 0 skipped** — exit 0 (bate com o esperado)
- **Build**: `tsc --noEmit && vite build` — exit 0
- **Fases 1–2 continuam verdes**: `corpo.test.ts`, `useEnvio.test.ts`, `NovaObraForm.test.tsx`, `AlocarGesseiroForm.test.tsx`, `Obras.test.tsx` — PASS no mesmo run
- **Contagem**: 28 (fim das Fases 1–2) + 29 (Fases 3–4) + 10 de `front-dashboard-resumo` (`App`, `Dashboard`, `Login`, `status`) = 67. Nenhum teste removido nem enfraquecido.
- **validate_state.py**: não executado (Python ausente). Conferido lendo: o relatório existe, o verdict é PASS e há citações `file:line`.

### Gaps e Fix Plans

Nenhum bloqueante. Em ordem de prioridade:

1. **`spec.md` linha 1 corrompida** (Minor, artefato): o título virou ` Execute | Implementing (aguardando Verifier) | Execute | ... |# Front — Formulários de Cadastro e Movimentação Specification` (confirmado com `git diff HEAD -- spec.md`). Provavelmente um replace da tabela de traceability que caiu no começo do arquivo. Pode quebrar o `check-specs`/`validate_spec.py` (seção de título). **Fix**: restaurar a linha 1 para `# Front — Formulários de Cadastro e Movimentação Specification`.
2. **⚠️ Spec-precision gap no 401** (Minor, spec): o edge case diz que a mensagem aparece "no `erro` da página", mas o design (`design.md:182`) e o código (`useEnvio.ts:19`) mostram no `erro` do próprio form. Comportamento aceitável e igual ao das Fases 1–2. **Fix**: trocar na spec para "no `erro` do formulário (ou da página, para chamadas de leitura)".
3. **Comportamento sem dono** (Cosmetic): `LancamentoForm.tsx:36-37` limpa `valor`/`descricao` após sucesso e o form continua montado (extrato aberto), mas nenhum AC pede isso e nenhum teste assere. Ajuda a evitar vale duplicado por engano. **Fix opcional**: adicionar a FRM-07 AC1 "e limpa valor/descrição" e asserir `toHaveValue(null)`/`''` em `LancamentoForm.test.tsx:50+`.
4. **UAT manual** (pendente, não FAIL): Independent Tests de FRM-06..09 com `docker compose up` e marcar os itens de T9 e T12 em `tasks.md`.

### Requirement Traceability Update

| Requirement | Antes | Depois |
| --- | --- | --- |
| FRM-06 | Implementing | ✅ Verified (automatizado; UAT manual pendente) |
| FRM-07 | Implementing | ✅ Verified (automatizado; UAT manual pendente) |
| FRM-08 | Implementing | ✅ Verified (automatizado; UAT manual pendente) |
| FRM-09 | Implementing | ✅ Verified (automatizado; UAT manual pendente) |
| FRM-10/11/12 | Obras verificado | ✅ Verified em todos os forms |

(Este Verifier não alterou `spec.md` nem `tasks.md`; a atualização de status fica com o orquestrador.)

### Summary

**Overall**: ✅ Ready (Fases 3–4), com UAT manual pendente

**Spec-anchored check**: 25/25 critérios de FRM-06..09 com evidência por valor; 1 spec-precision gap (texto do 401)
**Sensor**: 25 mutações, 23 killed, 2 sobreviventes justificados (1 equivalente, 1 fora do contrato)
**Gate**: 67 passed, 0 failed; build ok

---

# Front — Formulários Validation (Fases 1–2: T1–T6) — Rodada 2 (histórico)

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
