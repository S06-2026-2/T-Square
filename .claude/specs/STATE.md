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
- **Reason**: Demonstrar um agente real que decide o que investigar, mantendo números verificáveis, custo controlado (`AGENTE_AUTOMATICO`, limites de 20 chamadas / 2 min) e a feature funcionando sem chave de API.
- **Trade-off**: Resultados não determinísticos entre execuções, testes mais complexos (LLM mockada com roteiros de chamadas de ferramenta) e custo por execução na API.
- **Scope**: `estoque-agente-proativo`.
- **Date**: 2026-10-27
- **Status**: active

## Handoff

- **Feature**: `estoque-agente-proativo` em Execute (2026-10-28)
- **Phase / Task**: T1–T29 concluídas e verificadas. Verifier independente: rodada 1 FAIL só por lacunas de teste (3 mutantes sobreviventes); rodada 2 PASS, com 69/69 EAP com evidência e 23/23 mutantes mortos (`validation.md`).
- **Completed**:
  - Fases 1–2 em `b5e2ba6`; Fases 3–4 em `a6e6522` (branch `feat/agente-estoque`).
  - Fases 5–6 (T17–T24), ajustes da revisão da Fase 5 (EAP-66), T25 e T26 em `f7e6664`. Depois: texto "pendente: N" / "excedente: N" na situação do previsto x utilizado (sem commit).
  - T28: listarMateriais só com visão geral e risco, calculado e faixa em consumoDoMaterial, trava de investigação no sugerirReposicao, prompt novo e seed com "Massa para drywall" (SEM_RISCO, obra ANDAMENTO acima do previsto).
  - T29: "Resolver" de REPOSICAO leva à ENTRADA no Estoque e resolve o alerta depois de salvar (EAP-68). Ajustes de front pedidos pelo usuário: card do agente sem a linha de saldo livre, justificativa atrás de um "+", grade sem esticar os vizinhos; Dashboard sem o subtítulo do funil.
  - Verifier: 4 testes acrescentados na rodada 2 (alerta fechado pelo AGENTE, janela real no texto sem consumo, fronteira de 7 dias, zero materiais); a regra de previsão em até 7 dias virou o critério EAP-69. Remoção do subtítulo registrada na spec `front-dashboard-resumo`.
  - Rastreabilidade com os 69 EAP em `Verified`. API 236 testes, web 137, builds ok.
- **In-progress**: none
- **Next step**: commit do usuário (testes da rodada 2, EAP-69, spec do dashboard, `validation.md`, STATE) → push → PR da `feat/agente-estoque` → depois a spec `obras-transicoes-status` num branch novo.
- **Regras do usuário**: sub-agentes em sequência; sem commit/push/`git add` pelo agente; nenhuma dependência nova sem perguntar; `ANTHROPIC_API_KEY` só no `.env`.
- **Blockers**: none.
- **Uncommitted files**: conferir `git status`. Fora da feature, nunca commitar junto: `CLAUDE.md`, `migration_lock.toml` (só metadado, conteúdo igual), `.claude/specs/features/obras-transicoes-status/`.
- **Dados de teste no banco local**: 1 análise (`53f2bf02-…`, SUCESSO, execução final da T27) e os 5 alertas dela (4 REPOSICAO + 1 INFORMATIVO); dados do seed (obras `3333…`, `4444…`, `5555…`, `7777…`, materiais e movimentações) e a obra "Moldura - Bairro Centro" (`45fb510c-…`, do usuário).
- **Branch**: feat/agente-estoque
