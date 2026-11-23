# Gesseiros — CRUD Financeiro Validation

**Verdict**: PASS ✅ (8 requisitos Verified; 3 Superseded pela ARQ-09)

**Date**: 2026-11-23
**Spec**: `.claude/specs/features/gesseiros-crud-financeiro/spec.md`
**Verifier**: sub-agente `auditor-de-testes` (`.claude/agents/auditor-de-testes.md`), independente do autor; cada mutação apontada foi aplicada no código e a suíte rodada.

> A feature foi implementada e dada como pronta em outubro, antes da AD-012, e não tinha
> `validation.md`. Este arquivo registra a auditoria feita depois, em 2026-11-23.

---

## Auditoria de testes

Feita em 2026-11-23 para aplicar a AD-012 a esta feature. Cada mutação marcada "nenhum" foi
aplicada no código, a suíte rodou e o teste novo falhou; o arquivo foi restaurado em seguida.

**Veredito do auditor (antes)**: cobertura real em `registrarLancamento`, `update` e `extrato`.
Os DTOs não tinham teste. E três requisitos marcados como `Verified` não tinham mais código:

**GES-08, GES-10 e GES-11 foram substituídos.** A feature `arquivar-e-limpar-registros` (AD-015,
aprovada em 2026-11-20) tirou o `DELETE /gesseiros/:id` e trocou a desativação pelo arquivamento
(ARQ-09). O `remove()` deixou de existir, mas a spec continuava dizendo `Verified`, e o cabeçalho
do spec de testes rotulava o bloco do `extrato` como "GES-08". Agora os três estão como
`Superseded` na rastreabilidade:

- GES-08 (desativar) → ARQ-09: arquivar grava `ativo = false`, e o registro é apagado de vez 7 dias
  depois (exceção à AD-003 registrada na AD-015).
- GES-11 (bloqueio por obra em aberto) → continua valendo dentro da ARQ-09.
- GES-10 (desativar de novo sem erro) → virou o contrário: arquivar de novo responde 400.

| # | Arquivo:linha | Mutação | Antes | Teste que pega agora |
|---|---|---|---|---|
| 2 | `dto/create-gesseiro.dto.ts:7` | sem `@MinLength(3)`, ou com 2 | nenhum (sem teste de DTO) | `dto/create-gesseiro.dto.spec.ts:18` |
| 3 | `dto/create-lancamento.dto.ts:10` | sem `@IsEnum` | nenhum | `dto/create-lancamento.dto.spec.ts:21` |
| 3 | `dto/create-lancamento.dto.ts:14-15` | sem `@IsNumber` e `@Min(0)` | nenhum | `dto/create-lancamento.dto.spec.ts:25` |
| 4 | `gesseiros.service.ts:102` | `<= 0` por `=== 0` | nenhum (o teste só usava 0) | `gesseiros.service.spec.ts:115` (valor -10) |
| 5 | `gesseiros.service.ts:43, :106` | bloquear lançamento de gesseiro inativo | nenhum | `gesseiros.service.spec.ts:124` (edge case da spec; a ARQ não proibiu) |

As outras mutações listadas (CREDITO manual, ordem da checagem de corpo vazio, devolver o registro
antigo no `update`, sinais e `?? 0` do saldo, `where` e `tx` do `extrato`) já eram pegas. O mock de
`$transaction` do arquivamento já separava o `tx` do `prisma`.

**Aceitos sem teste**:

- Remover só o `@IsNumber` mantendo o `@Min(0)`: equivalente para a API. As duas regras recusam a
  mesma coisa em JSON; a única diferença é `Infinity`, que JSON não envia.
- "ativo = true por padrão" (GES-01): vem do `@default(true)` do schema, não do service.

Limpezas no `gesseiros.service.spec.ts`: rótulos de rastreabilidade corrigidos para os IDs certos,
e o `gesseiro.delete` saiu do mock (nada mais o chama).

## Summary

8 requisitos com teste que prova o que diz, 3 substituídos pela ARQ-09 e registrados como tal.
