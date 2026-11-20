# Arquivar e Limpar Registros Tasks

**Spec**: `spec.md` · **Design**: `design.md` · **Status**: Draft (2026-11-20), aguarda aprovação

**Base**: branch `feat/obras-transicoes-status` depois dos commits de 2026-11-19. API 397 testes,
web 371, e2e 19, `audit:responsive` 126/126, `audit:pwa` 14/14.

**Gates**:
- Quick: `npm run test --workspace apps/api` ou `--workspace apps/web`.
- Full: Quick + `docker exec gesso_api npm run test:e2e -- --runInBand` e conferir que não ficou `[e2e]` no banco.
- Build: `npm run build && npm test`.
- Browser: build web, `npx vite preview --port 4173`, `npm run audit:responsive --workspace apps/web` → `medidos: 158/158, nao montados: 0, falhas: 0`, e `audit:pwa` 14/14.

Depois de mudar `apps/api/src/**`, rodar `docker restart gesso_api`. Depois de mudar `apps/web/src/**`, rodar `docker restart gesso_web` (OneDrive).

## Execution Plan

```
Phase 1 (API base):        T1 → T2 → T3
Phase 2 (API arquivar):    T4 → T5 → T6 → T7 → T8 → T9 → T10
Phase 3 (Web):             T11 → T12 → T13 → T14 → T15 → T16 → T17
```

## Task Breakdown

### Phase 1: Base da API

#### T1: Schema e migration

**What**: Adicionar `arquivadoEm DateTime?` em `Obra`, `Gesseiro` e `Material`, e `valorRecebido Decimal @default(0) @db.Decimal(12,2)` em `Obra`, com comentário `///`. Migration só com `ADD COLUMN`.
**Where**: `apps/api/prisma/schema.prisma`, `apps/api/prisma/migrations/<ts>_arquivamento/`
**Depends on**: None
**Requirement**: ARQ-01, ARQ-03, ARQ-09, ARQ-11 (base)

**Done when**:
- [ ] Migration aplicada no banco local, sem perder dados (seed e "Moldura - Bairro Centro" continuam lá); obras existentes com `valorRecebido = 0`
- [ ] `gesso_api` reiniciado, `/api/health` 200
- [ ] Gate check passes: `npm run build && npm test`

**Tests**: none (schema; coberto pelo build e pelos testes das tasks seguintes) · **Gate**: build

#### T2: Saldo compartilhado

**What**: `saldosPorGesseiro(cliente, ids)` em `gesseiros/saldo.ts`; `GesseirosService.extrato()` passa a usá-la.
**Where**: `apps/api/src/gesseiros/saldo.ts`, `gesseiros.service.ts`
**Depends on**: T1
**Requirement**: ARQ-03, ARQ-09 (base)

**Done when**:
- [ ] `saldo.spec.ts`: créditos − vales − pagamentos por id; id sem lançamento → 0; vários ids num `groupBy` só
- [ ] Testes de `extrato` existentes passam sem mudança
- [ ] Gate check passes: `npm run test --workspace apps/api`

**Tests**: unit · **Gate**: quick

#### T3: Valor recebido do cliente

**What**: `valorRecebido` no `UpdateObraDto` (não no Create) e a checagem contra `valorTotal` no `update`.
**Where**: `apps/api/src/obras/dto/update-obra.dto.ts`, `obras.service.ts`
**Depends on**: T1
**Requirement**: ARQ-01

**Done when**:
- [ ] DTO: negativo, não numérico e mais de 2 casas → erro; 0 e 1500.50 passam; `CreateObraDto` com `valorRecebido` → `whitelistValidation`
- [ ] Service: valor ≤ total grava; > total → 400 com a mensagem exata; diminuir `valorTotal` para baixo do recebido → 400; sem alteração no banco nos 400
- [ ] Gate check passes: `npm run test --workspace apps/api`

**Tests**: unit · **Gate**: quick

### Phase 2: Arquivar, restaurar e limpar na API

#### T4: Situação e arquivamento da obra

**What**: `situacaoArquivamento(id, tx?)`, `arquivar(id)` e `restaurar(id)`, condicionais, conforme o design.
**Where**: `obras.service.ts`
**Depends on**: T2, T3
**Requirement**: ARQ-03, ARQ-07 (obra), ARQ-15

**Done when**:
- [ ] Situação: concluída/quitada/sem pendente → `podeArquivar: true`; cada condição falhando sozinha → `false` com o campo certo; o pendente traz `nome` e `saldo`; equipe vazia passa
- [ ] Arquivar: as 3 mensagens exatas, na ordem concluída → cliente → gesseiros; sucesso faz `updateMany` com `where { id, status: CONCLUIDA, arquivadoEm: null }` no `tx` (não no `prisma`); `count 0` → `A obra já está arquivada`; 404
- [ ] Restaurar: condicional; não arquivada → 400 com a mensagem exata; inexistente → 404
- [ ] Gate check passes: `npm run test --workspace apps/api`

**Tests**: unit · **Gate**: quick

#### T5: Listas, rotas da obra e fim do hard delete

**What**: Filtro `arquivadoEm` em `findAll`/`resumo`, `?arquivados=true`, rotas `GET :id/arquivamento`, `PATCH :id/arquivar|restaurar`; remover `remove()` e `DELETE /obras/:id`.
**Where**: `obras.service.ts`, `obras.controller.ts`, `dto/query-obra.dto.ts`
**Depends on**: T4
**Requirement**: ARQ-04, ARQ-06 (obra)

**Done when**:
- [ ] `findAll` sem flag → `arquivadoEm: null`; com flag → `{ not: null }`, ordenado por `arquivadoEm desc`; combinado com `status`
- [ ] `resumo` sem arquivadas; `QueryObraDto` aceita `arquivados=true|false`
- [ ] Swagger com as rotas novas e sem `DELETE /obras/{id}` (depois de `docker restart gesso_api`)
- [ ] Gate check passes: `npm run build && npm test`

**Tests**: unit · **Gate**: build

#### T6: Arquivar gesseiro

**What**: `arquivar`/`restaurar`/`findAll(arquivados)`, rotas, recusa de arquivado no `alocarGesseiro`; remover `desativar()` e `DELETE /gesseiros/:id`.
**Where**: `gesseiros.service.ts`, `gesseiros.controller.ts`, `obras.service.ts` (`alocarGesseiro`)
**Depends on**: T2
**Requirement**: ARQ-06, ARQ-07, ARQ-09, ARQ-10 (API)

**Done when**:
- [ ] Saldo positivo e negativo → 400 com o valor em BRL; obra aberta → 400 com os títulos; sucesso grava `arquivadoEm` e `ativo=false` condicional; repetir → 400
- [ ] Restaurar volta `ativo=true`; listas filtradas; alocar arquivado → 400 com a mensagem exata
- [ ] Testes antigos do `desativar` removidos junto com o método (o motivo vai no commit)
- [ ] Gate check passes: `npm run build && npm test`

**Tests**: unit · **Gate**: build

#### T7: Arquivar material

**What**: `arquivarMaterial`/`restaurarMaterial`, `listarMateriais(arquivados)`, 409 do nome, bloqueio em `movimentar` e `validarItens`, rotas.
**Where**: `estoque.service.ts`, `estoque.controller.ts`, `obras/materiais-previstos.service.ts`
**Depends on**: T1
**Requirement**: ARQ-06, ARQ-07, ARQ-11 (AC1, AC3), ARQ-12 (AC4)

**Done when**:
- [ ] Arquivar com qualquer saldo; repetir → 400; restaurar condicional
- [ ] `listarMateriais` e `abaixoDoMinimo` sem arquivados
- [ ] Movimentação e previsto com material arquivado → 400 `O material <nome> está arquivado`, sem gravar
- [ ] `POST /estoque/materiais` com nome de arquivado → 409 com a mensagem exata; nome de ativo → comportamento atual
- [ ] Gate check passes: `npm run build && npm test`

**Tests**: unit · **Gate**: build

#### T8: Agente e alertas sem material arquivado

**What**: Filtro `arquivadoEm: null` no snapshot do agente e nas consultas de alertas.
**Where**: `agente-estoque/previsao-estoque.service.ts`, `agente-estoque/alertas-estoque.service.ts`
**Depends on**: T7
**Requirement**: ARQ-11 (AC2)

**Done when**:
- [ ] Specs do agente e dos alertas conferem o `where` com o filtro (mesma técnica de `consulta = findMany.mock.calls[0][0]` já usada)
- [ ] Nenhuma análise real do agente é disparada (regra do usuário)
- [ ] Gate check passes: `npm run test --workspace apps/api`

**Tests**: unit · **Gate**: quick

#### T9: Job de limpeza

**What**: Módulo `limpeza` com `LimpezaService.limpar(agora)` e `@Cron` diário às 3h, conforme o design.
**Where**: `apps/api/src/limpeza/`, `app.module.ts`
**Depends on**: T5, T6, T7
**Requirement**: ARQ-13, ARQ-15 (restaurar durante a limpeza)

**Done when**:
- [ ] `limite = agora − 7 dias` (teste com relógio fixo: 7 dias exatos entra, 6d23h não)
- [ ] Obra: `obraId → null` em lançamentos e movimentações **antes** do delete, no mesmo `tx`
- [ ] Gesseiro: alocações apagadas antes; material: previstos apagados antes
- [ ] Reconferência com `count 0` → pula sem apagar nada
- [ ] Erro numa transação → log e segue; o retorno conta as falhas
- [ ] Ordem obras → gesseiros → materiais
- [ ] Gate check passes: `npm run build && npm test`

**Tests**: unit · **Gate**: build

#### T10: e2e de arquivamento e limpeza

**What**: `test/arquivamento.e2e-spec.ts` no Postgres, com o prefixo `[e2e]` e limpeza no `afterAll`.
**Where**: `apps/api/test/arquivamento.e2e-spec.ts`
**Depends on**: T9
**Requirement**: ARQ-03, ARQ-13, ARQ-15

**Done when**:
- [ ] Fluxo pelas rotas: obra concluída com 1 gesseiro, PAGAMENTO do crédito, `valorRecebido` total, `GET :id/arquivamento` com `podeArquivar`
- [ ] Dois `arquivar` em paralelo → `[200, 400]`
- [ ] `arquivadoEm` recuado 8 dias + `limpar()` → obra apagada, lançamentos do gesseiro com `obraId null`, saldo e soma de créditos iguais aos de antes
- [ ] Obra com 6 dias não é apagada; restaurada antes do job continua lá
- [ ] Gesseiro arquivado com 8 dias é apagado junto com os lançamentos
- [ ] Zero `[e2e]` no banco depois (psql)
- [ ] Gate check passes: Full

**Tests**: e2e · **Gate**: full

### Phase 3: Web

#### T11: Tipos e helpers

**What**: `arquivadoEm` (3 tipos), `valorRecebido`, `SituacaoArquivamento` em `types.ts`; `dataLimpeza()` em `lib/formato.ts`.
**Depends on**: T5
**Requirement**: ARQ-08 (base)

**Done when**:
- [ ] `formato.test.ts`: `dataLimpeza('2026-11-20T15:00:00Z')` → `27/11/2026`; `null` → `-`
- [ ] Gate check passes: `npm run test --workspace apps/web`

**Tests**: unit · **Gate**: quick

#### T12: Valor recebido no card

**What**: `ValorRecebidoForm` no card de toda obra.
**Where**: `components/forms/ValorRecebidoForm.tsx`, `pages/Obras.tsx`
**Depends on**: T11
**Requirement**: ARQ-02

**Done when**:
- [ ] Mostra "Recebido R$ X de R$ Y"; salvar → `PATCH /obras/:id` com `{ valorRecebido }` e recarrega; erro da API no form; campo com `min=0`, `max=valorTotal`, `step=0.01`
- [ ] Gate check passes: `npm run test --workspace apps/web`

**Tests**: unit · **Gate**: quick

#### T13: Arquivar obra

**What**: Componente `ArquivarObra` (painel com as duas confirmações) nos cards `CONCLUIDA`.
**Where**: `components/ArquivarObra.tsx`, `pages/Obras.tsx`
**Depends on**: T12
**Requirement**: ARQ-05

**Done when**:
- [ ] Só em `CONCLUIDA`; abrir busca `GET /obras/:id/arquivamento`
- [ ] "Gesseiros pagos" ✔ ou `<nome> — <saldo>`; "Cliente pagou R$ X de R$ Y"; "Arquivar" só com `podeArquivar`
- [ ] Sucesso → card sai da lista (recarga); HTTP → mensagem no painel + recarga; rede → `SEM_CONEXAO_ENVIO`, 1 PATCH só depois de esperar
- [ ] Gate check passes: `npm run test --workspace apps/web`

**Tests**: unit · **Gate**: quick

#### T14: Lista de arquivados e Obras

**What**: `ListaArquivados` genérico e o botão "Ver arquivados" na página de Obras.
**Where**: `components/ListaArquivados.tsx`, `pages/Obras.tsx`
**Depends on**: T13
**Requirement**: ARQ-08 (obras), ARQ-07 (UI)

**Done when**:
- [ ] Busca `<caminho>?arquivados=true`; cada item com rótulo, "Será apagado em <data>" e "Restaurar"; lista vazia → "Nada arquivado."
- [ ] Restaurar → `PATCH <caminho>/:id/restaurar`, sai dos arquivados e a lista principal recarrega; erro HTTP/rede seguem a AD-014
- [ ] Os testes de OFF-15 em `Obras.test.tsx` passam sem mudança
- [ ] Gate check passes: `npm run test --workspace apps/web`

**Tests**: unit · **Gate**: quick

#### T15: Gesseiros

**What**: "Arquivar gesseiro" no painel do extrato e "Ver arquivados".
**Where**: `pages/Gesseiros.tsx`
**Depends on**: T14
**Requirement**: ARQ-10, ARQ-08 (gesseiros)

**Done when**:
- [ ] Saldo ≠ 0 → botão desabilitado com "Zere o saldo para arquivar"; saldo 0 → `window.confirm` → `PATCH /gesseiros/:id/arquivar` → some da lista; erro da API visível
- [ ] "Ver arquivados" lista e restaura
- [ ] Gate check passes: `npm run test --workspace apps/web`

**Tests**: unit · **Gate**: quick

#### T16: Estoque

**What**: Coluna "Ações" com "Arquivar" e "Ver arquivados".
**Where**: `pages/Estoque.tsx`
**Depends on**: T14
**Requirement**: ARQ-12 (UI), ARQ-08 (estoque)

**Done when**:
- [ ] `window.confirm` com o aviso do saldo quando ≠ 0 (texto exato no teste); recusado → nenhuma chamada; aceito → some da tabela
- [ ] "Ver arquivados" lista e restaura
- [ ] Gate check passes: `npm run build && npm test`

**Tests**: unit · **Gate**: build

#### T17: Auditoria responsiva

**What**: Fixture com as 4 entidades `[audit]` e os 4 estados novos.
**Where**: `apps/api/scripts/fixture-auditoria.mjs`, `apps/web/scripts/audit-responsive.mjs`, `apps/web/src/index.css`
**Depends on**: T15, T16
**Requirement**: ARQ-14

**Done when**:
- [ ] `limpar`/`contar` incluem gesseiros `[audit]`; `contar` volta 0 no fim
- [ ] `medidos: 158/158, nao montados: 0, falhas: 0`, `audit:pwa` 14/14
- [ ] Prova de mutação: `.lista-arquivados .btn` sem 44px → RSP-08 falha
- [ ] Teste manual pela UI (pendente do usuário): arquivar, ver arquivados, restaurar nas 3 telas
- [ ] Gate check passes: Browser

**Tests**: browser · **Gate**: browser
