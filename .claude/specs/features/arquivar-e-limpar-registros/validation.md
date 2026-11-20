# Arquivar e Limpar Registros — Validação

## Veredito: ✅ PASS

Os 15 requisitos (ARQ-01..ARQ-15) estão implementados, e cada um tem teste que mata mutante.

- **Pendente do usuário**: o teste manual pela UI, último item da T17: arquivar, ver arquivados e restaurar nas três telas.
- **Quem verificou**: o autor, na mesma sessão, porque o usuário pediu execução inline. A independência veio de dois `auditor-de-testes` (AD-012), um para a API e um para o front, rodados como sub-agentes só leitura. Todas as lacunas que eles acharam viraram teste, com uma exceção aceita com motivo (ver "Auditoria de testes").

Diff: working tree sobre `b6a11ce`, branch `feat/arquivar-e-limpar-registros`, ainda não commitado.

## Gate (2026-11-20, código final)

| Gate | Resultado |
|---|---|
| `npm run build` (API + web) | OK |
| `npm run test --workspace apps/api` | 490 passed (base 397) |
| `npm run test --workspace apps/web` | 436 passed (base 371) |
| `docker exec gesso_api npm run test:e2e -- --runInBand` | 22 passed (eram 19); zero `[e2e]` no banco depois (psql) |
| `npm run audit:responsive --workspace apps/web` (vite preview 4173) | `medidos: 158/158, nao montados: 0, falhas: 0` (era 126); fixture limpa |
| `npm run audit:pwa --workspace apps/web` | `conferencias: 14/14 ok` |
| Swagger `/docs-json` | `GET /api/obras/{id}/arquivamento` e `PATCH .../arquivar` e `.../restaurar` nas três entidades; `DELETE /api/obras/{id}` e `DELETE /api/gesseiros/{id}` removidos |
| Migration `20261120144746_arquivamento` | só `ADD COLUMN`, aplicada; as 5 obras reais continuam |

## Checagem ancorada no spec

| Req | Implementação | Evidência |
|---|---|---|
| ARQ-01 valor recebido ≤ total | `apps/api/src/obras/obras.service.ts:114`, `dto/update-obra.dto.ts` | `obras.service.spec.ts` "update: valorRecebido": 0/4250.5/8500 gravam; 8500.01 → mensagem exata; total do mesmo PATCH; `??` com 0 nos dois campos. `valor-recebido.dto.spec.ts`: negativo, texto, 3 casas; Create recusa |
| ARQ-02 card com "Recebido X de Y" | `apps/web/src/components/forms/ValorRecebidoForm.tsx`, `pages/Obras.tsx` | `ValorRecebidoForm.test.tsx` (texto, min/max/step, PATCH com número, erro sem recarga); `Obras.test.tsx` (todo card, PATCH e recarga) |
| ARQ-03 situação e regras do arquivar | `obras.service.ts:273` (`situacaoArquivamento`), `:310` (`arquivar` no `tx`) | `obras-arquivamento.spec.ts` (cada condição sozinha, ordem das 3 mensagens, `where {id, status: CONCLUIDA, arquivadoEm: null}` no `tx`); e2e `arquivamento.e2e-spec.ts:105` (pendência do gesseiro, "recebido R$ 0,00 de R$ 8.000,00") |
| ARQ-04 só CONCLUIDA; sem hard delete | `obras.controller.ts:111-125` (rotas novas; `@Delete` removido) | `obras-arquivamento.spec.ts` ("não concluída", CANCELADA); Swagger sem `DELETE` |
| ARQ-05 diálogo com as duas confirmações | `apps/web/src/components/ArquivarObra.tsx` | `ArquivarObra.test.tsx` (só em CONCLUIDA, ✔/✘, `<nome> — <saldo>`, só gesseiro pendente desabilita, clique duplo → 1 PATCH, HTTP recarrega, rede não reenvia); `Obras.test.tsx` (filtro "Concluidas": recarrega com `?status=CONCLUIDA` e o card sai) |
| ARQ-06 listas sem arquivados | `obras.service.ts:71`, `gesseiros.service.ts:34`, `estoque.service.ts:27`, `comum/arquivados.ts` | `arquivados.spec.ts`; `obras-arquivamento.spec.ts` (findAll/resumo); `gesseiros-arquivamento.spec.ts` "findAll"; `estoque-arquivamento.spec.ts` "listas"; e2e `:105` (some de `/obras`, aparece em `?arquivados=true`) |
| ARQ-07 restaurar | `obras.service.ts:343`, `gesseiros.service.ts:173`, `estoque.service.ts:163`, `components/ListaArquivados.tsx` | specs de restaurar nas três entidades (condicional, 400 com a mensagem exata, 404); e2e `:184` (volta CONCLUIDA, `arquivadoEm` null); `ListaArquivados.test.tsx` |
| ARQ-08 "Ver arquivados" com a data da limpeza | `ListaArquivados.tsx`, `lib/formato.ts` (`dataLimpeza`) | `formato.test.ts` (27/11/2026, virada de ano, vazio → "-"); `ListaArquivados.test.tsx`; testes das três páginas (abrir, restaurar, recarregar os arquivados depois de arquivar) |
| ARQ-09 gesseiro: saldo 0 e sem obra aberta | `gesseiros.service.ts:137`, `gesseiros/saldo.ts` | `gesseiros-arquivamento.spec.ts` (±saldo em BRL, ORCAMENTO/FECHADA/ANDAMENTO bloqueiam, CONCLUIDA/CANCELADA não, já arquivado sem consultar o saldo, `ativo=false`); `saldo.spec.ts` |
| ARQ-10 UI do gesseiro | `pages/Gesseiros.tsx`, `lib/arquivamento.ts` | `Gesseiros.test.tsx` "arquivamento" (desabilitado com "Zere o saldo para arquivar" em 350.5 e −20, confirm exato, clique duplo, HTTP recarrega lista e extrato, rede não) |
| ARQ-11 material arquivado fora do uso e do agente | `estoque.service.ts:79`, `materiais-previstos.service.ts:57`, `agente-estoque/previsao-estoque.service.ts:87,104`, `alertas-estoque.service.ts:69,94` | `estoque-arquivamento.spec.ts` (movimentação, previsto novo, previsto já existente aceito, `select` com `arquivadoEm`, `substituir` sem transação); specs do agente e dos alertas conferem o `where` |
| ARQ-12 material arquivável com saldo; 409 do nome | `estoque.service.ts:45,150`, `pages/Estoque.tsx` | `estoque-arquivamento.spec.ts` (409 com a mensagem exata, sem `create`); e2e `:204`; `Estoque.test.tsx` (confirm com o saldo, sem saldo, recusado, clique duplo, rede) |
| ARQ-13 limpeza depois de 7 dias | `apps/api/src/limpeza/limpeza.service.ts:30` (cron 3h), `:43`, `:141` | `limpeza.service.spec.ts` (limite com `lte`, ordem das entidades, `obraId → null` antes do delete, alocações e previstos antes, uma transação por registro, falha não para o job); e2e `:105` (8 dias: saldo e créditos iguais, lançamentos com `obraId null`; o gesseiro também é limpo) |
| ARQ-14 celular | `apps/web/src/index.css` (bloco "Arquivamento" e alvos de 44px), `scripts/audit-responsive.mjs` (4 estados novos), `apps/api/scripts/fixture-auditoria.mjs` | 158/158; a mutação CSS abaixo foi morta |
| ARQ-15 concorrência | `obras.service.ts:310` (update condicional), `limpeza.service.ts:116` (trava e reconfere) | e2e `:105` (2 arquivar em paralelo → [200, 400]); `limpeza.service.spec.ts` (restaurado no meio, por entidade); e2e `:184` (restaurado antes do job fica) |

## Sensor de discriminação

Os mutantes foram aplicados um por vez numa cópia isolada (`scratchpad/sensor`, com junctions para os `node_modules`), nunca na árvore real. A cópia foi apagada no fim, com as junctions removidas antes, e os testes da árvore real rodaram de novo, todos verdes.

| # | Mutação | Resultado |
|---|---|---|
| A1 | `recebido > total + 1` | morto (2) |
| A2 | `arquivar` sem `arquivadoEm: null` no where | morto (1) |
| A3 | gesseiro arquivado sem `ativo: false` | morto (1) |
| A4 | sem o 409 do nome arquivado | morto (1) |
| A5 | movimentação aceita material arquivado | morto (1) |
| A6 | previsto já existente também recusado | morto (2) |
| A7 | agente sem o filtro de arquivado | morto (1) |
| A8 | limite `lt` em vez de `lte` | morto (2) |
| A9 | limpeza sem desvincular os lançamentos | morto (1) |
| A10 | trava sempre `true` | morto (1) |
| A11 | limpeza fora da transação | morto (6) |
| A12 | arquivados em ordem crescente | morto (4) |
| R1 | `select` sem `arquivadoEm` | morto pelo typecheck (o build também falha) |
| R2–R5 | lacunas do auditor da API (`jaPrevistos` errado, `\|\|` nos dois `??`, tabela trocada na trava) | mortos depois dos testes novos |
| W1–W8 | arquivar sem `podeArquivar`, botão fora de CONCLUIDA, restaurar recarregando na rede, `> 0` no gesseiro e no aviso, 6 dias, confirm ignorado, recebido como texto | todos mortos |
| W9–W21 | lacunas do auditor do front (só `clienteQuitado`, sem `ocupado`, painel some no rerender, painel não fecha, restaurar duplo, gesseiro sem `arquivando`, rede invertida em Gesseiros/Estoque, botão da tabela, `key={versaoArquivo}` nas 3 telas, `onAlterada={carregar}`) | mortos depois dos testes novos |
| CSS-1 | tirar `.lista-arquivados .btn` da regra de 44px | morto: RSP-08 nas três listas em 320–768 (botão 100x40) |

## Auditoria de testes

Rodaram dois `auditor-de-testes` (AD-012): um para a API e outro para o front.

**API.** A cobertura é real nas mutações de operador, `where` condicional e `tx`/`prisma`. Os mocks declaram todo método que os services chamam. O auditor achou 6 lacunas:

| # | Mutação sem teste | Destino |
|---|---|---|
| 1 | `select` sem `arquivadoEm` em `validarItens` | teste do `select` (e o typecheck já pegava) |
| 2 | `jaPrevistos` com a lista errada | teste `substituir` com material arquivado novo → 400 sem transação |
| 3/4 | `\|\|` no lugar de `??` (recebido 0 / total 0) | 2 testes em "update: valorRecebido" |
| 5 | trava de uma entidade usando a tabela de outra | `it.each` com só uma trava em 0 |
| 18 | checagem de já arquivado depois do saldo | `groupBy` não chamado no teste "já arquivado" |
| 27 | `lancamento.updateMany` sem `await` | **aceita**: equivalente. A FK `obraId` já é `ON DELETE SET NULL` (migration init), então o efeito no banco é o mesmo. Tirar a linha inteira é pego pelo unitário (A9) |

**Front.** A cobertura dos componentes e helpers é real; nas páginas havia 11 lacunas: #2, #5, #6, #8, #12, #20 e #22 a #26. Todas viraram teste (W9–W21 acima). Os três testes fracos que ele apontou foram reforçados:
- o "arquivar" de Obras agora usa o filtro "Concluidas" e confere que o card sai;
- o erro de Gesseiros agora confere a recarga de lista e extrato;
- o clique duplo ganhou um teste próprio.

## Desvios e notas

- **Previsto com material arquivado**: o 400 vale só para um material que entra na lista agora. O que a obra já previa continua aceito até a limpeza, conforme a assumption "Arquivar material" e o ARQ-11 AC3 ("previsto novo").
- **Reformatação**: o Prettier reformatou algumas linhas vizinhas nos arquivos que a feature já tocava. Arquivos fora da feature que o formatador tinha mexido foram restaurados do HEAD.
- **Limpeza apaga todo vencido do banco**: o `limpar()` do e2e, assim como o cron, apaga qualquer arquivado com 7 dias ou mais, não só os `[e2e]`. O banco de dev não tinha nenhum arquivado quando o e2e rodou.
