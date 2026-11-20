# Obras — Transições de Status — Validação

## Veredito: ✅ PASS

14/14 requisitos (TRN-01..TRN-14) implementados e cobertos por teste que mata mutante.

- **Pendente do usuário**: o teste manual pela UI (Independent Test da P1 e da P2, inclusive o
  cancelamento com o DevTools em "Offline"), último item da T15.
- **Quem verificou**: o autor fez a verificação na mesma sessão, porque o usuário pediu a execução
  inline, sem sub-agente (2026-11-19). A independência ficou por conta do `auditor-de-testes`
  (AD-012), rodado como sub-agente só leitura. As lacunas que ele achou viraram testes e uma
  correção de bug (ver "Auditoria de testes").

Diff: working tree sobre `fe4b4ea` (branch `feat/obras-transicoes-status`), ainda não commitado.

## Gate (2026-11-19, código final)

| Gate | Resultado |
|---|---|
| `npm run build` (API + web) | OK |
| `npm run test --workspace apps/api` | 397 passed (base 321) |
| `npm run test --workspace apps/web` | 371 passed (base 330) |
| `docker exec gesso_api npm run test:e2e -- --runInBand` | 19 passed (eram 14); zero `[e2e]` no banco depois (psql) |
| `npm run audit:responsive --workspace apps/web` (vite preview 4173) | `medidos: 126/126, nao montados: 0, falhas: 0` (era 118/118); fixture limpa |
| `npm run audit:pwa --workspace apps/web` | `conferencias: 14/14 ok` (regressão do PWA) |
| Swagger `/docs-json` | `/api/obras/{id}/fechar`, `/iniciar`, `/concluir`, `/cancelar` presentes |

## Checagem ancorada no spec

| Req | Implementação | Evidência (teste que afirma o valor da spec) |
|---|---|---|
| TRN-01 fechar | `apps/api/src/obras/obras.service.ts:167`, rota `obras.controller.ts:91` | `obras.service.spec.ts:334` (where `in: [ORCAMENTO]`, data `{status: FECHADA}`), `:355` (4 origens → mensagem exata); e2e `obras-transicoes.e2e-spec.ts:132` (fechar 200 pela rota) |
| TRN-02 iniciar com equipe | `obras.service.ts:172` | `obras.service.spec.ts:375` (`dataInicio` = relógio fixo), `:388` (mensagem exata sem equipe), `:400` (origem antes da equipe), `:409` |
| TRN-03 concluir de ANDAMENTO, créditos | `obras.service.ts:190` (equipe lida no `tx` depois do update) | `obras.service.spec.ts:207` (2 CREDITO com `valorCombinado`, ordem update→findMany, nada no `prisma`), `:299` (rollback), `:311` (sem equipe) |
| TRN-04 transição inválida | `transicoes-obra.ts`, `obras.service.ts:221-245` | `transicoes-obra.spec.ts` (4 ações × 5 status + mensagens exatas), `obras.service.spec.ts:244`, `:322` (404) |
| TRN-05 botões por status | `apps/web/src/components/AcoesStatusObra.tsx:93`, `lib/status.ts` (`acaoDeAvanco`) | `AcoesStatusObra.test.tsx:46-121`, `status.test.ts:6`, `Obras.test.tsx:253`, `:267` (recarga com o filtro atual) |
| TRN-06 `status` fora do POST/PATCH | `dto/create-obra.dto.ts` (campo removido; Update herda) | `dto/obra-status.dto.spec.ts`; e2e `:71` (POST 400 sem criar), `:86` (nasce ORCAMENTO), `:93` (PATCH 400 sem alterar); `obras.service.spec.ts` "create nao grava status explicito" |
| TRN-07 concorrência | `obras.service.ts:235` (`where: { id, status: { in: de } }`), `:238` (`count === 0` → 400) | `obras.service.spec.ts:269` (corrida), `:289`; e2e `:132` (2 concluir paralelos → [200, 400] e 1 CREDITO por gesseiro no Postgres) |
| TRN-08 remoção em obra aberta | `obras.service.ts:145` | `obras.service.spec.ts:460` (3 status), `:475` (último de ANDAMENTO), `:488` (erro do delete propaga) |
| TRN-09 cancelar com motivo | `obras.service.ts:212`, `dto/cancelar-obra.dto.ts`, rota `obras.controller.ts:113` | `cancelar-obra.dto.spec.ts` (ausente/2/501 falham, 3/500 passam, trim), `obras.service.spec.ts:423` (motivo gravado, nenhum lançamento), `:442`; e2e `:109` (`'  ab  '` → 400; `'  Cliente desistiu  '` gravado sem espaços; 0 lançamentos; repetir → 400) |
| TRN-10 formulário e exibição do motivo | `AcoesStatusObra.tsx:114-147`, `pages/Obras.tsx:171` | `AcoesStatusObra.test.tsx:209-330`, `Obras.test.tsx:321` |
| TRN-11 confirmação do concluir | `AcoesStatusObra.tsx:51`, `lib/status.ts` (`textoConfirmacaoConclusao`) | `AcoesStatusObra.test.tsx:126` (linha `João — R$ 2.500,00`), `:140`, `:151` (texto exato sem equipe), `:162`; `status.test.ts:30`, `:44`, `:50` |
| TRN-12 404 ao remover não alocado | `obras.service.ts:145-157` | `obras.service.spec.ts:497` (mensagem exata, sem delete), `:511` |
| TRN-13 erro HTTP recarrega, rede não | `AcoesStatusObra.tsx:26` (`status === 0`), `pages/Obras.tsx:76` (`carregar` antes de `setErro`) | `AcoesStatusObra.test.tsx:175`, `:188` (rede: 1 PATCH depois de 300 ms), `:239`, `:255`, `:271`; `Obras.test.tsx:286` (mensagem continua depois da recarga), `:305` (nenhum GET novo), `:334`, `:356` (reconexão mantém o formulário) |
| TRN-14 celular | `index.css:424` (`overflow-wrap` do motivo), `:1387` (`.card-acoes .btn` 44px) | `audit-responsive.mjs` estado `obras-cancelar` (form aberto + card CANCELADA com 500 caracteres e trecho de 120 sem espaço) e seletor RSP-08 `.card-acoes .btn`: 126/126 |

## Sensor de discriminação

Mutantes aplicados um por vez numa cópia isolada (`scratchpad/sensor`, com junctions para os
`node_modules`), e não na árvore real. A cópia foi apagada no fim (junctions removidas antes) e o
`git status --porcelain` da árvore real ficou igual ao de antes do sensor.

| # | Mutação | Resultado |
|---|---|---|
| A1 | remover a checagem de origem em `transicionar` | morto (15 testes) |
| A2 | `updateMany` sem a condição de status | morto (6) |
| A3 | ignorar `count === 0` | morto (2) |
| A4 | validar a equipe antes da origem | morto (1) |
| A5 | `createMany` pelo `this.prisma`, fora do `tx` | morto (2) |
| A6 | remover o 404 de gesseiro não alocado | morto (1) |
| A7 | aceitar `CONCLUIDA` como origem de `cancelar` | morto (2) |
| A8 | `iniciar` sem `dataInicio` | morto (1) |
| A9 | `iniciar` sem exigir equipe | morto (1) |
| A10 | DTO sem o trim | morto (4) |
| A11 | `@Length(2, 500)` | morto (1) |
| A12 | `cancelar` sem gravar o motivo | morto (3) |
| W1 | falha de rede nunca reconhecida (`status === -1`) | morto (3) |
| W2 | `setErro` antes do `carregar` na página | morto (1) |
| W3 | cancelamento recarrega também na falha de rede | morto (1) |
| W4 | "Iniciar obra" habilitado sem equipe | morto (1) |
| W5 | `confirm` no `fechar` em vez do `concluir` | morto (7) |
| W6 | limpar o motivo no erro | morto (2) |
| W7 | não exibir o motivo no card CANCELADA | morto (1) |
| W8 | texto sem equipe nunca usado | morto (2) |
| W9 | `onErro(..., true)` sempre | morto (2) |
| R1–R9 | as 8 lacunas do auditor (abaixo), depois dos testes novos | todos mortos |
| CSS-1 | tirar `.card-acoes .btn` da regra de 44px (dist copiado) | morto: RSP-08 em 320–768 |
| CSS-2 | tirar o `overflow-wrap` do `.motivo-cancelamento` (dist copiado) | morto: RSP-01 em 320/360/390 |

## Auditoria de testes

Sub-agente `auditor-de-testes` (AD-012), sobre o service, os DTOs, o controller, o componente, os
helpers e a página, com os `.spec.ts`/`.test.tsx` da feature.

**Veredito do auditor**: a cobertura é real no service e no domínio, e o mock separa o `tx` do
`prisma` como a AD-012 pede. As bordas estavam parciais: a rota `/cancelar` não tinha teste HTTP e
a recarga com erro do cancelamento só era testada com callback mockado. Ele também achou um bug.

| # | Mutação ou ponto do auditor | Antes | Ação |
|---|---|---|---|
| 1 | tirar o `await` do `obraGesseiro.delete` | nenhum | teste `obras.service.spec.ts:488` (o delete rejeita e o erro propaga) → R1 morto |
| 2 | `@Body()` sem o `CancelarObraDto` (sem validação nem trim) | nenhum | e2e `obras-transicoes.e2e-spec.ts:109` |
| 3 | rota `/cancelar` apontando para outro método | nenhum | o mesmo e2e (status `CANCELADA`, 0 lançamentos) |
| 4 | leitura inicial sem `include: { gesseiros: true }` | só o e2e | unitário em `obras.service.spec.ts:334` (1ª `findUnique` com `include`) → R4 morto |
| 5 | "Confirmar cancelamento" sem `disabled` durante o envio | nenhum | `AcoesStatusObra.test.tsx:290` (duplo clique → 1 PATCH) → R5 morto |
| 6 | `gesseiros` ausente tratado como equipe | nenhum | `AcoesStatusObra.test.tsx:110` → R6 morto |
| 7 | **bug**: cancelar com 400 e a recarga trazendo a obra final → o componente devolvia `null` e a mensagem e o motivo sumiam (viola P2 AC7) | nenhum | **corrigido**: `AcoesStatusObra.tsx:45` mantém o formulário aberto, e `:129` desabilita "Confirmar" quando a obra não é mais cancelável. Testes `AcoesStatusObra.test.tsx:271` e `Obras.test.tsx:334` → R7/R7b mortos |
| 8 | não limpar o motivo depois do sucesso | nenhum | `AcoesStatusObra.test.tsx:305` → R8 morto |
| 9 | sem o fallback `?? gesseiroId` no texto do confirm | nenhum | `status.test.ts:44` → R9 morto |

Testes que o auditor apontou como fracos:

- Teste "erro HTTP: mensagem no formulário…": o mock não mudava a obra. Coberto agora pelo caso de
  obra que volta final (item 7).
- Teste "remove a alocacao…": coberto pelo item 1.
- Teste "nao credita duas vezes…": **aceito como está**. Ele repete a checagem antes da escrita. A
  garantia de corrida real é o e2e `:132` contra o Postgres, e a corrida simulada é a do unitário
  `:269`. O e2e roda no gate Full da feature.

Nenhuma mutação ficou com "nenhum" sem teste ou sem motivo registrado.

## Achados desta verificação

- **Bug corrigido** (item 7 do auditor). Era o edge case "resposta perdida" no cancelamento.
- **Efeito colateral do RSP-08**: o seletor `.card-acoes .btn` também pega os botões "Resolver" e
  "Dispensar" dos alertas do dashboard. Eles ficam dentro de `.card-acoes`, tinham 40px e não eram
  medidos. Agora têm 44px no celular e são medidos (o mutante CSS-1 mostrou os dois). Isso melhora
  o RSP-08 do PWA sem mudar o comportamento.
- **Lição para a auditoria**: a troca do nome longo (`embrulharFetchComNomeLongo`) renomeia a
  primeira obra da lista, que é a da fixture (a mais nova). O estado `obras-cancelar` acha o card
  pelo trecho de 120 caracteres do motivo, não pelo título.
