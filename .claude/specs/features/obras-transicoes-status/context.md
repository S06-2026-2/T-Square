# Obras — Transições de Status Context

**Gathered:** 2026-10-19
**Spec:** `.claude/specs/features/obras-transicoes-status/spec.md`
**Status:** Ready for design (assumptions confirmadas em 2026-10-29)

---

## Feature Boundary

Transições do status da obra pela UI e pela API, só nas direções válidas do funil
(`ORCAMENTO → FECHADA → ANDAMENTO → CONCLUIDA`, mais o cancelamento a partir de qualquer status em
aberto), sem atalhos por `POST`/`PATCH` genéricos e com os créditos de conclusão gerados exatamente
uma vez.

---

## Implementation Decisions

### Ordem do funil

- Sequencial estrita, sem pular etapas: concluir só a partir de `ANDAMENTO`, iniciar só a partir de `FECHADA`, fechar só a partir de `ORCAMENTO`.

### Cancelamento

- Permitido a partir de `ORCAMENTO`, `FECHADA` e `ANDAMENTO`.
- Exige motivo, que é persistido na obra.
- Não gera nenhum lançamento; vales/pagamentos já existentes permanecem.

### Pré-condições

- Iniciar exige pelo menos 1 gesseiro alocado.
- Fechar **não** exige pagamento definido.

### Retrocesso

- Não existe. `CONCLUIDA` e `CANCELADA` são finais. Se o cliente desistiu, a obra é cancelada.

### Agent's Discretion

Nenhuma área foi deixada explicitamente como "você decide".

### Declined / Undiscussed Gray Areas → Assumptions

Não foram discutidos e estão registrados como assumptions (`Confirmed? = n`) no `spec.md`:
- contrato da API (endpoint por transição);
- remoção de `status` dos DTOs;
- 400 e formato da mensagem;
- datas gravadas por transição;
- limites do motivo;
- estratégia de concorrência;
- bloqueio da remoção do último gesseiro em obra `ANDAMENTO`;
- confirmação na UI;
- botão "Iniciar obra" visível mesmo sem equipe.

---

## Specific References

- Seguir o padrão de `PATCH /obras/:id/concluir` (`apps/api/src/obras/obras.service.ts:128`) para os novos endpoints.
- Rótulos dos botões: "Cliente aprovou", "Iniciar obra", "Concluir obra", "Cancelar obra".

---

## Deferred Ideas

- `DELETE /obras/:id` faz hard delete; deveria seguir AD-003 (soft delete ou bloquear obra com histórico). Hoje ele falha por FK quando há lançamentos.
- Chip de filtro "Canceladas" em `Obras.tsx`.
- Histórico/auditoria de transições (quem e quando).
- Estorno de créditos para permitir reabrir obra concluída.
