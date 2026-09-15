# Admin Test Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an authorization-gated in-scene ADM panel for wave/Boss testing and make a marked in-range target automatically interrupt movement and receive attacks.

**Architecture:** A temporary Vite environment adapter decides whether admin tools exist; a typed command gate prevents unauthorized dispatch. `WaveManager` owns debug phase transitions, while `Game` owns scene cleanup and normal combat/death integration. UI is dynamically created only for authorized sessions and will later accept Project Miner session authorization without changing command semantics.

**Tech Stack:** TypeScript, Three.js, Vite environment modes, DOM/CSS, Vitest.

**Spec:** `docs/superpowers/specs/2026-08-28-admin-test-panel-design.md`

## Global Constraints

- Default and production builds must not create the ADM panel.
- Local ADM testing is enabled only by `VITE_ADMIN_MODE=true`.
- Remove the unrestricted `F9` camera toggle.
- Wave controls accept only integers `1..5`.
- Hitkill must use the normal Boss death/progression flow.
- Automatic attacks require a living marked target inside weapon range and must never chase an out-of-range target.
- The current workspace has no `.git`; record test/build checkpoints instead of running commit commands.

---

### Task 1: Temporary authorization and typed command gate

**Files:**
- Create: `src/admin/AdminAccess.ts`
- Create: `src/admin/AdminAccess.test.ts`
- Create: `src/admin/AdminCommandGate.ts`
- Create: `src/admin/AdminCommandGate.test.ts`
- Create: `.env.admin`
- Modify: `package.json`

**Interfaces:**
- Produces: `AdminCommand`, `AdminWave`, `resolveDevAdminAccess(value: unknown): boolean`, and `AdminCommandGate.dispatch(command, execute): boolean`.
- Consumes: raw `import.meta.env.VITE_ADMIN_MODE` only in the bootstrap wiring added in Task 6.

- [ ] **Step 1: Write failing authorization tests**

```ts
expect(resolveDevAdminAccess('true')).toBe(true);
expect(resolveDevAdminAccess('TRUE')).toBe(false);
expect(resolveDevAdminAccess(undefined)).toBe(false);
```

- [ ] **Step 2: Write failing command-gate tests**

```ts
const calls: AdminCommand[] = [];
const denied = new AdminCommandGate(false);
expect(denied.dispatch({ type: 'jump-wave', wave: 3 }, c => calls.push(c))).toBe(false);
expect(calls).toEqual([]);

const allowed = new AdminCommandGate(true);
expect(allowed.dispatch({ type: 'immortality', enabled: true }, c => calls.push(c))).toBe(true);
expect(calls).toEqual([{ type: 'immortality', enabled: true }]);
```

- [ ] **Step 3: Run the focused tests and verify RED**

Run: `npm test -- src/admin/AdminAccess.test.ts src/admin/AdminCommandGate.test.ts`

Expected: FAIL because both modules are absent.

- [ ] **Step 4: Implement the minimal contracts**

```ts
export type AdminWave = 1 | 2 | 3 | 4 | 5;
export type AdminCommand =
  | { type: 'jump-wave'; wave: AdminWave }
  | { type: 'jump-boss' }
  | { type: 'hitkill-boss' }
  | { type: 'immortality'; enabled: boolean }
  | { type: 'admin-camera'; enabled: boolean };

export function resolveDevAdminAccess(value: unknown): boolean {
  return value === 'true';
}

export class AdminCommandGate {
  constructor(private readonly authorized: boolean) {}
  dispatch(command: AdminCommand, execute: (value: AdminCommand) => void): boolean {
    if (!this.authorized) return false;
    execute(command);
    return true;
  }
}
```

- [ ] **Step 5: Add the isolated admin development mode**

Add `.env.admin`:

```dotenv
VITE_ADMIN_MODE=true
```

Add to `package.json` scripts:

```json
"dev:admin": "vite --mode admin"
```

Do not change the ordinary `dev` or `build` commands.

- [ ] **Step 6: Run focused tests and record the checkpoint**

Run: `npm test -- src/admin/AdminAccess.test.ts src/admin/AdminCommandGate.test.ts`

Expected: PASS.

---

### Task 2: Deterministic ADM wave transitions

**Files:**
- Modify: `src/waves/WaveManager.ts`
- Modify: `src/waves/WaveManager.test.ts`
- Modify: `src/core/RunProgression.ts`
- Modify: `src/core/RunProgression.test.ts`

**Interfaces:**
- Consumes: `AdminWave` from Task 1.
- Produces: `WaveManager.adminStartWave(wave: AdminWave): void`, `WaveManager.adminStartBoss(): void`, and matching `RunProgression` forwarding methods.

- [ ] **Step 1: Write failing WaveManager tests**

```ts
manager.weaponSelected();
manager.update(5);
manager.adminStartWave(4);
expect(manager.snapshot).toMatchObject({ phase: 'regular-wave', wave: 4, spawned: 0, alive: 0 });
expect(manager.update(0)[0]).toMatchObject({ wave: 4, hpMultiplier: 1.65, damageMultiplier: 1.35, speedMultiplier: 1.15 });

manager.adminStartBoss();
expect(manager.snapshot).toMatchObject({ phase: 'final-battle', wave: 5, alive: 0 });
expect(manager.update(0)[0]).toMatchObject({ kind: 'final-battle', bossCount: 1, miniBossCount: 4 });
```

Add a test that starts a pending spawn, invokes an ADM transition, and proves the old request cannot be acknowledged.

- [ ] **Step 2: Run WaveManager tests and verify RED**

Run: `npm test -- src/waves/WaveManager.test.ts`

Expected: FAIL because the ADM transition methods do not exist.

- [ ] **Step 3: Implement phase reset and transition methods**

```ts
public adminStartWave(wave: AdminWave): void {
  this.clearPhaseRuntime();
  this.currentPhase = 'regular-wave';
  this.currentWave = wave;
  this.currentPhaseId += 1;
}

public adminStartBoss(): void {
  this.clearPhaseRuntime();
  this.currentPhase = 'final-battle';
  this.currentWave = this.config.regularWaves;
  this.currentPhaseId += 1;
}
```

`clearPhaseRuntime()` must zero spawn/timer state, clear pending/retry requests, and clear active/known entity IDs without resetting `nextRequestId`.

- [ ] **Step 4: Add RunProgression forwarding tests and implementation**

```ts
public adminStartWave(wave: AdminWave): void {
  this.victoryAnnounced = false;
  this.manager.adminStartWave(wave);
}

public adminStartBoss(): void {
  this.victoryAnnounced = false;
  this.manager.adminStartBoss();
}
```

Verify that the next `RunProgression.update(0)` sends the expected request through the real spawn port.

- [ ] **Step 5: Run focused tests and record the checkpoint**

Run: `npm test -- src/waves/WaveManager.test.ts src/core/RunProgression.test.ts`

Expected: PASS.

---

### Task 3: Player immortality

**Files:**
- Modify: `src/entities/Player.ts`
- Create: `src/entities/PlayerImmortality.test.ts`

**Interfaces:**
- Produces: `Player.setImmortal(enabled: boolean): void` and `Player.immortal: boolean` getter.

- [ ] **Step 1: Write the failing behavior test**

```ts
const player = new Player('paladin', new CharacterAssetStore());
player.setImmortal(true);
player.takeDamage(9999);
expect(player.hp).toBe(100);
expect(player.isDead).toBe(false);

player.setImmortal(false);
player.takeDamage(10);
expect(player.hp).toBe(90);
```

Use the real `CharacterAssetStore`; the test does not call `load()` and therefore performs no asset request.

- [ ] **Step 2: Run the test and verify RED**

Run: `npm test -- src/entities/PlayerImmortality.test.ts`

Expected: FAIL because `setImmortal` is absent.

- [ ] **Step 3: Implement immortality at the damage boundary**

```ts
private adminImmortal = false;

public get immortal(): boolean {
  return this.adminImmortal;
}

public setImmortal(enabled: boolean): void {
  this.adminImmortal = enabled;
}

public takeDamage(amount: number): void {
  if (this.adminImmortal || this.isDead) return;
  // existing damage behavior remains unchanged
}
```

- [ ] **Step 4: Run focused tests and record the checkpoint**

Run: `npm test -- src/entities/PlayerImmortality.test.ts src/entities/PlayerLocomotion.test.ts`

Expected: PASS.

---

### Task 4: Marked-target attack overrides movement only in range

**Files:**
- Modify: `src/core/AutoAttackPolicy.ts`
- Modify: `src/core/AutoAttackPolicy.test.ts`
- Modify: `src/core/Game.ts`

**Interfaces:**
- Produces: `isMarkedTargetInRange(situation): boolean` and updated `shouldStartAutoAttack(situation): boolean`.
- Consumes: selected target, enemy living state, distance, weapon range, and swing state from `Game`.

- [ ] **Step 1: Replace the old movement-rejection expectation with failing requirements**

```ts
expect(isMarkedTargetInRange({ hasTarget: true, targetAlive: true, distance: 2.2, attackRange: 2.2 })).toBe(true);
expect(isMarkedTargetInRange({ hasTarget: false, targetAlive: true, distance: 1, attackRange: 2.2 })).toBe(false);
expect(isMarkedTargetInRange({ hasTarget: true, targetAlive: true, distance: 2.21, attackRange: 2.2 })).toBe(false);
expect(shouldStartAutoAttack({ ...readyTarget, isSwinging: false })).toBe(true);
expect(shouldStartAutoAttack({ ...readyTarget, isSwinging: true })).toBe(false);
```

Remove `manualMovement` from `AutoAttackSituation`; movement is now suppressed by the in-range lock instead of blocking attacks.

- [ ] **Step 2: Run policy tests and verify RED**

Run: `npm test -- src/core/AutoAttackPolicy.test.ts`

Expected: FAIL because the range-lock function is absent and current policy rejects movement.

- [ ] **Step 3: Implement the shared range predicate**

```ts
export function isMarkedTargetInRange(s: MarkedTargetSituation): boolean {
  return s.hasTarget && s.targetAlive && s.distance <= s.attackRange;
}

export function shouldStartAutoAttack(s: AutoAttackSituation): boolean {
  return isMarkedTargetInRange(s) && !s.isSwinging;
}
```

- [ ] **Step 4: Wire the predicate into movement and attack**

Add one `Game.focusedTargetSituation()` helper that resolves the current record once and returns the shared situation. In `handleKeyboardInput`, do not call `moveByDirection` while `isMarkedTargetInRange(...)` is true. Keep the key state; do not clear input. In `updateAutoAttack`, use the same situation, face the marked target, assign it as attack target, and call `forceAttackIfReady()`.

An out-of-range marked target must not be passed to `Player.attackEnemy`, preventing automatic pursuit.

- [ ] **Step 5: Run policy and player tests and record the checkpoint**

Run: `npm test -- src/core/AutoAttackPolicy.test.ts src/entities/PlayerLocomotion.test.ts`

Expected: PASS.

---

### Task 5: Independent enemy attacks before formation movement

**Files:**
- Modify: `src/entities/Enemy.ts`
- Modify: `src/entities/EnemyAnimation.test.ts`
- Modify: `src/waves/CombatEntityRegistry.test.ts`

**Interfaces:**
- Consumes: existing `Enemy.update(delta, playerPosition, onDamage, surroundPosition)` contract.
- Produces: attack-range priority per enemy without changing the public update signature.

- [ ] **Step 1: Write a failing single-enemy regression test**

Place an animated enemy `1m` from the player while assigning a surround position several metres away:

```ts
const enemy = animatedEnemy();
const damage: number[] = [];
const player = new THREE.Vector3(1, 0, 0);
const distantSlot = new THREE.Vector3(0, 0, 5);

enemy.update(0, player, amount => damage.push(amount), distantSlot);
expect(enemy.animationState).toBe('attack-primary');
expect(enemy.root.position.toArray()).toEqual([0, 0, 0]);
enemy.update(0.78, player, amount => damage.push(amount), distantSlot);
expect(damage).toEqual([4]);
```

- [ ] **Step 2: Write a failing multi-enemy registry test**

Register three procedural enemies inside their individual attack range, update the real registry once, and assert three independent damage callbacks:

```ts
registry.update(0, playerPosition, damage => received.push(damage));
expect(received).toEqual([4, 4, 4]);
```

Use distinct positions around the player so separation does not change the attack decision.

- [ ] **Step 3: Run focused tests and verify RED**

Run: `npm test -- src/entities/EnemyAnimation.test.ts src/waves/CombatEntityRegistry.test.ts`

Expected: the enemy follows its formation slot instead of attacking, and fewer than three damage callbacks are received.

- [ ] **Step 4: Move attack decision ahead of formation movement**

After detection-range handling and active animated-attack continuation, evaluate `dist <= attackRange` before the `surroundPosition` branch. Reuse the existing attack body without changing cooldown, alternating animation, or one-hit timing. The formation branch must run only while `dist > attackRange`.

The resulting order is:

```ts
if (dist > detectionRange) updatePatrol();
else if (dist <= attackRange) updateAttack();
else if (surroundPosition) moveToFormationSlot();
else pursuePlayer();
```

- [ ] **Step 5: Run focused tests and record the checkpoint**

Run: `npm test -- src/entities/EnemyAnimation.test.ts src/waves/CombatEntityRegistry.test.ts`

Expected: PASS, including the existing cancellation test when the player leaves range.

---

### Task 6: Authorized, collapsible ADM panel

**Files:**
- Create: `src/admin/AdminPanel.ts`
- Create: `src/admin/AdminPanel.test.ts`
- Modify: `src/style.css`
- Modify: `src/style.test.ts`

**Interfaces:**
- Consumes: `AdminCommand`, `AdminCommandGate`, and `WaveSnapshot`.
- Produces: `AdminPanel.mount(host, authorized, onCommand)`, `AdminPanel.update(snapshot, bossAlive)`, and `AdminPanel.resetToggles()`.

- [ ] **Step 1: Write failing view-contract tests**

Test a pure exported `getAdminPanelDefinition(authorized)` function:

```ts
expect(getAdminPanelDefinition(false)).toBeNull();
expect(getAdminPanelDefinition(true)?.waveButtons).toEqual([1, 2, 3, 4, 5]);
expect(getAdminPanelDefinition(true)?.actions).toEqual([
  'jump-boss', 'hitkill-boss', 'immortality', 'admin-camera'
]);
```

Add a stylesheet contract checking top-right placement, collapsed state, focus-visible styling, and reduced-motion handling.

- [ ] **Step 2: Run UI tests and verify RED**

Run: `npm test -- src/admin/AdminPanel.test.ts src/style.test.ts`

Expected: FAIL because the view and styles are absent.

- [ ] **Step 3: Implement dynamic markup and events**

Create no DOM node when unauthorized. For authorized sessions, append a `<section id="admin-panel">` to `#game-container` with a disclosure button, phase label, five wave buttons, Boss buttons, and checkbox-style toggle buttons. Use `data-admin-command` and `data-wave` attributes and emit only typed commands.

`update(snapshot, bossAlive)` must set the phase label and disable `hitkill-boss` when `bossAlive === false`.

- [ ] **Step 4: Implement compact top-right styling**

Use the existing obsidian/brass/plasma palette, maximum width `260px`, `z-index` above the HUD but below blocking dialogs, visible keyboard focus, and `pointer-events` only inside the panel. The collapsed state shows only `ADM` and the current phase.

- [ ] **Step 5: Run UI tests and record the checkpoint**

Run: `npm test -- src/admin/AdminPanel.test.ts src/style.test.ts`

Expected: PASS.

---

### Task 7: Game integration, safe transitions, camera and hitkill

**Files:**
- Create: `src/admin/AdminGameActions.ts`
- Create: `src/admin/AdminGameActions.test.ts`
- Modify: `src/main.ts`
- Modify: `src/core/Game.ts`
- Modify: `src/core/CameraController.test.ts`
- Modify: `src/waves/CombatEntityRegistry.test.ts`

**Interfaces:**
- Consumes: all Task 1–5 interfaces.
- Produces: `AdminGameActions.execute(command: AdminCommand): boolean` and complete user-visible ADM behavior with default-off authorization.

- [ ] **Step 1: Add failing command-routing tests around explicit game ports**

Define an `AdminGamePorts` interface with `preparePhaseChange`, `startWave`, `startBoss`, `hitkillBoss`, `setImmortal`, and `setAdminCamera`. Test exact call order and arguments:

```ts
expect(actions.execute({ type: 'jump-wave', wave: 4 })).toBe(true);
expect(calls).toEqual(['prepare', 'wave:4']);

calls.length = 0;
expect(actions.execute({ type: 'jump-boss' })).toBe(true);
expect(calls).toEqual(['prepare', 'boss']);

calls.length = 0;
expect(actions.execute({ type: 'immortality', enabled: true })).toBe(true);
expect(calls).toEqual(['immortal:true']);
```

Also extend registry tests to prove `clear()` leaves no main Boss, and preserve the camera test proving expanded zoom requires `setAdminMode(true)`.

- [ ] **Step 2: Run the focused integration tests and verify RED**

Run: `npm test -- src/admin/AdminGameActions.test.ts src/waves/CombatEntityRegistry.test.ts src/core/CameraController.test.ts`

Expected: FAIL because `AdminGameActions` does not exist.

- [ ] **Step 3: Implement the minimal command router**

```ts
execute(command: AdminCommand): boolean {
  if (command.type === 'jump-wave') {
    this.ports.preparePhaseChange();
    this.ports.startWave(command.wave);
  } else if (command.type === 'jump-boss') {
    this.ports.preparePhaseChange();
    this.ports.startBoss();
  } else if (command.type === 'hitkill-boss') {
    return this.ports.hitkillBoss();
  } else if (command.type === 'immortality') {
    this.ports.setImmortal(command.enabled);
  } else {
    this.ports.setAdminCamera(command.enabled);
  }
  return true;
}
```

- [ ] **Step 4: Resolve access once during bootstrap**

```ts
const adminEnabled = resolveDevAdminAccess(import.meta.env.VITE_ADMIN_MODE);
const game = new Game(canvas, { adminEnabled });
```

`Game` creates `AdminCommandGate` and mounts `AdminPanel` only when `adminEnabled` is true.

- [ ] **Step 5: Implement one safe scene-transition helper**

```ts
private prepareAdminPhaseChange(): void {
  this.player.cancelMovement();
  this.targetedEnemyRoot = null;
  this.clearTargetMarker();
  this.healthPlasma.clear();
  this.stopBossSkills();
  this.combatRegistry.clear();
  this.finalBattleSlots.reset();
  this.hud.hideBossHealth();
  this.hud.hideVictoryScreen();
}
```

After cleanup, dispatch `runProgression.adminStartWave(wave)` or `runProgression.adminStartBoss()`.

- [ ] **Step 6: Route toggles and remove public F9 access**

`immortality` calls `player.setImmortal(enabled)`. `admin-camera` calls `cameraController.setAdminMode(enabled)`. Delete the F9 branch from `handleKeyboardInput`. `fullRunReset()` turns both states off and calls `adminPanel.resetToggles()`.

- [ ] **Step 7: Refactor normal Boss death into a shared helper and route hitkill through it**

Extract the existing post-death code from `onPlayerHitEnemy` into `handleEnemyDeath(record)`. The ADM command obtains `combatRegistry.mainBoss`, applies `boss.takeDamage(boss.hp)`, then invokes the same helper only when `boss.isDead`. Do not directly set victory or create rewards.

- [ ] **Step 8: Update the panel every frame without allocations**

Cache the last phase/Boss-visible values inside `AdminPanel.update`; mutate DOM only when values change. Call it after progression/combat updates using `runProgression.snapshot` and `combatRegistry.mainBoss !== null`.

- [ ] **Step 9: Run complete automated verification**

Run: `npm test`

Expected: all test files pass with zero failures.

Run: `npm run build`

Expected: typecheck and Vite production build succeed; production uses no `.env.admin`, so ADM remains disabled.

- [ ] **Step 10: Verify both browser modes**

Run ordinary mode with `npm run dev`; confirm there is no ADM panel and F9 does not unlock the camera.

Run admin mode with `npm run dev:admin`; verify collapse/expand, waves 1–5, clean direct Boss transition, hitkill, immortality, camera toggle, and marked-target attack while holding movement. Inspect browser console for errors after each transition.

- [ ] **Step 11: Record final checkpoint**

Record test count, build exit code, browser results, and changed files in the handoff. Do not claim commit creation because this workspace is not a Git repository.
