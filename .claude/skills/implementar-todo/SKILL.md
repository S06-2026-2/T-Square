---
name: implementar-todo
description: Workflow guiado para implementar um método TODO/NotImplementedException dos services de Gesseiros ou Estoque (ou qualquer service novo), seguindo os critérios de aceite da spec correspondente em .claude/specs/features/ e o padrão de apps/api/src/obras/obras.service.ts, incluindo o teste .spec.ts. Use quando o usuário pedir para implementar um TODO, um método específico de gesseiros.service.ts/estoque.service.ts, ou "bater"/cobrir uma spec.
---

# Implementar um TODO a partir da spec

Este projeto já tem as regras de negócio pendentes especificadas em EARS — a implementação deve
sair diretamente delas, não de suposição.

## Passos

1. **Identificar a spec certa**: `gesseiros.service.ts` → `.claude/specs/features/gesseiros-crud-financeiro/spec.md`;
   `estoque.service.ts` → `.claude/specs/features/estoque-materiais-movimentacao/spec.md`. Se não
   estiver claro qual método/TODO o usuário quer, perguntar.

2. **Ler a spec inteira** (não só a story relevante) — Problem Statement, Assumptions & Open
   Questions (essas já são decisões fechadas, não re-perguntar) e os critérios de aceite (EARS) da
   story que cobre o método.

3. **Ler `apps/api/src/obras/obras.service.ts` como padrão de referência**: mesma forma de validar
   existência de entidade relacionada antes de usar o id (`NotFoundException`), mesma forma de usar
   `prisma.$transaction` quando mais de uma escrita precisa ser atômica, mesmo estilo de retorno
   (objeto criado/atualizado com `include` relevante).

4. **Implementar o método** cobrindo cada critério de aceite da spec um a um — cada AC deve
   corresponder a uma linha de código ou a um teste, nunca ficar implícito.

5. **Escrever/estender o `.spec.ts`** do módulo (mirror de `apps/api/src/obras/obras.service.spec.ts`)
   com um teste por critério de aceite coberto. Os testes derivam da spec, nunca do código escrito
   — nunca ajustar o teste pra bater com um bug da implementação.

6. **Rodar os testes**: `npm run test --workspace apps/api`. Todos precisam passar antes de dar a
   tarefa como concluída.

7. **Atualizar a tabela "Requirement Traceability"** do `spec.md`: mudar o `Status` do(s)
   requirement ID(s) cobertos de `Pending` para `Verified` (só depois dos testes passarem).

8. **Nunca commitar** — só implementar e testar; commit fica com o usuário.
