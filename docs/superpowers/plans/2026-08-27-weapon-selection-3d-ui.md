# Weapon Selection 3D UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace generic Sword/Axe reward cards with a modern, accessible dungeon-armory selector using the real rotating weapon GLBs and authoritative combat values.

**Architecture:** Build card data from `EquipmentCatalog`, keep HUD responsible for accessible dialog state, and isolate all Three.js preview lifecycle work in `RewardWeaponPreview`. Use one small WebGL renderer per visible weapon card, with injected renderer/scheduler ports for deterministic tests and graceful textual fallback.

**Tech Stack:** TypeScript, Three.js, semantic HTML, CSS, Vitest, Vite, in-app browser visual testing.

**Spec:** `docs/superpowers/specs/2026-08-27-monster-reward-combat-design.md`

## Global Constraints

- Use `/models/sword.glb` and `/models/axe.glb`; no generic weapon imagery.
- Remove emoji and star ratings.
- Every displayed number comes from `EquipmentCatalog`.
- Desktop uses two columns; narrow screens stack cards with no horizontal overflow.
- Selection works with mouse, Enter, and Space; visible focus is mandatory.
- `prefers-reduced-motion: reduce` stops rotation and nonessential transitions.
- Preview render loops stop when the dialog is hidden and renderers dispose on teardown.
- Preserve immediate final weapon selection and existing restart/error behavior.
- Workspace has no Git repository; replace commit steps with tested checkpoints and changed-file summaries.

## Design Contract

- Approval status: approved by the user after the original-color correction.
- Subject world: the initial armory inside the Dragon Miner dungeon.
- Audience: a player choosing the run's starting weapon.
- Single interface job: choose the starting weapon from its real GLB and combat attributes.
- Colors: Obsidian `#070A0D`, Steel `#151B22`, Brass `#C7923E`, Plasma `#69D7E8`, Bone `#E9EEF2`, Ember `#B94A3C`.
- Display typography: Georgia; body typography: Segoe UI; utility typography: Consolas.
- Structural thesis: two armory plates compare complete weapon loadouts.
- Signature: the actual weapon rotates over a forge-ring stage.
- Aesthetic risk: a narrow luminous energy seam divides the competing weapons.
- Icon source/system: actual GLBs and project-native inline SVG symbols; no emoji.
- Critique ledger: emoji icons rejected, star ratings rejected, stale hard-coded stats rejected, dark modal revised, real rotating GLBs accepted.
- Responsive behavior: two columns to one; modal scrolls internally on short screens.
- Interaction: loading, available, hover, focus, selected, unavailable, and preview-failed states.
- Motion: transitions and rotation stop under reduced motion.
- Roles: explicit Sol/Luna routing unavailable; current agent separates execution and review.

---

### Task 1: Build authoritative reward-card view models

**Files:**
- Modify: `src/ui/RewardSelection.ts`
- Modify: `src/ui/RewardSelection.test.ts`
- Verify: `src/equipment/EquipmentCatalog.test.ts`

**Interfaces:**
- Produces `RewardOptionViewModel` with exact strings for damage, range, cooldown, regular/mini-boss healing, and regular defense.
- Preserves `parseEquipmentId`.
- Changes `rewardOptionsForAvailability(availability)` to include `definition` and formatted fields.

- [ ] **Step 1: Write failing Sword/Axe view-model tests**

```ts
expect(rewardOptionsForAvailability({ sword: true, axe: true })).toEqual([
  expect.objectContaining({
    id: 'sword', name: 'Espada Longa', damage: '8', range: '2,2 m', cooldown: '1,0 s',
    regularHeal: '3%', miniBossHeal: '6%', defense: '3%', enabled: true,
  }),
  expect.objectContaining({
    id: 'axe', name: 'Machado de Guerra', damage: '10', range: '1,5 m', cooldown: '1,3 s',
    regularHeal: '3,1%', miniBossHeal: '6,2%', defense: '5%', enabled: true,
  }),
]);
```

- [ ] **Step 2: Run the view-model test and confirm stale data fails**

Run: `npm test -- src/ui/RewardSelection.test.ts`

Expected: FAIL because current options expose only identifiers and labels.

- [ ] **Step 3: Implement locale-stable UI formatting from catalog data**

```ts
function decimal(value: number, digits = 1): string {
  return value.toFixed(digits).replace('.', ',');
}

function percent(fraction: number): string {
  const value = fraction * 100;
  const digits = Number.isInteger(value) ? 0 : 1;
  return `${decimal(value, digits)}%`;
}
```

Map each `WeaponDefinition` to the exact fields asserted above. Do not duplicate combat literals in `RewardSelection.ts`.

- [ ] **Step 4: Run view-model and catalog tests**

Run: `npm test -- src/ui/RewardSelection.test.ts src/equipment/EquipmentCatalog.test.ts`

Expected: PASS.

- [ ] **Step 5: Checkpoint authoritative card data**

Record the public view-model shape and passing tests.

---

### Task 2: Render semantic weapon cards without generic icons

**Files:**
- Modify: `index.html`
- Modify: `src/ui/HUD.ts`
- Modify: `src/ui/RewardSelectionMarkup.test.ts`
- Modify: `src/ui/RewardSelection.test.ts`

**Interfaces:**
- `index.html` provides `#reward-options` as an empty card host and keeps dialog labels/status/restart controls.
- `HUD.renderRewardOptions()` creates two buttons with `data-equipment-id`, a preview canvas, textual stats, and inline SVG symbols.
- Existing `onRewardSelect`, `showRewardSelection`, and `hideRewardSelection` signatures remain stable.

- [ ] **Step 1: Write failing markup assertions**

```ts
expect(indexHtml).toContain('id="reward-options"');
expect(indexHtml).not.toContain('🗡️');
expect(indexHtml).not.toContain('🪓');
expect(indexHtml).not.toContain('★');
```

- [ ] **Step 2: Write a failing generated-card DOM test**

Create a minimal JSDOM-compatible HUD fixture and assert:

```ts
expect(optionsHost.querySelectorAll('[data-equipment-id]')).toHaveLength(2);
expect(optionsHost.querySelector('[data-equipment-id="sword"] canvas')).not.toBeNull();
expect(optionsHost.textContent).toContain('Roubo ao matar normal 3%');
expect(optionsHost.textContent).toContain('Defesa contra normal 5%');
```

- [ ] **Step 3: Run markup/UI tests and confirm failure**

Run: `npm test -- src/ui/RewardSelectionMarkup.test.ts src/ui/RewardSelection.test.ts`

Expected: FAIL because static emoji buttons still exist and the card host is absent.

- [ ] **Step 4: Replace static buttons with the host and render real data**

Card structure:

```html
<button class="reward-weapon-card" data-equipment-id="sword" type="button">
  <span class="reward-preview-stage">
    <canvas data-weapon-preview="sword" aria-hidden="true"></canvas>
    <span class="reward-preview-fallback" hidden>Prévia 3D indisponível</span>
  </span>
  <span class="reward-card-heading"><strong>Espada Longa</strong><small>Alcance tático</small></span>
  <span class="reward-primary-stats">…</span>
  <span class="reward-special-stats">…</span>
</button>
```

Use project-native inline SVG with `aria-hidden="true"`, `currentColor`, and no external icon dependency. Give each button an `aria-label` containing the weapon name and all exact combat values.

- [ ] **Step 5: Run markup and interaction tests**

Run: `npm test -- src/ui/RewardSelectionMarkup.test.ts src/ui/RewardSelection.test.ts src/rewards/InitialEquipmentCoordinator.test.ts`

Expected: PASS; event delegation still resolves only `sword` and `axe`.

- [ ] **Step 6: Checkpoint semantic cards**

Record DOM structure, accessible labels, and test results before adding WebGL.

---

### Task 3: Implement the real rotating GLB previews

**Files:**
- Create: `src/ui/RewardWeaponPreview.ts`
- Create: `src/ui/RewardWeaponPreview.test.ts`
- Modify: `src/ui/HUD.ts`
- Modify: `src/core/Game.ts`
- Verify: `src/equipment/RewardAssetStore.test.ts`

**Interfaces:**
- Produces `RewardPreviewPort`:

```ts
export interface RewardPreviewPort {
  show(availability: Readonly<Record<EquipmentId, boolean>>): void;
  hide(): void;
  dispose(): void;
}
```

- Produces `RewardWeaponPreview(assets, options?)`, where options inject renderer creation, frame scheduling, cancellation, and reduced-motion matching for tests.
- Adds `HUD.attachRewardPreview(preview: RewardPreviewPort): void`.

- [ ] **Step 1: Write failing lifecycle tests with renderer/scheduler fakes**

```ts
it('creates one normalized scene per available GLB and stops scheduling when hidden', () => {
  const fixture = previewFixture({ reducedMotion: false });
  fixture.preview.show({ sword: true, axe: true });
  expect(fixture.createdRenderers).toHaveLength(2);
  expect(fixture.pendingFrames()).toBe(1);
  fixture.runFrame(1 / 60);
  expect(fixture.weaponRotations()).toEqual([expect.any(Number), expect.any(Number)]);
  fixture.preview.hide();
  expect(fixture.pendingFrames()).toBe(0);
});

it('renders a still frame and schedules no rotation under reduced motion', () => {
  const fixture = previewFixture({ reducedMotion: true });
  fixture.preview.show({ sword: true, axe: true });
  expect(fixture.renderCounts()).toEqual([1, 1]);
  expect(fixture.pendingFrames()).toBe(0);
});

it('shows textual fallback when one renderer cannot initialize', () => {
  const fixture = previewFixture({ fail: 'axe' });
  fixture.preview.show({ sword: true, axe: true });
  expect(fixture.fallbackVisible('sword')).toBe(false);
  expect(fixture.fallbackVisible('axe')).toBe(true);
});
```

- [ ] **Step 2: Run preview tests and confirm failure**

Run: `npm test -- src/ui/RewardWeaponPreview.test.ts`

Expected: FAIL because the preview controller does not exist.

- [ ] **Step 3: Implement preview scene creation**

For each available weapon:

```ts
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(28, 1, 0.1, 20);
camera.position.set(0, 0.15, 4.4);
const pivot = new THREE.Group();
const model = assets.createWeapon(id);
normalizeToUnitBox(model, 2.25);
pivot.add(model);
scene.add(pivot);
scene.add(new THREE.HemisphereLight(0xdfefff, 0x171006, 2.1));
const key = new THREE.DirectionalLight(0xffd27a, 3.2);
key.position.set(2, 3, 4);
scene.add(key);
```

Use transparent antialiased renderers, cap pixel ratio at 2, update square renderer size from each canvas client rectangle, rotate around Y at `0.55` radians per second, and render only while visible. Dispose renderer, cloned geometries, and cloned materials in `dispose()`.

- [ ] **Step 4: Attach lifecycle to HUD and Game**

After reward assets load:

```ts
this.rewardPreview = new RewardWeaponPreview(this.rewardAssets);
this.hud.attachRewardPreview(this.rewardPreview);
```

`HUD.showRewardSelection` calls `preview.show(availability)`. `hideRewardSelection` calls `preview.hide()`. Full game teardown or replacement calls `dispose()`.

- [ ] **Step 5: Run preview, asset, HUD, and coordinator tests**

Run: `npm test -- src/ui/RewardWeaponPreview.test.ts src/equipment/RewardAssetStore.test.ts src/ui/RewardSelection.test.ts src/rewards/InitialEquipmentCoordinator.test.ts`

Expected: PASS with no scheduler left active after hiding.

- [ ] **Step 6: Checkpoint functional previews**

Record created WebGL contexts, fallback behavior, reduced-motion test, and passing test count.

---

### Task 4: Apply the approved armory visual system

**Files:**
- Modify: `src/style.css`
- Modify: `src/style.test.ts`
- Verify: `index.html`

**Interfaces:**
- CSS variables under `#reward-selection` implement the approved six-color palette.
- Existing global HUD remains untouched outside reward-selector selectors.

- [ ] **Step 1: Write failing CSS contract tests**

```ts
expect(css).toContain('--armory-obsidian: #070a0d');
expect(css).toContain('--armory-steel: #151b22');
expect(css).toContain('--armory-brass: #c7923e');
expect(css).toContain('--armory-plasma: #69d7e8');
expect(css).toContain('@media (max-width: 680px)');
expect(css).toContain('@media (prefers-reduced-motion: reduce)');
expect(css).toContain('.reward-weapon-card:focus-visible');
```

- [ ] **Step 2: Run the style test and confirm failure**

Run: `npm test -- src/style.test.ts`

Expected: FAIL because the approved armory tokens and selectors do not exist.

- [ ] **Step 3: Implement disciplined armory styling**

Required structure:

```css
#reward-selection {
  --armory-obsidian: #070a0d;
  --armory-steel: #151b22;
  --armory-brass: #c7923e;
  --armory-plasma: #69d7e8;
  --armory-bone: #e9eef2;
  --armory-ember: #b94a3c;
  background:
    radial-gradient(circle at 50% 44%, rgba(105, 215, 232, 0.08), transparent 34%),
    rgba(3, 5, 7, 0.9);
}

.reward-panel {
  width: min(1040px, 100%);
  max-height: min(860px, calc(100vh - 32px));
  overflow: auto;
}

.reward-options {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.reward-options::after {
  content: '';
  position: absolute;
  left: 50%;
  width: 1px;
  background: linear-gradient(transparent, var(--armory-plasma), transparent);
}
```

Keep card corners modest, use Brass for selection affordance and Plasma only for the central seam/secondary data, and avoid unrelated glow decorations. Make preview stage `aspect-ratio: 16 / 9`, maintain minimum 44px interactive target size, and use `font-variant-numeric: tabular-nums` for combat data.

- [ ] **Step 4: Add responsive, focus, unavailable, and reduced-motion rules**

At `680px`, stack cards, remove the vertical seam, constrain preview height, and allow panel scrolling. Use a 3px Bone/Plasma focus ring with offset. Under reduced motion, set transitions to none and transforms to none; preview rotation is separately stopped by Task 3.

- [ ] **Step 5: Run style and markup tests**

Run: `npm test -- src/style.test.ts src/ui/RewardSelectionMarkup.test.ts src/ui/RewardSelection.test.ts`

Expected: PASS.

- [ ] **Step 6: Checkpoint the styled selector**

Record CSS selectors changed and confirm unrelated HUD selectors have no diff.

---

### Task 5: Perform rendered accessibility and visual acceptance

**Files:**
- Modify only files implicated by observed failures from Tasks 1–4.
- Verify: all UI, equipment, reward, and style tests.

**Interfaces:**
- Uses the in-app browser against the local Vite server and the actual GLBs.
- Produces acceptance evidence, not a new production API.

- [ ] **Step 1: Start the temporary local server**

Run: `npm run dev -- --host 127.0.0.1`

Expected: Vite reports `http://127.0.0.1:5173/`.

- [ ] **Step 2: Review a rendered desktop capture**

Set a representative `1440 × 900` viewport, open the chest through normal gameplay, and capture the visible reward dialog. Verify both GLBs, original materials, accurate stats, energy seam, no overflow, and readable hierarchy.

- [ ] **Step 3: Review a rendered mobile capture**

Set a representative `390 × 844` viewport, reload and reopen the reward dialog, capture the stacked cards, and verify internal scrolling without horizontal overflow or clipped controls.

- [ ] **Step 4: Complete no-mouse traversal**

Reload, reach the dialog, press Tab through both weapon cards and the restart control when present, verify visible focus after every press, then select an available weapon with Enter. Repeat once with Space on the other card after a new run. Confirm no focus trap and that focus returns logically when the modal closes.

- [ ] **Step 5: Actively verify reduced motion**

Run the preview lifecycle test with the reduced-motion media matcher returning `true`, then use the available browser media-emulation capability if exposed. Verify weapon rotation is stopped and hover/focus transformations are removed. If browser media emulation is unavailable, record that limitation and do not issue final visual acceptance until an equivalent active browser or OS emulation is available.

- [ ] **Step 6: Fix only evidence-backed UI defects and repeat affected checks**

For each defect, write or update a failing automated test when behavior is testable, apply the smallest fix, rerun that test, and recapture only the affected viewport/state.

- [ ] **Step 7: Run full UI regression and production build**

Run: `npm test -- src/ui/RewardSelection.test.ts src/ui/RewardSelectionMarkup.test.ts src/ui/RewardWeaponPreview.test.ts src/equipment/EquipmentCatalog.test.ts src/equipment/RewardAssetStore.test.ts src/rewards/InitialEquipmentCoordinator.test.ts src/style.test.ts && npm run build`

Expected: all listed tests pass and build exits 0.

- [ ] **Step 8: Stop the temporary development server**

Send Ctrl+C to the exact Vite process session and verify the process exits.

- [ ] **Step 9: Checkpoint visual acceptance**

Record desktop/mobile screenshot review, keyboard traversal, reduced-motion evidence, test count, build result, and any remaining blocker.

## Acceptance Gates

- Real rendered desktop and mobile screenshots reviewed before Sol acceptance.
- Complete no-mouse traversal and active prefers-reduced-motion: reduce emulation completed before Sol acceptance.
- No generic emoji or star rating remains in the selector.
- Both real weapon GLBs render or expose a clear per-card fallback.
- Every displayed stat equals `EquipmentCatalog`.
- Full automated suite and production build pass before completion is claimed.
