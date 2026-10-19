# Front — Formulários de Cadastro e Movimentação Specification

## Problem Statement

As três telas do front (Obras, Gesseiros, Estoque) hoje só **leem** dados da API — não existe
nenhum formulário. Mesmo os endpoints já prontos (`POST /obras`, `POST /obras/:id/gesseiros`,
`POST /gesseiros`, `POST /gesseiros/:id/lancamentos`) não têm como ser chamados pela UI. Sem
formulários, o time só consegue popular dados via seed/Swagger, o que não é utilizável no dia a dia
da firma.

## Goals

- [ ] Operador cria uma obra completa (dados do cliente, forma de pagamento, planta baixa, equipe inicial) sem usar o Swagger
- [ ] Operador aloca um gesseiro numa obra já existente
- [ ] Operador cadastra gesseiro e registra vale/pagamento pela UI
- [ ] Operador cadastra material e registra entrada/saída de estoque pela UI

## Dependências

| Spec / módulo | Situação (2026-10-07) | Stories afetadas |
| --- | --- | --- |
| `obras` (`POST /obras`, `POST /obras/:id/gesseiros`) | Pronto no backend | P1 (FRM-01..05) — liberadas |
| `gesseiros-crud-financeiro` | Implementada e verificada (GES-01..11) | P2 Gesseiros (FRM-06, FRM-07) — liberadas |
| `estoque-materiais-movimentacao` | Implementada no backend (commit `af03bd2`: `criarMaterial`, `movimentar`, alerta de mínimo) | P2 Estoque (FRM-08, FRM-09) — liberadas (2026-10-19) |
| `front-dashboard-resumo` | Independente | Nenhuma — só compartilha `App.tsx`/`Layout.tsx`, que esta spec não altera |

## Out of Scope

| Feature | Reason |
| --- | --- |
| Upload de arquivo de planta baixa | AD-001: continua sendo um campo de URL |
| Editar obra já criada (além do fluxo de concluir já existente) | Não pedido; `PATCH /obras/:id` existe no backend mas não faz parte deste formulário |
| Campo de data de início na criação de obra | `CreateObraDto` atual não aceita `dataInicio` — fora do escopo desta spec alterar o DTO |
| Máscara de moeda formatada (R$) nos inputs de valor | Inputs numéricos simples (`type="number"`); formatação BRL já existe só para exibição, via `moeda()` |
| Desalocar gesseiro de uma obra (`DELETE /obras/:id/gesseiros/:gesseiroId`) | Não pedido nesta spec; fica para uma spec futura. Consequência conhecida: o caminho de "remover da obra antes de desativar" (GES-11) continua só via Swagger |
| Editar / desativar gesseiro pela UI (`PATCH`/`DELETE /gesseiros/:id`) | Backend pronto (GES-07/08), mas a UI fica para uma spec futura |
| Vincular obra a um vale/pagamento (`obraId` em `CreateLancamentoDto`) | Vale é adiantamento geral na maioria dos casos; `descricao` livre cobre a necessidade agora |
| Redirecionar automaticamente para `/login` ao receber 401 | Mudança no cliente HTTP compartilhado (`lib/api.ts`); comportamento atual (logout + mensagem) é suficiente — ver Edge Cases |

---

## Assumptions & Open Questions

| Assumption / decision | Chosen default | Rationale | Confirmed? |
| --- | --- | --- | --- |
| Gerência de estado dos formulários | `useState` local por formulário, sem Context/Redux nem biblioteca de formulário | Consistente com `Obras.tsx`/`Gesseiros.tsx`/`Estoque.tsx`; `apps/web` não tem dependências além de React/Router | y |
| Pós-submit bem-sucedido | Recarrega a lista (re-fetch) em vez de atualização otimista local | Mesmo padrão já usado em `concluir()` (`Obras.tsx`) | y |
| Fonte de verdade da validação | Client-side é best-effort (`required`, `min`, `minLength` do HTML5); erros 400/404/409 da API são exibidos no padrão `erro` já usado nas páginas | Evita duplicar toda a lógica de validação do `class-validator` no front | y |
| Formato numérico do corpo | Todo campo numérico vai como `number` JSON (via `Number()`), e campo numérico **opcional vazio é omitido** do corpo | `ValidationPipe` usa `transform` sem `enableImplicitConversion`: string em campo `@IsNumber()` vira 400; `""` em opcional também | y |
| Campos extras no corpo | O corpo enviado contém só campos do DTO (nenhum id/chave interna de UI) | `ValidationPipe` usa `forbidNonWhitelisted: true` — campo desconhecido vira 400 | y |
| Status da obra no formulário de criação | Não aparece como campo — toda obra nasce `ORCAMENTO` (default do DTO) | Mudança de status já é feita pelos fluxos existentes | y |
| Obra recém-criada com filtro ativo | Após criar, o filtro volta para "Todas" antes do re-fetch | Com filtro "Fechadas" ativo, a obra nova (`ORCAMENTO`) sumiria e o operador acharia que falhou | y |
| Alocação de gesseiros na criação da obra | Opcional — 0+ linhas reaproveitando `gesseiros` do `CreateObraDto`; também dá pra alocar depois via formulário separado | `POST /obras/:id/gesseiros` já é upsert, então os dois caminhos coexistem | y |
| Gesseiro repetido nas linhas da nova obra | O seletor de cada linha não oferece gesseiro já escolhido em outra linha | A unique `obraId_gesseiroId` faria o Prisma lançar P2002, que chega ao usuário como 500 | y |
| Gesseiros inativos nos seletores | Seletores de gesseiro (nova obra, alocação) listam só `ativo=true`, filtrando no cliente | AD-003: listagens "ativas" filtram `ativo`; `GET /gesseiros` devolve todos e o backend aceita alocar inativo. Ver AD-004 | y |
| Onde fica o formulário de alocação | Inline no card da obra em `Obras.tsx` (não existe tela de detalhe) | Evita criar rota nova só para isso | y |
| Alocação em obra finalizada | Formulário de alocação só aparece em obras `ORCAMENTO`, `FECHADA` ou `ANDAMENTO` | Obra `CONCLUIDA` já gerou os créditos; alocar depois nunca credita o gesseiro. Ver AD-005 | y |
| Opções de `tipo` no formulário de vale/pagamento | Select mostra só `VALE` e `PAGAMENTO` — nunca `CREDITO` | Espelha GES-04 (CREDITO só nasce automático) | y |
| Testes do front | Cada formulário tem teste de componente (Jest + Testing Library), com `lib/api` mockado, cobrindo os ACs e edge cases desta spec | Padrão de `StatusBadge.test.tsx`; testes não dependem do backend estar no ar | y |

**Open questions:** none - all resolved or logged above.

---

## User Stories

### P1: Criar nova obra ⭐ MVP

**User Story**: Como operador, eu quero preencher um formulário com os dados da obra (cliente,
valor, forma de pagamento, planta baixa, equipe inicial), para que ela entre no funil sem precisar
do Swagger.

**Why P1**: É o ponto de entrada de todo o sistema — sem criar obra pela UI, nada mais é demonstrável de ponta a ponta pela interface.

**Acceptance Criteria**:

1. WHEN o operador preenche `titulo`, `clienteNome` e `valorTotal` (obrigatórios do `CreateObraDto`) e confirma THEN the system SHALL chamar `POST /obras`, voltar o filtro para "Todas", recarregar a lista (a obra nova aparece com status `ORCAMENTO`) e limpar o formulário.
2. WHERE o operador informa os campos opcionais `descricao`, `clienteTelefone` ou `endereco` THEN the system SHALL enviá-los no corpo; WHEN algum deles está vazio THEN the system SHALL omiti-lo.
3. WHEN o operador seleciona uma forma de pagamento (`PIX`, `DINHEIRO`, `CARTAO_CREDITO`, `CARTAO_DEBITO`, `BOLETO` ou `TRANSFERENCIA`) THEN the system SHALL enviar `pagamento: { forma, parcelas?, valorEntrada? }`; WHEN nenhuma forma é selecionada THEN the system SHALL omitir `pagamento` do corpo.
4. WHERE o cliente disponibilizou uma planta baixa THEN the system SHALL aceitar uma URL no campo `plantaBaixaUrl` (input `type="url"`) e enviá-la junto com a criação da obra.
5. WHERE o operador já sabe quais gesseiros vão trabalhar na obra THEN the system SHALL permitir adicionar e remover 0 ou mais linhas (gesseiro ativo + `valorCombinado` + `funcao` opcional), enviadas em `gesseiros`, sem oferecer numa linha um gesseiro já escolhido em outra.
6. IF a API retornar erro (ex.: 400 por `titulo` com menos de 3 caracteres) THEN the system SHALL exibir a mensagem da API sem fechar o formulário nem perder os dados preenchidos.

**Independent Test**: preencher o formulário com dados válidos, confirmar, ver a obra nova aparecer na lista de `Obras.tsx` com status `ORCAMENTO`.

---

### P1: Alocar gesseiro numa obra existente ⭐ MVP

**User Story**: Como operador, eu quero alocar um gesseiro numa obra que já existe, para que o
combinado de mão de obra fique registrado antes da obra ser concluída.

**Why P1**: Equipe pode mudar ao longo do tempo, e a alocação é pré-requisito para o crédito automático funcionar na conclusão.

**Acceptance Criteria**:

1. WHEN o operador, no card de uma obra, seleciona um gesseiro ativo, informa `valorCombinado` (e opcionalmente `funcao`) e confirma THEN the system SHALL chamar `POST /obras/:id/gesseiros` e recarregar a lista, mostrando o gesseiro entre os alocados daquela obra.
2. WHEN o gesseiro selecionado já está alocado naquela obra THEN the system SHALL atualizar o `valorCombinado`/`funcao` existentes em vez de duplicar a alocação (reflete o `upsert` do backend).
3. WHILE a obra está `CONCLUIDA` ou `CANCELADA` the system SHALL não exibir o formulário de alocação naquele card.
4. IF a API retornar erro (ex.: 404 de obra ou gesseiro inexistente) THEN the system SHALL exibir a mensagem sem alterar a lista nem perder os dados do formulário.

**Independent Test**: alocar um gesseiro numa obra `ORCAMENTO`; ele aparece na lista de gesseiros daquele card com o valor combinado exibido.

---

### P2: Cadastrar gesseiro

**User Story**: Como operador, eu quero cadastrar um gesseiro pela UI, para que eu não precise usar o Swagger para popular a equipe.

**Why P2**: Não bloqueia o fluxo de obras (que pode usar gesseiros do seed).

**Acceptance Criteria**:

1. WHEN o operador preenche `nome` (mínimo 3 caracteres) e confirma na tela de Gesseiros THEN the system SHALL chamar `POST /gesseiros`, recarregar a lista (o novo gesseiro aparece) e limpar o formulário.
2. WHERE o operador tem telefone/chave Pix do gesseiro THEN the system SHALL aceitá-los como campos opcionais, omitindo-os do corpo quando vazios.
3. IF a API retornar erro THEN the system SHALL exibir a mensagem sem perder os dados preenchidos.

**Independent Test**: cadastrar um gesseiro novo pela UI; ele aparece na lista de `Gesseiros.tsx` e fica selecionável para ver o extrato.

---

### P2: Registrar vale ou pagamento de um gesseiro

**User Story**: Como operador, eu quero registrar um vale ou pagamento para o gesseiro selecionado, para que o saldo a receber dele fique correto sem eu mexer direto no banco.

**Why P2**: É a contraparte de UI da regra financeira central (GES-03/04).

**Acceptance Criteria**:

1. WHEN o operador, com um gesseiro selecionado (extrato aberto), escolhe `VALE` ou `PAGAMENTO`, informa `valor > 0` (e opcionalmente `descricao`) e confirma THEN the system SHALL chamar `POST /gesseiros/:id/lancamentos`, recarregar o extrato exibido e limpar `valor` e `descricao` (o formulário continua aberto para o próximo lançamento).
2. The system SHALL oferecer apenas `VALE` e `PAGAMENTO` como opções no seletor de tipo — nunca `CREDITO`.
3. WHILE nenhum gesseiro está selecionado the system SHALL não exibir o formulário de lançamento.
4. IF a API retornar erro (ex.: 400 por valor inválido) THEN the system SHALL exibir a mensagem sem fechar o formulário nem perder os dados.

**Independent Test**: registrar um `VALE` de R$100 para um gesseiro com saldo a receber de R$100; após o submit, o extrato recarregado mostra saldo a receber R$ 0,00.

---

### P2: Cadastrar material

**User Story**: Como operador, eu quero cadastrar um material novo pela UI, para que ele possa ser movimentado sem passar pelo Swagger.

**Why P2**: Dependia de `estoque-materiais-movimentacao` (EST-01/02), já implementada; não bloqueia o fluxo de obras/gesseiros.

**Acceptance Criteria**:

1. WHEN o operador preenche `nome` (mínimo 2 caracteres), `unidade` e opcionalmente `estoqueMinimo` e confirma na tela de Estoque THEN the system SHALL chamar `POST /estoque/materiais`, recarregar a tabela e limpar o formulário.
2. WHEN `estoqueMinimo` está vazio THEN the system SHALL omiti-lo do corpo (o backend usa 0).
3. IF a API retornar 409 (nome duplicado) ou outro erro THEN the system SHALL exibir a mensagem sem fechar o formulário nem perder os dados.

**Independent Test**: cadastrar um material novo; ele aparece na tabela de `Estoque.tsx` com saldo 0.

---

### P2: Registrar movimentação de estoque

**User Story**: Como operador, eu quero registrar uma entrada ou saída de material, para que o saldo em estoque fique correto e a obra que consumiu o material fique rastreada.

**Why P2**: Dependia de `estoque-materiais-movimentacao` (EST-03..07), já implementada; completa o ciclo do módulo de estoque.

**Acceptance Criteria**:

1. WHEN o operador seleciona um material, escolhe `ENTRADA` ou `SAIDA`, informa `quantidade > 0` (e opcionalmente `observacao`) e confirma THEN the system SHALL chamar `POST /estoque/movimentacoes` e recarregar a tabela de materiais com o novo saldo.
2. WHERE a movimentação é uma `SAIDA` THEN the system SHALL permitir selecionar opcionalmente a obra que consumiu o material (enviada como `obraId`); WHEN o tipo é `ENTRADA` THEN the system SHALL não enviar `obraId`.
3. IF a API retornar 400 (ex.: saldo insuficiente para `SAIDA`) ou outro erro THEN the system SHALL exibir a mensagem sem fechar o formulário nem alterar a tabela.

**Independent Test**: registrar uma `SAIDA` dentro do saldo disponível; a tabela recarregada mostra o saldo decrementado.

---

## Edge Cases

- IF o usuário submeter um formulário com um campo obrigatório vazio THEN the system SHALL bloquear o submit no client antes de chamar a API (`required` do HTML5).
- WHILE uma requisição de submit está em andamento the system SHALL desabilitar o botão de confirmar daquele formulário, evitando duplo-submit.
- WHEN qualquer formulário monta o corpo da requisição THEN the system SHALL enviar campos numéricos como `number`, omitir opcionais vazios e não incluir nenhum campo fora do DTO.
- IF qualquer chamada retornar 401 THEN the system SHALL seguir o comportamento existente de `lib/api.ts`: limpa a sessão e exibe "Sessao expirada. Faca login novamente." no `erro` de quem fez a chamada (o próprio formulário, via `useEnvio`, ou a página, nos carregamentos); a próxima navegação cai no login via `RotaPrivada`. Nenhum formulário trata 401 por conta própria.

---

## Requirement Traceability

| Requirement ID | Story | Phase | Status |
| --- | --- | --- | --- |
| FRM-01 | P1: Criar nova obra (obrigatórios + reset de filtro) | Execute | Verified |
| FRM-02 | P1: Criar nova obra (pagamento) | Execute | Verified |
| FRM-03 | P1: Criar nova obra (planta baixa + opcionais) | Execute | Verified |
| FRM-04 | P1: Criar nova obra (equipe inicial sem duplicata, só ativos) | Execute | Verified |
| FRM-05 | P1: Alocar gesseiro em obra existente (inclui upsert e bloqueio em obra finalizada) | Execute | Verified |
| FRM-06 | P2: Cadastrar gesseiro | Execute | Verified |
| FRM-07 | P2: Registrar vale/pagamento | Execute | Verified |
| FRM-08 | P2: Cadastrar material | Execute | Verified |
| FRM-09 | P2: Registrar movimentação de estoque | Execute | Verified |
| FRM-10 | Edge: erro da API preserva os dados do formulário (todos os forms) | Execute | Verified |
| FRM-11 | Edge: botão desabilitado durante submit (todos os forms) | Execute | Verified |
| FRM-12 | Edge: corpo só com campos do DTO, números como `number`, opcionais vazios omitidos | Execute | Verified |

**ID format:** `FRM-NN`

**Status values:** Pending → In Design → In Tasks → Implementing → Verified

**Coverage:** 12 total, 12 mapped to tasks (T1–T12 em `tasks.md`), 0 unmapped. FRM-08/09 mapeados para a Fase 4.

---

## Success Criteria

- [ ] Um operador consegue criar uma obra, alocar um gesseiro, cadastrar gesseiro e registrar vale inteiramente pela UI, sem tocar no Swagger
- [ ] Cadastrar material e registrar movimentação pela UI
- [ ] Nenhum formulário perde os dados preenchidos quando a API retorna erro
- [ ] Nenhum formulário gera 500 por corpo malformado (duplicata, string em campo numérico, campo extra)
