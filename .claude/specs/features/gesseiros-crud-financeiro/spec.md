# Gesseiros — CRUD e Controle Financeiro (Vale/Pagamento) Specification

## Problem Statement

O módulo de Gesseiros hoje só lista gesseiros e calcula o extrato (leitura). Não existe forma de
cadastrar um gesseiro novo, editar seus dados, desativá-lo, ou registrar um vale (adiantamento) ou
pagamento — as três operações que fazem o "saldo a receber" (o valor central que a firma deve para
cada gesseiro) se mover. Sem isso, o extrato fica congelado em `creditos` (que só cresce
automaticamente via `ObrasService.concluir()`), sem nunca refletir o que já foi adiantado/pago.

## Goals

- [ ] Operador cadastra, edita e desativa um gesseiro sem acessar o banco diretamente
- [ ] Operador registra vale/pagamento e o `saldoAReceber` do extrato reflete isso imediatamente
- [ ] Criação manual de lançamento tipo `CREDITO` via API é impossível (só nasce em `concluir()`)

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

**Independent Test**: `DELETE /gesseiros/:id`; `GET /gesseiros/:id` ainda retorna o registro, agora com `ativo=false`, e `lancamentos`/`alocacoes` preservados.

---

## Edge Cases

- IF `valor <= 0` num lançamento THEN system SHALL rejeitar com 400.
- IF `obraId` informado não existir THEN system SHALL retornar 404 em vez de deixar a constraint de FK do banco estourar como erro 500.
- IF o `id` da URL em `update`/`remove`/`registrarLancamento` não existir THEN system SHALL retornar 404 (nunca 500 nem sucesso silencioso).
- WHILE um gesseiro está `ativo=false` system SHALL continuar aceitando novos lançamentos para ele (desativação não bloqueia acerto de contas pendente).

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
| GES-07 | P2: Editar gesseiro | Design | Pending |
| GES-08 | P2: Desativar gesseiro (soft delete) | Design | Pending |

**ID format:** `GES-NN`

**Status values:** Pending → In Design → In Tasks → Implementing → Verified

**Coverage:** 8 total, 6 mapped e verificados (GES-01..06, `gesseiros.service.spec.ts`), 2 unmapped ⚠️ (GES-07/08, P2, ainda não implementados)

---

## Success Criteria

- [ ] Um operador consegue cadastrar, editar e desativar um gesseiro sem usar o Prisma Studio
- [ ] `saldoAReceber` no extrato reflete corretamente `creditos - vales - pagamentos` após qualquer lançamento novo
- [ ] Toda tentativa de criar lançamento `tipo: CREDITO` via API retorna 400
