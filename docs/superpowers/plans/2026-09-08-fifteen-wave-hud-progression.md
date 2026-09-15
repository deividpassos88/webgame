# Quinze Ondas, Skills Progressivas e HUD de Vidro Compacto Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** expandir a campanha para quinze ondas, liberar skills por nível com dano progressivo e organizar o HUD em uma coluna de utilidades mais barras percentuais compactas.

**Architecture:** `CharacterProgression` passa a aceitar contexto de onda e calcula níveis com limiares crescentes. `PlayerProfile` transporta esse contexto e `Game` atualiza o mesmo objeto de perfil para não quebrar a referência do modal. `WarriorSkillProgression` centraliza ordem de liberação e multiplicadores; `HUD` e `Game` apenas leem essa regra. A marcação de quinze ondas vive em `WaveManager` e chega a `WaveHudView`. A estrutura HTML contém o dock esquerdo e as barras do rodapé; o CSS final aplica uma única camada de estilos de vidro para não competir com regras antigas.

**Tech Stack:** TypeScript, Three.js, Vitest + happy-dom, Vite, CSS nativo.

**Spec:** `docs/superpowers/specs/2026-09-08-fifteen-wave-hud-progression-design.md`

## Global Constraints

- Desktop WebGL somente; viewport estreito não pode causar overflow horizontal.
- Cada nível concede exatamente 5 pontos; o caminho obrigatório fecha em 5.000 XP, nível 21 e 100 pontos.
- Ondas 1–8 usam 4/30 XP (normal/mini); ondas 9–15 usam 16/65; o boss final dá 10 XP uma vez.
- Os custos de nível são 60, 80, ..., 440 XP, pelo cálculo `40 + 20 × nível atual`.
- Ataque básico inicia disponível; as cinco skills abrem em níveis 2–6 e têm +10%, +14%, +18%, +22%, +26% de dano.
- Usar os dois PNGs fornecidos para Mochila e Status. Não usar emoji como ícone de interface.
- Não há repositório Git neste diretório; não criar commit, branch ou worktree.

### Task 1: Consolidar a progressão por onda

**Files:** `src/profile/CharacterProgression.ts`, `src/profile/CharacterProgression.test.ts`, `src/profile/PlayerProfile.ts`, `src/profile/PlayerProfile.test.ts`, `src/core/Game.ts`.

- [ ] Escrever testes que falham para XP de ondas 1/9, limiares crescentes, capítulo de 5.000 XP e preservação da referência do perfil.
- [ ] Rodar `npm test -- src/profile/CharacterProgression.test.ts src/profile/PlayerProfile.test.ts` e confirmar falha esperada.
- [ ] Implementar contexto `{ role, wave }`, limiar variável, migração de saves e atualização por `Object.assign` no mesmo objeto de perfil.
- [ ] Rodar os testes focados e `npm run typecheck`.

### Task 2: Liberar skills e multiplicadores de dano

**Files:** criar `src/combat/WarriorSkillProgression.ts` e teste; modificar `src/core/Game.ts`, `src/ui/HUD.ts`, e testes do HUD.

- [ ] Escrever testes que falham para a ordem, níveis e bônus de todas as cinco skills.
- [ ] Rodar o teste focado para confirmar que falta a regra.
- [ ] Implementar regra pura, bloquear teclas/cliques antes do nível necessário, aplicar multiplicador antes da queda por distância e exibir estado bloqueado.
- [ ] Rodar o teste focado e o conjunto de combate/HUD relevante.

### Task 3: Elevar as ondas para quinze

**Files:** `src/waves/WaveManager.ts`, `src/waves/WaveManager.test.ts`, `src/ui/WaveHudView.ts`, `src/ui/WaveHudView.test.ts`.

- [ ] Escrever testes que falham para onda 15, transição ao boss e texto `Onda n/15`.
- [ ] Rodar testes focados em vermelho.
- [ ] Implementar multiplicadores escalonados em quinze posições e expor total de ondas ao HUD.
- [ ] Rodar testes focados em verde.

### Task 4: Reposicionar HUD e compactar painéis

**Files:** `index.html`, `src/ui/HUD.ts`, `src/ui/InventoryOverlay.ts`, `src/style.css`, `src/ui/CharacterHudContract.test.ts`, `src/style.test.ts`, `src/ui/InventoryOverlay.test.ts`.

- [ ] Escrever testes de contrato que falham para retrato/dock à esquerda, XP/Mana/Vida percentuais e painel compacto em modo único.
- [ ] Rodar testes de UI focados em vermelho.
- [ ] Mover o dock para o canto, criar barra XP e suas porcentagens, usar estrutura curta para o overlay e aplicar CSS de vidro/foco/reduced-motion.
- [ ] Rodar testes de UI focados em verde.

### Task 5: Verificar a entrega

- [ ] Rodar `npm test`, `npm run typecheck`, `npm run build` e `npm run validate:warrior-glb`.
- [ ] Recarregar a aplicação, coletar captura desktop e viewport estreito, percorrer controles sem mouse e testar `prefers-reduced-motion: reduce` ativo.
- [ ] Conferir a spec contra todos os requisitos e relatar evidências, limites e qualquer ponto pendente sem alegar conclusão sem resultado fresco.

