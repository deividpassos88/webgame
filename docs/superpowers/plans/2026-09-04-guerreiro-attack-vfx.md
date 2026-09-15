# Guerreiro Attack VFX Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Exportar as onze animações do guerreiro e entregar seis VFX WebGL sincronizados aos ataques.

**Architecture:** O GLB leva apenas rig, malha, espada, clipes e três nós de referência. Um controlador Three.js de buffers fixos desenha fitas, faíscas, fumaça e impacto, enquanto `Player` escolhe o mesmo identificador para animação e perfil visual.

**Tech Stack:** Blender 5.2, glTF 2.0/GLB, TypeScript 5.4, Three.js 0.161, Vitest 4, Vite 5.

**Spec:** `docs/superpowers/specs/2026-09-04-guerreiro-attack-vfx-design.md`

## Global Constraints

- Preservar as onze Actions existentes e normalizar apenas seus nomes.
- Exportar para `public/models/Guerreiro/guerreiro_animado.glb`.
- Não exportar partículas ou volumes do Blender.
- Usar no máximo duas fitas, 96 faíscas, 32 partículas de fumaça e quatro draw calls adicionais.
- Não criar objetos, geometrias, materiais, arrays ou vetores no frame loop.
- Preservar dano, alcance e três estágios do combo existente.
- O workspace não possui Git; registrar verificações sem inicializar repositório.

---

### Task 1: Preparar e exportar o asset Blender

**Files:**
- Modify: `C:/Users/pteix/Downloads/personagem HD/personagem_final.blend`
- Create: `public/models/Guerreiro/guerreiro_animado.glb`

**Interfaces:**
- Produces: Actions com nomes da tabela da especificação e nós `VFX_SwordBase`, `VFX_SwordTip`, `VFX_Impact` filhos de `sword`.

- [ ] **Step 1: Inspecionar Actions, NLA, armature, espada e bounds locais.**

  Executar leitura via Blender MCP e confirmar 11 Actions, um Armature, a espada parentada a `mixamorig:RightHand` e eixo longo local Z.

- [ ] **Step 2: Normalizar nomes e criar os nós.**

  Renomear Actions, strips e tracks pela tabela da especificação. Posicionar `VFX_SwordBase` em `(0, 0, -0.72)`, `VFX_SwordTip` em `(0, 0, 0.97)` e `VFX_Impact` em `(0, 0, 0.82)` no espaço local da espada; cada nó é um Empty do tipo `PLAIN_AXES`.

- [ ] **Step 3: Validar a cena antes de salvar.**

  Para cada Action, amostrar início, meio e fim; confirmar transforms finitos, espada ainda parentada ao osso e distância base–tip positiva. Confirmar nomes únicos e ausência de Actions duplicadas.

- [ ] **Step 4: Salvar e exportar GLB.**

  Salvar o `.blend`; exportar com animações, NLA strips, skinning e nós vazios, sem câmeras/luzes. Usar `export_yup=True`, `export_apply=False` e formato `GLB`.

- [ ] **Step 5: Reabrir o GLB em processo Blender isolado.**

  Confirmar 11 animações, um armature, duas meshes e os três nós VFX; registrar tamanho em bytes e nomes exportados.

### Task 2: Resolver clipes do novo guerreiro

**Files:**
- Modify: `src/characters/CharacterCatalog.ts`
- Modify: `src/characters/CharacterAnimations.ts`
- Modify: `src/characters/CharacterAnimations.test.ts`
- Modify: `src/characters/PlayableCharacter.test.ts`

**Interfaces:**
- Produces: `WarriorAttackId`, `WARRIOR_ATTACK_IDS`, `resolveWarriorAttackClips(characterId, source)` e idle estático derivado de `caminhando`.

- [ ] **Step 1: Escrever testes vermelhos.**

  Testar que o paladino usa `/models/Guerreiro/guerreiro_animado.glb`, resolve os seis nomes literais na ordem aprovada e que o idle derivado possui duração positiva sem deslocamento entre primeiro e último valor de cada track.

- [ ] **Step 2: Executar `npm test -- src/characters/CharacterAnimations.test.ts src/characters/PlayableCharacter.test.ts`.**

  Esperado: falha porque o catálogo ainda aponta para o GLB antigo e a API dos seis ataques não existe.

- [ ] **Step 3: Implementar catálogo e resolução mínima.**

  Adicionar ao `CharacterDefinition` `attackClipNames?: readonly WarriorAttackId[]` e `idlePoseSource?: string`. Clonar cada clipe de ataque sem alterar o original. Para idle, clonar cada track com os valores do primeiro keyframe repetidos em `0` e `1/30` segundo.

- [ ] **Step 4: Reexecutar os dois testes e `npm run typecheck`.**

  Esperado: aprovação.

### Task 3: Criar perfis e controlador VFX de buffers fixos

**Files:**
- Create: `src/effects/WarriorAttackVfxProfiles.ts`
- Create: `src/effects/WarriorAttackVfxProfiles.test.ts`
- Modify: `src/effects/SwordTrail.ts`
- Modify: `src/effects/SwordTrail.test.ts`

**Interfaces:**
- Produces: `getWarriorAttackVfxProfile(id)`, `SwordTrail.setAttack(id)`, `SwordTrail.update(delta)`, `SwordTrail.burst()` e `SwordTrail.activeParticleCount`.

- [ ] **Step 1: Escrever testes vermelhos dos seis perfis.**

  Usar valores literais para conferir os seis IDs, cores principal/secundária, flags de fumaça/impacto e limites `sparkCount <= 96`, `smokeCount <= 32`.

- [ ] **Step 2: Escrever testes vermelhos do comportamento visível.**

  Anexar uma espada real de fixture contendo `VFX_SwordBase` e `VFX_SwordTip`; ativar, mover a ponta, chamar `update(1/60)` e verificar positions finitas, mesh visível e partículas limitadas. Desativar e confirmar fitas ocultas; chamar `dispose()` duas vezes sem erro.

- [ ] **Step 3: Executar `npm test -- src/effects/WarriorAttackVfxProfiles.test.ts src/effects/SwordTrail.test.ts`.**

  Esperado: falha pela API inexistente.

- [ ] **Step 4: Implementar perfis e pools.**

  Manter duas fitas com histórico fixo de 18 amostras. Criar `Points` fixos de 96 faíscas e 32 partículas de fumaça; atualizar posições, velocidades e vida em typed arrays existentes, compactando partículas expiradas. Resolver primeiro os nós VFX e usar bounds da mesh `RuntimeWarrior_SwordBlade` como fallback.

- [ ] **Step 5: Reexecutar testes e typecheck.**

  Executar `npm test -- src/effects/WarriorAttackVfxProfiles.test.ts src/effects/SwordTrail.test.ts && npm run typecheck`; esperado: aprovação.

### Task 4: Integrar seis animações e VFX ao combo

**Files:**
- Modify: `src/entities/Player.ts`
- Modify: `src/entities/PlayerCombo.integration.test.ts`
- Modify: `src/equipment/WeaponAttachment.ts`
- Modify: `src/equipment/WeaponAttachment.test.ts`

**Interfaces:**
- Consumes: `resolveWarriorAttackClips`, `WARRIOR_ATTACK_IDS`, `SwordTrail.setAttack`, `SwordTrail.burst`.
- Produces: rotação determinística dos seis ataques em dois combos consecutivos.

- [ ] **Step 1: Escrever teste vermelho da rotação.**

  Carregar fixtures com seis AnimationClips, executar dois combos completos e observar por um getter de diagnóstico somente-leitura que a ordem é `ataque_basico`, `ataque_giratorio`, `ataque_giratorio_2`, `pulo_atacando`, `triplo_ataque`, `corte_duplo`.

- [ ] **Step 2: Escrever teste vermelho de cancelamento e aliases de osso.**

  Confirmar que `mixamorig:RightHand` aceita equipamento e que dano, morte ou machado deixam o VFX inativo e sem partículas vivas.

- [ ] **Step 3: Executar os testes de integração.**

  Executar `npm test -- src/entities/PlayerCombo.integration.test.ts src/equipment/WeaponAttachment.test.ts`; esperado: falha da nova rotação e alias ainda ausentes.

- [ ] **Step 4: Implementar integração mínima.**

  Criar as seis actions no load, escolher uma por estágio, escalar ao tempo do estágio e avançar o cursor somente em `stage-started`. Em `damage-opened`, ativar e emitir burst; em fechamento/cancelamento, ocultar e limpar. Normalizar nomes de osso removendo `:`, `_`, `-` e diferenças de caixa no `findBone`.

- [ ] **Step 5: Executar testes focados, typecheck e build.**

  Executar `npm test -- src/entities/PlayerCombo.integration.test.ts src/equipment/WeaponAttachment.test.ts src/effects/SwordTrail.test.ts && npm run typecheck && npm run build`; esperado: aprovação.

### Task 5: Verificação integrada e inspeção visual

**Files:**
- Modify only if verification exposes a tested defect.

**Interfaces:**
- Consumes: asset exportado e aplicação compilada.

- [ ] **Step 1: Executar a suíte completa.**

  Executar `npm test`, `npm run typecheck` e `npm run build`; exigir código zero em todos.

- [ ] **Step 2: Iniciar servidor local e abrir o jogo.**

  Executar `npm run dev -- --host 127.0.0.1`, abrir a URL no navegador integrado e confirmar carregamento sem erro de GLB.

- [ ] **Step 3: Verificar visualmente os seis perfis.**

  Equipar espada, executar ataques até completar dois combos e confirmar: azul, verde, roxo, dourado, fogo/fumaça e roxo/laranja; conferir que nenhum efeito permanece após o fim.

- [ ] **Step 4: Verificar fallback e machado.**

  Equipar machado e confirmar ausência de VFX de espada; interromper um golpe e confirmar limpeza imediata.

- [ ] **Step 5: Registrar evidências finais.**

  Informar contagem de testes, resultado do build, tamanho do GLB, nomes de animações e limitações visuais observadas.
