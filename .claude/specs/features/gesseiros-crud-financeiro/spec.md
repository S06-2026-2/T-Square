# Gesseiros — CRUD e Controle Financeiro (Vale/Pagamento) Specification

## Problem Statement

O módulo de Gesseiros hoje só lista gesseiros e calcula o extrato (leitura). Não existe forma de
cadastrar um gesseiro novo, editar seus dados, desativá-lo, ou registrar um vale (adiantamento) ou
pagamento — as três operações que fazem o "saldo a receber" (o valor central que a firma deve para
cada gesseiro) se mover. Sem isso, o extrato fica congelado em `creditos` (que só cresce
automaticamente via `ObrasService.concluir()`), sem nunca refletir o que já foi adiantado/pago.

## Goals

- [x] Operador cadastra, edita e desativa um gesseiro sem acessar o banco diretamente
- [x] Operador registra vale/pagamento e o `saldoAReceber` do extrato reflete isso imediatamente
- [x] Criação manual de lançamento tipo `CREDITO` via API é impossível (só nasce em `concluir()`)

## Out of Scope

| Feature | Reason |
| --- | --- |
| Hard delete de gesseiro | Rejeitado pelo próprio TODO do repo — preserva histórico financeiro (`Lancamento`/`ObraGesseiro` referenciam `gesseiroId`) |
| Restrição por papel (quem pode registrar vale/pagamento) | Decisão de projeto: RBAC fora de escopo por ora |
| Editar/estornar um lançamento já criado | Não pedido; exigiria semântica de estorno, fica para depois |

---

## Assumptions & Open Questions

| Assumption / decision | Chosen default | Rationale | Confirmed? |
| --- | --- | --- | --- |
| Semântica de "remover" gesseiro | `remove()` seta `ativo=false`; nunca apaga a linha | TODO do repo (`gesseiros.service.ts`) instrui isso explicitamente, por causa do histórico | y |
| `update()` em gesseiro inativo | Permitido — inclusive reativar setando `ativo=true` | `UpdateGesseiroDto` já inclui `ativo` como campo opcional; é o caminho natural de reativação | y |
| Validação de `tipo` em `registrarLancamento` | Rejeita com 400 se `tipo === CREDITO` | TODO do repo instrui bloquear criação manual de CREDITO | y |
| `valor === 0` num lançamento | Rejeitado com 400 (DTO só barra `< 0` via `@Min(0)`) | Um lançamento de R$0 é ruído no extrato sem efeito financeiro real | y |
| `obraId` informado num lançamento que não existe | Retorna 404 antes de inserir (mesmo padrão de `ObrasService.alocarGesseiro`, que valida a entidade relacionada antes de criar) | Sem essa checagem, o Prisma lançaria erro de FK (P2003) que viraria 500 genérico | y |
| `obraId` num VALE/PAGAMENTO precisa ser uma obra onde o gesseiro está alocado? | Não — é só informativo/opcional, sem essa validação cruzada | Vale pode ser um adiantamento geral, não necessariamente ligado a uma obra específica | y |
| Nome de gesseiro duplicado | Permitido — sem constraint de unicidade | `Gesseiro.nome` não tem `@unique` no schema (diferente de `Material.nome`); pessoas podem ter nomes iguais | y |
| `update()` com corpo vazio (`{}`) | Rejeitado com 400, **antes** de consultar o banco | PATCH sem campo nenhum é quase sempre erro do cliente; validar o que é barato antes do que é caro evita ida inútil ao banco | y |
| `remove()` em gesseiro já inativo | Idempotente — devolve sucesso sem alterar nada, e sem checar obras | Repetir não causa dano, diferente de `ObrasService.concluir()` (que duplicaria crédito). Quem já está inativo não está sendo desativado agora, então não há o que impedir | y |
| `remove()` com alocação em obra não terminada | Rejeitado com 400, citando os títulos das obras que impedem | Desativar alguém alocado numa obra em aberto faria o crédito automático da conclusão cair para um gesseiro sumido das listagens. Bloqueiam: `ORCAMENTO`, `FECHADA`, `ANDAMENTO`. Não bloqueiam: `CONCLUIDA`, `CANCELADA`. O `ORCAMENTO` entra porque a obra pode ser fechada depois, sem ninguém reavaliar a equipe | y |

**Open questions:** none - all resolved or logged above.

---

## User Stories

### P1: Cadastrar gesseiro ⭐ MVP

**User Story**: Como operador da firma, eu quero cadastrar um novo gesseiro, para que ele possa
ser alocado em obras e ter seu extrato controlado.

**Why P1**: Sem cadastro, nenhum gesseiro novo entra no sistema — bloqueia tudo o mais.

**Acceptance Criteria**:

1. WHEN o operador envia `POST /gesseiros` com `nome` válido (mínimo 3 caracteres) THEN o system SHALL criar o gesseiro com `ativo=true` por padrão e retornar 201 com o registro criado.
2. IF o `nome` enviado tiver menos de 3 caracteres THEN o system SHALL retornar 400 (validação já garantida pelo DTO via `class-validator`).
3. The system SHALL aceitar `telefone` e `chavePix` como campos opcionais, sem exigir preenchimento.

**Independent Test**: `POST /gesseiros` com `{nome: "Teste"}` retorna 201; `GET /gesseiros` lista o novo registro.

---

### P1: Registrar vale ou pagamento ⭐ MVP

**User Story**: Como operador, eu quero registrar um vale (adiantamento) ou um pagamento para um
gesseiro, para que o saldo a receber dele reflita o que já foi adiantado ou pago.

**Why P1**: É a contraparte que falta da regra central do sistema (crédito automático) — sem isso o
extrato nunca reduz, só cresce.

**Acceptance Criteria**:

1. WHEN o operador envia `POST /gesseiros/:id/lancamentos` com `tipo` `VALE` ou `PAGAMENTO` e `valor > 0` THEN o system SHALL criar o `Lancamento` vinculado ao gesseiro e retorná-lo com 201.
2. IF o `tipo` enviado for `CREDITO` THEN o system SHALL rejeitar com 400 e uma mensagem indicando que `CREDITO` só é gerado automaticamente pela conclusão de obra.
3. IF o `gesseiroId` da URL não corresponder a um gesseiro existente THEN o system SHALL retornar 404.
4. IF `obraId` for informado e não corresponder a uma obra existente THEN o system SHALL retornar 404.
5. WHEN um lançamento é criado com sucesso THEN o system SHALL refletir seu efeito imediatamente na próxima chamada a `GET /gesseiros/:id/extrato` (`saldoAReceber` recalculado a partir dos lançamentos).

**Independent Test**: registra um `VALE` de 100 para um gesseiro com `creditos=100`; chama `/extrato`; confirma `vales=100` e `saldoAReceber=0`.

---

### P2: Editar dados do gesseiro

**User Story**: Como operador, eu quero editar telefone, chave Pix, nome ou status ativo de um
gesseiro, para que eu possa corrigir o cadastro ou reativá-lo sem apagar histórico.

**Why P2**: Correção de cadastro é importante mas não bloqueia o fluxo financeiro central.

**Acceptance Criteria**:

1. WHEN o operador envia `PATCH /gesseiros/:id` com campos parciais THEN o system SHALL atualizar apenas os campos enviados, preservando os demais.
2. IF o `id` não corresponder a um gesseiro existente THEN o system SHALL retornar 404.
3. IF o corpo do `PATCH` não contiver nenhum campo THEN o system SHALL retornar 400 sem consultar o banco.

**Independent Test**: `PATCH {telefone: "novo-numero"}` altera só o telefone; `nome` e `ativo` permanecem os mesmos de antes.

---

### P2: Desativar gesseiro (soft delete)

**User Story**: Como operador, eu quero desativar um gesseiro que não trabalha mais com a firma,
para que ele saia das listagens ativas sem perder o extrato histórico.

**Why P2**: Necessário para manter a lista de gesseiros limpa ao longo do tempo, mas não bloqueia o
uso inicial do sistema.

**Acceptance Criteria**:

1. WHEN o operador envia `DELETE /gesseiros/:id` THEN the system SHALL setar `ativo=false` no registro (nunca excluir a linha do banco) e retornar confirmação.
2. IF o `id` não corresponder a um gesseiro existente THEN the system SHALL retornar 404.
3. The system SHALL manter todos os `Lancamento`s e alocações (`ObraGesseiro`) do gesseiro desativado intactos e consultáveis via `GET /gesseiros/:id`.
4. WHEN o operador enviar `DELETE /gesseiros/:id` para um gesseiro já inativo THEN the system SHALL retornar sucesso sem alterar nada, no mesmo formato da desativação normal (operação idempotente).
5. IF o gesseiro tiver alocação em obra com status `ORCAMENTO`, `FECHADA` ou `ANDAMENTO` THEN the system SHALL retornar 400 citando os títulos dessas obras, sem desativar.

**Independent Test**: `DELETE /gesseiros/:id`; `GET /gesseiros/:id` ainda retorna o registro, agora com `ativo=false`, e `lancamentos`/`alocacoes` preservados.

---

## Edge Cases

- IF `valor <= 0` num lançamento THEN system SHALL rejeitar com 400.
- IF `obraId` informado não existir THEN system SHALL retornar 404 em vez de deixar a constraint de FK do banco estourar como erro 500.
- IF o `id` da URL em `update`/`remove`/`registrarLancamento` não existir THEN system SHALL retornar 404 (nunca 500 nem sucesso silencioso).
- WHILE um gesseiro está `ativo=false` system SHALL continuar aceitando novos lançamentos para ele (desativação não bloqueia acerto de contas pendente).
- IF o corpo de um `PATCH` vier vazio THEN system SHALL retornar 400 antes de qualquer consulta ao banco.
- IF o gesseiro tiver alocação em obra não terminada THEN system SHALL recusar a desativação com 400, citando as obras — a saída é removê-lo delas via `DELETE /obras/:id/gesseiros/:gesseiroId`.

---

## Requirement Traceability

| Requirement ID | Story | Phase | Status |
| --- | --- | --- | --- |
| GES-01 | P1: Cadastrar gesseiro | Implementing | Verified |
| GES-02 | P1: Cadastrar gesseiro (validação nome) | Implementing | Verified |
| GES-03 | P1: Registrar vale/pagamento | Implementing | Verified |
| GES-04 | P1: Registrar vale/pagamento (bloqueio CREDITO) | Implementing | Verified |
| GES-05 | P1: Registrar vale/pagamento (404 gesseiro) | Implementing | Verified |
| GES-06 | P1: Registrar vale/pagamento (404 obra) | Implementing | Verified |
| GES-07 | P2: Editar gesseiro | Implementing | Verified |
| GES-08 | P2: Desativar gesseiro (soft delete) | Implementing | Verified |
| GES-09 | P2: Editar gesseiro (PATCH vazio → 400) | Implementing | Verified |
| GES-10 | P2: Desativar gesseiro (idempotência) | Implementing | Verified |
| GES-11 | P2: Desativar gesseiro (bloqueio por obra em aberto) | Implementing | Verified |

**ID format:** `GES-NN`

**Status values:** Pending → In Design → In Tasks → Implementing → Verified

**Coverage:** 11 total, 11 mapped e verificados (`gesseiros.service.spec.ts`, 15 testes). Nenhum requisito pendente.

---

## Success Criteria

- [x] Um operador consegue cadastrar, editar e desativar um gesseiro sem usar o Prisma Studio
- [x] `saldoAReceber` no extrato reflete corretamente `creditos - vales - pagamentos` após qualquer lançamento novo
- [x] Toda tentativa de criar lançamento `tipo: CREDITO` via API retorna 400
