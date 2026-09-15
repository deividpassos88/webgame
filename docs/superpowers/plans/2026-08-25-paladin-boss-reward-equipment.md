# Paladin Boss Reward Equipment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan.

**Goal:** Start the game directly with the Paladin, reactivate the enemies and boss, spawn a one-time reward chest after the boss dies, and let the player choose and equip either `sword.glb` or `axe.glb` in the Paladin's right hand.

**Architecture:** Keep `Game` as the orchestration boundary while moving equipment definitions, GLB caching, attachment math, and reward-flow transitions into small testable modules. The chest is a scene entity with a procedural opening sequence; the reward modal is controlled by `HUD`. `Player` owns equipped objects and exposes a narrow socket-based equipment API.

**Tech Stack:** TypeScript, Three.js 0.161, Vite 5, Vitest 4, HTML/CSS.

**Spec:** `docs/superpowers/specs/2026-08-25-paladin-boss-reward-equipment-design.md`

## Global Constraints

- Keep only `paladin` (`/models/dragonminer-optimized2.glb`) as the playable hero and do not display the character-selection screen.
- Keep the current animation test panel working.
- The chest must not exist before the boss dies and may be claimed only once.
- Offer only `Sword` and `Axe`; reserve the `chest` equipment-slot type for later without displaying armor UI.
- Treat `/models/chest.glb`, `/models/sword.glb`, and `/models/axe.glb` as static GLBs. Do not depend on Blender animations.
- Attach weapons to `mixamorigRightHand`; missing sockets or assets must fail visibly and must not crash the render loop.
- All behavior changes follow red-green-refactor: write the focused failing test, observe the expected failure, implement the minimum, then rerun the focused and full suites.
- This folder is currently not a Git repository. Each task includes the intended commit; run it only if Git is initialized before execution. Otherwise preserve the passing-test checkpoint and continue without inventing repository history.

---

### Task 1: Start directly with the Paladin and reactivate combat

**Files:**

- Modify: `src/characters/CharacterCatalog.ts`
- Modify: `src/characters/CharacterAssetStore.ts`
- Modify: `src/core/Game.ts`
- Modify: `index.html`
- Create: `src/characters/PlayableCharacter.test.ts`

- [ ] **Step 1: Write a failing playable-character policy test**

  Add a public policy in `CharacterCatalog.ts` and assert that startup resolves exactly one hero:

  ```ts
  import { describe, expect, it } from 'vitest';
  import { getPlayableCharacters } from './CharacterCatalog';

  describe('playable character policy', () => {
    it('starts with only the Paladin model', () => {
      expect(getPlayableCharacters().map(({ id, modelPath }) => ({ id, modelPath }))).toEqual([
        { id: 'paladin', modelPath: '/models/dragonminer-optimized2.glb' },
      ]);
    });
  });
  ```

- [ ] **Step 2: Run the focused test and confirm the expected missing-export failure**

  Run: `npm test -- src/characters/PlayableCharacter.test.ts`

  Expected: FAIL because `getPlayableCharacters` does not exist.

- [ ] **Step 3: Implement the fixed Paladin policy and targeted asset loading**

  In `CharacterCatalog.ts`, export:

  ```ts
  export const PLAYABLE_CHARACTER_ID: CharacterId = 'paladin';
  export function getPlayableCharacters(): readonly CharacterDefinition[] {
    return CHARACTERS.filter(({ id }) => id === PLAYABLE_CHARACTER_ID);
  }
  ```

  Change `CharacterAssetStore.loadAll` to accept an optional definitions argument while preserving existing callers:

  ```ts
  public async loadAll(
    onProgress?: CharacterLoadProgress,
    definitions: readonly CharacterDefinition[] = CHARACTERS
  ): Promise<void>
  ```

  Use `definitions` for the map, total, and progress callback.

- [ ] **Step 4: Bypass the selector in `Game.start`**

  Remove the `CharacterSelectScreen` import and selection promise. Load only `getPlayableCharacters()`, obtain `PLAYABLE_CHARACTER_ID`, verify that asset, set HUD name to Paladino, and construct `Player` directly. Change `ENABLE_ENEMIES` to `true` and update startup logs so they no longer describe test mode.

- [ ] **Step 5: Remove only the obsolete character-selection markup**

  Delete the selector overlay/cards from `index.html`; do not remove the loading screen, gameplay HUD, logger, or animation test controls.

- [ ] **Step 6: Verify this checkpoint**

  Run: `npm test -- src/characters/PlayableCharacter.test.ts`

  Expected: PASS.

  Run: `npm test && npm run build`

  Expected: all existing tests and TypeScript/Vite build pass.

- [ ] **Step 7: Commit if Git is available**

  ```bash
  git add src/characters/CharacterCatalog.ts src/characters/CharacterAssetStore.ts src/core/Game.ts src/characters/PlayableCharacter.test.ts index.html
  git commit -m "feat: start game directly with paladin"
  ```

---

### Task 2: Define equipment and preload reward GLBs safely

**Files:**

- Create: `src/equipment/EquipmentCatalog.ts`
- Create: `src/equipment/EquipmentCatalog.test.ts`
- Create: `src/equipment/RewardAssetStore.ts`
- Create: `src/equipment/RewardAssetStore.test.ts`

- [ ] **Step 1: Write failing catalog tests for the two approved rewards**

  ```ts
  import { describe, expect, it } from 'vitest';
  import { EQUIPMENT_SLOTS, WEAPONS, getWeaponDefinition } from './EquipmentCatalog';

  describe('equipment catalog', () => {
    it('offers only Sword and Axe as weapon rewards', () => {
      expect(WEAPONS.map(({ id, label, modelPath }) => ({ id, label, modelPath }))).toEqual([
        { id: 'sword', label: 'Espada', modelPath: '/models/sword.glb' },
        { id: 'axe', label: 'Machado', modelPath: '/models/axe.glb' },
      ]);
    });

    it('reserves weapon and chest slots without adding armor rewards', () => {
      expect(EQUIPMENT_SLOTS).toEqual(['weapon', 'chest']);
      expect(getWeaponDefinition('armor')).toBeUndefined();
    });
  });
  ```

- [ ] **Step 2: Run and confirm failure**

  Run: `npm test -- src/equipment/EquipmentCatalog.test.ts`

  Expected: FAIL because the catalog module is absent.

- [ ] **Step 3: Implement typed equipment definitions**

  Define:

  ```ts
  export type EquipmentId = 'sword' | 'axe';
  export type EquipmentSlot = 'weapon' | 'chest';
  export const EQUIPMENT_SLOTS: readonly EquipmentSlot[] = ['weapon', 'chest'];

  export interface WeaponDefinition {
    id: EquipmentId;
    label: 'Espada' | 'Machado';
    assetLabel: 'Sword' | 'Axe';
    modelPath: string;
    slot: 'weapon';
    socketName: 'mixamorigRightHand';
    desiredLength: number;
    gripFraction: number;
    rotation: readonly [number, number, number];
    offset: readonly [number, number, number];
  }
  ```

  Add exactly two definitions. Start with `desiredLength: 1.35`, `gripFraction: 0.12`, zero offset, and explicit Euler rotations per model. These are calibration data, not hard-coded in `Player`.

- [ ] **Step 4: Write a failing asset-store test with an injected loader**

  Add a minimal loader interface `{ loadAsync(path: string): Promise<GLTF> }`. Test that `loadAll()` requests chest, sword, and axe paths, records individual failures, and returns skeleton-safe clones rather than shared scene instances.

- [ ] **Step 5: Implement `RewardAssetStore`**

  Configure `GLTFLoader` with the same Draco and Meshopt support as character loading. Expose:

  ```ts
  public loadAll(onProgress?: (completed: number, total: number) => void): Promise<void>;
  public hasChest(): boolean;
  public hasWeapon(id: EquipmentId): boolean;
  public createChest(): THREE.Group;
  public createWeapon(id: EquipmentId): THREE.Group;
  public getChestError(): unknown;
  public getWeaponError(id: EquipmentId): unknown;
  ```

  Catch each asset error independently so one bad model does not discard the other rewards.

- [ ] **Step 6: Verify and commit**

  Run: `npm test -- src/equipment/EquipmentCatalog.test.ts src/equipment/RewardAssetStore.test.ts`

  Expected: PASS.

  Run: `npm test && npm run build`

  Expected: PASS.

  ```bash
  git add src/equipment
  git commit -m "feat: add reward equipment asset catalog"
  ```

---

### Task 3: Attach and replace weapons on the Paladin's right hand

**Files:**

- Create: `src/equipment/WeaponAttachment.ts`
- Create: `src/equipment/WeaponAttachment.test.ts`
- Modify: `src/entities/Player.ts`
- Create: `src/entities/PlayerEquipment.test.ts`

- [ ] **Step 1: Write failing attachment tests using real Three.js bones**

  Construct a `THREE.Group` with a `THREE.Bone` named `mixamorigRightHand` and a box-shaped test weapon. Assert that attachment:

  - returns `true` and parents the weapon under the bone;
  - normalizes the model's longest dimension to `desiredLength` after compensating for ancestor scale;
  - translates the configured grip point to the socket origin;
  - returns `false` without modifying the weapon when the socket is missing.

- [ ] **Step 2: Run and confirm failure**

  Run: `npm test -- src/equipment/WeaponAttachment.test.ts`

  Expected: FAIL because `attachWeaponToSocket` does not exist.

- [ ] **Step 3: Implement deterministic attachment math**

  Export:

  ```ts
  export function findBone(root: THREE.Object3D, name: string): THREE.Bone | null;
  export function attachWeaponToSocket(
    character: THREE.Object3D,
    weapon: THREE.Group,
    definition: WeaponDefinition
  ): THREE.Bone | null;
  ```

  Compute a fresh `Box3`, reject empty/zero-sized geometry, scale by the longest dimension, position the grip along the model's long axis, apply catalog Euler rotation and offset, enable mesh shadows, and add to the hand bone. Keep all corrections on a weapon pivot group so source GLB transforms remain intact.

- [ ] **Step 4: Write failing `Player` replacement and input-lock tests**

  Test through an injectable/prepared player model or a small exported equipment owner helper that:

  - equipping Sword sets `equippedWeaponId` and attaches one object;
  - equipping Axe removes the Sword from the hand before attaching Axe;
  - `setInputLocked(true)` makes movement commands inert;
  - `cancelMovement()` clears click destination, keyboard movement, and attack target.

- [ ] **Step 5: Add the narrow equipment API to `Player`**

  Retain the loaded character model and add:

  ```ts
  public get equippedWeaponId(): EquipmentId | null;
  public equipWeapon(definition: WeaponDefinition, weapon: THREE.Group): boolean;
  public cancelMovement(): void;
  public setInputLocked(locked: boolean): void;
  ```

  Make `canAcceptInput()` also reject `inputLocked`. Remove only the previous weapon pivot; never remove bones or character meshes. Log success/failure with the weapon ID and socket name.

- [ ] **Step 6: Verify and commit**

  Run: `npm test -- src/equipment/WeaponAttachment.test.ts src/entities/PlayerEquipment.test.ts`

  Expected: PASS.

  Run: `npm test && npm run build`

  Expected: PASS.

  ```bash
  git add src/equipment/WeaponAttachment.ts src/equipment/WeaponAttachment.test.ts src/entities/Player.ts src/entities/PlayerEquipment.test.ts
  git commit -m "feat: equip weapons on paladin hand"
  ```

---

### Task 4: Build the one-time boss reward flow and procedural chest

**Files:**

- Create: `src/rewards/RewardFlow.ts`
- Create: `src/rewards/RewardFlow.test.ts`
- Create: `src/entities/RewardChest.ts`
- Create: `src/entities/RewardChest.test.ts`

- [ ] **Step 1: Write failing state-flow tests**

  Model these states: `waiting-for-boss`, `closed`, `approaching`, `opening`, `choosing`, `claimed`. Assert:

  ```ts
  expect(flow.bossDefeated()).toBe('spawn');
  expect(flow.bossDefeated()).toBe('ignored');
  expect(flow.clickChest(5)).toBe('approach');
  expect(flow.playerDistanceChanged(1.5)).toBe('open');
  expect(flow.openingFinished()).toBe('choose');
  expect(flow.claim('sword')).toBe('claimed');
  expect(flow.claim('axe')).toBe('ignored');
  ```

  Use `interactionRadius = 2.2` in the flow so the threshold is shared with the scene entity.

- [ ] **Step 2: Run and confirm failure**

  Run: `npm test -- src/rewards/RewardFlow.test.ts`

  Expected: FAIL because the flow module is absent.

- [ ] **Step 3: Implement the pure reward state machine**

  `RewardFlow` owns all one-time transition guards and exposes read-only `state`. It must not import DOM, `Game`, renderer, or GLTF modules.

- [ ] **Step 4: Write failing chest animation tests**

  Use a static box group and test that `RewardChest`:

  - marks its root with `userData.isRewardChestRoot`;
  - places the model base at local `y = 0` using its bounding box;
  - starts closed and ignores a second `beginOpening()`;
  - during opening, advances wobble/lift/scale and golden light intensity;
  - reports completion once and fades/disposes after `claim()`.

- [ ] **Step 5: Implement `RewardChest` without Blender animation assumptions**

  Give the entity a root group, model pivot, gold `PointLight`, elapsed timers, and:

  ```ts
  public readonly interactionRadius = 2.2;
  public beginOpening(): boolean;
  public claim(): void;
  public update(delta: number): void;
  public get openingComplete(): boolean;
  public get removable(): boolean;
  ```

  Use a short deterministic sequence: 0.25 s wobble, 0.45 s lift/scale pulse, then hold the open/reward glow. After claim, fade over 0.45 s and mark removable. Avoid per-frame material cloning.

- [ ] **Step 6: Verify and commit**

  Run: `npm test -- src/rewards/RewardFlow.test.ts src/entities/RewardChest.test.ts`

  Expected: PASS.

  Run: `npm test && npm run build`

  Expected: PASS.

  ```bash
  git add src/rewards src/entities/RewardChest.ts src/entities/RewardChest.test.ts
  git commit -m "feat: add one-time boss reward chest flow"
  ```

---

### Task 5: Add the Sword/Axe reward modal to the HUD

**Files:**

- Create: `src/ui/RewardSelection.ts`
- Create: `src/ui/RewardSelection.test.ts`
- Modify: `src/ui/HUD.ts`
- Modify: `index.html`
- Modify: `src/style.css`

- [ ] **Step 1: Write failing reward-selection parsing tests**

  Export `REWARD_OPTIONS` and `parseEquipmentId`. Assert that only `sword` and `axe` are accepted and that invalid/missing dataset values return `null`.

- [ ] **Step 2: Run and confirm failure**

  Run: `npm test -- src/ui/RewardSelection.test.ts`

  Expected: FAIL because the module is absent.

- [ ] **Step 3: Implement the typed UI definitions**

  Define exactly:

  ```ts
  export const REWARD_OPTIONS = [
    { id: 'sword', label: 'Espada', assetLabel: 'Sword' },
    { id: 'axe', label: 'Machado', assetLabel: 'Axe' },
  ] as const;
  ```

- [ ] **Step 4: Add accessible modal markup and HUD API**

  Add `#reward-selection` as a hidden `role="dialog"` with `aria-modal="true"`, heading `Escolha sua recompensa`, status/error text, two buttons carrying `data-equipment-id`, and a hidden `Continuar sem arma` button used only when both weapon assets failed.

  Extend `HUD` with:

  ```ts
  public onRewardSelect(callback: (id: EquipmentId) => void): void;
  public onContinueWithoutReward(callback: () => void): void;
  public showRewardSelection(availability: Readonly<Record<EquipmentId, boolean>>): void;
  public showRewardError(message: string): void;
  public hideRewardSelection(): void;
  ```

  Disable unavailable choices. Focus the first available option when opened and return focus safely when closed.

- [ ] **Step 5: Style the modal consistently with the current game**

  Use a black/warm-black panel (`#000`, `#0b0c0a`), `Consolas`/monospace text, amber `#ffb800` 1 px borders, uppercase compact labels, and no gradients, rounded cards, or decorative shadows. On narrow screens, stack the two reward buttons vertically and keep touch targets at least 44 px high.

- [ ] **Step 6: Verify and commit**

  Run: `npm test -- src/ui/RewardSelection.test.ts`

  Expected: PASS.

  Run: `npm test && npm run build`

  Expected: PASS.

  ```bash
  git add src/ui/RewardSelection.ts src/ui/RewardSelection.test.ts src/ui/HUD.ts index.html src/style.css
  git commit -m "feat: add weapon reward selection modal"
  ```

---

### Task 6: Integrate boss death, chest interaction, selection, and equipment

**Files:**

- Modify: `src/core/Game.ts`
- Create: `src/core/BossRewardIntegration.test.ts`
- Modify: `src/utils/Logger.ts` only if a new structured error helper is required

- [ ] **Step 1: Write a failing integration test around an extracted coordinator boundary**

  Exercise `RewardFlow` plus fake scene/player/HUD ports and assert this exact sequence:

  1. Boss death adds one chest at the supplied boss position.
  2. First distant click calls `player.moveTo(chest.position)`.
  3. Entering range calls `player.cancelMovement()` and begins opening.
  4. Opening completion locks player input and opens choices with correct availability.
  5. Selecting Sword clones/equips Sword, closes UI, unlocks input, and claims chest.
  6. Repeated boss-death, click, and selection signals have no effect.
  7. Missing `chest.glb` opens the reward modal directly after boss death.
  8. Failed weapon attachment leaves the modal open and displays a recoverable error.

  If direct `Game` construction would require WebGL, implement the coordinator as `src/rewards/BossRewardCoordinator.ts` with small injected ports and test that class; keep raycasting and frame timing in `Game`.

- [ ] **Step 2: Run and confirm failure**

  Run: `npm test -- src/core/BossRewardIntegration.test.ts`

  Expected: FAIL because integration/coordinator behavior is not wired.

- [ ] **Step 3: Preload reward assets during startup**

  Add `RewardAssetStore` to `Game`. Load it in parallel with the Paladin where possible, map combined progress into the existing loading bar, and log individual failures. Do not make a missing chest fatal if at least one weapon can still be offered.

- [ ] **Step 4: Spawn the chest exactly once after the boss dies**

  In `onBossDefeated`, copy the boss root position before removal, hide boss health, advance `RewardFlow`, and either add `RewardChest` to the scene or fall back directly to the selection UI when the chest failed to load.

- [ ] **Step 5: Give chest raycasts precedence over ground movement**

  In `handleMouseInput`, test the live chest root before enemies and ground. Walk to it when outside 2.2 units; open immediately when inside range. While approaching, the regular movement system continues running animation naturally.

- [ ] **Step 6: Advance the chest and reward flow in the main loop**

  After `player.update(delta)`, update the chest. When the approaching player enters range, cancel movement and begin opening. When opening completes, lock input and show the reward modal exactly once. After claim fade completes, remove the chest root and dispose only cloned chest materials/geometries owned by the entity.

- [ ] **Step 7: Equip the chosen reward with recoverable failure handling**

  On selection, clone the chosen weapon and call `player.equipWeapon`. On success, claim the flow, close modal, unlock input, and log `Recompensa equipada: Espada/Machado`. On load or socket failure, keep the modal open, disable only the failed choice, and show its error. If neither option remains, expose `Continuar sem arma`; using it closes the flow without equipment and never respawns the chest.

- [ ] **Step 8: Verify and commit**

  Run: `npm test -- src/core/BossRewardIntegration.test.ts`

  Expected: PASS.

  Run: `npm test && npm run build`

  Expected: all tests pass and production bundle builds without TypeScript errors.

  ```bash
  git add src/core/Game.ts src/core/BossRewardIntegration.test.ts src/rewards
  git commit -m "feat: grant weapon choice after boss defeat"
  ```

---

### Task 7: Calibrate the real GLBs and perform final regression verification

**Files:**

- Modify: `src/equipment/EquipmentCatalog.ts` only for measured Sword/Axe transforms
- Modify: `src/equipment/EquipmentCatalog.test.ts` if calibrated values are intentionally locked
- Modify: `src/style.css` only for defects observed in rendered UI

- [ ] **Step 1: Run the automated baseline**

  Run: `npm test && npm run build`

  Expected: PASS with no skipped reward/equipment tests.

- [ ] **Step 2: Start the local game and verify the complete progression**

  Run: `npm run dev -- --host 127.0.0.1`

  In the browser, confirm:

  - no character selector appears and Paladin loads directly;
  - enemies and boss are active;
  - no chest appears before boss death;
  - exactly one chest appears at the defeated boss position;
  - distant chest click walks the Paladin there; near click opens it;
  - the opening sequence does not require a GLB animation;
  - the modal offers only Espada and Machado;
  - each option can be equipped in a fresh run and the chest does not return.

- [ ] **Step 3: Calibrate weapon transforms against every Paladin animation**

  Test Sword and Axe in `idle`, `running`, `attacking`, `hit`, and `dead` using the existing animation buttons. Adjust only `desiredLength`, `gripFraction`, `rotation`, and `offset` in the corresponding catalog definition until the grip stays in the palm, blade/head faces outward, and the model does not visibly float or intersect the forearm.

- [ ] **Step 4: Verify visual and input edge cases**

  Confirm keyboard/click input is locked only while choosing, resize the viewport to mobile width, verify disabled reward choices, and ensure reload/respawn does not create a second chest in the same game session.

- [ ] **Step 5: Run final evidence commands**

  Run: `npm test`

  Expected: all tests PASS.

  Run: `npm run build`

  Expected: TypeScript and Vite build PASS.

- [ ] **Step 6: Commit calibrated values if Git is available**

  ```bash
  git add src/equipment/EquipmentCatalog.ts src/equipment/EquipmentCatalog.test.ts src/style.css
  git commit -m "fix: calibrate paladin weapon placement"
  ```

## Final Acceptance Checklist

- [ ] Only Paladin is playable and no selection screen is shown.
- [ ] Existing Paladin movement and all five animation mappings still pass regression tests.
- [ ] Enemies and boss are active.
- [ ] Chest spawns only after boss death, once per session.
- [ ] Distant click approaches; in-range interaction opens procedurally.
- [ ] Only Sword and Axe are offered.
- [ ] Selected weapon follows `mixamorigRightHand` through every animation.
- [ ] Equipment replacement removes the previous weapon cleanly.
- [ ] The future `chest` slot exists only in types and has no user-visible armor behavior.
- [ ] Asset/socket failures remain recoverable and are visible in HUD/logs.
- [ ] Full Vitest suite and production build pass after real-GLB calibration.
