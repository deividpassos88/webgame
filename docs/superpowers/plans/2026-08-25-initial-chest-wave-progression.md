# Initial Chest and Wave Progression Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Start each run with an equipment chest, then execute five 15-enemy waves followed by one boss and four mini-bosses, with full-run reset on death and a replayable victory screen.

**Architecture:** A pure `WaveManager` state machine owns timers, counts, difficulty, and progression commands. `Game` converts those commands into Three.js entities through focused spawn planners and a combat registry, while an initial-equipment coordinator gates combat until Sword or Axe is equipped. HUD rendering consumes immutable wave snapshots.

**Tech Stack:** TypeScript, Three.js 0.161, Vite 5, Vitest 4, HTML/CSS.

**Spec:** `docs/superpowers/specs/2026-08-25-initial-chest-wave-progression-design.md`

## Global Constraints

- Begin every run with only the Paladin and one `chest.glb` placed 2.5 world units toward negative Z.
- Combat cannot start until Sword or Axe is successfully equipped.
- Run exactly 5 regular waves with exactly 15 enemies each.
- Spawn regular enemies in 5 batches of 3, separated by 2 seconds.
- Wait until all 15 enemies die, then count down 5 seconds before the next phase.
- Apply health/damage multipliers of 1.0, 1.1, 1.2, 1.3, and 1.4 to waves 1 through 5.
- Final combat contains exactly 1 boss and 4 mini-bosses and requires all 5 deaths for victory.
- Pressing `Renascer` or `Jogar novamente` performs a complete run reset, including weapon removal.
- Keep the current Paladin animation fixes, weapon attachment, debug logger, and animation-test buttons working.
- Use red-green-refactor for every behavior change.
- The workspace currently has no `.git` repository. Run each listed commit only if Git is initialized before execution; otherwise preserve each passing-test checkpoint without creating repository history.

---

### Task 1: Implement the deterministic `WaveManager` state machine

**Files:**

- Create: `src/waves/WaveManager.ts`
- Create: `src/waves/WaveManager.test.ts`

**Interfaces:**

- Consumes: elapsed frame delta in seconds, successful spawn acknowledgements, and unique enemy-death reports.
- Produces:

  ```ts
  export type WavePhase =
    | 'waiting-for-weapon'
    | 'countdown'
    | 'regular-wave'
    | 'intermission'
    | 'final-countdown'
    | 'final-battle'
    | 'victory';

  export type WaveEntityRole = 'regular' | 'mini-boss' | 'boss';

  export interface WaveManagerConfig {
    regularWaves: number;
    enemiesPerWave: number;
    batchSize: number;
    batchInterval: number;
    countdown: number;
  }

  export interface WaveSpawnRequest {
    requestId: number;
    phaseId: number;
    kind: 'regular-batch' | 'final-battle';
    wave: number | null;
    regularCount: number;
    bossCount: number;
    miniBossCount: number;
    hpMultiplier: number;
    damageMultiplier: number;
  }

  export interface WaveSnapshot {
    phase: WavePhase;
    phaseId: number;
    wave: number;
    spawned: number;
    alive: number;
    total: 0 | 5 | 15;
    countdownSeconds: number;
  }

  export class WaveManager {
    public constructor(config?: Partial<WaveManagerConfig>);
    public weaponSelected(): boolean;
    public update(delta: number): readonly WaveSpawnRequest[];
    public acknowledgeSpawn(
      requestId: number,
      entities: readonly { id: string; role: WaveEntityRole }[]
    ): boolean;
    public enemyDefeated(entityId: string, phaseId: number): boolean;
    public reset(): void;
    public get snapshot(): WaveSnapshot;
  }
  ```

- [ ] **Step 1: Write failing tests for weapon gating and the first wave**

  ```ts
  import { describe, expect, it } from 'vitest';
  import { WaveManager } from './WaveManager';

  describe('WaveManager regular progression', () => {
    it('emits nothing before weapon selection', () => {
      const manager = new WaveManager();
      expect(manager.update(30)).toEqual([]);
      expect(manager.snapshot.phase).toBe('waiting-for-weapon');
    });

    it('starts wave one after five seconds and emits three enemies immediately', () => {
      const manager = new WaveManager();
      expect(manager.weaponSelected()).toBe(true);
      expect(manager.weaponSelected()).toBe(false);
      expect(manager.update(4.9)).toEqual([]);
      const [request] = manager.update(0.1);
      expect(request).toMatchObject({
        kind: 'regular-batch', wave: 1, regularCount: 3,
        bossCount: 0, miniBossCount: 0,
        hpMultiplier: 1, damageMultiplier: 1,
      });
    });
  });
  ```

- [ ] **Step 2: Run the focused test and verify the missing-module failure**

  Run: `npm test -- src/waves/WaveManager.test.ts`

  Expected: FAIL because `WaveManager.ts` does not exist.

- [ ] **Step 3: Implement state, countdown, and one outstanding spawn request**

  Use constants `REGULAR_WAVES = 5`, `ENEMIES_PER_WAVE = 15`, `BATCH_SIZE = 3`, `BATCH_INTERVAL = 2`, and `COUNTDOWN = 5`. Clamp negative delta to zero. `weaponSelected()` changes only `waiting-for-weapon` to `countdown`, increments `phaseId`, and sets the countdown to 5.

  Merge constructor overrides into defaults `{ regularWaves: 5, enemiesPerWave: 15, batchSize: 3, batchInterval: 2, countdown: 5 }` and reject non-positive/incompatible values, including `enemiesPerWave % batchSize !== 0`. Permit only one unacknowledged request. When a request expects 3 regular entities and acknowledgement contains 2 unique regular IDs, the next `update(0)` must request exactly the missing 1 before the two-second timer begins.

- [ ] **Step 4: Add failing tests for all five batches and spawn retry**

  ```ts
  it('delivers exactly five acknowledged batches and retries missing members', () => {
    const manager = new WaveManager();
    manager.weaponSelected();
    const [first] = manager.update(5);
    manager.acknowledgeSpawn(first.requestId, [
      { id: 'w1-a', role: 'regular' },
      { id: 'w1-b', role: 'regular' },
    ]);
    const [retry] = manager.update(0);
    expect(retry.regularCount).toBe(1);
    manager.acknowledgeSpawn(retry.requestId, [{ id: 'w1-c', role: 'regular' }]);

    const ids = ['d', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l', 'm', 'n', 'o'];
    for (let batch = 0; batch < 4; batch++) {
      const [request] = manager.update(2);
      const batchIds = ids.slice(batch * 3, batch * 3 + 3).map((id) => `w1-${id}`);
      manager.acknowledgeSpawn(
        request.requestId,
        batchIds.map((id) => ({ id, role: 'regular' as const }))
      );
    }
    expect(manager.snapshot).toMatchObject({ wave: 1, spawned: 15, alive: 15, total: 15 });
    expect(manager.update(20)).toEqual([]);
  });
  ```

- [ ] **Step 5: Implement acknowledgement, unique IDs, batch interval, and completion guards**

  Track active IDs and roles in a `Map<string, WaveEntityRole>`, acknowledged IDs in the current request, completed batch sizes, and a batch timer. Reject unknown request IDs, repeated acknowledgements, duplicate entity IDs, wrong roles, and stale requests without throwing. For final combat, acknowledgements preserve whether the missing retry is the boss or a mini-boss.

- [ ] **Step 6: Add failing tests for five-wave multipliers and final combat**

  Use a helper inside the test that acknowledges each request and reports every active ID dead. Assert literal multipliers `[1, 1.1, 1.2, 1.3, 1.4]`, a five-second pause after each cleared wave, and one final request:

  ```ts
  expect(finalRequest).toMatchObject({
    kind: 'final-battle', wave: null, regularCount: 0,
    bossCount: 1, miniBossCount: 4,
  });
  ```

  Acknowledge `{ id: 'boss', role: 'boss' }` and four `mini-boss` records named `mini-1` through `mini-4`; report four deaths and assert phase remains `final-battle`, then report the fifth and assert `victory`.

- [ ] **Step 7: Implement phase advancement, multipliers, final battle, and idempotent reset**

  Wave completion requires `spawned === 15`, `activeIds.size === 0`, and no outstanding request. Final completion requires `spawned === 5` and no active IDs. `reset()` increments `phaseId`, clears all IDs/requests/timers, sets wave and counts to zero, and returns to `waiting-for-weapon`; stale deaths carrying the prior `phaseId` return `false`.

- [ ] **Step 8: Verify and checkpoint**

  Run: `npm test -- src/waves/WaveManager.test.ts`

  Expected: all WaveManager tests PASS.

  Run: `npm test && npm run build`

  Expected: full suite and production build PASS.

  ```bash
  git add src/waves/WaveManager.ts src/waves/WaveManager.test.ts
  git commit -m "feat: add deterministic wave state machine"
  ```

---

### Task 2: Plan safe spawn positions and enemy difficulty descriptors

**Files:**

- Create: `src/waves/WaveSpawnPlanner.ts`
- Create: `src/waves/WaveSpawnPlanner.test.ts`
- Create: `src/waves/WaveEnemyFactory.ts`
- Create: `src/waves/WaveEnemyFactory.test.ts`
- Modify: `src/world/Level.ts`
- Modify: `src/entities/Boss.ts`

**Interfaces:**

- Consumes: `WaveSpawnRequest`, arena spawn points, Paladin position, and batch cursor.
- Produces:

  ```ts
  export function selectBatchSpawnPoints(
    points: readonly THREE.Vector3[],
    playerPosition: THREE.Vector3,
    count: number,
    cursor: number
  ): THREE.Vector3[];

  export function createRegularEnemyOptions(
    position: THREE.Vector3,
    hpMultiplier: number,
    damageMultiplier: number,
    colorIndex: number
  ): EnemyOptions;

  export function createMiniBossOptions(position: THREE.Vector3): EnemyOptions;
  export function createBoss(position: THREE.Vector3): Enemy;
  ```

- [ ] **Step 1: Write failing spawn-planner tests**

  Test with six literal points, including one 2 units from the player. Assert three distinct cloned points, every result at least 5 units from the player, deterministic rotation by cursor, and an empty result when fewer than `count` safe distinct points exist.

- [ ] **Step 2: Run the planner test and verify failure**

  Run: `npm test -- src/waves/WaveSpawnPlanner.test.ts`

  Expected: FAIL because the planner is missing.

- [ ] **Step 3: Implement deterministic safe-point selection**

  Filter using horizontal X/Z distance `>= 5`, rotate the filtered list by normalized `cursor % length`, take `count`, reject duplicates by `x:z`, and clone returned vectors so callers cannot mutate Level-owned data.

- [ ] **Step 4: Write failing descriptor tests with hand-calculated values**

  ```ts
  expect(createRegularEnemyOptions(pos, 1.3, 1.3, 0)).toMatchObject({
    hp: 78, damage: 10, scale: 0.95,
    detectionRange: 8, attackRange: 1.5, speed: 2.2,
  });
  expect(createMiniBossOptions(pos)).toMatchObject({
    hp: 220, damage: 14, scale: 1.6,
  });
  ```

  Assert the returned position is a clone and regular colors cycle through `0x8a1010`, `0x6a2a8a`, and `0x1a6a4a`.

- [ ] **Step 5: Implement descriptor factories and final spawn layout**

  Use base regular values `{ hp: 60, damage: 8, scale: 0.95, detectionRange: 8, attackRange: 1.5, speed: 2.2 }` and `Math.round` for multiplied health/damage. Use mini-boss color `0xb35a16`, detection range 10, attack range 2, and speed 1.9.

  Add to `Level`:

  ```ts
  public getWaveSpawnPoints(): THREE.Vector3[];
  public getFinalBattleSpawnLayout(): {
    boss: THREE.Vector3;
    miniBosses: [THREE.Vector3, THREE.Vector3, THREE.Vector3, THREE.Vector3];
  };
  ```

  Return the existing six perimeter points plus `(12,0,10)`, `(-12,0,10)`, `(12,0,-10)`, and `(-12,0,-10)`. Place mini-bosses at `(-3,0,-11)`, `(3,0,-11)`, `(-3,0,-17)`, and `(3,0,-17)` around the existing boss point `(0,0,-14)`.

- [ ] **Step 6: Verify and checkpoint**

  Run: `npm test -- src/waves/WaveSpawnPlanner.test.ts src/waves/WaveEnemyFactory.test.ts`

  Expected: PASS.

  Run: `npm test && npm run build`

  Expected: PASS.

  ```bash
  git add src/waves/WaveSpawnPlanner.ts src/waves/WaveSpawnPlanner.test.ts src/waves/WaveEnemyFactory.ts src/waves/WaveEnemyFactory.test.ts src/world/Level.ts src/entities/Boss.ts
  git commit -m "feat: add wave enemy spawn planning"
  ```

---

### Task 3: Track combat entities and support complete weapon removal

**Files:**

- Create: `src/waves/CombatEntityRegistry.ts`
- Create: `src/waves/CombatEntityRegistry.test.ts`
- Modify: `src/equipment/WeaponAttachment.ts`
- Modify: `src/equipment/WeaponAttachment.test.ts`
- Modify: `src/entities/Player.ts`

**Interfaces:**

- Produces:

  ```ts
  export interface CombatRecord {
    id: string;
    phaseId: number;
    role: WaveEntityRole;
    enemy: Enemy;
    deathReported: boolean;
  }

  export class CombatEntityRegistry {
    public register(record: Omit<CombatRecord, 'deathReported'>): boolean;
    public findByRoot(root: THREE.Object3D): CombatRecord | null;
    public activeRoots(): THREE.Object3D[];
    public reportDeath(root: THREE.Object3D): Pick<CombatRecord, 'id' | 'phaseId' | 'role'> | null;
    public update(delta: number, playerPosition: THREE.Vector3, onDamage: (damage: number) => void): void;
    public clear(): void;
    public get mainBoss(): Enemy | null;
  }

  export class WeaponEquipment {
    public unequip(): boolean;
  }

  export class Player {
    public unequipWeapon(): boolean;
  }
  ```

- [ ] **Step 1: Write failing registry tests using real `Enemy` roots**

  Register regular, mini-boss, and boss records. Assert duplicate IDs are rejected, `activeRoots()` excludes dead enemies, `reportDeath()` returns metadata once and then `null`, `mainBoss` returns only the boss role, and `clear()` removes every enemy root from its parent and empties the registry.

- [ ] **Step 2: Run and verify missing-module failure**

  Run: `npm test -- src/waves/CombatEntityRegistry.test.ts`

  Expected: FAIL because the registry is absent.

- [ ] **Step 3: Implement the registry with a `Map<string, CombatRecord>`**

  `update()` calls every entity's existing `Enemy.update`, then removes and deletes records marked for removal. `clear()` calls `root.removeFromParent()` and clears the map; do not dispose shared player/reward assets.

- [ ] **Step 4: Add a failing weapon-removal test**

  Equip Sword through `WeaponEquipment`, call `unequip()`, and assert the pivot has no parent, `equippedWeaponId` is `null`, a second call returns `false`, and a new Axe can be equipped afterward.

- [ ] **Step 5: Implement weapon and Player removal APIs**

  `WeaponEquipment.unequip()` removes the current pivot, clears attachment and ID, and returns whether anything changed. `Player.unequipWeapon()` delegates to it. `Player.respawn()` remains responsible for health, mana, position, and idle animation; `Game` explicitly calls `unequipWeapon()` only during full-run reset.

- [ ] **Step 6: Verify and checkpoint**

  Run: `npm test -- src/waves/CombatEntityRegistry.test.ts src/equipment/WeaponAttachment.test.ts`

  Expected: PASS.

  Run: `npm test && npm run build`

  Expected: PASS.

  ```bash
  git add src/waves/CombatEntityRegistry.ts src/waves/CombatEntityRegistry.test.ts src/equipment/WeaponAttachment.ts src/equipment/WeaponAttachment.test.ts src/entities/Player.ts
  git commit -m "feat: add combat registry and weapon reset"
  ```

---

### Task 4: Convert boss reward into initial equipment flow

**Files:**

- Create: `src/rewards/InitialEquipmentCoordinator.ts`
- Create: `src/rewards/InitialEquipmentCoordinator.test.ts`
- Modify: `src/rewards/RewardFlow.ts`
- Modify: `src/rewards/RewardFlow.test.ts`
- Delete after migration: `src/rewards/BossRewardCoordinator.ts`
- Delete after migration: `src/rewards/BossRewardCoordinator.test.ts`
- Modify: `src/ui/HUD.ts`
- Modify: `index.html`

**Interfaces:**

- Consumes the same Player, HUD, reward assets, and `RewardChest` ports currently used by `BossRewardCoordinator`.
- Produces:

  ```ts
  export class InitialEquipmentCoordinator {
    public start(position: THREE.Vector3): THREE.Group | null;
    public getChestRoot(): THREE.Group | null;
    public clickChest(): ChestInteractionResult;
    public update(delta: number): void;
    public choose(id: EquipmentId): boolean;
    public reset(position: THREE.Vector3): THREE.Group | null;
  }
  ```

- [ ] **Step 1: Write failing coordinator tests**

  Adapt the existing real-state/fake-port test to assert:

  - `start(new Vector3(0,0,7.5))` returns one chest at that exact position.
  - No boss-death signal exists or is required.
  - Distant click approaches; in-range click opens.
  - Successful Sword/Axe choice equips once and returns `true`.
  - `reset(position)` disposes the previous chest if present, clears claimed/opening flow state, and creates one new chest.
  - Missing chest opens selection directly.
  - Both missing weapons expose restart, not continuation without a weapon.

- [ ] **Step 2: Run and verify failure**

  Run: `npm test -- src/rewards/InitialEquipmentCoordinator.test.ts`

  Expected: FAIL because the new coordinator is absent.

- [ ] **Step 3: Rename the reward flow's initial state and add reset**

  Change `waiting-for-boss` to `waiting-for-chest`, replace `bossDefeated(chestAvailable)` with `start(chestAvailable)`, and add `reset()` that returns to `waiting-for-chest`. Preserve closed/approaching/opening/choosing/claimed one-time guards.

- [ ] **Step 4: Implement `InitialEquipmentCoordinator`**

  Port the tested approach/open/choose logic. `start()` creates the chest or displays direct selection. `reset()` disposes any live chest, unlocks input, hides reward UI, resets flow, clears per-run failed-attachment IDs, then calls `start(position)`.

  Replace the current `continueWithoutReward()` behavior with an unavailable-equipment callback owned by `Game`; update the HTML button copy from `Continuar sem arma` to `Reiniciar partida` and rename HUD registration to:

  ```ts
  public onEquipmentRestart(callback: () => void): void;
  ```

- [ ] **Step 5: Verify migration and remove obsolete files**

  Run: `npm test -- src/rewards/RewardFlow.test.ts src/rewards/InitialEquipmentCoordinator.test.ts`

  Expected: PASS.

  Run: `rg -n "BossRewardCoordinator|bossDefeated|Continuar sem arma" src index.html`

  Expected: no matches.

  Run: `npm test && npm run build`

  Expected: PASS.

  ```bash
  git add src/rewards src/ui/HUD.ts index.html
  git commit -m "refactor: make chest the initial equipment gate"
  ```

---

### Task 5: Add wave status and victory UI

**Files:**

- Create: `src/ui/WaveHudView.ts`
- Create: `src/ui/WaveHudView.test.ts`
- Modify: `src/ui/HUD.ts`
- Modify: `index.html`
- Modify: `src/style.css`

**Interfaces:**

- Consumes: `WaveSnapshot` from Task 1.
- Produces:

  ```ts
  export interface WaveHudContent {
    visible: boolean;
    title: string;
    detail: string;
  }

  export function getWaveHudContent(snapshot: WaveSnapshot): WaveHudContent;

  export class HUD {
    public updateWaveStatus(snapshot: WaveSnapshot): void;
    public hideWaveStatus(): void;
    public showVictoryScreen(): void;
    public hideVictoryScreen(): void;
    public onPlayAgain(callback: () => void): void;
  }
  ```

- [ ] **Step 1: Write failing pure view tests**

  Assert literal output for waiting (hidden), countdown (`Próxima onda em: 5`), regular wave 3 (`Onda 3/5`, `Restantes: 8/15`), final countdown (`Boss final em: 4`), final battle (`BOSS FINAL`, `Inimigos restantes: 5/5`), and victory (hidden because the victory overlay owns the screen).

- [ ] **Step 2: Run and verify failure**

  Run: `npm test -- src/ui/WaveHudView.test.ts`

  Expected: FAIL because the view mapper does not exist.

- [ ] **Step 3: Implement the view mapper and HUD methods**

  Round countdown upward with `Math.ceil`. Add `#wave-status`, `#wave-title`, and `#wave-detail` to the HUD. Add `#victory-screen` as a hidden dialog-like overlay with heading `Dungeon concluída` and button `#play-again-btn` labeled `Jogar novamente`.

- [ ] **Step 4: Style the new UI in the established visual system**

  Use the existing black/warm-black surfaces, `Consolas`, amber `#ffb800` one-pixel borders, square corners, and responsive widths. Place wave status at top center below the animation warning; stack compactly below 560 px. Give victory overlay a higher z-index than gameplay HUD and lower/equal visual priority to the existing death overlay.

- [ ] **Step 5: Verify and checkpoint**

  Run: `npm test -- src/ui/WaveHudView.test.ts`

  Expected: PASS.

  Run: `npm test && npm run build`

  Expected: PASS.

  ```bash
  git add src/ui/WaveHudView.ts src/ui/WaveHudView.test.ts src/ui/HUD.ts index.html src/style.css
  git commit -m "feat: add wave and victory HUD"
  ```

---

### Task 6: Integrate initial chest, five waves, final battle, and full reset in `Game`

**Files:**

- Create: `src/core/RunProgression.ts`
- Create: `src/core/RunProgression.test.ts`
- Modify: `src/core/Game.ts`
- Modify: `src/entities/Enemy.ts` only if registry lifecycle needs a read-only identifier field; prefer `CombatEntityRegistry` metadata instead

**Interfaces:**

- Consumes: `WaveManager`, `WaveSpawnRequest`, `WaveSpawnPlanner`, `WaveEnemyFactory`, `CombatEntityRegistry`, `InitialEquipmentCoordinator`, Player/HUD/Level APIs from Tasks 2–5.
- Produces one cohesive run lifecycle through private `Game` methods:

  ```ts
  export interface RunProgressionPorts {
    spawn(request: WaveSpawnRequest): readonly { id: string; role: WaveEntityRole }[];
    render(snapshot: WaveSnapshot): void;
    victory(): void;
  }

  export class RunProgression {
    public constructor(manager: WaveManager, ports: RunProgressionPorts);
    public weaponEquipped(): boolean;
    public update(delta: number): void;
    public enemyDefeated(id: string, phaseId: number): boolean;
    public reset(): void;
    public get snapshot(): WaveSnapshot;
  }
  ```

  `RunProgression.update` obtains requests, passes each to `ports.spawn`, acknowledges returned records, renders the latest snapshot, and calls `ports.victory()` only on the transition into victory. `Game` implements the ports with real scene behavior.

  `Game` also provides:

  ```ts
  private startInitialEquipment(): void;
  private spawnWaveRequest(
    request: WaveSpawnRequest
  ): readonly { id: string; role: WaveEntityRole }[];
  private spawnRegularBatch(
    request: WaveSpawnRequest
  ): readonly { id: string; role: 'regular' }[];
  private spawnFinalBattle(
    request: WaveSpawnRequest
  ): readonly { id: string; role: 'boss' | 'mini-boss' }[];
  private fullRunReset(): void;
  ```

- [ ] **Step 1: Write a failing integration test around `RunProgressionPorts`**

  Because `Game` requires WebGL, test `RunProgression` with a real `WaveManager` and an in-memory port whose `spawn` returns unique role-aware acknowledgements and stores them as observable scene state. The test must assert:

  ```ts
  expect(scene.enemies).toHaveLength(0);
  expect(progression.weaponEquipped()).toBe(true);
  progression.update(5);
  expect(scene.enemies).toHaveLength(3);
  // acknowledge five batches, kill 15, repeat through wave five
  expect(scene.finalRoles.sort()).toEqual([
    'boss', 'mini-boss', 'mini-boss', 'mini-boss', 'mini-boss'
  ]);
  ```

  Report deaths through `progression.enemyDefeated`, drive all five waves, and assert `ports.victory()` becomes observable once. Separately test that `progression.reset()` returns its snapshot to `waiting-for-weapon`; the Game-level reset effects are verified after wiring in Step 9 and browser verification in Task 7.

- [ ] **Step 2: Run and verify failure**

  Run: `npm test -- src/core/RunProgression.test.ts`

  Expected: FAIL because run integration is not implemented.

- [ ] **Step 3: Replace startup combat with the initial chest**

  Remove `ENABLE_ENEMIES`, startup `spawnEnemies()`, `bossFightStarted`, proximity boss spawning, `spawnBoss()`, and post-boss reward handling. After Player and reward coordinator creation, compute:

  ```ts
  const chestPosition = this.spawnPoint.clone().add(new THREE.Vector3(0, 0, -2.5));
  ```

  Start initial equipment there and add its returned root. Do not create any `Enemy` before successful weapon selection.

- [ ] **Step 4: Start WaveManager only after successful equipment**

  Construct `RunProgression` with `spawn: (request) => this.spawnWaveRequest(request)`, HUD rendering, and victory ports. In the HUD reward callback, call `initialEquipment.choose(id)`. Only when it returns `true`, call `runProgression.weaponEquipped()`. Repeated selection returns false and cannot restart timers.

- [ ] **Step 5: Process regular spawn requests synchronously**

  For each regular request, call `selectBatchSpawnPoints` with `regularCount` and the persistent spawn cursor. Create one `Enemy` per point using `createRegularEnemyOptions`, assign IDs `${phaseId}:regular:${sequence}`, add roots to scene, register records, and return successful `{ id, role: 'regular' }` acknowledgements to `RunProgression`. Catch per-entity construction errors, log them, and omit failed records from the returned array so `RunProgression` acknowledges only successes and the manager retries the missing count.

- [ ] **Step 6: Process the final request**

  Create the main boss using `createBoss(layout.boss)` and four mini-bosses using `createMiniBossOptions`. Register roles and IDs, add all successful roots, return `{ id, role }` acknowledgements to `RunProgression`, show the boss health bar only when the boss registered successfully, and let the role-aware request contract retry only the missing boss or mini-boss slots without duplicating successful entities.

- [ ] **Step 7: Route combat deaths through the registry and manager**

  Replace `findEnemyByRoot` and array/boss special cases with `combatRegistry.findByRoot`. After `enemy.takeDamage`, call `combatRegistry.reportDeath(root)`; if metadata is returned, call `waveManager.enemyDefeated(id, phaseId)`. Duplicate hits on dead enemies produce no second report. Use `combatRegistry.mainBoss` for boss-health updates.

- [ ] **Step 8: Update waves and HUD every frame**

  In the loop, call in order: player update, equipment update, combat registry update, `runProgression.update(delta)`, Level update, renderer. The spawn port delegates to `spawnWaveRequest`, the render port calls `hud.updateWaveStatus`, and the one-time victory port locks player combat input, hides boss health, and shows the victory screen.

- [ ] **Step 9: Implement one idempotent full reset**

  `fullRunReset()` performs:

  ```ts
  this.combatRegistry.clear();
  this.runProgression.reset();
  this.player.unequipWeapon();
  this.player.respawn(this.spawnPoint);
  this.player.setInputLocked(false);
  this.hud.hideDeathScreen();
  this.hud.hideVictoryScreen();
  this.hud.hideBossHealth();
  this.hud.hideWaveStatus();
  this.startInitialEquipment();
  ```

  Guard reentrancy within the same frame. Wire both `onRespawnClick` and `onPlayAgain` to this method. When player HP reaches zero, show the death screen and stop accepting combat input until `Renascer` is clicked; do not reset automatically.

- [ ] **Step 10: Change both-weapon failure to full reset**

  Wire `HUD.onEquipmentRestart` to `fullRunReset`. Confirm no code path calls `runProgression.weaponEquipped()` without `Player.equippedWeaponId` being `sword` or `axe`.

- [ ] **Step 11: Verify the integration and obsolete-flow removal**

  Run: `npm test -- src/core/RunProgression.test.ts`

  Expected: PASS.

  Run: `rg -n "ENABLE_ENEMIES|spawnEnemies\(|bossFightStarted|bossDefeated|BossRewardCoordinator|Continuar sem arma" src index.html`

  Expected: no matches.

  Run: `npm test && npm run build`

  Expected: all tests and production build PASS.

  ```bash
  git add src/core src/waves src/rewards src/entities src/ui index.html
  git commit -m "feat: integrate five-wave dungeon progression"
  ```

---

### Task 7: Perform final real-browser and regression verification

**Files:**

- Modify only if rendered defects are found: `src/style.css`, `src/waves/WaveEnemyFactory.ts`, `src/world/Level.ts`
- Test alongside each defect before changing production behavior: matching `*.test.ts`

**Interfaces:**

- Consumes the completed game.
- Produces verification evidence; no permanent preview or timing hooks.

- [ ] **Step 1: Run the complete automated baseline**

  Run: `npm test`

  Expected: every test file passes with zero failures.

  Run: `npm run build`

  Expected: TypeScript and Vite production build exit with code 0.

- [ ] **Step 2: Start the local game and verify initial gating**

  Run: `npm run dev -- --host 127.0.0.1`

  Confirm no monster or boss exists before equipment, one chest sits 2.5 units in front of the Paladin, click/approach/open works, and Sword/Axe selection starts a visible five-second countdown.

- [ ] **Step 3: Verify full progression with a removable development timing configuration**

  Temporarily change only the `Game` field initialization from `new WaveManager()` to:

  ```ts
  new WaveManager({
    countdown: 0.2,
    batchInterval: 0.1,
    regularWaves: 5,
    enemiesPerWave: 15,
    batchSize: 3,
  });
  ```

  In the same temporary browser-verification edit, schedule each successfully registered enemy for an acknowledged test death after the spawn acknowledgement has returned:

  ```ts
  window.setTimeout(() => {
    enemy.takeDamage(9999);
    const death = this.combatRegistry.reportDeath(enemy.root);
    if (death) this.runProgression.enemyDefeated(death.id, death.phaseId);
  }, 250);
  ```

  Apply the block to regular, boss, and mini-boss creation only during this local run. Use the accelerated progression to inspect all five wave labels, 75 acknowledged regular spawns in logs, one boss plus four mini-bosses, and the victory overlay. Restore the field to `new WaveManager()` and remove every auto-death block immediately after the browser run; do not add a query-string or conditional production hook.

  Remove the harness configuration after the browser run and execute:

  `rg -n "countdown:\s*0\.2|batchInterval:\s*0\.1|enemy\.takeDamage\(9999\)|wave-preview|reward-preview" src index.html`

  Expected: no preview hook or shortened production timing remains.

- [ ] **Step 4: Verify death reset and replay**

  During a regular wave, use the existing `K` animation/debug key to trigger death, click `Renascer`, and confirm all combat entities and weapon are gone and exactly one fresh chest exists. Complete the shortened final phase, click `Jogar novamente`, and confirm the same clean initial state.

- [ ] **Step 5: Verify responsive HUD and equipment regressions**

  At desktop size and 390×844, inspect wave status, reward modal, death overlay, and victory overlay for clipping. Equip Sword in one run and Axe in another; use the five existing animation buttons to verify each weapon follows `idle`, `running`, `attacking`, `hit`, and `dead`.

- [ ] **Step 6: Run fresh final evidence commands**

  Run: `npm test && npm run build`

  Expected: zero test failures and build exit code 0 after all temporary validation aids are removed.

  ```bash
  git add src index.html docs/superpowers
  git commit -m "test: verify complete wave progression"
  ```

## Final Acceptance Checklist

- [ ] Only Paladin and the initial chest appear at run start.
- [ ] Combat starts only after Sword or Axe is equipped.
- [ ] Five regular waves each acknowledge exactly 15 unique enemies.
- [ ] Each wave uses five batches of three with two-second spacing.
- [ ] Intermissions last five seconds and wait for zero living enemies.
- [ ] Wave multipliers are exactly 1.0 through 1.4.
- [ ] Final battle contains one boss and four mini-bosses.
- [ ] Victory requires all five final deaths.
- [ ] `Renascer` and `Jogar novamente` restore one clean initial chest and no weapon/enemies.
- [ ] No shortened timing, preview hook, or obsolete post-boss reward code remains.
- [ ] Full automated suite, production build, and desktop/mobile visual checks pass.
