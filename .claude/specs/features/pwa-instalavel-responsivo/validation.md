# PWA Instalável e Responsivo — Validação (rodada 2)

## Veredito: ✅ PASS

Os 48 requisitos automatizáveis estão `Verified`, com evidência `arquivo:linha` abaixo. O sensor de
discriminação matou todos os mutantes depois das correções de teste desta rodada (2 lacunas de
precisão viraram teste). O auditor de testes (AD-012) rodou: 7 mutações sem cobertura viraram teste
e 5 ficaram aceitas com motivo.

**Pendente, e não bloqueia o veredito**: RSP-11 e RSP-12 só se verificam num aparelho real com
notch (decisão do usuário, 2026-11-09). O CSS está no lugar (evidência estática abaixo), mas os
dois ficam em `Implementing` até o usuário preencher a tabela de verificação manual.

- **Diff verificado**: branch `feat/pwa-instalavel-responsivo` até `8f68ddd`, mergeado na `main` em `cc61e5f` (PR #11). Árvore verificada: `cc61e5f`.
- **Rodada 1** (2026-11-09): FAIL, com 1 mutante sobrevivente (OFF-14), 2 Edge Cases sem teste e o OFF-11 sem volta a `/login`. Correções T32–T38 (`6f8043b..de0e7a5`). O relatório completo está no histórico do git (`git show de0e7a5:.claude/specs/features/pwa-instalavel-responsivo/validation.md`).
- **Rodada 2**: começou em 2026-11-09 e terminou em 2026-11-19. O rascunho da tabela por requisito, que ficava no scratchpad da sessão de 09/11, se perdeu; a tabela abaixo foi refeita a partir dos testes.

---

## Gate (2026-11-19, árvore `cc61e5f` + testes desta rodada)

| Suíte | Resultado |
| --- | --- |
| API unit (`npm run test --workspace apps/api`) | 321/321 (base 312 + 9 novos) |
| Web unit (`npm run test --workspace apps/web`) | 330/330 (base 329 + 1 novo) |
| API e2e (`docker exec gesso_api npm run test:e2e -- --runInBand`) | 14/14 |
| Build (`npm run build`, inclui `checar-build`) | OK: 1 chunk JS, `sw.js`, manifest igual ao PWA-01, 4 ícones, tags do iPhone |
| `npm run audit:responsive` | `medidos: 118/118, nao montados: 0, falhas: 0`; troca de largura 1366 → 390 OK; fixture limpa |
| `npm run audit:pwa` | `conferencias: 14/14 ok, falhas: 0`; Cache Storage e SW limpos no fim |

## Checagem ancorada no spec

| Req | Evidência (o teste afirma o resultado que a spec define) | Status |
| --- | --- | --- |
| RSP-01 | `apps/web/scripts/audit-responsive.mjs:449` (`scrollWidth == innerWidth` em 6 larguras × 15 estados, mais 14 estados em 1024/1366 sem toque) | Verified |
| RSP-02 | `audit-responsive.mjs:456,458` (`.tabela-wrap` com `overflow-x: auto`, dentro da viewport) | Verified |
| RSP-03 | `apps/web/src/components/Layout.test.tsx:36`; `audit-responsive.mjs:481-485` (fixa, 4 abas, rótulo curto, aba ativa) | Verified |
| RSP-04 | `Layout.test.tsx:60`; `audit-responsive.mjs:489` (topo ≤ 64px) | Verified |
| RSP-05 | `Layout.test.tsx:36`; `audit-responsive.mjs:510-512` (sidebar lateral, rótulos longos) | Verified |
| RSP-06 | `audit-responsive.mjs:499` (último elemento acima da barra) | Verified |
| RSP-07 | `audit-responsive.mjs:523` (campos ≥ 16px) | Verified |
| RSP-08 | `audit-responsive.mjs:528-543` (alvos ≥ 44×44 em ≤ 900px) | Verified |
| RSP-09 | `apps/web/src/pages/Gesseiros.test.tsx:114` | Verified |
| RSP-10 | `Gesseiros.test.tsx:130` | Verified |
| RSP-11 | Estática: `apps/web/src/index.css:56-57` (`min-height: 100vh` e depois `100dvh`). Falta o aparelho | Implementing (manual) |
| RSP-12 | Estática: `apps/web/index.html:5` (`viewport-fit=cover`); `index.css:286,290,305,369` (`env(safe-area-inset-*)`). Falta o aparelho | Implementing (manual) |
| PWA-01 | `apps/web/src/pwa/manifest.test.ts:6`; `apps/web/scripts/checar-build.mjs:42` | Verified |
| PWA-02 | `checar-build.mjs:78,81` | Verified |
| PWA-03 | `apps/web/src/pwa/registrar-sw.test.ts:25`; `audit-pwa.mjs` (SW ativo no build) | Verified |
| PWA-04 | `registrar-sw.test.ts:34` | Verified |
| PWA-05 | `apps/web/src/components/BotaoInstalar.test.tsx:34`; `Layout.test.tsx:92`; `apps/web/src/lib/instalacao.test.ts:84` | Verified |
| PWA-06 | `BotaoInstalar.test.tsx:34`; `instalacao.test.ts:84` | Verified |
| PWA-07 | `BotaoInstalar.test.tsx:27`; `instalacao.test.ts:84` | Verified |
| PWA-08 | `BotaoInstalar.test.tsx:27`; `instalacao.test.ts:147` | Verified |
| PWA-09 | `BotaoInstalar.test.tsx:27`; `instalacao.test.ts:85` | Verified |
| PWA-10 | `BotaoInstalar.test.tsx:48` (texto exato); `instalacao.test.ts:168`; estado `instalar-instrucao` da `audit-responsive.mjs` | Verified |
| OFF-01 | `apps/web/scripts/audit-pwa.mjs:230` (recarregar `/estoque` offline) e `:263` (`/api/**` offline sem HTML) | Verified |
| OFF-02 | `apps/web/src/pwa/regras-cache.test.ts:53`; `audit-pwa.mjs:210` | Verified |
| OFF-03 | `regras-cache.test.ts:45,149`; `audit-pwa.mjs:299` (API lenta: cache em 5 s) | Verified |
| OFF-04 | `regras-cache.test.ts:102` (`X-From-Cache`); `apps/web/src/lib/api.test.ts:131`; `audit-pwa.mjs:230,299` | Verified |
| OFF-05 | `api.test.ts:54` (mensagem exata); `audit-pwa.mjs:246` | Verified |
| OFF-06 | `apps/web/src/components/IndicadorConexao.test.tsx:34` (`aria-label` e `title` exatos, sem texto); `api.test.ts` "POST com 200 (o login) não registra origem" (novo) | Verified |
| OFF-07 | `IndicadorConexao.test.tsx:55`; `api.test.ts:131` | Verified |
| OFF-08 | `apps/web/src/lib/useEnvio.test.ts:84`; `apps/web/src/components/forms/MateriaisPrevistosForm.test.tsx:242` | Verified |
| OFF-09 | `regras-cache.test.ts:53,77` | Verified |
| OFF-10 | `regras-cache.test.ts:45,77,102` | Verified |
| OFF-11 | `apps/web/src/App.test.tsx:81`; `Layout.test.tsx:126`; `audit-pwa.mjs:354,379` | Verified |
| OFF-12 | `apps/web/src/lib/sessao.test.ts:152`; `apps/web/src/pages/Login.test.tsx:37` | Verified |
| OFF-13 | `Login.test.tsx:102` (mensagem exata, e-mail mantido, senha vazia) | Verified |
| OFF-14 | `regras-cache.test.ts:45,149` (200 entradas na estratégia que o `sw.ts` registra; o sobrevivente da rodada 1 foi morto na rodada 2, N10–N15) | Verified |
| OFF-15 | `apps/web/src/lib/conexao.test.ts:94`; `apps/web/src/components/AlertasEstoque.test.tsx:414`; `apps/web/src/pages/Obras.test.tsx:213` | Verified |
| IDP-01 | `api.test.ts:188`; `useEnvio.test.ts:84`; `apps/api/src/idempotencia/contexto-idempotencia.decorator.spec.ts` (cabeçalho vazio e UUID com sobra dão 400, novos) | Verified |
| IDP-02 | `apps/api/src/idempotencia/idempotencia.service.spec.ts:143`; `apps/api/test/idempotencia.e2e-spec.ts:135` | Verified |
| IDP-03 | `idempotencia.service.spec.ts:130`; `idempotencia.e2e-spec.ts:168` | Verified |
| IDP-04 | `idempotencia.service.spec.ts:115`; `idempotencia.e2e-spec.ts:181`; "outro erro conhecido do Prisma… não 409" (novo) | Verified |
| IDP-05 | `idempotencia.service.spec.ts:154,165`; "o delete é aguardado antes de gravar a chave nova" e "agendamento da limpeza" (novos) | Verified |
| IDP-06 | `contexto-idempotencia.decorator.spec.ts:34`; `idempotencia.service.spec.ts:75` | Verified |
| IDP-07 | `useEnvio.test.ts:130` | Verified |
| IDP-08 | `useEnvio.test.ts:84`; `NovoMaterialForm.test.tsx:115` | Verified |
| IDP-09 | `idempotencia.e2e-spec.ts:108` | Verified |
| UPD-01 | Roteiro manual executado num Chrome real em 2026-11-19 (ver "Verificação manual"): o SW do build B instala com o app aberto, `waiting: false` | Verified |
| UPD-02 | Mesmo roteiro: o B fica `activated` sem confirmação, e a página antiga recebe `controllerchange` | Verified |
| UPD-03 | `registrar-sw.test.ts:55`; roteiro: a página antiga não recarrega e o campo digitado fica | Verified |
| UPD-04 | `checar-build.mjs:32` (1 chunk, sem `import()`); roteiro: a página antiga navega sem `pageerror` | Verified |

**Edge Cases**

| Edge Case | Evidência |
| --- | --- |
| Navegador sem service worker | `registrar-sw.test.ts:42`; `sessao.test.ts:59,172` |
| Armazenamento cheio | `audit-pwa.mjs:326` |
| Outro usuário no mesmo aparelho | `sessao.test.ts:152` (login apaga o cache antes de gravar a sessão, OFF-12) |
| 401 com rede | `audit-pwa.mjs:340,379`; `apps/web/src/lib/api.test.ts:164` |
| Troca de largura sem recarregar | `audit-responsive.mjs:675` (1366 → 390 com formulário preenchido) |
| Nome longo (até 120 caracteres) em 320px | `audit-responsive.mjs:133-143`, com o `NOME_LONGO` corrigido nesta rodada (ver RR1) |

## Sensor de discriminação

Os mutantes rodaram em cópias isoladas: uma worktree no scratchpad para os testes unit e cópias
do `dist` servidas por `vite preview --outDir` para as auditorias. Nunca se usou `git stash`. O
`git status --porcelain` da árvore real no fim é igual à base mais os arquivos desta rodada.

| Grupo | Resultado |
| --- | --- |
| Web unit (rodada 2, 09/11) | 32/32 mortos (N01–N07, N10–N15, N20–N21, R01–R17) |
| API unit e e2e (rodada 2, 09/11) | 7/7 + 1/1 mortos (N30, N31, RA1, RA2b, RA3–RA5; RE1) |
| Build/navegador (rodada 2, 09/11) | 5/5 mortos (B1–B5) |
| `audit:responsive` (19/11) | 8/8 mortos depois da correção do RR1 (tabela abaixo) |
| UPD / `sw.ts` (19/11) | 2/2 mortos (U1, U2) |
| Auditor de testes (19/11) | 7/7 mortos pelos testes novos (A1–A6, W1) |

| Mutante | Injeção | Morto por |
| --- | --- | --- |
| RR1 | nomes de card sem `overflow-wrap` | **Sobreviveu** com o `NOME_LONGO` antigo, que só tinha palavras curtas e quebrava nos espaços. Corrigido: o nome começa com 48 caracteres sem espaço (`audit-responsive.mjs:99-106`). Morre com 21 falhas RSP-01; a base continua 118/118 |
| RR2 | `.tabela-wrap { overflow-x: visible }` | RSP-02, RSP-01 (40 falhas) |
| RR3 | `.nav { position: static }` em ≤ 900px | RSP-03, RSP-06 (56) |
| RR4 | topo com 90px | RSP-04 (56) |
| RR5 | sidebar desktop com o rótulo curto | RSP-05 (54) |
| RR6 | `.conteudo` sem a reserva da barra | RSP-06 (51) |
| RR7 | campos com 14px | RSP-07 (60) |
| RR8 | `.chip` com 30px | RSP-08 (16) |
| U1 | build B sem `self.skipWaiting()` | roteiro UPD: B fica `waiting`, sem `controllerchange` |
| U2 | build A sem `self.clients.claim()` | roteiro UPD: a primeira visita fica sem controlador. Na troca de versão ele é equivalente: uma página já controlada passa sozinha para o SW novo com o `skipWaiting` |
| A1 | `idempotencia.service.ts:73` sem `await` no delete | "o delete é aguardado antes de gravar a chave nova" |
| A2 | `:95` sem `&& erro.code === 'P2002'` | "outro erro conhecido do Prisma… não 409" |
| A3 | `:108` sem `@Cron` | "limparVencidas fica registrado como cron de hora em hora" |
| A4 | `app.module.ts:19` sem `ScheduleModule.forRoot()` | "o AppModule importa o ScheduleModule" |
| A5 | `contexto-idempotencia.decorator.ts:20` `!chave` | "cabeçalho vazio dá 400" |
| A6 | regex sem `^`/`$` | "UUID com sobra dá 400" (3 casos) |
| W1 | `api.ts:81` sem `metodo === 'GET'` | "POST com 200 (o login) não registra origem" |

## Auditoria de testes

Sub-agente `auditor-de-testes`, 2026-11-19, sobre a idempotência (API), o CORS, o `lib/api.ts`,
`sessao`, `conexao`, `useEnvio`, `regras-cache`, `sw.ts` e `instalacao`.

**Veredito do auditor**: a cobertura é real em quase tudo. Ele achou três pontos parciais: o
`sw.ts`, que não tem teste automatizado; os pontos de montagem (`main.ts` e `main.tsx`); e dois
ramos do `IdempotenciaService`. Não achou nenhum mock de `$transaction` que passe o próprio `prisma`
como `tx` nos testes desta feature.

| Mutação sem cobertura (auditor) | Requisito | Destino |
| --- | --- | --- |
| `idempotencia.service.ts:73` sem `await` no delete | IDP-05 | Teste novo (A1), com o `delete` "preguiçoso" como no Prisma real |
| `idempotencia.service.ts:95` sem filtro P2002 | IDP-04 | Teste novo (A2) |
| `@Cron` / `ScheduleModule` removidos | IDP-05 | Testes novos (A3, A4) |
| Decorator: cabeçalho vazio e regex sem âncoras | IDP-01 | Testes novos (A5, A6) |
| `api.ts:81` sem `metodo === 'GET'` | OFF-06 | Teste novo (W1) |
| `sw.ts:29-32` sem `skipWaiting` / `clientsClaim` | UPD-01/02 | Morto pelo roteiro UPD executado (U1, U2). **Aceito** sem teste no CI: a decisão do usuário (09/11) deixa o UPD fora da automação |
| `main.ts:12` sem `configurarCors(app)` | IDP-09 | **Aceito**: as duas auditorias de navegador chamam a API do Docker (que sobe pelo `main.ts`) a partir de outra origem (`:4173` → `:3000`), então sem CORS o login falharia e as duas reprovariam. Raciocínio, sem mutante executado |
| `main.tsx:22` com `prod: true` fixo | PWA-04 | **Aceito**: no dev o `/sw.js` não existe, o `register` falha e o `registrar-sw` engole o erro (`registrar-sw.test.ts:49`). O impacto se limita a um aviso no console do dev |
| `main.tsx:11` sem `iniciarCapturaInstalacao()` | PWA-05 | **Aceito**: a `audit-responsive` conta como não montada toda página logada sem o "Instalar app" (`audit-responsive.mjs`, cabeçalho), e ela fica vermelha. Raciocínio, sem mutante executado |
| `sw.ts:55-68`, rotas de fontes | Assumption "Fontes" (sem ID) | **Aceito**: não é requisito com ID. Verificação visual offline no roteiro do OFF-01 |
| `sw.ts:40/46`, `denylist` e `BASE_URL` | OFF-01/02 | O auditor deu como "só `audit-pwa`". Já morto na rodada 2 (B5) pela `audit:pwa`, que faz parte do gate de navegador. Não é lacuna |

Testes que o auditor apontou como fracos: `idempotencia.service.spec.ts:154` (o mock resolve na
hora) foi reforçado com o caso A1, e `idempotencia.service.spec.ts:233` (chama o método direto)
ganhou o caso A3.

## Lacunas de precisão encontradas nesta rodada

1. **Edge Case do nome longo (RR1)**: o nome de teste quebrava nos espaços, então a regra
   `overflow-wrap: anywhere` nunca era exercitada. Corrigido no próprio teste
   (`audit-responsive.mjs:99-106`), sem mudar código de produção.
2. **`clientsClaim` (U2)**: a spec não diz que a primeira visita precisa ficar controlada sem
   recarregar. O OFF-01 depende disso ("depois de pelo menos uma visita online com o service
   worker ativo"). Fica registrado aqui; não muda a spec.

## Limpeza final (2026-11-19)

- Worktree do sensor removida (`git worktree list` só mostra a árvore principal; junções de `node_modules` desfeitas antes, `node_modules` reais intactos).
- Cópias do `dist` apagadas; porta 4173 livre; Cache Storage e SW removidos no fim de cada roteiro.
- Banco: 0 obras, gesseiros, materiais ou análises com `[e2e]`/`[audit]`.
- `git status --porcelain`: base (4 arquivos de spec de `obras-transicoes-status` e o `STATE.md`) mais os arquivos desta rodada: os 3 testes (`idempotencia.service.spec.ts`, `contexto-idempotencia.decorator.spec.ts`, `api.test.ts`), `audit-responsive.mjs`, este `validation.md` e o `spec.md` do PWA.

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
| UPD-01/02 | 2026-11-19 | Chrome headless (puppeteer-core), executado pelo agente. O build B foi feito a partir do `dist` com texto, nome do JS e revisão do `index.html` trocados, como num build real | OK: B `activated`, sem `waiting`; a página antiga recebeu `controllerchange`, não recarregou e manteve o campo; nenhum `pageerror`; depois da recarga, texto novo. Os mutantes U1/U2 reprovam o roteiro. Pode ser repetido à mão pelos passos acima |
| RSP-11 | | | |
| RSP-12 | | | |
