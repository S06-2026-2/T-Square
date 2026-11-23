# STATE

## Decisions

### AD-001
- **Decision**: Planta baixa da obra continua sendo um campo de URL (`Obra.plantaBaixaUrl`), sem upload de arquivo pelo sistema.
- **Reason**: Simplicidade — não exige decidir/implementar storage (disco local vs bucket) nem endpoint de upload, e o time não tem prazo apertando essa escolha.
- **Trade-off**: Fica menos fiel à ideia original ("mostrar a planta baixa"); o cliente precisa hospedar o arquivo em outro lugar (Drive, WhatsApp etc.) e mandar o link.
- **Scope**: `front-formularios` (formulário de nova obra); qualquer feature futura que toque planta baixa deve reconsiderar esta decisão antes de adicionar upload.
- **Date**: 2026-09-14
- **Status**: active

### AD-002
- **Decision**: Nenhuma rota é restrita por papel (`Papel.ADMIN` vs `Papel.OPERADOR`) por enquanto — qualquer usuário autenticado pode executar qualquer ação.
- **Reason**: O guard JWT global já cobre autenticação; adicionar autorização por papel agora expandiria o escopo das specs de Gesseiros/Estoque/Formulários sem necessidade imediata da disciplina.
- **Trade-off**: O enum `Papel` fica sem efeito prático no comportamento do sistema (existe no schema, não é checado em nenhuma rota).
- **Scope**: Todas as features atuais (`gesseiros-crud-financeiro`, `estoque-materiais-movimentacao`, `front-formularios`, `front-dashboard-resumo`); uma feature futura de RBAC precisa revisitar cada uma delas.
- **Date**: 2026-09-14
- **Status**: active

### AD-003
- **Decision**: Entidades com histórico financeiro/relacional (a começar por `Gesseiro`) nunca são hard-deletadas — "remover" significa `ativo=false`, preservando a linha e todas as FKs que apontam para ela.
- **Reason**: `Lancamento` e `ObraGesseiro` referenciam `gesseiroId`; apagar a linha órfãos o histórico financeiro (extrato) que é o propósito central do sistema.
- **Trade-off**: Listagens "ativas" precisam sempre filtrar por `ativo=true` explicitamente; o banco acumula registros inativos indefinidamente (sem purge).
- **Scope**: `gesseiros-crud-financeiro` agora; convenção a seguir se `Material` ou `Obra` ganharem um endpoint de remoção no futuro.
- **Date**: 2026-09-14
- **Status**: active

### AD-004
- **Decision**: Seletores de gesseiro no front para ações novas (criar obra, alocar) mostram só gesseiros com `ativo=true`, filtrando no cliente a resposta de `GET /gesseiros`.
- **Reason**: Aplica o AD-003 ("listagens ativas filtram `ativo`") sem alterar o backend desta vez — `GesseirosService.findAll` devolve todos e `ObrasService.alocarGesseiro` não checa `ativo`.
- **Trade-off**: A regra vive só no front; uma chamada direta à API (Swagger) ainda consegue alocar um inativo. Uma feature futura pode mover o filtro/validação para o backend.
- **Scope**: `front-formularios`.
- **Date**: 2026-10-07
- **Status**: active

### AD-005
- **Decision**: O front não oferece alocação de gesseiro em obra `CONCLUIDA` ou `CANCELADA`.
- **Reason**: Os créditos são gerados uma única vez em `ObrasService.concluir()`; alocar depois disso nunca credita o gesseiro e deixa o registro enganoso.
- **Trade-off**: Também só no front — o endpoint `POST /obras/:id/gesseiros` continua aceitando qualquer status.
- **Scope**: `front-formularios`.
- **Date**: 2026-10-07
- **Status**: active

### AD-006
- **Decision**: O agente de estoque é um agente LLM com ferramentas (Claude API, modelo configurável via `ANTHROPIC_MODEL`, padrão Haiku 5.5). Ele conduz a análise usando ferramentas somente de leitura e uma única ferramenta de escrita (`sugerirReposicao`), que grava apenas em `AlertaEstoque`. O código valida cada sugestão (faixa de 50% a 200% do cálculo determinístico) e garante os alertas obrigatórios (saldo livre <= mínimo) mesmo sem LLM. O agente nunca grava `MovimentacaoEstoque` nem altera `saldoAtual`. Dados pessoais de clientes nunca são enviados à API (obras vão como marcadores).
- **Reason**: Demonstrar um agente real que decide o que investigar, mantendo números verificáveis, custo controlado (`AGENTE_AUTOMATICO`, limites de 50 chamadas / 2 min, eram 20 até a AD-008) e a feature funcionando sem chave de API.
- **Trade-off**: Resultados não determinísticos entre execuções, testes mais complexos (LLM mockada com roteiros de chamadas de ferramenta) e custo por execução na API.
- **Scope**: `estoque-agente-proativo`.
- **Date**: 2026-10-27
- **Status**: active

### AD-007
- **Decision**: O status da `Obra` só muda pelos endpoints de transição (`PATCH /obras/:id/fechar`, `/iniciar`, `/concluir`, `/cancelar`); nenhum DTO genérico (`CreateObraDto`, `UpdateObraDto`) aceita `status`. Toda transição é um update condicional ao status de origem (`updateMany` com `where: { id, status: { in: origens } }`) dentro de `$transaction`; `count === 0` vira o 400 de transição inválida.
- **Reason**: Fechar os atalhos que deixavam pular etapas ou concluir sem créditos, e garantir créditos de conclusão uma única vez mesmo com cliques simultâneos, sem lock explícito.
- **Trade-off**: Quem integra pela API precisa chamar uma rota por etapa; mudar o status pelo `PATCH /obras/:id` passa a responder 400.
- **Scope**: `obras-transicoes-status` e qualquer feature futura que mude o status da obra.
- **Date**: 2026-10-29
- **Status**: active

### AD-008
- **Decision**: O teto do loop do agente de estoque sobe de 20 para 50 chamadas de ferramenta por análise (`LIMITE_CHAMADAS_FERRAMENTA`); o prazo de 2 min fica igual.
- **Reason**: Com 8 materiais e o método de investigação obrigatória (EAP-67, EAP-71/72), as análises de 29/10 batiam o limite de 20 em ~23 s e terminavam `PARCIAL` sem ver todos os materiais. Pedido do usuário (2026-10-29).
- **Trade-off**: O pior caso de custo sobe de ~175k para ~1M tokens de entrada por análise (histórico reenviado a cada turno): ~US$ 0,13 no Haiku 5.5. A ~1,1 s por chamada, 50 chamadas cabem nos 2 min, mas com mais materiais o prazo pode passar a ser o limite.
- **Scope**: `estoque-agente-proativo` (spec critério 9 da análise, assumptions "Limites do loop" e "Estimativa de custo").
- **Date**: 2026-10-29
- **Status**: active

### AD-009
- **Decision**: Todo POST de criação (hoje: gesseiro, lançamento, obra, material, movimentação) aceita `Idempotency-Key` (UUID). O controller chama `IdempotenciaService.executar(ctx, (tx) => service.criar(dto, tx))` (`apps/api/src/idempotencia/`), e a chave é gravada em `chaves_idempotencia` **na mesma `$transaction`** que a entidade. O escopo é (usuário, método + path, chave), com vida de 24 h. Mesma chave e mesmo corpo devolvem a resposta original; outro corpo dá 422; pedido simultâneo dá 409 (por `pg_try_advisory_xact_lock`); erro desfaz entidade e chave juntas. O CORS lista `Idempotency-Key` em `allowedHeaders` (`src/cors.ts`). No front, a chave vem do `useEnvio`.
- **Reason**: Com sinal ruim, a resposta se perde e o reenvio duplicaria lançamentos. Como o saldo é derivado de lançamentos, isso vira saldo errado. A gravação na mesma transação evita chave presa e lançamento sem chave se a API cair no meio (decisão do usuário).
- **Trade-off**: Todo método de criação precisa aceitar `tx: ClientePrisma = this.prisma` e nunca abrir `this.prisma.$transaction` quando recebe um `tx` (o Prisma não aninha transações interativas). Os controllers das rotas de criação ganham uma linha de `executar()`.
- **Scope**: `pwa-instalavel-responsivo`. Convenção para qualquer POST de criação novo.
- **Date**: 2026-11-09
- **Status**: active

### AD-010
- **Decision**: O front não usa rotas lazy (`React.lazy`/`import()`): o build sai num único chunk JS. Todo fim e início de sessão passa por `lib/sessao.ts`, que apaga o cache `api-dados` do service worker; nada além de `sessao.ts` chama `auth.logout()`.
- **Reason**: Com `skipWaiting` + `clientsClaim`, uma página aberta da versão antiga pediria chunks que não existem mais (UPD-04). O cache de dados guarda informação financeira, e a chave do cache é só a URL.
- **Trade-off**: O bundle inicial cresce com o app; revisar se o número de telas crescer muito.
- **Scope**: `pwa-instalavel-responsivo` e qualquer tela ou fluxo de login/logout novo.
- **Date**: 2026-11-09
- **Status**: active

### AD-011
- **Decision**: O `Dockerfile` de produção da API (`apps/api/Dockerfile`) usa a **raiz do repositório** como contexto de build (`docker build -f apps/api/Dockerfile .`), copia só os manifestos e o código da API (mais o `package.json` do web, que o `npm ci` valida contra o lock) e instala com `npm ci --workspace apps/api`. Há um `.dockerignore` na raiz. O CI (`.github/workflows/ci.yml`, job `docker`) builda a imagem e a sobe contra um Postgres, checando `/api/health`. O job `api` do CI passou a rodar o seed e os testes e2e (`--runInBand`).
- **Reason**: O Dockerfile antigo usava contexto `apps/api`, onde não existe `package-lock.json` (só o da raiz, por causa dos workspaces); `npm ci` falha com `EUSAGE` (reproduzido). O CI não cobria nem o Dockerfile nem os e2e, então nada avisava.
- **Trade-off**: O Render precisa estar configurado com `Dockerfile Path = apps/api/Dockerfile` e `Root Directory` vazio (config fora do repositório, fácil de divergir). O contexto na raiz é maior, mitigado pelo `.dockerignore`.
- **Scope**: Deploy da API e CI. Qualquer arquivo novo que o build da API precise tem que entrar num `COPY` explícito do Dockerfile.
- **Date**: 2026-11-09
- **Status**: active

### AD-012
- **Decision**: Nenhum requisito de spec passa para `Verified` sem rodar o sub-agente `auditor-de-testes` (`.claude/agents/auditor-de-testes.md`) no service e no `.spec.ts` da feature. Mutação que o auditor aponta como não coberta vira teste, ou fica aceita com o motivo; o resultado vai numa seção `## Auditoria de testes` do `validation.md`.
- **Reason**: O estoque foi dado como pronto com testes que não provavam a atomicidade: o mock de `$transaction` passava o próprio `prisma` como `tx`, então tirar uma escrita da transação não derrubava nenhum teste. O auditor existia desde outubro, mas nada o chamava.
- **Trade-off**: Fechar uma spec fica mais lento (uma rodada de auditoria e, em geral, testes a mais). A regra vive no `CLAUDE.md` (seção "Auditoria de testes") e no passo 7 da skill `implementar-todo`: é instrução para o agente, não trava. Quem revisa o PR confere a seção no `validation.md`.
- **Scope**: Todas as features, inclusive o Verifier do fluxo `tlc-spec-driven`. Primeira aplicação: `estoque-materiais-movimentacao` (2026-11-09).
- **Date**: 2026-11-09
- **Status**: active
- **Nota (2026-11-19)**: nasceu como AD-009 num branch paralelo ao do PWA, que também criou uma AD-009 (idempotência). O merge da PR #11 deixou os dois textos em conflito no `STATE.md`. Como o código cita AD-009 para a idempotência (`idempotencia.service.ts`, `estoque.service.ts`), esta regra passou para a AD-012, que estava vaga.

### AD-013
- **Decision**: O deploy da API e do banco é declarado no `render.yaml` (Blueprint do Render): Postgres e Web Service Docker no plano `free`, região `virginia`, deploy automático só com o CI verde (`checksPass`) e `JWT_SECRET` gerado pelo Render. Em produção (`NODE_ENV=production`) a API se recusa a subir sem `JWT_SECRET` próprio (`auth/segredo-jwt.ts`), e o `CORS_ORIGIN` é normalizado (sem espaços nem barra final; vazio libera tudo).
- **Reason**: O repositório é público e o segredo padrão (`troque-esse-segredo-em-producao`) estava como fallback no código: um deploy sem `JWT_SECRET` deixaria qualquer pessoa assinar um token válido. Configurar o serviço à mão no dashboard diverge do repositório (trade-off da AD-011); o Blueprint deixa a configuração versionada.
- **Trade-off**: No plano free a API dorme após 15 min (primeira requisição ~1 min) e o Postgres expira 30 dias após a criação (+14 de carência, depois é apagado, com os dados). Região não muda depois de criada.
- **Scope**: Deploy da API (Render) e qualquer variável de ambiente nova de produção, que deve entrar no `render.yaml`.
- **Date**: 2026-11-19
- **Status**: active

### AD-014
- **Decision**: As transições de status da obra (`PATCH /obras/:id/fechar|iniciar|concluir|cancelar`) não usam `Idempotency-Key`. O reenvio é seguro pela AD-007: repetir uma transição que já foi aplicada responde 400 de transição inválida, sem efeito. No front, um erro HTTP numa transição mostra a mensagem da API **e** recarrega a lista com o filtro atual, para o card mostrar o status real. Uma falha de rede mostra `SEM_CONEXAO_ENVIO` (OFF-08), mantém o card como estava e nada é reenviado sozinho.
- **Reason**: Sem a recarga, quem reenvia um "Concluir obra" cuja resposta se perdeu recebe "Não é possível concluir uma obra com status CONCLUIDA" e continua vendo o card em andamento. A AD-009 vale só para `POST` de criação, e o update condicional já impede crédito em dobro.
- **Trade-off**: Depois de um reenvio de uma transição que já tinha sido aplicada, o operador vê uma mensagem de erro, mas a lista já mostra a obra no status certo. Um 400 de validação (ex.: motivo curto) também recarrega a lista, o que é inofensivo.
- **Scope**: `obras-transicoes-status` (TRN-13) e qualquer ação futura que mude o status da obra pela UI.
- **Date**: 2026-11-19
- **Status**: active (confirmada pelo usuário em 2026-11-19)

### AD-015
- **Decision**: Exceção à AD-003. Obra, gesseiro e material podem ser **arquivados** (`arquivadoEm`), e um job diário apaga de vez o que está arquivado há 7 dias ou mais. Enquanto está arquivado, vale a AD-003: o registro fica no banco e pode ser restaurado. Na limpeza da obra, os `Lancamento` e as `MovimentacaoEstoque` dela ficam com `obraId = null`, e o saldo dos gesseiros não muda. Na limpeza do gesseiro (saldo já 0) e do material, o histórico deles sai junto.
- **Reason**: Pedido do usuário em 2026-11-20: não guardar no banco o que não serve mais. A janela de 7 dias permite desfazer um arquivamento errado.
- **Trade-off**: Depois da limpeza não há como recuperar. O extrato perde o vínculo clicável com a obra (fica só a descrição), e as obras perdem a linha do material apagado no previsto x utilizado. "Saldo derivado de lançamentos" continua valendo, porque nenhum lançamento de gesseiro ativo é apagado.
- **Scope**: `arquivar-e-limpar-registros`.
- **Date**: 2026-11-20
- **Status**: active (spec aprovada pelo usuário em 2026-11-20)

### AD-016
- **Decision**: O `auditor-de-testes` roda no GitHub Actions em todo PR para a `main` que mexe em código (`.github/workflows/auditoria-testes.yml`): Claude Code em modo headless, só leitura (`Read`, `Grep`, `Glob`), modelo `sonnet`, teto de US$ 1 por execução, instruções lidas do próprio `.claude/agents/auditor-de-testes.md`. Um passo sem IA comenta o relatório no PR. Não bloqueia o merge. Quem bloqueia é o job sem IA "Specs (auditoria registrada)" do CI, que falha se uma spec tem requisito `Verified` sem a seção `## Auditoria de testes` no `validation.md`.
- **Reason**: A AD-012 dependia de quem desenvolve usar o Claude: quem programasse sem ele marcaria `Verified` sem auditoria e nada reclamaria. Pedido do usuário (2026-11-23): o auditor tem que funcionar independente de a pessoa usar o Claude.
- **Trade-off**: Cada PR custa uma chamada paga (teto de US$ 1, chave da equipe no segredo `ANTHROPIC_API_KEY`; sem o segredo o job só avisa). O resultado varia entre execuções (a simulação de 2026-11-23 achou 15 mutações novas num arquivo já auditado), por isso é parecer e não trava. PR de fork não roda, porque não recebe segredos. O job sem IA confere que a auditoria foi registrada, não a qualidade dela.
- **Scope**: Todas as features; complementa a AD-012.
- **Date**: 2026-11-23
- **Status**: active

## Handoff

- **PWA fechado (2026-11-19)**: `pwa-instalavel-responsivo` mergeado na `main` (PR #11, `cc61e5f`). Verifier rodada 2 concluída: `validation.md` **PASS**, 48/50 `Verified`. Sensor: `audit:responsive` 8/8 (o RR1 sobreviveu com o `NOME_LONGO` antigo, que só tinha palavras curtas; o teste foi corrigido), `sw.ts` 2/2 pelo roteiro UPD executado num Chrome headless. Auditor de testes (AD-012): 7 mutações viraram teste (idempotência, decorator, `api.ts`) e 5 ficaram aceitas com motivo. Suítes: API 321, web 330, e2e 14, `audit:responsive` 118/118, `audit:pwa` 14/14. **Pendente do usuário**: RSP-11/12 num iPhone com notch (tabela em `validation.md`). Os arquivos da rodada 2 ainda não foram commitados.
- **Feature ativa**: `obras-transicoes-status` **implementada e verificada (2026-11-19)**, executada inline a pedido do usuário. T1–T16 concluídas; `validation.md` **PASS**, TRN-01..14 `Verified`. Suítes: API 397, web 371, e2e 19, `audit:responsive` 126/126, `audit:pwa` 14/14. Sensor: 21 mutantes de código + 2 de CSS, todos mortos. Auditor (AD-012): 9 achados, todos viraram teste ou correção (bug do cancelamento com 400 quando a recarga traz a obra final). Um teste fraco foi aceito com motivo. Migration nova: `20261119170138_obra_motivo_cancelamento` (só `ADD COLUMN`). **Pendente do usuário**: o teste manual pela UI (T15), inclusive o cancelamento com o DevTools em Offline. Os arquivos ainda não foram commitados.
- **Auditoria das features antigas (2026-11-23)**: `estoque-agente-proativo`, `front-dashboard-resumo`, `front-formularios` e `gesseiros-crud-financeiro` passaram pelo auditor (AD-012) e ganharam a seção no `validation.md`. As lacunas viraram teste e cada mutação foi aplicada para confirmar (API 490 → 523 testes, web 436 → 449). Correção de produção: EAP-16 (análise `FALHA` não reescreve mais o alerta ATIVO existente). GES-08, GES-10 e GES-11 ficaram `Superseded` pela ARQ-09. Pendente: 15 mutações da segunda rodada no `agente-estoque.service.ts` (listadas no `validation.md` da feature).
- **Deploy (2026-11-23)**: API + Postgres no Render pelo `render.yaml` (`https://gesso-api.onrender.com`, deploy automático com o CI verde). Front na Vercel pela CLI (`https://t-square-five.vercel.app`, conta pessoal do André, sem deploy automático até o app da Vercel ser aprovado na organização). O Postgres free foi criado em 2026-11-23 e expira por volta de 2026-12-23 (+14 dias de carência, depois é apagado com os dados).
- **Estoque fechado (2026-11-09)**: `estoque-materiais-movimentacao` com EST-01..09 `Verified` pela AD-012 (ver `validation.md`). Só testes mudaram: `estoque.service.spec.ts` (mock de transação com `tx` próprio) e duas specs de DTO novas; código de produção intacto. Não commitado.
- **Phase / Task**: Execute e verificação concluídos (2026-11-19). AD-014 confirmada pelo usuário (2026-11-19).
- **Decisões do usuário (2026-10-29)**: endpoint por ação; confirmação só no concluir (lista quem recebe crédito) e no cancelar; remover gesseiro permitido em obra aberta, inclusive o último de `ANDAMENTO`; "Iniciar obra" sem equipe desabilitado com "Aloque pelo menos um gesseiro para iniciar"; mensagens novas com acento; 404 ao remover gesseiro não alocado; crédito de gesseiro removido fica para a spec futura "remanejamento de gesseiros".
- **Ajuste no agente de estoque (2026-10-29, fora da feature atual)**: T30–T32 / EAP-70..73: materiais usados numa obra sem previsão aparecem na tabela da obra ("não previsto") e o agente sabe de onde veio esse consumo. API 244 testes, web 140. Rastreabilidade em `Implementing` até um novo Verifier.
- **Feature ativa**: `arquivar-e-limpar-registros` **implementada e verificada (2026-11-20)**, inline, branch `feat/arquivar-e-limpar-registros`. T1–T17 concluídas; `validation.md` **PASS**, ARQ-01..15 `Verified`. Suítes: API 490, web 436, e2e 22, `audit:responsive` 158/158, `audit:pwa` 14/14. Sensor: 46 mutantes (código + 1 de CSS), todos mortos. Auditores (AD-012): 17 lacunas viraram teste; 1 aceita (sem `await` no desvínculo, equivalente pela FK `SET NULL`). Migration `20261120144746_arquivamento` (só `ADD COLUMN`). Job de limpeza diário às 3h (`LimpezaModule`). **Pendente do usuário**: teste manual pela UI (T17) e o commit.
- **Next step**: o usuário commita o pacote de `arquivar-e-limpar-registros` e faz o teste manual (arquivar, ver arquivados, restaurar nas 3 telas). Depois, PR da branch para a `main`.
- **Regras do usuário**: sub-agentes em sequência; sem commit/push/`git add` pelo agente (o usuário commita; entregar pacote com `git add` por arquivo e mensagem em here-string do PowerShell); nenhuma dependência nova sem perguntar; `ANTHROPIC_API_KEY` só no `.env`; nunca mais de uma análise real do agente sem perguntar.
- **Teste e2e no banco de dev (`obras-transicoes-status`)**: cria registros com prefixo `[e2e]` e os apaga num `afterAll`. **Não rodar perto de uma demonstração do agente de estoque**: se a limpeza falhar ou o teste rodar durante uma análise, as obras/gesseiros `[e2e]` entram no snapshot do agente. Depois de rodar, conferir que não sobrou nada com `[e2e]`.
- **Pendência fora de `pwa-instalavel-responsivo` (registrada em 2026-11-09)**: login com credencial errada mostra "Sessao expirada. Faca login novamente." porque o `apps/web/src/lib/api.ts` trata todo 401 igual (já era assim antes da feature). Corrigir numa feature própria: o `POST /auth/login` com 401 deve mostrar a mensagem da API (credencial inválida) e não encerrar sessão.
- **Resolvido (T32, decisão do usuário: opção A)**: depois de um 401 automático o app ia para `/login` só na próxima recarga (a `RotaPrivada` lia o token só ao montar; igual na `main`). Agora a sessão é observável (`useSessaoAtiva` em `lib/sessao.ts`): a tela troca para `/login` sem recarregar, depois de o cache ser apagado, e o login mostra "Sessao expirada. Faca login novamente.".
- **Blockers**: none.
- **Uncommitted files**: conferir `git status`. Fora da feature, nunca commitar junto: `CLAUDE.md`, `migration_lock.toml` (só metadado).
- **Dados de teste no banco local**: o usuário fez testes manuais do agente depois da análise `53f2bf02-…`; conferir o estado antes de uma demonstração. Seed (obras `3333…`, `4444…`, `5555…`, `7777…`) e a obra "Moldura - Bairro Centro" (`45fb510c-…`, do usuário).
- **Branch**: feat/obras-transicoes-status
