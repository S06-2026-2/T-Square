# Arquivar e Limpar Obras, Gesseiros e Materiais Specification

## Problem Statement

Obras, gesseiros e materiais só se acumulam. A obra concluída e já paga continua para sempre na
lista e no dashboard. O gesseiro que não trabalha mais com a firma, mesmo com tudo acertado, não
sai da lista. O mesmo vale para o material que não vai mais ser usado. A API até tem
`DELETE /obras/:id`, mas é um hard delete que quebra com 500 quando a obra tem lançamentos. Já o
`DELETE /gesseiros/:id` só desativa, e nenhuma tela usa os dois. O sistema também não registra
quanto o cliente já pagou, então não dá para saber se uma obra está quitada.

## Goals

- [ ] Obra `CONCLUIDA` quitada (cliente pagou tudo e os gesseiros receberam) sai das telas com um clique, e volta se for preciso
- [ ] Gesseiro com saldo zerado e material fora de uso saem das telas do mesmo jeito
- [ ] O que ficou arquivado por 7 dias é apagado do banco sozinho, e o saldo e o extrato dos gesseiros que continuam não mudam

## Out of Scope

| Feature | Reason |
| --- | --- |
| Arquivar obra `CANCELADA` ou em aberto | Confirmado pelo usuário em 2026-11-20: só obra `CONCLUIDA` e quitada |
| Registrar cada recebimento do cliente (data, forma, parcelas pagas) | Só o total recebido entra aqui, em `valorRecebido`. Um "extrato do cliente" é outra feature |
| Atribuir vale/pagamento a uma obra específica | Os lançamentos pela tela não levam a obra (`LancamentoForm`), então a conferência usa o saldo geral do gesseiro |
| Prazo de limpeza configurável | Fixo em 7 dias, como pedido |
| "Lixeira" com undo depois da limpeza | Depois de apagado não volta; a UI avisa a data |
| Restringir arquivar/restaurar por papel | AD-002: nenhuma rota é restrita por papel por enquanto |
| Reaproveitar o `ativo` do gesseiro como "arquivado" sem data | A limpeza precisa da data do arquivamento (`arquivadoEm`) |

---

## Assumptions & Open Questions

| Assumption / decision | Chosen default | Rationale | Confirmed? |
| --- | --- | --- | --- |
| "Excluir" = arquivar | Obra, gesseiro e material ganham `arquivadoEm DateTime?`. Arquivar grava a data; o registro some das listas, do dashboard e do agente de estoque, mas continua no banco | Decidido pelo usuário em 2026-11-20. Mantém a AD-003 enquanto o registro está arquivado | y (2026-11-20) |
| Ver e restaurar | Cada tela (Obras, Gesseiros, Estoque) tem "Ver arquivados" com a lista e um botão "Restaurar". Restaurar limpa `arquivadoEm`: a obra volta como `CONCLUIDA` | Decidido pelo usuário em 2026-11-20 | y (2026-11-20) |
| Limpeza automática | Um job diário apaga de vez o que tem `arquivadoEm` há 7 dias ou mais (`arquivadoEm <= agora − 7 dias`) | Decidido pelo usuário em 2026-11-20: não guardar coisa desnecessária. Exige a AD-015 (exceção à AD-003) | y (2026-11-20) |
| Limpeza de obra | Os `Lancamento` e as `MovimentacaoEstoque` da obra **ficam**, com `obraId = null`. Saem a obra, a equipe (`ObraGesseiro`), o `Pagamento` e os previstos. O saldo dos gesseiros não muda, e o extrato guarda a descrição (`Credito automatico pela conclusao da obra "<titulo>"`) | Decidido pelo usuário em 2026-11-20 | y (2026-11-20) |
| Limpeza de gesseiro | Saem o gesseiro, os lançamentos dele (o saldo já era 0) e as alocações dele em obras finais (elas perdem esse nome na equipe) | Decidido pelo usuário em 2026-11-20 ("os três iguais") | y (2026-11-20) |
| Limpeza de material | Saem o material, as movimentações, os alertas e os previstos dele. As obras perdem a linha desse material no previsto x utilizado | Decidido pelo usuário em 2026-11-20 ("os três iguais") | y (2026-11-20) |
| Valor recebido do cliente | Novo campo `Obra.valorRecebido Decimal(12,2) @default(0)`, editável por `PATCH /obras/:id` em qualquer status, de 0 até `valorTotal`. O card da obra mostra "Recebido R$ X de R$ Y" | Decidido pelo usuário em 2026-11-20 ("valor guardado na obra") | y (2026-11-20) |
| Cliente quitou | Arquivar exige `valorRecebido = valorTotal` | "se já foi tudo, poderá apagar a obra" | y (2026-11-20) |
| Gesseiro pago (conferido pelo sistema) | Arquivar exige que todo gesseiro da equipe tenha saldo ≤ 0 (créditos − vales − pagamentos, derivado dos lançamentos). Se a equipe estiver vazia, essa condição passa | O usuário escolheu "o sistema confere" (2026-11-20). Como vale e pagamento não levam a obra, só o saldo geral prova que não há nada a receber | y (2026-11-20) |
| Confirmação na UI | "Arquivar obra" abre um diálogo com duas linhas: "Gesseiros pagos" (✔ ou a lista de quem ainda tem saldo, com o valor) e "Cliente pagou R$ X de R$ Y". O botão "Arquivar" só fica habilitado com as duas OK. A API refaz as duas checagens | Pedido do usuário: "dois campos para confirmar" | y (2026-11-20) |
| Arquivar gesseiro | Exige saldo = 0 e nenhuma alocação em obra `ORCAMENTO`/`FECHADA`/`ANDAMENTO`. Arquivar também grava `ativo = false`, e restaurar grava `ativo = true` | Decidido pelo usuário em 2026-11-20. O `ativo` já é o filtro dos selects de alocação (AD-004) | y (2026-11-20) |
| Arquivar material | Sempre permitido, mesmo com saldo. Material arquivado some do estoque, dos selects de movimentação e de previsto, dos alertas e da análise do agente. Os previstos que já existem nas obras continuam até a limpeza | "mesmo que eles não tenham zerados" (2026-11-20) | y (2026-11-20) |
| Nome de material arquivado | `nome` é `@unique`: criar um material com o nome de um arquivado responde 409 `Existe um material arquivado com esse nome. Restaure-o em "Ver arquivados".` | Evita o 500 do Prisma e indica o caminho certo | y (2026-11-20, spec aprovada) |
| Rotas | `PATCH /obras/:id/arquivar` e `/restaurar`, `PATCH /gesseiros/:id/arquivar` e `/restaurar`, `PATCH /estoque/materiais/:id/arquivar` e `/restaurar`; as listas aceitam `?arquivados=true`. Saem `DELETE /obras/:id` (hard delete) e `DELETE /gesseiros/:id` (desativar), que nenhuma tela usa | Mesmo padrão de "uma rota por ação" da AD-007 | y (2026-11-20, spec aprovada) |
| `GET /:id` de arquivado | Continua respondendo (detalhe e extrato), para a tela de arquivados e o restaurar | — | y (2026-11-20, spec aprovada) |
| Mensagens | Toda mensagem nova com acento (regra de `obras-transicoes-status`) | — | y |
| Arquivar de novo / restaurar o que não está arquivado | 400 `A obra já está arquivada` / `A obra não está arquivada` (e o equivalente para gesseiro e material) | Previsível e testável | y (2026-11-20, spec aprovada) |
| Data na UI | A lista de arquivados mostra "Será apagado em dd/mm/aaaa" (`arquivadoEm` + 7 dias) | O usuário precisa saber até quando dá para restaurar | y (2026-11-20, spec aprovada) |

**Open questions:** none. Em 2026-11-20 o usuário confirmou que "gesseiro pago" é o saldo geral ≤ 0 e que obra `CANCELADA` não pode ser arquivada.

---

## User Stories

### P1: Registrar quanto o cliente pagou ⭐ MVP

**User Story**: Como operador, quero registrar quanto o cliente já pagou de cada obra, para saber se ela está quitada.

**Acceptance Criteria**:

1. WHEN `PATCH /obras/:id` recebe `valorRecebido` entre 0 e o `valorTotal` da obra THEN the system SHALL gravar o valor e devolver a obra com ele (200).
2. WHEN `valorRecebido` é negativo, não numérico ou maior que o `valorTotal` (o atual ou o enviado no mesmo PATCH) THEN the system SHALL responder 400 sem alterar a obra.
3. WHEN uma obra é criada THEN the system SHALL gravar `valorRecebido = 0`.
4. WHEN o card da obra é exibido THEN the system SHALL mostrar "Recebido <valorRecebido em BRL> de <valorTotal em BRL>" e um campo para editar o valor recebido.

**Independent Test**: editar o valor recebido no card, recarregar a página e ver o valor salvo.

### P1: Arquivar obra concluída e quitada ⭐ MVP

**User Story**: Como operador, quero arquivar uma obra concluída depois de o cliente e os gesseiros estarem pagos, para tirá-la da lista sem perder o histórico.

**Acceptance Criteria**:

1. WHEN `PATCH /obras/:id/arquivar` é chamado para uma obra `CONCLUIDA` não arquivada, com `valorRecebido = valorTotal` e todo gesseiro da equipe com saldo ≤ 0 THEN the system SHALL gravar `arquivadoEm = agora` e devolver a obra (200).
2. WHEN a obra não está `CONCLUIDA` THEN the system SHALL responder 400 `Só é possível arquivar uma obra concluída` sem alterar nada.
3. WHEN `valorRecebido < valorTotal` THEN the system SHALL responder 400 `O cliente ainda não pagou tudo: recebido <X> de <Y>` sem alterar nada.
4. WHEN algum gesseiro da equipe tem saldo > 0 THEN the system SHALL responder 400 `Ainda há gesseiros a pagar: <nome> (<saldo>)[, ...]` sem alterar nada.
5. WHEN `GET /obras` e `GET /obras/resumo` são chamados THEN the system SHALL deixar de fora as obras arquivadas.
6. WHEN o card de uma obra `CONCLUIDA` é exibido THEN the system SHALL mostrar o botão "Arquivar obra". Ele abre o diálogo com "Gesseiros pagos" e "Cliente pagou R$ X de R$ Y", e o botão "Arquivar" só fica habilitado com as duas condições OK.
7. WHEN o arquivamento dá certo THEN the system SHALL tirar o card da lista sem recarregar a página inteira.
8. WHEN o arquivamento falha por erro HTTP THEN the system SHALL mostrar a mensagem da API no diálogo e recarregar a lista. WHEN falha por rede THEN the system SHALL mostrar `SEM_CONEXAO_ENVIO` sem reenviar (AD-014).

**Independent Test**: concluir uma obra, pagar o gesseiro (lançamento PAGAMENTO), registrar o valor recebido total, arquivar e ver o card sumir da lista e do dashboard.

### P1: Ver e restaurar arquivados ⭐ MVP

**User Story**: Como operador, quero ver o que foi arquivado e restaurar um registro, caso tenha arquivado errado.

**Acceptance Criteria**:

1. WHEN `GET /obras?arquivados=true`, `GET /gesseiros?arquivados=true` ou `GET /estoque/materiais?arquivados=true` é chamado THEN the system SHALL devolver só os arquivados, do mais recente para o mais antigo, cada um com `arquivadoEm`.
2. WHEN `PATCH /<entidade>/:id/restaurar` é chamado para um registro arquivado THEN the system SHALL limpar `arquivadoEm` e devolver o registro (200). A obra volta como `CONCLUIDA`, e o gesseiro volta com `ativo = true`.
3. WHEN o registro não está arquivado THEN the system SHALL responder 400 `<A obra|O gesseiro|O material> não está arquivad<a|o>`.
4. WHEN a tela de Obras, Gesseiros ou Estoque é aberta THEN the system SHALL mostrar o botão "Ver arquivados". Ele lista cada arquivado com "Será apagado em <arquivadoEm + 7 dias>" e um botão "Restaurar".
5. WHEN "Restaurar" dá certo THEN the system SHALL tirar o item dos arquivados e devolvê-lo à lista principal.

### P2: Arquivar gesseiro com saldo zerado

**User Story**: Como operador, quero arquivar um gesseiro que não trabalha mais com a firma, desde que esteja tudo acertado com ele.

**Acceptance Criteria**:

1. WHEN `PATCH /gesseiros/:id/arquivar` é chamado para um gesseiro com saldo = 0 e sem alocação em obra `ORCAMENTO`/`FECHADA`/`ANDAMENTO` THEN the system SHALL gravar `arquivadoEm = agora` e `ativo = false` (200).
2. WHEN o saldo é diferente de 0 THEN the system SHALL responder 400 `O gesseiro ainda tem saldo de <saldo em BRL>; zere o saldo antes de arquivar` (vale para saldo positivo e negativo).
3. WHEN ele está alocado em obra em aberto THEN the system SHALL responder 400 `O gesseiro está alocado em <títulos>; remova-o dessas obras antes de arquivar`.
4. WHEN `GET /gesseiros` é chamado THEN the system SHALL deixar de fora os arquivados (os selects de alocação também deixam de oferecê-los).
5. WHEN a tela de Gesseiros é exibida THEN the system SHALL mostrar "Arquivar" em cada gesseiro, com confirmação. Se o saldo não for 0, o botão fica desabilitado com o texto "Zere o saldo para arquivar".

### P2: Arquivar material fora de uso

**User Story**: Como operador, quero arquivar um material que não vou mais usar, mesmo que ainda tenha saldo.

**Acceptance Criteria**:

1. WHEN `PATCH /estoque/materiais/:id/arquivar` é chamado para um material não arquivado THEN the system SHALL gravar `arquivadoEm = agora` (200), com qualquer saldo.
2. WHEN `GET /estoque/materiais`, `GET /estoque/alertas` e a análise do agente de estoque rodam THEN the system SHALL deixar de fora o material arquivado e os alertas dele.
3. WHEN uma movimentação ou um previsto novo usa um material arquivado THEN the system SHALL responder 400 `O material <nome> está arquivado`.
4. WHEN `POST /estoque/materiais` usa o nome de um material arquivado THEN the system SHALL responder 409 `Existe um material arquivado com esse nome. Restaure-o em "Ver arquivados".`
5. WHEN a tela de Estoque é exibida THEN the system SHALL mostrar "Arquivar" em cada material, com uma confirmação que avisa o saldo atual quando ele não for 0.

### P2: Limpeza automática depois de 7 dias

**User Story**: Como dono do sistema, quero que o que ficou arquivado por uma semana seja apagado sozinho, para o banco não guardar o que não serve mais.

**Acceptance Criteria**:

1. WHEN o job diário roda THEN the system SHALL apagar de vez as obras, os gesseiros e os materiais com `arquivadoEm <= agora − 7 dias`, e nada com menos de 7 dias.
2. WHEN uma obra é apagada THEN the system SHALL manter os lançamentos e as movimentações dela com `obraId = null`, e apagar a equipe, o pagamento e os previstos dela. O saldo de todo gesseiro fica igual ao de antes.
3. WHEN um gesseiro é apagado THEN the system SHALL apagar os lançamentos e as alocações dele.
4. WHEN um material é apagado THEN the system SHALL apagar as movimentações, os alertas e os previstos dele.
5. WHEN uma entidade falha ao ser apagada THEN the system SHALL desfazer só a limpeza dela (uma transação por registro), registrar o erro no log e seguir para as próximas.
6. WHEN o job roda de novo THEN the system SHALL tentar outra vez o que falhou (o filtro pela data de arquivamento garante isso), e não fazer nada de novo com o que já foi apagado.

### P2: Arquivados no celular

1. WHEN a tela de arquivados e o diálogo "Arquivar obra" são abertos em 320–1366px THEN the system SHALL passar no RSP-01, RSP-07 e RSP-08 da `audit:responsive`.

---

## Edge Cases

- A obra é arquivada e alguém lança um VALE num gesseiro dela: nada muda, porque o arquivamento conferiu o saldo só no momento de arquivar.
- Concorrência: dois "Arquivar" iguais ao mesmo tempo. O update é condicional a `arquivadoEm = null` (mesmo padrão da AD-007), então um responde 200 e o outro 400 `A obra já está arquivada`.
- Restaurar exatamente quando o job roda: o job apaga só se `arquivadoEm` ainda for ≤ 7 dias atrás no momento do delete (delete condicional). Se o restaurar chegar antes, o registro fica.
- `PATCH /obras/:id` diminuindo `valorTotal` para baixo do `valorRecebido`: 400 pela mesma regra do P1 AC2.
- Gesseiro arquivado ainda aparece na equipe de obras concluídas e no extrato das obras até a limpeza.
- Material arquivado ainda aparece no previsto x utilizado das obras até a limpeza.
- API fora do ar na hora do job: o `@Cron` roda no próximo dia e pega tudo que venceu (o filtro é `<=`).
- Rede instável (PWA): arquivar/restaurar são `PATCH` sem `Idempotency-Key`. Repetir responde 400 sem efeito (AD-014).

---

## Requirement Traceability

| Requirement ID | Story | Tasks | Status |
| --- | --- | --- | --- |
| ARQ-01 | P1: Valor recebido — campo, validação e default | T3 | In Tasks |
| ARQ-02 | P1: Valor recebido — exibição e edição no card | T12 | In Tasks |
| ARQ-03 | P1: Arquivar obra — checagens (concluída, cliente quitou, gesseiros com saldo ≤ 0) | T4, T10 | In Tasks |
| ARQ-04 | P1: Arquivar obra — listas e resumo sem arquivadas | T5 | In Tasks |
| ARQ-05 | P1: Arquivar obra — botão, diálogo com as duas confirmações e erros na UI | T13 | In Tasks |
| ARQ-06 | P1: Arquivados — listar com `?arquivados=true` (3 entidades) | T5, T6, T7 | In Tasks |
| ARQ-07 | P1: Arquivados — restaurar (3 entidades) | T4, T6, T7, T14 | In Tasks |
| ARQ-08 | P1: Arquivados — telas "Ver arquivados" com data de limpeza e Restaurar | T14, T15, T16 | In Tasks |
| ARQ-09 | P2: Gesseiro — arquivar com saldo 0 e sem obra aberta | T6 | In Tasks |
| ARQ-10 | P2: Gesseiro — botão na tela e filtro das listas | T6, T15 | In Tasks |
| ARQ-11 | P2: Material — arquivar, filtros (estoque, alertas, agente) e bloqueio de uso | T7, T8 | In Tasks |
| ARQ-12 | P2: Material — 409 de nome arquivado e botão na tela | T7, T16 | In Tasks |
| ARQ-13 | P2: Limpeza — job diário de 7 dias, regras por entidade, uma transação por registro | T9, T10 | In Tasks |
| ARQ-14 | P2: Arquivados e diálogo na `audit:responsive` | T17 | In Tasks |
| ARQ-15 | Edge: arquivar concorrente e restaurar durante a limpeza | T4, T9, T10 | In Tasks |

**Coverage:** 15 total, 15 mapped to tasks (17 tasks em `tasks.md`), 0 unmapped.

---

## Success Criteria

- [ ] Uma obra concluída e quitada sai da lista e do dashboard em um clique e volta pelo "Restaurar"
- [ ] Depois da limpeza de uma obra, o saldo e o total de créditos de cada gesseiro dela são iguais aos de antes (teste com o Postgres)
- [ ] Nenhuma lista, alerta ou análise do agente mostra registro arquivado
