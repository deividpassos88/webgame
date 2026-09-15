# Progressão por XP, Status no Cenário e Mochila de 20 Espaços Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** substituir a distribuição inicial de 100 pontos por XP de campanha, mostrar Status e Mochila por ícones no cenário, e limitar a mochila a 20 espaços sem perder itens de saves existentes.

**Architecture:** uma camada pura de progressão converte eliminações confirmadas em XP e pontos de atributo. `PlayerProfile` passa para schema v4 e preserva equipamento, skills e materiais durante a migração; `Game` apenas entrega a recompensa depois que a morte é confirmada pelo registro de combate. A interface reutiliza o diálogo existente em três modos mutuamente exclusivos — equipamento, mochila e status — sempre abrindo pela ação explícita do HUD.

**Tech Stack:** TypeScript, Three.js, Vitest + happy-dom, Vite, CSS nativo e `localStorage`.

**Spec:** `docs/superpowers/specs/2026-09-07-progression-status-backpack-design.md`

## Global Constraints

- Desktop WebGL é a única plataforma suportada; viewport estreito não pode criar rolagem horizontal nem fingir suporte mobile.
- O jogador inicia no nível 1, com 0/100 XP, 0 atributos e 0 pontos disponíveis.
- Cada 100 XP concede exatamente 1 nível e 5 pontos; o capítulo para em 2.000 XP, nível 21 e 100 pontos concedidos.
- Cada monstro normal concede 10 XP; cada mini-boss concede 75 XP; XP após o limite do capítulo não altera nível ou pontos.
- Cinco ondas de 25 normais e dois mini-bosses por onda são a única base de cálculo: 125 normais + 10 mini-bosses = 2.000 XP.
- Cada atributo pode chegar a 30; acima de 30 exige outro atributo diferente em valor maior ou igual a 30.
- A mochila possui exatamente 20 espaços. Nunca descartar pilhas durante migração: excedentes vão ao Cofre da Guilda.
- Pontos aplicados não têm remoção gratuita. Reset continua visível apenas como integração futura indisponível.
- Usar `public/assets/ui/backpack-icon.png` e `public/assets/ui/status-icon.png`, copiados dos PNGs fornecidos pelo usuário; não substituir por emoji.
- Não há repositório Git neste diretório. Não executar `git add`, `git commit`, `git reset` ou comandos equivalentes; registrar resultado de teste ao fim de cada tarefa.

---

## File structure

| File | Responsibility |
| --- | --- |
| `src/profile/CharacterProgression.ts` | Constants and pure XP/level calculations independent of Three.js. |
| `src/profile/CharacterProgression.test.ts` | Exact XP totals, level-up count, cap, and no-farming cases. |
| `src/profile/CharacterAttributes.ts` | Attribute cap/gate calculation used by persistence and UI. |
| `src/profile/PlayerProfile.ts` | Schema-v4 profile, allocation persistence, and v1–v3 migrations. |
| `src/profile/*.test.ts` | Profile and attribute boundary coverage. |
| `src/inventory/InventoryCapacity.ts` | Shared 20-slot constant with no dependency on profile or store. |
| `src/inventory/InventoryStore.ts` | Fixed 20-slot store default and safe profile hydration. |
| `src/ui/PlayerPortraitFraming.ts` | Pure bounds-to-face-camera framing helper. |
| `src/core/Game.ts` | Award XP only after death confirmation; persist/apply stats; open named overlay mode; render portrait with face framing. |
| `src/ui/HUD.ts` | HUD icon callbacks and XP display; removes permanent backpack preview. |
| `src/ui/InventoryOverlay.ts` | Equipment, Backpack, and Status modal modes. |
| `src/ui/LobbyScreen.ts` | Removes lobby Status panel and keeps a 20-cell inventory summary. |
| `index.html` / `src/style.css` | Named controls, modal panels, icon assets, desktop-first layout, focus and reduced-motion rules. |

### Task 1: Create the pure campaign XP engine

**Files:**
- Create: `src/profile/CharacterProgression.ts`
- Create: `src/profile/CharacterProgression.test.ts`

**Interfaces:**
- Consumes: encounter role literal `'regular' | 'mini-boss' | 'boss'`.
- Produces: `CharacterProgression`, `ExperienceAward`, `normalizeProgression(progression)`, `experienceForEncounter(role)`, `awardExperience(progression, role)`.
- Constants: `XP_PER_LEVEL = 100`, `ATTRIBUTE_POINTS_PER_LEVEL = 5`, `CHAPTER_MAX_EXPERIENCE = 2000`, `CHAPTER_MAX_LEVEL = 21`.

- [ ] **Step 1: Write failing progression tests**

```ts
import { describe, expect, it } from 'vitest';
import {
  awardExperience,
  createInitialProgression,
  experienceForEncounter,
} from './CharacterProgression';

it('maps normal and mini-boss kills to the approved XP values', () => {
  expect(experienceForEncounter('regular')).toBe(10);
  expect(experienceForEncounter('mini-boss')).toBe(75);
  expect(experienceForEncounter('boss')).toBe(0);
});

it('reaches level 21 and 100 points from the mandatory pre-boss route', () => {
  let result = { progression: createInitialProgression(), pointsGranted: 0 };
  for (let index = 0; index < 125; index++) {
    const award = awardExperience(result.progression, 'regular');
    result = { progression: award.progression, pointsGranted: result.pointsGranted + award.pointsGranted };
  }
  for (let index = 0; index < 10; index++) {
    const award = awardExperience(result.progression, 'mini-boss');
    result = { progression: award.progression, pointsGranted: result.pointsGranted + award.pointsGranted };
  }
  expect(result).toEqual({ progression: { level: 21, experience: 2000 }, pointsGranted: 100 });
});

it('caps repeat final-battle awards without more points', () => {
  const capped = { level: 21, experience: 2000 };
  expect(awardExperience(capped, 'regular')).toEqual({
    progression: capped,
    experienceGranted: 0,
    levelsGained: 0,
    pointsGranted: 0,
  });
});
```

- [ ] **Step 2: Run the focused test to verify it fails**

Run: `npm test -- src/profile/CharacterProgression.test.ts`

Expected: FAIL because `CharacterProgression.ts` and its exports do not exist.

- [ ] **Step 3: Implement the minimal pure engine**

```ts
export type ExperienceEncounterRole = 'regular' | 'mini-boss' | 'boss';
export interface CharacterProgression { readonly level: number; readonly experience: number; }
export interface ExperienceAward {
  readonly progression: CharacterProgression;
  readonly experienceGranted: number;
  readonly levelsGained: number;
  readonly pointsGranted: number;
}

export const XP_PER_LEVEL = 100;
export const ATTRIBUTE_POINTS_PER_LEVEL = 5;
export const CHAPTER_MAX_EXPERIENCE = 2000;
export const CHAPTER_MAX_LEVEL = 21;

export function createInitialProgression(): CharacterProgression {
  return { level: 1, experience: 0 };
}

export function normalizeProgression(value: unknown): CharacterProgression {
  const source = typeof value === 'object' && value !== null ? value as { experience?: unknown } : {};
  const rawExperience = typeof source.experience === 'number' && Number.isFinite(source.experience)
    ? source.experience
    : 0;
  const experience = Math.min(CHAPTER_MAX_EXPERIENCE, Math.max(0, Math.floor(rawExperience)));
  return { level: Math.min(CHAPTER_MAX_LEVEL, 1 + Math.floor(experience / XP_PER_LEVEL)), experience };
}

export function experienceForEncounter(role: ExperienceEncounterRole): number {
  return role === 'regular' ? 10 : role === 'mini-boss' ? 75 : 0;
}

export function awardExperience(
  progression: CharacterProgression,
  role: ExperienceEncounterRole,
): ExperienceAward {
  const current = normalizeProgression(progression);
  const experienceGranted = Math.min(
    experienceForEncounter(role),
    CHAPTER_MAX_EXPERIENCE - current.experience,
  );
  const nextExperience = current.experience + experienceGranted;
  const nextLevel = Math.min(CHAPTER_MAX_LEVEL, 1 + Math.floor(nextExperience / XP_PER_LEVEL));
  const levelsGained = Math.max(0, nextLevel - current.level);
  return {
    progression: { level: nextLevel, experience: nextExperience },
    experienceGranted,
    levelsGained,
    pointsGranted: levelsGained * ATTRIBUTE_POINTS_PER_LEVEL,
  };
}
```

Implement `normalizeProgression` so malformed stored values clamp to level 1–21 and XP 0–2,000; ensure level derives from XP rather than trusting a conflicting stored level.

- [ ] **Step 4: Run focused and type tests**

Run: `npm test -- src/profile/CharacterProgression.test.ts && npm run typecheck`

Expected: PASS; the exact pre-boss route produces 2,000 XP, 20 level-ups, and 100 points.

- [ ] **Step 5: Record the test result**

Record the focused test and typecheck result in the execution handoff. Do not commit because this directory has no Git repository.

### Task 2: Replace one-time profile allocation with schema-v4 progression and the 30-point gate

**Files:**
- Modify: `src/profile/CharacterAttributes.ts`
- Modify: `src/profile/CharacterAttributes.test.ts`
- Modify: `src/profile/PlayerProfile.ts`
- Modify: `src/profile/PlayerProfile.test.ts`

**Interfaces:**
- Consumes: `CharacterProgression`, `ExperienceEncounterRole`, and its pure award result from Task 1.
- Produces: schema-v4 `PlayerProfile` with `progression`, `attributePointsRemaining`, `allocateAttributePoint(profile, key, amount)`, `awardPlayerExperience(profile, role)`, and `attributeAllocationAllowance(attributes, key, requested, pointsAvailable)`.
- Removes: active use of `attributesConfirmed`, `confirmAttributeAllocation`, `removeAttributePoint`, and `resetAttributeAllocation` from every final UI path. The stored false flag and legacy exports remain parser-compatible during the v4 migration, but no shipped control may invoke them.

- [ ] **Step 1: Write failing attribute-gate tests**

```ts
it('stops a five-point allocation at 30 until a second attribute reaches 30', () => {
  const attributes = { ...createDefaultCharacterAttributes(), attack: 28 };
  expect(attributeAllocationAllowance(attributes, 'attack', 5, 5)).toBe(2);
  expect(attributeAllocationAllowance(
    { ...attributes, attack: 30 }, 'attack', 1, 5
  )).toBe(0);
  expect(attributeAllocationAllowance(
    { ...attributes, attack: 30, defense: 30 }, 'attack', 5, 5
  )).toBe(5);
});
```

- [ ] **Step 2: Write failing schema-v4 migration tests**

```ts
it('migrates a v3 profile without carrying the former free allocation', () => {
  const legacy = {
    schemaVersion: 3,
    selectedClass: 'paladin',
    equipment: createDefaultPlayerProfile().equipment,
    backpack: [],
    guildVault: [],
    skillStars: createDefaultPlayerProfile().skillStars,
    attributes: { ...createDefaultCharacterAttributes(), attack: 40 },
    attributePointsRemaining: 60,
    attributesConfirmed: false,
  };
  const result = loadPlayerProfile(memoryStorage(JSON.stringify(legacy)));
  expect(result.profile).toMatchObject({
    schemaVersion: 4,
    attributes: createDefaultCharacterAttributes(),
    attributePointsRemaining: 0,
    progression: { level: 1, experience: 0 },
  });
  expect(result.profile.equipment.primaryWeapon).toBe('starter-sword');
});

it('adds five spendable points only when XP crosses a level boundary', () => {
  const profile = createDefaultPlayerProfile();
  const afterTenKills = Array.from({ length: 10 }).reduce(
    (current) => awardPlayerExperience(current, 'regular'), profile
  );
  expect(afterTenKills.progression).toEqual({ level: 2, experience: 100 });
  expect(afterTenKills.attributePointsRemaining).toBe(5);
});
```

- [ ] **Step 3: Run the profile and attribute tests to verify failure**

Run: `npm test -- src/profile/CharacterAttributes.test.ts src/profile/PlayerProfile.test.ts`

Expected: FAIL because schema v4, `awardPlayerExperience`, and the gate function are absent.

- [ ] **Step 4: Implement gate and persistence rules**

In `CharacterAttributes.ts`, add:

```ts
export const ATTRIBUTE_SOLO_CAP = 30;

export function attributeAllocationAllowance(
  attributes: CharacterAttributes,
  attribute: CharacterAttributeKey,
  requested: number,
  pointsAvailable: number,
): number {
  const current = normalizeCharacterAttributes(attributes);
  const request = Math.max(0, Math.floor(requested));
  const budget = Math.max(0, Math.floor(pointsAvailable));
  const otherAttributeIsAtCap = ATTRIBUTE_KEYS.some(
    (key) => key !== attribute && current[key] >= ATTRIBUTE_SOLO_CAP,
  );
  const cap = otherAttributeIsAtCap ? TOTAL_ATTRIBUTE_POINTS : ATTRIBUTE_SOLO_CAP;
  return Math.min(request, budget, Math.max(0, cap - current[attribute]));
}
```

In `PlayerProfile.ts`:

1. Set `PROFILE_SCHEMA_VERSION` to `4` and retain explicit v1, v2, and v3 readers.
2. Add `progression: CharacterProgression` to `PlayerProfile`.
3. Set new default attributes and points to zero.
4. Make `allocateAttributePoint` call `attributeAllocationAllowance`; subtract only the returned allowance from `attributePointsRemaining`.
5. Add `awardPlayerExperience` that calls Task 1, adds `pointsGranted`, and never lets `totalCharacterAttributePoints(attributes) + attributePointsRemaining` exceed 100.
6. Make all legacy migrations retain equipment, skill stars, backpack, and Guild Vault while resetting attributes, unspent points, and progression to the initial values.
7. Validate stored `progression` via `normalizeProgression` and validate profile points with `0 <= totalAllocated + remaining <= 100`.
8. Keep the legacy `attributesConfirmed` field fixed to `false` and preserve old helper exports temporarily for source compatibility; Task 5 removes their UI consumers and Task 6 deletes the lobby consumer. Do not call those helpers from the new Status mode.

The final behavior is enforced by the new UI routes: there is no confirm, minus, or clear control in Status, regardless of the compatibility exports retained for save/parser stability.

- [ ] **Step 5: Run focused tests and typecheck**

Run: `npm test -- src/profile/CharacterAttributes.test.ts src/profile/PlayerProfile.test.ts src/profile/CharacterProgression.test.ts && npm run typecheck`

Expected: PASS; no profile can spend more than earned, cross the 30 gate alone, or retain a free legacy allocation.

- [ ] **Step 6: Record the test result**

Record the three focused test files and typecheck result. Do not commit because this directory has no Git repository.

### Task 3: Enforce the 20-slot backpack without item loss

**Files:**
- Create: `src/inventory/InventoryCapacity.ts`
- Modify: `src/inventory/InventoryStore.ts`
- Modify: `src/inventory/InventoryStore.test.ts`
- Modify: `src/profile/PlayerProfile.ts`
- Modify: `src/profile/PlayerProfile.test.ts`
- Modify: `src/ui/RpgUiViewModel.ts`

**Interfaces:**
- Consumes: schema-v4 profile migration from Task 2.
- Produces: `BACKPACK_CAPACITY = 20` from `InventoryCapacity.ts`, `InventoryStore.empty()` / `fromProfile()` with exactly 20 slots, and profile migration that transfers unique stack overflow to `guildVault`.

- [ ] **Step 1: Write failing inventory capacity and migration tests**

```ts
it('uses exactly 20 backpack positions by default', () => {
  expect(InventoryStore.empty().snapshot().capacity).toBe(20);
});

it('moves v3 stacks beyond the twentieth slot into the Guild Vault', () => {
  const v3 = {
    schemaVersion: 3,
    selectedClass: 'paladin',
    equipment: createDefaultPlayerProfile().equipment,
    backpack: Object.keys(INVENTORY_ITEMS).slice(0, 21).map((itemId) => ({ itemId, quantity: 1 })),
    guildVault: [],
    skillStars: createDefaultPlayerProfile().skillStars,
    attributes: createDefaultCharacterAttributes(),
    attributePointsRemaining: 100,
    attributesConfirmed: false,
  };
  const migrated = loadPlayerProfile(memoryStorage(JSON.stringify(v3))).profile;
  expect(migrated.backpack).toHaveLength(20);
  expect(migrated.guildVault).toContainEqual({ itemId: 'guild-token', quantity: 1 });
});
```

- [ ] **Step 2: Run focused tests to verify failure**

Run: `npm test -- src/inventory/InventoryStore.test.ts src/profile/PlayerProfile.test.ts`

Expected: FAIL because the default store still has 30 slots and migration does not relocate overflow.

- [ ] **Step 3: Implement the capacity and safe overflow transfer**

Create `src/inventory/InventoryCapacity.ts` with `export const BACKPACK_CAPACITY = 20;`. Import that constant into `InventoryStore.ts` and `PlayerProfile.ts` rather than importing either module into the other. Make `empty` and `fromProfile` default to it. During profile migration, split normalized backpack stacks at index 20. Merge each overflow stack into a matching Guild Vault stack, preserving item order and quantities; never silently drop an item. The Guild Vault is an overflow ledger, so its validator must accept every known catalog item with a positive integer quantity, including equipment and consumables, even when the quantity exceeds the backpack stack maximum. Tighten `isBackpack` validation from 30 to `BACKPACK_CAPACITY`.

Keep `buildRpgUiViewModel` capacity-driven so it creates exactly `inventory.capacity` slots in both lobby and modal surfaces.

- [ ] **Step 4: Run focused tests and typecheck**

Run: `npm test -- src/inventory/InventoryStore.test.ts src/profile/PlayerProfile.test.ts && npm run typecheck`

Expected: PASS; every default, hydrated, migrated, and rendered backpack has 20 cells, with overflow recoverable in the Guild Vault.

- [ ] **Step 5: Record the test result**

Record focused test and typecheck results. Do not commit because this directory has no Git repository.

### Task 4: Award XP only after a confirmed death and frame the portrait around the face

**Files:**
- Create: `src/ui/PlayerPortraitFraming.ts`
- Create: `src/ui/PlayerPortraitFraming.test.ts`
- Modify: `src/core/Game.ts`
- Modify: `src/waves/CombatEntityRegistry.test.ts` only if a regression fixture is needed to prove the death-report contract

**Interfaces:**
- Consumes: `awardPlayerExperience(profile, role)` from Task 2 and `CombatEntityRegistry.reportDeath()` returning `{ id, phaseId, role } | null`.
- Produces: `resolvePortraitFaceFrame(bounds)` and one `Game` reward path that logs/renders XP only once per registered death.

- [ ] **Step 1: Write failing face-frame tests**

```ts
import { describe, expect, it } from 'vitest';
import { resolvePortraitFaceFrame } from './PlayerPortraitFraming';

it('aims at the upper head region instead of the torso center', () => {
  const frame = resolvePortraitFaceFrame({ minY: 0, maxY: 2, depth: 0.8 });
  expect(frame.targetY).toBeCloseTo(1.66);
  expect(frame.distance).toBeGreaterThan(0.8);
  expect(frame.distance).toBeLessThan(2.4);
});
```

- [ ] **Step 2: Run the focused test to verify failure**

Run: `npm test -- src/ui/PlayerPortraitFraming.test.ts`

Expected: FAIL because the helper does not exist.

- [ ] **Step 3: Implement portrait framing and XP integration**

Implement:

```ts
export interface PortraitBounds { readonly minY: number; readonly maxY: number; readonly depth: number; }
export interface PortraitFaceFrame { readonly targetY: number; readonly distance: number; }

export function resolvePortraitFaceFrame(bounds: PortraitBounds): PortraitFaceFrame {
  const height = Math.max(0.01, bounds.maxY - bounds.minY);
  return {
    targetY: bounds.minY + height * 0.83,
    distance: Math.min(2.4, Math.max(0.9, Math.max(height * 0.9, bounds.depth * 2.2))),
  };
}
```

In `Game.handleEnemyDeath`, call `combatRegistry.reportDeath(target)` before any kill reward or XP mutation. When it returns a death record, call `runProgression.enemyDefeated(death.id, death.phaseId)`; only when that returns `true`, apply both the existing kill reward and `awardPlayerExperience(this.profile, death.role)`. Persist progression through a new profile-oriented `persistProfileState` that does not try to deliver Guild Vault stacks, apply live character stats, and call `hud.updateProgression(this.profile.progression, this.profile.attributePointsRemaining)`. Do not award XP or a kill reward when `reportDeath` returns `null` or the wave manager rejects the death.

Replace the fixed `1.58`/`1.48` portrait coordinates by computing `THREE.Box3` from the visible player model, passing its vertical bounds/depth to `resolvePortraitFaceFrame`, and aiming the temporary portrait camera at the returned target Y. Keep `preserveDrawingBuffer`, background restore, fog restore, and renderer disposal behavior intact.

- [ ] **Step 4: Run focused tests and typecheck**

Run: `npm test -- src/ui/PlayerPortraitFraming.test.ts src/waves/CombatEntityRegistry.test.ts && npm run typecheck`

Expected: PASS; portrait math targets the upper model and duplicate death reporting cannot yield a second XP award.

- [ ] **Step 5: Record the test result**

Record focused test and typecheck results. Do not commit because this directory has no Git repository.

### Task 5: Replace the side backpack with named HUD actions and modal modes

**Files:**
- Modify: `index.html`
- Modify: `src/ui/HUD.ts`
- Modify: `src/ui/InventoryOverlay.ts`
- Modify: `src/ui/InventoryOverlay.test.ts`
- Modify: `src/ui/CharacterHudContract.test.ts`
- Modify: `src/core/Game.ts`

**Interfaces:**
- Consumes: profile progression, 20-slot `InventoryStore`, HUD callbacks, and `GameFlowController`'s existing `open-inventory` / `close-overlay` pause transition.
- Produces: `RpgOverlayMode = 'equipment' | 'backpack' | 'status'`, `InventoryOverlay.show(mode)`, `HUD.onOpenEquipment`, `HUD.onOpenBackpack`, `HUD.onOpenStatus`, and `HUD.updateProgression`.

- [ ] **Step 1: Write failing HUD contract tests**

```ts
it('exposes portrait, backpack, and status actions without a permanent backpack panel', () => {
  expect(html).toContain('id="player-portrait"');
  expect(html).toContain('data-open-equipment');
  expect(html).toContain('data-open-backpack');
  expect(html).toContain('data-open-status');
  expect(html).not.toContain('id="hud-backpack-panel"');
  expect(html).not.toContain('id="hud-backpack"');
});
```

Add happy-dom tests that open each mode and assert:

```ts
overlay.show('status');
expect(root.dataset.overlayMode).toBe('status');
expect(root.querySelector('[data-character-panel="status"]')?.classList.contains('hidden')).toBe(false);
expect(root.querySelector('[data-character-panel="equipment"]')?.classList.contains('hidden')).toBe(true);
```

- [ ] **Step 2: Run focused UI tests to verify failure**

Run: `npm test -- src/ui/CharacterHudContract.test.ts src/ui/InventoryOverlay.test.ts`

Expected: FAIL because the HUD still exposes the side backpack and the overlay has only tab-driven modes.

- [ ] **Step 3: Change semantic markup and HUD API**

In `index.html`:

1. Change portrait data attribute to `data-open-equipment` and label it “Abrir equipamentos do Guerreiro”.
2. Add two adjacent icon buttons with `data-open-backpack` and `data-open-status`; each contains an `<img>` pointing at its supplied asset and has explicit Portuguese `aria-label` text.
3. Add a compact `#player-progression` display to the HUD showing `Nível`, `XP` and `Pontos`.
4. Delete the `hud-backpack-panel` markup.
5. Keep one `#character-overlay`, but split its content into three `data-character-panel` sections: equipment, backpack, and status. Remove tab navigation; the active mode comes from the trigger. Status contains level/XP/power allocation and derived stats. Backpack contains exactly the grid, capacity and Guild Vault. Equipment contains only equipment.
6. Remove free minus, clear, and confirm controls from the Status panel. Keep disabled future-reset labels only.

In `HUD.ts`, replace `onOpenCharacter` and `updateBackpack` with:

```ts
public onOpenEquipment(callback: () => void): void;
public onOpenBackpack(callback: () => void): void;
public onOpenStatus(callback: () => void): void;
public updateProgression(
  progression: CharacterProgression,
  points: number,
): void;
```

In `InventoryOverlay.ts`, expose:

```ts
export type RpgOverlayMode = 'equipment' | 'backpack' | 'status';
public show(mode: RpgOverlayMode): void;
```

Set `root.dataset.overlayMode`, hide all inactive panels, set the title/description for the active mode, capture focus from the trigger, and restore it on close. Retain craft material inspection and its nested Escape/focus behavior only in Backpack mode.

In `Game.ts`, route each callback through `openRpgOverlay(mode)`. It must use the existing pause transition, cancel player movement, and pass the selected mode to the overlay. Split persistence callbacks into `onInventoryChanged` (serialize `InventoryStore`, deliver the Guild Vault, then save) and `onStatusChanged` (save profile and apply live stats only). Close behavior remains one path and resets input after resume.

- [ ] **Step 4: Implement the new Status rendering rules**

Render status controls with only increment buttons. Each row computes:

```ts
const allowance = attributeAllocationAllowance(
  this.profile.attributes,
  key,
  increment,
  this.profile.attributePointsRemaining,
);
const disabled = allowance === 0;
```

Use `allowance` rather than `increment` in the accessible label when +5 stops at 30, for example: “Adicionar 2 em Ataque; limite de foco atingido após esta ação”. On click, call `allocateAttributePoint`, persist, reapply `Game.applyCharacterBuild(false)`, re-render the active Status panel, and preserve focus. Show “Ganhe XP para receber novos pontos” at zero points; show “Outro atributo precisa chegar a 30” when the gate blocks an increase.

- [ ] **Step 5: Run focused UI tests and typecheck**

Run: `npm test -- src/ui/CharacterHudContract.test.ts src/ui/InventoryOverlay.test.ts && npm run typecheck`

Expected: PASS; each explicit action opens its own mode, the game pauses safely, Status has no free reallocation, and Backpack has no permanent side panel.

- [ ] **Step 6: Record the test result**

Record focused test and typecheck results. Do not commit because this directory has no Git repository.

### Task 6: Remove lobby allocation, install supplied icons, and apply the desktop visual system

**Files:**
- Delete: `src/ui/LobbyAttributesPanel.ts`
- Delete: `src/ui/LobbyAttributesPanel.test.ts`
- Modify: `src/ui/LobbyScreen.ts`
- Modify: `src/ui/LobbyScreen.test.ts`
- Modify: `index.html`
- Modify: `src/style.css`
- Modify: `src/style.test.ts`
- Create: `public/assets/ui/backpack-icon.png` copied from `C:\Users\pteix\AppData\Local\Temp\codex-clipboard-9ff54b0b-d0f3-4768-9327-054ce6526b95.png`
- Create: `public/assets/ui/status-icon.png` copied from `C:\Users\pteix\AppData\Local\Temp\codex-clipboard-dee7c9f0-6328-47ad-b689-9150399c3349.png`

**Interfaces:**
- Consumes: 20-cell view model and active HUD markup from Tasks 3 and 5.
- Produces: lobby without a Status tab/panel, supplied asset paths, `Cinzafogo` desktop modal/HUD styles, and active focus/reduced-motion rules.

- [ ] **Step 1: Write failing lobby and stylesheet contract tests**

```ts
it('keeps the lobby inventory at 20 slots and removes the lobby status builder', () => {
  expect(html).toContain('id="lobby-backpack"');
  expect(html).not.toContain('id="lobby-attributes-panel"');
  expect(html).not.toContain('data-lobby-tab="status"');
});

it('uses supplied utility assets and visible focus with reduced-motion restraint', () => {
  expect(styles).toContain('/assets/ui/backpack-icon.png');
  expect(styles).toContain('/assets/ui/status-icon.png');
  expect(styles).toContain('.hud-utility-button:focus-visible');
  expect(styles).toContain('@media (prefers-reduced-motion: reduce)');
});
```

- [ ] **Step 2: Run focused UI tests to verify failure**

Run: `npm test -- src/ui/LobbyScreen.test.ts src/style.test.ts src/ui/CharacterHudContract.test.ts`

Expected: FAIL because the lobby still imports/renders `LobbyAttributesPanel`, has a Status tab, and the supplied assets are absent.

- [ ] **Step 3: Apply lobby and visual changes**

1. Copy the exact user-provided PNGs to the two named `public/assets/ui/` destinations; verify each destination exists and has a nonzero size.
2. Remove `LobbyAttributesPanel` construction, rendering, and disposal from `LobbyScreen.ts`.
3. Remove the lobby Status nav button and panel from `index.html`; keep the lobby inventory summary and update the displayed capacity to `0 / 20` before it renders.
4. Introduce a `Cinzafogo` utility cluster style: obsidian/steel background, forged gold borders, pale-gold focus outline, source-image containment, and no emoji substitutions.
5. Style `#character-overlay[data-overlay-mode]` as a focused desktop panel with enough contrast against the paused dungeon; only one content mode displays at a time.
6. Make the Status level medallion the sole high-emphasis ornament; keep all other panels flatter so it remains the memorable element.
7. At narrow widths, constrain dialog max width/height and use internal vertical scrolling only; do not add a mobile layout promise or horizontal page overflow.
8. In the reduced-motion media query, disable modal transform animations, icon float/hover transforms, and any XP fill transition while retaining contrast and focus outlines.

- [ ] **Step 4: Run focused tests, full suite, and production build**

Run: `npm test -- src/ui/LobbyScreen.test.ts src/style.test.ts src/ui/CharacterHudContract.test.ts && npm test && npm run build`

Expected: PASS; no stale lobby build imports remain, the source assets are referenced correctly, all existing tests pass, and Vite emits a production build.

- [ ] **Step 5: Perform visual and accessibility verification**

Start a temporary Vite server, capture rendered screenshots at a representative desktop viewport and a narrow viewport, then stop the server before handoff. Verify all of the following in the real UI:

1. Lobby has no Status builder and renders `0 / 20` capacity.
2. Gameplay has portrait, Backpack icon, Status icon, XP readout, and no permanent side backpack.
3. Portrait visibly frames the warrior’s face rather than torso.
4. Backpack opens 20 cells and shows empty/full/Guild Vault states.
5. Status at zero points, first +5 after a level-up, 30-point cap, second-stat unlock, and inactive reset controls are visually clear.
6. Every interactive HUD/modal control is traversed with Tab/Shift+Tab/Enter/Space/Escape; focus never leaves an open dialog.
7. `prefers-reduced-motion: reduce` is actively emulated and produces no modal/icon animation while retaining usable layout.

Real rendered desktop and mobile screenshots reviewed before Sol acceptance.

Complete no-mouse traversal and active prefers-reduced-motion: reduce emulation completed before Sol acceptance.

- [ ] **Step 6: Record acceptance evidence**

Record screenshot paths, viewport sizes, keyboard traversal result, reduced-motion result, complete test result, and build result. Stop the temporary development service. Do not commit because this directory has no Git repository.

## Plan self-review

- **Spec coverage:** Task 1 covers exact XP math; Task 2 covers schema-v4, new starting state, points, and the anti-focus rule; Task 3 covers 20 slots and no loss; Task 4 covers duplicate-death protection and portrait framing; Task 5 covers explicit HUD/modal behavior; Task 6 covers lobby removal, source assets, desktop UI, focus, motion, visual capture, build, and service shutdown.
- **Placeholder scan:** no incomplete implementation directive remains; payment integration is explicitly disabled rather than deferred ambiguously.
- **Type consistency:** `CharacterProgression`, `ExperienceEncounterRole`, `RpgOverlayMode`, `awardPlayerExperience`, `attributeAllocationAllowance`, and `resolvePortraitFaceFrame` are introduced before their consumers.
