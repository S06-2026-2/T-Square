# Obras — Transições de Status do Funil Specification

## Problem Statement

O status da obra não tem regra de transição. A UI só oferece "Concluir obra", que funciona a partir de
qualquer status em aberto. Assim, um orçamento que o cliente nunca aprovou pode ser concluído e gerar
crédito para os gesseiros. "Fechada" e "Em andamento" só são alcançáveis pelo Swagger. No backend,
`POST /obras` e `PATCH /obras/:id` aceitam qualquer `status`: dá para criar uma obra já `CONCLUIDA`
(sem gerar créditos) ou "desconcluir" uma obra que já creditou. Além disso, `concluir()` checa o
status fora da transação, e dois cliques simultâneos podem gerar os créditos em dobro.

## Goals

- [ ] A obra percorre o funil pela UI, na ordem `ORCAMENTO → FECHADA → ANDAMENTO → CONCLUIDA`, sem pular etapas, sem voltar e sem precisar do Swagger
- [ ] Nenhum caminho da API muda o status fora das transições válidas, e os créditos de conclusão são gerados exatamente uma vez por obra
- [ ] Toda obra cancelada registra o motivo

## Out of Scope

| Feature | Reason |
| --- | --- |
| Voltar uma etapa (ex.: `FECHADA → ORCAMENTO`) | Decidido na discussão: o funil só avança ou cancela. Se o cliente desistiu, a obra é cancelada |
| Reabrir obra `CONCLUIDA` ou `CANCELADA` | Os dois são estados finais. Reabrir exigiria estornar créditos, que é outra feature |
| Exigir pagamento definido para fechar | Considerado e não escolhido na discussão |
| Histórico/auditoria de transições (quem mudou, quando) | Só as datas do domínio (`dataInicio`, `dataConclusao`) e o motivo do cancelamento entram aqui |
| Restringir transições por papel (`ADMIN`/`OPERADOR`) | AD-002: nenhuma rota é restrita por papel por enquanto |
| Trocar o hard delete de `DELETE /obras/:id` por soft delete | Problema real, mas separado (convenção AD-003); fica registrado em Deferred Ideas no `context.md` |
| Corrigir obras que já foram para `CONCLUIDA` por atalho (sem créditos) | Dados legados de dev; não há produção |
| Chip de filtro "Canceladas" em `Obras.tsx` | As canceladas continuam visíveis em "Todas" e no dashboard |
| Crédito para gesseiro removido antes da conclusão (spec futura "remanejamento de gesseiros") | Decidido pelo usuário em 2026-10-29. Regra mantida: o crédito vai só para quem está alocado no momento da conclusão (`obras.service.ts:146-181`), e remover apaga a alocação. Contexto de negócio: o pagamento acontece na conclusão, e normalmente o mesmo gesseiro que começou volta e finaliza a obra. O risco é concluir sem realocá-lo, e ele fica sem o crédito daquela obra. Nesta feature, a confirmação do "Concluir obra" mostra quem vai receber (P1 AC10), o que reduz esse risco |

---

## Assumptions & Open Questions

| Assumption / decision | Chosen default | Rationale | Confirmed? |
| --- | --- | --- | --- |
| Ordem do funil | Sequencial estrita: `ORCAMENTO → FECHADA → ANDAMENTO → CONCLUIDA`, sem pular | Decidido na discussão | y |
| Cancelamento | Permitido a partir de `ORCAMENTO`, `FECHADA` ou `ANDAMENTO` | Decidido na discussão. Crédito só nasce na conclusão, então cancelar uma obra em andamento não gera crédito; vales já lançados continuam no extrato | y |
| Pré-condições | Iniciar exige ≥ 1 gesseiro alocado; cancelar exige motivo; fechar não exige pagamento | Decidido na discussão | y |
| Voltar etapa | Não permitido; `CONCLUIDA` e `CANCELADA` são finais | Decidido na discussão | y |
| Contrato da API | Um endpoint por transição: `PATCH /obras/:id/fechar`, `PATCH /obras/:id/iniciar`, `PATCH /obras/:id/concluir` (já existe) e `PATCH /obras/:id/cancelar` com corpo `{ motivo }` | Segue o padrão do `/concluir` existente e mantém a regra no service ("controller fino, service gordo") | y (2026-10-29) |
| Status fora das transições | `status` sai de `CreateObraDto` e `UpdateObraDto`. Como o `ValidationPipe` usa `forbidNonWhitelisted`, enviá-lo gera 400. Obra nova sempre nasce `ORCAMENTO` | Fecha os atalhos sem código extra de validação | y (2026-10-29) |
| Código HTTP de transição inválida | 400 Bad Request com mensagem em texto (formato abaixo) | Mesmo código que `concluir()` já usa para "ja foi concluida" e "cancelada" | y (2026-10-29) |
| Mensagem de transição inválida | `Não é possível <acao> uma obra com status <STATUS>`, com `<acao>` em {`fechar`, `iniciar`, `concluir`, `cancelar`} e `<STATUS>` sendo o valor do enum | Mensagem previsível e testável | y (2026-10-29) |
| Acentuação das mensagens | Toda mensagem **nova** desta feature usa acentuação correta, inclusive a do `concluir`, que muda aqui. Mensagens antigas que esta feature não toca continuam como estão (ex.: `Obra <id> nao encontrada`) | Definido pelo usuário em 2026-10-29; mesma regra da feature `estoque-agente-proativo` | y (2026-10-29) |
| Remover gesseiro não alocado | `DELETE /obras/:id/gesseiros/:gesseiroId` com obra existente e gesseiro não alocado nela responde 404 `Gesseiro <gesseiroId> não está alocado nesta obra` (hoje vira 500 do Prisma). Obra inexistente continua 404 `Obra <id> nao encontrada` | Aprovado pelo usuário em 2026-10-29 | y (2026-10-29) |
| Confirmação do "Concluir obra" | O texto do `window.confirm` lista cada gesseiro alocado como `<nome> — <valor combinado em BRL>`. Sem ninguém alocado: `Nenhum gesseiro alocado: nenhum crédito será gerado.` Os dados vêm de `obra.gesseiros`, que o front já recebe em `GET /obras`; nenhuma rota nova | Definido pelo usuário em 2026-10-29: mostrar quem vai receber crédito antes de um passo irreversível | y (2026-10-29) |
| Teste e2e no banco de dev | Um e2e no Postgres do Docker prova a concorrência e o 400 por `status` no corpo. Ele cria só registros com o prefixo `[e2e]` e os apaga num `afterAll`, mesmo se o teste falhar | Aprovado pelo usuário em 2026-10-29. Não rodar perto de uma demonstração do agente de estoque (registrado no STATE) | y (2026-10-29) |
| Datas | `iniciar` grava `dataInicio = agora`; `concluir` continua gravando `dataConclusao = agora`; `cancelar` não grava data | `dataInicio` já existe no schema e hoje fica sempre nulo | y (2026-10-29) |
| Motivo do cancelamento | Novo campo `Obra.motivoCancelamento String?` (migration). Obrigatório no `/cancelar`, com 3 a 500 caracteres depois do trim | O motivo precisa ser persistido para ser exibido. Os limites evitam motivo vazio ou texto gigante | y (2026-10-29) |
| Concorrência | A transição é condicional ao status de origem dentro da mesma operação atômica (ex.: `updateMany` com `where: { id, status: <origem> }` dentro da `$transaction`). Se o status mudou no meio, a segunda chamada recebe o 400 de transição inválida | Garante créditos de conclusão uma única vez sem lock explícito | y (2026-10-29) |
| Remover a equipe de uma obra em andamento | Permitido em qualquer status em aberto (`ORCAMENTO`, `FECHADA`, `ANDAMENTO`), inclusive o último gesseiro de uma obra `ANDAMENTO`. A exigência de equipe vale só no momento de iniciar | Definido pelo usuário em 2026-10-29: na prática os gesseiros são remanejados entre obras. Substitui o default anterior (bloquear o último) | y (2026-10-29) |
| Confirmação na UI | "Concluir obra" pede confirmação (`window.confirm`). "Cancelar" abre um formulário inline no card com o motivo obrigatório. "Cliente aprovou" e "Iniciar obra" não pedem confirmação | Concluir e cancelar são irreversíveis; fechar e iniciar só avançam uma etapa | y (2026-10-29) |
| Pré-condição de equipe na UI | Em `FECHADA` sem gesseiro alocado, o botão "Iniciar obra" aparece desabilitado, com o texto "Aloque pelo menos um gesseiro para iniciar" logo abaixo. A API continua respondendo 400 se for chamada sem equipe (P1 AC3) | Definido pelo usuário em 2026-10-29. Substitui o default anterior (botão habilitado e erro da API na página) | y (2026-10-29) |

**Open questions:** none - all resolved or logged above.

---

## User Stories

### P1: Avançar a obra pelo funil ⭐ MVP

**User Story**: Como operador, eu quero mover a obra de "Aguardando cliente" para "Fechada", depois "Em andamento" e por fim "Concluida", para que o funil e o dashboard reflitam a situação real de cada obra.

**Why P1**: Sem isso, as colunas "Fechadas" e "Em andamento" do dashboard nunca recebem obras pela UI, e qualquer orçamento pode ser concluído e gerar crédito.

**Acceptance Criteria**:

1. WHEN `PATCH /obras/:id/fechar` é chamado para uma obra `ORCAMENTO` THEN the system SHALL mudar o status para `FECHADA` e devolver a obra atualizada (200).
2. WHEN `PATCH /obras/:id/iniciar` é chamado para uma obra `FECHADA` com pelo menos 1 gesseiro alocado THEN the system SHALL mudar o status para `ANDAMENTO`, gravar `dataInicio` com o instante da chamada e devolver a obra atualizada (200).
3. IF `PATCH /obras/:id/iniciar` é chamado para uma obra `FECHADA` sem gesseiro alocado THEN the system SHALL responder 400 com a mensagem `A obra precisa de pelo menos um gesseiro alocado para ser iniciada` e manter o status `FECHADA`.
4. WHEN `PATCH /obras/:id/concluir` é chamado para uma obra `ANDAMENTO` THEN the system SHALL mudar o status para `CONCLUIDA`, gravar `dataConclusao` e criar exatamente um lançamento `CREDITO` por gesseiro alocado, com o `valorCombinado`, tudo numa única transação.
5. IF uma transição é chamada para uma obra cujo status não é a origem válida dela (`fechar` ← `ORCAMENTO`; `iniciar` ← `FECHADA`; `concluir` ← `ANDAMENTO`) THEN the system SHALL responder 400 com a mensagem `Não é possível <acao> uma obra com status <STATUS>` e não alterar a obra nem criar lançamentos.
6. WHEN o operador vê um card em `Obras.tsx` THEN the system SHALL exibir só o botão de avanço do status atual: "Cliente aprovou" em `ORCAMENTO`, "Iniciar obra" em `FECHADA`, "Concluir obra" em `ANDAMENTO` e nenhum em `CONCLUIDA`/`CANCELADA`. IF a obra `FECHADA` não tem gesseiro alocado THEN the system SHALL exibir "Iniciar obra" desabilitado, com o texto "Aloque pelo menos um gesseiro para iniciar".
7. WHEN o operador clica em "Concluir obra" e confirma no diálogo THEN the system SHALL chamar `PATCH /obras/:id/concluir`; IF ele não confirma THEN the system SHALL não chamar a API.
8. WHEN uma transição feita pela UI termina com sucesso THEN the system SHALL recarregar a lista de obras com o filtro atual.
9. IF uma transição feita pela UI falha THEN the system SHALL exibir a mensagem da API no `erro` da página e manter o card como estava.
10. WHEN o operador clica em "Concluir obra" THEN the system SHALL mostrar no diálogo de confirmação uma linha `<nome> — <valor combinado em BRL>` para cada gesseiro alocado, usando os dados da obra que o front já carregou; IF a obra não tem gesseiro alocado THEN the system SHALL mostrar `Nenhum gesseiro alocado: nenhum crédito será gerado.`

**Independent Test**: criar uma obra pela UI ("Aguardando cliente") e clicar em "Cliente aprovou" (vai para "Fechadas"). Sem equipe, "Iniciar obra" aparece desabilitado com "Aloque pelo menos um gesseiro para iniciar". Alocar um gesseiro e iniciar (vai para "Em andamento", com `dataInicio` preenchida). Concluir e confirmar (vai para "Concluidas", e o extrato do gesseiro mostra um crédito com o valor combinado). O dashboard acompanha cada passo.

---

### P1: Fechar os atalhos de status na API ⭐ MVP

**User Story**: Como responsável pelo financeiro, eu quero que o status da obra só mude pelas transições oficiais, para que nenhum crédito de gesseiro seja pulado, duplicado ou fique órfão.

**Why P1**: Sem isso, a máquina de estados da story anterior pode ser contornada por `POST`/`PATCH` genéricos, e as regras perdem o efeito.

**Acceptance Criteria**:

1. WHEN `POST /obras` é chamado sem `status` THEN the system SHALL criar a obra com status `ORCAMENTO`.
2. IF o corpo de `POST /obras` contém `status` THEN the system SHALL responder 400 e não criar a obra.
3. IF o corpo de `PATCH /obras/:id` contém `status` THEN the system SHALL responder 400 e não alterar a obra.
4. WHEN `PATCH /obras/:id` é chamado sem `status` THEN the system SHALL continuar atualizando os demais campos, como hoje.
5. IF duas chamadas de transição para a mesma obra e a mesma origem chegam ao mesmo tempo (ex.: dois `concluir` para uma obra `ANDAMENTO`) THEN the system SHALL aplicar só uma delas e responder 400 de transição inválida à outra, e a obra SHALL ter exatamente um `CREDITO` por gesseiro alocado.
6. WHEN `DELETE /obras/:id/gesseiros/:gesseiroId` é chamado para uma obra `ORCAMENTO`, `FECHADA` ou `ANDAMENTO` THEN the system SHALL remover a alocação, inclusive quando ela é a última de uma obra `ANDAMENTO`.
7. IF `DELETE /obras/:id/gesseiros/:gesseiroId` é chamado para uma obra existente em que o gesseiro não está alocado THEN the system SHALL responder 404 com a mensagem `Gesseiro <gesseiroId> não está alocado nesta obra`; IF a obra não existe THEN the system SHALL responder 404 `Obra <id> nao encontrada`.

**Independent Test**: pelo Swagger, `POST /obras` com `"status": "CONCLUIDA"` devolve 400; `PATCH /obras/:id` com `"status": "ORCAMENTO"` numa obra concluída devolve 400; dois `concluir` em paralelo numa obra em andamento com 2 gesseiros geram exatamente 2 créditos.

---

### P2: Cancelar obra com motivo

**User Story**: Como operador, eu quero cancelar uma obra que não vai acontecer (ou parou no meio) informando o motivo, para que ela saia do funil ativo sem ser concluída e o time saiba o porquê.

**Why P2**: Completa o funil. Sem cancelamento, obras perdidas ficam paradas em "Aguardando cliente" para sempre, mas o fluxo principal funciona sem ele.

**Acceptance Criteria**:

1. WHEN `PATCH /obras/:id/cancelar` é chamado com `{ motivo }` para uma obra `ORCAMENTO`, `FECHADA` ou `ANDAMENTO` THEN the system SHALL mudar o status para `CANCELADA`, gravar `motivoCancelamento` com o motivo sem espaços nas pontas e devolver a obra atualizada (200).
2. The system SHALL não criar nenhum lançamento ao cancelar uma obra, e os lançamentos que já existem (vales/pagamentos) SHALL permanecer inalterados.
3. IF `motivo` está ausente, ou tem menos de 3 ou mais de 500 caracteres depois do trim THEN the system SHALL responder 400 e não alterar a obra.
4. IF `PATCH /obras/:id/cancelar` é chamado para uma obra `CONCLUIDA` ou `CANCELADA` THEN the system SHALL responder 400 com a mensagem `Não é possível cancelar uma obra com status <STATUS>`.
5. WHEN o operador vê um card `ORCAMENTO`, `FECHADA` ou `ANDAMENTO` THEN the system SHALL exibir a ação "Cancelar obra", que abre no card um formulário com o campo "Motivo" obrigatório.
6. WHEN o operador envia o formulário de cancelamento com um motivo válido THEN the system SHALL chamar `PATCH /obras/:id/cancelar` com `{ motivo }` e recarregar a lista.
7. IF o cancelamento falha THEN the system SHALL exibir a mensagem da API no formulário e preservar o motivo digitado.
8. WHEN um card de obra `CANCELADA` é exibido THEN the system SHALL mostrar o motivo do cancelamento.

**Independent Test**: cancelar pela UI uma obra "Em andamento" com o motivo "Cliente desistiu". Ela vai para "Canceladas" no dashboard, o card mostra "Cliente desistiu" e o extrato dos gesseiros alocados não ganha crédito.

---

## Edge Cases

- IF qualquer transição é chamada com um `id` inexistente THEN the system SHALL responder 404 com `Obra <id> nao encontrada` (padrão atual de `findOne`).
- WHEN uma transição é repetida sobre o status que ela mesma produz (ex.: `fechar` numa obra `FECHADA`) THEN the system SHALL responder 400 com a mensagem de transição inválida, sem efeitos colaterais.
- IF a criação dos créditos falha no meio da conclusão THEN the system SHALL desfazer a mudança de status (`$transaction`), deixando a obra em `ANDAMENTO` sem nenhum crédito parcial.
- WHEN uma obra `ANDAMENTO` sem nenhum gesseiro alocado (todos removidos depois de iniciar) é concluída THEN the system SHALL concluí-la sem criar lançamentos.
- WHILE uma transição disparada pela UI está em andamento the system SHALL desabilitar os botões de ação daquele card, evitando duplo clique.
- IF qualquer chamada retornar 401 THEN the system SHALL seguir o comportamento existente de `lib/api.ts`.

**Dimensions sweep** (feature Large):
- Validação/limites: motivo com 3–500 caracteres; 404 ao remover gesseiro não alocado.
- Falha parcial: rollback da conclusão.
- Idempotência: repetir uma transição gera 400, sem efeito.
- Concorrência: transição condicional (story "Fechar os atalhos", AC5 / TRN-07).
- Integridade de transições: P1 inteira.
- Auth/rate limit: N/A, por AD-002 (sem restrição por papel).
- Ciclo de vida dos dados: N/A, porque nada é apagado aqui (o hard delete fica fora de escopo).
- Observabilidade: N/A, porque o projeto não tem logging estruturado e a auditoria está fora de escopo.
- Dependência externa: N/A, porque a feature não chama serviços externos.

---

## Requirement Traceability

| Requirement ID | Story | Phase | Status |
| --- | --- | --- | --- |
| TRN-01 | P1: Avançar no funil — fechar (`ORCAMENTO → FECHADA`) | Tasks | In Tasks |
| TRN-02 | P1: Avançar no funil — iniciar com equipe e `dataInicio` | Tasks | In Tasks |
| TRN-03 | P1: Avançar no funil — concluir só a partir de `ANDAMENTO`, créditos uma vez | Tasks | In Tasks |
| TRN-04 | P1: Avançar no funil — transição inválida (400 + mensagem, sem efeito) | Tasks | In Tasks |
| TRN-05 | P1: Avançar no funil — botões por status, confirmação, recarga e erro na UI | Tasks | In Tasks |
| TRN-06 | P1: Atalhos — `status` fora de `POST`/`PATCH /obras` | Tasks | In Tasks |
| TRN-07 | P1: Atalhos — transição concorrente aplicada uma vez | Tasks | In Tasks |
| TRN-08 | P1: Atalhos — remoção de gesseiro permitida em obra aberta, inclusive o último de `ANDAMENTO` | Tasks | In Tasks |
| TRN-09 | P2: Cancelar — API com motivo, sem lançamentos | Tasks | In Tasks |
| TRN-10 | P2: Cancelar — formulário de motivo no card e exibição do motivo | Tasks | In Tasks |
| TRN-11 | P1: Avançar no funil — confirmação do "Concluir obra" lista quem recebe crédito | Tasks | In Tasks |
| TRN-12 | P1: Atalhos — 404 ao remover gesseiro não alocado | Tasks | In Tasks |

**ID format:** `TRN-NN`

**Status values:** Pending → In Design → In Tasks → Implementing → Verified

**Coverage:** 12 total, 12 mapped to tasks, 0 unmapped (ver `tasks.md`)

---

## Success Criteria

- [ ] É possível levar uma obra de "Aguardando cliente" até "Concluida" só pela UI, passando por "Fechadas" e "Em andamento" no dashboard
- [ ] Nenhuma combinação de chamadas à API leva uma obra a `CONCLUIDA` sem passar pela conclusão, nem gera créditos em dobro (cada gesseiro alocado na conclusão recebe exatamente um)
- [ ] Toda obra `CANCELADA` criada a partir desta feature tem motivo registrado
