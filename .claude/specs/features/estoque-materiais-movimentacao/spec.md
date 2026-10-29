# Estoque — Materiais e Movimentação Specification

## Problem Statement

O módulo de Estoque hoje só lista materiais e movimentações (leitura). Não existe forma de
cadastrar um material novo, nem de registrar uma entrada/saída — ou seja, o `saldoAtual` de cada
material nunca muda e o alerta de "abaixo do mínimo" não tem como funcionar de verdade, porque
`saldoAtual` fica sempre no valor inicial (0, pelo default do schema).

## Goals

- [ ] Operador cadastra um material novo com unidade e estoque mínimo
- [ ] Operador registra entrada/saída e o `saldoAtual` do material é atualizado atomicamente com o histórico de movimentação
- [ ] Sistema recusa uma saída maior que o saldo disponível (nunca deixa `saldoAtual` negativo)
- [ ] Sistema lista materiais com saldo no/abaixo do mínimo, para alerta de reposição

## Out of Scope

| Feature | Reason |
| --- | --- |
| Editar/excluir material já cadastrado | Não pedido; só criação e movimentação por ora |
| Editar/estornar uma movimentação já registrada | Exigiria recalcular o saldo retroativamente; fica para depois |
| Restrição por papel (quem pode movimentar estoque) | Decisão de projeto: RBAC fora de escopo por ora |

---

## Assumptions & Open Questions

| Assumption / decision | Chosen default | Rationale | Confirmed? |
| --- | --- | --- | --- |
| Nome de material duplicado (`POST /estoque/materiais`) | Retorna 409 Conflict com mensagem clara, em vez de deixar a constraint `@unique` do banco estourar como 500 | `Material.nome` é `@unique` no schema; capturar o erro do Prisma (P2002) dá uma resposta de API previsível | y |
| Saldo insuficiente numa `SAIDA` | Rejeita com 400 antes de gravar qualquer coisa (não cria a movimentação nem altera o saldo) | TODO do repo instrui "recusando SAIDA maior que o saldo disponível"; operação precisa ser tudo-ou-nada | y |
| `materialId` que não existe em `movimentar` | Retorna 404 | Mesmo padrão de validação de FK usado em `ObrasService.alocarGesseiro` | y |
| `obraId` opcional que não existe em `movimentar` | Retorna 404 | Mesma razão acima; evita erro de FK do banco vazando como 500 | y |
| Implementação de `abaixoDoMinimo` | Busca todos os materiais e filtra em memória (`Number(saldoAtual) <= Number(estoqueMinimo)`) | TODO do repo aponta essa opção como alternativa ao `$queryRaw`; evita SQL cru e replica a mesma comparação que o front já faz hoje em `Estoque.tsx` | y |
| Atomicidade de `movimentar` | `prisma.$transaction`: cria `MovimentacaoEstoque` **e** atualiza `material.saldoAtual` (increment/decrement) na mesma transação | TODO do repo instrui isso explicitamente; garante que nunca existe uma movimentação registrada sem o saldo refletir ela (ou vice-versa) | y |

**Open questions:** none - all resolved or logged above.

---

## User Stories

### P1: Cadastrar material ⭐ MVP

**User Story**: Como operador, eu quero cadastrar um novo material com sua unidade de medida e
estoque mínimo, para que ele possa ser movimentado e monitorado.

**Why P1**: Sem material cadastrado, nenhuma movimentação é possível — bloqueia tudo o mais do módulo.

**Acceptance Criteria**:

1. WHEN o operador envia `POST /estoque/materiais` com `nome` (mínimo 2 caracteres) e `unidade` válidos THEN the system SHALL criar o material com `saldoAtual=0` e retornar 201 com o registro criado.
2. IF já existir um material com o mesmo `nome` THEN the system SHALL retornar 409 sem criar duplicata.
3. The system SHALL aceitar `estoqueMinimo` como campo opcional, usando `0` como default quando omitido.

**Independent Test**: `POST /estoque/materiais` com `{nome: "Cal", unidade: "saco"}` retorna 201 com `saldoAtual: 0`; repetir o mesmo `nome` retorna 409.

---

### P1: Registrar entrada ou saída de material ⭐ MVP

**User Story**: Como operador, eu quero registrar uma entrada ou saída de material, para que o
saldo em estoque fique sempre correto e rastreável por movimentação.

**Why P1**: É o núcleo funcional do módulo — sem isso o estoque nunca reflete a realidade.

**Acceptance Criteria**:

1. WHEN o operador envia `POST /estoque/movimentacoes` com `tipo: ENTRADA` e `quantidade > 0` THEN the system SHALL criar a `MovimentacaoEstoque` e incrementar `material.saldoAtual` na mesma transação, retornando 201.
2. WHEN o operador envia `POST /estoque/movimentacoes` com `tipo: SAIDA` e `quantidade <= saldoAtual` do material THEN the system SHALL criar a `MovimentacaoEstoque` e decrementar `material.saldoAtual` na mesma transação, retornando 201.
3. IF `tipo: SAIDA` for enviado com `quantidade > saldoAtual` do material THEN the system SHALL rejeitar com 400, sem criar a movimentação nem alterar o saldo.
4. IF o `materialId` não corresponder a um material existente THEN the system SHALL retornar 404.
5. IF `obraId` for informado e não corresponder a uma obra existente THEN the system SHALL retornar 404.
6. IF `tipo: SAIDA` for enviado com `obraId` de uma obra com status `CONCLUIDA` ou `CANCELADA` THEN the system SHALL rejeitar com 400, sem criar a movimentação nem alterar o saldo. Uma `ENTRADA` com esse `obraId` (devolução de sobra) continua aceita.

**Independent Test**: material com `saldoAtual=10`; `SAIDA` de 5 retorna 201 e novo saldo é 5; `SAIDA` de 100 (maior que o saldo) retorna 400 e saldo permanece 5.

---

### P2: Ver alerta de estoque abaixo do mínimo

**User Story**: Como operador, eu quero ver quais materiais estão com saldo no ou abaixo do
mínimo, para que eu saiba o que precisa ser reposto.

**Why P2**: Importante para o dia a dia da firma, mas não bloqueia o cadastro/movimentação básicos.

**Acceptance Criteria**:

1. WHEN o operador chama `GET /estoque/alertas` THEN the system SHALL retornar todos os materiais cujo `saldoAtual` seja menor ou igual ao `estoqueMinimo`.
2. The system SHALL retornar uma lista vazia (nunca erro) quando nenhum material estiver abaixo do mínimo.

**Independent Test**: material com `saldoAtual=2, estoqueMinimo=5` aparece em `/estoque/alertas`; material com `saldoAtual=10, estoqueMinimo=5` não aparece.

---

## Edge Cases

- IF `quantidade <= 0` numa movimentação THEN the system SHALL rejeitar com 400 (já garantido pelo DTO via `@Min(0.01)`).
- IF a criação da `MovimentacaoEstoque` falhar após o saldo já ter sido calculado THEN the system SHALL reverter tudo (nenhuma escrita parcial) — garantido pelo uso de `$transaction`.
- WHILE um material tem `saldoAtual` exatamente igual ao `estoqueMinimo` the system SHALL considerá-lo "abaixo do mínimo" (comparação usa `<=`, não `<`).

---

## Requirement Traceability

| Requirement ID | Story | Phase | Status |
| --- | --- | --- | --- |
| EST-01 | P1: Cadastrar material | Design | Pending |
| EST-02 | P1: Cadastrar material (nome duplicado) | Design | Pending |
| EST-03 | P1: Registrar entrada | Design | Pending |
| EST-04 | P1: Registrar saída | Design | Pending |
| EST-05 | P1: Registrar saída (saldo insuficiente) | Design | Pending |
| EST-06 | P1: Registrar movimentação (404 material) | Design | Pending |
| EST-07 | P1: Registrar movimentação (404 obra) | Design | Pending |
| EST-08 | P2: Alerta abaixo do mínimo | Design | Pending |
| EST-09 | P1: Registrar saída (obra encerrada) | Execute | Implementing |

**ID format:** `EST-NN`

**Status values:** Pending → In Design → In Tasks → Implementing → Verified

**Coverage:** 9 total, 0 mapped to tasks, 9 unmapped ⚠️ (Tasks phase ainda não rodou)

---

## Success Criteria

- [ ] Um operador consegue cadastrar material e registrar entrada/saída sem usar o Prisma Studio
- [ ] `saldoAtual` nunca fica negativo em nenhum cenário testado
- [ ] `GET /estoque/alertas` sempre reflete o `saldoAtual` mais recente após qualquer movimentação
