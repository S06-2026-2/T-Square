# Front — Formulários de Cadastro e Movimentação Specification

## Problem Statement

As três telas do front (Obras, Gesseiros, Estoque) hoje só **leem** dados da API — não existe
nenhum formulário. Mesmo os endpoints já prontos (`POST /obras`, `POST /obras/:id/gesseiros`) não
têm como ser chamados pela UI. Sem formulários, o time só consegue popular dados via seed/Swagger,
o que não é utilizável no dia a dia da firma.

## Goals

- [ ] Operador cria uma obra completa (dados do cliente, forma de pagamento, planta baixa, equipe inicial) sem usar o Swagger
- [ ] Operador aloca um gesseiro numa obra já existente
- [ ] Operador cadastra gesseiro e registra vale/pagamento pela UI
- [ ] Operador cadastra material e registra entrada/saída de estoque pela UI

## Out of Scope

| Feature | Reason |
| --- | --- |
| Upload de arquivo de planta baixa | Decisão de projeto: continua sendo um campo de URL |
| Editar obra já criada (além do fluxo de concluir já existente) | Não pedido; `UpdateObraDto`/`PATCH /obras/:id` já existe no backend mas não faz parte deste formulário |
| Campo de data de início na criação de obra | `CreateObraDto` atual não aceita `dataInicio` — fora do escopo desta spec alterar o DTO |
| Máscara de moeda formatada (R$) nos inputs de valor | Inputs numéricos simples (`type="number"`); formatação BRL já existe só para exibição, via `moeda()` |

---

## Assumptions & Open Questions

| Assumption / decision | Chosen default | Rationale | Confirmed? |
| --- | --- | --- | --- |
| Gerência de estado dos formulários | `useState` local por página/formulário, sem Context/Redux | Consistente com o padrão já usado em `Obras.tsx`/`Gesseiros.tsx`/`Estoque.tsx` | y |
| Pós-submit bem-sucedido | Recarrega a lista (re-fetch) em vez de atualização otimista local | Mesmo padrão já usado em `concluir()` (`Obras.tsx`) | y |
| Fonte de verdade da validação | Client-side é best-effort (evita submit obviamente inválido); erros 400 da API são exibidos no mesmo padrão `erro` já usado nas páginas | Evita duplicar toda a lógica de validação do `class-validator` no front | y |
| Status da obra no formulário de criação | Não aparece como campo — toda obra nasce `ORCAMENTO` (default do DTO) | Mudança de status já é feita pelos fluxos existentes (filtro do funil, botão "Concluir obra") | y |
| Alocação de gesseiros na criação da obra | Opcional — o formulário de nova obra permite adicionar 0+ gesseiros já na criação, reaproveitando `gesseiros` do `CreateObraDto`; também dá pra alocar depois via formulário de alocação separado | `POST /obras/:id/gesseiros` já existe como upsert, então os dois caminhos coexistem sem conflito | y |
| Opções de `tipo` no formulário de vale/pagamento | Select mostra só `VALE` e `PAGAMENTO` — nunca `CREDITO` como opção | Espelha a regra de negócio de `gesseiros-crud-financeiro` (CREDITO só nasce automático); a UI não deve nem oferecer a opção inválida | y |
| Dependência das specs de backend | As stories de Gesseiros/Estoque desta spec (P2) dependem de `gesseiros-crud-financeiro` e `estoque-materiais-movimentacao` estarem implementadas — a spec já pode ser escrita e revisada agora, mas a execução delas espera esse backend existir | Formulário sem endpoint funcional não é demonstrável | y |

**Open questions:** none - all resolved or logged above.

---

## User Stories

### P1: Criar nova obra ⭐ MVP

**User Story**: Como operador, eu quero preencher um formulário com os dados da obra (cliente,
valor, forma de pagamento, planta baixa, equipe inicial), para que ela entre no funil sem precisar
do Swagger.

**Why P1**: É o ponto de entrada de todo o sistema — sem criar obra pela UI, nada mais é demonstrável de ponta a ponta pela interface.

**Acceptance Criteria**:

1. WHEN o operador preenche `titulo`, `clienteNome` e `valorTotal` (campos obrigatórios do `CreateObraDto`) e confirma THEN the system SHALL chamar `POST /obras`, exibir a nova obra na lista e limpar o formulário.
2. WHEN o operador seleciona uma forma de pagamento (`PIX`, `DINHEIRO`, `CARTAO_CREDITO`, `CARTAO_DEBITO`, `BOLETO` ou `TRANSFERENCIA`) e informa parcelas/valor de entrada THEN the system SHALL enviar esses dados aninhados em `pagamento` no corpo da requisição.
3. WHERE o cliente disponibilizou uma planta baixa THEN the system SHALL aceitar uma URL no campo `plantaBaixaUrl` e enviá-la junto com a criação da obra.
4. WHERE o operador já sabe quais gesseiros vão trabalhar na obra THEN the system SHALL permitir adicionar 0 ou mais linhas de gesseiro (seleção do gesseiro + valor combinado + função opcional) enviadas em `gesseiros` no corpo da requisição.
5. IF a API retornar 400 (ex.: `titulo` com menos de 3 caracteres) THEN the system SHALL exibir a mensagem de erro sem fechar o formulário nem perder os dados já preenchidos.

**Independent Test**: preencher o formulário com dados válidos, confirmar, ver a obra nova aparecer na lista de `Obras.tsx` com status `ORCAMENTO`.

---

### P1: Alocar gesseiro numa obra existente ⭐ MVP

**User Story**: Como operador, eu quero alocar um gesseiro numa obra que já existe, para que o
combinado de mão de obra fique registrado antes da obra ser concluída.

**Why P1**: Necessário mesmo depois da criação da obra — equipe pode mudar ao longo do tempo, e é pré-requisito para o crédito automático funcionar na conclusão.

**Acceptance Criteria**:

1. WHEN o operador seleciona um gesseiro existente, informa `valorCombinado` e confirma na tela de detalhe/card de uma obra THEN the system SHALL chamar `POST /obras/:id/gesseiros` e mostrar o gesseiro na lista de alocados daquela obra.
2. WHEN o gesseiro selecionado já está alocado naquela obra THEN the system SHALL atualizar o `valorCombinado`/`funcao` existentes em vez de duplicar a alocação (reflete o `upsert` já implementado no backend).
3. IF a API retornar 404 (gesseiro inexistente) THEN the system SHALL exibir a mensagem de erro sem alterar a lista local.

**Independent Test**: alocar um gesseiro numa obra `ORCAMENTO`; ele aparece na lista `gesseiros` daquele card com o valor combinado exibido.

---

### P2: Cadastrar gesseiro

**User Story**: Como operador, eu quero cadastrar um gesseiro pela UI, para que eu não precise usar o Swagger para popular a equipe.

**Why P2**: Depende de `gesseiros-crud-financeiro` estar implementada; não bloqueia o fluxo de obras.

**Acceptance Criteria**:

1. WHEN o operador preenche `nome` (mínimo 3 caracteres) e confirma na tela de Gesseiros THEN the system SHALL chamar `POST /gesseiros`, adicionar o gesseiro à lista e limpar o formulário.
2. WHERE o operador tem telefone/chave Pix do gesseiro THEN the system SHALL aceitá-los como campos opcionais.

**Independent Test**: cadastrar um gesseiro novo pela UI; ele aparece na lista de `Gesseiros.tsx` e fica selecionável para ver o extrato.

---

### P2: Registrar vale ou pagamento de um gesseiro

**User Story**: Como operador, eu quero registrar um vale ou pagamento para o gesseiro selecionado, para que o saldo a receber dele fique correto sem eu mexer direto no banco.

**Why P2**: Depende de `gesseiros-crud-financeiro` estar implementada; é a contraparte de UI da regra financeira central.

**Acceptance Criteria**:

1. WHEN o operador, com um gesseiro selecionado, escolhe `VALE` ou `PAGAMENTO`, informa um `valor > 0` e confirma THEN the system SHALL chamar `POST /gesseiros/:id/lancamentos` e recarregar o extrato exibido.
2. The system SHALL oferecer apenas `VALE` e `PAGAMENTO` como opções no seletor de tipo — nunca `CREDITO`.
3. IF a API retornar 400 (ex.: valor inválido) THEN the system SHALL exibir a mensagem de erro sem fechar o formulário.

**Independent Test**: registrar um `VALE` de R$100 para um gesseiro com saldo a receber de R$100; após o submit, o extrato recarregado mostra `saldoAReceber: 0`.

---

### P2: Cadastrar material

**User Story**: Como operador, eu quero cadastrar um material novo pela UI, para que ele possa ser movimentado sem passar pelo Swagger.

**Why P2**: Depende de `estoque-materiais-movimentacao` estar implementada; não bloqueia o fluxo de obras/gesseiros.

**Acceptance Criteria**:

1. WHEN o operador preenche `nome`, `unidade` e opcionalmente `estoqueMinimo` e confirma na tela de Estoque THEN the system SHALL chamar `POST /estoque/materiais`, adicionar o material à tabela e limpar o formulário.
2. IF a API retornar 409 (nome duplicado) THEN the system SHALL exibir a mensagem de erro sem fechar o formulário.

**Independent Test**: cadastrar um material novo; ele aparece na tabela de `Estoque.tsx` com `saldoAtual: 0`.

---

### P2: Registrar movimentação de estoque

**User Story**: Como operador, eu quero registrar uma entrada ou saída de material, para que o saldo em estoque fique correto e a obra que consumiu o material fique rastreada.

**Why P2**: Depende de `estoque-materiais-movimentacao` estar implementada; completa o ciclo do módulo de estoque.

**Acceptance Criteria**:

1. WHEN o operador seleciona um material, escolhe `ENTRADA` ou `SAIDA`, informa `quantidade > 0` e confirma THEN the system SHALL chamar `POST /estoque/movimentacoes` e recarregar a tabela de materiais com o novo `saldoAtual`.
2. WHERE a movimentação é uma `SAIDA` ligada a uma obra THEN the system SHALL permitir selecionar opcionalmente a obra que consumiu o material.
3. IF a API retornar 400 (saldo insuficiente para `SAIDA`) THEN the system SHALL exibir a mensagem de erro sem fechar o formulário nem alterar a tabela.

**Independent Test**: registrar uma `SAIDA` dentro do saldo disponível; a tabela recarregada mostra o `saldoAtual` decrementado.

---

## Edge Cases

- IF qualquer chamada à API retornar 401 THEN the system SHALL usar o comportamento já existente em `lib/api.ts` (logout automático + redirecionamento pro login) — nenhum formulário precisa tratar isso por conta própria.
- IF o usuário submeter um formulário com um campo obrigatório vazio THEN the system SHALL bloquear o submit no client antes de chamar a API (validação HTML5 `required` é suficiente).
- WHILE uma requisição de submit está em andamento the system SHALL desabilitar o botão de confirmar, evitando duplo-submit.

---

## Requirement Traceability

| Requirement ID | Story | Phase | Status |
| --- | --- | --- | --- |
| FRM-01 | P1: Criar nova obra | Design | Pending |
| FRM-02 | P1: Criar nova obra (pagamento) | Design | Pending |
| FRM-03 | P1: Criar nova obra (planta baixa) | Design | Pending |
| FRM-04 | P1: Criar nova obra (equipe inicial) | Design | Pending |
| FRM-05 | P1: Alocar gesseiro em obra existente | Design | Pending |
| FRM-06 | P2: Cadastrar gesseiro | Design | Pending |
| FRM-07 | P2: Registrar vale/pagamento | Design | Pending |
| FRM-08 | P2: Cadastrar material | Design | Pending |
| FRM-09 | P2: Registrar movimentação de estoque | Design | Pending |

**ID format:** `FRM-NN`

**Status values:** Pending → In Design → In Tasks → Implementing → Verified

**Coverage:** 9 total, 0 mapped to tasks, 9 unmapped ⚠️ (Tasks phase ainda não rodou)

---

## Success Criteria

- [ ] Um operador consegue criar uma obra, alocar um gesseiro, cadastrar material e registrar vale/movimentação inteiramente pela UI, sem tocar no Swagger
- [ ] Nenhum formulário perde os dados preenchidos quando a API retorna erro de validação
