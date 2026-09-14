---
name: check-specs
description: Valida todas as specs de feature do projeto (.claude/specs/features/*/spec.md) contra o gate estrutural da metodologia tlc-spec-driven (critérios de aceite em EARS, assumptions preenchidas, IDs de requisito bem-formados). Use quando o usuário pedir para checar, validar ou revisar as specs, ou antes de considerar uma spec pronta para virar tasks/implementação.
---

# Checar as specs do projeto

As specs deste repo ficam em `.claude/specs/features/<slug>/spec.md` — **não** no local padrão
`.specs/` que a skill `tlc-spec-driven` (instalada em `~/.claude/skills/tlc-spec-driven`) assume
por convenção. Por isso, o validador precisa ser chamado com o caminho explícito de cada spec, sem
depender do auto-detect dela.

## Passos

1. Localizar o script: `~/.claude/skills/tlc-spec-driven/scripts/validate_spec.py` (ajustar o
   caminho do home do usuário conforme o SO; neste projeto usar `python`, não `python3` — a máquina
   não tem `python3` no PATH).

2. Para cada `spec.md` sob `.claude/specs/features/*/`, rodar:
   ```
   python "<caminho-do-skill>/scripts/validate_spec.py" ".claude/specs/features/<slug>/spec.md"
   ```

3. Reportar pass/fail por feature. Exit code 0 = limpo; exit code 1 = tem erro (o script já imprime
   `ERROR`/`WARN` linha a linha).

4. Se existir `tasks.md` para alguma feature (fase Tasks já rodou), validar também com
   `~/.claude/skills/tlc-spec-driven/scripts/validate_tasks.py`, mesmo caminho explícito.

5. Um erro reportado pelo script deve ser corrigido no `spec.md` (nunca ignorado) antes de a spec
   ser considerada pronta — corrigir e rodar de novo até sair limpo.
