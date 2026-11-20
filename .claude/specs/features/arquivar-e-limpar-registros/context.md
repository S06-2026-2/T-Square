# Arquivar e Limpar Registros — Context

Decisões do usuário em 2026-11-20 (conversa no Claude Code).

## Pedido original

> quando a obra já estiver como concluída, quero que tenha a opção de excluir ela, quando tudo foi
> finalizado, no caso o gesseiro tenha sido pago e o cliente também já pagou. Pode conter dois
> campos para confirmar […]. Quero também a opção de excluir gesseiros registrados, isso só poderá
> acontecer se estiver tudo zerado, tanto o haver quanto o vale. Também quero a opção de excluir
> materiais registrados, mesmo que eles não tenham zerados […]

## Gray areas e respostas

| Pergunta | Resposta |
| --- | --- |
| Excluir = sumir das telas ou apagar do banco? (AD-003) | Arquivar, com "Ver arquivados" e restaurar (obra volta para `CONCLUIDA`). **Depois de 1 semana, apagar de vez**, para limpar o banco |
| Como confirmar que o gesseiro foi pago? | O sistema confere pelos lançamentos |
| Como registrar quanto o cliente pagou? | Valor guardado na obra (campo novo, editável a qualquer momento) |
| O que é gesseiro "zerado"? | Saldo 0 e sem alocação em obra em aberto |
| Na limpeza da obra, e os lançamentos dos gesseiros? | Ficam no extrato, sem o vínculo com a obra; o saldo não muda |
| Gesseiro e material seguem o mesmo esquema? | Sim, os três iguais: arquivados, restaurar, limpeza de 7 dias |

## Interpretações do agente (confirmadas pelo usuário em 2026-11-20)

- "Gesseiro pago" = saldo geral ≤ 0, porque os vales e pagamentos da tela não levam a obra.
- Só obra `CONCLUIDA` pode ser arquivada; `CANCELADA` ficou fora.

## Deferred Ideas

- Extrato do cliente (cada recebimento, com data e forma).
- Vincular vale/pagamento a uma obra no `LancamentoForm`, o que permitiria conferir o pagamento por obra.
