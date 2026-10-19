# Front — Dashboard de Resumo Specification

## Problem Statement

O endpoint `GET /obras/resumo` já existe e retorna quantidade e valor total por status do funil,
mas nenhuma tela consome ele. Hoje, pra ter uma visão geral (quantas obras estão em cada etapa,
quanto dinheiro está em orçamento vs. fechado vs. em andamento), é preciso somar manualmente a
lista de `Obras.tsx` ou consultar o Swagger.

## Goals

- [x] Time enxerga, numa tela só, quantidade e valor total de obras por status do funil

## Out of Scope

| Feature | Reason |
| --- | --- |
| Gráficos (barras/pizza) | Não pedido; cards com número já resolvem a necessidade descrita |
| Filtro por período/data | `GET /obras/resumo` não aceita parâmetros de data hoje; fora de escopo alterar o backend nesta spec |
| Métricas de Gesseiros/Estoque no dashboard | Só o funil de obras foi pedido; outras métricas ficam para uma spec futura |

---

## Assumptions & Open Questions

| Assumption / decision | Chosen default | Rationale | Confirmed? |
| --- | --- | --- | --- |
| Rota da tela | Nova rota `/dashboard`, com aba "Visão geral" (na UI "Visao geral", seguindo a convenção sem acento das telas) no menu (`Layout.tsx`) | Seguindo o padrão de rota-por-página já usado para Obras/Gesseiros/Estoque | y |
| Página inicial (`/`) | Passa a redirecionar para `/dashboard` em vez de `/obras` | Um dashboard é o destino natural ao logar; `/obras` continua acessível pela aba | y |
| Status exibidos | Todos os 5 valores de `StatusObra` (`ORCAMENTO`, `FECHADA`, `ANDAMENTO`, `CONCLUIDA`, `CANCELADA`), mesmo os que não aparecem na resposta (0 obras) | `GET /obras/resumo` só retorna status com pelo menos 1 obra (`groupBy`); a tela deve mostrar 0 para os que faltam, não escondê-los | y |
| Login | Após entrar, `Login.tsx` navega para `/` (que redireciona para `/dashboard`) em vez de `/obras` | Consequência direta da linha acima; sem isso o login continuaria caindo em Obras | n — derivado na implementação, confirmar com o time |
| Rótulos de status | Reaproveita os mesmos rótulos em português já usados nos filtros de `Obras.tsx` (`ORCAMENTO`→"Aguardando cliente" etc.), acrescentando `CANCELADA`→"Canceladas" | Consistência de vocabulário entre as telas | y |

**Open questions:** none - all resolved or logged above.

---

## User Stories

### P1: Ver resumo do funil por status ⭐ MVP

**User Story**: Como operador, eu quero ver quantas obras e quanto valor total existe em cada
status do funil, para que eu tenha uma visão geral sem somar manualmente a lista.

**Why P1**: É a única story desta spec — feature pequena e autocontida.

**Acceptance Criteria**:

1. WHEN o operador acessa `/dashboard` THEN the system SHALL chamar `GET /obras/resumo` e exibir um card por status com `quantidade` e `valorTotal` formatado em BRL (reaproveitando `moeda()` de `lib/formato.ts`).
2. IF um status não aparecer na resposta da API (nenhuma obra nele) THEN the system SHALL exibir esse status com `quantidade: 0` e `valorTotal: R$ 0,00`, em vez de omiti-lo.
3. IF a chamada à API falhar THEN the system SHALL exibir uma mensagem de erro, seguindo o mesmo padrão `erro` já usado nas outras páginas, e SHALL NOT exibir os cards de status (nem zerados).

**Independent Test**: com o seed padrão (1 obra `ANDAMENTO` de R$8.500, 1 `ORCAMENTO` de R$14.200), acessar `/dashboard` mostra esses dois cards com os valores corretos e os demais status zerados.

---

## Edge Cases

- IF não existir nenhuma obra no banco THEN the system SHALL exibir todos os 5 cards com `quantidade: 0`.
- IF `GET /obras/resumo` retornar 401 THEN the system SHALL seguir o comportamento já existente em `lib/api.ts` (logout automático).
- WHILE `GET /obras/resumo` não respondeu the system SHALL exibir "Carregando..." e SHALL NOT exibir os cards (nem zerados).

---

## Requirement Traceability

| Requirement ID | Story | Phase | Status |
| --- | --- | --- | --- |
| DSH-01 | P1: Ver resumo do funil | T1–T5 | Verified |
| DSH-02 | P1: Ver resumo do funil (status zerado) | T3, T5 | Verified |
| DSH-03 | P1: Ver resumo do funil (erro de API) | T3, T5 | Verified |

**ID format:** `DSH-NN`

**Status values:** Pending → In Design → In Tasks → Implementing → Verified

**Coverage:** 3 total, 3 mapped to tasks, 0 unmapped

---

## Success Criteria

- [x] Dashboard reflete os mesmos números que somar manualmente a lista de `/obras` por status
- [x] Todos os 5 status do funil aparecem sempre, mesmo com 0 obras
