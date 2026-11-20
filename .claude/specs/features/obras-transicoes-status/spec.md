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
| Crédito para gesseiro removido antes da conclusão (spec futura "remanejamento de gesseiros") | Decidido pelo usuário em 2026-10-29. Regra mantida: o crédito vai só para quem está alocado no momento da conclusão (`obras.service.ts:147-186`), e remover apaga a alocação. Contexto de negócio: o pagamento acontece na conclusão, e normalmente o mesmo gesseiro que começou volta e finaliza a obra. O risco é concluir sem realocá-lo, e ele fica sem o crédito daquela obra. Nesta feature, a confirmação do "Concluir obra" mostra quem vai receber (P1 AC10), o que reduz esse risco |

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
| Idempotência das transições | As transições são `PATCH` e não usam `Idempotency-Key`: a AD-009 (PWA) vale só para `POST` de criação. O reenvio é seguro pelo update condicional (AD-007): repetir uma transição já aplicada responde 400, sem efeito | Revalidação depois do merge do PWA (2026-11-19); registrado na AD-014 | y (2026-11-19) |
| Erro HTTP numa transição pela UI | A UI mostra a mensagem da API e **recarrega a lista** com o filtro atual, para o card mostrar o status real (ex.: reenvio de um "Concluir obra" cuja resposta se perdeu) | AD-014, confirmada pelo usuário em 2026-11-19. Substitui "manter o card como estava" do P1 AC9 original | y (2026-11-19) |
| Falha de rede numa transição pela UI | Mensagem `SEM_CONEXAO_ENVIO` de `lib/api.ts` (OFF-08 do PWA: "Sem conexão: não foi possível confirmar o envio. Tente de novo; o mesmo lançamento não será duplicado."). O card fica como estava, o motivo digitado é mantido e nada é reenviado sozinho. A frase sobre duplicação vale aqui pelo TRN-07 | O `lib/api.ts` já gera essa mensagem para todo `PATCH` que falha por rede; a feature só precisa exibi-la e não recarregar (sem rede a recarga falharia) | y (2026-11-19) |
| Responsividade das telas novas | Os botões de ação (`AcoesStatusObra`), o formulário de cancelamento aberto e o card `CANCELADA` com motivo longo entram na `audit:responsive` (RSP-01, RSP-07, RSP-08 da spec `pwa-instalavel-responsivo`) | A spec do PWA (assumption "Telas futuras de `obras-transicoes-status`") delega esses estados ao PR desta feature | y (2026-11-19) |

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
9. IF uma transição feita pela UI ("Cliente aprovou", "Iniciar obra" ou "Concluir obra") recebe uma resposta HTTP de erro THEN the system SHALL recarregar a lista de obras com o filtro atual e, depois da recarga, exibir a mensagem da API no `erro` da página.
10. WHEN o operador clica em "Concluir obra" THEN the system SHALL mostrar no diálogo de confirmação uma linha `<nome> — <valor combinado em BRL>` para cada gesseiro alocado, usando os dados da obra que o front já carregou; IF a obra não tem gesseiro alocado THEN the system SHALL mostrar `Nenhum gesseiro alocado: nenhum crédito será gerado.`
11. IF uma transição feita pela UI ("Cliente aprovou", "Iniciar obra" ou "Concluir obra") falha por rede THEN the system SHALL exibir no `erro` da página a mensagem "Sem conexão: não foi possível confirmar o envio. Tente de novo; o mesmo lançamento não será duplicado.", SHALL manter o card como estava e SHALL NOT reenviar a chamada sozinho.

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
7. IF o cancelamento recebe uma resposta HTTP de erro THEN the system SHALL exibir a mensagem da API no formulário, preservar o motivo digitado e recarregar a lista de obras com o filtro atual.
8. WHEN um card de obra `CANCELADA` é exibido THEN the system SHALL mostrar o motivo do cancelamento.
9. IF o envio do formulário de cancelamento falha por rede THEN the system SHALL exibir no formulário a mensagem "Sem conexão: não foi possível confirmar o envio. Tente de novo; o mesmo lançamento não será duplicado.", SHALL preservar o motivo digitado e SHALL NOT reenviar a chamada sozinho.

**Independent Test**: cancelar pela UI uma obra "Em andamento" com o motivo "Cliente desistiu". Ela vai para "Canceladas" no dashboard, o card mostra "Cliente desistiu" e o extrato dos gesseiros alocados não ganha crédito. No DevTools, marcar "Offline" e tentar cancelar outra obra: a mensagem de sem conexão aparece no formulário e o motivo fica.

---

### P2: Ações de status no celular

**User Story**: Como operador no canteiro, eu quero usar os botões de status e o formulário de cancelamento no celular, para que a feature não quebre a tela responsiva que o PWA entregou.

**Why P2**: A spec `pwa-instalavel-responsivo` deixou para esta feature acrescentar seus estados à auditoria. Sem isso, um botão pequeno ou um motivo longo que estoura a largura passaria sem aviso.

**Acceptance Criteria**:

1. The system SHALL renderizar `/obras` com os botões de ação de status visíveis em cards `ORCAMENTO`, `FECHADA` e `ANDAMENTO`, com o formulário de cancelamento aberto e com um card `CANCELADA` cujo motivo tem 500 caracteres (incluindo um trecho de 120 caracteres sem espaço), com `document.documentElement.scrollWidth` igual a `window.innerWidth` nas larguras 320, 360, 390, 768, 1024 e 1366px (estende o RSP-01 do PWA).
2. WHILE a largura da janela for ≤ 900px the system SHALL dar pelo menos 44×44px de área de toque aos botões "Cliente aprovou", "Iniciar obra", "Concluir obra", "Cancelar obra" e aos botões do formulário de cancelamento (estende o RSP-08 do PWA).
3. The system SHALL exibir o campo "Motivo" com fonte de pelo menos 16px, para o iOS não dar zoom ao focar (estende o RSP-07 do PWA).

**Independent Test**: `npm run audit:responsive --workspace apps/web` com a API no Docker termina com `medidos: 126/126, nao montados: 0, falhas: 0` e nenhum registro `[audit]` no banco.

---

## Edge Cases

- IF qualquer transição é chamada com um `id` inexistente THEN the system SHALL responder 404 com `Obra <id> nao encontrada` (padrão atual de `findOne`).
- WHEN uma transição é repetida sobre o status que ela mesma produz (ex.: `fechar` numa obra `FECHADA`) THEN the system SHALL responder 400 com a mensagem de transição inválida, sem efeitos colaterais.
- IF a criação dos créditos falha no meio da conclusão THEN the system SHALL desfazer a mudança de status (`$transaction`), deixando a obra em `ANDAMENTO` sem nenhum crédito parcial.
- WHEN uma obra `ANDAMENTO` sem nenhum gesseiro alocado (todos removidos depois de iniciar) é concluída THEN the system SHALL concluí-la sem criar lançamentos.
- WHILE uma transição disparada pela UI está em andamento the system SHALL desabilitar os botões de ação daquele card, evitando duplo clique.
- IF qualquer chamada retornar 401 THEN the system SHALL seguir o comportamento existente de `lib/api.ts` (com o PWA: apaga o cache de dados e volta para `/login`, OFF-11).
- WHEN o operador reenvia uma transição cuja primeira chamada foi aplicada mas a resposta se perdeu THEN the system SHALL responder 400 de transição inválida sem efeito (API) e SHALL mostrar a obra no status real depois da recarga (UI, P1 AC9).
- WHEN a conexão volta enquanto o formulário de cancelamento está aberto THEN the system SHALL recarregar a lista (OFF-15 do PWA, `useAoReconectar` em `Obras.tsx`) sem fechar o formulário nem apagar o motivo digitado.

**Dimensions sweep** (feature Large):
- Validação/limites: motivo com 3–500 caracteres; 404 ao remover gesseiro não alocado.
- Falha parcial: rollback da conclusão.
- Idempotência: repetir uma transição gera 400, sem efeito; a UI recarrega a lista (AD-014). Sem `Idempotency-Key` nos `PATCH` (a AD-009 cobre só `POST` de criação).
- Rede instável (PWA): falha de rede mostra `SEM_CONEXAO_ENVIO` sem reenviar sozinho (TRN-13); o `PATCH` nunca vai para o cache do SW (OFF-09).
- Responsividade (PWA): estados novos na `audit:responsive` (TRN-14).
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
| TRN-01 | P1: Avançar no funil — fechar (`ORCAMENTO → FECHADA`) | Tasks | Verified |
| TRN-02 | P1: Avançar no funil — iniciar com equipe e `dataInicio` | Tasks | Verified |
| TRN-03 | P1: Avançar no funil — concluir só a partir de `ANDAMENTO`, créditos uma vez | Tasks | Verified |
| TRN-04 | P1: Avançar no funil — transição inválida (400 + mensagem, sem efeito) | Tasks | Verified |
| TRN-05 | P1: Avançar no funil — botões por status, confirmação, recarga e erro na UI | Tasks | Verified |
| TRN-06 | P1: Atalhos — `status` fora de `POST`/`PATCH /obras` | Tasks | Verified |
| TRN-07 | P1: Atalhos — transição concorrente aplicada uma vez | Tasks | Verified |
| TRN-08 | P1: Atalhos — remoção de gesseiro permitida em obra aberta, inclusive o último de `ANDAMENTO` | Tasks | Verified |
| TRN-09 | P2: Cancelar — API com motivo, sem lançamentos | Tasks | Verified |
| TRN-10 | P2: Cancelar — formulário de motivo no card e exibição do motivo | Tasks | Verified |
| TRN-11 | P1: Avançar no funil — confirmação do "Concluir obra" lista quem recebe crédito | Tasks | Verified |
| TRN-12 | P1: Atalhos — 404 ao remover gesseiro não alocado | Tasks | Verified |
| TRN-13 | P1 AC9/AC11 + P2 Cancelar AC7/AC9 — erro HTTP recarrega a lista; falha de rede mostra `SEM_CONEXAO_ENVIO` sem reenviar | Tasks | Verified |
| TRN-14 | P2: Ações de status no celular — estados novos na `audit:responsive` (RSP-01/07/08) | Tasks | Verified |

**ID format:** `TRN-NN`

**Status values:** Pending → In Design → In Tasks → Implementing → Verified

**Coverage:** 14 total, 14 mapped to tasks, 0 unmapped (ver `tasks.md`). TRN-13 e TRN-14 entraram na revalidação de 2026-11-19, depois do merge do PWA (PR #11).

---

## Success Criteria

- [ ] É possível levar uma obra de "Aguardando cliente" até "Concluida" só pela UI, passando por "Fechadas" e "Em andamento" no dashboard
- [ ] Nenhuma combinação de chamadas à API leva uma obra a `CONCLUIDA` sem passar pela conclusão, nem gera créditos em dobro (cada gesseiro alocado na conclusão recebe exatamente um)
- [ ] Toda obra `CANCELADA` criada a partir desta feature tem motivo registrado
- [ ] A `audit:responsive` continua verde com os estados novos (126/126)
