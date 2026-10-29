# STATE

## Decisions

### AD-001
- **Decision**: Planta baixa da obra continua sendo um campo de URL (`Obra.plantaBaixaUrl`), sem upload de arquivo pelo sistema.
- **Reason**: Simplicidade — não exige decidir/implementar storage (disco local vs bucket) nem endpoint de upload, e o time não tem prazo apertando essa escolha.
- **Trade-off**: Fica menos fiel à ideia original ("mostrar a planta baixa"); o cliente precisa hospedar o arquivo em outro lugar (Drive, WhatsApp etc.) e mandar o link.
- **Scope**: `front-formularios` (formulário de nova obra); qualquer feature futura que toque planta baixa deve reconsiderar esta decisão antes de adicionar upload.
- **Date**: 2026-09-14
- **Status**: active

### AD-002
- **Decision**: Nenhuma rota é restrita por papel (`Papel.ADMIN` vs `Papel.OPERADOR`) por enquanto — qualquer usuário autenticado pode executar qualquer ação.
- **Reason**: O guard JWT global já cobre autenticação; adicionar autorização por papel agora expandiria o escopo das specs de Gesseiros/Estoque/Formulários sem necessidade imediata da disciplina.
- **Trade-off**: O enum `Papel` fica sem efeito prático no comportamento do sistema (existe no schema, não é checado em nenhuma rota).
- **Scope**: Todas as features atuais (`gesseiros-crud-financeiro`, `estoque-materiais-movimentacao`, `front-formularios`, `front-dashboard-resumo`); uma feature futura de RBAC precisa revisitar cada uma delas.
- **Date**: 2026-09-14
- **Status**: active

### AD-003
- **Decision**: Entidades com histórico financeiro/relacional (a começar por `Gesseiro`) nunca são hard-deletadas — "remover" significa `ativo=false`, preservando a linha e todas as FKs que apontam para ela.
- **Reason**: `Lancamento` e `ObraGesseiro` referenciam `gesseiroId`; apagar a linha órfãos o histórico financeiro (extrato) que é o propósito central do sistema.
- **Trade-off**: Listagens "ativas" precisam sempre filtrar por `ativo=true` explicitamente; o banco acumula registros inativos indefinidamente (sem purge).
- **Scope**: `gesseiros-crud-financeiro` agora; convenção a seguir se `Material` ou `Obra` ganharem um endpoint de remoção no futuro.
- **Date**: 2026-09-14
- **Status**: active

### AD-004
- **Decision**: Seletores de gesseiro no front para ações novas (criar obra, alocar) mostram só gesseiros com `ativo=true`, filtrando no cliente a resposta de `GET /gesseiros`.
- **Reason**: Aplica o AD-003 ("listagens ativas filtram `ativo`") sem alterar o backend desta vez — `GesseirosService.findAll` devolve todos e `ObrasService.alocarGesseiro` não checa `ativo`.
- **Trade-off**: A regra vive só no front; uma chamada direta à API (Swagger) ainda consegue alocar um inativo. Uma feature futura pode mover o filtro/validação para o backend.
- **Scope**: `front-formularios`.
- **Date**: 2026-10-07
- **Status**: active

### AD-005
- **Decision**: O front não oferece alocação de gesseiro em obra `CONCLUIDA` ou `CANCELADA`.
- **Reason**: Os créditos são gerados uma única vez em `ObrasService.concluir()`; alocar depois disso nunca credita o gesseiro e deixa o registro enganoso.
- **Trade-off**: Também só no front — o endpoint `POST /obras/:id/gesseiros` continua aceitando qualquer status.
- **Scope**: `front-formularios`.
- **Date**: 2026-10-07
- **Status**: active

### AD-006
- **Decision**: O agente de estoque é um agente LLM com ferramentas (Claude API, modelo configurável via `ANTHROPIC_MODEL`, padrão Haiku 5.5). Ele conduz a análise usando ferramentas somente de leitura e uma única ferramenta de escrita (`sugerirReposicao`), que grava apenas em `AlertaEstoque`. O código valida cada sugestão (faixa de 50% a 200% do cálculo determinístico) e garante os alertas obrigatórios (saldo livre <= mínimo) mesmo sem LLM. O agente nunca grava `MovimentacaoEstoque` nem altera `saldoAtual`. Dados pessoais de clientes nunca são enviados à API (obras vão como marcadores).
- **Reason**: Demonstrar um agente real que decide o que investigar, mantendo números verificáveis, custo controlado (`AGENTE_AUTOMATICO`, limites de 50 chamadas / 2 min, eram 20 até a AD-008) e a feature funcionando sem chave de API.
- **Trade-off**: Resultados não determinísticos entre execuções, testes mais complexos (LLM mockada com roteiros de chamadas de ferramenta) e custo por execução na API.
- **Scope**: `estoque-agente-proativo`.
- **Date**: 2026-10-27
- **Status**: active

### AD-007
- **Decision**: O status da `Obra` só muda pelos endpoints de transição (`PATCH /obras/:id/fechar`, `/iniciar`, `/concluir`, `/cancelar`); nenhum DTO genérico (`CreateObraDto`, `UpdateObraDto`) aceita `status`. Toda transição é um update condicional ao status de origem (`updateMany` com `where: { id, status: { in: origens } }`) dentro de `$transaction`; `count === 0` vira o 400 de transição inválida.
- **Reason**: Fechar os atalhos que deixavam pular etapas ou concluir sem créditos, e garantir créditos de conclusão uma única vez mesmo com cliques simultâneos, sem lock explícito.
- **Trade-off**: Quem integra pela API precisa chamar uma rota por etapa; mudar o status pelo `PATCH /obras/:id` passa a responder 400.
- **Scope**: `obras-transicoes-status` e qualquer feature futura que mude o status da obra.
- **Date**: 2026-10-29
- **Status**: active

### AD-008
- **Decision**: O teto do loop do agente de estoque sobe de 20 para 50 chamadas de ferramenta por análise (`LIMITE_CHAMADAS_FERRAMENTA`); o prazo de 2 min fica igual.
- **Reason**: Com 8 materiais e o método de investigação obrigatória (EAP-67, EAP-71/72), as análises de 29/10 batiam o limite de 20 em ~23 s e terminavam `PARCIAL` sem ver todos os materiais. Pedido do usuário (2026-10-29).
- **Trade-off**: O pior caso de custo sobe de ~175k para ~1M tokens de entrada por análise (histórico reenviado a cada turno): ~US$ 0,13 no Haiku 5.5. A ~1,1 s por chamada, 50 chamadas cabem nos 2 min, mas com mais materiais o prazo pode passar a ser o limite.
- **Scope**: `estoque-agente-proativo` (spec critério 9 da análise, assumptions "Limites do loop" e "Estimativa de custo").
- **Date**: 2026-10-29
- **Status**: active

## Handoff

- **Feature**: `obras-transicoes-status` em Tasks (2026-10-29), branch `feat/obras-transicoes-status` criado a partir de `main` depois do merge da PR #6 (`estoque-agente-proativo`, verificada: 69/69 EAP `Verified`, `validation.md` PASS na rodada 2).
- **Phase / Task**: Spec, Design e Tasks aprovados (2026-10-29). Execute **adiado pelo usuário** — nenhum código escrito. Ao retomar, começar pela T1.
- **Decisões do usuário (2026-10-29)**: endpoint por ação; confirmação só no concluir (lista quem recebe crédito) e no cancelar; remover gesseiro permitido em obra aberta, inclusive o último de `ANDAMENTO`; "Iniciar obra" sem equipe desabilitado com "Aloque pelo menos um gesseiro para iniciar"; mensagens novas com acento; 404 ao remover gesseiro não alocado; crédito de gesseiro removido fica para a spec futura "remanejamento de gesseiros".
- **Ajuste no agente de estoque (2026-10-29, fora da feature atual)**: T30–T32 / EAP-70..73: materiais usados numa obra sem previsão aparecem na tabela da obra ("não previsto") e o agente sabe de onde veio esse consumo. API 244 testes, web 140. Rastreabilidade em `Implementing` até um novo Verifier.
- **In-progress**: none
- **Next step**: quando o usuário pedir: perguntar se executa direto ou com sub-agentes por fase (3 lotes: 4, 7 e 4 tasks) → Execute (tasks > 8: oferecer sub-agentes por lote de fases) → Verifier independente → `validation.md`.
- **Regras do usuário**: sub-agentes em sequência; sem commit/push/`git add` pelo agente (o usuário commita; entregar pacote com `git add` por arquivo e mensagem em here-string do PowerShell); nenhuma dependência nova sem perguntar; `ANTHROPIC_API_KEY` só no `.env`; nunca mais de uma análise real do agente sem perguntar.
- **Teste e2e no banco de dev (`obras-transicoes-status`)**: cria registros com prefixo `[e2e]` e os apaga num `afterAll`. **Não rodar perto de uma demonstração do agente de estoque**: se a limpeza falhar ou o teste rodar durante uma análise, as obras/gesseiros `[e2e]` entram no snapshot do agente. Depois de rodar, conferir que não sobrou nada com `[e2e]`.
- **Blockers**: none.
- **Uncommitted files**: conferir `git status`. Fora da feature, nunca commitar junto: `CLAUDE.md`, `migration_lock.toml` (só metadado).
- **Dados de teste no banco local**: o usuário fez testes manuais do agente depois da análise `53f2bf02-…`; conferir o estado antes de uma demonstração. Seed (obras `3333…`, `4444…`, `5555…`, `7777…`) e a obra "Moldura - Bairro Centro" (`45fb510c-…`, do usuário).
- **Branch**: feat/obras-transicoes-status
