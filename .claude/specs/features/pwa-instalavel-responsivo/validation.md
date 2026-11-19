# PWA Instalável e Responsivo — Validação (rodada 2)

> **Rodada 2 em andamento** (Verifier independente, 2026-11-09). Baseline `git status --porcelain`: vazio.
> Relatório da rodada 1 guardado só como lista de reconferência. Checkpoints abaixo são atualizados a cada etapa.

## Checkpoints da rodada 2
- [x] Leitura spec/design/tasks/STATE e diff T32–T38 (38/38 tasks marcadas concluídas)
- [x] Checagem ancorada no spec: rascunho pronto (scratchpad r2/corpo.md); Edge Case do nome longo depende do mutante RR1. API unit: 7/7 mortos (N30, N31, RA1, RA2b, RA3–RA5; RA2 descartado por erro de compilação). e2e: RE1 morto (2 falhas)
- [x] Suítes base: web 329/329, API unit 284/284, e2e 14/14 (container), build OK (`checar-build: OK ... tags do iPhone`), audit:pwa 14/14
- [x] Sensor: mutantes web unit — 32/32 mortos (N01–N07 T32, N10–N15 T33 incl. o sobrevivente da rodada 1, N20–N21 T37, R01–R17 regressão), nenhum por erro de TS
- [x] Sensor: build/navegador 5/5 mortos — B1 sw.ts com StaleWhileRevalidate (3 falhas), B2 tags do iPhone (checar-build 2 falhas PWA-02), B3 auditoria sem travar a cota (armazenamento cheio: gravadas 1), B4 SW grava antes de responder (armazenamento cheio: dados na tela false), B5 sem denylist (OFF-01)
- [ ] Sensor: mutantes da audit:responsive
- [x] audit:pwa base 14/14; audit:responsive base `medidos: 118/118, nao montados: 0, falhas: 0` + troca de largura OK
- [ ] Limpeza final (git, banco, preview, dist, containers)

---

## Verificação manual (decisão do usuário, 2026-11-09)

Ficam fora da automação, por decisão do usuário. Rodar antes de fechar a feature e registrar aqui data, aparelho e resultado.

### UPD-01/02: versão nova instala e ativa sozinha

1. `npm run build --workspace apps/web` + `npx vite preview --port 4173` (ou o deploy da Vercel); abrir o app logado e esperar o SW ativo (DevTools > Application > Service Workers: "activated and is running").
2. Mudar um texto visível qualquer (sem commitar), gerar o build de novo e manter o preview no ar.
3. Com a aba aberta, trocar de aba do app algumas vezes: a página **não** recarrega sozinha e continua abrindo todas as telas (UPD-03/04).
4. Em DevTools > Application > Service Workers, o SW novo aparece instalado e ativado sem clique em "skipWaiting" (UPD-01/02).
5. Recarregar a página: o texto novo aparece. Desfazer a mudança e gerar o build de novo.

### RSP-11/12: altura dinâmica e safe areas

1. Num iPhone com notch, abrir o app pelo Safari e rolar: o rodapé e a barra inferior acompanham a barra de endereço que aparece e some (`100dvh`, RSP-11).
2. Instalar pela "Adicionar à Tela de Início" e abrir pelo ícone: o topo não fica sob o notch e a barra inferior não fica sob a barra de gestos (RSP-12).

| Item | Data | Aparelho / navegador | Resultado |
| --- | --- | --- | --- |
| UPD-01/02 | | | |
| RSP-11 | | | |
| RSP-12 | | | |

