# Warrior RPG Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver the approved first-run Warrior selection, 3D lobby, paused inventory and loot flow, five energy-based skills, synchronized colored VFX, and corrected Blender sword export.

**Architecture:** Add small state, profile, inventory, and skill controllers around the existing `Game` and retain `HUD` as the integration facade while extracting focused screens. Keep combat authority in `Player`, drive damage and VFX from normalized attack timing, and keep Blender-authored sword/hand corrections separate from runtime particle presentation.

**Tech Stack:** TypeScript, Three.js 0.161, Vite 5, Vitest 4, DOM/CSS, Blender 5.2 through MCP, GLB/glTF, browser localStorage.

**Spec:** `docs/superpowers/specs/2026-09-04-warrior-lobby-skills-vfx-inventory-design.md`

## Global Constraints

- The only selectable class is `Guerreiro` (`paladin` internally until a safe rename is warranted).
- Basic attack is free and approximately `1.45x`; each of the five skill animations must remain between `1.0x` and `1.2x`.
- Maximum energy is 50; regeneration is 6 points/second after a one-second skill-use delay.
- The backpack capacity is exactly 30 slots.
- Crafting materials are stored only; do not implement recipes, crafting, or upgrading.
- Each skill renders five star positions and starts at one star; do not add an upgrade flow.
- Inventory and loot overlays pause all simulation timers and block gameplay input.
- VFX remain runtime Three.js effects and are not baked into the GLB.
- Use only the required CC0 Kenney particle textures and preserve a source/license note.
- Do not delete unrelated legacy assets solely for cleanup.
- The workspace is not currently a Git repository, so the execution records verification checkpoints but cannot create the normally required per-task commits.

---

## File map

### New domain files

- `src/profile/PlayerProfile.ts`: versioned profile schema, validation, load, and save.
- `src/inventory/InventoryCatalog.ts`: item metadata and equipment-slot compatibility.
- `src/inventory/InventoryStore.ts`: 30-slot backpack, stacks, equip, and atomic transfer.
- `src/inventory/LootContainerState.ts`: persistent unclaimed contents for a world container.
- `src/core/GameFlowController.ts`: legal UI/gameplay transitions and pause ownership.
- `src/combat/WarriorSkillCatalog.ts`: costs, cooldowns, speeds, clip IDs, and display metadata.
- `src/combat/WarriorSkillController.ts`: energy, cooldown, regeneration, and activation checks.
- `src/combat/WarriorAttackTimeline.ts`: normalized damage, trail, impact, multi-hit, and recovery windows.
- `src/effects/WarriorVfxController.ts`: event-driven pooled trail, spark, smoke, and impact lifecycle.
- `src/ui/LobbyScreen.ts`: lobby DOM plus isolated Three.js preview.
- `src/ui/InventoryOverlay.ts`: equipment/backpack view and commands.
- `src/ui/LootOverlay.ts`: equipment/container/backpack composition and transfer actions.
- `src/world/WorldLootContainer.ts`: in-world interaction target and loot state.

### Existing files to modify

- `src/main.ts`: bootstrap the flow controller before combat.
- `src/core/Game.ts`: accept the saved profile, remove initial reward selection, add skill/loot/pause integration.
- `src/core/InputManager.ts`: expose state-safe one-shot skill, inventory, and interact commands.
- `src/entities/Player.ts`: direct attack selection, approved playback speed, timeline events, and exactly one sword.
- `src/characters/CharacterCatalog.ts`: replace the `4.5x` Warrior attack default.
- `src/effects/SwordTrail.ts`: accept texture-backed pooled particles and explicit fade completion.
- `src/effects/WarriorAttackVfxProfiles.ts`: approved color, density, and fade data.
- `src/equipment/EquipmentCatalog.ts`: expand RPG equipment slot types without changing current weapon stats.
- `src/ui/HUD.ts`: facade methods/events for skills, lobby, inventory, loot, messages, and normal-mode animation-panel hiding.
- `index.html`: semantic roots for lobby, inventory/loot dialogs, six combat actions, and accessible status text.
- `src/style.css`: approved medieval responsive presentation.

### Assets and documentation

- `public/vfx/warrior/`: selected optimized particle textures.
- `public/vfx/warrior/SOURCE.md`: Kenney Particle Pack URL and CC0 license statement.
- `public/models/Guerreiro/guerreiro_animado.glb`: validated Blender export.
- `C:\Users\pteix\Downloads\personagem HD\personagem_final.blend`: corrected authoring source.

---

### Task 1: Versioned Warrior profile

**Files:**
- Create: `src/profile/PlayerProfile.ts`
- Test: `src/profile/PlayerProfile.test.ts`

**Interfaces:**
- Produces: `createDefaultPlayerProfile(): PlayerProfile`
- Produces: `loadPlayerProfile(storage?: StoragePort): ProfileLoadResult`
- Produces: `savePlayerProfile(profile: PlayerProfile, storage?: StoragePort): boolean`
- Produces: `PlayerProfile`, `RpgEquipmentSlot`, and `InventoryStack` types consumed by inventory and flow tasks.

- [ ] **Step 1: Write failing profile tests**

```ts
import { describe, expect, it } from 'vitest';
import {
  createDefaultPlayerProfile,
  loadPlayerProfile,
  PROFILE_STORAGE_KEY,
} from './PlayerProfile';

const memoryStorage = (value: string | null = null) => ({
  getItem: () => value,
  setItem: () => undefined,
});

it('creates the first Warrior profile with one equipped sword', () => {
  const profile = createDefaultPlayerProfile();
  expect(profile.schemaVersion).toBe(1);
  expect(profile.selectedClass).toBe('paladin');
  expect(profile.equipment.weapon).toBe('starter-sword');
  expect(profile.backpack).toEqual([]);
  expect(Object.values(profile.skillStars)).toEqual([1, 1, 1, 1, 1]);
});

it('recovers from malformed persisted JSON', () => {
  const loaded = loadPlayerProfile(memoryStorage('{broken'));
  expect(loaded.kind).toBe('recovered');
  expect(loaded.profile.selectedClass).toBe('paladin');
});

it('uses the stable storage key', () => {
  expect(PROFILE_STORAGE_KEY).toBe('dragon-miner.profile.v1');
});
```

- [ ] **Step 2: Run the profile tests and verify failure**

Run: `npx vitest run src/profile/PlayerProfile.test.ts`

Expected: FAIL because `PlayerProfile.ts` does not exist.

- [ ] **Step 3: Implement the profile schema and safe storage**

```ts
export const PROFILE_STORAGE_KEY = 'dragon-miner.profile.v1';
export type RpgEquipmentSlot = 'helmet' | 'chest' | 'gloves' | 'pants' | 'boots' | 'weapon';
export interface InventoryStack { itemId: string; quantity: number }
export interface PlayerProfile {
  schemaVersion: 1;
  selectedClass: 'paladin';
  equipment: Record<RpgEquipmentSlot, string | null>;
  backpack: InventoryStack[];
  skillStars: Record<'ataque_giratorio' | 'ataque_giratorio_2' | 'pulo_atacando' | 'triplo_ataque' | 'corte_duplo', number>;
}
export interface StoragePort {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}
export type ProfileLoadResult = {
  kind: 'missing' | 'loaded' | 'recovered';
  profile: PlayerProfile;
};
```

Validate schema version, the fixed class ID, six equipment slots, positive integer stack quantities, unique stack entries, known skill keys, and star values from 1 through 5. Catch both reads and writes so disabled storage cannot abort startup.

- [ ] **Step 4: Run focused and full tests**

Run: `npx vitest run src/profile/PlayerProfile.test.ts`

Expected: PASS.

Run: `npx vitest run --maxWorkers=1`

Expected: all existing tests PASS.

- [ ] **Step 5: Record checkpoint**

Record: profile tests passing; no commit because `.git` is absent.

---

### Task 2: Inventory and loot domain

**Files:**
- Create: `src/inventory/InventoryCatalog.ts`
- Create: `src/inventory/InventoryStore.ts`
- Create: `src/inventory/LootContainerState.ts`
- Test: `src/inventory/InventoryStore.test.ts`
- Test: `src/inventory/LootContainerState.test.ts`
- Modify: `src/equipment/EquipmentCatalog.ts`

**Interfaces:**
- Consumes: `PlayerProfile`, `InventoryStack`, `RpgEquipmentSlot` from Task 1.
- Produces: `InventoryStore.snapshot(): InventorySnapshot`
- Produces: `InventoryStore.transferFrom(container, itemId, quantity): TransferResult`
- Produces: `InventoryStore.equip(backpackIndex, slot): EquipResult`
- Produces: `LootContainerState` with immutable snapshots and remainder-preserving removal.

- [ ] **Step 1: Write failing capacity, stacking, and equip tests**

```ts
it('merges materials before consuming a new one of 30 slots', () => {
  const store = InventoryStore.empty(30);
  expect(store.add({ itemId: 'runic-crystal', quantity: 4 }).accepted).toBe(4);
  expect(store.add({ itemId: 'runic-crystal', quantity: 3 }).accepted).toBe(3);
  expect(store.snapshot().backpack).toEqual([{ itemId: 'runic-crystal', quantity: 7 }]);
});

it('leaves the remainder in a container when the backpack is full', () => {
  const store = InventoryStore.fromStacks(30, thirtyDistinctItems());
  const container = new LootContainerState('urn-1', [{ itemId: 'runic-crystal', quantity: 3 }]);
  const result = store.transferFrom(container, 'runic-crystal', 3);
  expect(result).toEqual({ accepted: 0, remaining: 3, reason: 'backpack-full' });
  expect(container.snapshot().items[0].quantity).toBe(3);
});

it('moves only compatible items into equipment slots', () => {
  const store = InventoryStore.fromStacks(30, [{ itemId: 'starter-sword', quantity: 1 }]);
  expect(store.equip(0, 'helmet').kind).toBe('incompatible-slot');
  expect(store.equip(0, 'weapon').kind).toBe('equipped');
});
```

- [ ] **Step 2: Run focused tests and verify failure**

Run: `npx vitest run src/inventory/InventoryStore.test.ts src/inventory/LootContainerState.test.ts`

Expected: FAIL because the inventory modules do not exist.

- [ ] **Step 3: Implement the minimal item catalog**

Define real starter data, without recipes:

```ts
export const INVENTORY_ITEMS = {
  'starter-sword': { id: 'starter-sword', label: 'Espada do Recruta', kind: 'equipment', slot: 'weapon', maxStack: 1 },
  'runic-crystal': { id: 'runic-crystal', label: 'Cristal rúnico', kind: 'material', maxStack: 99 },
  'iron-shard': { id: 'iron-shard', label: 'Fragmento de ferro', kind: 'material', maxStack: 99 },
  'ancient-cloth': { id: 'ancient-cloth', label: 'Tecido antigo', kind: 'material', maxStack: 99 },
  'health-tonic': { id: 'health-tonic', label: 'Tônico de vida', kind: 'consumable', maxStack: 10 },
} as const;
```

Use data-only item records; do not invent wearable 3D armor assets.

- [ ] **Step 4: Implement atomic inventory and container commands**

Implement clone-on-read snapshots, stack-first insertion, exact capacity accounting, compatible equipment slots, and source removal only for the accepted quantity. Emit a change callback only after a successful mutation so profile persistence has a single hook.

- [ ] **Step 5: Run focused and full tests**

Run: `npx vitest run src/inventory/InventoryStore.test.ts src/inventory/LootContainerState.test.ts`

Expected: PASS.

Run: `npx vitest run --maxWorkers=1`

Expected: all tests PASS.

- [ ] **Step 6: Record checkpoint**

Record: inventory invariants and atomic loot transfer verified.

---

### Task 3: Game-flow and pause state machine

**Files:**
- Create: `src/core/GameFlowController.ts`
- Test: `src/core/GameFlowController.test.ts`
- Modify: `src/core/InputManager.ts`
- Test: `src/core/InputManager.test.ts`

**Interfaces:**
- Consumes: profile load result from Task 1.
- Produces: `GameFlowState` and `GameFlowController.transition(event): GameFlowState`.
- Produces: `GameFlowController.isSimulationPaused` and `acceptsGameplayInput`.
- Produces: one-shot keys `1`-`5`, `i`, `e`, and `escape` through existing `wasKeyPressed`.

- [ ] **Step 1: Write failing legal-transition tests**

```ts
it('routes a missing profile through class selection and lobby', () => {
  const flow = new GameFlowController('class-select');
  expect(flow.transition({ type: 'class-confirmed' })).toBe('lobby');
  expect(flow.transition({ type: 'start-game' })).toBe('loading-game');
  expect(flow.transition({ type: 'game-ready' })).toBe('playing');
});

it('pauses and restores gameplay around inventory', () => {
  const flow = new GameFlowController('playing');
  expect(flow.transition({ type: 'open-inventory' })).toBe('paused-inventory');
  expect(flow.isSimulationPaused).toBe(true);
  expect(flow.transition({ type: 'close-overlay' })).toBe('playing');
});

it('rejects attacks outside playing state', () => {
  const flow = new GameFlowController('lobby');
  expect(flow.acceptsGameplayInput).toBe(false);
});
```

- [ ] **Step 2: Run tests and verify failure**

Run: `npx vitest run src/core/GameFlowController.test.ts src/core/InputManager.test.ts`

Expected: FAIL on the missing state controller.

- [ ] **Step 3: Implement explicit transition events**

```ts
export type GameFlowState =
  | 'class-select' | 'lobby' | 'loading-game' | 'playing'
  | 'paused-inventory' | 'paused-loot' | 'dead' | 'victory';

export type GameFlowEvent =
  | { type: 'class-confirmed' } | { type: 'start-game' }
  | { type: 'game-ready' } | { type: 'open-inventory' }
  | { type: 'open-loot' } | { type: 'close-overlay' }
  | { type: 'player-died' } | { type: 'victory' };
```

Encode allowed transitions in a data table. Illegal transitions retain the current state and return a structured rejection for logging.

- [ ] **Step 4: Keep InputManager state-neutral**

Do not let `InputManager` decide whether a skill or overlay is legal. Continue recording one-shot key edges; `Game` consumes them only when `GameFlowController` permits the command. Add an `isEditableTarget` guard so key shortcuts do not fire while a DOM input, select, or textarea has focus.

- [ ] **Step 5: Run focused and full tests**

Run: `npx vitest run src/core/GameFlowController.test.ts src/core/InputManager.test.ts`

Expected: PASS.

Run: `npx vitest run --maxWorkers=1`

Expected: PASS.

---

### Task 4: Five-skill energy and cooldown controller

**Files:**
- Create: `src/combat/WarriorSkillCatalog.ts`
- Create: `src/combat/WarriorSkillController.ts`
- Test: `src/combat/WarriorSkillController.test.ts`

**Interfaces:**
- Consumes: `WarriorAttackId` from `CharacterCatalog`.
- Produces: `WARRIOR_SKILLS`, `WarriorSkillId`, `SkillSnapshot`, and `SkillActivationResult`.
- Produces: `WarriorSkillController.tryActivate(id)` and `update(delta, paused)`.

- [ ] **Step 1: Write failing balance and timing tests**

```ts
it('defines five skills and never exceeds 1.2x playback', () => {
  expect(WARRIOR_SKILLS).toHaveLength(5);
  expect(WARRIOR_SKILLS.every((skill) => skill.playbackRate >= 1 && skill.playbackRate <= 1.2)).toBe(true);
});

it('spends energy, starts cooldown, and regenerates after one second', () => {
  const skills = new WarriorSkillController();
  expect(skills.tryActivate('ataque_giratorio')).toEqual({ kind: 'activated', attackId: 'ataque_giratorio' });
  expect(skills.snapshot().energy).toBe(42);
  skills.update(0.9, false);
  expect(skills.snapshot().energy).toBe(42);
  skills.update(1.1, false);
  expect(skills.snapshot().energy).toBeCloseTo(48);
});

it('freezes regeneration and cooldowns while paused', () => {
  const skills = new WarriorSkillController();
  skills.tryActivate('corte_duplo');
  const before = skills.snapshot();
  skills.update(10, true);
  expect(skills.snapshot()).toEqual(before);
});
```

- [ ] **Step 2: Run the focused tests and verify failure**

Run: `npx vitest run src/combat/WarriorSkillController.test.ts`

Expected: FAIL because the modules do not exist.

- [ ] **Step 3: Implement the approved catalog exactly**

```ts
export const WARRIOR_SKILLS = [
  { id: 'ataque_giratorio', input: '1', energyCost: 8, cooldown: 2.5, playbackRate: 1.1 },
  { id: 'ataque_giratorio_2', input: '2', energyCost: 10, cooldown: 3.5, playbackRate: 1.1 },
  { id: 'pulo_atacando', input: '3', energyCost: 14, cooldown: 5, playbackRate: 1.0 },
  { id: 'triplo_ataque', input: '4', energyCost: 18, cooldown: 7, playbackRate: 1.1 },
  { id: 'corte_duplo', input: '5', energyCost: 16, cooldown: 6, playbackRate: 1.2 },
] as const;
```

Define labels and icon IDs in the same entries. Track cooldowns by skill ID, clamp energy to `[0, 50]`, reset the one-second regeneration delay on activation, and return rejection kinds `cooldown`, `insufficient-energy`, `busy`, `paused`, or `dead` without spending energy.

- [ ] **Step 4: Run focused and full tests**

Run: `npx vitest run src/combat/WarriorSkillController.test.ts`

Expected: PASS.

Run: `npx vitest run --maxWorkers=1`

Expected: PASS.

---

### Task 5: Attack timelines and Player direct animation control

**Files:**
- Create: `src/combat/WarriorAttackTimeline.ts`
- Test: `src/combat/WarriorAttackTimeline.test.ts`
- Modify: `src/entities/Player.ts`
- Modify: `src/characters/CharacterCatalog.ts`
- Test: `src/entities/Player.test.ts`

**Interfaces:**
- Consumes: the five skill definitions from Task 4.
- Produces: `getWarriorAttackTimeline(id): WarriorAttackTimeline`.
- Produces from Player: `tryStartAttack(id, callbacks): boolean`, `isAttacking`, and attack phase events.

- [ ] **Step 1: Write failing timeline tests**

```ts
it.each(WARRIOR_ATTACK_IDS)('%s has ordered normalized windows', (id) => {
  const timeline = getWarriorAttackTimeline(id);
  expect(timeline.damageStart).toBeLessThan(timeline.damageEnd);
  expect(timeline.trailStart).toBeLessThan(timeline.trailEnd);
  expect(timeline.recoveryEnd).toBeLessThanOrEqual(1);
  expect(timeline.fadeSeconds).toBeGreaterThanOrEqual(0.4);
  expect(timeline.fadeSeconds).toBeLessThanOrEqual(0.8);
});

it('marks triple and double cuts as explicit multi-hit attacks', () => {
  expect(getWarriorAttackTimeline('triplo_ataque').hitTimes).toHaveLength(3);
  expect(getWarriorAttackTimeline('corte_duplo').hitTimes).toHaveLength(2);
});
```

- [ ] **Step 2: Run tests and verify failure**

Run: `npx vitest run src/combat/WarriorAttackTimeline.test.ts src/entities/Player.test.ts`

Expected: FAIL because timelines and direct attack API do not exist.

- [ ] **Step 3: Replace the global Warrior `4.5x` setting**

Set the CharacterCatalog Warrior default attack scale to `1.45` for the basic preview only. Do not reuse that value for skill actions.

- [ ] **Step 4: Refactor Player attack selection**

Create one `AnimationAction` per `WarriorAttackId`, set loop once, and choose effective time scale from either `1.45` for `ataque_basico` or the Task 4 catalog for skills. Replace the current six-animation click sequence with direct selection:

```ts
public tryStartAttack(
  id: WarriorAttackId,
  callbacks: {
    onDamageWindow: (attackId: WarriorAttackId, hitIndex: number) => void;
    onVfxEvent: (event: WarriorAttackVisualEvent) => void;
    onComplete: (attackId: WarriorAttackId) => void;
  }
): boolean;
```

Drive normalized time from `action.time / action.getClip().duration`, emit each hit index exactly once, and keep a target set per hit index so unintended duplicate overlaps cannot damage the same target twice.

- [ ] **Step 5: Preserve ordinary movement and reactions**

Starting an attack cancels movement. Hit/death reactions cancel the active attack and close its trail. Completion blends to running when movement is active, otherwise idle. `Player.update` must freeze all attack state when the outer game loop is paused.

- [ ] **Step 6: Run focused and full tests**

Run: `npx vitest run src/combat/WarriorAttackTimeline.test.ts src/entities/Player.test.ts`

Expected: PASS.

Run: `npx vitest run --maxWorkers=1`

Expected: PASS.

---

### Task 6: Licensed particle assets and VFX controller

**Files:**
- Create: `public/vfx/warrior/SOURCE.md`
- Create: selected image files under `public/vfx/warrior/`
- Create: `src/effects/WarriorVfxController.ts`
- Test: `src/effects/WarriorVfxController.test.ts`
- Modify: `src/effects/SwordTrail.ts`
- Modify: `src/effects/WarriorAttackVfxProfiles.ts`
- Test: `src/effects/SwordTrail.test.ts`
- Test: `src/effects/WarriorAttackVfxProfiles.test.ts`

**Interfaces:**
- Consumes: `WarriorAttackVisualEvent` from Task 5.
- Produces: `WarriorVfxController.handle(event)`, `update(delta)`, `clear()`, and `dispose()`.

- [ ] **Step 1: Download and audit the official CC0 source**

Download from `https://kenney.nl/assets/particle-pack`, verify the package identifies the license as CC0, and select only soft circle, spark, smoke, and flare textures needed by the six approved profiles. Record source URL, pack name, and license in `SOURCE.md`.

- [ ] **Step 2: Optimize selected textures**

Resize only when visual inspection shows the source exceeds runtime needs. Preserve alpha, use sRGB for visible color maps, and keep alpha masks non-color. Confirm all selected assets load from Vite paths such as `/vfx/warrior/spark.png`.

- [ ] **Step 3: Write failing lifecycle and profile tests**

```ts
it('keeps a skill effect alive through its approved fade', () => {
  const controller = createTestVfxController();
  controller.handle({ type: 'attack-start', attackId: 'ataque_giratorio' });
  controller.handle({ type: 'trail-end', attackId: 'ataque_giratorio' });
  controller.update(0.39);
  expect(controller.activeEffectCount).toBeGreaterThan(0);
});

it('clears without leaking pooled scene children', () => {
  const controller = createTestVfxController();
  controller.handle({ type: 'attack-start', attackId: 'triplo_ataque' });
  controller.clear();
  expect(controller.activeEffectCount).toBe(0);
});
```

- [ ] **Step 4: Run tests and verify failure**

Run: `npx vitest run src/effects/WarriorVfxController.test.ts src/effects/SwordTrail.test.ts src/effects/WarriorAttackVfxProfiles.test.ts`

Expected: FAIL on the missing controller and new fade fields.

- [ ] **Step 5: Implement pooled texture-backed VFX**

Use stable player-local blade samples for the ribbon. Pool sprites/points for sparks, embers, smoke, and flashes; use additive blending for luminous particles and normal alpha blending for smoke. Add procedural canvas-texture fallbacks so a failed optional file does not suppress the effect. Dispose owned geometry, materials, and textures only once.

- [ ] **Step 6: Apply the approved profiles**

Maintain the approved mappings: blue-cyan basic, green first spin, magenta-violet second spin, gold jump impact, fire/smoke triple attack, and violet/orange double cut. Extend profiles with `fadeSeconds`, `trailWidth`, and impact parameters while preserving existing testable color values.

- [ ] **Step 7: Run focused and full tests**

Run: `npx vitest run src/effects/WarriorVfxController.test.ts src/effects/SwordTrail.test.ts src/effects/WarriorAttackVfxProfiles.test.ts`

Expected: PASS.

Run: `npx vitest run --maxWorkers=1`

Expected: PASS.

---

### Task 7: First-run class selection and 3D lobby

**Files:**
- Create: `src/ui/LobbyScreen.ts`
- Test: `src/ui/LobbyScreen.test.ts`
- Modify: `src/ui/CharacterSelectScreen.ts`
- Modify: `src/ui/CharacterSelectionState.ts`
- Modify: `src/main.ts`
- Modify: `index.html`
- Modify: `src/style.css`

**Interfaces:**
- Consumes: profile APIs from Task 1 and `CharacterAssetStore`.
- Produces: `LobbyScreen.show(profile): Promise<'start-game'>` and `dispose()`.
- Produces: first-run bootstrap result `{ profile, startRequested }`.

- [ ] **Step 1: Write failing DOM-flow tests**

```ts
it('shows class selection only when the profile is missing', async () => {
  const result = await bootstrapPlayerFlow({ profileResult: missingProfile(), screens });
  expect(screens.classSelect.show).toHaveBeenCalledOnce();
  expect(screens.lobby.show).toHaveBeenCalledOnce();
  expect(result.profile.selectedClass).toBe('paladin');
});

it('opens the lobby directly for a valid returning profile', async () => {
  await bootstrapPlayerFlow({ profileResult: loadedProfile(), screens });
  expect(screens.classSelect.show).not.toHaveBeenCalled();
  expect(screens.lobby.show).toHaveBeenCalledOnce();
});
```

- [ ] **Step 2: Run tests and verify failure**

Run: `npx vitest run src/ui/LobbyScreen.test.ts src/ui/CharacterSelectionState.test.ts`

Expected: FAIL on missing lobby/bootstrap behavior.

- [ ] **Step 3: Build semantic lobby and class DOM**

Add screen roots with actual labels: Guerreiro, Capacete, Peitoral, Luvas, Calça, Botas, Espada do Recruta, Inventário `0/30`, five approved skill names, and `Iniciar partida`. Do not show fabricated currencies or unavailable classes. Use buttons for tabs and actions, status regions for load failures, and visible focus states.

- [ ] **Step 4: Implement the isolated preview renderer**

Clone the Warrior model and skeleton through the existing asset store, play idle, center from its bounding box, support drag rotation and wheel zoom, cap pixel ratio at 2, and dispose animation mixer actions, listeners, renderer-owned resources, and cloned materials when the game starts.

- [ ] **Step 5: Implement responsive approved styling**

Use the approved dark medieval palette, gold focus/action color, high-contrast readable panels, character-centered desktop composition, and stacked tabs/panels at narrow widths. Respect `prefers-reduced-motion` for ambient motion.

- [ ] **Step 6: Run focused and full tests**

Run: `npx vitest run src/ui/LobbyScreen.test.ts src/ui/CharacterSelectionState.test.ts`

Expected: PASS.

Run: `npm run typecheck && npx vitest run --maxWorkers=1`

Expected: PASS.

---

### Task 8: Gameplay skill HUD

**Files:**
- Modify: `index.html`
- Modify: `src/style.css`
- Modify: `src/ui/HUD.ts`
- Test: `src/ui/HUD.test.ts`

**Interfaces:**
- Consumes: `SkillSnapshot` and `WARRIOR_SKILLS` from Task 4.
- Produces: `HUD.onSkillActivate(callback)`, `renderSkills(snapshot)`, and `showGameplayMessage(text, kind)`.

- [ ] **Step 1: Write failing HUD tests**

```ts
it('renders ATK plus five ordered skill buttons', () => {
  const hud = mountHudFixture();
  expect(hud.skillButtons().map((button) => button.dataset.attackId)).toEqual([
    'ataque_giratorio', 'ataque_giratorio_2', 'pulo_atacando', 'triplo_ataque', 'corte_duplo',
  ]);
});

it('renders cooldown, energy failure, and five stars accessibly', () => {
  const hud = mountHudFixture();
  hud.renderSkills(skillSnapshotWithCooldown('pulo_atacando', 2.4));
  const button = hud.button('pulo_atacando');
  expect(button.disabled).toBe(true);
  expect(button.getAttribute('aria-label')).toContain('2,4');
  expect(button.querySelectorAll('[data-star]')).toHaveLength(5);
});
```

- [ ] **Step 2: Run the HUD test and verify failure**

Run: `npx vitest run src/ui/HUD.test.ts`

Expected: FAIL because the current DOM has four placeholder skills and no APIs.

- [ ] **Step 3: Replace placeholders with authored inline SVG icons**

Create unique silhouettes for circular slash, arcane spin, jump impact, triple flame, and double cut. Use inline SVG so icons remain crisp, local, and themeable. Keep ATK as the separate primary action.

- [ ] **Step 4: Add dynamic state rendering**

Render energy cost, key, cooldown seconds, radial/masked cooldown progress, disabled reason, and five-star row. Ensure click events use `data-attack-id` and keyboard shortcuts invoke the same callback path.

- [ ] **Step 5: Hide development UI in normal mode**

Only reveal `animation-test-panel` when an explicit development flag is true. Preserve the panel for tests/debugging but remove it from the normal player experience.

- [ ] **Step 6: Run focused and full tests**

Run: `npx vitest run src/ui/HUD.test.ts`

Expected: PASS.

Run: `npm run typecheck && npx vitest run --maxWorkers=1`

Expected: PASS.

---

### Task 9: Inventory and loot overlays in the running scene

**Files:**
- Create: `src/ui/InventoryOverlay.ts`
- Create: `src/ui/LootOverlay.ts`
- Create: `src/world/WorldLootContainer.ts`
- Test: `src/ui/InventoryOverlay.test.ts`
- Test: `src/ui/LootOverlay.test.ts`
- Test: `src/world/WorldLootContainer.test.ts`
- Modify: `index.html`
- Modify: `src/style.css`

**Interfaces:**
- Consumes: Task 2 inventory/container commands and Task 3 flow transitions.
- Produces: overlay callbacks `close`, `transfer`, `takeAll`, `equip`, and `unequip`.
- Produces: `WorldLootContainer.canInteract(playerPosition)` and `lootState`.

- [ ] **Step 1: Write failing overlay and interaction tests**

```ts
it('renders equipment, container contents, and all 30 backpack positions', () => {
  const overlay = mountLootOverlay(fixtureSnapshots());
  expect(overlay.querySelectorAll('[data-equipment-slot]')).toHaveLength(6);
  expect(overlay.querySelectorAll('[data-backpack-slot]')).toHaveLength(30);
  expect(overlay.querySelector('[data-container-items]')).not.toBeNull();
});

it('announces a full backpack and leaves the item in the container', () => {
  const result = controller.take('runic-crystal', 1);
  expect(result.reason).toBe('backpack-full');
  expect(status.textContent).toContain('Mochila cheia');
});
```

- [ ] **Step 2: Run focused tests and verify failure**

Run: `npx vitest run src/ui/InventoryOverlay.test.ts src/ui/LootOverlay.test.ts src/world/WorldLootContainer.test.ts`

Expected: FAIL because the modules do not exist.

- [ ] **Step 3: Implement accessible overlays**

Use native buttons for items and commands, modal semantics, Escape close, focus trapping, focus restoration, visible item labels/quantities, and live status messages. Keep equipment, container, and backpack sections independently scrollable at short viewport heights.

- [ ] **Step 4: Implement world containers**

Create a small bounded set of loot containers using the already loaded chest visual when available and a procedural fallback otherwise. Each owns stable ID and unclaimed contents. Interaction range is explicit and containers do not replace the removed initial weapon-choice chest.

- [ ] **Step 5: Match the approved in-world presentation**

Keep the canvas visible under a controlled dark overlay. Desktop uses equipment left, loot center, backpack right; narrow screens stack or tab the regions without reducing the backpack below 30 logical slots.

- [ ] **Step 6: Run focused and full tests**

Run: `npx vitest run src/ui/InventoryOverlay.test.ts src/ui/LootOverlay.test.ts src/world/WorldLootContainer.test.ts`

Expected: PASS.

Run: `npm run typecheck && npx vitest run --maxWorkers=1`

Expected: PASS.

---

### Task 10: Blender sword, two-hand correction, and GLB validation

**Files:**
- Modify through Blender MCP: `C:\Users\pteix\Downloads\personagem HD\personagem_final.blend`
- Replace after validation: `public/models/Guerreiro/guerreiro_animado.glb`
- Create: `scripts/validate-warrior-glb.mjs`
- Test: `src/characters/CharacterAnimations.test.ts`

**Interfaces:**
- Produces: one embedded sword object and eleven required named animation clips loadable by `CharacterAssetStore`.

- [ ] **Step 1: Inspect without mutation**

Through Blender MCP, return structured summaries of scene collections, mesh/armature objects, sword candidates, object parenting, armature modifiers, bone names containing `Hand`/`hand`, actions with frame ranges and f-curve counts, NLA strips, and actual duplicate animation signatures.

- [ ] **Step 2: Capture a viewport baseline**

Render representative frames from idle and all six offensive actions to temporary PNG files and inspect sword grip, penetration, and left-hand proximity before editing.

- [ ] **Step 3: Create one recoverable backup**

Preserve the current source and exported GLB using unambiguous `.pre-sword-fix` names. Verify resolved absolute paths before copying. Do not create multiple numbered final exports.

- [ ] **Step 4: Correct right-hand attachment**

Use the inspected right-hand bone/socket, place the grip inside the palm, key no sword-object world motion, and verify the sword follows the hand across every action. If the sword is embedded, ensure runtime attachment code will not add a second visible weapon.

- [ ] **Step 5: Correct two-hand attack poses**

For each offensive action, sample hand distance and visual contact. Only where the authored pose brings both hands together, create a temporary grip target/IK or copy-transform constraint, correct elbow/wrist orientation, bake the affected pose bones to the action range, and remove the temporary constraint before export.

- [ ] **Step 6: Remove only proven duplicate actions**

Compare frame range, f-curve data paths, keyframe coordinates, and modifiers. Delete an action only when the animation signature is identical and it is not the unique source for a required exported name.

- [ ] **Step 7: Export to a temporary GLB and validate**

Export selected character, armature, sword, and animation actions to `public/models/Guerreiro/guerreiro_animado.validation.glb`. Run `scripts/validate-warrior-glb.mjs` to assert:

```js
const required = [
  'caminhando', 'correndo', 'ataque_basico', 'ataque_giratorio',
  'ataque_giratorio_2', 'pulo_atacando', 'triplo_ataque',
  'corte_duplo', 'recebe_dano', 'morte', 'caiu',
];
```

The validator must fail on missing/duplicate required clip names, no armature/skinning, no sword, or external URI dependencies.

- [ ] **Step 8: Inspect validation renders**

Load the temporary GLB in the game pipeline, capture representative frames, confirm one sword and correct grip, then replace `guerreiro_animado.glb` atomically. Remove the temporary validation GLB after successful replacement.

- [ ] **Step 9: Run animation mapping tests**

Run: `npx vitest run src/characters/CharacterAnimations.test.ts`

Expected: PASS with all six offensive mappings and required state clips.

---

### Task 11: Integrate the approved flow in Game

**Files:**
- Modify: `src/core/Game.ts`
- Modify: `src/main.ts`
- Modify: `src/entities/Player.ts`
- Modify: `src/ui/HUD.ts`
- Modify: `src/rewards/InitialEquipmentCoordinator.ts` only if needed to detach it cleanly from startup
- Test: `src/core/Game.test.ts`
- Test: `src/core/GameFlowIntegration.test.ts`

**Interfaces:**
- Consumes: all controllers and screens from Tasks 1-10.
- Produces: the complete user-visible flow.

- [ ] **Step 1: Write failing integration tests**

```ts
it('starts a run with exactly one sword and no initial reward chest', async () => {
  const harness = await startGameHarness(defaultProfile());
  expect(harness.player.equippedWeaponId).toBe('sword');
  expect(harness.sceneObjectsNamed('RewardChest')).toHaveLength(0);
  expect(harness.visibleSwordCount()).toBe(1);
});

it('routes keys 1-5 to the matching skill IDs', () => {
  const harness = playingHarness();
  for (const [key, id] of [['1','ataque_giratorio'],['2','ataque_giratorio_2'],['3','pulo_atacando'],['4','triplo_ataque'],['5','corte_duplo']] as const) {
    harness.press(key);
    expect(harness.lastAttackId).toBe(id);
    harness.finishAttackAndCooldown();
  }
});

it('freezes simulation and clears clock delta around an inventory pause', () => {
  const harness = playingHarness();
  harness.press('i');
  harness.frame(10);
  expect(harness.enemyUpdateCount).toBe(0);
  harness.press('i');
  harness.frame(1 / 60);
  expect(harness.lastSimulationDelta).toBeLessThanOrEqual(0.1);
});
```

- [ ] **Step 2: Run integration tests and verify failure**

Run: `npx vitest run src/core/Game.test.ts src/core/GameFlowIntegration.test.ts`

Expected: FAIL on the old initial-equipment flow and missing skills/overlays.

- [ ] **Step 3: Remove initial weapon choice from startup**

Stop loading reward-choice UI solely for startup, do not instantiate or reset `InitialEquipmentCoordinator`, do not spawn its chest, and do not wait for `weaponEquipped()` before starting progression. Initialize the profile sword once and reconcile embedded/runtime weapon visibility so exactly one sword is rendered.

- [ ] **Step 4: Integrate skills into the frame loop**

When state is `playing`, consume skill keys and HUD clicks through one `activateSkill(id)` function. Ask `WarriorSkillController`, call `Player.tryStartAttack`, roll back energy/cooldown if the Player rejects due to an animation race, and route attack timeline events to damage and VFX. Update HUD from one skill snapshot per frame.

- [ ] **Step 5: Integrate pause and loot**

Process overlay close/open inputs outside simulation. When paused, render the scene and UI but skip player, enemy, wave, boss, cooldown, VFX-time, and progression updates. On resume call `clock.getDelta()` once before the next simulation update.

- [ ] **Step 6: Persist inventory mutations**

Convert `InventoryStore.snapshot()` to profile data after successful transfer/equip commands and call `savePlayerProfile`. Surface one non-blocking warning when persistence fails.

- [ ] **Step 7: Preserve existing systems**

Run wave, boss, camera, movement, death, victory, admin, and reward regression tests. Adapt only the startup reward gating that directly conflicts with the approved sword-first flow.

- [ ] **Step 8: Run integration and full tests**

Run: `npx vitest run src/core/Game.test.ts src/core/GameFlowIntegration.test.ts`

Expected: PASS.

Run: `npx vitest run --maxWorkers=1`

Expected: PASS.

---

### Task 12: Visual, performance, and release verification

**Files:**
- Modify as findings require: only files already listed in Tasks 1-11
- Update: `README.md` with controls and asset source note if a controls section exists

**Interfaces:**
- Consumes: the integrated build.
- Produces: verified production artifacts and a concise evidence report.

- [ ] **Step 1: Run static and automated verification**

Run: `npm run typecheck`

Expected: exit 0.

Run: `npx vitest run --maxWorkers=1`

Expected: all tests PASS.

Run: `npm run build`

Expected: exit 0 and Vite production output generated.

- [ ] **Step 2: Validate final GLB and asset paths**

Run: `node scripts/validate-warrior-glb.mjs public/models/Guerreiro/guerreiro_animado.glb`

Expected: all eleven required animations, one sword, skinning, and embedded/no-missing resources PASS. Record final GLB byte size.

- [ ] **Step 3: Exercise the complete browser flow**

Using a fresh localStorage profile: class select -> lobby -> 3D rotate/zoom -> start -> basic attack -> skills 1-5 -> inventory pause -> resume -> loot container -> partial/full transfer -> reload -> persisted lobby. Repeat with an existing profile to verify class selection is skipped.

- [ ] **Step 4: Capture VFX evidence**

Capture one screenshot at the active trail/impact frame for each of the six attacks. Confirm palette, sword following, particle visibility, fade length, and no second sword.

- [ ] **Step 5: Check responsive and accessible interaction**

Verify desktop and narrow layouts, keyboard-only navigation, visible focus, Escape close, focus return, readable labels, and `prefers-reduced-motion` behavior.

- [ ] **Step 6: Check runtime performance and lifecycle**

Exercise repeated lobby/game transitions and at least 50 consecutive attacks. Confirm stable scene child counts after VFX fades, no continuous memory growth, no duplicate event listeners, and acceptable desktop frame pacing. Reduce particle density through the profile cap if necessary without changing approved colors or animation timing.

- [ ] **Step 7: Run final verification after any visual fixes**

Run: `npm run typecheck && npx vitest run --maxWorkers=1 && npm run build`

Expected: exit 0 for all commands.

- [ ] **Step 8: Record final checkpoint**

Report modified files, Blender/GLB output, tests passed, build result, final model size, licensed asset source, browser validation results, and any explicitly deferred limitations.
