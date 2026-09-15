# Monster GLB and Death Effects Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish the regular-monster GLB animation integration and give every enemy the approved chest-style death presentation.

**Architecture:** Keep `Enemy` as the combat-AI owner, `EnemyAssetStore` as the single loaded-asset owner, and `EnemyAnimationController` as the clip/mixer owner. Share pure chest-effect frame calculations between `RewardChest` and `Enemy` so both presentations use the same motion language without coupling the entities.

**Tech Stack:** TypeScript, Three.js r161, GLTFLoader, SkeletonUtils, Vitest, Vite.

**Spec:** `docs/superpowers/specs/2026-08-27-monster-reward-combat-design.md`

## Global Constraints

- Regular monsters spawn with original GLB colors, materials, and textures.
- Only regular monsters receive `monstro.glb`; mini-boss and boss visuals remain procedural.
- Preserve horizontal in-place animation and existing world-space AI movement.
- Preserve enemy separation, plasma travel, wave reporting, and all numeric combat values during this plan.
- Missing monster assets or clips must retain a playable procedural/animation fallback.
- Workspace has no Git repository; replace commit steps with tested checkpoints and changed-file summaries.

---

### Task 1: Complete deterministic clip fallbacks

**Files:**
- Modify: `src/entities/EnemyAnimationController.ts`
- Create: `src/entities/EnemyAnimationController.test.ts`
- Verify: `src/characters/AnimationClipAdapter.test.ts`
- Verify: `src/entities/EnemyAnimation.test.ts`

**Interfaces:**
- Consumes: `makeClipInPlace(clip, ['x', 'z'], referenceClip)` and `RegularEnemyVisual`.
- Produces: `EnemyAnimationController.play`, `playNextAttack`, `playDeath`, `state`, and `deathDuration` with explicit missing-clip behavior.

- [ ] **Step 1: Write failing fallback tests**

```ts
it('falls back from missing idle to Walking without changing world motion', () => {
  const controller = new EnemyAnimationController(modelWithHips(), [clip('Walking', 1)]);
  expect(controller.state).toBe('idle');
  expect(controller.activeClipName).toBe('Walking');
});

it('reuses the only exported slash and reports zero death delay without dying_backwards', () => {
  const controller = new EnemyAnimationController(modelWithHips(), [clip('Charged_Slash', 2)]);
  expect(controller.playNextAttack()).toBe('attack-primary');
  expect(controller.playNextAttack()).toBe('attack-primary');
  expect(controller.playDeath()).toBe(0);
});
```

- [ ] **Step 2: Run the tests and confirm the missing behavior fails**

Run: `npm test -- src/entities/EnemyAnimationController.test.ts`

Expected: FAIL because idle fallback, `activeClipName`, and single-slash reuse are not yet implemented.

- [ ] **Step 3: Implement the exact fallback map**

```ts
private sourceFor(state: EnemyAnimationState): THREE.AnimationClip | undefined {
  const exact = this.nativeClips.find((clip) => clip.name === CLIP_NAMES[state]);
  if (exact) return exact;
  if (state === 'idle') {
    return this.nativeClips.find((clip) => clip.name === 'Walking')
      ?? this.nativeClips.find((clip) => clip.name === 'Running');
  }
  return undefined;
}

public playNextAttack(): EnemyAnimationState | null {
  const primaryAvailable = Boolean(this.actions['attack-primary']);
  const secondaryAvailable = Boolean(this.actions['attack-secondary']);
  if (!primaryAvailable && !secondaryAvailable) return null;
  const selected = primaryAvailable && secondaryAvailable
    ? this.nextAttack
    : primaryAvailable ? 'attack-primary' : 'attack-secondary';
  if (primaryAvailable && secondaryAvailable) {
    this.nextAttack = selected === 'attack-primary' ? 'attack-secondary' : 'attack-primary';
  }
  this.activate(selected, 0.08, true);
  return selected;
}
```

Expose `activeClipName` as the current action clip name so diagnostics and tests inspect real mixer state rather than private maps.

- [ ] **Step 4: Run controller and integration tests**

Run: `npm test -- src/entities/EnemyAnimationController.test.ts src/entities/EnemyAnimation.test.ts src/characters/AnimationClipAdapter.test.ts`

Expected: PASS with no Three.js binding warnings.

- [ ] **Step 5: Checkpoint the clip behavior**

Record changed files and the passing test count in the execution log before starting Task 2.

---

### Task 2: Extract the shared chest-style effect frames

**Files:**
- Create: `src/effects/ChestStyleEffect.ts`
- Create: `src/effects/ChestStyleEffect.test.ts`
- Modify: `src/entities/RewardChest.ts`
- Verify: `src/entities/RewardChest.test.ts`

**Interfaces:**
- Produces: `getChestPulseFrame(progress: number): ChestPulseFrame` and `getCollapseFrame(progress: number): CollapseFrame`.
- `ChestPulseFrame`: `{ rotationZ: number; scaleXZ: number; scaleY: number; lift: number; lightIntensity: number }`.
- `CollapseFrame`: `{ opacity: number; scale: number; complete: boolean }`.

- [ ] **Step 1: Write failing pure-frame tests**

```ts
it('matches the chest opening endpoints', () => {
  expect(getChestPulseFrame(0)).toEqual({
    rotationZ: 0, scaleXZ: 1, scaleY: 1, lift: 0, lightIntensity: 4,
  });
  expect(getChestPulseFrame(1)).toEqual({
    rotationZ: 0, scaleXZ: 1, scaleY: 1, lift: 0.45, lightIntensity: 28,
  });
});

it('collapses opacity and scale without negative values', () => {
  expect(getCollapseFrame(0)).toEqual({ opacity: 1, scale: 1, complete: false });
  expect(getCollapseFrame(1)).toEqual({ opacity: 0, scale: 0.01, complete: true });
  expect(getCollapseFrame(2)).toEqual({ opacity: 0, scale: 0.01, complete: true });
});
```

- [ ] **Step 2: Run the effect test and confirm it fails**

Run: `npm test -- src/effects/ChestStyleEffect.test.ts`

Expected: FAIL because `ChestStyleEffect.ts` does not exist.

- [ ] **Step 3: Implement clamped frame functions**

```ts
export function getChestPulseFrame(progress: number): ChestPulseFrame {
  const value = THREE.MathUtils.clamp(progress, 0, 1);
  const pulse = Math.sin(value * Math.PI);
  return {
    rotationZ: Math.sin(value * Math.PI * 6) * 0.04 * (1 - value),
    scaleXZ: 1 + pulse * 0.06,
    scaleY: 1 + pulse * 0.12,
    lift: THREE.MathUtils.smoothstep(value, 0.25, 1) * 0.45,
    lightIntensity: 4 + value * 24,
  };
}

export function getCollapseFrame(progress: number): CollapseFrame {
  const value = THREE.MathUtils.clamp(progress, 0, 1);
  return {
    opacity: 1 - value,
    scale: Math.max(0.01, 1 - value),
    complete: value >= 1,
  };
}
```

- [ ] **Step 4: Refactor `RewardChest.update` to consume the shared frames**

Replace duplicated pulse/collapse arithmetic with the two functions while preserving `OPEN_DURATION = 0.7` and `FADE_DURATION = 0.45`.

- [ ] **Step 5: Run effect and chest tests**

Run: `npm test -- src/effects/ChestStyleEffect.test.ts src/entities/RewardChest.test.ts`

Expected: PASS and the chest endpoint assertions remain unchanged.

- [ ] **Step 6: Checkpoint the shared effect**

Record the passing test count and confirm `RewardChest` no longer contains duplicate pulse/collapse formulas.

---

### Task 3: Apply the shared effect to every enemy death

**Files:**
- Modify: `src/entities/Enemy.ts`
- Modify: `src/entities/EnemyAnimation.test.ts`
- Modify: `src/entities/EnemyDeathEffect.test.ts`
- Verify: `src/waves/CombatEntityRegistry.test.ts`

**Interfaces:**
- Consumes: `getChestPulseFrame`, `getCollapseFrame`, and `EnemyAnimationController.deathDuration`.
- Produces: one staged death lifecycle: exported death clip delay, 0.7-second chest pulse, then 0.45-second collapse.

- [ ] **Step 1: Write failing staged-death tests**

```ts
it('waits for dying_backwards, then pulses, then collapses the regular GLB', () => {
  const enemy = animatedEnemy();
  enemy.takeDamage(enemy.hp);
  enemy.update(2.267, player, noDamage);
  expect(enemy.deathEffectStage).toBe('pulse');
  enemy.update(0.35, player, noDamage);
  expect(enemy.root.scale.y).toBeGreaterThan(enemy.root.scale.x);
  enemy.update(0.35, player, noDamage);
  expect(enemy.deathEffectStage).toBe('collapse');
  enemy.update(0.45, player, noDamage);
  expect(enemy.markedForRemoval).toBe(true);
});

it('starts the same pulse immediately for a procedural mini-boss', () => {
  const enemy = new Enemy({ position: new THREE.Vector3(), scale: 1.2, hp: 1 });
  enemy.takeDamage(1);
  enemy.update(0.35, player, noDamage);
  expect(enemy.deathEffectStage).toBe('pulse');
  expect(enemy.root.position.y).toBeGreaterThan(0);
});
```

- [ ] **Step 2: Run death tests and confirm stage assertions fail**

Run: `npm test -- src/entities/EnemyAnimation.test.ts src/entities/EnemyDeathEffect.test.ts`

Expected: FAIL because `deathEffectStage` and the chest pulse stage do not exist.

- [ ] **Step 3: Implement explicit death stages**

```ts
type EnemyDeathEffectStage = 'animation' | 'pulse' | 'collapse' | 'complete';

private updateDeath(delta: number): void {
  this.deathTimer += Math.max(0, delta);
  const afterAnimation = this.deathTimer - this.animatedDeathDuration;
  if (afterAnimation < 0) {
    this.deathEffectStage = 'animation';
    return;
  }
  if (afterAnimation < 0.7) {
    this.deathEffectStage = 'pulse';
    this.applyPulse(getChestPulseFrame(afterAnimation / 0.7));
    return;
  }
  this.deathEffectStage = 'collapse';
  const frame = getCollapseFrame((afterAnimation - 0.7) / 0.45);
  this.applyCollapse(frame);
  if (frame.complete) {
    this.deathEffectStage = 'complete';
    this.markedForRemoval = true;
  }
}
```

Create the enemy death light lazily, dispose it with the root, apply opacity to cloned per-enemy materials, and never reset the enemy world X/Z position.

- [ ] **Step 4: Run death and registry tests**

Run: `npm test -- src/entities/EnemyAnimation.test.ts src/entities/EnemyDeathEffect.test.ts src/waves/CombatEntityRegistry.test.ts`

Expected: PASS; dead roots remain registered until visual completion while death metadata still reports only once.

- [ ] **Step 5: Run the monster-plan regression set**

Run: `npm test -- src/characters/AnimationClipAdapter.test.ts src/waves/EnemyAssetStore.test.ts src/entities/EnemyAnimationController.test.ts src/entities/EnemyAnimation.test.ts src/entities/EnemyDeathEffect.test.ts src/entities/RewardChest.test.ts src/waves/WaveEnemyFactory.test.ts src/waves/CombatEntityRegistry.test.ts`

Expected: all listed files pass.

- [ ] **Step 6: Checkpoint the monster deliverable**

Record changed files, test count, and build status. Do not begin combat-value changes inside this plan.

## Design Contract and Acceptance

- Approval: approved modular direction and approved original-color correction.
- Subject: Dragon Miner dungeon enemies and reward magic.
- Audience: the active dungeon player.
- Interface job: choose the starting weapon from its real model and attributes; implemented in the separate UI plan.
- Palette: `#070A0D`, `#151B22`, `#C7923E`, `#69D7E8`, `#E9EEF2`, `#B94A3C`.
- Signature: real GLB weapons over forge rings; implemented in the separate UI plan.
- Icon source/system: project-native SVG plus real GLBs; no emoji.
- Roles: routing unavailable; current agent separates execution from final review.
- Real rendered desktop and mobile screenshots reviewed before Sol acceptance.
- Complete no-mouse traversal and active prefers-reduced-motion: reduce emulation completed before Sol acceptance.
