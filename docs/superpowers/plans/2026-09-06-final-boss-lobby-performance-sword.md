# Final Boss, Lobby, Performance, and Sword Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the approved combat immunity, Blender sword, loot art, automatic lobby return, lobby attributes, boss mixed combat, and performance fixes.

**Architecture:** Keep profile/inventory state authoritative, extract small pure transition and boss-scheduling policies for testability, and share item rendering between all UI surfaces. Preserve the current Three.js runtime while lowering GPU churn through proximity lighting, shared transient assets, and a simplified final chest.

**Tech Stack:** TypeScript, Three.js, Vitest, Vite, Blender 5.2 MCP/Python, HTML/CSS.

**Spec:** `docs/superpowers/specs/2026-09-06-final-boss-lobby-performance-sword-design.md`

## Global Constraints

- Desktop WebGL only; do not add mobile controls or mobile layouts.
- Basic/skill/post-hit immunity values are exactly 0.4/1.0/0.2 seconds.
- Preserve 13 Warrior animations and export exactly one embedded sword.
- Use existing profile and inventory persistence.
- No Warrior VFX may be reintroduced.

---

### Task 1: Combat immunity timing

**Files:**
- Modify: `src/entities/Player.ts`
- Test: `src/entities/PlayerCombo.integration.test.ts`

**Interfaces:**
- Consumes: `Player.attackAtCursor`, `Player.tryStartSkillAttack`, damage methods.
- Produces: observable 0.4/1.0/0.2-second protection behavior.

- [ ] Write failing duration/boundary tests with literal elapsed values.
- [ ] Run the focused integration test and verify the expected failures.
- [ ] Change only the three timing constants/assignments required.
- [ ] Run the focused suite green.

### Task 2: Shared real item art

**Files:**
- Modify: `src/ui/HUD.ts`
- Modify: `src/ui/LobbyScreen.ts`
- Modify: `src/ui/CraftRewardsPresentation.ts`
- Modify: `src/style.css`
- Test: `src/ui/LobbyScreen.test.ts`
- Test: `src/ui/CharacterHudContract.test.ts`

**Interfaces:**
- Consumes: `inventoryItemArt(item)` and `InventoryItemDefinition.iconSrc`.
- Produces: one item-art path for HUD, lobby, and reward notice.

- [ ] Add failing DOM assertions for PNG-backed craft stacks and accessible labels.
- [ ] Run focused UI tests red.
- [ ] Replace generic item-kind glyphs with shared item art where a real image exists.
- [ ] Add restrained rarity borders, object-fit, and zoom/inspector states.
- [ ] Run focused UI tests green.

### Task 3: Lobby Status panel

**Files:**
- Modify: `index.html`
- Modify: `src/ui/LobbyScreen.ts`
- Modify: `src/style.css`
- Create: `src/ui/LobbyAttributesPanel.ts`
- Test: `src/ui/LobbyAttributesPanel.test.ts`
- Test: `src/ui/LobbyScreen.test.ts`

**Interfaces:**
- Consumes: `PlayerProfile`, attribute mutation helpers, `deriveCharacterStats`.
- Produces: `LobbyAttributesPanel` that mutates the shared profile through injected persistence callback.

- [ ] Write failing tests for zero/100 initial state, +1/+5, undo, confirm gating, and saved confirmed state.
- [ ] Run tests red.
- [ ] Implement the focused panel and wire a Status lobby tab.
- [ ] Style it within the approved Cinzafogo visual contract with keyboard focus/reduced motion.
- [ ] Run focused tests green.

### Task 4: Boss melee and skills concurrently

**Files:**
- Create: `src/entities/BossSkillSchedulingPolicy.ts`
- Modify: `src/core/Game.ts`
- Test: `src/entities/BossSkillSchedulingPolicy.test.ts`
- Modify: `src/entities/BossCombatPolicy.test.ts`

**Interfaces:**
- Consumes: `BossCombatMode`.
- Produces: `shouldUpdateBossSkills(mode): boolean` and `shouldClearBossTelegraph(mode): boolean`.

- [ ] Write failing policy tests proving melee updates skill scheduling and follow pauses it.
- [ ] Run tests red.
- [ ] Implement the pure policy and replace the unconditional melee reset in `Game.updateBossSkills`.
- [ ] Run focused tests green.

### Task 5: Automatic victory return to lobby

**Files:**
- Create: `src/core/VictoryLobbyTransition.ts`
- Modify: `src/core/Game.ts`
- Modify: `src/rewards/FinalBossRewardCoordinator.ts`
- Test: `src/core/VictoryLobbyTransition.test.ts`
- Modify: `src/rewards/FinalBossRewardCoordinator.test.ts`

**Interfaces:**
- Consumes: final reward `onFinished`, elapsed delta, run teardown callback, lobby callback.
- Produces: a cancellable 5-second transition controller that fires once.

- [ ] Write failing tests for delay, exactly-once behavior, reset cancellation, and reward-before-transition order.
- [ ] Run tests red.
- [ ] Implement the transition controller and reusable in-app lobby re-entry path.
- [ ] Run focused tests green.

### Task 6: Proximity lighting and pooled transients

**Files:**
- Modify: `src/core/GameLightingRig.ts`
- Modify: `src/world/Level.ts`
- Modify: `src/entities/HealthPlasma.ts`
- Modify: `src/entities/HealthPlasmaSystem.ts`
- Modify: `src/entities/Enemy.ts`
- Test: `src/core/GameLightingRig.test.ts`
- Test: `src/world/Level.test.ts`
- Modify: `src/entities/HealthPlasmaSystem.test.ts`

**Interfaces:**
- Consumes: player world position on each update.
- Produces: `Level.update(time, playerPosition)`, shared plasma resources, bounded active dynamic lights.

- [ ] Write failing tests for 18-metre player light, torch activation hysteresis, and reused plasma resources.
- [ ] Run focused tests red.
- [ ] Implement proximity lighting and pooled/shared transient GPU resources.
- [ ] Run focused tests green.

### Task 7: Blender sword and chest optimization

**Files:**
- Modify: `C:/Users/pteix/Downloads/personagem HD/personagem_final.blend`
- Replace: `public/models/Guerreiro/guerreiro_animado.glb`
- Replace or optimize: `public/models/chest.glb`
- Validate: `scripts/validate-warrior-glb.mjs`

**Interfaces:**
- Produces: 13-action Warrior GLB with one bone-parented `sword`; chest GLB below 20,000 triangles.

- [ ] Back up the blend and current exported GLBs.
- [ ] Convert imported `Mesh_0` to a single clean `sword`, align grip to `mixamorig:RightHand`, and parent in bone-local space.
- [ ] Sample every action at start/middle/end and verify finite sword transforms and attachment.
- [ ] Export GLB with all actions and embedded materials.
- [ ] Simplify the chest while preserving silhouette/material.
- [ ] Run the Warrior validator and GLB triangle/image audit.

### Task 8: Full verification and browser acceptance

**Files:**
- Verify all modified files and generated assets.

**Interfaces:**
- Produces: fresh evidence for requirements, tests, build, GLB assets, and desktop rendered UI.

- [ ] Run `npm test`.
- [ ] Run `npm run typecheck` and `npm run build`.
- [ ] Run `npm run validate:warrior-glb`.
- [ ] Start the app, inspect lobby Status and real loot artwork, and perform no-mouse/reduced-motion checks.
- [ ] Exercise boss melee plus area skills and final victory auto-return.
- [ ] Capture a desktop screenshot and compare performance diagnostics against the supplied log.

## Self-review

- Spec coverage: all approved gameplay, UI, Blender, loot, boss, transition, and performance requirements map to Tasks 1–8.
- Placeholder scan: no deferred implementation placeholders are present.
- Type consistency: shared item art, boss scheduling policy, transition controller, and attribute panel have single named ownership boundaries.
