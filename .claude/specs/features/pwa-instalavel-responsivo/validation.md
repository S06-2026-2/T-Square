# PWA Instalável e Responsivo — Validação

**Data**: 2026-11-09
**Spec**: `.claude/specs/features/pwa-instalavel-responsivo/spec.md` (50 requisitos + 6 Edge Cases)
**Faixa do diff**: `8e99dc8a337db25f5acc5f32e2eaa3f548b269b9..HEAD` (17 commits, HEAD = `4b839f5`, branch `feat/pwa-instalavel-responsivo`, 105 arquivos)
**Verifier**: sub-agente independente (autor ≠ verifier), procedimento `tlc-spec-driven/references/validate.md`
**Baseline `git status --porcelain`**: vazio (salvo antes de qualquer mutação)

## Veredito: ❌ FAIL (lacunas pequenas; nenhum defeito funcional nos caminhos P1 principais)

**Checagem ancorada no spec**: 41/50 requisitos ✅ com teste que afirma o valor do spec; 9 com ⚠️ (evidência parcial ou só estática, ou spec impreciso); 0 requisitos sem nenhuma evidência. Edge Cases: 3 ✅, 1 ⚠️, 2 ❌.
**Gate**: web 323/323 · API unit 283/283 · API e2e 14/14 (container) · `npm run build --workspace apps/web` verde (`checar-build: OK`) · `audit:pwa` 13/13 · `audit:responsive` `medidos: 118/118, nao montados: 0, falhas: 0`.
**Sensor**: 61 mutantes válidos — 60 mortos, **1 sobrevivente** (B3b, `maxEntries` do `sw.ts`). 4 tentativas descartadas por matarem só na compilação (A15, B1, B2, B3), todas refeitas.
**Por que FAIL**: o método manda não fechar a feature com mutante sobrevivente nem com Edge Case sem evidência. As lacunas viram as tasks de correção abaixo; nenhuma muda o comportamento que o usuário vê, exceto a Lacuna 2 (decisão do usuário).

Etapas (todas concluídas):
- [x] Leitura do spec/design/tasks/STATE (31/31 tasks marcadas "✅ Concluída")
- [x] Checagem ancorada no spec (tabela abaixo)
- [x] Suítes: web 323/323, API unit 283/283, API e2e 14/14 (no container)
- [x] Sensor web unit 38/38 mortos; API unit 15/15; e2e 3/3
- [x] Build + audit:pwa com mutantes do `sw.ts` (B1b, B2b, B3b, B5) e base 13/13
- [x] audit:responsive com mutante de CSS (B4, morto) e base 118/118
- [x] Limpeza final: `git status --porcelain` = só `?? validation.md` (baseline vazio + este relatório; nenhum arquivo de código alterado, `git diff --stat` vazio); `fixture-auditoria.mjs contar` = `{"restos":0}`; 0 registros `[e2e]`/`[audit]` em gesseiro/material/obra; 0 linhas em `chaves_idempotencia`; preview da porta 4173 parado; `dist/` reconstruído do código limpo; `gesso_api` e `gesso_web` reiniciados depois das mutações (hot-reload do OneDrive); a `audit:pwa` termina removendo caches e SW do contexto do Chrome ("Cache Storage e SW limpos no fim" OK). Nenhuma chamada a `POST /api/estoque/agente/analisar`.

---

## Task Completion

| Lote | Tasks | Status |
| --- | --- | --- |
| L1 | T1–T5 | ✅ 5/5 |
| L2 | T6–T14 | ✅ 9/9 |
| L3 | T15–T21 | ✅ 7/7 |
| L4 | T22–T25 | ✅ 4/4 |
| L5 | T26–T31 | ✅ 6/6 |

---

## Checagem ancorada no spec

Legenda: ✅ PASS (código + teste que afirma o valor do spec) · ⚠️ Spec-precision gap / evidência parcial · ❌ GAP (sem evidência de teste)

Caminhos abreviados: `web/` = `apps/web/`, `api/` = `apps/api/`.

### P1 — Responsividade (RSP)

| Req | Resultado do spec | Código | Teste / auditoria | Resultado |
| --- | --- | --- | --- | --- |
| RSP-01 | `scrollWidth == innerWidth` em 320/360/390/768/1024/1366 em todos os estados listados | `web/src/index.css:55` (`minmax(0, 1fr)`), `:278`, `:424`/`:430` | `web/scripts/audit-responsive.mjs:379-389` (falha `RSP-01` se `sw !== innerWidth`), 8 larguras × estados, `NAO_MONTADO` reprova | ✅ (ver resultado da auditoria) |
| RSP-02 | tabela rola dentro de `.tabela-wrap` | `web/src/index.css:729-730` | `audit-responsive.mjs:392-398` | ✅ |
| RSP-03 | ≤ 900px: barra inferior fixa, 4 abas, rótulo curto, aba atual destacada | `web/src/index.css:298-326`; `web/src/components/Layout.tsx:11-16` | `audit-responsive.mjs:418-425` (`position fixed`, 4 links, rótulos `Geral/Obras/Equipe/Estoque`, ativo); `web/src/components/Layout.test.tsx:36,51` | ✅ |
| RSP-04 | topo ≤ 64px sem a safe area, só marca/indicador/avatar/Instalar/Sair | `web/src/index.css:283-296` (56px + safe-area) | `audit-responsive.mjs:427-429` (`alturaTopo > 64` reprova); `Layout.test.tsx:60,72,109` | ✅ |
| RSP-05 | > 900px: sidebar lateral com "Visao geral", "Obras", "Gesseiros", "Estoque" | `Layout.tsx:11-16` | `audit-responsive.mjs:446-452` (inclusive passada `1024-chrome`/`1366-chrome`); `Layout.test.tsx:36` | ✅ |
| RSP-06 | espaço no fim do conteúdo = altura da barra + safe-area-bottom | `web/src/index.css:369` (`--altura-nav + safe-area + 16px`) | `audit-responsive.mjs:431-441` (último elemento acima da barra) | ✅ (reserva é ≥, não "igual": +16px de folga; aceitável) |
| RSP-07 | `input/select/textarea` ≥ 16px com ≤ 900px **ou** `pointer: coarse` | `web/src/index.css:1356-1361` | `audit-responsive.mjs:457-462` — só nas larguras ≤ 900px | ⚠️ o ramo `(pointer: coarse)` em > 900px não é medido (1024/1366 rodam com `toque: false`) |
| RSP-08 | alvos listados ≥ 44×44 em ≤ 900px | `web/src/index.css:1365-1376` | `audit-responsive.mjs:464-480`; estados garantem os alvos montados (`NAO_MONTADO` reprova) | ✅ (sensor B4) |
| RSP-09 | linha inteira do gesseiro abre o extrato | `web/src/pages/Gesseiros.tsx` (`onClick` no `li`) | `web/src/pages/Gesseiros.test.tsx:114,122` | ✅ |
| RSP-10 | ≤ 760px: rola até o início do card do extrato | `Gesseiros.tsx` (`matchMedia('(max-width: 760px)')` + `scrollIntoView`) | `Gesseiros.test.tsx:130` (`toHaveBeenCalledWith('(max-width: 760px)')`, `{block:'start'}`, elemento = `.card`), `:143`; `audit-responsive.mjs:324,542-544` | ✅ (W30 morto) |
| RSP-11 | `100dvh` com fallback `100vh` em `.app` e `.login` | `web/src/index.css:56-57`, `:1146-1147` | nenhum teste lê a regra | ⚠️ só evidência estática de CSS |
| RSP-12 | standalone com notch: topo e barra afastados de `safe-area-inset-*` | `web/src/index.css:286,290,305,369`; `web/index.html` (`viewport-fit=cover`) | `audit-responsive.mjs:371-376` mede a sonda, mas no headless `env()` = 0 | ⚠️ não exercitável no headless; só evidência estática |

### P1 — Instalação (PWA)

| Req | Resultado do spec | Código | Teste | Resultado |
| --- | --- | --- | --- | --- |
| PWA-01 | manifest com os 9 campos exatos + 3 ícones | `web/src/pwa/manifest.json:1-16`; `web/vite.config.ts` (`manifest: {...MANIFESTO, description: undefined}`) | `web/src/pwa/manifest.test.ts:23` (`toEqual` com todos os valores do spec); `web/scripts/checar-build.mjs:446-475` (dist = fonte, PNG no tamanho declarado); `audit-pwa.mjs:181-186` | ✅ (W32 morto) |
| PWA-02 | `apple-touch-icon` 180×180 e `apple-mobile-web-app-title` "Gesso" | `web/index.html` (link e meta) | `checar-build.mjs:464` só confere o PNG 180×180 no `dist` | ⚠️ a tag `<link rel=apple-touch-icon>` e a meta `apple-mobile-web-app-title` não são lidas por nenhum teste (remover qualquer uma passa em tudo) |
| PWA-03 | build registra SW com escopo "/" | `web/src/pwa/registrar-sw.ts:10-13`; `web/src/main.tsx` | `registrar-sw.test.ts:66` (`register('/sw.js', {scope:'/'})`); `audit-pwa.mjs:149-166`; `checar-build.mjs:444` | ✅ |
| PWA-04 | `npm run dev` não registra SW | `registrar-sw.ts:10`; `vite.config.ts` (`devOptions.enabled: false`) | `registrar-sw.test.ts:75` | ✅ (W25 morto) |
| PWA-05 | `beforeinstallprompt` → botão "Instalar app" no topo/sidebar | `web/src/lib/instalacao.ts:35-46`; `Layout.tsx:60` | `instalacao.test.ts:90`; `Layout.test.tsx:109`; `BotaoInstalar.test.tsx:34` | ✅ |
| PWA-06 | clique chama `prompt()` do evento guardado | `instalacao.ts:73-85`; `BotaoInstalar.tsx` | `instalacao.test.ts:100`; `BotaoInstalar.test.tsx:34` | ✅ |
| PWA-07 | `appinstalled` ou recusa → esconde | `instalacao.ts:42-45,82` | `instalacao.test.ts:100` (`dismissed`), `:136` | ✅ (W26 morto) |
| PWA-08 | standalone → sem botão | `instalacao.ts:48-54,66` | `instalacao.test.ts:148,158` | ✅ (W27 morto) |
| PWA-09 | sem `beforeinstallprompt` (fora do iOS) → sem botão | `instalacao.ts:65-70` | `instalacao.test.ts:85,179`; `BotaoInstalar.test.tsx:27` | ✅ |
| PWA-10 | Safari iOS fora do standalone: botão abre "Toque em Compartilhar e depois em Adicionar à Tela de Início" | `BotaoInstalar.tsx:6`; `instalacao.ts:57-63` | `BotaoInstalar.test.tsx:48` (texto exato); `instalacao.test.ts:169`; `audit-responsive.mjs:401-406` | ✅ (W29, W35 mortos) |

### P1 — Offline (OFF)

| Req | Resultado do spec | Código | Teste | Resultado |
| --- | --- | --- | --- | --- |
| OFF-01 | offline, qualquer rota abre do cache; fallback não responde `/api/**` | `web/src/sw.ts:43-49` (precache + `NavigationRoute` com `denylist: [/^\/api\//]`) | `audit-pwa.mjs:220-234` (recarregar `/estoque` offline), `:248-268` (`/api/**` offline sem HTML) | ✅ (sensor B5) |
| OFF-02 | GET `/api/**` 200 (fora de auth) entra no cache, chave = URL completa | `web/src/pwa/regras-cache.ts:42-52`; `sw.ts:54-66` | `regras-cache.test.ts:52-58` (inclui query string); `audit-pwa.mjs:205-213` | ✅ (W07 morto) |
| OFF-03 | rede primeiro; cache só com falha de rede ou > 5 s | `regras-cache.ts:13`; `sw.ts:56-59` (`NetworkFirst`, `networkTimeoutSeconds`) | `regras-cache.test.ts:45` (`toBe(5)`); `audit-pwa.mjs:287-302` (API lenta 6 s: dados do cache entre 4,5 s e 6 s) | ✅ (W03 morto; B1 ver sensor) |
| OFF-04 | resposta do cache com `X-From-Cache: 1` | `regras-cache.ts:78-86`; `web/src/lib/api.ts:79-81` | `regras-cache.test.ts:101-108,123-129`; `api.test.ts:132`; `audit-pwa.mjs:227-233` (`viaSw.doCache === '1'`) | ✅ (W06, W13 mortos; B2 ver sensor) |
| OFF-05 | sem rede e sem cache: "Sem conexão e sem dados salvos desta tela neste aparelho." em `.erro` | `api.ts:40,58-63` | `api.test.ts:54` (mensagem exata); `Dashboard.test.tsx:207`, `AlertasEstoque.test.tsx:422` (`.erro`); `audit-pwa.mjs:236-246` | ✅ (W14, W36 mortos) |
| OFF-06 | offline ou dados do cache → ícone vermelho, sem texto, `aria-label`/`title` "Dados possivelmente desatualizados" | `web/src/lib/conexao.ts:22-24`; `web/src/components/IndicadorConexao.tsx:4,13-19` | `IndicadorConexao.test.tsx:34,47`; `conexao.test.ts:34,39`; `Layout.test.tsx:72`; `audit-pwa.mjs:226,294` | ✅ (W21, W31 mortos) |
| OFF-07 | volta a receber da API → esconde | `conexao.ts:17-20`; `api.ts:79-81` | `IndicadorConexao.test.tsx:55`; `conexao.test.ts:44`; `audit-pwa.mjs:270-285` | ✅ |
| OFF-08 | falha de rede no envio: mensagem exata, campos mantidos, sem reenvio sozinho | `api.ts:41-42,58-63`; `web/src/lib/useEnvio.ts:58-79` | `chaveIdempotencia.testes.ts:160-174` (5 formulários de criação: mensagem exata, `.erro`, campos, mesma chave); `api.test.ts:65-78` (POST/PATCH/PUT/DELETE) | ✅ criação · ⚠️ formulários de **edição** só cobertos na camada `api.ts` (mensagem), não na tela |
| OFF-09 | nunca cachear POST/PATCH/PUT/DELETE, não-200 nem `/api/auth/**` | `regras-cache.ts:42-52,74-77`; `sw.ts:61` | `regras-cache.test.ts:60-72,91-97`; `audit-pwa.mjs:214-218` | ✅ (W01, W02, W07 mortos) |
| OFF-10 | descartar respostas recebidas há > 7 dias, contadas do recebimento | `regras-cache.ts:17-18,74-86` (`X-Recebido-Em`) | `regras-cache.test.ts:47,101-117` (exatamente 7 dias vale, +1 ms some) | ✅ (W04, W05 mortos) |
| OFF-11 | fim de sessão (Sair ou 401) apaga o cache **antes de voltar para `/login`** | `web/src/lib/sessao.ts:15-27`; `Layout.tsx:23-26`; `api.ts:67-70` | `sessao.test.ts:181,217-247`; `Layout.test.tsx:131`; `api.test.ts:164`; `audit-pwa.mjs:312-324` (Sair) e `:326-350` (401) | ⚠️ apagar o cache: ✅. Após 401 automático **não há ida a `/login`** até a próxima abertura/recarga (`web/src/App.tsx:17-25` só confere o token ao montar; igual na `main`). Ver Lacuna 2 |
| OFF-12 | login com sucesso apaga o cache antes da 1ª tela | `sessao.ts:29-33`; `web/src/pages/Login.tsx` (`await iniciarSessao`) | `sessao.test.ts:251`; `Login.test.tsx:74` | ✅ (W11 morto) |
| OFF-13 | login sem rede: "Sem conexão. Conecte-se à internet para entrar." em `.erro`, mantém usuário | `Login.tsx` (`status === 0`) | `Login.test.tsx:102` (mensagem, `.erro`, e-mail mantido, senha vazia) | ✅ · ⚠️ "a senha não é guardada" foi lido como "esvaziar o campo"; o spec não diz isso |
| OFF-14 | no máximo 200 respostas, descarta as mais antigas | `regras-cache.ts:15`; `sw.ts:62` (`ExpirationPlugin({ maxEntries })`) | `regras-cache.test.ts:46` só afirma a constante | ⚠️ fiação do `sw.ts` não verificada (sensor B3) |
| OFF-15 | evento `online` → busca de novo a tela atual sem recarregar nem apagar formulário | `conexao.ts:42-55`; `Dashboard.tsx`, `Obras.tsx`, `Gesseiros.tsx`, `Estoque.tsx`, `AlertasEstoque.tsx` (`useAoReconectar`) | `conexao.test.ts:95-133`; `Dashboard.test.tsx:196`; `Obras.test.tsx:218`; `Gesseiros.test.tsx:161,173`; `Estoque.test.tsx:271,301`; `AlertasEstoque.test.tsx:417`; `audit-pwa.mjs:270-285` | ✅ (W22 morto) |

### P1 — Idempotência (IDP)

| Req | Resultado do spec | Código | Teste | Resultado |
| --- | --- | --- | --- | --- |
| IDP-01 | `Idempotency-Key` UUID nos 5 POST de criação; mantida até sucesso/422; nova ao trocar de recurso | `useEnvio.ts:41-56`; `web/src/lib/uuid.ts:6-29`; `api.ts:92-97`; 5 formulários; `Estoque.tsx` (`key={entrada?.materialId}`) | `chaveIdempotencia.testes.ts:159-234` (5 forms); `useEnvio.test.ts:104-218`; `api.test.ts:188`; `uuid.test.ts:22-68`; `Estoque.test.tsx:143` | ✅ (W16, W18, W19, W37, W38 mortos). Nota: `randomUUID` com fallback `getRandomValues` (contexto inseguro) — desvio benigno da letra "`crypto.randomUUID()`" |
| IDP-02 | mesma chave/usuário/rota → mesmo status e corpo, sem gravar | `api/src/idempotencia/idempotencia.service.ts:70-82`; controllers de gesseiros/obras/estoque | `idempotencia.service.spec.ts:143`; `api/test/idempotencia.e2e-spec.ts:135-148,247-307` (5 rotas, contagem = 1, `body` igual) | ✅ (A01, E2, E3 mortos) |
| IDP-03 | mesma chave, outro corpo → 422 sem gravar | `idempotencia.service.ts:74-78`; `hash-corpo.ts` | `idempotencia.service.spec.ts:130`; `e2e-spec.ts:168-179` (422 + contagem 1) | ✅ (A02, A07 mortos) |
| IDP-04 | em processamento → 409 com `codigo: "EM_PROCESSAMENTO"` sem gravar | `idempotencia.service.ts:16-23,58-64,93-98` | `idempotencia.service.spec.ts:115,208`; `e2e-spec.ts:181-210` (201 + 409 + `codigo` + contagem 1) | ✅ (A03, A06, A11 mortos) |
| IDP-05 | chaves por 24 h (cron de hora em hora) | `idempotencia.service.ts:26,70-73,107-113` | `idempotencia.service.spec.ts:154,165,223` (24 h ± 1 ms) | ✅ (A05, A10, A12 mortos). Exatamente 24 h não testado (fronteira não definida no spec) |
| IDP-06 | sem chave → processa normalmente | `idempotencia.service.ts:50-52`; `contexto-idempotencia.decorator.ts:20-22` | `idempotencia.service.spec.ts:76`; `decorator.spec.ts:34`; `e2e-spec.ts:234-245` | ✅ (A09 morto) |
| IDP-07 | front com 422: mensagem exata, campos mantidos, chave nova | `useEnvio.ts:67-69` | `useEnvio.test.ts:130`; `chaveIdempotencia.testes.ts:205-219` | ✅ (W16, W20 mortos) |
| IDP-08 | 409 `EM_PROCESSAMENTO`: mensagem exata e mesma chave; outro 409 → mensagem da API; decisão pelo `codigo` | `useEnvio.ts:15,70-74`; `api.ts` (`codigo`) | `useEnvio.test.ts:142,166-181` (409 com o mesmo texto e sem código mostra a mensagem da API); `chaveIdempotencia.testes.ts:176`; `api.test.ts:90,103` | ✅ (W17 morto) |
| IDP-09 | preflight responde com `Idempotency-Key` em `Access-Control-Allow-Headers` | `api/src/cors.ts:12`; `main.ts` | `e2e-spec.ts:108-133` | ✅ (E1 morto) |

### P2 — Atualização (UPD)

| Req | Resultado do spec | Código | Teste | Resultado |
| --- | --- | --- | --- | --- |
| UPD-01 | build novo baixado/instalado em segundo plano | comportamento padrão do navegador + `vercel.json` (`sw.js` com `no-cache`) | nenhum teste automatizado (Independent Test manual) | ⚠️ só evidência de config |
| UPD-02 | ativa sem confirmação | `sw.ts:37-40` (`skipWaiting` + `clientsClaim`) | nenhum teste (o `sw.ts` não é importado pelo Jest e a `audit:pwa` não publica 2 versões) | ⚠️ só evidência de código |
| UPD-03 | não recarrega a página aberta | `registrar-sw.ts` (sem `controllerchange`/`reload`); `vite.config.ts` (`injectRegister: false`) | `registrar-sw.test.ts:96` | ✅ |
| UPD-04 | página antiga continua abrindo todas as telas | AD-010: sem rotas lazy | `checar-build.mjs:427-441` (1 chunk JS, sem `import()`; derruba o build) | ✅ (proxy estrutural aceito pela AD-010) |

### Edge Cases

| Edge Case | Evidência | Resultado |
| --- | --- | --- |
| Navegador sem SW funciona como hoje | `registrar-sw.ts:11`; `sessao.ts:16`; `registrar-sw.test.ts:83,90`; `sessao.test.ts:195` | ✅ |
| Armazenamento cheio: entrega a resposta da API | Workbox `NetworkFirst` grava em `waitUntil` depois de devolver a resposta; nenhum teste | ❌ sem evidência de teste |
| Login com outro usuário começa com cache vazio | `sessao.ts:29-33`; `App.tsx:20-22`; `sessao.test.ts:251`; `App.test.tsx:62` | ✅ (W34 morto) |
| 401 com rede: logout + "Sessao expirada", nunca o cache | `regras-cache.ts:74-77` (401 nunca gravado), `NetworkFirst` só cai no cache por falha de rede; `api.test.ts:164`; `audit-pwa.mjs:304-310` | ✅ |
| > 900px → ≤ 900px sem recarregar nem perder estado | troca só por CSS, mesmo DOM (`Layout.tsx:41-73`, `index.css:272`) | ⚠️ sem teste (nem auditoria redimensiona com estado preenchido) |
| Nome de 120 caracteres quebra sem alargar a página em 320px | `index.css:424,430` (`overflow-wrap`) | ❌ sem teste: a fixture (`api/scripts/fixture-auditoria.mjs:86,89`) só cria nomes curtos; a auditoria depende dos dados do banco de dev |

---

## Sensor de discriminação

Método: cópia do arquivo em memória/scratchpad, troca exata (ocorrência única), suíte inteira, restauração em `finally`; `git status --porcelain` conferido depois de cada lote (só `?? validation.md`). Scripts: scratchpad `sensor.mjs`, `mutar.mjs`, `browser.sh`; listas `web.json`, `api.json`, `api2.json`, `e2e.json`.

### Web unit (38/38 mortos)

| # | Arquivo | Mutação | Morto por |
| --- | --- | --- | --- |
| W01 | `pwa/regras-cache.ts` | cache de não-200 (`!== 200` → `>= 400`) | `regras-cache.test.ts` (201/204/304) |
| W02 | `pwa/regras-cache.ts` | `/api/auth/**` entra no cache | `regras-cache.test.ts:65-66` |
| W03 | `pwa/regras-cache.ts` | timeout 5 → 10 s | `regras-cache.test.ts:45` |
| W04 | `pwa/regras-cache.ts` | `>` → `>=` no limite de 7 dias | `regras-cache.test.ts:101` |
| W05 | `pwa/regras-cache.ts` | 7 → 8 dias | `regras-cache.test.ts:47,110` |
| W06 | `pwa/regras-cache.ts` | sem `X-From-Cache` | `regras-cache.test.ts:101,123` |
| W07 | `pwa/regras-cache.ts` | POST/PATCH/PUT no cache | `regras-cache.test.ts:61-63` |
| W08 | `lib/sessao.ts` | apaga cache com outro nome (`'api'`) | `sessao.test.ts:181` (+8) |
| W09 | `pwa/nomes-cache.ts` | nome do cache `api-dados-v2` | `sessao.test.ts:177` (+9) |
| W10 | `lib/sessao.ts` | logout sem limpar o cache | `sessao.test.ts:218` |
| W11 | `lib/sessao.ts` | login sem limpar o cache | `sessao.test.ts:251`, `Login.test.tsx:74` |
| W12 | `lib/sessao.ts` | limpeza sem `await` | `sessao.test.ts:234`, `Layout.test.tsx:131` |
| W13 | `lib/api.ts` | ignora `X-From-Cache` | `api.test.ts:132` |
| W14 | `lib/api.ts` | falha de rede sem tratamento | `api.test.ts:54,65` |
| W15 | `lib/api.ts` | 401 sem esperar `encerrarSessao` | `api.test.ts:164` |
| W16 | `lib/useEnvio.ts` | 422 mantém a chave | `useEnvio.test.ts:130` + 5 forms |
| W17 | `lib/useEnvio.ts` | 409 decidido só pelo status | `useEnvio.test.ts:166` (409 de negócio) |
| W18 | `lib/useEnvio.ts` | sucesso mantém a chave | `useEnvio.test.ts:119` + forms |
| W19 | `lib/useEnvio.ts` | trocar de recurso mantém a chave | `useEnvio.test.ts:185,202` |
| W20 | `lib/useEnvio.ts` | 422 sem mensagem do IDP-07 | `useEnvio.test.ts:130` (+15) |
| W21 | `lib/conexao.ts` | ignora `navigator.onLine` | `conexao.test.ts:34`, `IndicadorConexao.test.tsx:34` |
| W22 | `lib/conexao.ts` | recarrega no `offline` em vez do `online` | `conexao.test.ts:95` + páginas |
| W23 | `pages/Login.tsx` | sem rede mantém a senha | `Login.test.tsx:102` |
| W24 | `pages/Login.tsx` | sem rede não mostra a mensagem do OFF-13 | `Login.test.tsx:102` |
| W25 | `pwa/registrar-sw.ts` | registra SW no dev | `registrar-sw.test.ts:75` |
| W26 | `lib/instalacao.ts` | recusa não esconde o botão | `instalacao.test.ts:100` |
| W27 | `lib/instalacao.ts` | standalone mostra o botão | `instalacao.test.ts:148,158` |
| W28 | `lib/instalacao.ts` | sem `preventDefault` | `instalacao.test.ts:90` |
| W29 | `lib/instalacao.ts` | iOS não detectado | `instalacao.test.ts:169` |
| W30 | `pages/Gesseiros.tsx` | rolagem em 900px em vez de 760px | `Gesseiros.test.tsx:130,143` |
| W31 | `components/IndicadorConexao.tsx` | outro `aria-label`/`title` | `IndicadorConexao.test.tsx:34` |
| W32 | `pwa/manifest.json` | `theme_color` errado | `manifest.test.ts:23` |
| W33 | `components/Layout.tsx` | Sair navega antes de limpar | `Layout.test.tsx:131` |
| W34 | `App.tsx` | rota privada sem token não limpa o cache | `App.test.tsx:62` |
| W35 | `components/BotaoInstalar.tsx` | instrução do iOS incompleta | `BotaoInstalar.test.tsx:48` |
| W36 | `lib/api.ts` | mensagem do OFF-05 errada | `api.test.ts:54` |
| W37 | `pages/Estoque.tsx` | sem `key` no formulário do "Resolver" | `Estoque.test.tsx:143` |
| W38 | `forms/LancamentoForm.tsx` | sem `Idempotency-Key` no vale | `LancamentoForm.test.tsx` (5 casos) |

### API unit (15/15 mortos) e e2e (3/3 mortos)

| # | Arquivo | Mutação | Morto por |
| --- | --- | --- | --- |
| A01 | `idempotencia.service.ts` | sem replay (cria de novo) | `idempotencia.service.spec.ts:143,165` |
| A02 | `idempotencia.service.ts` | sem 422 | `:130` |
| A03 | `idempotencia.service.ts` | sem 409 da trava | `:115` |
| A04 | `idempotencia.service.ts` | `criar()` fora do `tx` (chave fora da transação) | `:175` |
| A05 | `idempotencia.service.ts` | vida 12 h | `:165,223` |
| A06 | `idempotencia.service.ts` | 409 sem `codigo` | `:115,208` |
| A07 | `hash-corpo.ts` | hash sensível à ordem das chaves | `hash-corpo.spec.ts` |
| A08 | `contexto-idempotencia.decorator.ts` | rota sem o path | `decorator.spec.ts:45,65` |
| A09 | `idempotencia.service.ts` | sem chave passa `this.prisma` como tx | `:76` |
| A10 | `idempotencia.service.ts` | cron apaga as **novas** (`gt`) | `:223` |
| A11 | `idempotencia.service.ts` | `P2002` não vira 409 | `:208` |
| A12 | `idempotencia.service.ts` | chave vencida não é apagada | `:154` |
| A13 | `contexto-idempotencia.decorator.ts` | aceita chave não-UUID | `decorator.spec.ts:38` |
| A14 | `contexto-idempotencia.decorator.ts` | usuário fixo (escopo sem usuário) | `decorator.spec.ts:45` |
| A15b | `estoque.service.ts` | `movimentar(dto, tx)` abre a própria `$transaction` | `estoque.service.spec.ts` ("com tx externo", 3 casos) — o A15 original (`if (false)`) morreu só por erro de compilação e foi descartado |
| E1 | `cors.ts` | `Idempotency-Key` fora do `allowedHeaders` | `e2e-spec.ts:108,122` |
| E2 | `gesseiros.controller.ts` | lançamento sem `idempotencia.executar` | `e2e-spec.ts` (5 casos) |
| E3 | `obras.controller.ts` | obra sem `idempotencia.executar` | `e2e-spec.ts:290` (POST /api/obras) |

### Build + navegador (em andamento)

| # | Arquivo | Mutação | Verificação | Resultado |
| --- | --- | --- | --- | --- |
| B1b | `sw.ts:59` | `networkTimeoutSeconds: TIMEOUT_REDE_SEGUNDOS * 2` (10 s, contornando o teste da constante) | `audit:pwa` | ✅ morto — "OFF-03/04 API lenta: dados do cache em 6173 ms (esperado 4,5–6 s); ícone: false" |
| B2b | `sw.ts:63` | plugin só com `cacheWillUpdate` (sem `X-From-Cache` e sem descarte de 7 dias na leitura) | `audit:pwa` | ✅ morto — 2 falhas (OFF-01/04/06 `X-From-Cache null`; OFF-03/04 ícone ausente) |
| B3b | `sw.ts:62` | `maxEntries: MAX_ENTRADAS * 500` | `audit:pwa` + suítes | ❌ **sobreviveu** (13/13, build verde, web 323 sem importar `sw.ts`) → Lacuna 1 |
| B5 | `sw.ts:48` | `NavigationRoute` sem `denylist` de `/api/` | `audit:pwa` | ✅ morto — "OFF-01 /api/** offline: navegação a /api/obras status 200, app montado: true" |
| B4 | `index.css:1360,1374-1375` | alvos 44px → 40px e campos 16px → 15px | `audit:responsive` | ✅ morto — `medidos: 118/118, falhas: 60` (RSP-07 em 40 linhas, RSP-08 em 56; ex.: `button.btn-instalar "Instalar app" 40x40`, `button.btn-sair "Sair" 40x40`, "Ver silenciados" 40x40) |

Observação: a 1ª rodada (B1, B2, B3 removendo o uso da constante) quebrou o `tsc` (`TS6133` — import não usado) e a auditoria rodou contra o `dist` antigo; essas rodadas foram descartadas e refeitas como B1b/B2b/B3b, que compilam. `audit:pwa` base (build limpo): **13/13**.

---

## Gate

- **Comandos**: `npx jest --config apps/web/jest.config.cjs`; `cd apps/api && npx jest`; `docker exec gesso_api npm run test:e2e`; `npm run build --workspace apps/web`; `vite preview --port 4173` + `npm run audit:pwa` / `npm run audit:responsive`
- **Resultado**: web 323/323 (32 suítes), API 283/283 (18 suítes), e2e 14/14, build OK, audit:pwa 13/13, audit:responsive 118/118 com 0 falhas; nada pulado
- **Antes da feature** (tasks.md): API 251, web 147. **Depois**: API 283 (+32) + 14 e2e, web 323 (+176). Nenhum teste removido nem enfraquecido nos diffs vistos (os testes antigos de formulário ganharam asserções)

---

## Lacunas ranqueadas e tasks de correção

### 1. (Major — sensor) OFF-14 sem verificação da fiação no `sw.ts`
- **Onde**: `apps/web/src/sw.ts:62`. `regras-cache.test.ts:46` só afirma `MAX_ENTRADAS === 200`; o `sw.ts` não é importado por teste nenhum e a `audit:pwa` não conta entradas. Mutante B3b (`maxEntries: MAX_ENTRADAS * 500`) passou em tudo. O mesmo vale para `maxAgeSeconds` e para o `CacheableResponsePlugin` do `sw.ts` (mascarados pelo `pluginRecebimento`, que repete as regras).
- **Fix task**: exportar de `pwa/regras-cache.ts` as opções da estratégia (ex.: `opcoesCacheDados()` com `cacheName`, `networkTimeoutSeconds` e os plugins) e usá-las no `sw.ts`; teste unitário afirmando `maxEntries: 200`, `maxAgeSeconds: 604800`, `networkTimeoutSeconds: 5`. Alternativa: conferência no `checar-build.mjs` lendo o `dist/sw.js`.
- **Pronto quando**: B3b morre (rodar de novo a mutação).

### 2. (Major — decisão do usuário) OFF-11: depois do 401 automático o app não volta para `/login`
- **Onde**: `apps/web/src/App.tsx:17-25` (`RotaPrivada` só lê `auth.estaLogado()` ao montar); `apps/web/src/lib/api.ts:67-70` encerra a sessão e lança, mas ninguém navega. Confirmado pela própria `audit-pwa.mjs:326-350`, que precisa de uma recarga para chegar a `/login`. Na `main` é igual (`git show 8e99dc8:apps/web/src/App.tsx`).
- **Classificação**: o cache é apagado antes de qualquer ida a `/login` (essa parte ✅). Mas a letra do OFF-11 ("antes de voltar para `/login`") supõe a volta, e o Edge Case do 401 pede só "logout e mensagem" (comportamento atual). O spec se contradiz → **spec-precision gap**, e o requisito fica parcial. Risco real baixo: o cache já foi apagado e a próxima navegação sem token cai no `/login`.
- **Fix task (opção A, recomendada)**: tornar a sessão observável (ex.: `sessao.ts` avisa os assinantes em `encerrarSessao`) e fazer a `RotaPrivada` re-renderizar e redirecionar; teste: 401 numa tela → `/login` sem recarga. **Opção B**: emendar o OFF-11 para "o próximo acesso a uma rota privada vai a `/login`" e registrar em AD no STATE.md.

### 3. (Minor — Edge Case sem evidência) Nome de 120 caracteres em 320px
- **Onde**: regra em `apps/web/src/index.css:424,430`; nenhum teste. A fixture (`apps/api/scripts/fixture-auditoria.mjs:86,89`) só cria nomes curtos; a auditoria mede o que houver no banco de dev.
- **Fix task**: a fixture cria um material, uma obra (título e cliente) e um gesseiro `[audit]` com 120 caracteres (sem espaços em parte do nome, o pior caso); a `audit:responsive` exige vê-los montados (senão `NAO_MONTADO`). Pronto quando 118/118 continua verde e uma regra `overflow-wrap` removida reprova.

### 4. (Minor — Edge Case sem evidência) Armazenamento cheio
- **Onde**: `apps/web/src/sw.ts:55-66`. O Workbox grava em `waitUntil` depois de devolver a resposta, então o comportamento deve estar certo, mas nada prova.
- **Fix task**: passo na `audit:pwa` que faz o `cache.put` falhar (ex.: `Storage.overrideQuotaForOrigin` via CDP com cota mínima) e confere que a tela recebe os dados da API.

### 5. (Minor) PWA-02 sem teste das tags
- **Onde**: `apps/web/index.html` (`<link rel="apple-touch-icon">`, `<meta name="apple-mobile-web-app-title" content="Gesso">`). O `checar-build.mjs:464` só confere o PNG.
- **Fix task**: `checar-build.mjs` lê o `dist/index.html` e exige as duas tags com os valores do spec.

### 6. (Minor) RSP-07 com `pointer: coarse` acima de 900px não é medido
- **Onde**: `apps/web/src/index.css:1356`; `audit-responsive.mjs:457` só mede `mobile`.
- **Fix task**: medir RSP-07 também em 1024 com `hasTouch: true`/`isMobile: true` (o iPad).

### 7. (Minor) Edge Case de troca de largura sem teste
- **Fix task**: na `audit:responsive`, abrir um formulário em 1024, preencher, `setViewport` para 390 e conferir a barra inferior, os valores preenchidos e nenhuma navegação (mesmo `performance.timeOrigin`).

### 8. (Minor) UPD-01/UPD-02 sem teste automatizado
- **Onde**: `apps/web/src/sw.ts:37-40`. Só o Independent Test manual.
- **Fix task**: passo opcional na `audit:pwa` que gera um 2º build (mudando um texto), recarrega uma vez e confere `registration.active` novo sem `reload` da página aberta e com formulário preenchido.

### 9. (Minor) OFF-08 em formulários de edição
- Mensagem coberta na camada `api.ts` (`api.test.ts:65-78`, PATCH/PUT/DELETE), mas nenhuma tela de edição (ex.: materiais previstos, silenciar alerta) é testada mostrando a mensagem e mantendo os campos. Fix: um caso por formulário de edição.

### Spec-precision gaps (sem task de código; ajustar o spec)
- **RSP-11 / RSP-12**: não exercitáveis no headless (`dvh` = `vh` e `env()` = 0); evidência só estática (`index.css:56-57,1146-1147,286,290,305,369`). Sugestão: aceitar como verificação manual no iPhone ou checar as regras no `checar-build`.
- **RSP-06**: "igual à altura da barra"; a implementação reserva a barra + safe area + 16px. Trocar por "pelo menos".
- **OFF-13**: "a senha não é guardada" foi implementado como esvaziar o campo (`Login.test.tsx:102`). Deixar explícito no spec.
- **IDP-05**: fronteira de exatamente 24 h não definida (testes em 24 h ± 1 ms).
- **IDP-01**: o spec cita `crypto.randomUUID()`; a implementação tem fallback (`uuid.ts`) para contexto inseguro. Benigno; registrar no spec.

### Fora do escopo (pré-existente, já no STATE.md)
- Login com credencial errada mostra "Sessao expirada. Faca login novamente." porque `api.ts:67-70` trata todo 401 igual (idêntico na `main`). Com a feature, esse 401 também apaga o cache — inofensivo. Corrigir em feature própria.

---

## Qualidade do código

| Princípio | Status |
| --- | --- |
| Código mínimo / sem escopo extra | ✅ (único extra: fallback `Math.random` do `uuid.ts`, documentado) |
| Mudanças cirúrgicas | ✅ (controllers ganharam só o `executar`; services aceitam `tx`) |
| Segue os padrões (controller fino, `$transaction`, Decimal) | ✅ (AD-009) |
| Valores afirmados = valores do spec | ✅ (mensagens, 5 s, 7 dias, 200, 24 h, 422/409/`codigo`, 44×44, 16px, manifest) |
| Cobertura por camada (tasks.md) | ✅ exceto a fiação do `sw.ts` (Lacuna 1) |
| Diretrizes: `CLAUDE.md` (spec.ts por service, sem hard-delete, `$transaction`) | ✅ |

---

## Rastreabilidade (proposta para o spec.md; não editado pelo Verifier)

| Requisitos | Novo status |
| --- | --- |
| RSP-01..06, 08, 09, 10; PWA-01, 03..10; OFF-01..07, 09, 10, 12, 13, 15; IDP-01..09; UPD-03, 04 | ✅ Verified |
| RSP-07, RSP-11, RSP-12, PWA-02, OFF-08, UPD-01, UPD-02 | ⚠️ Verified com evidência parcial (Lacunas 5, 6, 8, 9 e spec-precision) |
| OFF-11 | ❌ Needs decision (Lacuna 2) |
| OFF-14 | ❌ Needs Fix (Lacuna 1) |

---

## Lições (candidatas; `lessons.py` não rodou por falta de Python)

1. Constante testada não prova fiação: quando a regra é montada num arquivo que nenhum teste importa (ex.: `sw.ts`), teste o objeto de opções que ele usa, não só a constante.
2. Mutante que só quebra o `tsc` (ex.: import sem uso com `noUnusedLocals`) não mede o teste; reescreva a mutação mantendo o uso.
3. Auditoria que roda contra `dist/` precisa conferir que o build acabou de passar; senão um build quebrado audita o artefato antigo e dá falso verde.
4. Edge Case que depende de dado ("nome de 120 caracteres") precisa entrar na fixture; medir o banco de dev não prova nada.
5. Requisito com "antes de voltar para X" pressupõe que o sistema volta para X: escrever o requisito da navegação separado do requisito da limpeza.

---

## Python indisponível

Não há Python nesta máquina: `validate_state.py` e `lessons.py` do skill não rodaram. A conferência do relatório foi feita lendo este arquivo; as lições candidatas estão na seção "Lições".

---

## Verificação manual (decisão do usuário, 2026-11-09)

Ficam fora da automação, por decisão do usuário. Rodar antes de fechar a feature e registrar aqui data, aparelho e resultado.

### UPD-01/02: versão nova instala e ativa sozinha

1. `npm run build --workspace apps/web` + `npx vite preview --port 4173` (ou o deploy da Vercel); abrir o app logado e esperar o SW ativo (DevTools > Application > Service Workers: "activated and is running").
2. Mudar um texto visível qualquer (sem commitar), gerar o build de novo e manter o preview no ar.
3. Com a aba aberta, trocar de aba do app algumas vezes: a página **não** recarrega sozinha e continua abrindo todas as telas (UPD-03/04).
4. Em DevTools > Application > Service Workers, o SW novo aparece instalado e ativado sem clique em "skipWaiting" (UPD-01/02).
5. Recarregar a página: o texto novo aparece. Desfazer a mudança e gerar o build de novo.

### RSP-11/12: altura dinâmica e safe areas

1. Num iPhone com notch, abrir o app pelo Safari e rolar: o rodapé e a barra inferior acompanham a barra de endereço que aparece e some (`100dvh`, RSP-11).
2. Instalar pela "Adicionar à Tela de Início" e abrir pelo ícone: o topo não fica sob o notch e a barra inferior não fica sob a barra de gestos (RSP-12).

| Item | Data | Aparelho / navegador | Resultado |
| --- | --- | --- | --- |
| UPD-01/02 | | | |
| RSP-11 | | | |
| RSP-12 | | | |
