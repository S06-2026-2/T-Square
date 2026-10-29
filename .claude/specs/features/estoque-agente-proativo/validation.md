# Estoque — Agente Proativo de Reposição Validation (T1–T29)

**Verdict**: PASS ✅ (rodada 2). Os 5 gaps da rodada 1 foram fechados só com testes e spec. 69/69 requisitos têm evidência `file:line` no valor da spec. 23/23 mutantes distintos mortos (M6, M19 e M20 agora morrem; M21–M23 são novos). Nenhum defeito de produção.

**Date**: 2026-10-29
**Spec**: `.claude/specs/features/estoque-agente-proativo/spec.md`
**Diff range**: `dfc1552..5396f21` (commits `b5e2ba6`, `a6e6522`, `f7e6664`, `5396f21`) + working tree não commitado: `apps/api/src/agente-estoque/agente-estoque.service.spec.ts`, `apps/api/src/estoque/calculo-estoque.spec.ts`, `estoque-agente-proativo/spec.md`, `estoque-agente-proativo/tasks.md`, `front-dashboard-resumo/spec.md`. Nenhum arquivo de produção no working tree. Fora de escopo: `CLAUDE.md` e `.claude/specs/features/obras-transicoes-status/` (outra feature).
**Verifier**: sub-agente independente (author ≠ verifier), rodada 2 de no máximo 3

> Paths de teste abaixo são relativos a `apps/api/src/` (`*.spec.ts`) e `apps/web/src/` (`*.test.ts(x)`).

---

## Rodada 2: o que mudou

| # | Gap da rodada 1 | Correção (working tree) | Evidência | Confere com a spec? | Mutante |
| - | --------------- | ----------------------- | --------- | ------------------- | ------- |
| 1 | EAP-52: "fechado pelo AGENTE → registro novo" sem teste | teste "fechado pelo agente (resolvidoPor = AGENTE)…" | `agente-estoque.service.spec.ts:719-742`: último alerta `RESOLVIDO`/`AGENTE` há 4 dias; `:736-738` `update).not.toHaveBeenCalledWith(objectContaining({ where: { id: 'al-agente' } }))`; `:739-741` `dadosCriados()).toEqual([objectContaining({ materialId: 'cal', tipo: REPOSICAO })])` | Sim. `spec.md:228` (P2 AC7): "fechado pelo agente → registro novo". Os 4 dias passam da tolerância de 3 dias, então o teste discrimina a condição `resolvidoPor === OPERADOR` e não a data | M19 ✅ morto |
| 2 | Texto padrão "sem consumo nos últimos N dias" com N fixo | teste "texto padrão sem consumo cita a janela real…" | `agente-estoque.service.spec.ts:450-467`: material com `diasJanela: 12`, saldo 3, mínimo 10, sem consumo; `:458-466` `justificativa: 'Saldo livre de 3 saco, abaixo do mínimo de 10 saco; sem consumo nos últimos 12 dias. Repor 7 saco.'`, `origemTexto: PADRAO` | Sim. Assumption "Material sem SAIDA solta na janela" (`spec.md:55`): N = janela real (12 ≠ 30, então o valor fixo não passa) e `sugerido = ceil(10 − 3) = 7` | M20 ✅ morto |
| 3 | Fronteira `diasAteMinimo <= 7` sem teste nem AC | AC novo P1 #23 = **EAP-69** + 2 testes | `spec.md:136` (AC), `:353` (rastreabilidade), Coverage 69/69; `tasks.md` linha EAP-69. Testes: `calculo-estoque.spec.ts:239-252` (17/10/30 em 30 d) `diasAteMinimo '7'`, `:250` `motivo).toBe('PREVISAO')`, `obrigatorio false`; `:254-267` (17,01) `diasAteMinimo '7.01'`, `:265` `motivo).toBeNull()` | Sim. EAP-69: `<= 7` → `PREVISAO`; 7,01 → `motivo` nulo; "não é obrigatório" asserido | M6 ✅ morto; M23 (`lte(7,5)`) ✅ morto |
| 4 | Edge case "nenhum material → SUCESSO, zero alertas" sem teste no service | teste "nenhum material cadastrado…" | `agente-estoque.service.spec.ts:469-481`: `snapshot()` vazio; `:475` `analise?.status).toBe(SUCESSO)`; `:476-477` `create`/`update` de alerta `not.toHaveBeenCalled()`; `:478-480` `finalizacao()?.data` com `status: SUCESSO, totalAlertas: 0`. Parte do Dashboard já coberta: `AlertasEstoque.test.tsx:250-251` "Estoque em dia" | Sim. Edge case `spec.md:255` | M21 e M22 ✅ mortos |
| 5 | Remoção do subtítulo do Dashboard fora da spec | Assumption "Cabeçalho da página" | `front-dashboard-resumo/spec.md:33`: só o título, subtítulo removido a pedido do usuário. Bate com o código: `pages/Dashboard.tsx:31` `<h1>Visao geral</h1>`, sem `subtitulo-pagina`; nenhum teste citava o subtítulo | Sim (decisão registrada, "Confirmed? y") | n/a (cosmético) |

Observação sobre o gap 4: `totalAlertas: 0` vem do mock `alertaEstoque.count` (`agente-estoque.service.spec.ts:185`, sempre 0), então essa parte da asserção não discrimina. Quem discrimina o edge case é o `status: SUCESSO` (M21 e M22 morreram por ele). Não bloqueia.

---

## Task Completion

| Task | Status | Notes |
| ---- | ------ | ----- |
| T1 Modelos, enums, migration | ✅ Done | `prisma/schema.prisma`, migration presente; build gate |
| T2 Funções puras de cálculo | ✅ Done | `estoque/calculo-estoque.spec.ts`; fronteira EAP-69 em `:239-267` (rodada 2) |
| T3 PrevisaoEstoqueService | ✅ Done | `agente-estoque/previsao-estoque.service.spec.ts` |
| T4 Marcadores | ✅ Done | `agente-estoque/marcadores-obra.spec.ts` |
| T5 ClienteLlm | ✅ Done | `agente-estoque/cliente-llm.spec.ts` (SDK mockado, sem rede) |
| T6 Ferramentas | ✅ Done | `agente-estoque/ferramentas-agente.spec.ts` |
| T7 Loop com limites | ✅ Done | `agente-estoque.service.spec.ts:230-402` |
| T8 Persistência e ciclo de vida | ✅ Done | Ramo AGENTE agora testado (`agente-estoque.service.spec.ts:719-742`); texto sem consumo (`:450-467`); snapshot vazio (`:469-481`) |
| T9 Controle de execução | ✅ Done | `agente-estoque.service.spec.ts:901-1045` |
| T10 AlertasEstoqueService | ✅ Done | `alertas-estoque.service.spec.ts` |
| T11 Controller e módulo | ✅ Done | build gate (matriz: controller sem teste) |
| T12 Agendador | ✅ Done | `agendador-agente.service.spec.ts` |
| T13 Variáveis de ambiente | ✅ Done | `.env.example`, `apps/api/.env.example`, `docker-compose.yml` (3 variáveis, chave vazia) |
| T14 MateriaisPrevistosService e DTOs | ✅ Done | `obras/materiais-previstos.service.spec.ts`, `obras/dto/materiais-previstos.dto.spec.ts` |
| T15 Criar obra com previstos | ✅ Done | `obras/obras.service.spec.ts:48-128` |
| T16 Rotas de previstos | ✅ Done | `obras/obras.controller.ts` (GET/PUT); build gate |
| T17 Tipos, `api.put`, `dataHora` | ✅ Done | `lib/formato.test.ts:11-25` |
| T18 Seção e cards | ✅ Done | `components/AlertasEstoque.test.tsx:88-299` |
| T19 Ações da seção | ✅ Done | `components/AlertasEstoque.test.tsx:306-412` |
| T20 Integração no Dashboard | ✅ Done | `pages/Dashboard.test.tsx:151-186` |
| T21 Editor de itens | ✅ Done | `components/forms/ItensMateriaisPrevistos.test.tsx` |
| T22 Seção na criação de obra | ✅ Done | `components/forms/NovaObraForm.test.tsx:211-275` |
| T23 MateriaisPrevistosForm | ✅ Done | `components/forms/MateriaisPrevistosForm.test.tsx` |
| T24 Ação no card da obra | ✅ Done | `pages/Obras.test.tsx:165-210` |
| T25 Seed | ✅ Done | Não reexecutado (proibido rodar seed); conferido por leitura de `prisma/seed.ts` na rodada 1 |
| T26 Exportar raciocínio | ✅ Done | `agente-estoque/relatorio-raciocinio.spec.ts` |
| T27 Execução real | ✅ Done | Registro manual em `tasks.md:757-760`; não reexecutado (gastaria créditos) |
| T28 Trava de investigação | ✅ Done | `ferramentas-agente.spec.ts:171-329`, `agente-estoque.service.spec.ts:494` |
| T29 Resolver → ENTRADA | ✅ Done | `components/AlertasEstoque.test.tsx:380`, `pages/Estoque.test.tsx:140-220` |

---

## Spec-Anchored Acceptance Criteria

Rodada 2: o diff só acrescenta testes. Em `calculo-estoque.spec.ts` os testes novos ficam depois da linha 236, então nenhuma citação mudou. Em `agente-estoque.service.spec.ts` as citações da rodada 1 foram deslocadas: linhas ≤ 449 iguais; 450–685 → +33; ≥ 686 → +58. Conferi as linhas novas por amostragem (`:489`, `:507`, `:543`, `:562`, `:565`, `:580`, `:610`, `:618`, `:633`, `:673`, `:716`, `:761`, `:799`, `:812`, `:830`, `:837`, `:856`, `:860`, `:878`, `:911`, `:931`, `:934`, `:936`, `:969`, `:1003`, `:1018`): cada uma cai na mesma asserção da rodada 1. Os demais arquivos de teste não mudaram.

### P1: Análise de estoque (EAP-01..17, 58..61, 67, 69)

| Req | Spec-defined outcome | `file:line` + assertion | Result |
| --- | --- | --- | --- |
| EAP-01 fórmulas | Independent Test: saldo 15, mín 10, 55 em 30 d → ritmo 1,8333, dias 2,7273, calculado 50 | `calculo-estoque.spec.ts:75` `ritmoDiario...toBe('1.8333')`; `:77` `diasAteMinimo...toBe('2.7273')`; `:79` `calculado.toString()).toBe('50')`; reservado/saldo livre `:95-96` `'20'`/`'5'`; ceil exato `:222`, `:235` | ✅ |
| EAP-02 exclusões do consumo solto | CANCELADA e obra com previsão do material não contam; obra sem previsão conta (inclusive CONCLUIDA) | `previsao-estoque.service.spec.ts:134` `consumoSolto...toBe('15')`; `:148` `toBe('0')`; `:169` `toBe('6')` (CANCELADA fora) | ✅ |
| EAP-03 obrigatório (`<`, `=` com ritmo) | alerta `REPOSICAO` ATIVO | `calculo-estoque.spec.ts:128` `obrigatorio).toBe(true)`; `:145-147` `NO_MINIMO_COM_CONSUMO`, `diasAteMinimo '0'`; `agente-estoque.service.spec.ts:413` `dadosCriados()...toEqual([{tipo: REPOSICAO, quantidadeSugerida: 35, ...}])` | ✅ |
| EAP-04 `=` mínimo com ritmo 0 | sem alerta obrigatório | `calculo-estoque.spec.ts:161` `obrigatorio).toBe(false)`; `:175` (mínimo 0, saldo 0) | ✅ |
| EAP-05 REPOSICAO na faixa | grava com a quantidade e `AGENTE` | `ferramentas-agente.spec.ts:341` `aceitas[0]).toEqual({..., quantidade: dec(quantidade)})` para 25/50/100; `agente-estoque.service.spec.ts:610` `quantidadeSugerida: 40, origemTexto: AGENTE` | ✅ |
| EAP-06 recusa fora da faixa / calculado ≤ 0 | erro com a faixa; ou "só INFORMATIVO" | `ferramentas-agente.spec.ts:358` `toContain('entre 25 e 100 saco')`; `:369` `toContain('só INFORMATIVO é aceito')`; `:359`/`:370` `aceitas).toEqual([])` | ✅ |
| EAP-07 rede de segurança | quantidade calculada, texto padrão, `PADRAO` | `agente-estoque.service.spec.ts:413-426` `quantidadeSugerida: 35`, `justificativa: TEXTO_PADRAO_CAL`, `origemTexto: PADRAO`; ramo sem consumo `:458-466` (rodada 2) | ✅ |
| EAP-08 sem chave / falha | `FALHA` + obrigatórios | `agente-estoque.service.spec.ts:434` `status).toBe(FALHA)`; `:435` obrigatório `PADRAO`; `:398-400`; `:379` | ✅ |
| EAP-09 limites | 21ª não executa → `PARCIAL` com aceitas; prazo → `PARCIAL`; `end_turn` → `SUCESSO` | `:316-320`; `:356-357`; `:369-370`; `:236` | ✅ |
| EAP-10 nunca movimenta | nenhum `material.update*`/`movimentacaoEstoque.create*` | `agente-estoque.service.spec.ts:856-860` (`it.each` `:837`) `not.toHaveBeenCalled()` | ✅ |
| EAP-11 marcadores, sem cliente | só `{{OBRA_n}}` | `ferramentas-agente.spec.ts:139-140`; `:148` | ✅ |
| EAP-12 troca de marcadores | título no lugar do marcador | `marcadores-obra.spec.ts:65`; `agente-estoque.service.spec.ts:799-802` `'Falta material para Forro Residência Silva.'` | ✅ |
| EAP-13 marcador alterado | texto padrão + `PADRAO` | `marcadores-obra.spec.ts:75`, `:86`; `agente-estoque.service.spec.ts:812-819` | ✅ |
| EAP-14 idempotência | atualiza o ATIVO, não cria | `agente-estoque.service.spec.ts:562` `create).not.toHaveBeenCalled()`; `:565` `where).toEqual({ id: 'al-ativo' })` | ✅ |
| EAP-15 fechamento automático | não repetidos → `RESOLVIDO`/`AGENTE` em SUCESSO e PARCIAL | `:580-591`; `:618-619` PARCIAL | ✅ |
| EAP-16 FALHA não fecha | nenhum fechamento | `:438` e `:447` `fechamentos()).toEqual([])` | ✅ |
| EAP-17 registro em `AnaliseEstoque` | início, fim, status, origem, nº ATIVO, passos | `:878-893` `finalizacao()).toEqual({...})`; origem/início `:911-913` | ✅ |
| EAP-58 INFORMATIVO aceito | sem quantidade, texto do agente | `ferramentas-agente.spec.ts:390`; `agente-estoque.service.spec.ts:543-550` | ✅ |
| EAP-59 INFORMATIVO com calculado > 0 | erro "exige REPOSICAO" | `ferramentas-agente.spec.ts:406` | ✅ |
| EAP-60 rede só cria REPOSICAO | gesso sem falta não ganha INFORMATIVO | `agente-estoque.service.spec.ts:489` `toEqual([['cal', REPOSICAO]])` | ✅ |
| EAP-61 marcador ausente | mantém texto + "Reservado para: A, B" | `marcadores-obra.spec.ts:92-95`; `agente-estoque.service.spec.ts:830` | ✅ |
| EAP-67 trava de investigação | `listarMateriais` sem `calculado`; faixa em `consumoDoMaterial`; recusa listando consultas; silêncio antes | `ferramentas-agente.spec.ts:203`, `:214-226`, `:255-258`, `:283-284`, `:309`, `:326-327`; `agente-estoque.service.spec.ts:507-523` | ✅ |
| **EAP-69** PREVISAO em ≤ 7 dias (novo) | 7 dias exatos → `motivo = PREVISAO`, não obrigatório; 7,01 → `motivo` nulo | `calculo-estoque.spec.ts:249-251` `diasAteMinimo '7'`, `motivo).toBe('PREVISAO')`, `obrigatorio).toBe(false)`; `:264-266` `'7.01'`, `motivo).toBeNull()` | ✅ |

### P1: Execução agendada e manual (EAP-18..25)

| Req | Spec-defined outcome | `file:line` + assertion | Result |
| --- | --- | --- | --- |
| EAP-18 cron | `0 0 6 * * *`, `America/Sao_Paulo`, origem `AGENDADA` | `agendador-agente.service.spec.ts:67-68`; `:75`; `:90` | ✅ |
| EAP-19 catch-up | > 24h estrito ou nunca → `CATCH_UP`; exatamente 24h não | `:99`, `:110`; `it.each` `:117-130` | ✅ |
| EAP-20 flag false/ausente | nada registrado | `:160-162` | ✅ |
| EAP-21 manual 201 | análise finalizada, origem `MANUAL` | `agente-estoque.service.spec.ts:911-919`; 201 é o default do `@Post` (`agente-estoque.controller.ts:17`), sem teste de rota conforme a matriz | ✅ |
| EAP-22 409 | `Já existe uma análise de estoque em andamento` | `agente-estoque.service.spec.ts:931-933`; `:936` uma só criação | ✅ |
| EAP-23 429 | `Aguarde 5 minutos entre análises manuais` | `:969-971`; `:976` nada criado | ✅ |
| EAP-24 automática pulada | `null`, sem registro | `:934-936`; `agendador-agente.service.spec.ts:134` | ✅ |
| EAP-25 travada > 5 min | vira `FALHA` e a nova roda | `agente-estoque.service.spec.ts:1003-1015` | ✅ |

### P1: Dashboard (EAP-26..36, 62, 63, 66)

Sem mudança desde a rodada 1 (`apps/web` não tem diff no working tree). Citações conferidas como válidas:

| Req | Spec-defined outcome | `file:line` + assertion | Result |
| --- | --- | --- | --- |
| EAP-26 cards e ordem | material, unidade, quantidade, situação; "+"; ordem da API | `AlertasEstoque.test.tsx:108-111`, `:120-132`, `:157`; `alertas-estoque.service.spec.ts:101-109` | ✅ |
| EAP-27 números dos campos | 12, mesmo com "99" no texto | `AlertasEstoque.test.tsx:108` | ✅ |
| EAP-28 situação em dias | textos exatos por `motivo` | `AlertasEstoque.test.tsx:180-191`; `lib/formato.test.ts:53-68` | ✅ |
| EAP-29 selo | só em `PADRAO` | `AlertasEstoque.test.tsx:203-208` | ✅ |
| EAP-30 data/hora | `dd/mm/aaaa hh:mm` | `:242-244`; `lib/formato.test.ts:13` | ✅ |
| EAP-31 vazio | "Estoque em dia" | `:250-251` | ✅ |
| EAP-32 nunca analisado | "Nenhuma análise executada ainda" | `:257-260` | ✅ |
| EAP-33 aviso FALHA/PARCIAL | aviso com o status | `:271-272`; `:280` | ✅ |
| EAP-34 erro isolado | `erro` só na seção | `pages/Dashboard.test.tsx:163-169` | ✅ |
| EAP-35 rodar análise | POST, botão desabilitado, recarrega | `AlertasEstoque.test.tsx:318-327` | ✅ |
| EAP-36 409/429 | mensagem da API em `erro` | `:345` (it.each `:333`) | ✅ |
| EAP-62 ⚠️ | ícone em REPOSICAO | `:227-229` | ✅ |
| EAP-63 ℹ️ | ícone + "observação do agente" | `:232-236` | ✅ |
| EAP-66 carregando | "Carregando alertas..." | `AlertasEstoque.test.tsx:287`; `pages/Dashboard.test.tsx:131` | ✅ |

### P2: Materiais previstos (EAP-37..45, 64)

Sem mudança desde a rodada 1.

| Req | Spec-defined outcome | `file:line` + assertion | Result |
| --- | --- | --- | --- |
| EAP-37 criação com obra | escrita aninhada | `NovaObraForm.test.tsx:240-248`; `obras/obras.service.spec.ts:68-79` | ✅ |
| EAP-38 substituir | lista gravada nos 3 status | `materiais-previstos.service.spec.ts:66-83` (it.each `:51`), `:93-98`; `MateriaisPrevistosForm.test.tsx:148-154` | ✅ |
| EAP-39 travado | 400 com status | `materiais-previstos.service.spec.ts:109-113` | ✅ |
| EAP-40 repetido | 400 sem gravar | `:124-130`; `obras.service.spec.ts:109-113`; `ItensMateriaisPrevistos.test.tsx:120` | ✅ |
| EAP-41 quantidade | `<= 0` ou 3 casas → 400 | `materiais-previstos.dto.spec.ts:29`, `:65` | ✅ |
| EAP-42 inexistente | 404 sem gravar | `materiais-previstos.service.spec.ts:142-144`; `obras.service.spec.ts:125-126` | ✅ |
| EAP-43 ação no card | editor nos 3 status | `pages/Obras.test.tsx:188-191` | ✅ |
| EAP-44 status final | só tabela | `pages/Obras.test.tsx:204-207`; `MateriaisPrevistosForm.test.tsx:208-212` | ✅ |
| EAP-45 reservado por status | só FECHADA/ANDAMENTO | `previsao-estoque.service.spec.ts:218-221`, `:232-234` | ✅ |
| EAP-64 devolução | utilizado 5, pendente 15, saldo livre 5; piso 0 | `previsao-estoque.service.spec.ts:266-269`, `:282-283`; `calculo-estoque.spec.ts:26` | ✅ |

### P2: Dispensar / resolver (EAP-46..53, 65, 68)

| Req | Spec-defined outcome | `file:line` + assertion | Result |
| --- | --- | --- | --- |
| EAP-46 dispensar | `DISPENSADO` + data | `alertas-estoque.service.spec.ts:156-161`; `AlertasEstoque.test.tsx:371-376` | ✅ |
| EAP-47 resolver INFORMATIVO | `RESOLVIDO` + `OPERADOR` | `alertas-estoque.service.spec.ts:175-185`; `AlertasEstoque.test.tsx:374` | ✅ |
| EAP-48 não ativo | 400 | `alertas-estoque.service.spec.ts:200-202` | ✅ |
| EAP-49 inexistente | 404 | `:211-213` | ✅ |
| EAP-50 silêncio 5 dias | nem rede nem agente criam | `agente-estoque.service.spec.ts:652-653` (it.each `:633`); `ferramentas-agente.spec.ts:430-433`, `:447` | ✅ |
| EAP-51 tolerância 3 dias | REPOSICAO < 3 d segura tudo; INFORMATIVO só INFORMATIVO | `agente-estoque.service.spec.ts:652-653`, `:673-675`; `ferramentas-agente.spec.ts:461-463`, `:479-482` | ✅ |
| **EAP-52** reabertura | OPERADOR ≥ 3 d → mesmo registro ATIVO; fechado pelo AGENTE ou dispensado ≥ 5 d → registro novo | reabre: `agente-estoque.service.spec.ts:761-773`; dispensado ≥ 5 d: `:716`; **fechado pelo AGENTE (rodada 2): `:736-738` `update).not.toHaveBeenCalledWith(...{ id: 'al-agente' })` + `:739-741` `create` de `cal`/`REPOSICAO`** | ✅ |
| EAP-53 erro na UI | card mantido + `erro` | `AlertasEstoque.test.tsx:407-409` | ✅ |
| EAP-65 dispensa de INFORMATIVO | recusa só INFORMATIVO | `ferramentas-agente.spec.ts:512-515` | ✅ |
| EAP-68 Resolver → ENTRADA | navega sem PATCH; ENTRADA → PATCH → `/dashboard`; falhas | `AlertasEstoque.test.tsx:389-392`; `pages/Estoque.test.tsx:147-152`, `:164-171`, `:182-184`, `:195-201`, `:210-219` | ✅ |

### P3: Previsto × utilizado (EAP-54..57)

Sem mudança desde a rodada 1.

| Req | Spec-defined outcome | `file:line` + assertion | Result |
| --- | --- | --- | --- |
| EAP-54 endpoint | 6 campos | `materiais-previstos.service.spec.ts:202-227` | ✅ |
| EAP-55 tabela | colunas e posição | `MateriaisPrevistosForm.test.tsx:81-85`, `:119-121` | ✅ |
| EAP-56 rótulo | pendente / excedente / conforme | `MateriaisPrevistosForm.test.tsx:86-90`; `lib/formato.test.ts:81-103` | ✅ |
| EAP-57 sem previstos | "Nenhum material previsto" | `MateriaisPrevistosForm.test.tsx:98-99` | ✅ |

### Assumptions que viram comportamento

| Decisão (spec) | Outcome | Evidência | Result |
| --- | --- | --- | --- |
| Janela `max(7, min(30, dias))` (`spec.md:47`) | 7 / N / 30 | `calculo-estoque.spec.ts:49-58`; `previsao-estoque.service.spec.ts:192` | ✅ |
| Justificativa padrão "sem consumo nos últimos N dias", N = janela real (`spec.md:55`) | N = 12 com janela 12; repor `ceil(mín − livre)` = 7 | `agente-estoque.service.spec.ts:458-466` | ✅ (era ❌) |
| Alerta de previsão `diasAteMinimo <= 7` (`spec.md:54`) | virou EAP-69 | ver EAP-69 | ✅ (era ⚠️) |
| Card mostra números gravados (`spec.md:70`) | igual ao EAP-27 | ver EAP-27 | ✅ |

**Status**: ✅ 69/69 ACs com evidência no valor da spec. 0 spec-precision gaps.

---

## Discrimination Sensor

**Isolamento (rodada 2)**: `git status --porcelain` do repo real gravado antes (8 linhas: os 6 ` M` do working tree e os 2 `??`). Worktree descartável em `C:\Users\Kaik\AppData\Local\Temp\verifier-agente-r2` (`git worktree add --detach … 5396f21`, fora do OneDrive). Copiei para ele os 2 arquivos de teste modificados do working tree real e criei junctions (`New-Item -ItemType Junction`) para `node_modules`, `apps/api/node_modules` e `apps/web/node_modules`. Baseline do scratch: 64/64 nos 2 arquivos alvo. Cada mutação foi aplicada por script Node (string exata, exigindo 1 ocorrência), com `npx jest --ci` nos testes relevantes e o arquivo restaurado byte a byte em `finally` (`restaurado=true` nas 6 execuções). No fim: junctions removidas com `rmdir` (alvos conferidos: `node_modules/jest`, `apps/api/node_modules` e `apps/web/node_modules` continuam existindo), `git worktree remove --force`, `git worktree prune`, e `git worktree list` mostra só o repo real. **Porcelain final idêntico ao baseline** (`diff` vazio), conferido de novo depois do gate e dos builds.

### Rodada 1 (mantida)

| # | File:line | Mutação | Killed? |
| - | --------- | ------- | ------- |
| M1 | `agente-estoque/ferramentas-agente.ts:58` | trava não exige `previstoVsUtilizado` | ✅ |
| M2 | `agente-estoque/ferramentas-agente.ts:329` | trava desligada (`> 99`) | ✅ |
| M3 | `agente-estoque/ferramentas-agente.ts:351` | `qtd.lt(minimo)` → `lte` | ✅ |
| M4 | `agente-estoque/ferramentas-agente.ts:65` | teto 250% em vez de 200% | ✅ |
| M5 | `estoque/calculo-estoque.ts:85` | obrigatório com `lte` | ✅ |
| M6 | `estoque/calculo-estoque.ts:94` | horizonte `lte(7)` → `lt(7)` | ❌ na rodada 1 → ✅ na rodada 2 |
| M7 | `agente-estoque/marcadores-obra.ts:62` | aceita `{{OBRA_n}}` não emitido | ✅ |
| M8 | `agente-estoque/marcadores-obra.ts:47` | regex só pega `{{OBRA_n}}` | ✅ |
| M9 | `agente-estoque/agente-estoque.service.ts:283` | `FALHA` também fecha | ✅ |
| M10 | `agente-estoque/agente-estoque.service.ts:241` | executa a 21ª chamada | ✅ |
| M11 | `agente-estoque/agente-estoque.service.ts:303` | rede ignora o silêncio | ✅ |
| M12 | `agente-estoque/agendador-agente.service.ts:58` | catch-up com exatamente 24h | ✅ |
| M13 | `web pages/Estoque.tsx:35` | resolve antes da ENTRADA | ✅ |
| M14 | `web pages/Estoque.tsx:51` | PATCH com id do material | ✅ |
| M15 | `web pages/Estoque.tsx:44` | fechar não desfaz o atalho | ✅ |
| M16 | `web components/AlertasEstoque.tsx:140` | REPOSICAO faz PATCH direto | ✅ |
| M17 | `web components/CardAlertaEstoque.tsx:22` | justificativa aberta por padrão | ✅ |
| M18 | `web lib/formato.ts:71` | "pendentes: N" | ✅ |
| M19 | `agente-estoque/agente-estoque.service.ts:430` | reabre também alerta fechado pelo `AGENTE` | ❌ na rodada 1 → ✅ na rodada 2 |
| M20 | `agente-estoque/agente-estoque.service.ts:455` | "últimos 30 dias" fixo | ❌ na rodada 1 → ✅ na rodada 2 |

### Rodada 2 (re-testes + novos)

| # | File:line | Mutação | Killed? (teste que matou) |
| - | --------- | ------- | ------- |
| M19 | `agente-estoque/agente-estoque.service.ts:430` | remove `ultimo.resolvidoPor === ResolvidoPor.OPERADOR &&` | ✅ Killed: "fechado pelo agente (resolvidoPor = AGENTE)…" (1 failed / 43) |
| M20 | `agente-estoque/agente-estoque.service.ts:455` | `${material.diasJanela}` → `30` | ✅ Killed: "texto padrão sem consumo cita a janela real…" (1 failed / 43) |
| M6 | `estoque/calculo-estoque.ts:94` | `diasAteMinimo.lte(HORIZONTE_DIAS)` → `lt` | ✅ Killed: "cruza o mínimo em exatamente 7 dias…" (1 failed / 178, suítes `estoque` + `agente-estoque`) |
| M21 (novo) | `agente-estoque/agente-estoque.service.ts:144` | snapshot vazio lança erro (`if (snapshot.materiais.length === 0) throw …`), o que leva a `FALHA` | ✅ Killed: "nenhum material cadastrado…" (1 failed / 43). 1ª tentativa inválida (aspas escapadas no shell: erro de compilação, 0 testes), refeita com template string |
| M22 (novo) | `agente-estoque/agente-estoque.service.ts:365` | `status: materiais.length === 0 ? PARCIAL : loop.status` | ✅ Killed: "nenhum material cadastrado…" (1 failed / 43) |
| M23 (novo) | `estoque/calculo-estoque.ts:94` | horizonte `lte(HORIZONTE_DIAS + 0.5)` (fronteira superior) | ✅ Killed: "cruza o mínimo depois de 7 dias…" (1 failed / 21) |

**Sensor depth**: P0 (integridade de dados: alertas e "nunca movimenta estoque"), manual: 20 mutações na rodada 1 + 6 execuções na rodada 2 (3 re-testes, 3 novas).
**Result**: 23/23 mutantes distintos mortos na versão atual (M1–M23) — PASS ✅.

---

## Code Quality

| Principle | Status |
| --- | --- |
| Minimum code | ✅ |
| Surgical changes | ✅ A rodada 2 só acrescentou testes e linhas de spec; nenhum arquivo de produção mudou (`git diff` do working tree). A remoção do subtítulo agora está registrada em `front-dashboard-resumo/spec.md:33` |
| No scope creep | ✅ |
| Matches patterns | ✅ Os testes novos usam os helpers existentes (`material`, `calAbaixo`, `alerta`, `diasAtras`, `snapshot`, `Roteiro`, `dadosCriados`, `finalizacao`), no estilo de `obras.service.spec.ts` |
| Spec-anchored outcome check | ✅ 69/69 |
| Per-layer Coverage Expectation (`tasks.md:22-31`) | ✅ Os ramos AGENTE de `alertaReabrivel` e "sem consumo" de `textoPadrao` agora têm teste |
| Every test maps to a spec requirement | ✅ Os 5 testes novos citam EAP-52, a assumption de `spec.md:55`, o edge case de `spec.md:255` ou EAP-69 |
| Documented guidelines followed: `CLAUDE.md` (Convenções, Testes), Test Coverage Matrix de `tasks.md` | ✅ |

Observações de leitura (não bloqueiam):
- `agente-estoque.service.spec.ts:452`: o teste muda só `diasJanela` no snapshot, e o `indicador` continua calculado com 30 (`:111-118`). Como o consumo é 0, o indicador não depende da janela, então o cenário é coerente.
- `agente-estoque.service.spec.ts:478-480`: `totalAlertas: 0` vem do mock de `count` (`:185`), não do código. Ver a observação na seção "Rodada 2".
- `front-dashboard-resumo/spec.md:33` escreve o título como "Visao geral", sem acento, igual a `pages/Dashboard.tsx:31`. O título sem acento é anterior a esta feature e está fora de escopo.
- As observações da rodada 1 sobre `CardAlertaEstoque.tsx:42-51` e `agente-estoque.service.ts:153-162` continuam valendo, sem mudança.

---

## Edge Cases

- [x] **Nenhum material → `SUCESSO`, zero alertas, "Estoque em dia"**: service `agente-estoque.service.spec.ts:475-480` (rodada 2; M21/M22 mortos); snapshot `previsao-estoque.service.spec.ts:320`; Dashboard `AlertasEstoque.test.tsx:250`.
- [x] **Material sem movimentação → ritmo 0, alerta só se `<`**: `calculo-estoque.spec.ts:128-131`, `:161`; texto com a janela real `agente-estoque.service.spec.ts:458-466`.
- [x] **`=` mínimo com ritmo > 0 → `diasAteMinimo = 0`**: `calculo-estoque.spec.ts:147`.
- [x] **Devoluções acima das saídas → utilizado 0**: `calculo-estoque.spec.ts:26`; `previsao-estoque.service.spec.ts:282-283`.
- [x] **Material com < 7 dias → janela 7**: `calculo-estoque.spec.ts:49`; `previsao-estoque.service.spec.ts:192`.
- [x] **SAIDA de obra CANCELADA**: `previsao-estoque.service.spec.ts:169`.
- [x] **Obra concluída/cancelada deixa de reservar sem gravação**: `previsao-estoque.service.spec.ts:296`, `:323`.
- [x] **Saldo livre negativo → fórmula C**: `calculo-estoque.spec.ts:202-208`.
- [x] **Duas sugestões do mesmo material → vale a última**: `ferramentas-agente.spec.ts:531-539`.
- [x] **Ferramenta inexistente/argumentos inválidos**: `agente-estoque.service.spec.ts:291-296`; `ferramentas-agente.spec.ts:550-576`.
- [x] **`stop_reason = refusal` → `FALHA`**: `agente-estoque.service.spec.ts:388-389` (it.each `:383`).
- [x] **401 → logout de `lib/api.ts`**: nenhum código novo. n/a.

---

## Gate Check

- **Gate command**: `npm run build && npm test` (raiz), rodado como `npx jest --ci` + `npm run build` em `apps/api` e em `apps/web`, no repo real
- **API**: 15 suites, **236 passed, 0 failed, 0 skipped**, exit 0
- **Web**: 20 suites, **137 passed, 0 failed, 0 skipped**, exit 0
- **Build**: `apps/api` (`nest build`) exit 0; `apps/web` (`tsc --noEmit && vite build`) exit 0
- **Test count before feature** (`dfc1552`, medido na rodada 1): API 48, web 67
- **Test count after feature**: API 236 (231 na rodada 1 + 5 novos), web 137
- **Delta**: +188 API, +70 web
- **Integridade**: o diff da rodada 2 só acrescenta `it(...)` (5 testes); nada removido nem enfraquecido; nenhum `skip`/`only`/`todo`.
- **Não executado de propósito**: `prisma migrate`, seed, `POST /estoque/agente/analisar` real.

---

## Fix Plans

Nenhum fix pendente. Os Fixes 1–4 da rodada 1 foram feitos:

| Fix (rodada 1) | Status |
| --- | --- |
| Fix 1: EAP-52, ramo AGENTE (M19) | ✅ `agente-estoque.service.spec.ts:719-742` |
| Fix 2: fronteira de 7 dias (M6) | ✅ EAP-69 (`spec.md:136`) + `calculo-estoque.spec.ts:239-267` |
| Fix 3: texto com a janela real (M20) | ✅ `agente-estoque.service.spec.ts:450-467` |
| Fix 4: subtítulo do Dashboard | ✅ registrado como decisão do usuário em `front-dashboard-resumo/spec.md:33` |
| (extra) edge case de zero materiais | ✅ `agente-estoque.service.spec.ts:469-481` |

Opcional, Cosmetic: tirar `totalAlertas: 0` da asserção do edge case ou fazer o mock de `count` refletir as criações. Hoje essa parte é tautológica, mas o `status` já discrimina.

---

## Requirement Traceability Update

Proposta (este Verifier não altera o `spec.md`):

| Requirement | Previous Status | New Status |
| ----------- | --------------- | ---------- |
| EAP-01..EAP-68 | Implementing | ✅ Verified |
| EAP-69 | Implementing | ✅ Verified |

Os testes e a spec da rodada 2 ainda não foram commitados. O Verified vale para o estado `5396f21` + working tree atual, e o commit desses 5 arquivos tem de acompanhar a mudança de status.

---

## validate_state.py e lições

- **validate_state.py**: não rodou. Não há `python` no PATH, e o script procura `<root>/.specs/features/`, enquanto este projeto usa `.claude/specs/features/` (detalhe na rodada 1). Conferi lendo, como na rodada 1: veredito preenchido no topo (PASS ✅) e evidência `file:line` em todas as tabelas de AC, sensor e edge cases.
- **lessons.py**: não rodou (instrução da rodada). As lições da rodada 1 continuam valendo e foram confirmadas pelas correções; a rodada 2 acrescenta a lição 4.

## Lições

1. **Teste cada saída de uma regra de reabertura/criação, não só a feliz.** Quando a spec diz "X reabre; Y ou Z criam registro novo", cada condição precisa de um cenário. E o cenário de Z tem de ficar fora das outras travas (aqui, 4 dias > tolerância de 3) para discriminar a condição e não a data (M19).
2. **Fronteira declarada na spec vira teste de fronteira, dos dois lados.** Constante com `<=`/`<` nas Assumptions pede um caso no valor exato e outro logo acima (7 e 7,01), e de preferência um AC próprio (EAP-69). Os dois lados mataram M6 e M23.
3. **Texto padrão parametrizado pede teste do parâmetro com valor ≠ default.** Janela 12, não 30 (M20).
4. **Asserção sobre valor que vem de mock não prova nada.** `totalAlertas: 0` com `count` mockado em 0 passa com qualquer código. Para discriminar um edge case, asserte o que o código decide (`status`) e confirme com um mutante (M21/M22).

---

## Summary

**Overall**: ✅ Ready

**Spec-anchored check**: 69/69 ACs com asserção no valor da spec; 0 spec-precision gaps
**Sensor**: 23/23 mutantes distintos mortos (M6, M19, M20 re-testados e mortos; M21, M22, M23 novos e mortos)
**Gate**: API 236 passed, web 137 passed, 0 failed; builds ok

**What works**: tudo o que a rodada 1 já tinha travado, mais o ramo "fechado pelo agente → registro novo", o texto padrão com a janela real, a fronteira de 7 dias (EAP-69, dos dois lados) e o edge case sem materiais.

**Next steps**: o usuário commita os 5 arquivos do working tree (2 specs de teste, `spec.md`, `tasks.md`, `front-dashboard-resumo/spec.md`) e este `validation.md`, e marca EAP-01..69 como Verified na rastreabilidade do `spec.md`.
