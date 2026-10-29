# Estoque — Agente Proativo de Reposição Specification

## Problem Statement

O estoque só avisa o operador depois do problema: `GET /estoque/alertas` (EST-08) lista materiais
que já estão no mínimo ou abaixo dele. Ninguém olha o ritmo de consumo nem o material que as obras
fechadas e em andamento ainda vão puxar, então a falta só é descoberta quando o gesseiro precisa do
material. Esta feature cria um agente que roda sozinho, prevê quais materiais vão cruzar o mínimo,
sugere quanto repor e mostra isso no Dashboard. O agente nunca compra nem movimenta estoque.

## Goals

- [ ] Toda análise (agendada ou manual) grava os alertas de reposição com quantidade sugerida e justificativa, e o Dashboard os exibe com a data/hora da última análise
- [ ] Material cujo saldo livre está no mínimo ou abaixo sempre gera alerta, com ou sem LLM disponível
- [ ] O material previsto para obras `FECHADA`/`ANDAMENTO` é descontado do saldo antes da previsão (estoque comprometido)
- [ ] Nenhuma análise altera `Material.saldoAtual` nem cria `MovimentacaoEstoque`

## Out of Scope

| Feature | Reason |
| --- | --- |
| Agente executar compras ou registrar movimentações | Decisão do time: o agente só sugere; a escrita dele se limita a `AlertaEstoque` |
| Múltiplas instâncias da API | O lock de "uma análise por vez" e o cron assumem um único processo (docker compose atual) |
| Tela de configuração dos parâmetros do agente (janela, horizonte, cobertura) | Os parâmetros são constantes do service; configurar pela UI não foi pedido |
| Unificar EST-08 (`GET /estoque/alertas`) com os alertas do agente | EST-08 continua alimentando a tela de Estoque sem mudança; o Dashboard usa só os alertas do agente |
| Exibir na UI o raciocínio (passos) do agente | Os passos ficam gravados em `AnaliseEstoque` apenas para auditoria e demonstração |
| Notificação fora do produto (e-mail, WhatsApp, push) | O resultado aparece só no Dashboard |
| Restringir por papel quem roda a análise ou dispensa alertas | AD-002: nenhuma rota é restrita por papel |
| Padronizar a acentuação das mensagens de erro já existentes no backend | Afeta código e testes já entregues (obras, gesseiros, estoque, auth); fica como tarefa futura separada. Só as mensagens novas desta feature saem acentuadas |

---

## Assumptions & Open Questions

| Assumption / decision | Chosen default | Rationale | Confirmed? |
| --- | --- | --- | --- |
| Dependência do Dashboard | Os alertas entram em `Dashboard.tsx` (feature `front-dashboard-resumo`, Verified). Esta spec implementa o item "Métricas de Estoque no dashboard" do Out of Scope daquela | O Dashboard já está commitado (`a390685`) e verificado (DSH-01..03) | y |
| Dependência do funil de obras | O cálculo usa o status atual da obra, venha ele de onde vier. Hoje `FECHADA`/`ANDAMENTO` só são alcançáveis pelo Swagger; `obras-transicoes-status` (ainda não implementada) leva esses status para a UI | O reservado é derivado do status, então funciona antes e depois daquela feature | y |
| Estoque comprometido | `pendente(obra, material) = max(0, previsto − Σ SAIDAs com obraId dessa obra e esse material)`; `reservado(material) = Σ pendente das obras FECHADA/ANDAMENTO`; `saldoLivre = saldoAtual − reservado` | Decidido na discussão | y |
| Liberação do pendente | Derivada, sem gravação: ao concluir ou cancelar uma obra, ela sai do filtro `FECHADA`/`ANDAMENTO` e o pendente dela deixa de contar | Segue a convenção "saldo é sempre derivado" do `CLAUDE.md` | y |
| "Utilizado" de uma obra | `utilizado(obra, material) = Σ SAIDAs − Σ ENTRADAs com aquele obraId e materialId`, sem limite de data. A `ENTRADA` com `obraId` (devolução de sobra) abate o utilizado, e o pendente e o excedente são recalculados a partir dele | Decidido na discussão | y |
| Utilizado negativo | Se as devoluções passarem das saídas da obra, o utilizado é tratado como 0 (`max(0, …)`), e o pendente nunca passa do previsto | Devolver mais do que saiu é erro de lançamento; sem o piso, o pendente ficaria maior que o previsto e inflaria o reservado | y |
| Excedente | Se `utilizado > previsto`, o pendente é 0 e o excedente (`utilizado − previsto`) continua vinculado à obra e **não** entra no consumo solto | Decidido na discussão | y |
| Consumo solto (base do ritmo) | Entram as SAIDAs da janela sem `obraId` e as de obras **sem previsão para aquele material** (qualquer status exceto `CANCELADA`). Saem as de obras com previsão para aquele material (até o previsto e o excedente) e as de obras `CANCELADA` | Decidido na discussão | y |
| "Obra com previsão" | Avaliado por par (obra, material): uma obra que prevê só Cal tem a SAIDA de Gesso contada como solta | A previsão é por material; misturar materiais distorceria o ritmo | y |
| Status da obra no cálculo | Vale o status atual no momento da análise, não o status na data da SAIDA | É o único status gravado; não existe histórico de transições | y |
| Janela de consumo | `diasJanela = max(7, min(30, dias inteiros desde Material.criadoEm))`; considera as SAIDAs com `criadoEm >= agora − diasJanela dias` | Decidido na discussão (D) | y |
| Fórmulas | `ritmoDiario = Σ saídas soltas na janela / diasJanela`; `diasAteMinimo = (saldoLivre − estoqueMinimo) / ritmoDiario` (só quando `ritmoDiario > 0`); `sugerido = ceil(ritmoDiario × 30 + estoqueMinimo − saldoLivre)` | Decidido na discussão (B, C) | y |
| Constantes | Janela 30 dias, horizonte 7 dias, cobertura 30 dias, como constantes do service | Decidido na discussão (4) | y |
| Alerta obrigatório | `saldoLivre < estoqueMinimo` sempre gera alerta. `saldoLivre = estoqueMinimo` gera alerta quando `ritmoDiario > 0` (`diasAteMinimo = 0`) | Decidido na discussão (B) | y |
| Exceção ao "igual ao mínimo conta" | `saldoLivre = estoqueMinimo` com `ritmoDiario = 0` **não** gera alerta, porque a fórmula C daria 0. É uma exceção explícita ao "saldo == mínimo conta como alerta" do pedido original; a EST-08 (`GET /estoque/alertas`, tela de Estoque) continua com `<=` sem mudança | Decidido na discussão (4) | y |
| Material sem consumo e mínimo 0 | `estoqueMinimo = 0`, `reservado = 0` e `ritmoDiario = 0` não gera alerta. É um caso particular da exceção acima (`saldoLivre = saldoAtual >= 0`) | Decidido na discussão (E) | y |
| Quantidade do alerta obrigatório | Sempre é a fórmula C. Com as regras acima, ela é sempre ≥ 1 num alerta obrigatório, então não existe piso artificial | Decidido na discussão (4: remover "sugere no mínimo 1") | y |
| Alerta de previsão | `ritmoDiario > 0` e `diasAteMinimo <= 7`. Fica a critério do agente (não é garantido pela rede de segurança) | Decidido na discussão (1.a, B) | y |
| Material sem SAIDA solta na janela | Sem previsão de dias; alerta só se `saldoLivre < estoqueMinimo`, com `sugerido = ceil(estoqueMinimo − saldoLivre)` e justificativa padrão "sem consumo nos últimos N dias", com N = janela real do cálculo (7 a 30; 30 para material com 30 dias ou mais) | Decidido na discussão (5, 4); N = janela real aprovado na revisão da Fase 2 | y |
| Exibição de dias | O card mostra o texto a partir do `motivo` que a API devolve em cada alerta (o front não compara nem converte números): `ABAIXO_DO_MINIMO` → "abaixo do mínimo"; `NO_MINIMO_COM_CONSUMO` → "no mínimo"; `PREVISAO` → N = parte inteira de `diasAteMinimo`: N = 0 "cruza o mínimo hoje", N = 1 "cruza o mínimo em ~1 dia", N >= 2 "cruza o mínimo em ~N dias"; `REPOSICAO` sem motivo (ritmo 0) → "sem consumo recente"; `INFORMATIVO` → "observação do agente" | O usuário pediu "dias até o MÍNIMO, não até zerar"; motivo vindo da API e textos de N aprovados na revisão da Fase 5 | y |
| Acentuação | Todo texto da UI e toda justificativa padrão gravada usam acentuação correta ("mínimo", "análise", "além") | Decidido na discussão (10) | y |
| Mensagens de erro da API | As mensagens de erro **novas** desta feature (agente, alertas, materiais previstos) usam acentuação correta (ex.: `Já existe uma análise de estoque em andamento`). As mensagens que já existem no backend (ex.: `Nao e possivel …`) não mudam nesta spec | Decidido na discussão: padronizar as antigas afeta código e testes já entregues e vira tarefa separada (ver Out of Scope) | y |
| Papel da LLM | Agente de verdade: Claude API com tool use. Ferramentas somente leitura devolvem números já calculados pelas regras acima; uma única ferramenta de escrita, `sugerirReposicao`, grava só em `AlertaEstoque` | Decidido na discussão (1) | y |
| Conjunto mínimo de ferramentas | `listarMateriais`, `consumoDoMaterial`, `reservadoPorObras`, `previstoVsUtilizado` (leitura) e `sugerirReposicao(materialId, tipo, quantidade?, justificativa)` (escrita, continua sendo a única). Nomes finais e schemas ficam para o Design. `previstoVsUtilizado` pode enviar o `status` da obra (enum, não é dado de cliente); a obra continua só como `{{OBRA_n}}` | Decidido na discussão; nomes vieram como exemplo; status da obra aprovado na revisão da Fase 2 | y |
| Tipos de alerta | `AlertaEstoque.tipo`: `REPOSICAO` (alerta de compra, com quantidade sugerida) ou `INFORMATIVO` (observação do agente, sem quantidade). Só o agente cria `INFORMATIVO`; a rede de segurança nunca cria | Decidido na discussão (5). Ex.: "Cal: estoque suficiente pelo cálculo, mas {{OBRA_12}} está 50% acima do previsto; vale revisar a previsão." | y |
| Validação de `REPOSICAO` | Aceita só se `0,5 × calculado <= quantidade <= 2 × calculado`, sendo `calculado` a fórmula C. Fora disso, ou se `calculado <= 0`, recusa e devolve o motivo ao agente como resultado de ferramenta com erro | Decidido na discussão (1.a, 5) | y |
| Quando `INFORMATIVO` é aceito | Só quando `calculado <= 0` para o material. Com `calculado > 0`, `sugerirReposicao` recusa `INFORMATIVO` e devolve ao agente "use REPOSICAO"; a observação pode ir no texto da justificativa do `REPOSICAO`. Como todo alerta obrigatório tem `calculado >= 1`, um informativo nunca ocupa o lugar de um alerta de compra | A discussão definiu o informativo como alternativa para `calculado <= 0`; sem essa recusa, um material com falta real poderia ficar só com uma observação | y |
| Ciclo de vida do `INFORMATIVO` | Igual ao do `REPOSICAO`: conta no limite de 1 alerta ATIVO por material (uma nova sugestão atualiza o registro, inclusive trocando o tipo), fecha sozinho se não for repetido numa análise `SUCESSO`/`PARCIAL`, e pode ser dispensado ou resolvido | Decidido na discussão (5) | y |
| Silêncio ao dispensar um `INFORMATIVO` | Dispensar um `INFORMATIVO` silencia por 5 dias só novos `INFORMATIVO` daquele material; um `REPOSICAO` (inclusive obrigatório) ainda pode aparecer nesse período. Dispensar um `REPOSICAO` continua silenciando o material inteiro | Se a dispensa de uma observação silenciasse o material inteiro, uma falta real que aparecesse nos 5 dias seguintes ficaria escondida | y |
| Alertas obrigatórios sem sugestão do agente | Ao fim da análise, o código cria os alertas obrigatórios que o agente não sugeriu, com a quantidade calculada e a justificativa padrão, marcados `origemTexto = PADRAO` (selo "sem agente — alerta básico") | Decidido na discussão (1.a, 1.b) | y |
| Sem chave ou falha da Claude API | A análise termina com status `FALHA`, a rede de segurança roda e os alertas ATIVO existentes não são fechados. O Dashboard mostra um aviso mais os alertas ATIVO (os da última análise bem-sucedida mais os da rede de segurança) | Decidido na discussão (1.b) | y |
| Limites do loop | No máximo 20 chamadas de ferramenta e 2 minutos por análise. Se estourar: para, mantém as sugestões aceitas, roda a rede de segurança e grava status `PARCIAL` | Decidido na discussão (1.c) | y |
| Registro dos passos | `AnaliseEstoque` guarda a sequência de passos (ferramenta chamada, argumentos, resumo do resultado, texto do agente). Nada disso aparece na UI | Decidido na discussão (1.c) | y |
| Números exibidos | O card mostra os campos numéricos gravados/validados (quantidade, dias, saldo livre), nunca números extraídos do texto | Decidido na discussão (1) | y |
| Privacidade (marcadores) | As obras chegam à LLM só como `{{OBRA_n}}`; o sistema troca pelo título depois da resposta. Nenhum dado de cliente (`clienteNome`, `clienteTelefone`, `endereco`) é enviado | Decidido na discussão (J) | y |
| Marcador alterado | Se a justificativa contiver qualquer trecho `{{…}}` que não seja exatamente um marcador emitido nesta análise (ex.: `{{OBRA 12}}`, `{{OBRA_99}}` não emitido), o texto é descartado e trocado pelo texto padrão (`origemTexto = PADRAO`) | Decidido na discussão (7) | y |
| Marcador ausente | Se o material tem obras com pendente > 0 e a justificativa não cita nenhum marcador delas, o texto do agente é mantido (`origemTexto = AGENTE`) e o sistema acrescenta no fim "Reservado para: <títulos das obras>", separados por vírgula | Decidido na discussão (7) | y |
| Ciclo de vida do alerta | No máximo 1 `AlertaEstoque` ATIVO por material. Uma nova sugestão para material com alerta ATIVO atualiza esse alerta | Decidido na discussão (F) | y |
| Fechamento automático | Ao terminar uma análise `SUCESSO` ou `PARCIAL`, todo alerta ATIVO cujo material não recebeu alerta nesta análise vira `RESOLVIDO` com `resolvidoPor = AGENTE`. Análise `FALHA` não fecha nada | Decidido na discussão (6); vale para `REPOSICAO` e `INFORMATIVO` | y |
| Dispensar | `DISPENSADO` de um `REPOSICAO` silencia o material por 5 dias a partir da dispensa: nem o agente nem a rede de segurança criam ou reabrem alerta para ele nesse período, inclusive o obrigatório. Para a dispensa de um `INFORMATIVO`, ver a linha "Silêncio ao dispensar um `INFORMATIVO`" | Decidido na discussão (F) | y |
| Resolver manualmente | `RESOLVIDO` manual dá 3 dias de tolerância; depois disso, se a análise alertar o material de novo, o **mesmo** registro volta para ATIVO com números atualizados | Decidido na discussão (F, "reabre") | y |
| Persistência | Três modelos novos: `AlertaEstoque` (tipo REPOSICAO/INFORMATIVO, status ATIVO/DISPENSADO/RESOLVIDO, quantidades em `Decimal(12,2)`, quantidade sugerida nula no `INFORMATIVO`), `AnaliseEstoque` (início, fim, status, origem, nº de alertas, passos) e `MaterialPrevistoObra` (obra, material, quantidade `Decimal(12,2)`, único por par) | Decidido na discussão (3, G) | y |
| Status e origem da análise | Status: `EM_ANDAMENTO`, `SUCESSO`, `PARCIAL`, `FALHA`. Origem: `AGENDADA`, `CATCH_UP`, `MANUAL` | Decidido na discussão (G, 1.b, 1.c) | y |
| Agendamento | `@nestjs/schedule`, todo dia às 06:00, `timeZone: 'America/Sao_Paulo'` explícito | Decidido na discussão (2) | y |
| Catch-up | Ao subir a API, roda uma análise `CATCH_UP` se a última análise terminada tiver começado há mais de 24h, ou se nunca houve análise | Decidido na discussão (H) | y |
| `AGENTE_AUTOMATICO` | `true` liga cron e catch-up; `false` (padrão no `.env.example`) desliga os dois. O botão manual e a rede de segurança funcionam com qualquer valor | Decidido na discussão (6) | y |
| Concorrência | Uma análise por vez. Pedido manual com análise `EM_ANDAMENTO` recebe 409; disparo agendado/catch-up nessa situação é pulado sem erro. As gravações de alertas de uma análise acontecem em `prisma.$transaction` | Decidido na discussão (I) | y |
| Análise travada | Uma `AnaliseEstoque` `EM_ANDAMENTO` com mais de 5 minutos é tratada como abandonada (vira `FALHA`) quando a próxima análise tenta começar | Decidido na discussão (8); sem isso, um crash da API no meio da análise bloquearia todas as análises seguintes | y |
| Limite da execução manual | No máximo 1 execução `MANUAL` a cada 5 minutos, contados do início da última `MANUAL`; excedente recebe 429 | Decidido na discussão (2) | y |
| Contrato da execução manual | `POST /estoque/agente/analisar` é síncrono: responde 201 com a `AnaliseEstoque` finalizada (até ~2 min) | Mais simples que 202 + polling; o limite de 2 min cabe numa requisição HTTP | y |
| Contrato de leitura e ação | `GET /estoque/agente/alertas` → `{ ultimaAnalise, alertas }` (só ATIVO); `PATCH /estoque/agente/alertas/:id/dispensar` e `PATCH /estoque/agente/alertas/:id/resolver` | Mesmo padrão de um endpoint por ação usado em `/obras/:id/concluir` | y |
| Contrato dos materiais previstos | `POST /obras` aceita `materiaisPrevistos?: { materialId, quantidade }[]`, gravado na mesma transação da obra; `PUT /obras/:id/materiais-previstos` substitui a lista inteira (lista vazia remove tudo); `GET /obras/:id/materiais-previstos` devolve previsto × utilizado | Substituir a lista evita endpoints de item e mantém a regra no service | y |
| Status que aceitam edição dos previstos | `ORCAMENTO`, `FECHADA` e `ANDAMENTO` aceitam cadastro e edição; `CONCLUIDA` e `CANCELADA` recusam com 400. Previstos de obra `ORCAMENTO` só entram no reservado quando ela passa a `FECHADA` ou `ANDAMENTO` | Decidido na discussão (1) | y |
| Previsto menor que o já utilizado | Permitido; o pendente fica 0 e o excesso vira excedente | `max(0, …)` já cobre o caso; recusar travaria correções | y |
| UI de edição dos previstos | Não existe formulário de edição de obra nem tela de detalhe. Criação: seção "Materiais previstos" em `NovaObraForm`. Edição: ação "Materiais previstos" no card da obra em `Obras.tsx`, que abre um formulário no próprio card (mesmo padrão do `AlocarGesseiroForm`) | Decidido na discussão (tela de obras) | y |
| UI do previsto × utilizado (P3) | Tabela dentro do card da obra, revelada pela mesma ação "Materiais previstos", acima do formulário de edição; não cria rota `/obras/:id` | Decidido na discussão (tela de obras) | y |
| Rótulo da situação | `pendente > 0` → "pendente: N"; `excedente > 0` → "excedente: N"; os dois 0 → "conforme previsto"; se os dois > 0 (não deveria acontecer), vale o pendente | Decidido na discussão (10). Texto sem plural ajustado em 2026-10-29 | y |
| Ícones dos alertas | `REPOSICAO` usa ⚠️; `INFORMATIVO` usa ℹ️ com o rótulo "observação do agente" | Decidido na discussão (10) | y |
| Modelo e chave | `ANTHROPIC_MODEL` (padrão `claude-haiku-5-5`) e `ANTHROPIC_API_KEY` no `.env` (nunca commitado), vazios no `.env.example` e repassados no `docker-compose.yml` | Decidido na discussão (6) | y |
| Estimativa de custo | Por análise, com até 20 chamadas de ferramenta e o histórico reenviado a cada turno (~2k tokens de sistema+ferramentas, ~0,7k por passo): pior caso ~175k tokens de entrada e ~20k de saída (com o raciocínio adaptativo). Haiku 5.5 (US$ 0,10 / 0,50 por MTok): ~US$ 0,03 no pior caso, ~US$ 0,01 típico, menos de US$ 1/mês com 1 análise diária e algumas manuais. Opus 5.5 (US$ 4 / 20): ~US$ 1,10 no pior caso por análise | Estimativa, não medição. Execução real (T27): estimado em menos de US$ 0,01 por análise (Haiku 5.5); confirmar no Console — Usage, 29/10 por volta de 13:25 e 13:44 UTC, 19 requisições | y |
| Testes | Os `.spec.ts` sempre usam a LLM mockada com roteiros de chamadas de ferramenta; nenhum teste chama a Claude API | Decidido na discussão (1) | y |
| AD-006 | Texto na seção "Decisão proposta para STATE.md" abaixo; gravada no `STATE.md` em 2026-10-27 | Decidido na discussão (7) | y |

**Open questions:** none - all resolved or logged above.

---

## User Stories

### P1: Análise de estoque com previsão e rede de segurança ⭐ MVP

**User Story**: Como dono da firma, eu quero que o sistema analise o estoque sozinho e grave quais materiais precisam de reposição e quanto repor, para que eu compre antes de faltar material na obra.

**Why P1**: É o núcleo da feature: sem a análise e as regras de cálculo, não há alerta para mostrar.

**Acceptance Criteria**:

1. WHEN uma análise roda THEN the system SHALL calcular, para cada material, `reservado`, `saldoLivre`, `ritmoDiario` e `sugerido` pelas fórmulas registradas em Assumptions, com o mesmo resultado esteja a LLM disponível ou não.
2. WHEN o consumo solto é somado THEN the system SHALL excluir as SAIDAs ligadas a obras `CANCELADA` e as SAIDAs de obras que têm previsão para aquele material.
3. IF `saldoLivre < estoqueMinimo`, ou `saldoLivre = estoqueMinimo` com `ritmoDiario > 0`, para um material THEN the system SHALL terminar a análise com um alerta `REPOSICAO` ATIVO para esse material, salvo as exceções de silêncio (dispensa ou tolerância de resolução).
4. IF `saldoLivre = estoqueMinimo` e `ritmoDiario = 0` THEN the system SHALL não criar alerta obrigatório para o material (exceção explícita ao "igual ao mínimo conta"; cobre também `estoqueMinimo = 0`, `reservado = 0` e saldo 0).
5. WHEN o agente chama `sugerirReposicao` com `tipo = REPOSICAO` e `0,5 × calculado <= quantidade <= 2 × calculado` THEN the system SHALL gravar ou atualizar o alerta `REPOSICAO` do material com essa quantidade e com a justificativa do agente (`origemTexto = AGENTE`).
6. IF o agente chama `sugerirReposicao` com `tipo = REPOSICAO` e quantidade fora da faixa, ou para um material com `calculado <= 0` THEN the system SHALL recusar sem gravar e devolver ao agente um resultado de ferramenta com erro que contém a faixa aceita (ou, com `calculado <= 0`, a indicação de que só `INFORMATIVO` é aceito).
7. WHEN uma análise termina e um material com alerta obrigatório não recebeu sugestão `REPOSICAO` aceita do agente THEN the system SHALL criar o alerta `REPOSICAO` com a quantidade calculada, a justificativa padrão e `origemTexto = PADRAO`.
8. IF `ANTHROPIC_API_KEY` não está configurada ou a chamada à Claude API falha THEN the system SHALL gravar a análise com status `FALHA`, criar os alertas obrigatórios pela rede de segurança e responder sem derrubar a API.
9. IF o agente pede a 21ª chamada de ferramenta (as 20 primeiras são executadas) ou a análise chega a 2 minutos THEN the system SHALL interromper o agente sem executar essa chamada, manter as sugestões já aceitas, rodar a rede de segurança e gravar a análise com status `PARCIAL`; IF o agente termina (`end_turn`) com 20 chamadas ou menos dentro dos 2 minutos THEN the system SHALL gravar a análise com status `SUCESSO`.
10. The system SHALL nunca alterar `Material.saldoAtual` nem criar `MovimentacaoEstoque` durante uma análise, em nenhum status de término.
11. The system SHALL enviar as obras à Claude API apenas como marcadores `{{OBRA_n}}` e nunca enviar `clienteNome`, `clienteTelefone` ou `endereco`.
12. WHEN a justificativa aceita contém marcadores emitidos nesta análise THEN the system SHALL gravar o texto com cada marcador trocado pelo título da obra correspondente.
13. IF a justificativa contém um trecho `{{…}}` que não é exatamente um marcador emitido nesta análise (ex.: `{{OBRA 12}}`) THEN the system SHALL descartar o texto e gravar a justificativa padrão com `origemTexto = PADRAO`.
14. WHEN uma análise roda duas vezes sem mudança nos dados THEN the system SHALL manter no máximo 1 alerta ATIVO por material, atualizando o existente em vez de criar outro.
15. WHEN uma análise termina com status `SUCESSO` ou `PARCIAL` THEN the system SHALL marcar como `RESOLVIDO` (`resolvidoPor = AGENTE`) todo alerta ATIVO cujo material não recebeu alerta nessa análise.
16. IF uma análise termina com status `FALHA` THEN the system SHALL manter inalterados os alertas ATIVO que já existiam.
17. WHEN uma análise termina THEN the system SHALL gravar em `AnaliseEstoque` o início, o fim, o status, a origem, o número de alertas ATIVO resultantes e a sequência de passos do agente.
18. WHEN o agente chama `sugerirReposicao` com `tipo = INFORMATIVO` para um material com `calculado <= 0` THEN the system SHALL gravar ou atualizar um alerta `INFORMATIVO` ATIVO para o material, sem quantidade sugerida e com a justificativa do agente.
19. IF o agente chama `sugerirReposicao` com `tipo = INFORMATIVO` para um material com `calculado > 0` THEN the system SHALL recusar sem gravar e devolver ao agente um resultado de ferramenta com erro indicando que o material exige `REPOSICAO`.
20. The system SHALL criar alertas `INFORMATIVO` somente a partir de `sugerirReposicao`; a rede de segurança SHALL criar apenas alertas `REPOSICAO`.
21. IF o material tem obras com pendente > 0 e a justificativa aceita não cita nenhum marcador delas THEN the system SHALL manter o texto do agente (`origemTexto = AGENTE`) e acrescentar ao fim "Reservado para: <títulos das obras>", separados por vírgula.
22. IF o agente chama `sugerirReposicao` para um material sem ter chamado nesta análise `consumoDoMaterial` para ele, ou `reservadoPorObras` quando o material tem reserva, ou `previstoVsUtilizado` quando ele tem previsão de obra `FECHADA`/`ANDAMENTO` THEN the system SHALL recusar sem gravar e devolver ao agente um resultado de ferramenta com erro que lista as consultas que faltam. A recusa por silêncio vem antes desta trava. `listarMateriais` dá só a visão geral (saldo, mínimo, `risco`, `obrigatorio`, `temReserva`, `temPrevisao`), sem `calculado`, que passa a vir em `consumoDoMaterial` junto com a faixa aceita. (EAP-67, T28)

**Independent Test**: com Cal criada há mais de 30 dias (`estoqueMinimo` 10, `saldoAtual` 40) e registrar 30 sacos de SAIDA sem obra nos últimos 30 dias (ritmo 1/dia, `diasAteMinimo` = 30). Rodar com a LLM mockada sugerindo `REPOSICAO` de 20: recusado, porque `calculado = ceil(30 + 10 − 40)` = 0; o roteiro então registra um `INFORMATIVO`, que é aceito sem quantidade. Registrar mais 25 de SAIDA (saldo 15, ritmo ≈ 1,83/dia, `diasAteMinimo` ≈ 2,7): o roteiro sugere 50, que é aceito (`calculado = ceil(55 + 10 − 15)` = 50). Repetir a análise: continua 1 alerta. Rodar sem chave: status `FALHA`, alerta mantido, `saldoAtual` e movimentações inalterados.

---

### P1: Execução agendada e manual ⭐ MVP

**User Story**: Como dono da firma, eu quero que a análise rode sozinha todo dia e que eu possa disparar uma na hora, para que os alertas estejam atualizados sem eu lembrar de pedir e para poder demonstrar a feature.

**Why P1**: "Roda sozinho, sem o usuário pedir" é o que torna o agente proativo; o disparo manual é necessário para a demonstração com `AGENTE_AUTOMATICO=false`.

**Acceptance Criteria**:

1. WHERE `AGENTE_AUTOMATICO=true` the system SHALL disparar uma análise com origem `AGENDADA` todo dia às 06:00 no fuso `America/Sao_Paulo`.
2. WHERE `AGENTE_AUTOMATICO=true`, WHEN a API sobe e a última análise terminada começou há mais de 24h, estritamente (exatamente 24h não dispara), ou nunca houve análise, the system SHALL disparar uma análise com origem `CATCH_UP`.
3. WHERE `AGENTE_AUTOMATICO` é `false` ou ausente the system SHALL não registrar o cron e não executar o catch-up.
4. WHEN um usuário autenticado chama `POST /estoque/agente/analisar` THEN the system SHALL executar uma análise com origem `MANUAL` e responder 201 com a `AnaliseEstoque` finalizada, qualquer que seja o valor de `AGENTE_AUTOMATICO`.
5. IF `POST /estoque/agente/analisar` é chamado enquanto existe uma análise `EM_ANDAMENTO` THEN the system SHALL responder 409 com a mensagem `Já existe uma análise de estoque em andamento` sem iniciar outra.
6. IF `POST /estoque/agente/analisar` é chamado menos de 5 minutos depois do início da última análise `MANUAL` THEN the system SHALL responder 429 com a mensagem `Aguarde 5 minutos entre análises manuais` sem iniciar outra.
7. IF o disparo agendado ou de catch-up ocorre enquanto existe uma análise `EM_ANDAMENTO` THEN the system SHALL pular esse disparo sem criar `AnaliseEstoque` e sem lançar erro.
8. IF existe uma análise `EM_ANDAMENTO` iniciada há mais de 5 minutos quando outra vai começar THEN the system SHALL marcá-la como `FALHA` e prosseguir com a nova.

**Independent Test**: com `AGENTE_AUTOMATICO=false`, subir a API e conferir que nenhuma análise foi criada; chamar `POST /estoque/agente/analisar` (201), chamar de novo em seguida (429). Com `AGENTE_AUTOMATICO=true` e a última análise de 2 dias atrás, subir a API e conferir uma análise `CATCH_UP`.

---

### P1: Ver alertas do agente no Dashboard ⭐ MVP

**User Story**: Como operador, eu quero ver no Dashboard os materiais que precisam de reposição, com quanto repor e por quê, para que eu não precise abrir o estoque e fazer conta.

**Why P1**: É onde o resultado do agente aparece no produto; sem isso a análise fica invisível.

**Acceptance Criteria**:

1. WHEN o operador acessa `/dashboard` THEN the system SHALL chamar `GET /estoque/agente/alertas` e exibir um card por alerta ATIVO com material, unidade, quantidade sugerida, situação em dias e justificativa (recolhida atrás de um botão "+" que abre e fecha o texto; ajuste de 2026-10-29 para limpar o card), na ordem de urgência devolvida pela API: abaixo do mínimo (`saldoLivre < estoqueMinimo`) → no mínimo com consumo (`saldoLivre = estoqueMinimo`) → previsão (`diasAteMinimo` crescente; sem dias por último) → `INFORMATIVO`; empate por `criadoEm` crescente.
2. The system SHALL exibir no card os valores numéricos dos campos gravados no alerta, e nunca números extraídos da justificativa.
3. WHEN o alerta `REPOSICAO` tem `motivo = ABAIXO_DO_MINIMO` (`saldoLivre < estoqueMinimo`) THEN the system SHALL exibir "abaixo do mínimo" no lugar dos dias; WHEN tem `motivo = NO_MINIMO_COM_CONSUMO` (`saldoLivre = estoqueMinimo`) THEN the system SHALL exibir "no mínimo"; WHEN tem `motivo = PREVISAO` (`ritmoDiario > 0` e `saldoLivre > estoqueMinimo`) THEN the system SHALL exibir, com `N = floor(diasAteMinimo)`, "cruza o mínimo hoje" se N = 0, "cruza o mínimo em ~1 dia" se N = 1 e "cruza o mínimo em ~N dias" se N >= 2; WHEN não tem motivo (`ritmoDiario = 0`) THEN the system SHALL exibir "sem consumo recente". O `motivo` é calculado pela API em `GET /estoque/agente/alertas` a partir dos números gravados; o front não compara nem converte esses números.
4. WHEN o alerta tem `origemTexto = PADRAO` THEN the system SHALL exibir o selo "sem agente — alerta básico" no card.
5. The system SHALL exibir a data e a hora de início da última análise terminada, no formato `dd/mm/aaaa hh:mm`.
6. IF existe análise terminada e nenhum alerta ATIVO THEN the system SHALL exibir o estado vazio "Estoque em dia".
7. IF nunca houve análise THEN the system SHALL exibir "Nenhuma análise executada ainda" no lugar da data e dos cards.
8. IF a última análise terminou com status `FALHA` ou `PARCIAL` THEN the system SHALL exibir um aviso com esse status junto dos alertas ATIVO.
9. IF `GET /estoque/agente/alertas` falha THEN the system SHALL exibir a mensagem no padrão `erro` só na seção de estoque, mantendo os cards do funil de obras.
10. WHEN o operador clica em "Rodar análise agora" THEN the system SHALL chamar `POST /estoque/agente/analisar`, desabilitar o botão até a resposta e recarregar os alertas ao terminar.
11. IF `POST /estoque/agente/analisar` responde 409 ou 429 THEN the system SHALL exibir a mensagem da API no padrão `erro` da seção de estoque.
12. WHEN o alerta é `REPOSICAO` THEN the system SHALL exibir o ícone ⚠️ no card.
13. WHEN o alerta é `INFORMATIVO` THEN the system SHALL exibir o ícone ℹ️ e o rótulo "observação do agente", sem quantidade sugerida.
14. WHILE `GET /estoque/agente/alertas` não respondeu the system SHALL exibir "Carregando alertas..." na seção de estoque (texto diferente do "Carregando..." do funil, que aparece ao mesmo tempo).

**Independent Test**: com um alerta ATIVO gravado (via análise com LLM mockada), abrir `/dashboard` e ver o card com ⚠️, a quantidade e o texto; com um `INFORMATIVO` gravado, ver o card com ℹ️, "observação do agente" e sem quantidade; rodar sem chave e ver o selo "sem agente — alerta básico" e o aviso de `FALHA`; com o banco sem alertas e com uma análise `SUCESSO`, ver "Estoque em dia".

---

### P2: Materiais previstos na obra

**User Story**: Como operador, eu quero informar quanto de cada material uma obra vai consumir, para que o agente desconte esse material do estoque livre antes de prever a falta.

**Why P2**: Melhora muito a previsão (enxerga a demanda das obras fechadas), mas a análise P1 funciona sem previsões (`reservado = 0`).

**Acceptance Criteria**:

1. WHEN o operador cria uma obra pelo `NovaObraForm` com itens na seção "Materiais previstos" THEN the system SHALL enviar `materiaisPrevistos` em `POST /obras` e gravar a obra e os itens na mesma transação.
2. WHEN `PUT /obras/:id/materiais-previstos` é chamado para uma obra `ORCAMENTO`, `FECHADA` ou `ANDAMENTO` THEN the system SHALL substituir a lista de previstos da obra pela lista enviada e responder 200 com a lista gravada.
3. IF `PUT /obras/:id/materiais-previstos` é chamado para uma obra `CONCLUIDA` ou `CANCELADA` THEN the system SHALL responder 400 com a mensagem `Não é possível alterar materiais previstos de uma obra com status <STATUS>` sem alterar nada.
4. IF a lista enviada repete um `materialId` THEN the system SHALL responder 400 sem gravar nenhum item.
5. IF algum item tem `quantidade <= 0` ou mais de 2 casas decimais THEN the system SHALL responder 400 sem gravar nenhum item.
6. IF algum `materialId` não existe THEN the system SHALL responder 404 sem gravar nenhum item.
7. WHEN o operador vê o card de uma obra `ORCAMENTO`, `FECHADA` ou `ANDAMENTO` em `Obras.tsx` THEN the system SHALL exibir a ação "Materiais previstos", que abre no card o formulário de edição com os itens atuais.
8. WHEN o operador vê o card de uma obra `CONCLUIDA` ou `CANCELADA` THEN the system SHALL não oferecer edição dos previstos.
9. WHILE uma obra está `FECHADA` ou `ANDAMENTO` the system SHALL somar o pendente dela ao `reservado` de cada material previsto; WHILE está em qualquer outro status, SHALL não somar.
10. WHEN uma `ENTRADA` com `obraId` é registrada para um material previsto naquela obra THEN the system SHALL abater a quantidade do utilizado da obra (com piso 0) e recalcular pendente e excedente a partir dele.

**Independent Test**: criar uma obra com 20 sacos de Cal previstos e levá-la a `FECHADA`; com Cal em saldo 25 e mínimo 10, a análise vê `saldoLivre = 5` e gera alerta obrigatório. Registrar 8 de SAIDA para a obra: o pendente cai para 12 e `saldoLivre` continua 5 (saldo 17 − 12). Registrar uma ENTRADA de 3 com a obra (devolução): utilizado 5, pendente 15, `saldoLivre` continua 5 (saldo 20 − 15). Cancelar a obra: `reservado` volta a 0.

---

### P2: Dispensar ou resolver um alerta

**User Story**: Como operador, eu quero dispensar um alerta que não faz sentido agora ou marcá-lo como resolvido depois de comprar, para que o Dashboard mostre só o que ainda precisa de ação.

**Why P2**: Sem isso os alertas só somem quando o agente os fecha; útil, mas a P1 já entrega valor sem essa ação.

**Acceptance Criteria**:

1. WHEN o operador clica em "Dispensar" num card de alerta THEN the system SHALL chamar `PATCH /estoque/agente/alertas/:id/dispensar`, que muda o status para `DISPENSADO` e grava a data, e remover o card da lista.
2. WHEN o operador clica em "Resolver" num card de alerta `INFORMATIVO` THEN the system SHALL chamar `PATCH /estoque/agente/alertas/:id/resolver`, que muda o status para `RESOLVIDO` com `resolvidoPor = OPERADOR` e grava a data, e remover o card da lista. (Num `REPOSICAO`, o "Resolver" segue o critério 10.)
10. WHEN o operador clica em "Resolver" num card de alerta `REPOSICAO` THEN the system SHALL abrir a página de Estoque com o formulário de ENTRADA preenchido com o material e a quantidade sugerida (editável), sem chamar a API; WHEN essa ENTRADA é salva THEN the system SHALL chamar `PATCH /estoque/agente/alertas/:id/resolver` e voltar ao Dashboard. IF a ENTRADA falha THEN the system SHALL não resolver o alerta e manter o formulário com o erro; IF a resolução falha depois da ENTRADA salva THEN the system SHALL ficar no Estoque com a mensagem `Entrada registrada, mas o alerta não foi resolvido: <mensagem da API>`; IF o operador fecha ou troca o formulário THEN the system SHALL desfazer o atalho, mantendo o alerta ATIVO. (EAP-68, T29)
3. IF dispensar ou resolver é chamado para um alerta que não está ATIVO THEN the system SHALL responder 400 com a mensagem `Alerta <id> não está ativo` sem alterá-lo.
4. IF dispensar ou resolver é chamado com um `id` inexistente THEN the system SHALL responder 404 com a mensagem `Alerta <id> não encontrado`.
5. WHILE o último alerta `REPOSICAO` do material foi dispensado há menos de 5 dias the system SHALL não criar nem reabrir alerta para esse material em nenhuma análise, inclusive o obrigatório.
6. WHILE o último alerta `REPOSICAO` do material foi resolvido pelo operador há menos de 3 dias the system SHALL não criar nem reabrir alerta para esse material; WHILE o último alerta `INFORMATIVO` do material foi resolvido pelo operador há menos de 3 dias the system SHALL recusar novos `INFORMATIVO` para ele e SHALL continuar aceitando e criando alertas `REPOSICAO` (mesma lógica da dispensa, critério 9).
7. WHEN uma análise alerta um material cujo último alerta do mesmo tipo foi resolvido pelo operador há 3 dias ou mais (risco persistente) THEN the system SHALL voltar esse mesmo alerta para ATIVO com os números da análise atual. IF o último alerta do mesmo tipo foi fechado pelo agente (`resolvidoPor = AGENTE`) ou dispensado há 5 dias ou mais THEN the system SHALL criar um registro novo.
8. IF a chamada de dispensar ou resolver falha THEN the system SHALL manter o card e exibir a mensagem da API no padrão `erro` da seção de estoque.
9. WHILE o último alerta `INFORMATIVO` do material foi dispensado há menos de 5 dias the system SHALL recusar novos `INFORMATIVO` para esse material e SHALL continuar aceitando e criando alertas `REPOSICAO` para ele.

**Independent Test**: dispensar o alerta de Cal e rodar a análise de novo: nenhum alerta de Cal por 5 dias (simulado avançando o relógio no teste). Resolver o alerta de Gesso, rodar no dia seguinte (nada) e depois de 3 dias (o mesmo alerta volta ATIVO).

---

### P3: Previsto × utilizado por obra

**User Story**: Como operador, eu quero ver, para cada material previsto numa obra, quanto já saiu e quanto falta, para que eu saiba se a obra está consumindo além do combinado.

**Why P3**: Consulta útil, mas não muda a previsão nem os alertas.

**Acceptance Criteria**:

1. WHEN `GET /obras/:id/materiais-previstos` é chamado THEN the system SHALL responder com uma linha por material previsto contendo `material`, `unidade`, `previsto`, `utilizado`, `pendente` e `excedente`.
2. WHEN o operador abre "Materiais previstos" no card da obra THEN the system SHALL exibir a tabela com as colunas material, previsto, utilizado e situação, acima do formulário de edição.
3. WHEN `pendente > 0` THEN the system SHALL exibir a situação "pendente: N"; WHEN `excedente > 0` THEN the system SHALL exibir "excedente: N"; WHEN os dois são 0 THEN the system SHALL exibir "conforme previsto".
4. IF a obra não tem materiais previstos THEN the system SHALL exibir "Nenhum material previsto" no lugar da tabela.

**Independent Test**: obra com 10 sacos de Cal previstos e 15 de SAIDA para ela: a tabela mostra previsto 10, utilizado 15, "excedente: 5"; e a análise não conta esses 15 no consumo solto.

---

## Edge Cases

- IF não existe nenhum material cadastrado THEN the system SHALL terminar a análise com status `SUCESSO`, zero alertas, e o Dashboard SHALL exibir "Estoque em dia".
- WHEN um material nunca teve movimentação THEN the system SHALL tratá-lo com `ritmoDiario = 0`, gerando alerta só se `saldoLivre < estoqueMinimo`.
- WHEN `saldoLivre = estoqueMinimo` e `ritmoDiario > 0` THEN the system SHALL criar o alerta obrigatório com `diasAteMinimo = 0`.
- IF as devoluções (`ENTRADA` com `obraId`) de uma obra passam das saídas dela para o material THEN the system SHALL tratar o utilizado como 0, sem pendente acima do previsto.
- WHEN um material foi criado há menos de 7 dias THEN the system SHALL usar `diasJanela = 7` no cálculo do ritmo.
- IF uma SAIDA está ligada a uma obra `CANCELADA` THEN the system SHALL não somá-la no consumo solto nem no utilizado que reduz o reservado.
- WHEN uma obra com previsão é concluída ou cancelada THEN the system SHALL deixar de contar o pendente dela no reservado já na próxima análise, sem nenhuma gravação extra.
- IF o reservado é maior que o `saldoAtual` (saldo livre negativo) THEN the system SHALL criar o alerta obrigatório com `sugerido = ceil(ritmoDiario × 30 + estoqueMinimo − saldoLivre)`.
- IF o agente chama `sugerirReposicao` duas vezes para o mesmo material na mesma análise THEN the system SHALL manter 1 alerta, com o tipo e os valores da última chamada aceita.
- IF o agente chama uma ferramenta inexistente ou com argumentos inválidos THEN the system SHALL devolver um resultado de ferramenta com erro, contar a chamada no limite de 20 e continuar o loop.
- IF a Claude API recusa a resposta (`stop_reason = refusal`) THEN the system SHALL tratar a análise como `FALHA` (rede de segurança, sem fechar alertas).
- IF qualquer chamada do Dashboard ou de `Obras.tsx` retornar 401 THEN the system SHALL seguir o comportamento existente de `lib/api.ts` (logout automático).

**Dimensions sweep** (feature Complex):
- Validação/limites: quantidade prevista > 0 com 2 casas, material único por obra, faixa 50–200% da sugestão.
- Falha parcial: status `PARCIAL` mantém sugestões aceitas e roda a rede de segurança; gravações de alertas em `$transaction`.
- Idempotência: 1 alerta ATIVO por material; reexecução atualiza.
- Rate limit: 1 análise manual a cada 5 min (429). Auth: N/A por AD-002 (qualquer usuário autenticado).
- Concorrência: 1 análise por vez (409 manual, agendada pulada), análise travada vira `FALHA` após 5 min.
- Ciclo de vida dos dados: alertas e análises nunca são apagados (histórico, mesma linha da AD-003); silêncio de 5 dias (dispensa) e 3 dias (resolução).
- Observabilidade: passos do agente em `AnaliseEstoque`; uso de tokens fica para o Design.
- Dependência externa: sem chave/erro/recusa/timeout da Claude API → `FALHA` + rede de segurança, API segue de pé.
- Integridade de transições: alerta só sai de ATIVO; previstos travados em `CONCLUIDA`/`CANCELADA`.

---

## Requirement Traceability

| Requirement ID | Story | Phase | Status |
| --- | --- | --- | --- |
| EAP-01 | P1: Análise — cálculo determinístico | T2, T3 | Implementing |
| EAP-02 | P1: Análise — exclusões do consumo solto | T2, T3 | Implementing |
| EAP-03 | P1: Análise — alerta obrigatório (`<=`) | T2, T8 | Implementing |
| EAP-04 | P1: Análise — exceção mínimo 0 | T2 | Implementing |
| EAP-05 | P1: Análise — sugestão aceita | T6 | Implementing |
| EAP-06 | P1: Análise — sugestão recusada | T6 | Implementing |
| EAP-07 | P1: Análise — rede de segurança | T8 | Implementing |
| EAP-08 | P1: Análise — sem chave / falha da API | T5, T7, T9 | Implementing |
| EAP-09 | P1: Análise — limites (PARCIAL) | T7 | Implementing |
| EAP-10 | P1: Análise — nunca movimenta estoque | T7, T8 | Implementing |
| EAP-11 | P1: Análise — marcadores, sem dados de cliente | T4, T6 | Implementing |
| EAP-12 | P1: Análise — troca de marcadores | T4, T8 | Implementing |
| EAP-13 | P1: Análise — marcador inválido | T4 | Implementing |
| EAP-14 | P1: Análise — idempotência | T8 | Implementing |
| EAP-15 | P1: Análise — fechamento automático | T8 | Implementing |
| EAP-16 | P1: Análise — FALHA não fecha alertas | T8 | Implementing |
| EAP-17 | P1: Análise — registro em AnaliseEstoque | T1, T7, T9 | Implementing |
| EAP-18 | P1: Execução — cron 06:00 | T12 | Implementing |
| EAP-19 | P1: Execução — catch-up | T12 | Implementing |
| EAP-20 | P1: Execução — AGENTE_AUTOMATICO=false | T12, T13 | Implementing |
| EAP-21 | P1: Execução — manual (201) | T9, T11 | Implementing |
| EAP-22 | P1: Execução — manual concorrente (409) | T9 | Implementing |
| EAP-23 | P1: Execução — limite manual (429) | T9 | Implementing |
| EAP-24 | P1: Execução — agendada pulada | T9, T12 | Implementing |
| EAP-25 | P1: Execução — análise travada | T9 | Implementing |
| EAP-26 | P1: Dashboard — cards de alerta | T18 | Implementing |
| EAP-27 | P1: Dashboard — números dos campos | T18 | Implementing |
| EAP-28 | P1: Dashboard — situação em dias | T10, T18 | Implementing |
| EAP-29 | P1: Dashboard — selo alerta básico | T18 | Implementing |
| EAP-30 | P1: Dashboard — data da última análise | T18 | Implementing |
| EAP-31 | P1: Dashboard — estado vazio | T18 | Implementing |
| EAP-32 | P1: Dashboard — nunca analisado | T18 | Implementing |
| EAP-33 | P1: Dashboard — aviso FALHA/PARCIAL | T18 | Implementing |
| EAP-34 | P1: Dashboard — erro isolado | T20 | Implementing |
| EAP-35 | P1: Dashboard — botão rodar análise | T19 | Implementing |
| EAP-36 | P1: Dashboard — erro 409/429 | T19 | Implementing |
| EAP-37 | P2: Previstos — criação com obra | T15, T21, T22 | Implementing |
| EAP-38 | P2: Previstos — substituir lista | T14, T16, T21, T23 | Implementing |
| EAP-39 | P2: Previstos — travado em CONCLUIDA/CANCELADA | T14 | Implementing |
| EAP-40 | P2: Previstos — material repetido | T14, T15 | Implementing |
| EAP-41 | P2: Previstos — quantidade inválida | T14 | Implementing |
| EAP-42 | P2: Previstos — material inexistente | T14, T15 | Implementing |
| EAP-43 | P2: Previstos — ação no card | T24 | Implementing |
| EAP-44 | P2: Previstos — sem edição em status final | T24 | Implementing |
| EAP-45 | P2: Previstos — reservado por status | T3 | Implementing |
| EAP-46 | P2: Dispensar/resolver — dispensar | T10, T11, T19 | Implementing |
| EAP-47 | P2: Dispensar/resolver — resolver | T10, T11, T19 | Implementing |
| EAP-48 | P2: Dispensar/resolver — alerta não ativo | T10 | Implementing |
| EAP-49 | P2: Dispensar/resolver — alerta inexistente | T10 | Implementing |
| EAP-50 | P2: Dispensar/resolver — silêncio 5 dias | T6, T8 | Implementing |
| EAP-51 | P2: Dispensar/resolver — tolerância 3 dias | T6, T8 | Implementing |
| EAP-52 | P2: Dispensar/resolver — reabertura | T8 | Implementing |
| EAP-53 | P2: Dispensar/resolver — erro na UI | T19 | Implementing |
| EAP-54 | P3: Previsto × utilizado — endpoint | T14, T16 | Implementing |
| EAP-55 | P3: Previsto × utilizado — tabela no card | T23 | Implementing |
| EAP-56 | P3: Previsto × utilizado — rótulo da situação | T23 | Implementing |
| EAP-57 | P3: Previsto × utilizado — sem previstos | T23 | Implementing |
| EAP-58 | P1: Análise — INFORMATIVO aceito (`calculado <= 0`) | T6 | Implementing |
| EAP-59 | P1: Análise — INFORMATIVO recusado (`calculado > 0`) | T6 | Implementing |
| EAP-60 | P1: Análise — rede de segurança só cria REPOSICAO | T8 | Implementing |
| EAP-61 | P1: Análise — marcador ausente ("Reservado para:") | T4 | Implementing |
| EAP-62 | P1: Dashboard — ícone ⚠️ em REPOSICAO | T18 | Implementing |
| EAP-63 | P1: Dashboard — card INFORMATIVO (ℹ️, sem quantidade) | T18 | Implementing |
| EAP-64 | P2: Previstos — devolução abate o utilizado | T2, T3 | Implementing |
| EAP-65 | P2: Dispensar/resolver — dispensa de INFORMATIVO | T6 | Implementing |
| EAP-66 | P1: Dashboard — carregando a seção ("Carregando alertas...") | T18 | Implementing |
| EAP-67 | P1: Análise — trava de investigação antes de sugerir | T28 | Implementing |
| EAP-68 | P2: Dispensar/resolver — "Resolver" de REPOSICAO leva à ENTRADA no Estoque | T29 | Implementing |

Os IDs seguem a ordem dos critérios dentro de cada story; os critérios acrescentados na rodada 2 receberam EAP-58..65 em vez de renumerar os anteriores; EAP-66 entrou na revisão da Fase 5; EAP-67 entrou depois da primeira execução real (T27), em que o agente só listou e sugeriu o valor calculado, sem investigar; EAP-68 veio do usuário, para "Resolver" não fechar um alerta de compra sem registrar a entrada.

**ID format:** `EAP-NN`

**Status values:** Pending → In Design → In Tasks → Implementing → Verified

**Coverage:** 68 total, 68 mapped to tasks, 0 unmapped (ver `tasks.md`)

---

## Decisão proposta para STATE.md

Texto de **AD-006**, aprovado e gravado no `STATE.md` em 2026-10-27.

- **Decision**: O agente de estoque é um agente LLM com ferramentas (Claude API, modelo configurável via `ANTHROPIC_MODEL`, padrão Haiku 5.5). Ele conduz a análise usando ferramentas somente de leitura e uma única ferramenta de escrita (`sugerirReposicao`), que grava apenas em `AlertaEstoque`. O código valida cada sugestão (faixa de 50% a 200% do cálculo determinístico) e garante os alertas obrigatórios (saldo livre <= mínimo) mesmo sem LLM. O agente nunca grava `MovimentacaoEstoque` nem altera `saldoAtual`. Dados pessoais de clientes nunca são enviados à API (obras vão como marcadores).
- **Reason**: Demonstrar um agente real que decide o que investigar, mantendo números verificáveis, custo controlado (`AGENTE_AUTOMATICO`, limites de 20 chamadas / 2 min) e a feature funcionando sem chave de API.
- **Trade-off**: Resultados não determinísticos entre execuções, testes mais complexos (LLM mockada com roteiros de chamadas de ferramenta) e custo por execução na API.
- **Scope**: `estoque-agente-proativo`.

## Notas para Design/Tasks

- Incluir na fase Tasks uma task para gerar um HTML standalone com o raciocínio (passos gravados em `AnaliseEstoque`) de uma execução **real**, para a apresentação ao professor.
- Dependências novas a confirmar no Design: `@nestjs/schedule` e `@anthropic-ai/sdk`.
- Custo: estimado em menos de US$ 0,01 por análise (Haiku 5.5); confirmar no Console — Usage, 29/10 por volta de 13:25 e 13:44 UTC, 19 requisições. Não bloqueia a T27 nem o Verifier.
- Ambiente (nota para a skill `check-specs`): nesta máquina `python` não está no PATH (nem no Bash nem no PowerShell). O `validate_spec.py` foi rodado com `%LOCALAPPDATA%\Programs\Python\Python313\python.exe`. A skill não foi alterada.

---

## Success Criteria

- [ ] Com o banco do seed e `AGENTE_AUTOMATICO=false`, um clique em "Rodar análise agora" mostra no Dashboard os alertas e a hora da análise
- [ ] Sem `ANTHROPIC_API_KEY`, todo material com saldo livre abaixo do mínimo (ou no mínimo com consumo recente) aparece no Dashboard com o selo "sem agente — alerta básico"
- [ ] Nenhum teste da suíte chama a Claude API, e nenhum cenário testado altera `saldoAtual` ou cria `MovimentacaoEstoque`
- [ ] Rodar a análise duas vezes seguidas nunca deixa mais de 1 alerta ATIVO por material
