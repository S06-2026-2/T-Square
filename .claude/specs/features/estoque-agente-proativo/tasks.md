# Estoque — Agente Proativo de Reposição Tasks

## Execution Protocol (MANDATORY -- do not skip)

Implement these tasks with the `tlc-spec-driven` skill: **activate it by name and follow its Execute flow and Critical Rules.** Do not search for skill files by filesystem path. The skill is the source of truth for the full flow (per-task cycle, sub-agent delegation, adequacy review, Verifier, discrimination sensor).

**If the skill cannot be activated, STOP and tell the user - do not proceed without it.**

**Commits:** o time commita manualmente. Cada task traz a mensagem sugerida em `Commit`; o agente não roda `git commit`.

---

**Design**: `.claude/specs/features/estoque-agente-proativo/design.md`
**Status**: Draft

---

## Test Coverage Matrix

> Generated from codebase, project guidelines, and spec - confirm before Execute. Guidelines found: `CLAUDE.md` ("todo service novo precisa de um `.spec.ts` cobrindo os cenários da spec, no estilo de `obras.service.spec.ts`"), `apps/api/package.json` (jest, `testRegex .*\.spec\.ts$`), `apps/web/src/**/*.test.tsx` (13 arquivos, Testing Library), `.github/workflows/ci.yml` (test + build; sem script de lint nos workspaces).

| Code Layer | Required Test Type | Coverage Expectation | Location Pattern | Run Command |
| --- | --- | --- | --- | --- |
| Funções puras de cálculo | unit | Toda fórmula e todo caso de borda da spec (EAP-01..04, 64, edge cases), 1:1 | `apps/api/src/**/*.spec.ts` | `npm run test --workspace apps/api` |
| Service (API) | unit (Prisma e `ClienteLlm` mockados) | Todos os ramos; 1:1 com os EAP da task; casos de borda listados | `apps/api/src/**/*.spec.ts` | `npm run test --workspace apps/api` |
| DTO | unit (`class-validator` `validate()`) | Cada restrição da spec (quantidade > 0, 2 casas, item obrigatório) | `apps/api/src/**/*.spec.ts` | `npm run test --workspace apps/api` |
| Controller / módulo (API) | none | Controller fino só delega (padrão do repo: nenhum teste de controller); build gate | - | build gate |
| Schema / migration / config / env | none | build gate | - | build gate |
| Componente / página (web) | unit (Testing Library, `api` mockado) | Todo EAP de UI da task: estado feliz, vazio, carregando, erro, ações | `apps/web/src/**/*.test.tsx` | `npm run test --workspace apps/web` |
| Helper (web) | unit | Formatos da spec | `apps/web/src/lib/*.test.ts` | `npm run test --workspace apps/web` |
| Script de exportação | unit (função de render pura) | HTML contém passos, marcadores resolvidos e nenhum dado de cliente | `apps/api/src/agente-estoque/relatorio-raciocinio.spec.ts` | `npm run test --workspace apps/api` |

## Gate Check Commands

> Generated from codebase - confirm before Execute.

| Gate Level | When to Use | Command |
| --- | --- | --- |
| Quick | Tasks com testes unitários de um workspace | `npm run test --workspace apps/api` ou `npm run test --workspace apps/web` (o do workspace tocado) |
| Full | Tasks que tocam API e web, ou fim de fase | `npm run test --workspace apps/api && npm run test --workspace apps/web` |
| Build | Schema, config, controller/módulo, fim de fase | `npm run build && npm test` (raiz: build de API e web com `tsc`, depois as duas suítes) |

---

## Execution Plan

Phases are ordered and run sequentially - each phase completes before the next begins, and tasks within a phase execute in order.

### Phase 1: Dados e cálculo

```
T1 → T2 → T3
T4
```

### Phase 2: Agente (núcleo)

```
T5 → T6 → T7 → T8 → T9
```

### Phase 3: API do agente e agendamento

```
T10 → T11 → T12
T13
```

### Phase 4: Materiais previstos (API)

```
T14 → T15 → T16
```

### Phase 5: Dashboard (web)

```
T17 → T18 → T19 → T20
```

### Phase 6: Materiais previstos (web)

```
T21 → T22
T21 → T23 → T24
```

### Phase 7: Demonstração

```
T25 → T27
T26 → T27
```

---

## Task Breakdown

### T1: Modelos, enums e migration

**What**: Acrescentar ao schema os 6 enums e os modelos `MaterialPrevistoObra`, `AnaliseEstoque` e `AlertaEstoque` (com as relações em `Material` e `Obra`) e gerar a migration.
**Where**: `apps/api/prisma/schema.prisma`
**Depends on**: None
**Reuses**: convenções do schema atual (`@@map`, `Decimal(12,2)`)
**Requirement**: EAP-17, EAP-37 (persistência)

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Modelos e enums iguais à seção Data Models do design
- [x] `npm run db:migrate --workspace apps/api -- --name estoque_agente_proativo` gera a migration (banco em `POSTGRES_PORT` local, 5434 nesta máquina)
- [x] `npm run prisma:generate --workspace apps/api` sem erro
- [x] Gate check passes: `npm run build && npm test`

**Tests**: none
**Gate**: build
**Commit**: `feat(db): adiciona modelos de previsto por obra, analise e alerta de estoque`

---

### T2: Funções puras de cálculo

**What**: Implementar `utilizadoObra`, `pendenteObra`, `excedenteObra`, `diasJanela` e `calcularIndicador` com `Prisma.Decimal`.
**Where**: `apps/api/src/estoque/calculo-estoque.ts`
**Depends on**: T1
**Reuses**: nada (fonte única das fórmulas)
**Requirement**: EAP-01, EAP-02, EAP-03, EAP-04, EAP-64

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] `calculo-estoque.spec.ts` cobre: fórmulas B/C/D; `saldoLivre < mínimo` alerta; `= mínimo` com ritmo > 0 alerta com `diasAteMinimo = 0`; `= mínimo` com ritmo 0 não alerta; mínimo 0 + reservado 0 + ritmo 0 não alerta; material criado há < 7 dias usa janela 7; saldo livre negativo; utilizado com devolução e piso 0; excedente; `ceil` exato com decimais (ex.: 0,1 + 0,2)
- [x] Gate check passes: `npm run test --workspace apps/api`
- [x] Test count: suíte da API cresce sem remover testes existentes

**Tests**: unit
**Gate**: quick
**Commit**: `feat(estoque): adiciona funcoes de calculo de saldo livre, ritmo e reposicao`

---

### T3: PrevisaoEstoqueService (snapshot)

**What**: Ler materiais, movimentações, previstos (com status da obra) e últimos alertas, e montar o `SnapshotEstoque` com indicadores, obras que reservam cada material e previsto × utilizado.
**Where**: `apps/api/src/agente-estoque/previsao-estoque.service.ts`
**Depends on**: T2
**Reuses**: `calculo-estoque.ts`; padrão de mock do `obras.service.spec.ts`
**Requirement**: EAP-01, EAP-02, EAP-45, EAP-64

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Spec cobre: SAIDA sem obra conta; SAIDA de obra sem previsão daquele material conta (inclusive `CONCLUIDA`); SAIDA de obra com previsão (até o previsto e excedente) não conta; SAIDA de obra `CANCELADA` não conta; SAIDA fora da janela não conta; pendente só de obras `FECHADA`/`ANDAMENTO`; obra `ORCAMENTO` com previsão não reserva; devolução reduz utilizado; banco sem materiais → snapshot vazio
- [x] Nenhuma chamada de escrita no Prisma mockado
- [x] Gate check passes: `npm run test --workspace apps/api`

**Tests**: unit
**Gate**: quick
**Commit**: `feat(agente-estoque): monta snapshot de indicadores do estoque`

---

### T4: Marcadores de obra

**What**: Implementar `MapaMarcadores` e `finalizarJustificativa` (troca, marcador alterado → padrão, marcador ausente → "Reservado para: …").
**Where**: `apps/api/src/agente-estoque/marcadores-obra.ts`
**Depends on**: None
**Reuses**: nada
**Requirement**: EAP-11, EAP-12, EAP-13, EAP-61

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Spec cobre: numeração estável `{{OBRA_1}}`, `{{OBRA_2}}`; troca pelos títulos; `{{OBRA 12}}` e `{{OBRA_99}}` não emitido → texto padrão com `PADRAO`; texto sem marcador com obras que reservam → mantém + "Reservado para: A, B"; texto sem marcador e sem obras que reservam → mantém como está; `paraJson()` devolve marcador → obraId
- [x] Gate check passes: `npm run test --workspace apps/api`

**Tests**: unit
**Gate**: quick
**Commit**: `feat(agente-estoque): adiciona marcadores de obra para a llm`

---

### T5: ClienteLlm e AnthropicClienteLlm

**What**: Instalar `@anthropic-ai/sdk` e criar a interface `ClienteLlm`, o token `CLIENTE_LLM` e a implementação que lê `ANTHROPIC_API_KEY`/`ANTHROPIC_MODEL` do `ConfigService`.
**Where**: `apps/api/src/agente-estoque/cliente-llm.ts`
**Depends on**: None
**Reuses**: `ConfigModule` global
**Requirement**: EAP-08

**Tools**:

- MCP: NONE
- Skill: `claude-api` (conferir chamadas do SDK antes de escrever)

**Done when**:

- [x] `npm install @anthropic-ai/sdk --workspace apps/api` (com o OK do usuário para instalar dependência)
- [x] Spec cobre: sem chave → `disponivel() = false` e `enviar` nunca constrói o cliente; com chave → usa `ANTHROPIC_MODEL` ou `claude-haiku-5-5`; `signal` repassado (SDK mockado com `jest.mock('@anthropic-ai/sdk')`)
- [x] Nenhum teste faz chamada de rede
- [x] Gate check passes: `npm run test --workspace apps/api`

**Tests**: unit
**Gate**: quick
**Commit**: `feat(agente-estoque): adiciona cliente da claude api atras de interface`

---

### T6: Ferramentas do agente

**What**: Definir as 5 ferramentas (`Anthropic.Tool[]`) e o executor contra o snapshot, incluindo todas as validações de `sugerirReposicao`.
**Where**: `apps/api/src/agente-estoque/ferramentas-agente.ts`
**Depends on**: T5
**Reuses**: `SnapshotEstoque` (T3), `MapaMarcadores` (T4)
**Requirement**: EAP-05, EAP-06, EAP-11, EAP-50, EAP-51, EAP-58, EAP-59, EAP-65

**Tools**:

- MCP: NONE
- Skill: `claude-api`

**Done when**:

- [x] Spec cobre: leituras devolvem só nome, unidade, números e marcadores (nenhum `clienteNome`/`clienteTelefone`/`endereco`/título no JSON); `REPOSICAO` dentro da faixa aceita; abaixo de 50% e acima de 200% recusadas com a faixa no erro; `calculado <= 0` recusa `REPOSICAO` e aceita `INFORMATIVO` sem quantidade; `calculado > 0` recusa `INFORMATIVO`; material com `REPOSICAO` dispensado < 5 dias recusa tudo; resolvido pelo operador < 3 dias recusa; `INFORMATIVO` dispensado < 5 dias recusa só `INFORMATIVO`; segunda sugestão do mesmo material substitui a primeira na lista; material inexistente e input inválido → erro de ferramenta
- [x] Gate check passes: `npm run test --workspace apps/api`

**Tests**: unit
**Gate**: quick
**Commit**: `feat(agente-estoque): adiciona ferramentas de leitura e sugerirReposicao`

---

### T7: Loop do agente com limites

**What**: Implementar em `AgenteEstoqueService` o loop manual (`executarLoop`) com teto de 20 chamadas de ferramenta, prazo de 2 min via `AbortController`, registro de passos e mapeamento de `stop_reason` para status.
**Where**: `apps/api/src/agente-estoque/agente-estoque.service.ts`
**Depends on**: T6
**Reuses**: loop manual da doc do SDK (histórico só acrescentado)
**Requirement**: EAP-08, EAP-09, EAP-10, EAP-17

**Tools**:

- MCP: NONE
- Skill: `claude-api`

**Done when**:

- [x] Spec usa uma `ClienteLlm` de roteiro (lista de respostas com `tool_use`) e cobre: `end_turn` → `SUCESSO`; 21ª chamada de ferramenta não executa → `PARCIAL` com as aceitas mantidas; prazo estourado (relógio fake) → `PARCIAL`; exceção do cliente → `FALHA`; `refusal` e `max_tokens` → `FALHA`; sem chave → loop nem começa, `FALHA`; passos gravados na ordem (ferramenta, entrada, resultado, texto)
- [x] Gate check passes: `npm run test --workspace apps/api`

**Tests**: unit
**Gate**: quick
**Commit**: `feat(agente-estoque): implementa loop do agente com limite de chamadas e tempo`

---

### T8: Persistência, rede de segurança e ciclo de vida dos alertas

**What**: Implementar `persistir` em uma `$transaction`: grava/atualiza sugestões aceitas, cria `REPOSICAO` obrigatórios faltantes, aplica silêncio e reabertura, fecha alertas não repetidos (só `SUCESSO`/`PARCIAL`) e finaliza a análise.
**Where**: `apps/api/src/agente-estoque/agente-estoque.service.ts`
**Depends on**: T7
**Reuses**: `finalizarJustificativa` (T4); padrão `$transaction` de `ObrasService.concluir`
**Requirement**: EAP-03, EAP-07, EAP-10, EAP-12, EAP-14, EAP-15, EAP-16, EAP-50, EAP-51, EAP-52, EAP-60

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Chama `finalizarJustificativa` passando o `textoPadrao` do material e remove o `SPEC_DEVIATION` de `marcadores-obra.ts`
- [x] Spec cobre: obrigatório sem sugestão → `REPOSICAO` com quantidade calculada, texto padrão, `PADRAO`; rede de segurança nunca cria `INFORMATIVO`; reexecução atualiza o ATIVO existente (1 por material); ATIVO não repetido → `RESOLVIDO`/`AGENTE` em `SUCESSO` e `PARCIAL`; `FALHA` não fecha nada; silêncio de 5 e 3 dias respeitado também pela rede de segurança; resolvido há ≥ 3 dias volta o mesmo registro para ATIVO; justificativa passa por `finalizarJustificativa`; `material.update`, `material.updateMany` e `movimentacaoEstoque.create` nunca chamados em nenhum status
- [x] Gate check passes: `npm run test --workspace apps/api`

**Tests**: unit
**Gate**: quick
**Commit**: `feat(agente-estoque): grava alertas com rede de seguranca e fechamento automatico`

---

### T9: Controle de execução da análise

**What**: Implementar `analisar(origem)`: lock em memória, análise travada (> 5 min) vira `FALHA`, 409 manual concorrente, `null` para automática concorrente, 429 manual < 5 min, criação e finalização de `AnaliseEstoque`.
**Where**: `apps/api/src/agente-estoque/agente-estoque.service.ts`
**Depends on**: T8
**Reuses**: exceções HTTP do Nest
**Requirement**: EAP-08, EAP-17, EAP-21, EAP-22, EAP-23, EAP-24, EAP-25

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Spec cobre: manual livre → análise finalizada com origem `MANUAL`; manual durante outra → 409 `Já existe uma análise de estoque em andamento`; automática durante outra → `null` sem criar registro; manual < 5 min da última manual → 429 `Aguarde 5 minutos entre análises manuais`; `EM_ANDAMENTO` > 5 min vira `FALHA` e a nova roda; falha na persistência grava `FALHA` à parte; lock liberado mesmo com exceção
- [x] Gate check passes: `npm run test --workspace apps/api`

**Tests**: unit
**Gate**: quick
**Commit**: `feat(agente-estoque): controla concorrencia e limite da analise manual`

---

### T10: AlertasEstoqueService

**What**: Implementar `listarAtivos`, `dispensar` e `resolver`.
**Where**: `apps/api/src/agente-estoque/alertas-estoque.service.ts`
**Depends on**: None
**Reuses**: padrão de `findOne` + 404 do `ObrasService`
**Requirement**: EAP-46, EAP-47, EAP-48, EAP-49

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Spec cobre: lista só ATIVO com material; `ultimaAnalise` ignora `EM_ANDAMENTO` e é `null` sem análises; dispensar grava `DISPENSADO` + `dispensadoEm`; resolver grava `RESOLVIDO` + `OPERADOR` + `resolvidoEm`; não ativo → 400 `Alerta <id> não está ativo`; inexistente → 404 `Alerta <id> não encontrado`
- [x] Gate check passes: `npm run test --workspace apps/api`

**Tests**: unit
**Gate**: quick
**Commit**: `feat(agente-estoque): lista, dispensa e resolve alertas`

---

### T11: Controller e módulo do agente

**What**: Criar `AgenteEstoqueController` (rotas finas) e `AgenteEstoqueModule` (providers, `CLIENTE_LLM`), e registrar no `AppModule`.
**Where**: `apps/api/src/agente-estoque/agente-estoque.controller.ts`
**Depends on**: T10
**Reuses**: `EstoqueController` (decorators Swagger, `@ApiBearerAuth`)
**Requirement**: EAP-21, EAP-46, EAP-47

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] `POST /api/estoque/agente/analisar` (201), `GET /api/estoque/agente/alertas`, `PATCH .../alertas/:id/dispensar` e `.../resolver` aparecem no Swagger
- [x] Módulo registrado em `app.module.ts`
- [x] Gate check passes: `npm run build && npm test`

**Tests**: none
**Gate**: build
**Commit**: `feat(agente-estoque): expoe rotas do agente e registra o modulo`

---

### T12: Agendador (cron e catch-up)

**What**: Instalar `@nestjs/schedule`, registrar `ScheduleModule.forRoot()` e criar `AgendadorAgenteService` com cron dinâmico às 06:00 `America/Sao_Paulo` e catch-up no boot, só com `AGENTE_AUTOMATICO=true`.
**Where**: `apps/api/src/agente-estoque/agendador-agente.service.ts`
**Depends on**: T11
**Reuses**: `AgenteEstoqueService.analisar`
**Requirement**: EAP-18, EAP-19, EAP-20, EAP-24

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] `npm install @nestjs/schedule --workspace apps/api` (com o OK do usuário); versão compatível com Nest 10 conferida
- [x] Spec cobre: flag `true` → `addCronJob` com `0 0 6 * * *` e fuso `America/Sao_Paulo`; flag `false` ou ausente → nada registrado e nenhum catch-up; última análise há > 24h ou inexistente → `analisar(CATCH_UP)`; há < 24h → não dispara; tick do cron chama `analisar(AGENDADA)`
- [x] Gate check passes: `npm run test --workspace apps/api`

**Tests**: unit
**Gate**: quick
**Commit**: `feat(agente-estoque): agenda analise diaria e catch-up no boot`

---

### T13: Variáveis de ambiente

**What**: Acrescentar `ANTHROPIC_API_KEY=` (vazia), `ANTHROPIC_MODEL=claude-haiku-5-5` e `AGENTE_AUTOMATICO=false` ao `.env.example`, repassá-las ao serviço `api` do `docker-compose.yml` e documentar no README.
**Where**: `.env.example`
**Depends on**: None
**Reuses**: formato atual do `.env.example`
**Requirement**: EAP-20 (configuração), Assumptions "Modelo e chave"

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] `.env.example`, `docker-compose.yml` e seção do README atualizados; `.env` real não é tocado nem commitado
- [x] `docker compose config` mostra as 3 variáveis no serviço `api`
- [x] Gate check passes: `npm run build && npm test`

**Tests**: none
**Gate**: build
**Commit**: `chore(config): adiciona variaveis do agente de estoque`

---

### T14: MateriaisPrevistosService e DTOs

**What**: Criar `MaterialPrevistoDto`/`SubstituirMateriaisPrevistosDto` e o service com `validarItens`, `substituir` e `listarComUtilizado`.
**Where**: `apps/api/src/obras/materiais-previstos.service.ts`
**Depends on**: None
**Reuses**: `calculo-estoque.ts` (T2); validação aninhada de `create-obra.dto.ts`
**Requirement**: EAP-38, EAP-39, EAP-40, EAP-41, EAP-42, EAP-54

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Spec cobre: substituição em `ORCAMENTO`/`FECHADA`/`ANDAMENTO`; lista vazia remove tudo; `CONCLUIDA`/`CANCELADA` → 400 `Não é possível alterar materiais previstos de uma obra com status <STATUS>`; material repetido → 400 sem gravar; material inexistente → 404 sem gravar; obra inexistente → 404; `listarComUtilizado` com pendente, excedente e devolução
- [x] Spec do DTO cobre: `quantidade` 0, negativa e com 3 casas → erro; 0,01 e 2 casas → ok
- [x] Gate check passes: `npm run test --workspace apps/api`

**Tests**: unit
**Gate**: quick
**Commit**: `feat(obras): adiciona servico de materiais previstos por obra`

---

### T15: Criar obra com materiais previstos

**What**: `CreateObraDto.materiaisPrevistos?` e `ObrasService.create` validando os itens e gravando-os aninhados na criação da obra.
**Where**: `apps/api/src/obras/obras.service.ts`
**Depends on**: T14
**Reuses**: `validarItens` (T14); padrão de `gesseiros` aninhados
**Requirement**: EAP-37, EAP-40, EAP-42

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] `obras.service.spec.ts` ganha: criação com previstos grava aninhado; sem previstos mantém o comportamento atual; material repetido/inexistente rejeita antes de criar a obra
- [x] Testes existentes de `ObrasService` continuam passando
- [x] Gate check passes: `npm run test --workspace apps/api`

**Tests**: unit
**Gate**: quick
**Commit**: `feat(obras): aceita materiais previstos na criacao da obra`

---

### T16: Rotas de materiais previstos

**What**: Acrescentar `GET` e `PUT /obras/:id/materiais-previstos` ao `ObrasController` e registrar `MateriaisPrevistosService` no `ObrasModule`.
**Where**: `apps/api/src/obras/obras.controller.ts`
**Depends on**: T15
**Reuses**: estilo das rotas `:id/gesseiros`
**Requirement**: EAP-38, EAP-54

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Rotas no Swagger; `PUT` usa `SubstituirMateriaisPrevistosDto`
- [x] Gate check passes: `npm run build && npm test`

**Tests**: none
**Gate**: build
**Commit**: `feat(obras): expoe rotas de materiais previstos`

---

### T17: Tipos, `api.put` e `dataHora`

**What**: Acrescentar os tipos novos em `types.ts`, `put` em `lib/api.ts` e `dataHora()` em `lib/formato.ts`.
**Where**: `apps/web/src/lib/formato.ts`
**Depends on**: None
**Reuses**: `data()` existente
**Requirement**: EAP-30

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] `formato.test.ts` cobre `dataHora` → `dd/mm/aaaa hh:mm` (fuso fixo no teste) e valor nulo
- [ ] `types.ts` e `api.ts` atualizados; `npm run build --workspace apps/web` sem erro de tipo
- [ ] Gate check passes: `npm run test --workspace apps/web`

**Tests**: unit
**Gate**: quick
**Commit**: `feat(web): adiciona tipos do agente, api.put e formato de data e hora`

---

### T18: Seção e cards de alertas

**What**: Criar `AlertasEstoque` (busca, cabeçalho com última análise e aviso, estados) e `CardAlertaEstoque` (ícone, rótulo, quantidade, situação, selo, justificativa).
**Where**: `apps/web/src/components/AlertasEstoque.tsx`
**Depends on**: T17
**Reuses**: padrão `erro`/"Carregando..." do `Dashboard.tsx`; classes `card`
**Requirement**: EAP-26, EAP-27, EAP-28, EAP-29, EAP-30, EAP-31, EAP-32, EAP-33, EAP-62, EAP-63

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] `AlertasEstoque.test.tsx` cobre: card com material, unidade, quantidade dos campos (mesmo com outro número no texto), justificativa; "abaixo do mínimo", "cruza o mínimo em ~4 dias" (`diasAteMinimo = 4,9`), "sem consumo recente"; selo "sem agente — alerta básico" só em `PADRAO`; ⚠️ em `REPOSICAO`; ℹ️ + "observação do agente" sem quantidade em `INFORMATIVO`; "Estoque em dia"; "Nenhuma análise executada ainda"; aviso `FALHA`/`PARCIAL`; data e hora da última análise; erro da API no padrão `erro`; "Carregando..."
- [ ] Gate check passes: `npm run test --workspace apps/web`

**Tests**: unit
**Gate**: quick
**Commit**: `feat(web): exibe alertas do agente de estoque`

---

### T19: Ações da seção de alertas

**What**: Botão "Rodar análise agora" e botões "Dispensar"/"Resolver" em `AlertasEstoque`, com recarga e tratamento de erro.
**Where**: `apps/web/src/components/AlertasEstoque.tsx`
**Depends on**: T18
**Reuses**: `api.post`/`api.patch`
**Requirement**: EAP-35, EAP-36, EAP-46, EAP-47, EAP-53

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Testes cobrem: clique chama `POST /estoque/agente/analisar`, botão desabilitado até a resposta, recarrega alertas; 409 e 429 mostram a mensagem da API; Dispensar/Resolver chamam o `PATCH` certo e removem o card; falha mantém o card e mostra o erro
- [ ] Gate check passes: `npm run test --workspace apps/web`

**Tests**: unit
**Gate**: quick
**Commit**: `feat(web): roda analise e dispensa ou resolve alertas pelo dashboard`

---

### T20: Integrar alertas ao Dashboard

**What**: Renderizar `<AlertasEstoque />` no `Dashboard.tsx` e ajustar o mock de `Dashboard.test.tsx` para responder por caminho.
**Where**: `apps/web/src/pages/Dashboard.tsx`
**Depends on**: T19
**Reuses**: `Dashboard.tsx` atual
**Requirement**: EAP-34

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Testes DSH-01..03 existentes continuam passando
- [ ] Novo teste: erro em `/estoque/agente/alertas` mostra o erro só na seção de estoque e mantém os cards do funil; erro em `/obras/resumo` não esconde a seção de estoque
- [ ] Gate check passes: `npm run test --workspace apps/web`

**Tests**: unit
**Gate**: quick
**Commit**: `feat(web): adiciona secao do agente de estoque ao dashboard`

---

### T21: Editor de itens de materiais previstos

**What**: Criar `ItensMateriaisPrevistos`, editor controlado de linhas (material + quantidade + remover + adicionar) que não deixa repetir material.
**Where**: `apps/web/src/components/forms/ItensMateriaisPrevistos.tsx`
**Depends on**: None (usa os tipos de T17, já concluída na fase 5)
**Reuses**: estilo dos campos de `NovaObraForm`
**Requirement**: EAP-37, EAP-38, EAP-40

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Testes cobrem: adicionar, remover, editar quantidade; material já escolhido não aparece nas outras linhas; `onChange` recebe `{ materialId, quantidade }[]`
- [ ] Gate check passes: `npm run test --workspace apps/web`

**Tests**: unit
**Gate**: quick
**Commit**: `feat(web): adiciona editor de materiais previstos`

---

### T22: Seção "Materiais previstos" na criação de obra

**What**: Incluir `ItensMateriaisPrevistos` no `NovaObraForm` (carregando `GET /estoque/materiais`) e enviar `materiaisPrevistos` no `POST /obras`.
**Where**: `apps/web/src/components/forms/NovaObraForm.tsx`
**Depends on**: T21
**Reuses**: `NovaObraForm` atual
**Requirement**: EAP-37

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Testes: obra com itens envia `materiaisPrevistos`; obra sem itens não envia o campo; testes existentes do formulário passam
- [ ] Gate check passes: `npm run test --workspace apps/web`

**Tests**: unit
**Gate**: quick
**Commit**: `feat(web): permite prever materiais ao criar obra`

---

### T23: MateriaisPrevistosForm (tabela e edição)

**What**: Criar o formulário do card: tabela previsto × utilizado (`GET`) e, em status editável, o editor com `PUT`.
**Where**: `apps/web/src/components/forms/MateriaisPrevistosForm.tsx`
**Depends on**: T21
**Reuses**: `ItensMateriaisPrevistos` (T21); padrão do `AlocarGesseiroForm`
**Requirement**: EAP-55, EAP-56, EAP-57, EAP-38

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Testes cobrem: colunas material, previsto, utilizado, situação; "12 pendentes", "+5 além do previsto", "conforme previsto"; "Nenhum material previsto"; salvar chama `PUT /obras/:id/materiais-previstos` e recarrega; erro da API no formulário; em `CONCLUIDA` só a tabela, sem editor
- [ ] Gate check passes: `npm run test --workspace apps/web`

**Tests**: unit
**Gate**: quick
**Commit**: `feat(web): mostra previsto x utilizado e edita materiais da obra`

---

### T24: Ação "Materiais previstos" no card da obra

**What**: Acrescentar `<details><summary>Materiais previstos</summary>` no card de `Obras.tsx`, com o formulário editável só em `ORCAMENTO`/`FECHADA`/`ANDAMENTO`.
**Where**: `apps/web/src/pages/Obras.tsx`
**Depends on**: T23
**Reuses**: bloco "Alocar gesseiro" do mesmo arquivo
**Requirement**: EAP-43, EAP-44

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] `Obras.test.tsx` ganha: ação presente nos 3 status editáveis com editor; em `CONCLUIDA`/`CANCELADA` sem editor; testes existentes passam
- [ ] Gate check passes: `npm run test --workspace apps/api && npm run test --workspace apps/web`

**Tests**: unit
**Gate**: full
**Commit**: `feat(web): adiciona materiais previstos ao card da obra`

---

### T25: Seed de demonstração

**What**: Estender o seed com saídas recentes, uma obra `FECHADA` com material previsto e um material no mínimo, para que um clique em "Rodar análise agora" mostre alertas.
**Where**: `apps/api/prisma/seed.ts`
**Depends on**: None
**Reuses**: `upsert` atual dos materiais
**Requirement**: Success Criteria ("com o banco do seed…")

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Seed idempotente (rodar duas vezes não duplica movimentações)
- [ ] Com o seed e sem chave, `POST /estoque/agente/analisar` gera pelo menos 1 alerta obrigatório
- [ ] Gate check passes: `npm run build && npm test`

**Tests**: none
**Gate**: build
**Commit**: `chore(seed): adiciona cenario de demonstracao do agente de estoque`

---

### T26: Script de exportação do raciocínio em HTML

**What**: Criar o script que lê uma `AnaliseEstoque` (por id ou a mais recente com passos) e gera um HTML standalone com os passos do agente, as ferramentas chamadas, as conclusões e a legenda dos marcadores.
**Where**: `apps/api/src/agente-estoque/relatorio-raciocinio.ts` (+ `.spec.ts`; render puro, testado no jest normal) e `apps/api/scripts/exportar-raciocinio.ts` (só a casca: lê a análise, chama o render, grava o arquivo); `.gitignore` (acrescentar `apps/api/tmp/`)
**Depends on**: None
**Reuses**: `passos` e `marcadores` gravados (T7/T8)
**Requirement**: Notas para Design/Tasks (apresentação)

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Função `renderizarRaciocinio(analise, titulosObras)` pura; spec cobre: um bloco por passo na ordem, marcadores trocados pelo título só na legenda, nenhum `clienteNome`/telefone/endereço no HTML, HTML sem recursos externos (CSS inline)
- [ ] `renderizarRaciocinio` vive em `src/agente-estoque/relatorio-raciocinio.ts`; o script em `scripts/` não tem lógica de render
- [ ] Script npm `agente:exportar` em `apps/api/package.json`, gravando em `apps/api/tmp/` (pasta ignorada pelo Git; `apps/api/tmp/` adicionada ao `.gitignore`)
- [ ] Gate check passes: `npm run test --workspace apps/api`

**Tests**: unit
**Gate**: quick
**Commit**: `feat(agente-estoque): exporta raciocinio de uma analise em html`

---

### T27: Execução real e HTML para a apresentação

**What**: Com `ANTHROPIC_API_KEY` configurada pelo usuário no `.env` local, rodar uma análise real sobre o seed de demonstração e gerar o HTML com `agente:exportar`.
**Where**: `apps/api/tmp/raciocinio-execucao-real.html` (fora do Git); custo medido anotado no `spec.md` (Assumptions)
**Depends on**: T25, T26
**Reuses**: T25 (dados), T26 (script)
**Requirement**: Notas para Design/Tasks (apresentação ao professor)

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Passo manual do usuário: colocar a chave no `.env` (nunca commitado) e `docker restart gesso_api`
- [ ] Análise real termina `SUCESSO` ou `PARCIAL`; `response.usage` anotado para confirmar a estimativa de custo da spec
- [ ] HTML gerado, aberto no navegador e revisado (sem dado de cliente)
- [ ] Gate check passes: `npm run build && npm test`

**Tests**: none
**Gate**: build
**Commit**: `docs(agente-estoque): registra custo medido na execucao real do agente` (o HTML não é commitado)

---

## Phase Execution Map

Fases em sequência; dentro de cada fase, as tasks rodam na ordem numérica.

| Fase | Tasks | Batch sugerido |
| --- | --- | --- |
| 1. Dados e cálculo | T1, T2, T3, T4 | Batch 1 (fases 1–2, 9 tasks) |
| 2. Agente (núcleo) | T5, T6, T7, T8, T9 | Batch 1 |
| 3. API do agente e agendamento | T10, T11, T12, T13 | Batch 2 (fases 3–4, 7 tasks) |
| 4. Materiais previstos (API) | T14, T15, T16 | Batch 2 |
| 5. Dashboard (web) | T17, T18, T19, T20 | Batch 3 (fases 5–6, 8 tasks) |
| 6. Materiais previstos (web) | T21, T22, T23, T24 | Batch 3 |
| 7. Demonstração | T25, T26, T27 | Batch 4 (3 tasks; T27 tem passo manual) |

---

## Task Granularity Check

| Task | Scope | Status |
| --- | --- | --- |
| T1 | 1 arquivo de schema (+ migration gerada) | ✅ |
| T2 | 1 módulo de funções puras | ✅ |
| T3 | 1 service | ✅ |
| T4 | 1 módulo (mapa + finalização de texto) | ✅ |
| T5 | 1 interface + 1 implementação no mesmo arquivo | ⚠️ coeso |
| T6 | 1 módulo de ferramentas | ✅ |
| T7 | 1 método (loop) | ✅ |
| T8 | 1 método (persistência) | ✅ |
| T9 | 1 método (`analisar`) | ✅ |
| T10 | 1 service | ✅ |
| T11 | controller + módulo + registro | ⚠️ coeso (fiação, sem regra) |
| T12 | 1 service + `ScheduleModule.forRoot()` | ⚠️ coeso |
| T13 | env + compose + README | ⚠️ coeso (só configuração) |
| T14 | 1 service + DTOs | ⚠️ coeso |
| T15 | 1 método + campo do DTO | ✅ |
| T16 | 2 rotas + registro no módulo | ✅ |
| T17 | 1 helper + tipos + `put` | ⚠️ coeso (fundação do front) |
| T18 | seção + card | ⚠️ coeso |
| T19 | ações da seção | ✅ |
| T20 | 1 página | ✅ |
| T21 | 1 componente | ✅ |
| T22 | 1 formulário | ✅ |
| T23 | 1 formulário | ✅ |
| T24 | 1 página | ✅ |
| T25 | 1 seed | ✅ |
| T26 | 1 script | ✅ |
| T27 | 1 execução + 1 artefato | ✅ |

---

## Diagram-Definition Cross-Check

| Task | Depends On (task body) | Diagram Shows | Status |
| --- | --- | --- | --- |
| T1 | None | início da fase 1 | ✅ |
| T2 | T1 | T1 → T2 | ✅ |
| T3 | T2 | T2 → T3 | ✅ |
| T4 | None | T4 isolado | ✅ |
| T5 | None | início da fase 2 | ✅ |
| T6 | T5 | T5 → T6 | ✅ |
| T7 | T6 | T6 → T7 | ✅ |
| T8 | T7 | T7 → T8 | ✅ |
| T9 | T8 | T8 → T9 | ✅ |
| T10 | None | início da fase 3 | ✅ |
| T11 | T10 | T10 → T11 | ✅ |
| T12 | T11 | T11 → T12 | ✅ |
| T13 | None | T13 isolado | ✅ |
| T14 | None | início da fase 4 | ✅ |
| T15 | T14 | T14 → T15 | ✅ |
| T16 | T15 | T15 → T16 | ✅ |
| T17 | None | início da fase 5 | ✅ |
| T18 | T17 | T17 → T18 | ✅ |
| T19 | T18 | T18 → T19 | ✅ |
| T20 | T19 | T19 → T20 | ✅ |
| T21 | None (T17 na fase 5) | início da fase 6 | ✅ |
| T22 | T21 | T21 → T22 | ✅ |
| T23 | T21 | T21 → T23 | ✅ |
| T24 | T23 | T23 → T24 | ✅ |
| T25 | None | início da fase 7 | ✅ |
| T26 | None | T26 → T27 | ✅ |
| T27 | T25, T26 | T25 → T27, T26 → T27 | ✅ |

Dependências entre fases (todas para trás): T3 usa o snapshot de T2; T6 usa T3/T4; T10 usa os modelos de T1; T14 usa `calculo-estoque` de T2; T26 lê `passos` gravados por T7/T8.

---

## Test Co-location Validation

| Task | Code Layer Created/Modified | Matrix Requires | Task Says | Status |
| --- | --- | --- | --- | --- |
| T1 | Schema / migration | none | none | ✅ |
| T2 | Funções puras | unit | unit | ✅ |
| T3 | Service | unit | unit | ✅ |
| T4 | Funções puras | unit | unit | ✅ |
| T5 | Service (cliente) | unit | unit | ✅ |
| T6 | Funções/serviço de ferramentas | unit | unit | ✅ |
| T7 | Service | unit | unit | ✅ |
| T8 | Service | unit | unit | ✅ |
| T9 | Service | unit | unit | ✅ |
| T10 | Service | unit | unit | ✅ |
| T11 | Controller / módulo | none | none | ✅ |
| T12 | Service | unit | unit | ✅ |
| T13 | Config / env | none | none | ✅ |
| T14 | Service + DTO | unit | unit | ✅ |
| T15 | Service + DTO | unit | unit | ✅ |
| T16 | Controller / módulo | none | none | ✅ |
| T17 | Helper + tipos (web) | unit | unit | ✅ |
| T18 | Componente | unit | unit | ✅ |
| T19 | Componente | unit | unit | ✅ |
| T20 | Página | unit | unit | ✅ |
| T21 | Componente | unit | unit | ✅ |
| T22 | Componente | unit | unit | ✅ |
| T23 | Componente | unit | unit | ✅ |
| T24 | Página | unit | unit | ✅ |
| T25 | Seed (config/dados) | none | none | ✅ |
| T26 | Script (render puro) | unit | unit | ✅ |
| T27 | Artefato de documentação | none | none | ✅ |

---

## Cobertura dos requisitos

| Requisitos | Tasks |
| --- | --- |
| EAP-01, 02 | T2, T3 |
| EAP-03 | T2, T8 |
| EAP-04 | T2 |
| EAP-05, 06, 18, 19, 58, 59, 65 | T6 |
| EAP-07, 14, 15, 16, 52, 60 | T8 |
| EAP-08 | T5, T7, T9 |
| EAP-09 | T7 |
| EAP-10 | T7, T8 |
| EAP-11 | T4, T6 |
| EAP-12 | T4, T8 |
| EAP-13, 61 | T4 |
| EAP-17 | T1, T7, T9 |
| EAP-18, 19 | T12 |
| EAP-20 | T12, T13 |
| EAP-21 | T9, T11 |
| EAP-22, 23, 25 | T9 |
| EAP-24 | T9, T12 |
| EAP-26..33, 62, 63 | T18 |
| EAP-34 | T20 |
| EAP-35, 36, 53 | T19 |
| EAP-37 | T15, T21, T22 |
| EAP-38 | T14, T16, T21, T23 |
| EAP-39, 41 | T14 |
| EAP-40, 42 | T14, T15 |
| EAP-43, 44 | T24 |
| EAP-45 | T3 |
| EAP-46, 47 | T10, T11, T19 |
| EAP-48, 49 | T10 |
| EAP-50, 51 | T6, T8 |
| EAP-54 | T14, T16 |
| EAP-55, 56, 57 | T23 |
| EAP-64 | T2, T3 |

65 de 65 requisitos mapeados.
