# PWA Instalável e Responsivo Tasks

## Execution Protocol (MANDATORY -- do not skip)

Implement these tasks with the `tlc-spec-driven` skill: **activate it by name and follow its Execute flow and Critical Rules.** Do not search for skill files by filesystem path. The skill is the source of truth for the full flow (per-task cycle, sub-agent delegation, adequacy review, Verifier, discrimination sensor).

**If the skill cannot be activated, STOP and tell the user - do not proceed without it.**

**Commits:** o time commita manualmente. Cada task traz a mensagem sugerida em `Commit`; o agente não roda `git commit`, `git add` nem `git push`. O pacote de commit (status + `git add` por arquivo + mensagem em here-string do PowerShell) é entregue ao usuário no fim de cada fase.

**Branch:** a feature começa num branch próprio criado pelo usuário a partir de `main` (sugestão: `feat/pwa-instalavel-responsivo`). Hoje o trabalho está em `feat/agente-estoque`.

---

**Design**: `.claude/specs/features/pwa-instalavel-responsivo/design.md`
**Status**: Approved (2026-11-09). Execução com sub-agentes em 5 lotes sequenciais, com parada para revisão e commit do usuário ao fim de cada um: L1 = fase 1 (T1–T5), L2 = fases 2 + 3 (T6–T14), L3 = fase 4 (T15–T21), L4 = fase 5 (T22–T25), L5 = fase 6 (T26–T31). Ao fim de cada lote: suítes de API e web + gate das tasks do lote, relatório de mudanças, requisitos cobertos e desvios do design. O lote seguinte só começa com o OK do usuário.

---

## Test Coverage Matrix

> Generated from codebase, project guidelines, and spec - confirm before Execute. Guidelines found: `CLAUDE.md` (todo service novo precisa de `.spec.ts` cobrindo a spec, no estilo de `apps/api/src/obras/obras.service.spec.ts`), `apps/api/package.json` (jest `.*\.spec\.ts$`; `test:e2e` com `test/jest-e2e.json`), `apps/web/jest.config.cjs` (`src/**/*.test.{ts,tsx}`, jsdom), `.github/workflows/ci.yml` (Node 20, test + build; `lint --if-present`, sem script de lint hoje), `tasks.md` de `obras-transicoes-status` (mesmo formato). O jsdom não calcula layout nem roda service worker, então responsividade e PWA são verificados por scripts de navegador (Chrome headless), aprovados no spec.

| Code Layer | Required Test Type | Coverage Expectation | Location Pattern | Run Command |
| --- | --- | --- | --- | --- |
| CSS / estrutura de layout (web) | browser (auditoria Chrome headless) | Toda medida dos RSP da task nas 6 larguras × 14 telas/estados; o script sai ≠ 0 em qualquer falha | `apps/web/scripts/audit-responsive.mjs` | `npm run audit:responsive --workspace apps/web` |
| Service worker em execução (web) | browser (auditoria Chrome headless, `setOfflineMode`) | OFF-01/03/04/05/06/07/11, PWA-01/03 de ponta a ponta no build de produção | `apps/web/scripts/audit-pwa.mjs` | `npm run audit:pwa --workspace apps/web` |
| Regras puras do SW (web) | unit (`@jest-environment node`) | Todo ramo de `ehRequisicaoDeDados` (método, origem, `/api/`, `/api/auth/`), plugin (200 vs outros, 7 dias exatos e 1 ms depois, `X-From-Cache`) | `apps/web/src/pwa/*.test.ts` | `npm run test --workspace apps/web` |
| Libs e hooks (web) | unit | Todo AC da task, incluindo os ramos de falha (sem `caches`, sem `randomUUID`, 0/409/422/401) e o texto exato das mensagens | `apps/web/src/lib/*.test.ts` | `npm run test --workspace apps/web` |
| Componente / página (web) | unit (Testing Library, `api` mockado) | Todo AC de UI da task: renderiza/não renderiza, textos e `aria-label` exatos, cliques, campos mantidos | `apps/web/src/**/*.test.tsx` | `npm run test --workspace apps/web` |
| Service (API) | unit (Prisma mockado, `$transaction` executando o callback) | Todos os ramos; 1:1 com os IDP da task; todo edge case listado (vencida, hash diferente, trava negada, `P2002`, erro dentro da transação, sem chave) | `apps/api/src/**/*.spec.ts` | `npm run test --workspace apps/api` |
| Decorator / função pura (API) | unit | Cada ramo (sem cabeçalho, não-UUID, rota com path real, hash canônico) | `apps/api/src/idempotencia/*.spec.ts` | `npm run test --workspace apps/api` |
| Controller (API) | none | Controller fino só delega (padrão do repo); as rotas são exercitadas pelo e2e | - | build gate |
| Rotas HTTP + banco + CORS | e2e (Postgres do Docker, dados `[e2e]` apagados no `afterAll`) | IDP-02/03/04/06/09 e rollback de ponta a ponta, nas rotas da task | `apps/api/test/*.e2e-spec.ts` | `docker exec gesso_api npm run test:e2e` |
| Schema / migration | none | build gate + migration aplicada | - | build gate |
| Assets / scripts utilitários / config | none | build gate + checagem objetiva no `Done when` | - | build gate |

## Gate Check Commands

> Generated from codebase - confirm before Execute.

| Gate Level | When to Use | Command |
| --- | --- | --- |
| Quick | Tasks com testes unitários de um workspace | `npm run test --workspace apps/api` ou `npm run test --workspace apps/web` (o do workspace tocado) |
| Full (API) | Tasks com e2e e fim das fases 2 e 3 | `npm run test --workspace apps/api && docker exec gesso_api npm run test:e2e` |
| Browser | Tasks de layout e de SW | `npm run build --workspace apps/web`, `npx vite preview --port 4173` (em `apps/web`, em segundo plano) e `npm run audit:responsive --workspace apps/web` ou `npm run audit:pwa --workspace apps/web`. Precisa da API no Docker (`gesso_api`, para a fixture). O `audit:responsive` só é verde com `medidos: 84/84, nao montados: 0, falhas: 0`; um estado não montado reprova o RSP-01 |
| Build | Schema, controller, config e fim de fase | `npm run build && npm test` (raiz: build de API e web, depois as duas suítes) |

Base antes da feature: **API 251 testes, web 147** (todos passando em 2026-11-09; medido de novo no branch `feat/pwa-instalavel-responsivo` em `4fe273c`, a partir da `main` `8e99dc8`, com o mesmo resultado). Nenhuma task pode terminar com menos testes do que começou.

Lembretes de ambiente (CLAUDE.md): depois de editar `apps/api/src/**`, rodar `docker restart gesso_api`; depois da migration, `docker exec gesso_api npx prisma migrate dev`. Hot-reload não é confiável no OneDrive.

---

## Execution Plan

Phases are ordered and run sequentially - each phase completes before the next begins, and tasks within a phase execute in order.

### Phase 1: Responsividade (front)

A auditoria primeiro (falha com os problemas de 2026-11-09), depois as correções até ela passar.

```
T1 → T2 → T3 → T4
T1 → T5
```

### Phase 2: Idempotência, fundação da API

```
T6 → T9
T7 → T8
T7 → T9
```

### Phase 3: Idempotência nas rotas + CORS

```
T10 → T14
T11 → T14
T12 → T14
T13 → T14
```

### Phase 4: Front, sessão, rede e chave de envio

```
T15 → T19 → T20
T16 → T18
T17 → T18
T16 → T21
T18 → T19
```

### Phase 5: Front, indicador, reconexão e instalação

```
T22
T23
T24 → T25
```

### Phase 6: PWA (manifest, service worker, build)

```
T26 → T28
T27 → T28
T28 → T29 → T30 → T31
```

---

## Task Breakdown

### T1: Script de auditoria de responsividade

**Status**: ✅ Concluída (L1)

**What**: Versionar `audit-responsive.mjs` (evolução do script de 2026-11-09) com todas as medidas do RSP e saída ≠ 0 em falha; fixture que monta os dados dos estados do agente antes de medir e limpa depois; `puppeteer-core@23.11.1` como devDependency; script `audit:responsive`; `.audit/` no `.gitignore`.
**Where**: `apps/web/scripts/audit-responsive.mjs` (novo); `apps/api/scripts/fixture-auditoria.mjs` (novo); `apps/web/package.json`; `.gitignore`
**Depends on**: None
**Reuses**: `audit.mjs` da auditoria de 2026-11-09 (scratchpad), login por `POST /api/auth/login`, chaves `gesso.token`/`gesso.usuario`
**Requirement**: RSP-01, RSP-02, RSP-03, RSP-04, RSP-06, RSP-07, RSP-08, RSP-10 (medição)

**Tools**:

- MCP: NONE
- Skill: `dev-up` (API no Docker)

**Done when**:

- [x] Percorre `/login`, `/dashboard` (+ painel "Silenciados" aberto, + justificativa de um alerta aberta pelo "+"), `/obras` (+ "Nova obra", + `details` abertos), `/gesseiros` (+ extrato, + "Novo gesseiro"), `/estoque` (+ "Registrar entrada/saida", + "Novo material", + vindo do "Resolver" de um alerta com `?alerta=&material=&quantidade=`), ou seja, 14 estados, em 320, 360, 390, 768, 1024 e 1366px, com `isMobile`/`hasTouch` nas larguras ≤ 768
- [x] **Fixture** (`apps/api/scripts/fixture-auditoria.mjs`, Prisma Client do container, rodado pela auditoria com `docker exec gesso_api node scripts/fixture-auditoria.mjs preparar|limpar`):
  - `preparar` primeiro apaga qualquer resto `[audit]`. Depois cria dois materiais `[audit] Alerta ativo` (saldo 0, mínimo 10) e `[audit] Silenciado`, uma `AnaliseEstoque` `MANUAL`/`SUCESSO` com `iniciadoEm` em 2000-01-01, um `AlertaEstoque` `ATIVO` `REPOSICAO` com justificativa no primeiro material e um `AlertaEstoque` `DISPENSADO` com `dispensadoEm` = agora no segundo. Imprime em JSON `{ alertaId, materialId, quantidade }`
  - A análise com data de 2000 nunca vira a "última análise" (as consultas ordenam por `iniciadoEm desc`), então não muda o aviso do dashboard nem o catch-up do agendador (`agendador-agente.service.ts:54-58`). O agente LLM não é chamado
  - `limpar` apaga alertas, análise e materiais `[audit]`. A auditoria chama `limpar` num `finally`, inclusive quando falha ou é interrompida (`SIGINT`); ao terminar, nenhum `[audit]` sobra no banco (conferido pela própria auditoria)
  - Mesmo aviso do e2e no Handoff: não rodar durante uma análise real nem perto de uma demonstração do agente
- [x] **Estado não montado é falha, nunca "pulado"**: para cada um dos 14 estados, a auditoria confere que o estado foi de fato montado antes de medir. Exemplos: o painel `#painel-silenciados` visível com o material `[audit] Silenciado`; a `.justificativa` do alerta `[audit]` visível; `[data-testid="aviso-alerta"]` visível no `/estoque` do "Resolver"; o formulário e o extrato abertos. Se algum não montar (fixture falhou, elemento não apareceu em 5 s), o estado sai como `NAO_MONTADO` no relatório e a auditoria **termina com código 1**, mesmo que as outras medidas tenham passado. Não existe status "pulado"
- [x] **Ajuste da revisão do L1**: a auditoria trata `SIGINT` e `SIGTERM` (limpa a fixture e sai com 130) e, no início de cada execução, conta e apaga restos `[audit]` antes do `preparar`. Prova: um `preparar` solto deixou 5 restos; a execução seguinte registrou "5 resto(s) [audit] de uma execução anterior: limpando" e terminou com `{"restos":0}`. Ctrl+C real não é disparável por automação no Windows; a limpeza do início cobre esse caso
- [x] **Trava de banco**: `fixture-auditoria.mjs` recusa (exit 3, sem abrir conexão, em `preparar`, `limpar` e `contar`) qualquer `DATABASE_URL` cujo host não seja `localhost`, `127.0.0.1`, `::1` ou `db`. Testado com host do Render, IP de rede, URL vazia e URL inválida (todos recusados) e com `db`/`localhost` (aceitos)
- [x] A auditoria nunca envia formulários: o `/estoque` do "Resolver" é só aberto, nunca salvo, para o alerta `[audit]` não ser resolvido
- [x] Mede: `scrollWidth == innerWidth`; `.tabela-wrap` rolando por dentro; `.nav` fixa com 4 links e topo ≤ 64px (≤ 900px); último filho de `.conteudo` acima da `.nav` no fim da rolagem; `font-size` ≥ 16 em `input/select/textarea` (≤ 900px); alvos do RSP-08 ≥ 44×44; extrato no topo da viewport depois de selecionar um gesseiro em 360px
- [x] Imprime um relatório por tela × largura (84 combinações) e sai com código 1 se qualquer medida falhar ou qualquer estado ficar `NAO_MONTADO`. A última linha resume `medidos: N/84, nao montados: M, falhas: F`; o gate só é verde com `84/84, 0, 0`
- [x] Rodado contra o código atual, **falha** e aponta os mesmos problemas da auditoria de 2026-11-09 (transbordo em 320–390px, topo esticado em 768px, inputs de 14px, alvos pequenos). Esse é o "vermelho" do ciclo
- [x] Screenshots em `apps/web/.audit/`, ignorado pelo git
- [x] `CHROME_PATH` configurável, com padrão do Chrome do Windows

**Tests**: browser (o próprio script é o teste)
**Gate**: browser (esperado vermelho nesta task; verde a partir do fim da fase)

**Commit**: `test(pwa): auditoria de responsividade com Chrome headless`

---

### T2: Grid sem transbordo e grades fluidas

**Status**: ✅ Concluída (L1)

**What**: Corrigir a causa do transbordo e deixar as grades e textos encolherem até 320px.
**Where**: `apps/web/src/index.css`
**Depends on**: T1
**Reuses**: regras existentes de `.app`, `.grade`, `.grade-resumo`, `.lista-alertas`, `.formulario`
**Requirement**: RSP-01, RSP-02, RSP-11; Edge Case de nomes com 120 caracteres

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] `.app` com `minmax(0, 1fr)` no desktop e no mobile
- [x] `minmax(min(Npx, 100%), 1fr)` em `.grade`, `.lista-alertas`, `.grade-resumo`, `.formulario` e `.formulario fieldset`
- [x] `overflow-wrap: anywhere` em `.card h2`, `.card h4`, `.cliente` e `.pessoa`; `overflow-wrap: break-word` em `.tabela td` (ajuste da revisão do L1: a tabela rola por dentro, então só quebra palavra maior que a coluna, sem "Regulado/res")
- [x] `.app` e `.login` com `min-height: 100vh` seguido de `min-height: 100dvh`
- [x] Hover com `translateY` só em `@media (hover: hover)`
- [x] A auditoria passa nas medidas RSP-01 e RSP-02 em todas as telas e larguras (as outras medidas ainda podem falhar). _Nota L1: RSP-02 verde em 84/84. No RSP-01 o conteúdo deixou de transbordar (com o topo escondido, 0 falhas de RSP-01/02 em 84/84), mas o topo atual (logo + 4 ícones + avatar + Sair, ~417px) ainda transborda em 320–390px. É a causa nº 2 do Problem Statement e o escopo da T3, que fecha o RSP-01._
- [x] Gate quick do web: 147 testes passando

**Tests**: browser
**Gate**: browser + quick (web)

**Commit**: `fix(web): grid e grades encolhem ate 320px sem transbordar`

---

### T3: Barra de navegação inferior e topo compacto

**Status**: ✅ Concluída (L1)

**What**: No ≤ 900px, o mesmo `<nav>` vira barra inferior fixa com rótulos curtos, e o topo fica com até 64px e respeita a safe area. No desktop nada muda.
**Where**: `apps/web/src/components/Layout.tsx`, `apps/web/src/index.css`, `apps/web/index.html` (`viewport-fit=cover`), `apps/web/src/components/Layout.test.tsx` (novo)
**Depends on**: T2
**Reuses**: `abas` e `NavLink` atuais, `Icone`
**Requirement**: RSP-03, RSP-04, RSP-05, RSP-06, RSP-12; Edge Case de troca de largura sem recarregar

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] `abas` com `rotuloCurto` ("Geral", "Obras", "Equipe", "Estoque"); cada link com `.rotulo` e `.rotulo-curto`
- [x] CSS ≤ 900px: `.nav` fixa embaixo em grade de 4 colunas, padding com `env(safe-area-inset-bottom)`; `.app` com `grid-template-rows: auto 1fr`; topo com `56px + env(safe-area-inset-top)`; `.marca-texto` escondido; `.conteudo` com padding inferior de `--altura-nav + safe-area-inset-bottom + 16px`
- [x] `index.html` com `viewport-fit=cover`
- [x] `Layout.test.tsx`: 4 links com rótulo longo e curto, aba da rota atual com `ativo`, "Sair" presente
- [x] A auditoria passa em RSP-01..06 em todas as telas e larguras; em 1024 e 1366px a sidebar continua lateral com os rótulos atuais
- [x] Gate quick do web: ≥ 147 + novos testes passando

**Tests**: unit + browser
**Gate**: browser + quick (web)

**Commit**: `feat(web): barra de navegacao inferior e topo compacto no celular`

---

### T4: Alvos de toque e campos de 16px

**Status**: ✅ Concluída (L1)

**What**: Áreas de toque de 44×44 e fonte de 16px nos campos no mobile ou em tela de toque.
**Where**: `apps/web/src/index.css`
**Depends on**: T3
**Reuses**: classes existentes `.nav-link`, `.btn-sair`, `.chip`, `.btn-detalhes`, `.btn-icone` ("Ver silenciados"), `.card-obra summary`, `.linha-form .btn-texto`
**Requirement**: RSP-07, RSP-08

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] `@media (max-width: 900px), (pointer: coarse)`: `input, select, textarea { font-size: 16px }`
- [x] ≤ 900px: `min-height/min-width: 44px` nos alvos do RSP-08, mais a regra para `.btn-instalar` (o botão chega na T25)
- [x] A auditoria passa por inteiro, exceto a medida do RSP-10 (fica para a T5). _Nota L1: os campos de 16px alargavam o `/login` em 320px (337px e depois 321px), porque `.login` e `.login-area` usavam faixa `1fr`/`auto` (mínimo = min-content). Os dois passaram a `minmax(0, 1fr)` no bloco `max-width: 860px`, a mesma correção que a T2 fez no `.app`._
- [x] Gate quick do web passando

**Tests**: browser
**Gate**: browser + quick (web)

**Commit**: `fix(web): alvos de toque de 44px e campos de 16px no celular`

---

### T5: Linha do gesseiro clicável e rolagem até o extrato

**Status**: ✅ Concluída (L1)

**What**: A linha inteira abre o extrato; no ≤ 760px a página rola até o card do extrato.
**Where**: `apps/web/src/pages/Gesseiros.tsx`, `apps/web/src/pages/Gesseiros.test.tsx`
**Depends on**: T1
**Reuses**: `abrirExtrato()` atual
**Requirement**: RSP-09, RSP-10

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] `onClick` no `li`; o botão do nome continua (teclado/leitor de tela), sem abrir o extrato duas vezes
- [x] Depois de carregar o extrato, `matchMedia('(max-width: 760px)')` verdadeiro chama `scrollIntoView({ block: 'start', behavior: 'smooth' })` no card; falso não chama
- [x] Testes: clicar no telefone (fora do nome) abre o extrato; `scrollIntoView` chamado com `matchMedia` verdadeiro e não chamado com falso; um clique no nome = uma chamada a `/gesseiros/:id/extrato`
- [x] A auditoria passa por inteiro em todas as telas e larguras (fim da fase 1). _Nota L1: o `scroll-margin-top` do card do extrato (previsto no design de `Gesseiros`) ficou em `apps/web/src/index.css`, no bloco `max-width: 760px`, que está fora do `Where` da T5. Sem ele, o card parava atrás do topo fixo._
- [x] Gate quick do web passando

**Tests**: unit + browser
**Gate**: browser + quick (web)

**Commit**: `feat(web): linha do gesseiro clicavel e rolagem ate o extrato no celular`

---

### T6: Tabela `chaves_idempotencia`

**Status**: ✅ Concluída (L2)

**What**: Model `ChaveIdempotencia` e a migration.
**Where**: `apps/api/prisma/schema.prisma`, `apps/api/prisma/migrations/<timestamp>_chaves_idempotencia/` (gerada)
**Depends on**: None
**Reuses**: convenções do schema (`@@map` em snake_case, `@default(uuid())`)
**Requirement**: IDP-02, IDP-05

**Tools**:

- MCP: NONE
- Skill: `dev-up`

**Done when**:

- [x] Model igual ao design: `chave @db.Uuid`, `usuarioId`, `rota`, `hashCorpo @db.Char(64)`, `statusHttp Int`, `resposta Json`, `criadoEm`; `@@unique([usuarioId, rota, chave])`, `@@index([criadoEm])`, `@@map("chaves_idempotencia")`; sem enum de status
- [x] `docker exec gesso_api npx prisma migrate dev --name chaves_idempotencia` aplicada; Prisma Client regenerado
- [x] Gate build passando (API 251, web ≥ 147)

**Tests**: none
**Gate**: build

**Commit**: `feat(api): tabela de chaves de idempotencia`

---

### T7: Hash canônico do corpo

**Status**: ✅ Concluída (L2)

**What**: `hashCorpo(body)`, SHA-256 hex de um JSON com as chaves ordenadas em qualquer profundidade.
**Where**: `apps/api/src/idempotencia/hash-corpo.ts`, `hash-corpo.spec.ts`
**Depends on**: None
**Reuses**: `node:crypto`
**Requirement**: IDP-03

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Mesmo conteúdo com ordem de chaves diferente (inclusive aninhada e em arrays de objetos) dá o mesmo hash
- [x] Valor diferente, chave a mais ou ordem diferente num array dá hash diferente
- [x] Corpo `undefined`/vazio tem hash estável; o hash tem 64 caracteres hex
- [x] Gate quick da API: 251 + novos testes passando

**Tests**: unit
**Gate**: quick (api)

**Commit**: `feat(api): hash canonico do corpo para idempotencia`

---

### T8: Decorators `@ContextoIdempotencia()` e `@ApiIdempotencia()`

**Status**: ✅ Concluída (L2)

**What**: O param decorator monta `{ chave, usuarioId, rota, hashCorpo }` ou `null`; o decorator do Swagger documenta o cabeçalho. Também os tipos `ContextoIdempotencia` e `ClientePrisma`.
**Where**: `apps/api/src/idempotencia/contexto-idempotencia.decorator.ts` (+ `.spec.ts`), `api-idempotencia.decorator.ts`, `tipos.ts`
**Depends on**: T7
**Reuses**: `createParamDecorator` do Nest; `req.user.id` (`jwt.strategy.ts`); `hashCorpo` (T7)
**Requirement**: IDP-06; IDP-02 (escopo por usuário e rota); validação de UUID (design)

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Sem `Idempotency-Key`: `null`
- [x] Cabeçalho que não é UUID: `BadRequestException` com a mensagem exata "Idempotency-Key deve ser um UUID."
- [x] `rota` = `` `${method} ${req.path}` `` (path real, sem query string); `usuarioId` = `req.user.id`; `hashCorpo` = `hashCorpo(req.body)`
- [x] Testes por ramo, com a fábrica do decorator extraída (`extrairContexto(ctx)`) para testar sem HTTP
- [x] Gate quick da API passando

**Tests**: unit
**Gate**: quick (api)

**Commit**: `feat(api): contexto de idempotencia a partir do cabecalho`

---

### T9: `IdempotenciaService` e módulo global

**Status**: ✅ Concluída (L2)

**What**: `executar(ctx, criar)` com transação única, trava consultiva, replay, 422, 409 e limpeza por cron; `IdempotenciaModule` `@Global()` registrado no `AppModule`.
**Where**: `apps/api/src/idempotencia/idempotencia.service.ts` (+ `.spec.ts`), `idempotencia.module.ts`, `apps/api/src/app.module.ts`
**Depends on**: T6, T7
**Reuses**: `PrismaService`, `ScheduleModule` já registrado, estilo de `obras.service.spec.ts`
**Requirement**: IDP-02, IDP-03, IDP-04, IDP-05, IDP-06

**Tools**:

- MCP: NONE
- Skill: `implementar-todo` (padrão de service + spec)

**Done when**:

- [x] `ctx === null`: chama `criar(this.prisma)` e **não** abre `$transaction` (IDP-06)
- [x] Com `ctx`: tudo dentro de um único `$transaction(fn, { timeout: 15_000 })`. A ordem é a do design: trava, `findUnique`, `criar(tx)`, `create` da chave
- [x] Trava negada: `ConflictException('Este envio ainda está sendo processado.')`, sem chamar `criar` nem `create` (IDP-04)
- [x] Chave existente < 24 h com outro hash: `UnprocessableEntityException('Esta Idempotency-Key já foi usada com outros dados.')`, sem `criar` (IDP-03)
- [x] Chave existente < 24 h com o mesmo hash: devolve `resposta` guardada, sem `criar` nem `create` (IDP-02)
- [x] Chave existente com 24 h + 1 ms: `delete` e segue como nova (IDP-05); com 24 h − 1 ms: ainda vale
- [x] `criar` recebe o `tx` (não o `this.prisma`); a resposta gravada é `JSON.parse(JSON.stringify(resultado))` (teste com `Decimal`/`Date`) e `statusHttp: 201`
- [x] Erro em `criar`: sobe o mesmo erro e `create` da chave não é chamado
- [x] `P2002` no `create` da chave: `ConflictException`
- [x] `limparVencidas()` com `deleteMany({ where: { criadoEm: { lt: agora − 24 h } } })`, com relógio fixo no teste
- [x] Gate quick da API passando

**Tests**: unit
**Gate**: quick (api)

**Commit**: `feat(api): servico de idempotencia com transacao unica e trava consultiva`

---

### T10: Gesseiros aceitam `tx`

**Status**: ✅ Concluída (L2)

**What**: `create(dto, tx)`, `registrarLancamento(id, dto, tx)` e `findOne(id, tx)` com `tx: ClientePrisma = this.prisma`.
**Where**: `apps/api/src/gesseiros/gesseiros.service.ts`, `gesseiros.service.spec.ts`
**Depends on**: T8 (tipo `ClientePrisma`)
**Reuses**: padrão `validarItens(itens, tx = this.prisma)` (`materiais-previstos.service.ts:25`)
**Requirement**: IDP-02 (atomicidade)

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Toda leitura e escrita dos 3 métodos usa o `tx`
- [x] Testes novos: com um `tx` mock separado, nenhuma chamada vai para o `prisma` do service; sem `tx`, comportamento de hoje
- [x] Os testes antigos de gesseiros continuam passando sem alteração de asserção
- [x] Gate quick da API passando

**Tests**: unit
**Gate**: quick (api)

**Commit**: `refactor(api): criacao de gesseiro e lancamento aceita transacao externa`

---

### T11: Obras aceitam `tx`

**Status**: ✅ Concluída (L2)

**What**: `ObrasService.create(dto, tx)` passa o `tx` para `validarItens` e `obra.create`.
**Where**: `apps/api/src/obras/obras.service.ts`, `obras.service.spec.ts`
**Depends on**: T8
**Reuses**: `validarItens(itens, tx)` existente
**Requirement**: IDP-02 (atomicidade)

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Com `tx`: `validarItens` recebe o `tx` e `tx.obra.create` é chamado; o `prisma` do service não é tocado
- [x] Sem `tx`: comportamento de hoje (testes antigos inalterados)
- [x] Gate quick da API passando

**Tests**: unit
**Gate**: quick (api)

**Commit**: `refactor(api): criacao de obra aceita transacao externa`

---

### T12: Estoque aceita `tx` sem transação aninhada

**Status**: ✅ Concluída (L2)

**What**: `criarMaterial(dto, tx)` e `movimentar(dto, tx?)` com o corpo da transação extraído para `movimentarCom(tx, dto)`.
**Where**: `apps/api/src/estoque/estoque.service.ts`, `estoque.service.spec.ts`
**Depends on**: T8
**Reuses**: guarda atômica de saldo atual (`updateMany ... gte`)
**Requirement**: IDP-02 (atomicidade); risco "transação aninhada" do design

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] `movimentar(dto, tx)`: chama `movimentarCom(tx, dto)` e **não** chama `prisma.$transaction` (teste explícito)
- [x] `movimentar(dto)` sem `tx`: continua abrindo `prisma.$transaction`
- [x] Leituras de validação (material, obra) também usam o `tx` quando informado
- [x] `criarMaterial` com `tx`: `tx.material.create`; o `P2002` continua virando o mesmo `ConflictException`
- [x] Testes antigos de estoque (saldo insuficiente, corrida com `count === 0`, EST-09) continuam passando
- [x] Gate quick da API passando

**Tests**: unit
**Gate**: quick (api)

**Commit**: `refactor(api): movimentacao e material aceitam transacao externa`

---

### T13: CORS compartilhado com `Idempotency-Key`

**Status**: ✅ Concluída (L2)

**What**: `configurarCors(app)` com `allowedHeaders` explícito, usado pelo `main.ts`. Incluir a porta 4173 no `CORS_ORIGIN` padrão. Teste e2e de preflight.
**Where**: `apps/api/src/cors.ts` (novo), `apps/api/src/main.ts`, `docker-compose.yml`, `.env.example`, `apps/api/test/idempotencia.e2e-spec.ts` (novo, primeiro caso)
**Depends on**: None (dentro da fase)
**Reuses**: config atual de `main.ts:11-14`; padrão de `test/app.e2e-spec.ts`
**Requirement**: IDP-09

**Tools**:

- MCP: NONE
- Skill: `dev-up`

**Done when**:

- [x] `allowedHeaders: ['Content-Type', 'Authorization', 'Idempotency-Key']`; `origin` e `credentials` iguais aos de hoje
- [x] `main.ts` chama `configurarCors(app)`; não há mais `enableCors` direto
- [x] `CORS_ORIGIN` padrão `http://localhost:5173,http://localhost:4173` no `docker-compose.yml` e no `.env.example`
- [x] e2e: a app de teste chama `configurarCors(app)`; `OPTIONS /api/gesseiros/:id/lancamentos` com `Origin: http://localhost:5173` e `Access-Control-Request-Headers: content-type,authorization,idempotency-key` responde 204 com `idempotency-key` em `Access-Control-Allow-Headers` (comparação sem maiúsculas)
- [x] Gate full da API passando

**Tests**: e2e
**Gate**: full (api)

**Commit**: `feat(api): cors aceita Idempotency-Key e o vite preview`

---

### T14: Rotas de criação idempotentes + e2e

**Status**: ✅ Concluída (L2)

**What**: As 5 rotas de criação chamam `idempotencia.executar(ctx, (tx) => service.metodo(..., tx))` com `@ApiIdempotencia()`; e2e completo da idempotência.
**Where**: `apps/api/src/gesseiros/gesseiros.controller.ts`, `apps/api/src/obras/obras.controller.ts`, `apps/api/src/estoque/estoque.controller.ts`, `apps/api/test/idempotencia.e2e-spec.ts`
**Depends on**: T10, T11, T12, T13
**Reuses**: `IdempotenciaService` (T9), decorators (T8)
**Requirement**: IDP-02, IDP-03, IDP-04, IDP-06 (de ponta a ponta)

**Tools**:

- MCP: NONE
- Skill: `dev-up`

**Done when**:

- [x] `POST /gesseiros`, `/gesseiros/:id/lancamentos`, `/obras`, `/estoque/materiais` e `/estoque/movimentacoes` com `@ApiIdempotencia()` e `executar()`; `AlocarGesseiro` e o agente não mudam
- [x] e2e (dados `[e2e]` apagados no `afterAll`): mesma chave e corpo duas vezes, um `Lancamento` e as duas respostas iguais com 201; mesma chave e outro valor dá 422 e um lançamento; dois POST simultâneos (o primeiro atrasado por `overrideProvider`) dão um 201, um 409 e um lançamento; erro depois do `INSERT` não deixa lançamento nem chave, e o reenvio com a mesma chave grava um; sem cabeçalho, dois POST dão dois lançamentos; mesma chave em `/estoque/movimentacoes` move o saldo uma vez só
- [x] Nenhum `[e2e]` sobra no banco depois do teste
- [x] **Ajuste da revisão do L2**: sem `Idempotency-Key`, o `executar` chama `criar()` sem cliente (não `criar(this.prisma)`). Assim cada service usa o próprio `this.prisma` e o `movimentar()` volta a abrir a sua `$transaction` (saldo + movimentação atômicos, como antes da feature). Prova: `idempotencia.service.spec.ts` "chama criar sem cliente" (`criar.mock.calls[0]` igual a `[]`) + o teste antigo de `movimentar(dto)` que exige `$transaction` 1 vez
- [x] Gate full da API passando (fim das fases 2 e 3)

**Tests**: e2e
**Gate**: full (api) + build

**Commit**: `feat(api): rotas de criacao idempotentes`

---

### T15: Gerador de UUID com fallback

**Status**: ✅ Concluída (L3)

**What**: `gerarUuid()`: `crypto.randomUUID()` quando existe; senão v4 com `getRandomValues`.
**Where**: `apps/web/src/lib/uuid.ts`, `uuid.test.ts`
**Depends on**: None
**Reuses**: NONE
**Requirement**: IDP-01

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Com `randomUUID`: usa ele
- [x] Sem `randomUUID`: devolve string que casa `^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$`; 1000 chamadas sem repetição
- [x] Gate quick do web passando

**Tests**: unit
**Gate**: quick (web)

**Commit**: `feat(web): gerador de uuid com fallback fora de contexto seguro`

---

### T16: Sessão limpa o cache

**Status**: ✅ Concluída (L3)

**What**: `lib/sessao.ts` com `NOME_CACHE_API`, `limparCacheApi`, `encerrarSessao` e `iniciarSessao`; o `sair()` do `Layout` passa a usar `encerrarSessao`.
**Where**: `apps/web/src/lib/sessao.ts` (+ `sessao.test.ts`), `apps/web/src/components/Layout.tsx`, `Layout.test.tsx`
**Depends on**: None
**Reuses**: `auth` de `lib/api.ts`
**Requirement**: OFF-11 (Sair), OFF-12

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] `limparCacheApi()` chama `caches.delete('api-dados')`; sem `caches` no `window`, não falha; com `caches.delete` rejeitando, não falha
- [x] `encerrarSessao()` remove token e usuário **e** apaga o cache; `iniciarSessao(resposta)` apaga o cache **antes** de gravar token e usuário (ordem testada)
- [x] `Layout`: clicar em "Sair" espera `encerrarSessao()` e então navega para `/login` (teste com `caches` mockado)
- [x] Gate quick do web passando

**Tests**: unit
**Gate**: quick (web)

**Commit**: `feat(web): login e logout apagam o cache de dados`

---

### T17: Estado de conexão

**Status**: ✅ Concluída (L3)

**What**: `lib/conexao.ts` com `registrarOrigem`, `estaDesatualizado`, `assinar`, `useDesatualizado` e `useAoReconectar`.
**Where**: `apps/web/src/lib/conexao.ts`, `conexao.test.ts`
**Depends on**: None
**Reuses**: NONE
**Requirement**: OFF-06, OFF-07, OFF-15

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Desatualizado quando `navigator.onLine === false` ou a última origem foi `'cache'`; volta a falso com `registrarOrigem('rede')` e online
- [x] Assinantes notificados em `registrarOrigem`, `online` e `offline`; o retorno de `assinar` cancela
- [x] `useDesatualizado` re-renderiza nas mudanças (`renderHook`)
- [x] `useAoReconectar(fn)` chama `fn` uma vez por evento `online`, não chama em `offline` e remove o listener ao desmontar
- [x] Gate quick do web passando

**Tests**: unit
**Gate**: quick (web)

**Commit**: `feat(web): estado de conexao e dados vindos do cache`

---

### T18: Cliente HTTP para offline, cache e idempotência

**Status**: ✅ Concluída (L3)

**What**: `lib/api.ts`: falha de rede vira `ApiError(…, 0)` com a mensagem por método; GET 200 registra a origem pelo `X-From-Cache`; 401 chama `encerrarSessao()`; `post` aceita `{ idempotencyKey }`.
**Where**: `apps/web/src/lib/api.ts`, `apps/web/src/lib/api.test.ts` (novo)
**Depends on**: T16, T17
**Reuses**: `request()` atual
**Requirement**: OFF-04 (leitura do marcador), OFF-05, OFF-08 (mensagem), OFF-11 (401), IDP-01 (cabeçalho)

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] `fetch` rejeitando com `TypeError` num GET: `ApiError` status 0 e mensagem exata "Sem conexão e sem dados salvos desta tela neste aparelho."
- [x] O mesmo em POST/PATCH/PUT/DELETE: mensagem exata "Sem conexão: não foi possível confirmar o envio. Tente de novo; o mesmo lançamento não será duplicado."
- [x] GET 200 com `X-From-Cache: 1` chama `registrarOrigem('cache')`; sem o cabeçalho, `registrarOrigem('rede')`; escrita não registra
- [x] 401: `encerrarSessao()` é aguardado antes do erro "Sessao expirada. Faca login novamente."
- [x] `api.post(caminho, corpo, { idempotencyKey: 'k' })` manda `Idempotency-Key: k`; sem opção, não manda
- [x] 409 e 422 sobem como `ApiError` com o `status` certo
- [x] `grep -rn "auth.logout" apps/web/src` só encontra `lib/sessao.ts` (AD-010)
- [x] Gate quick do web passando

**Tests**: unit
**Gate**: quick (web)

**Commit**: `feat(web): cliente http trata sem conexao, cache e Idempotency-Key`

---

### T19: `useEnvio` com chave de idempotência

**Status**: ✅ Concluída (L3)

**What**: O hook ganha `chave` e trata 0/409/422 conforme o spec.
**Where**: `apps/web/src/lib/useEnvio.ts`, `useEnvio.test.ts`
**Depends on**: T15, T18
**Reuses**: `useEnvio` atual
**Requirement**: IDP-01, IDP-07, IDP-08, OFF-08

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] `chave` criada na montagem e estável entre renders; `enviar(fn)` passa a `chave` para `fn`
- [x] `useEnvio(recurso?)`: quando `recurso` muda com o hook montado (`rerender` com outro valor), a chave é trocada; re-render com o mesmo `recurso` mantém a chave; a montagem não gera duas chaves
- [x] Depois de uma falha de rede (chave mantida), a troca de `recurso` ainda gera chave nova: o reenvio para o outro recurso nunca reusa a chave do primeiro
- [x] Sucesso: `true` e chave nova
- [x] 422: `false`, erro exato "O envio anterior pode ter sido gravado com outros dados. Confira a lista antes de enviar de novo." e chave nova
- [x] 409 com `codigo` `EM_PROCESSAMENTO`: `false`, erro exato "Este envio ainda está sendo processado. Aguarde alguns segundos e tente de novo." e mesma chave
- [x] **Ajuste da revisão do L3**: qualquer outro 409 (sem `codigo`, com outro `codigo` ou só com o mesmo texto) mostra a mensagem da API e mantém a chave. A API manda o `codigo` (`idempotencia.service.ts`, `CODIGO_EM_PROCESSAMENTO`; commit aditivo, e2e do 409 simultâneo exige `body.codigo`); o `api.ts` o expõe em `ApiError.codigo`
- [x] Status 0: `false`, mensagem do `ApiError` e mesma chave
- [x] Outros erros: como hoje; mesma chave
- [x] Os testes antigos do hook continuam passando
- [x] Gate quick do web passando

**Tests**: unit
**Gate**: quick (web)

**Commit**: `feat(web): envio de formulario com chave de idempotencia`

---

### T20: Formulários de criação mandam a chave

**Status**: ✅ Concluída (L3)

**What**: Os 5 formulários de criação passam a `chave` do `useEnvio` no `api.post`. É a mesma mudança de uma linha em 5 arquivos.
**Where**: `apps/web/src/components/forms/` → `NovoGesseiroForm.tsx`, `LancamentoForm.tsx`, `NovaObraForm.tsx`, `NovoMaterialForm.tsx`, `MovimentacaoForm.tsx` (+ os 5 `.test.tsx`)
**Depends on**: T19
**Reuses**: `useEnvio` (T19)
**Requirement**: IDP-01

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Cada formulário chama `api.post(caminho, corpo, { idempotencyKey: chave })`
- [x] Teste por formulário: o primeiro envio leva uma chave; um reenvio depois de falha de rede leva a **mesma** chave e os campos continuam preenchidos; depois do sucesso, o próximo envio leva outra chave
- [x] `LancamentoForm` passa `gesseiroId` ao `useEnvio`, e `MovimentacaoForm` passa `inicial?.materialId`
- [x] Teste do `LancamentoForm` sem desmontar (`rerender` com outro `gesseiroId`, sem `key`): falha de rede no gesseiro A e depois envio no gesseiro B; o POST de B vai para `/gesseiros/B/lancamentos` com uma chave **diferente** da usada em A
- [x] Teste do `MovimentacaoForm`: `rerender` com outro `inicial` (como o "Resolver" de outro alerta com o formulário aberto) faz o próximo envio levar outra chave
- [x] **Ajuste da revisão do L3**: `Estoque.tsx` monta o `MovimentacaoForm` com `key={entrada?.materialId}`, para outro alerta com o formulário aberto trocar campos e chave juntos. Teste: `pages/Estoque.test.tsx` "outro alerta com o formulário aberto troca os campos e a chave juntos" (falha de rede no material A, navegação para o alerta de B sem desmontar o Estoque: campos de B e outra chave). Sem o `key`, o teste falha (conferido)
- [x] `AlocarGesseiroForm` não muda
- [x] Gate quick do web passando (fim da fase 4)

**Tests**: unit
**Gate**: quick (web) + build

**Commit**: `feat(web): formularios de criacao enviam Idempotency-Key`

---

### T21: Login offline e limpeza no login

**Status**: ✅ Concluída (L3)

**What**: `Login.tsx` usa `iniciarSessao()` no sucesso e mostra a mensagem de sem conexão.
**Where**: `apps/web/src/pages/Login.tsx`, `Login.test.tsx`
**Depends on**: T16
**Reuses**: `iniciarSessao` (T16)
**Requirement**: OFF-12, OFF-13

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Sucesso: `iniciarSessao(resposta)` aguardado **antes** do `navigate('/')`
- [x] `ApiError` status 0: `.erro` com o texto exato "Sem conexão. Conecte-se à internet para entrar."; o e-mail digitado continua no campo; o campo de senha fica vazio
- [x] Outros erros: mensagem da API, como hoje
- [x] Gate quick do web passando

**Tests**: unit
**Gate**: quick (web)

**Commit**: `feat(web): login avisa sem conexao e comeca com cache limpo`

---

### T22: Indicador de conexão no topo

**What**: `IndicadorConexao` com o ícone `wifi-off` vermelho, no topo ao lado do avatar.
**Where**: `apps/web/src/components/IndicadorConexao.tsx` (+ `.test.tsx`), `apps/web/src/components/Icone.tsx`, `apps/web/src/components/Layout.tsx`, `apps/web/src/index.css`
**Depends on**: None (dentro da fase; usa T17)
**Reuses**: `useDesatualizado` (T17), `Icone`
**Requirement**: OFF-06, OFF-07

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Desatualizado: renderiza `role="img"` com `aria-label` e `title` exatos "Dados possivelmente desatualizados" e nenhum texto visível
- [ ] Não desatualizado: não renderiza nada
- [ ] Testes: offline mostra; `registrarOrigem('cache')` mostra; `registrarOrigem('rede')` com online esconde
- [ ] Cor `var(--alerta)`; aparece no topo mobile e na área do usuário da sidebar
- [ ] Gate quick do web passando

**Tests**: unit
**Gate**: quick (web)

**Commit**: `feat(web): icone de dados possivelmente desatualizados`

---

### T23: Telas recarregam ao reconectar

**What**: `useAoReconectar(carregar)` em `Dashboard`, `Obras`, `Gesseiros` (lista + extrato aberto), `Estoque` e `AlertasEstoque`.
**Where**: `apps/web/src/pages/` → `Dashboard.tsx`, `Obras.tsx`, `Gesseiros.tsx`, `Estoque.tsx`; `apps/web/src/components/AlertasEstoque.tsx` (+ testes de cada um)
**Depends on**: None (dentro da fase; usa T17)
**Reuses**: `carregar()` de cada tela
**Requirement**: OFF-15

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Em cada tela, `window.dispatchEvent(new Event('online'))` chama de novo o GET da tela (`api.get` mockado)
- [ ] Teste em `Estoque` e `Gesseiros`: com um formulário aberto e preenchido, o evento `online` recarrega os dados e o formulário continua aberto com os valores
- [ ] `Gesseiros` com extrato aberto: o extrato também é buscado de novo
- [ ] Gate quick do web passando

**Tests**: unit
**Gate**: quick (web)

**Commit**: `feat(web): telas buscam os dados de novo quando a conexao volta`

---

### T24: Estado de instalação

**What**: `lib/instalacao.ts` com `iniciarCapturaInstalacao()` e `useInstalacao()`.
**Where**: `apps/web/src/lib/instalacao.ts`, `instalacao.test.ts`
**Depends on**: None
**Reuses**: NONE
**Requirement**: PWA-05, PWA-06, PWA-07, PWA-08, PWA-09, PWA-10

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] `beforeinstallprompt` chama `preventDefault()` e o modo vira `'prompt'`
- [ ] `instalar()` chama `prompt()`, aguarda `userChoice` e o modo vira `null` tanto em `accepted` quanto em `dismissed`; um novo `beforeinstallprompt` volta a `'prompt'`
- [ ] `appinstalled` vira `null`
- [ ] `display-mode: standalone` ou `navigator.standalone`: `null`, mesmo com evento
- [ ] UA de iPhone/iPad Safari (e `MacIntel` com `maxTouchPoints > 1`): `'ios'`; com `CriOS`/`FxiOS`/`EdgiOS`: `null`; Firefox desktop sem evento: `null`
- [ ] Gate quick do web passando

**Tests**: unit
**Gate**: quick (web)

**Commit**: `feat(web): captura do convite de instalacao do navegador`

---

### T25: Botão "Instalar app"

**What**: `BotaoInstalar` (prompt e instrução do iOS) no topo mobile e na área do usuário da sidebar; ícone `instalar`.
**Where**: `apps/web/src/components/BotaoInstalar.tsx` (+ `.test.tsx`), `apps/web/src/components/Icone.tsx`, `apps/web/src/components/Layout.tsx`, `apps/web/src/index.css`
**Depends on**: T24
**Reuses**: `useInstalacao` (T24), estilo de `.painel-silenciados`
**Requirement**: PWA-05, PWA-06, PWA-08, PWA-09, PWA-10, RSP-08 (alvo do botão)

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] `modo === null`: nada renderizado
- [ ] `'prompt'`: botão com nome acessível "Instalar app"; clique chama `instalar()`
- [ ] `'ios'`: o clique abre o texto exato "Toque em Compartilhar e depois em Adicionar à Tela de Início"; Esc ou clique fora fecha
- [ ] `.btn-instalar` com 44×44 no ≤ 900px (regra da T4)
- [ ] Gate quick do web passando; auditoria de responsividade continua verde (fim da fase 5)

**Tests**: unit + browser
**Gate**: quick (web) + browser

**Commit**: `feat(web): botao instalar app e instrucao para iphone`

---

### T26: Ícones do app

**What**: Script que renderiza o SVG da marca em PNG e os ícones em `public/`; `index.html` com `apple-touch-icon` e `apple-mobile-web-app-title`.
**Where**: `apps/web/scripts/gerar-icones.mjs` (novo), `apps/web/public/icone-192.png`, `icone-512.png`, `icone-512-maskable.png`, `apple-touch-icon.png` (gerados), `apps/web/index.html`
**Depends on**: None (dentro da fase; usa o `puppeteer-core` da T1)
**Reuses**: SVG do favicon em `index.html`
**Requirement**: PWA-01 (ícones), PWA-02

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] PNGs com as dimensões exatas 192×192, 512×512, 512×512 e 180×180 (conferidas pelo próprio script, que lê o cabeçalho IHDR do PNG)
- [ ] Maskable com fundo cheio `#1f6f5c` e desenho dentro do círculo de 80% (conferido visualmente e registrado no commit)
- [ ] `index.html` com `<link rel="apple-touch-icon" href="/apple-touch-icon.png">` e `<meta name="apple-mobile-web-app-title" content="Gesso">`
- [ ] Gate build passando

**Tests**: none
**Gate**: build

**Commit**: `feat(web): icones do app instalavel`

---

### T27: Regras de cache do service worker (puras)

**What**: `src/pwa/regras-cache.ts` com `ehRequisicaoDeDados`, `pluginRecebimento`, `origensApi` e as constantes (`NOME_CACHE_API` reexportada de `sessao.ts`, `SETE_DIAS`).
**Where**: `apps/web/src/pwa/regras-cache.ts`, `regras-cache.test.ts` (`@jest-environment node`)
**Depends on**: None
**Reuses**: `NOME_CACHE_API` (T16)
**Requirement**: OFF-02, OFF-04, OFF-09, OFF-10

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] `ehRequisicaoDeDados`: GET `/api/obras` da origem da API é verdadeiro; o mesmo com query string é verdadeiro; POST/PATCH/PUT/DELETE são falsos; `/api/auth/login` é falso; outra origem é falsa; `/assets/x.js` é falso
- [ ] `cacheWillUpdate`: 200 devolve cópia com `X-Recebido-Em` numérico e o mesmo corpo; 404/500 devolvem `null`
- [ ] `cachedResponseWillBeUsed`: recebida há exatamente 7 dias devolve a resposta; 7 dias + 1 ms devolve `null`; sem `X-Recebido-Em`, `null`; resposta válida sai com `X-From-Cache: 1` e corpo intacto
- [ ] `origensApi('http://localhost:3000', 'http://localhost:4173')` devolve as duas; `undefined` ou igual à própria devolve uma
- [ ] Gate quick do web passando

**Tests**: unit
**Gate**: quick (web)

**Commit**: `feat(web): regras de cache de dados do service worker`

---

### T28: Service worker e manifest no build

**What**: `vite-plugin-pwa@1.3.0` em `injectManifest` com o manifest do spec; `src/sw.ts` com precache, fallback de navegação, `NetworkFirst` de dados, fontes, `skipWaiting` e `clientsClaim`; `tsconfig.sw.json`; manifest em `src/pwa/manifest.ts` testado.
**Where**: `apps/web/vite.config.ts`, `apps/web/src/sw.ts` (novo), `apps/web/src/pwa/manifest.ts` (+ `manifest.test.ts`), `apps/web/tsconfig.sw.json` (novo), `apps/web/tsconfig.json` (excluir `src/sw.ts`), `apps/web/package.json` (`vite-plugin-pwa`, `workbox-core`, `-precaching`, `-routing`, `-strategies`, `-expiration`, `-cacheable-response` `@7.4.1`; `build` também roda `tsc -p tsconfig.sw.json`)
**Depends on**: T26, T27
**Reuses**: `regras-cache.ts` (T27)
**Requirement**: PWA-01, PWA-03 (escopo), PWA-04, OFF-01, OFF-03, OFF-14, UPD-02; fontes em cache (assumption)

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] `manifest.test.ts`: `id` "/", `name` "Gesso Manager", `short_name` "Gesso", `lang` "pt-BR", `start_url` e `scope` "/", `display` "standalone", `theme_color` "#0f2a24", `background_color` "#f3f5f4" e os 3 ícones com tamanhos e `purpose` exatos
- [ ] `injectRegister: false`, `devOptions.enabled: false`
- [ ] `sw.ts` registra exatamente o que o design lista: `NavigationRoute` com `denylist: [/^\/api\//]`; `NetworkFirst` com `networkTimeoutSeconds: 5`, `CacheableResponsePlugin([200])`, `ExpirationPlugin({ maxEntries: 200, maxAgeSeconds: 7 dias })` e `pluginRecebimento`; fontes conforme o design
- [ ] `npm run build --workspace apps/web` gera `dist/sw.js` e `dist/manifest.webmanifest`, e o manifest gerado é igual ao do teste
- [ ] `npm run dev` não gera nem registra SW (`/sw.js` em dev responde 404 ou o `index.html`)
- [ ] Gate quick do web + build passando

**Tests**: unit
**Gate**: quick (web) + build

**Commit**: `feat(web): service worker com cache de dados e manifest do pwa`

---

### T29: Registro do service worker

**What**: `src/pwa/registrar-sw.ts` (registro só no build de produção, sem recarregar a página) e `main.tsx` chamando `iniciarCapturaInstalacao()` e `registrarSw()`.
**Where**: `apps/web/src/pwa/registrar-sw.ts` (+ `.test.ts`), `apps/web/src/main.tsx`
**Depends on**: T28
**Reuses**: `iniciarCapturaInstalacao` (T24)
**Requirement**: PWA-03, PWA-04, UPD-01, UPD-03

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] `registrarSw({ prod: true })` com `serviceWorker` disponível chama `register('/sw.js', { scope: '/' })`
- [ ] `prod: false` não registra; sem `serviceWorker` no navegador não registra nem lança erro
- [ ] Nenhum listener de `controllerchange` ou chamada a `location.reload` (teste espia os dois)
- [ ] `main.tsx` chama `iniciarCapturaInstalacao()` antes do `render` e `registrarSw({ prod: import.meta.env.PROD })`
- [ ] Gate quick do web passando

**Tests**: unit
**Gate**: quick (web)

**Commit**: `feat(web): registro do service worker sem recarregar a pagina`

---

### T30: Build em chunk único e `sw.js` sem cache longo

**What**: Script que falha se o build tiver mais de um `.js` em `dist/assets` ou algum `import()` dinâmico (AD-010, UPD-04); `vercel.json` com `Cache-Control: no-cache` em `/sw.js`.
**Where**: `apps/web/scripts/checar-build.mjs` (novo), `apps/web/package.json` (`build` roda o checador no fim), `apps/web/vercel.json`
**Depends on**: T29
**Reuses**: NONE
**Requirement**: UPD-04; riscos "chunk velho" e "`sw.js` com cache longo" do design

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Build atual passa (um `.js` só)
- [ ] Com um `React.lazy` temporário numa tela, o build falha com mensagem citando a AD-010 (testado e revertido; registrado no commit)
- [ ] `vercel.json` com `headers` de `/sw.js`: `Cache-Control: no-cache`; os `rewrites` atuais continuam
- [ ] Gate build passando

**Tests**: none
**Gate**: build

**Commit**: `build(web): garante chunk unico e sw.js sem cache longo`

---

### T31: Auditoria do PWA no navegador

**What**: `audit-pwa.mjs` contra o `vite preview`, verificando o PWA de ponta a ponta com `page.setOfflineMode`; script `audit:pwa`.
**Where**: `apps/web/scripts/audit-pwa.mjs` (novo), `apps/web/package.json`
**Depends on**: T30
**Reuses**: login e Chrome do `audit-responsive.mjs` (T1)
**Requirement**: OFF-01, OFF-03, OFF-04, OFF-05, OFF-06, OFF-07, OFF-11, PWA-01, PWA-03 (de ponta a ponta)

**Tools**:

- MCP: NONE
- Skill: `dev-up`

**Done when**:

- [ ] SW ativo com escopo "/" e `manifest.webmanifest` servido com os campos do PWA-01 (PWA-03)
- [ ] Online: abre `/obras`, `/estoque` e um extrato; o cache `api-dados` tem as 3 URLs com `X-Recebido-Em`
- [ ] Offline + recarregar em `/estoque`: a página abre, a tabela mostra os materiais e o ícone com `aria-label` "Dados possivelmente desatualizados" aparece (OFF-01/04/06)
- [ ] Offline, extrato de um gesseiro nunca aberto: `.erro` com o texto do OFF-05
- [ ] Offline, `fetch('/api/obras')` direto pela página não recebe HTML (o fallback de navegação não responde `/api/**`)
- [ ] De volta online: a tela busca de novo e o ícone some (OFF-07/15)
- [ ] API lenta (requisição interceptada com atraso de 6 s): a tela mostra o cache e o ícone (OFF-03)
- [ ] "Sair": `caches.has('api-dados')` falso ou cache vazio (OFF-11)
- [ ] Sai com código ≠ 0 em qualquer falha; screenshots em `.audit/`
- [ ] Gate browser (as duas auditorias) + build passando (fim da fase 6)

**Tests**: browser
**Gate**: browser + build

**Commit**: `test(pwa): auditoria do service worker e da leitura offline`

---

## Phase Execution Map

```
Phase 1 → Phase 2 → Phase 3 → Phase 4 → Phase 5 → Phase 6

Phase 1:  T1 → T2 → T3 → T4 ;  T1 → T5
Phase 2:  T6 → T9 ;  T7 → T8 ;  T7 → T9
Phase 3:  T10, T11, T12, T13 → T14
Phase 4:  T15 → T19 → T20 ;  T16 → T18 → T19 ;  T17 → T18 ;  T16 → T21
Phase 5:  T22 ;  T23 ;  T24 → T25
Phase 6:  T26 → T28 ;  T27 → T28 → T29 → T30 → T31
```

Execução sequencial dentro de cada fase, na ordem dos números. 31 tasks em 6 fases. Lotes
sugeridos para sub-agentes (fases inteiras, em sequência, conforme a regra do Handoff):
**L1** fase 1 (5), **L2** fases 2 + 3 (9, toda a API), **L3** fase 4 (7), **L4** fases 5 + 6 (10).
L2 e L4 passam do orçamento de ~7: L2 é uma cadeia só da API, e L4 junta a instalação com o build
do PWA, que usa a captura da instalação (T29 → T24). Se preferir lotes menores, quebrar L4 em
fase 5 (4) e fase 6 (6).

---

## Task Granularity Check

| Task | Scope | Status |
| --- | --- | --- |
| T1: Auditoria de responsividade | 1 script + script npm + gitignore | ✅ Granular |
| T2: Grid e grades fluidas | 1 arquivo (CSS) | ✅ Granular |
| T3: Barra inferior e topo | 1 componente + seu CSS + 1 meta | ⚠️ Coeso (a estrutura e o CSS do mesmo componente não funcionam separados) |
| T4: Alvos e fonte | 1 arquivo (CSS) | ✅ Granular |
| T5: Linha clicável e rolagem | 1 página | ✅ Granular |
| T6: Tabela | 1 model + migration gerada | ✅ Granular |
| T7: Hash | 1 função | ✅ Granular |
| T8: Decorators | 2 decorators pequenos + tipos do módulo | ⚠️ Coeso (mesma pasta, mesmo conceito) |
| T9: Service + módulo | 1 service + registro | ✅ Granular |
| T10–T12: Services com `tx` | 1 service cada | ✅ Granular |
| T13: CORS | 1 função + uso + 2 envs + 1 teste | ⚠️ Coeso (mesma configuração) |
| T14: Rotas | 3 controllers, 1 linha por rota + e2e | ⚠️ Coeso (mesma mudança mecânica; e2e precisa de todas) |
| T15–T19: libs | 1 módulo cada | ✅ Granular |
| T20: Formulários | 5 arquivos, mesma linha | ⚠️ Coeso (mudança mecânica idêntica) |
| T21: Login | 1 página | ✅ Granular |
| T22: Indicador | 1 componente + encaixe | ✅ Granular |
| T23: Reconexão | 5 telas, mesma linha | ⚠️ Coeso (mudança mecânica idêntica) |
| T24: Instalação | 1 módulo | ✅ Granular |
| T25: Botão | 1 componente + encaixe | ✅ Granular |
| T26: Ícones | 1 script + assets gerados | ✅ Granular |
| T27: Regras de cache | 1 módulo puro | ✅ Granular |
| T28: SW + manifest | SW + config do plugin + manifest | ⚠️ Coeso (o plugin, o SW e o manifest só existem juntos no build) |
| T29: Registro | 1 função + 1 chamada | ✅ Granular |
| T30: Checagem de build | 1 script + 1 config | ✅ Granular |
| T31: Auditoria PWA | 1 script | ✅ Granular |

Nenhum ❌.

---

## Diagram-Definition Cross-Check

| Task | Depends On (task body) | Diagram Shows | Status |
| --- | --- | --- | --- |
| T1 | None | início | ✅ Match |
| T2 | T1 | T1 → T2 | ✅ Match |
| T3 | T2 | T2 → T3 | ✅ Match |
| T4 | T3 | T3 → T4 | ✅ Match |
| T5 | T1 | T1 → T5 | ✅ Match |
| T6 | None | início | ✅ Match |
| T7 | None | início | ✅ Match |
| T8 | T7 | T7 → T8 | ✅ Match |
| T9 | T6, T7 | T6 → T9, T7 → T9 | ✅ Match |
| T10 | T8 (fase anterior) | início da fase 3 | ✅ Match |
| T11 | T8 (fase anterior) | início da fase 3 | ✅ Match |
| T12 | T8 (fase anterior) | início da fase 3 | ✅ Match |
| T13 | None | início da fase 3 | ✅ Match |
| T14 | T10, T11, T12, T13 | T10/T11/T12/T13 → T14 | ✅ Match |
| T15 | None | início | ✅ Match |
| T16 | None | início | ✅ Match |
| T17 | None | início | ✅ Match |
| T18 | T16, T17 | T16 → T18, T17 → T18 | ✅ Match |
| T19 | T15, T18 | T15 → T19, T18 → T19 | ✅ Match |
| T20 | T19 | T19 → T20 | ✅ Match |
| T21 | T16 | T16 → T21 | ✅ Match |
| T22 | None (usa T17, fase anterior) | isolado | ✅ Match |
| T23 | None (usa T17, fase anterior) | isolado | ✅ Match |
| T24 | None | início | ✅ Match |
| T25 | T24 | T24 → T25 | ✅ Match |
| T26 | None (usa T1, fase anterior) | início | ✅ Match |
| T27 | None (usa T16, fase anterior) | início | ✅ Match |
| T28 | T26, T27 | T26 → T28, T27 → T28 | ✅ Match |
| T29 | T28 (usa T24, fase anterior) | T28 → T29 | ✅ Match |
| T30 | T29 | T29 → T30 | ✅ Match |
| T31 | T30 | T30 → T31 | ✅ Match |

Nenhuma dependência aponta para uma fase posterior. Ordem de execução da fase 2: T6, T7, T8, T9.

---

## Test Co-location Validation

| Task | Code Layer Created/Modified | Matrix Requires | Task Says | Status |
| --- | --- | --- | --- | --- |
| T1 | Script de auditoria (é o teste) | browser | browser | ✅ OK |
| T2 | CSS de layout | browser | browser | ✅ OK |
| T3 | Componente + CSS de layout | unit + browser | unit + browser | ✅ OK |
| T4 | CSS de layout | browser | browser | ✅ OK |
| T5 | Página + layout | unit + browser | unit + browser | ✅ OK |
| T6 | Schema / migration | none | none | ✅ OK |
| T7 | Função pura (API) | unit | unit | ✅ OK |
| T8 | Decorator (API) | unit | unit | ✅ OK |
| T9 | Service (API) | unit | unit | ✅ OK |
| T10 | Service (API) | unit | unit | ✅ OK |
| T11 | Service (API) | unit | unit | ✅ OK |
| T12 | Service (API) | unit | unit | ✅ OK |
| T13 | Config HTTP + rotas (CORS) | e2e | e2e | ✅ OK |
| T14 | Controller + rotas HTTP + banco | e2e (controller é none; rotas são e2e) | e2e | ✅ OK |
| T15 | Lib (web) | unit | unit | ✅ OK |
| T16 | Lib + componente (web) | unit | unit | ✅ OK |
| T17 | Lib / hooks (web) | unit | unit | ✅ OK |
| T18 | Lib (web) | unit | unit | ✅ OK |
| T19 | Hook (web) | unit | unit | ✅ OK |
| T20 | Componentes (web) | unit | unit | ✅ OK |
| T21 | Página (web) | unit | unit | ✅ OK |
| T22 | Componente (web) | unit | unit | ✅ OK |
| T23 | Páginas (web) | unit | unit | ✅ OK |
| T24 | Lib (web) | unit | unit | ✅ OK |
| T25 | Componente + layout | unit + browser | unit + browser | ✅ OK |
| T26 | Assets / script utilitário | none | none | ✅ OK |
| T27 | Regras puras do SW | unit | unit | ✅ OK |
| T28 | Config + SW + manifest | unit (manifest) + build; o SW em execução fica com a T31 (browser) | unit | ✅ OK: o `sw.ts` só monta rotas com as regras já testadas na T27; a execução real exige o build da T30 e é coberta pela T31 (merge forward, regra "Resolving compilation dependencies") |
| T29 | Lib (web) | unit | unit | ✅ OK |
| T30 | Script de build / config | none | none | ✅ OK |
| T31 | SW em execução | browser | browser | ✅ OK |

---

## Requirement Coverage

| Requirement | Tasks |
| --- | --- |
| RSP-01 | T1, T2 |
| RSP-02 | T1, T2 |
| RSP-03 | T1, T3 |
| RSP-04 | T1, T3 |
| RSP-05 | T3 |
| RSP-06 | T1, T3 |
| RSP-07 | T1, T4 |
| RSP-08 | T1, T4, T25 |
| RSP-09 | T5 |
| RSP-10 | T1, T5 |
| RSP-11 | T2 |
| RSP-12 | T3 |
| PWA-01 | T26, T28, T31 |
| PWA-02 | T26 |
| PWA-03 | T28, T29, T31 |
| PWA-04 | T28, T29 |
| PWA-05 | T24, T25 |
| PWA-06 | T24, T25 |
| PWA-07 | T24 |
| PWA-08 | T24, T25 |
| PWA-09 | T24, T25 |
| PWA-10 | T24, T25 |
| OFF-01 | T28, T31 |
| OFF-02 | T27 |
| OFF-03 | T28, T31 |
| OFF-04 | T18, T27, T31 |
| OFF-05 | T18, T31 |
| OFF-06 | T17, T22, T31 |
| OFF-07 | T17, T22, T31 |
| OFF-08 | T18, T19 |
| OFF-09 | T27 |
| OFF-10 | T27 |
| OFF-11 | T16, T18, T31 |
| OFF-12 | T16, T21 |
| OFF-13 | T21 |
| OFF-14 | T28 |
| OFF-15 | T17, T23, T31 |
| IDP-01 | T15, T18, T19, T20 |
| IDP-02 | T6, T8, T9, T10, T11, T12, T14 |
| IDP-03 | T7, T9, T14 |
| IDP-04 | T9, T14 |
| IDP-05 | T6, T9 |
| IDP-06 | T8, T9, T14 |
| IDP-07 | T19 |
| IDP-08 | T19 |
| IDP-09 | T13 |
| UPD-01 | T29 |
| UPD-02 | T28 |
| UPD-03 | T29 |
| UPD-04 | T30 |

**Coverage:** 50 de 50 requisitos mapeados. UPD-01..04 não têm teste de navegador automatizado
(exigiria dois builds publicados em sequência). O Independent Test do P2 no spec fica como
verificação manual no `validation.md`.
