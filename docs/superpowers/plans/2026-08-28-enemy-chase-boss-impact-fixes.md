# Enemy Chase and Boss Impact Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove pursuit animation chattering, reduce the boss leash/height, and make boss ground impacts reliably deal one hit with the player hit reaction.

**Architecture:** Preserve stable formation ownership per enemy and add movement hysteresis so separation corrections cannot restart locomotion every frame. Keep boss skill geometry locked at cast time, route successful boss impacts through a dedicated forced player-damage path, and keep ordinary monster damage behavior unchanged.

**Tech Stack:** TypeScript, Three.js, Vitest, Vite.

**Spec:** Current task request approved on 2026-08-28.

## Global Constraints

- No sub-agents.
- Boss follows only when farther than 15 meters.
- Boss scale is 2.5.
- Meteor warning/fall time is 1 second.
- One boss-skill impact deals at most one damage instance.
- A successful boss-skill impact forces `hit`, unless it kills the player.

---

### Task 1: Stable enemy pursuit

**Files:**
- Modify: `src/waves/CombatEntityRegistry.ts`
- Modify: `src/entities/Enemy.ts`
- Test: `src/waves/CombatEntityRegistry.test.ts`
- Test: `src/entities/EnemyAnimation.test.ts`

**Interfaces:**
- Consumes: enemy IDs, collision radii, player position, formation slots.
- Produces: stable per-ID slot ownership and locomotion hysteresis.

- [x] Add failing tests proving angle-order changes do not swap enemy destinations and small slot movement does not alternate `running/idle`.
- [x] Run the focused tests and confirm the expected failures.
- [x] Preserve slot identity until an enemy is removed and use separate start/stop movement thresholds.
- [x] Run the focused tests and confirm they pass.

### Task 2: Boss movement and size

**Files:**
- Modify: `src/entities/BossCombatPolicy.ts`
- Modify: `src/entities/Boss.ts`
- Modify: `src/entities/BossAssetStore.ts`
- Test: `src/entities/BossCombatPolicy.test.ts`
- Test: `src/entities/BossMovement.test.ts`
- Test: `src/waves/WaveEnemyFactory.test.ts`
- Test: `src/entities/BossAssetStore.test.ts`

**Interfaces:**
- Consumes: distance to player and `Walking` action already exported in `Boss.glb`.
- Produces: 15-meter leash, scale 2.5, and cache-busted boss asset request.

- [x] Add failing behavior tests for the 15-meter stop distance, scale 2.5, and updated asset request.
- [x] Run the focused tests and confirm the expected failures.
- [x] Change the constants/path and retain `walking` locomotion during approach.
- [x] Run the focused tests and confirm they pass.

### Task 3: Reliable single boss impact and hit reaction

**Files:**
- Modify: `src/entities/BossSkillController.ts`
- Modify: `src/entities/Player.ts`
- Modify: `src/core/Game.ts`
- Test: `src/entities/BossSkillController.test.ts`
- Test: `src/entities/PlayerLocomotion.test.ts`
- Test: `src/entities/PlayerAnimationPreview.integration.test.ts`

**Interfaces:**
- Consumes: locked telegraph geometry and a single numeric impact result.
- Produces: `Player.takeBossSkillDamage(amount)` that bypasses ordinary hit invulnerability, forces `hit`, and still respects immortality/death.

- [x] Add failing tests for one-second meteors, one damage across overlaps, invulnerability bypass, and forced hit while attacking.
- [x] Run the focused tests and confirm the expected failures.
- [x] Implement the dedicated boss-impact damage method and call it only from boss skill impacts.
- [x] Run the focused tests and confirm they pass.

### Task 4: Verification

**Files:**
- Verify all modified source and tests.

**Interfaces:**
- Consumes: Tasks 1-3.
- Produces: verified production build.

- [x] Run `npm test`.
- [x] Run `npm run build`.
- [x] Load the local game, enter the boss encounter through ADM, and inspect runtime errors and visible behavior.
