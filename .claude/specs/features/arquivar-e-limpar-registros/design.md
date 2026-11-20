# Arquivar e Limpar Registros — Design

**Spec**: `spec.md` (ARQ-01..15) · **Decisões**: AD-003, AD-007, AD-014, AD-015 · **Contexto**: `context.md`

## Visão geral

```
            arquivar (checagens)          job diário (>= 7 dias)
 ativo ─────────────────────────▶ arquivado ─────────────────────▶ apagado
   ▲                                  │
   └──────────── restaurar ───────────┘
```

O arquivado é marcado por `arquivadoEm DateTime?` nas três entidades. Toda lista "normal" filtra
`arquivadoEm: null`, e `?arquivados=true` devolve só os arquivados. Arquivar, restaurar e o delete
da limpeza são **condicionais** (`updateMany`/`deleteMany` com `arquivadoEm` no `where`, mesmo
padrão da AD-007), então chamadas concorrentes nunca aplicam duas vezes.

## Banco (uma migration)

| Model | Campo novo |
| --- | --- |
| `Obra` | `arquivadoEm DateTime?`, `valorRecebido Decimal @default(0) @db.Decimal(12,2)` |
| `Gesseiro` | `arquivadoEm DateTime?` |
| `Material` | `arquivadoEm DateTime?` |

Índices: nenhum. As tabelas são pequenas, e o job filtra por data uma vez por dia.

## API

### Saldo compartilhado — `apps/api/src/gesseiros/saldo.ts`

`saldosPorGesseiro(cliente, ids[]) → Map<id, number>`: um `groupBy({ by: ['gesseiroId','tipo'] })`
e o cálculo `créditos − vales − pagamentos`. O `GesseirosService.extrato()` passa a usar a mesma
função, e o arquivamento de obra e de gesseiro também. Assim a regra "saldo derivado de lançamentos"
tem uma implementação só.

### Obras (`obras.service.ts`)

- `update`: aceita `valorRecebido` (novo no `UpdateObraDto`: `@IsNumber({ maxDecimalPlaces: 2 })`,
  `@Min(0)`). O service compara com `dto.valorTotal ?? atual.valorTotal` e responde 400
  `O valor recebido não pode passar do valor total (<total em BRL>)`. A mesma checagem vale quando
  o PATCH só diminui o `valorTotal`. `CreateObraDto` não ganha o campo: o default 0 vale.
- `situacaoArquivamento(id)`: devolve `{ concluida, valorRecebido, valorTotal, clienteQuitado,
  gesseirosPendentes: [{ id, nome, saldo }], podeArquivar }`. É a **única** fonte das checagens:
  o `arquivar` chama a mesma função dentro da transação, e o diálogo do front lê o resultado por
  `GET /obras/:id/arquivamento`.
- `arquivar(id)`: `$transaction` → `situacaoArquivamento(id, tx)` → 400 na primeira condição que
  falhar (ordem: concluída, cliente, gesseiros) → `updateMany({ where: { id, status: CONCLUIDA,
  arquivadoEm: null }, data: { arquivadoEm: agora } })` → `count 0` → 400 `A obra já está arquivada`.
- `restaurar(id)`: `updateMany({ where: { id, arquivadoEm: { not: null } }, data: { arquivadoEm: null } })`,
  e com `count 0` → 404 se não existe, 400 `A obra não está arquivada` se existe.
- `findAll(query)`: `where.arquivadoEm = query.arquivados ? { not: null } : null`. Com
  `arquivados`, ordena por `arquivadoEm desc`. `QueryObraDto` ganha `arquivados?: boolean` (com
  `@Transform` de `'true'`). `resumo()` filtra `arquivadoEm: null`.
- **Remove** `remove()` e `DELETE /obras/:id`.

Rotas: `GET /obras/:id/arquivamento`, `PATCH /obras/:id/arquivar`, `PATCH /obras/:id/restaurar`.

### Gesseiros (`gesseiros.service.ts`)

- `arquivar(id)`: `$transaction` → findOne (404) → saldo ≠ 0 → 400
  `O gesseiro ainda tem saldo de <BRL>; zere o saldo antes de arquivar` → alocação em obra aberta →
  400 `O gesseiro está alocado em <títulos>; remova-o dessas obras antes de arquivar` (reusa o
  `STATUS_EM_ABERTO` do `desativar` atual) → `updateMany` condicional, com
  `{ arquivadoEm: agora, ativo: false }`.
- `restaurar(id)`: condicional, com `{ arquivadoEm: null, ativo: true }`.
- `findAll(arquivados?)`: o mesmo filtro das obras. `GET /gesseiros?arquivados=true`.
- **Remove** `desativar()` e `DELETE /gesseiros/:id`. O `alocarGesseiro` passa a recusar gesseiro
  arquivado com 400 `O gesseiro <nome> está arquivado`.

### Estoque (`estoque.service.ts`, `materiais-previstos.service.ts`)

- `arquivarMaterial(id)` / `restaurarMaterial(id)`: condicionais, sem pré-condição.
- `listarMateriais(arquivados?)` filtra. O `abaixoDoMinimo()` usa a lista sem arquivados.
- `criarMaterial`: antes do `create`, faz `findUnique({ nome })` e, se o material existir
  arquivado, responde 409 com a mensagem da spec. Se existir ativo, o comportamento atual continua.
- `movimentar` e `materiaisPrevistos.validarItens`: material arquivado → 400
  `O material <nome> está arquivado`.
- Rotas: `PATCH /estoque/materiais/:id/arquivar`, `/restaurar`; `GET /estoque/materiais?arquivados=true`.

### Agente de estoque

- `previsao-estoque.service.ts:86`: `material.findMany({ where: { arquivadoEm: null } })`.
- `previsao-estoque.service.ts:102` e `alertas-estoque.service.ts:67/92`: alertas com
  `material: { arquivadoEm: null }`. O alerta continua no banco e sai junto na limpeza do material.

### Limpeza — `apps/api/src/limpeza/limpeza.service.ts` (módulo novo)

- `@Cron(CronExpression.EVERY_DAY_AT_3AM)` → `limpar(agora = new Date())`. O `ScheduleModule` já
  está no `AppModule` (é usado pela idempotência).
- `limite = agora − 7 dias`. Para cada entidade: `findMany({ where: { arquivadoEm: { lte: limite } },
  select: { id } })` e, para cada id, **uma** `$transaction`:
  1. **Trava e reconfere**: `updateMany({ where: { id, arquivadoEm: { lte: limite } }, data: {} })`
     não funciona (o Prisma ignora update vazio), então usa
     `data: { arquivadoEm: <o próprio valor lido> }`. Com `count 0` (restaurado no meio), pula. O
     update segura o lock da linha até o commit, e um `restaurar` concorrente espera (Edge Case).
  2. Obra: `lancamento.updateMany({ obraId: id } → obraId null)`,
     `movimentacaoEstoque.updateMany(… → obraId null)`, e depois `obra.delete` (equipe, pagamento e
     previstos saem em cascata).
  3. Gesseiro: `obraGesseiro.deleteMany({ gesseiroId })` (a FK não tem cascata) e `gesseiro.delete`
     (lançamentos em cascata).
  4. Material: `materialPrevistoObra.deleteMany({ materialId })` e `material.delete`
     (movimentações e alertas em cascata).
- Erro numa transação: `Logger.error` com entidade e id, e segue (ARQ-13 AC5). Retorna
  `{ obras, gesseiros, materiais, falhas }` para teste e log.
- Ordem: obras → gesseiros → materiais. Uma obra apagada no mesmo dia libera as alocações do
  gesseiro antes de ele ser apagado.

## Web

| Peça | Onde | O que faz |
| --- | --- | --- |
| tipos | `types.ts` | `arquivadoEm?: string \| null` (3) e `valorRecebido` em `Obra`; `SituacaoArquivamento` |
| `dataLimpeza(arquivadoEm)` | `lib/formato.ts` | `arquivadoEm + 7 dias`, formatada `dd/mm/aaaa` |
| `ValorRecebidoForm` | `components/forms/` | No card: "Recebido R$ X de R$ Y" e um input com "Salvar" (`PATCH /obras/:id`, usa `useEnvio`). Erro no próprio form |
| `ArquivarObra` | `components/` | Botão "Arquivar obra" em card `CONCLUIDA`. Abre um painel inline (como o cancelamento) que busca `GET /obras/:id/arquivamento` e mostra "Gesseiros pagos" (✔ ou `<nome> — <saldo>` por pendente) e "Cliente pagou R$ X de R$ Y" (✔/✘). "Arquivar" fica habilitado só com `podeArquivar`. Erros seguem a AD-014 (HTTP → mensagem + `onAlterada`; rede → `SEM_CONEXAO_ENVIO`, sem reenviar) |
| `ListaArquivados` | `components/` | Genérico: `{ caminho, rotulo(item), caminhoRestaurar(id), onRestaurado }`. Busca `GET <caminho>?arquivados=true`; cada item mostra `rotulo`, "Será apagado em <data>" e "Restaurar" |
| Obras | `pages/Obras.tsx` | Botão "Ver arquivados" no cabeçalho (alterna a lista); arquivar ou restaurar recarrega |
| Gesseiros | `pages/Gesseiros.tsx` | No painel do extrato: "Arquivar gesseiro" (desabilitado com "Zere o saldo para arquivar" se `saldoAReceber ≠ 0`; `window.confirm`). "Ver arquivados" no cabeçalho |
| Estoque | `pages/Estoque.tsx` | Coluna "Ações" na tabela com "Arquivar" (`window.confirm`, com o aviso do saldo se ≠ 0). "Ver arquivados" no cabeçalho |

CSS: `.lista-arquivados` (cards simples), os botões dentro de `.card-acoes` (a regra de 44px do
RSP-08 já existe) e `overflow-wrap: anywhere` nos rótulos.

## Auditoria (`audit:responsive`)

Estados novos (`precisaFixture`): `obras-arquivar` (painel aberto na obra `[audit] Quitada`),
`obras-arquivados`, `gesseiros-arquivados` e `estoque-arquivados`. São 4 a mais por largura:
20 × 6 + 19 × 2 = **158** (era 126).

A fixture ganha:
- a obra `[audit] Quitada` (CONCLUIDA, `valorRecebido = valorTotal`, sem equipe);
- a obra `[audit] Arquivada`;
- o gesseiro `[audit] Arquivado`;
- o material `[audit] Arquivado`.

O `limpar`/`contar` passam a incluir gesseiros com o prefixo. Seletores RSP-08: `.lista-arquivados .btn`
e os botões do painel (já em `.card-acoes`).

## Testes

- **Unit API**:
  - `saldo.spec.ts`;
  - `obras.service.spec.ts`: `valorRecebido`, `situacaoArquivamento`, arquivar/restaurar, com um
    `tx` separado (AD-012);
  - `gesseiros.service.spec.ts` e `estoque.service.spec.ts`: arquivar/restaurar/filtros/409/bloqueio;
  - `limpeza.service.spec.ts`: ordem, transação por registro, `count 0` pula, erro segue;
  - specs do agente com o filtro.
- **e2e** (`test/arquivamento.e2e-spec.ts`, prefixo `[e2e]`, `--runInBand`):
  - arquivar concorrente → `[200, 400]`;
  - limpeza de obra com `arquivadoEm` recuado 8 dias: o saldo e a soma de créditos do gesseiro
    ficam iguais e os lançamentos ficam com `obraId null`;
  - obra com 6 dias não é apagada;
  - restaurar antes do job mantém o registro.
- **Web**: um `.test.tsx` por componente novo, e as páginas com o fluxo de arquivar e restaurar.
- **Browser**: `audit:responsive` 158/158 e `audit:pwa` 14/14.
