# Combat Rewards and Balance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply weapon-specific kill healing and regular-monster defense while updating only the approved combat and wave values.

**Architecture:** Make `EquipmentCatalog` authoritative for weapon combat traits, keep reward/defense arithmetic in pure functions, forward attacker role through `CombatEntityRegistry`, and let `Game` coordinate only the resulting effects. Preserve plasma delivery and existing wave state machinery.

**Tech Stack:** TypeScript, Three.js, Vitest, Vite.

**Spec:** `docs/superpowers/specs/2026-08-27-monster-reward-combat-design.md`

## Global Constraints

- Kill healing happens only when an enemy dies.
- Sword healing: regular 3%, mini-boss 6%; defense against regular attacks 3%.
- Axe healing: regular 3.1%, mini-boss 6.2%; defense against regular attacks 5%.
- Regular kill damage bonus is `+0.3`; mini-boss bonus is `+0.4`; boss reward is zero.
- Defense never applies to mini-boss or boss damage.
- Healing values and floating text use one decimal; text uses comma decimal and `HP` suffix.
- Do not alter monster GLB behavior, reward-dialog layout, wave quantities, or countdown timing in this plan.
- Workspace has no Git repository; replace commit steps with tested checkpoints and changed-file summaries.

---

### Task 1: Put weapon combat traits in the equipment catalog

**Files:**
- Modify: `src/equipment/EquipmentCatalog.ts`
- Modify: `src/equipment/EquipmentCatalog.test.ts`

**Interfaces:**
- Produces `WeaponDefinition.killHealFraction: { regular: number; miniBoss: number }`.
- Produces `WeaponDefinition.regularDefenseChance: number`.
- Existing `getWeaponDefinition(id)` remains the only lookup entry point.

- [ ] **Step 1: Extend the catalog test with exact literal traits**

```ts
expect(getWeaponDefinition('sword')).toMatchObject({
  attackDamage: 8,
  attackRange: 2.2,
  attackCooldownTime: 1,
  killHealFraction: { regular: 0.03, miniBoss: 0.06 },
  regularDefenseChance: 0.03,
});
expect(getWeaponDefinition('axe')).toMatchObject({
  attackDamage: 10,
  attackRange: 1.5,
  attackCooldownTime: 1.3,
  killHealFraction: { regular: 0.031, miniBoss: 0.062 },
  regularDefenseChance: 0.05,
});
```

- [ ] **Step 2: Run the catalog test and confirm it fails**

Run: `npm test -- src/equipment/EquipmentCatalog.test.ts`

Expected: FAIL because the two trait fields are absent.

- [ ] **Step 3: Add immutable traits to `WeaponDefinition` and both entries**

```ts
readonly killHealFraction: {
  readonly regular: number;
  readonly miniBoss: number;
};
readonly regularDefenseChance: number;
```

Use the exact decimal fractions from Step 1 without derived or shared approximations.

- [ ] **Step 4: Run the catalog test**

Run: `npm test -- src/equipment/EquipmentCatalog.test.ts`

Expected: PASS.

- [ ] **Step 5: Checkpoint catalog traits**

Record the passing test and the public interface additions.

---

### Task 2: Calculate weapon-specific kill rewards

**Files:**
- Modify: `src/core/KillRewards.ts`
- Modify: `src/core/KillRewards.test.ts`

**Interfaces:**
- Changes to `getKillReward(role: WaveEntityRole, maxHP: number, weaponId: EquipmentId): KillReward`.
- Preserves `addDamageBonus(current: number, bonus: number): number`.
- Adds `roundCombatValue(value: number): number` for one-decimal normalization.

- [ ] **Step 1: Write the full reward matrix as failing tests**

```ts
it.each([
  ['sword', 'regular', 100, { healAmount: 3, damageBonus: 0.3 }],
  ['sword', 'mini-boss', 100, { healAmount: 6, damageBonus: 0.4 }],
  ['axe', 'regular', 100, { healAmount: 3.1, damageBonus: 0.3 }],
  ['axe', 'mini-boss', 100, { healAmount: 6.2, damageBonus: 0.4 }],
  ['sword', 'boss', 100, { healAmount: 0, damageBonus: 0 }],
  ['axe', 'boss', 100, { healAmount: 0, damageBonus: 0 }],
] as const)('applies %s reward for %s', (weapon, role, maxHP, expected) => {
  expect(getKillReward(role, maxHP, weapon)).toEqual(expected);
});

expect(getKillReward('regular', 125, 'axe').healAmount).toBe(3.9);
```

- [ ] **Step 2: Run reward tests and confirm old global values fail**

Run: `npm test -- src/core/KillRewards.test.ts`

Expected: FAIL because `getKillReward` has no weapon input and still uses the earlier 5%/9% values.

- [ ] **Step 3: Implement role and weapon lookup with one-decimal rounding**

```ts
export function roundCombatValue(value: number): number {
  return Math.round((Number.isFinite(value) ? value : 0) * 10) / 10;
}

export function getKillReward(
  role: WaveEntityRole,
  maxHP: number,
  weaponId: EquipmentId
): KillReward {
  if (role === 'boss') return { healAmount: 0, damageBonus: 0 };
  const weapon = getWeaponDefinition(weaponId);
  const fraction = role === 'mini-boss'
    ? weapon?.killHealFraction.miniBoss ?? 0
    : weapon?.killHealFraction.regular ?? 0;
  return {
    healAmount: roundCombatValue(Math.max(0, maxHP) * fraction),
    damageBonus: role === 'mini-boss' ? 0.4 : 0.3,
  };
}
```

- [ ] **Step 4: Run reward tests**

Run: `npm test -- src/core/KillRewards.test.ts`

Expected: PASS for all six role/weapon combinations and fractional max HP.

- [ ] **Step 5: Checkpoint reward arithmetic**

Record the matrix test result before changing damage delivery.

---

### Task 3: Forward attacker role and enforce regular-only defense

**Files:**
- Create: `src/core/DefenseRules.ts`
- Create: `src/core/DefenseRules.test.ts`
- Modify: `src/waves/CombatEntityRegistry.ts`
- Modify: `src/waves/CombatEntityRegistry.test.ts`
- Modify: `src/core/Game.ts`

**Interfaces:**
- Produces `isAttackBlocked(role: WaveEntityRole, weaponId: EquipmentId, roll: number): boolean`.
- Changes registry callback to `onDamage(damage: number, role: WaveEntityRole): void`.
- Changes `Game.onEnemyHitPlayer(damage: number, role: WaveEntityRole): void`.

- [ ] **Step 1: Write defense boundary tests**

```ts
it.each([
  ['regular', 'sword', 0.029, true],
  ['regular', 'sword', 0.03, false],
  ['regular', 'axe', 0.049, true],
  ['regular', 'axe', 0.05, false],
  ['mini-boss', 'axe', 0, false],
  ['boss', 'axe', 0, false],
] as const)('evaluates %s attack with %s at %s', (role, weapon, roll, expected) => {
  expect(isAttackBlocked(role, weapon, roll)).toBe(expected);
});
```

- [ ] **Step 2: Add a failing registry provenance assertion**

```ts
const received: Array<{ damage: number; role: WaveEntityRole }> = [];
registry.update(0, playerPosition, (damage, role) => received.push({ damage, role }));
expect(received).toEqual([{ damage: 4, role: 'regular' }]);
```

Configure the real `Enemy` at attack range with zero delta so its existing attack callback fires.

- [ ] **Step 3: Run defense and registry tests**

Run: `npm test -- src/core/DefenseRules.test.ts src/waves/CombatEntityRegistry.test.ts`

Expected: FAIL because the pure rule and role callback do not exist.

- [ ] **Step 4: Implement the pure defense rule**

```ts
export function isAttackBlocked(
  role: WaveEntityRole,
  weaponId: EquipmentId,
  roll: number
): boolean {
  if (role !== 'regular') return false;
  const chance = getWeaponDefinition(weaponId)?.regularDefenseChance ?? 0;
  return Math.max(0, Math.min(1, roll)) < chance;
}
```

- [ ] **Step 5: Forward each record role through the registry**

```ts
for (const record of this.records.values()) {
  record.enemy.update(delta, playerPosition, (damage) => {
    onDamage(damage, record.role);
  });
}
```

- [ ] **Step 6: Apply defense in `Game` before player damage**

```ts
private onEnemyHitPlayer(damage: number, role: WaveEntityRole): void {
  const weaponId = this.player.equippedWeaponId;
  if (
    (weaponId === 'sword' || weaponId === 'axe') &&
    isAttackBlocked(role, weaponId, Math.random())
  ) {
    Logger.info('Game:Defense', `${weaponId} bloqueou um ataque de monstro normal.`);
    return;
  }
  this.player.takeDamage(damage);
  if (this.player.isDead) {
    this.healthPlasma.clear();
    this.player.setInputLocked(true);
    this.hud.showDeathScreen();
  }
}
```

- [ ] **Step 7: Run defense, registry, and player-damage tests**

Run: `npm test -- src/core/DefenseRules.test.ts src/waves/CombatEntityRegistry.test.ts src/core/RunProgression.test.ts`

Expected: PASS and non-regular roles never block.

- [ ] **Step 8: Checkpoint defense provenance**

Record the callback signature change and every caller updated by TypeScript.

---

### Task 4: Connect weapon rewards and format healing feedback

**Files:**
- Create: `src/ui/CombatNumberFormat.ts`
- Create: `src/ui/CombatNumberFormat.test.ts`
- Modify: `src/core/Game.ts`
- Modify: `src/ui/HUD.ts`

**Interfaces:**
- Produces `formatHealingAmount(amount: number): string` returning `+N,N HP`.
- Changes `HUD.spawnFloatingDamage` to accept the already formatted string exactly as it does now; no new HUD API is required.

- [ ] **Step 1: Write failing format tests**

```ts
it.each([
  [4.000005, '+4,0 HP'],
  [3.1, '+3,1 HP'],
  [6.25, '+6,3 HP'],
  [-2, '+0,0 HP'],
] as const)('formats %s as %s', (input, expected) => {
  expect(formatHealingAmount(input)).toBe(expected);
});
```

- [ ] **Step 2: Run the formatter test and confirm it fails**

Run: `npm test -- src/ui/CombatNumberFormat.test.ts`

Expected: FAIL because the formatter module does not exist.

- [ ] **Step 3: Implement locale-stable one-decimal output**

```ts
export function formatHealingAmount(amount: number): string {
  const normalized = Math.max(0, Number.isFinite(amount) ? amount : 0);
  return `+${normalized.toFixed(1).replace('.', ',')} HP`;
}
```

- [ ] **Step 4: Pass equipped weapon into kill rewards**

```ts
const weaponId = this.player.equippedWeaponId;
if (weaponId !== 'sword' && weaponId !== 'axe') return;
const reward = getKillReward(role, this.player.maxHP, weaponId);
```

Keep spawning plasma with `reward.healAmount`. In `updateHealthPlasma`, pass `formatHealingAmount(recovered)` to `showFloatingDamage` instead of interpolating the raw number.

- [ ] **Step 5: Run reward, formatter, and plasma tests**

Run: `npm test -- src/core/KillRewards.test.ts src/ui/CombatNumberFormat.test.ts src/entities/HealthPlasma.test.ts src/entities/HealthPlasmaSystem.test.ts`

Expected: PASS with no raw floating-point text path remaining.

- [ ] **Step 6: Checkpoint reward integration**

Record the passing tests and confirm healing still occurs only on plasma arrival.

---

### Task 5: Apply approved base stats and wave multipliers

**Files:**
- Modify: `src/waves/WaveEnemyFactory.ts`
- Modify: `src/waves/WaveEnemyFactory.test.ts`
- Modify: `src/entities/Boss.ts`
- Modify: `src/waves/WaveManager.ts`
- Modify: `src/waves/WaveManager.test.ts`

**Interfaces:**
- Preserves all existing factory and wave-manager signatures.
- Changes only literal base stats and `REGULAR_WAVE_MULTIPLIERS`.

- [ ] **Step 1: Update test literals before production values**

Expected base descriptors:

```ts
expect(regular).toMatchObject({ hp: 50, damage: 4, scale: 0.7, detectionRange: 18, attackRange: 1.7, speed: 2.2 });
expect(miniBoss).toMatchObject({ hp: 80, damage: 7, scale: 1.2, detectionRange: 24, attackRange: 2, speed: 2.5 });
expect(boss).toMatchObject({ hp: 700, damage: 22, detectionRange: 45, attackRange: 5.8, speed: 1.6 });
```

Expected five profiles:

```ts
const expected = [
  { hp: 1, damage: 1, speed: 1 },
  { hp: 1.45, damage: 1.15, speed: 1 },
  { hp: 1.55, damage: 1.25, speed: 1.06 },
  { hp: 1.65, damage: 1.35, speed: 1.15 },
  { hp: 1.75, damage: 1.5, speed: 1.2 },
];
```

- [ ] **Step 2: Run factory and wave tests**

Run: `npm test -- src/waves/WaveEnemyFactory.test.ts src/waves/WaveManager.test.ts`

Expected: wave progression test fails on the old multiplier arrays; already-correct base descriptors remain green.

- [ ] **Step 3: Replace only multiplier literals**

```ts
const REGULAR_WAVE_MULTIPLIERS = [
  { hp: 1, damage: 1, speed: 1 },
  { hp: 1.45, damage: 1.15, speed: 1 },
  { hp: 1.55, damage: 1.25, speed: 1.06 },
  { hp: 1.65, damage: 1.35, speed: 1.15 },
  { hp: 1.75, damage: 1.5, speed: 1.2 },
] as const;
```

- [ ] **Step 4: Run wave and factory tests**

Run: `npm test -- src/waves/WaveEnemyFactory.test.ts src/waves/WaveManager.test.ts`

Expected: PASS while five waves, 25 monsters, batches of five, and all five/four-second timings remain asserted.

- [ ] **Step 5: Run the combat-plan regression set and build**

Run: `npm test -- src/equipment/EquipmentCatalog.test.ts src/core/KillRewards.test.ts src/core/DefenseRules.test.ts src/ui/CombatNumberFormat.test.ts src/waves/CombatEntityRegistry.test.ts src/waves/WaveEnemyFactory.test.ts src/waves/WaveManager.test.ts src/entities/HealthPlasmaSystem.test.ts && npm run build`

Expected: all listed tests pass and build exits 0.

- [ ] **Step 6: Checkpoint the combat deliverable**

Record exact test count, build result, and changed files. Do not change reward-dialog markup or CSS inside this plan.

## Design Contract and Acceptance

- Approval: weapon-specific kill healing was explicitly confirmed as kill-only.
- Subject: Dragon Miner combat progression.
- Audience: the active dungeon player.
- Interface job: choose the starting weapon from its real model and attributes; implemented in the separate UI plan.
- Palette: `#070A0D`, `#151B22`, `#C7923E`, `#69D7E8`, `#E9EEF2`, `#B94A3C`.
- Icon source/system: project-native SVG plus real GLBs; no emoji.
- Roles: routing unavailable; current agent separates execution from final review.
- Real rendered desktop and mobile screenshots reviewed before Sol acceptance.
- Complete no-mouse traversal and active prefers-reduced-motion: reduce emulation completed before Sol acceptance.
