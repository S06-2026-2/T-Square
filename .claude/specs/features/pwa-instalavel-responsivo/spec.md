# PWA Instalável e Responsivo Specification

## Problem Statement

O Gesso Manager é usado na obra, pelo celular, mas hoje só funciona bem no desktop. A auditoria
de 2026-11-09 (Chrome headless, 6 larguras × 11 telas, contra o ambiente de dev) mostrou que em
320–390px **todas as telas logadas transbordam na horizontal** (página com 433–495px de largura).
A tabela do Estoque não rola dentro do card, e em 768px a barra do topo estica até 325px de altura.
Além disso, o app não pode ser instalado e não abre sem internet, coisa comum em obra.

Causas confirmadas na auditoria (corrigindo só estes pontos, a largura de `/estoque` em 360px cai
de 495px para 360px):

- `.app { grid-template-columns: 1fr }` (`index.css:206`): `1fr` tem mínimo `min-content`, então a
  coluna cresce até o tamanho do maior filho (o topo, a tabela) em vez de encolher.
- O topo mobile (logo + nome + 4 ícones + avatar + sair) precisa de ~418px e não cabe em 360px.
- Em telas sem muito conteúdo, as linhas do grid `.app` (`min-height: 100vh`) se esticam e o topo
  fica alto (207–325px em 768px).

Com sinal ruim na obra, um envio pode ser gravado no servidor e a resposta se perder no caminho. O
operador reenvia e o lançamento duplica. Como o saldo é derivado de lançamentos (CLAUDE.md), isso
vira saldo errado.

## Goals

- [ ] Nenhuma tela transborda na horizontal entre 320px e 1366px de largura
- [ ] O app pode ser instalado (Android/Chrome/Edge desktop) e abre a partir do ícone em janela própria
- [ ] Sem internet, o app abre e mostra os últimos dados carregados de cada tela, marcados como possivelmente desatualizados
- [ ] Reenviar um formulário de criação nunca duplica o lançamento

## Out of Scope

| Feature | Reason |
| --- | --- |
| Gravar offline (fila de vales, movimentações, obras) com sincronização depois | Decisão do usuário (2026-11-09): só leitura offline. Gravação offline traz conflito, duplicidade e saldo divergente (o saldo é derivado de lançamentos, ver CLAUDE.md) |
| Notificações push (ex.: alerta de estoque) | Não pedido; exige backend de push e permissão do usuário |
| Background sync / periodic sync | Depende da gravação offline, que está fora |
| Pré-carregar dados de telas que o usuário nunca abriu | Leitura offline cobre só o que já foi carregado online neste aparelho |
| Botão "Instalar" funcional no iOS | O Safari não tem `beforeinstallprompt`; no iOS só cabe a instrução (P3) |
| Publicar em loja (TWA / Play Store) | Não pedido |
| Redesenho visual das telas | Só os ajustes necessários para caber e ser tocável no celular |

---

## Assumptions & Open Questions

| Assumption / decision | Chosen default | Rationale | Confirmed? |
| --- | --- | --- | --- |
| Escopo offline | Leitura: respostas `GET` da API já carregadas ficam em cache e são servidas sem rede; gravações só online | Escolha do usuário (2026-11-09) | y |
| Navegação no celular (≤ 900px) | Barra inferior fixa com as 4 abas (ícone + rótulo curto); topo só com marca (ícone), indicador de conexão, avatar, "Instalar app" e "Sair" | Escolha do usuário (2026-11-09) | y |
| Rótulos curtos da barra inferior | "Geral", "Obras", "Equipe", "Estoque" | "Visao geral" e "Gesseiros" não cabem com ícone em 4 colunas de 80px; o desktop mantém os rótulos atuais | y |
| Atualização de versão | Automática, sem aviso: a versão nova instala em segundo plano e ativa por `skipWaiting` + `clientsClaim`, com o recarregamento automático do `vite-plugin-pwa` (`autoUpdate`) desligado. A página em uso nunca é recarregada sozinha; a versão nova aparece na próxima abertura ou recarga. Recomendação para o Design: carregar o app inteiro, sem rotas lazy (são 5 telas), para cumprir o UPD-04 | Escolha do usuário (2026-11-09); recarregar no meio do uso apagaria um formulário preenchido | y |
| Botão "Instalar app" | Aparece no app quando o navegador oferece a instalação (`beforeinstallprompt`) | Escolha do usuário (2026-11-09) | y |
| Dependência `vite-plugin-pwa` | `vite-plugin-pwa` (Workbox) gera o manifest e o service worker | Aprovada pelo usuário (2026-11-09). Gera o precache com o hash do build do Vite | y |
| Ícones | Gerados a partir do SVG que já é o favicon (`index.html`): 192, 512, 512 maskable e apple-touch-icon 180, em `apps/web/public/` | Mantém a identidade visual atual | y |
| Estratégia de cache dos dados | Rede primeiro; se a rede falhar ou não responder em 5 s, usa a cópia em cache | Online, o usuário sempre vê dado atual (dinheiro e estoque); o cache só entra quando não há rede | y |
| Validade do cache de dados | 7 dias, contados pela data em que a resposta foi recebida; respostas mais antigas são descartadas | Igual à validade do JWT (o token de login expira em 7 dias, `exp - iat = 604800`) | y |
| O que vai para o cache | Só `GET /api/**` com resposta 200. Nunca `/api/auth/**`, nunca respostas de erro, nunca `POST/PATCH/PUT/DELETE` | Não guardar credenciais nem estados de erro | y |
| Token vencido offline | Offline, o app continua mostrando o cache mesmo com o token vencido; ao voltar a rede, o 401 faz logout (comportamento atual de `lib/api.ts`) e apaga o cache (OFF-11) | Offline não há como validar o token; o dado já estava no aparelho | y |
| Aparelho compartilhado | Todo fim de sessão (Sair ou 401) e todo login apagam o cache de dados da API (OFF-11, OFF-12) | O cache guarda dados financeiros (saldo de gesseiro), e a chave do cache é só a URL. Sem isso, o próximo usuário veria o cache do anterior | y |
| Indicador de conexão | Ícone único de sinal (Wi-Fi) em vermelho no topo (mobile e desktop, ao lado do avatar), sem texto visível, igual para sem rede, API lenta e "conectado sem internet"; `aria-label` e `title` "Dados possivelmente desatualizados" | Decisão do usuário (2026-11-09): menos texto na tela e um só sinal para "o que você vê pode estar velho" | y |
| Service worker em dev | Desligado no `npm run dev` (Vite); só no build (`vite build` / `vite preview`) | SW em dev cacheia código antigo e piora o hot-reload, que já é instável no OneDrive (CLAUDE.md) | y |
| HTTPS | Fora do `localhost`, instalação e SW exigem HTTPS; o deploy com HTTPS não faz parte desta spec | `localhost` já é contexto seguro para desenvolvimento e demonstração | y |
| Verificação de responsividade | `puppeteer-core` (devDependency) usando o Chrome instalado; script versionado em `apps/web/scripts/audit-responsive.mjs`, rodando contra `vite preview`, com o comando `npm run audit:responsive`. Mede `scrollWidth`, altura do topo e alvos de toque em 320, 360, 390, 768, 1024 e 1366px em todas as telas | Aprovado pelo usuário (2026-11-09). jsdom não calcula layout; a auditoria de 2026-11-09 já provou o método | y |
| Telas futuras de `obras-transicoes-status` | Os botões de ação de status (`AcoesStatusObra`) e o formulário de cancelamento entram no RSP-01/RSP-08 e no `audit:responsive` quando aquela feature for mergeada; o PR que chegar depois à `main` acrescenta os estados à auditoria | Aquela feature está planejada, mas sem código na `main` (revalidação de 2026-11-09) | y |
| Larguras-alvo | 320px a 1366px; desktop acima de 1366 já funciona hoje | 320px é o menor celular ainda comum; a auditoria cobriu essa faixa | y |
| Endereço da API | Origens separadas, como hoje: o front chama `VITE_API_URL` (dev/preview `http://localhost:3000`, produção Render) e o service worker cacheia `/api/**` dessa origem e da própria. Sem proxy no preview nem rewrite na Vercel | Decisão do usuário no Design (2026-11-09). Produção já é Vercel + Render (`docs/ARQUITETURA.md`); preview e produção seguem o mesmo caminho e o deploy não muda. O CORS do Nest (`main.ts`) aceita o cabeçalho `Idempotency-Key` | y |
| Reenvio com campos editados | Depois de uma falha, se o operador muda um campo e reenvia, a mesma chave com corpo diferente cai no 422; a tela avisa e gera uma chave nova (IDP-07) | Decisão do usuário no Design (2026-11-09): mais seguro para dinheiro do que trocar a chave sozinho e arriscar dois lançamentos | y |
| Idempotência | O reenvio devolve a resposta original. Vale para todos os POST de criação, e as chaves duram 24 h. Migração aprovada: tabela nova no PostgreSQL (chave, usuário, rota, hash do corpo, status HTTP, resposta, criado_em) com índice único em (usuário, rota, chave). A chave é gravada na mesma transação da entidade criada: se a API cair no meio, o banco desfaz as duas (decisão do usuário no Design). A limpeza das vencidas é um cron de hora em hora | Aprovado pelo usuário (2026-11-09). O OFF-08 incentiva o reenvio manual, então o servidor precisa reconhecer o repetido | y |
| Perfis de usuário | Hoje só existe o admin; um perfil de operador é incerto no futuro. A limpeza do cache em todo logout e login (OFF-11/12) impede que dados passem de um usuário/perfil para outro. Se o perfil de operador for criado, revisar o cache | Não cacheamos por usuário porque a limpeza já isola as sessões | y |
| Fontes | Os arquivos do Google Fonts (CSS e `woff2`) ficam no cache do service worker | Aparência e largura do texto iguais online e offline; o layout auditado não muda sem rede | y |

**Open questions:** none. Tudo foi resolvido com o usuário (todas as linhas `y`). As dependências
(`vite-plugin-pwa`, `puppeteer-core`) e a migração da tabela de idempotência estão aprovadas, então o
Design não está mais bloqueado.

---

## User Stories

### P1: Usar o app no celular sem transbordar ⭐ MVP

**User Story**: Como operador na obra, eu quero usar todas as telas no celular sem rolar para o lado
nem errar o toque, para registrar vales, movimentações e acompanhar obras pelo telefone.

**Why P1**: Pré-requisito do PWA. Um app instalado que transborda é pior que o site.

**Acceptance Criteria**:

1. The system SHALL renderizar cada tela (`/login`, `/dashboard`, `/obras`, `/gesseiros`, `/estoque`, com os formulários "Nova obra", "Novo gesseiro", "Novo material", "Registrar entrada/saida", o extrato de um gesseiro, os `details` de obra abertos, o painel "Silenciados pelo operador" aberto e a justificativa de um alerta aberta no `/dashboard`, e o `/estoque` aberto pelo "Resolver" de um alerta, com o aviso e a movimentação preenchida) com `document.documentElement.scrollWidth` igual a `window.innerWidth` nas larguras 320, 360, 390, 768, 1024 e 1366px. <!-- RSP-01 -->
2. WHILE a largura da tabela de materiais for maior que a área disponível the system SHALL rolar a tabela na horizontal dentro de `.tabela-wrap`, sem aumentar a largura da página. <!-- RSP-02 -->
3. WHILE a largura da janela for ≤ 900px the system SHALL exibir a navegação como barra inferior fixa com as 4 abas (ícone + rótulo curto) e destacar a aba da rota atual. <!-- RSP-03 -->
4. WHILE a largura da janela for ≤ 900px the system SHALL exibir no topo só o ícone da marca, o indicador de conexão (quando visível, ver OFF-06), o avatar, o botão "Instalar app" (quando disponível, ver PWA-05) e o botão "Sair", com o topo em no máximo 64px de altura, sem contar a área de `safe-area-inset-top`. <!-- RSP-04 -->
5. WHILE a largura da janela for > 900px the system SHALL manter a sidebar lateral atual, com os rótulos atuais ("Visao geral", "Obras", "Gesseiros", "Estoque"). <!-- RSP-05 -->
6. WHILE a barra inferior estiver visível the system SHALL reservar no fim do conteúdo um espaço de pelo menos a altura da barra inferior, incluindo `safe-area-inset-bottom`, para que o último elemento de cada tela fique visível acima da barra ao rolar até o fim. <!-- RSP-06 -->
7. WHILE a largura da janela for ≤ 900px OR o dispositivo for de toque (`pointer: coarse`) the system SHALL exibir `input`, `select` e `textarea` com `font-size` de pelo menos 16px. <!-- RSP-07 -->
8. WHILE a largura da janela for ≤ 900px the system SHALL dar pelo menos 44×44px de área de toque às abas da barra inferior, ao "Sair", ao "Instalar app", aos chips de filtro de Obras, ao botão "+" dos alertas, ao botão "Ver silenciados" dos alertas, aos `summary` dos cards de obra e ao botão "remover" das linhas de material. <!-- RSP-08 -->
9. The system SHALL tornar a linha inteira de um gesseiro na lista (`.lista-pessoas li`) clicável para abrir o extrato, não só o nome. <!-- RSP-09 -->
10. WHEN o operador seleciona um gesseiro WHILE a largura da janela for ≤ 760px (lista e extrato empilhados) THEN the system SHALL rolar a página até o início do card do extrato. <!-- RSP-10 -->
11. The system SHALL dimensionar a altura mínima das telas cheias (`.app`, `.login`) por `100dvh`, com `100vh` como fallback para navegadores sem `dvh`. Verificação manual em aparelho real (o Chrome headless não tem barra de endereço que mude a altura). <!-- RSP-11 -->
12. WHILE o app estiver aberto em modo instalado (standalone) num aparelho com recorte de tela (notch) the system SHALL afastar o topo e a barra inferior das áreas `env(safe-area-inset-top)` e `env(safe-area-inset-bottom)`. Verificação manual em aparelho real com notch (no headless as safe areas valem 0). <!-- RSP-12 -->

**Independent Test**: rodar `npm run audit:responsive` (320/360/390/768/1024/1366px, todas as telas
do critério 1). Todas devem ter `scrollWidth == innerWidth`, topo ≤ 64px no mobile e nenhum dos alvos
do critério 8 menor que 44×44px.

---

### P1: Instalar o app ⭐ MVP

**User Story**: Como operador, eu quero instalar o Gesso Manager no celular e no computador, para
abrir pelo ícone, em tela cheia, sem procurar a aba do navegador.

**Why P1**: É o que define o PWA.

**Acceptance Criteria**:

1. The system SHALL servir um Web App Manifest com `id` "/", `name` "Gesso Manager", `short_name` "Gesso", `lang` "pt-BR", `start_url` "/", `scope` "/", `display` "standalone", `theme_color` "#0f2a24", `background_color` "#f3f5f4" e ícones PNG 192×192, 512×512 e 512×512 com `purpose` "maskable". <!-- PWA-01 -->
2. The system SHALL declarar no `index.html` um `apple-touch-icon` 180×180 e `apple-mobile-web-app-title` "Gesso". <!-- PWA-02 -->
3. WHERE o app roda a partir do build de produção (`vite build`) the system SHALL registrar um service worker com escopo "/". <!-- PWA-03 -->
4. WHILE o app roda pelo servidor de desenvolvimento (`npm run dev`) the system SHALL NOT registrar service worker. <!-- PWA-04 -->
5. WHEN o navegador dispara `beforeinstallprompt` THEN the system SHALL exibir o botão "Instalar app" no topo (mobile) ou na área do usuário da sidebar (desktop). <!-- PWA-05 -->
6. WHEN o operador clica em "Instalar app" THEN the system SHALL abrir o diálogo de instalação do navegador (`prompt()` do evento guardado). <!-- PWA-06 -->
7. WHEN o navegador dispara `appinstalled`, ou o operador recusa o diálogo de instalação, THEN the system SHALL esconder o botão "Instalar app" até o navegador disparar `beforeinstallprompt` de novo. <!-- PWA-07 -->
8. WHILE o app estiver aberto em modo standalone (`display-mode: standalone`) the system SHALL NOT exibir o botão "Instalar app". <!-- PWA-08 -->
9. IF o navegador nunca disparar `beforeinstallprompt` (ex.: Firefox, Safari no macOS) THEN the system SHALL NOT exibir o botão "Instalar app", exceto no Safari do iOS, que segue o PWA-10. <!-- PWA-09 -->

**Independent Test**: com `vite build && vite preview` em `localhost`, o Chrome mostra o app como
instalável no DevTools > Application (manifest sem erros, SW ativo). O botão "Instalar app" aparece,
abre o diálogo e some depois de instalar. O app instalado abre em janela própria.

---

### P1: Consultar dados sem internet ⭐ MVP

**User Story**: Como operador numa obra sem sinal, eu quero abrir o app e ver as obras, o extrato
dos gesseiros e o estoque que já carreguei antes, para consultar sem depender da rede.

**Why P1**: Escolha do usuário (leitura offline). É o motivo prático de virar PWA.

**Acceptance Criteria**:

1. WHEN o app é aberto ou recarregado sem conexão, em qualquer rota do app (ex.: recarregar offline em `/estoque`), depois de pelo menos uma visita online com o service worker ativo THEN the system SHALL carregar a interface (HTML, JS, CSS, fontes e ícones) a partir do cache, sem que o fallback de navegação responda chamadas `/api/**`. <!-- OFF-01 -->
2. WHEN uma requisição `GET /api/**` (exceto `/api/auth/**`) retorna 200 THEN the system SHALL guardar a resposta no cache de dados, com a URL completa (incluindo query string) como chave. <!-- OFF-02 -->
3. WHILE houver rede the system SHALL buscar os dados na API primeiro e SHALL usar o cache só se a API não responder em 5 segundos ou a requisição falhar por rede. <!-- OFF-03 -->
4. IF uma requisição `GET /api/**` falhar por rede, ou passar de 5 segundos, e existir resposta em cache para a mesma URL THEN the system SHALL entregar a resposta do cache para a tela, marcada como vinda do cache (cabeçalho `X-From-Cache: 1` adicionado pelo service worker). <!-- OFF-04 -->
5. IF uma requisição `GET /api/**` falhar por rede e não existir resposta em cache para a URL THEN the system SHALL exibir na tela a mensagem de erro "Sem conexão e sem dados salvos desta tela neste aparelho." no padrão `.erro`. <!-- OFF-05 -->
6. WHILE o navegador estiver sem conexão OR a tela atual exibir dados vindos do cache the system SHALL exibir no topo um ícone de sinal (Wi-Fi) em vermelho, sem texto visível, com `aria-label` e `title` "Dados possivelmente desatualizados". <!-- OFF-06 -->
7. WHEN a tela volta a receber dados da API THEN the system SHALL esconder o ícone de sinal. <!-- OFF-07 -->
8. IF o operador envia um formulário de criação ou edição (exceto o login, ver OFF-13) e a requisição falha por rede THEN the system SHALL exibir no formulário a mensagem "Sem conexão: não foi possível confirmar o envio. Tente de novo; o mesmo lançamento não será duplicado.", SHALL manter os campos preenchidos e SHALL NOT reenviar a operação sozinho. <!-- OFF-08 -->
9. The system SHALL NOT guardar em cache requisições `POST`, `PATCH`, `PUT`, `DELETE`, nem respostas com status diferente de 200, nem qualquer rota `/api/auth/**`. <!-- OFF-09 -->
10. The system SHALL descartar do cache de dados as respostas recebidas há mais de 7 dias, com a idade contada a partir da data em que a resposta foi recebida. <!-- OFF-10 -->
11. WHEN a sessão termina, seja pelo clique em "Sair" ou por logout automático após 401, THEN the system SHALL apagar o cache de dados da API antes de voltar para `/login`. <!-- OFF-11 -->
12. WHEN um login é concluído com sucesso THEN the system SHALL apagar o cache de dados da API antes de carregar a primeira tela. <!-- OFF-12 -->
13. IF o envio do login falhar por rede THEN the system SHALL exibir na tela de login "Sem conexão. Conecte-se à internet para entrar." no padrão `.erro`, mantendo o usuário digitado e esvaziando o campo de senha (a senha não fica guardada na tela nem no aparelho). <!-- OFF-13 -->
14. The system SHALL manter no máximo 200 respostas no cache de dados, descartando as mais antigas. <!-- OFF-14 -->
15. WHEN a conexão volta (evento `online`) THEN the system SHALL buscar de novo os dados da tela atual na API, sem recarregar a página e sem apagar formulários preenchidos. <!-- OFF-15 -->

**Independent Test**: no build de produção, logar, abrir `/obras`, `/estoque` e o extrato de um
gesseiro. No DevTools, marcar "Offline" e recarregar em `/estoque`: a interface abre, o ícone vermelho
aparece e as três telas mostram os dados carregados antes. Abrir o extrato de outro gesseiro (nunca
aberto) mostra a mensagem do OFF-05. Tentar registrar um vale mostra a mensagem do OFF-08 e o
formulário continua preenchido. Voltar online: a tela busca os dados de novo e o ícone some. "Sair":
o cache `api` fica vazio (DevTools > Cache Storage).

---

### P1: Reenviar sem duplicar ⭐ MVP

**User Story**: Como operador com sinal instável, eu quero reenviar um formulário sem medo, para não
lançar o mesmo vale ou movimentação duas vezes.

**Why P1**: Envolve dinheiro e estoque, e o OFF-08 incentiva o reenvio manual.

**Acceptance Criteria**:

1. WHEN o front envia um POST de criação (vale, movimentação de estoque, obra, gesseiro, material) THEN the system SHALL incluir o cabeçalho `Idempotency-Key` com um UUID v4 (`crypto.randomUUID()`, ou `crypto.getRandomValues()` onde ele não existe, como em `http://` fora de localhost) gerado ao abrir o formulário e mantido até o envio ter sucesso ou receber 422 (IDP-07); depois disso, o formulário gera uma chave nova. O formulário também gera uma chave nova quando passa a apontar para outro recurso sem ser fechado (outro gesseiro no extrato, outro material pré-preenchido pelo "Resolver"), para um envio a um recurso nunca reusar a chave de outro. <!-- IDP-01 -->
2. WHEN o backend recebe um POST com uma `Idempotency-Key` já processada pelo mesmo usuário na mesma rota THEN the system SHALL devolver o mesmo status e corpo da primeira resposta, sem gravar de novo. <!-- IDP-02 -->
3. IF chegar a mesma chave com corpo diferente do original THEN the system SHALL responder 422 e não gravar. <!-- IDP-03 -->
4. IF chegar a mesma chave enquanto o primeiro pedido ainda está em processamento THEN the system SHALL responder 409 com `codigo: "EM_PROCESSAMENTO"` no corpo (além da mensagem) e não gravar. <!-- IDP-04 -->
5. The system SHALL guardar as chaves por 24 horas: uma chave com exatamente 24 horas ainda vale (replay); só depois disso ela vence. <!-- IDP-05 -->
6. IF um POST de criação chegar sem `Idempotency-Key` THEN the system SHALL processar normalmente (compatibilidade durante a transição). <!-- IDP-06 -->
7. IF o front receber 422 de chave reutilizada com outros dados THEN the system SHALL exibir no formulário "O envio anterior pode ter sido gravado com outros dados. Confira a lista antes de enviar de novo.", SHALL manter os campos preenchidos e SHALL gerar uma chave nova para o próximo envio. <!-- IDP-07 -->
8. IF o front receber 409 com `codigo` igual a `EM_PROCESSAMENTO` THEN the system SHALL exibir no formulário "Este envio ainda está sendo processado. Aguarde alguns segundos e tente de novo." e SHALL manter a mesma chave. Qualquer outro 409 (ex.: material com nome duplicado) mostra a mensagem da API e também mantém a chave; a decisão é pelo `codigo`, nunca pelo texto. <!-- IDP-08 -->
9. The system SHALL aceitar o cabeçalho `Idempotency-Key` em requisições de outra origem (CORS), respondendo ao preflight (`OPTIONS`) das rotas de criação com `Idempotency-Key` em `Access-Control-Allow-Headers`, sem bloquear o envio. <!-- IDP-09 -->

**Independent Test**: enviar duas vezes o mesmo POST de vale com a mesma chave: um único lançamento,
mesma resposta nas duas. Mesma chave com corpo diferente: 422. Dois envios simultâneos com a mesma
chave: um 409 e um lançamento.

---

### P2: Receber versões novas sem fazer nada

**User Story**: Como operador, eu quero que o app instalado se atualize sozinho, para não ficar
preso numa versão velha nem perder o que estou digitando.

**Why P2**: Sem isso o app funciona, mas um bug corrigido não chega a quem instalou.

**Acceptance Criteria**:

1. WHEN um build novo é publicado e o app é aberto com rede THEN the system SHALL baixar e instalar a versão nova do service worker em segundo plano. <!-- UPD-01 -->
2. WHEN a versão nova termina de instalar THEN the system SHALL ativá-la sem pedir confirmação ao operador. <!-- UPD-02 -->
3. WHILE o operador está numa página carregada pela versão antiga the system SHALL NOT recarregar essa página sozinho; a versão nova passa a ser exibida na próxima abertura ou recarga. <!-- UPD-03 -->
4. WHILE uma página da versão antiga estiver aberta depois da ativação da versão nova the system SHALL continuar abrindo todas as telas sem erro. <!-- UPD-04 -->

**Independent Test**: com o app aberto, gerar um build novo com uma mudança visível e servi-lo.
Recarregar uma vez instala a versão nova; a página aberta não recarrega sozinha, um formulário
preenchido continua preenchido e navegar pelas 5 telas não dá erro. Fechar e reabrir mostra a mudança.

---

### P3: Instrução de instalação no iPhone

**User Story**: Como operador com iPhone, eu quero saber como instalar o app, já que o Safari não
mostra o botão "Instalar".

**Why P3**: No Brasil a maioria usa Android; o iPhone instala pelo menu "Compartilhar".

**Acceptance Criteria**:

1. WHILE o app estiver aberto no Safari do iOS fora do modo standalone the system SHALL exibir no topo o botão "Instalar app", que abre a instrução "Toque em Compartilhar e depois em Adicionar à Tela de Início". <!-- PWA-10 -->

**Independent Test**: abrir no Safari do iPhone (ou com o user agent do iOS emulado). O botão abre a
instrução. No app já adicionado à tela de início, o botão não aparece.

---

## Edge Cases

- IF o navegador não suportar service worker THEN the system SHALL funcionar como hoje (online), sem erro na tela nem no console além do aviso do próprio navegador.
- IF o armazenamento do aparelho estiver cheio e o cache falhar ao gravar THEN the system SHALL entregar a resposta da API normalmente para a tela.
- WHEN o operador faz login com outro usuário no mesmo aparelho, com ou sem "Sair" antes, THEN the system SHALL começar com o cache de dados vazio (consequência de OFF-12).
- IF a sessão expirou (401) com rede THEN the system SHALL encerrar a sessão (OFF-11: cache apagado e volta a `/login`, sem recarregar), SHALL exibir na tela de login "Sessao expirada. Faca login novamente." no padrão `.erro` e SHALL NOT servir o cache no lugar do 401.
- WHEN a largura da janela passa de > 900px para ≤ 900px (girar o tablet, redimensionar) THEN the system SHALL trocar sidebar por barra inferior sem recarregar e sem perder o estado da tela.
- IF o nome de um material, obra ou gesseiro for longo (até 120 caracteres) THEN the system SHALL quebrar a linha dentro do card ou da célula, sem aumentar a largura da página em 320px.

---

## Implicit-Requirement Dimensions Sweep

| Dimension | Resolution |
| --- | --- |
| Input validation & bounds | IDP-03 (mesma chave com corpo diferente: 422). Os formulários existentes já validam (`front-formularios`). Limite de layout: nomes até 120 caracteres (Edge Cases) |
| Failure / partial-failure states | OFF-04, OFF-05, OFF-08, OFF-13, OFF-15; cache cheio (Edge Cases) |
| Idempotency / retry / duplicate handling | IDP-01 a IDP-06: o reenvio manual com a mesma chave não duplica; nada é reenviado sozinho (OFF-08) |
| Auth boundaries & rate limits | OFF-09 (sem cache de `/auth`), OFF-11 (fim de sessão limpa o cache), OFF-12 (login limpa o cache), 401 com rede não usa cache (Edge Cases), token vencido offline (Assumptions); IDP-02 escopa a chave por usuário |
| Concurrency / ordering | IDP-04 (mesma chave em processamento: 409), UPD-03 e UPD-04 (versão nova não interrompe nem quebra a página em uso) |
| Data lifecycle / expiry | OFF-10 (7 dias), OFF-11 e OFF-12 (sessão), OFF-14 (máximo 200 respostas), IDP-05 (chaves por 24 h) |
| Observability | N/A because é front sem telemetria hoje; o estado do SW e do cache é inspecionável no DevTools (Independent Tests) |
| External-dependency failure | API fora do ar ou lenta = mesmo caminho de "sem rede" (OFF-03/04/05/06); arquivos do Google Fonts guardados em cache (Assumptions), então a fonte não muda offline |
| State-transition integrity | N/A because a feature não muda nenhuma transição de domínio; transição online↔offline coberta por OFF-06, OFF-07 e OFF-15 |

---

## Requirement Traceability

| Requirement ID | Story | Phase | Status |
| --- | --- | --- | --- |
| RSP-01 | P1: Celular sem transbordar | T1, T2, T3, T4 | Implementing |
| RSP-02 | P1: Celular sem transbordar | T1, T2 | Implementing |
| RSP-03 | P1: Celular sem transbordar | T1, T3 | Implementing |
| RSP-04 | P1: Celular sem transbordar | T1, T3 | Implementing |
| RSP-05 | P1: Celular sem transbordar | T3 | Implementing |
| RSP-06 | P1: Celular sem transbordar | T1, T3, T38 | Implementing |
| RSP-07 | P1: Celular sem transbordar | T1, T4, T34 | Implementing |
| RSP-08 | P1: Celular sem transbordar | T1, T4, T25 | Implementing |
| RSP-09 | P1: Celular sem transbordar | T5 | Implementing |
| RSP-10 | P1: Celular sem transbordar | T1, T5 | Implementing |
| RSP-11 | P1: Celular sem transbordar | T2, T38 | Implementing |
| RSP-12 | P1: Celular sem transbordar | T3, T38 | Implementing |
| PWA-01 | P1: Instalar o app | T26, T28, T31 | Implementing |
| PWA-02 | P1: Instalar o app | T26, T36 | Implementing |
| PWA-03 | P1: Instalar o app | T28, T29, T31 | Implementing |
| PWA-04 | P1: Instalar o app | T28, T29 | Implementing |
| PWA-05 | P1: Instalar o app | T24, T25 | Implementing |
| PWA-06 | P1: Instalar o app | T24, T25 | Implementing |
| PWA-07 | P1: Instalar o app | T24 | Implementing |
| PWA-08 | P1: Instalar o app | T24, T25 | Implementing |
| PWA-09 | P1: Instalar o app | T24, T25 | Implementing |
| OFF-01 | P1: Consultar sem internet | T28, T31 | Implementing |
| OFF-02 | P1: Consultar sem internet | T27 | Implementing |
| OFF-03 | P1: Consultar sem internet | T28, T31, T33 | Implementing |
| OFF-04 | P1: Consultar sem internet | T18, T27, T31 | Implementing |
| OFF-05 | P1: Consultar sem internet | T18, T31 | Implementing |
| OFF-06 | P1: Consultar sem internet | T17, T22, T31 | Implementing |
| OFF-07 | P1: Consultar sem internet | T17, T22, T31 | Implementing |
| OFF-08 | P1: Consultar sem internet | T18, T19, T37 | Implementing |
| OFF-09 | P1: Consultar sem internet | T27, T33 | Implementing |
| OFF-10 | P1: Consultar sem internet | T27, T33 | Implementing |
| OFF-11 | P1: Consultar sem internet | T16, T18, T31, T32 | Implementing |
| OFF-12 | P1: Consultar sem internet | T16, T21 | Implementing |
| OFF-13 | P1: Consultar sem internet | T21, T38 | Implementing |
| OFF-14 | P1: Consultar sem internet | T28, T33 | Implementing |
| OFF-15 | P1: Consultar sem internet | T17, T23, T31 | Implementing |
| IDP-01 | P1: Reenviar sem duplicar | T15, T18, T19, T20, T38 | Implementing |
| IDP-02 | P1: Reenviar sem duplicar | T6, T8, T9, T10, T11, T12, T14 | Implementing |
| IDP-03 | P1: Reenviar sem duplicar | T7, T9, T14 | Implementing |
| IDP-04 | P1: Reenviar sem duplicar | T9, T14 | Implementing |
| IDP-05 | P1: Reenviar sem duplicar | T6, T9, T38 | Implementing |
| IDP-06 | P1: Reenviar sem duplicar | T8, T9, T14 | Implementing |
| IDP-07 | P1: Reenviar sem duplicar | T19 | Implementing |
| IDP-08 | P1: Reenviar sem duplicar | T19 | Implementing |
| IDP-09 | P1: Reenviar sem duplicar | T13 | Implementing |
| UPD-01 | P2: Versões novas | T29 | Implementing |
| UPD-02 | P2: Versões novas | T28 | Implementing |
| UPD-03 | P2: Versões novas | T29 | Implementing |
| UPD-04 | P2: Versões novas | T30 | Implementing |
| PWA-10 | P3: Instrução no iPhone | T24, T25 | Implementing |

**ID format:** `RSP-NN` (responsividade), `PWA-NN` (instalação), `OFF-NN` (offline), `IDP-NN` (idempotência), `UPD-NN` (atualização)

**Status values:** Pending → In Design → In Tasks → Implementing → Verified

**Coverage:** 50 total, 0 mapped to tasks, 50 unmapped ⚠️ (esperado: a spec ainda não passou por Design/Tasks)

---

## Success Criteria

- [ ] `npm run audit:responsive` em 320–1366px: 0 telas com transbordo horizontal (hoje: 30 de 66 combinações tela × largura, todas as logadas em 320, 360 e 390px)
- [ ] Chrome DevTools > Application: manifest sem erros e app instalável no build de produção
- [ ] Com o aparelho offline, `/obras`, `/estoque` e um extrato já visitados abrem com dados e com o ícone de sinal vermelho no topo
- [ ] Depois de "Sair", o Cache Storage de dados da API está vazio
- [ ] Reenviar um vale com a mesma `Idempotency-Key` não cria um segundo lançamento
