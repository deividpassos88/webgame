# Dedicated Workshop, Admin Inventory and Equipment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a dedicated blacksmith screen, admin-only inventory injection, the expanded common-material catalog, click-to-equip starter sword behavior, and reliable expedition reset after boss victory.

**Architecture:** `BlacksmithWorkshop` remains the authoritative crafting domain service while a focused full-screen lobby view consumes it. `InventoryStore` remains the sole mutation boundary for backpack/equipment changes; catalog metadata supplies presentation, tooltip and base-damage information. Game flow owns post-victory reset and persists the reset profile before returning to the lobby.

**Tech Stack:** TypeScript, Three.js, Vite, Vitest, DOM/CSS UI, WebP assets.

**Spec:** `docs/superpowers/specs/2026-09-09-dedicated-workshop-admin-equipment-design.md`

## Global Constraints

- Desktop WebGL only; do not add mobile-specific controls or layouts.
- Use `public/items/craft/common/{6,7,8,9,10}.webp`, never their PNG duplicates.
- The workshop fee is exactly 30 `guild-token` and its access window is exactly 36 hours.
- New profiles start with `starter-sword` only in the backpack, with base damage 0 until equipped; equipping yields base damage 8.
- Existing profiles retain their current equipment and items.
- Only admin-enabled sessions can add arbitrary catalog items.
- On final boss return, reset level, XP, attributes and unspent points while preserving equipment, backpack, capacity and vault.

---

## File Structure

- `src/inventory/InventoryCatalog.ts` — item metadata, icon paths, descriptions and starter weapon damage.
- `src/inventory/InventoryStore.ts` — validated stack insertion and equip/unequip behavior.
- `src/profile/PlayerProfile.ts` — schema migration and new-profile starter-sword ownership.
- `src/ui/ItemTooltip.ts` — reusable game tooltip markup and positioning contract.
- `src/ui/BlacksmithScreen.ts` — dedicated workshop screen and conversation/crafting UI.
- `src/ui/LobbyScreen.ts` / `index.html` — screen routing, normal lobby cleanup and centered start action.
- `src/admin/AdminPanel.ts` and `src/admin/AdminGameActions.ts` — admin-only item injection command and UI.
- `src/core/Game.ts` — wiring, character build damage and victory-reset persistence boundary.
- `src/style.css` — workshop, tooltips, large equipment slots and desktop layout.

### Task 1: Catalog, starter sword, and profile migration

**Files:**
- Modify: `src/inventory/InventoryCatalog.ts`
- Modify: `src/profile/PlayerProfile.ts`
- Modify: `src/inventory/InventoryStore.ts`
- Modify: `src/inventory/InventoryCatalog.test.ts`
- Modify: `src/profile/PlayerProfile.test.ts`
- Modify: `src/inventory/InventoryStore.test.ts`

**Interfaces:**
- Produces `InventoryItemDefinition.description?: string` and `baseDamage?: number`.
- Produces `InventoryStore.add(itemId: string, quantity: number): InventoryMutationResult` that validates catalog, capacity and stack limits.

- [ ] **Step 1: Write failing catalog and profile tests.**

```ts
expect(getInventoryItem('volatile-draconic-essence')).toMatchObject({
  label: 'Essência Dracônica Instável',
  iconSrc: '/items/craft/common/6.webp',
  rarity: 'common',
});
const profile = createDefaultPlayerProfile();
expect(profile.equipment.primaryWeapon).toBeNull();
expect(profile.backpack).toEqual([{ itemId: 'starter-sword', quantity: 1 }]);
```

- [ ] **Step 2: Run the focused tests to verify failure.**

Run: `npm test -- InventoryCatalog PlayerProfile InventoryStore`

Expected: failures for the five absent material definitions and starter-sword ownership.

- [ ] **Step 3: Implement metadata and migration.**

```ts
'starter-sword': {
  id: 'starter-sword', label: 'Espada do Recruta', kind: 'equipment',
  maxStack: 1, slot: 'weapon', iconSrc: '/items/equipment/armas/sword.webp',
  description: 'Uma espada de treino confiável, entregue à recruta da guilda.',
  baseDamage: 8,
}
```

Add the five approved IDs/labels with their WebP paths and concise lore descriptions. Raise profile schema version, migrate the prior schema by preserving existing `equipment` and `backpack`, and change only `createDefaultPlayerProfile()` to put one sword in backpack with both weapon fields null. Implement `add()` as an atomic copy-and-commit operation; reject unknown items, non-positive/non-integer quantities and capacity overflow without changing the snapshot.

- [ ] **Step 4: Run focused tests.**

Run: `npm test -- InventoryCatalog PlayerProfile InventoryStore`

Expected: PASS, including migration preservation and 0→8 equip behavior.

- [ ] **Step 5: Commit the self-contained domain change.**

```powershell
git add src/inventory/InventoryCatalog.ts src/inventory/InventoryStore.ts src/profile/PlayerProfile.ts src/inventory/*.test.ts src/profile/*.test.ts
git commit -m "feat: add workshop material catalog and starter sword flow"
```

### Task 2: Reusable item tooltip and large equipment slots

**Files:**
- Create: `src/ui/ItemTooltip.ts`
- Create: `src/ui/ItemTooltip.test.ts`
- Modify: `src/ui/CraftRewardsPresentation.ts`
- Modify: `src/ui/LobbyScreen.ts`
- Modify: `src/ui/InventoryOverlay.ts`
- Modify: `src/style.css`

**Interfaces:**
- Consumes `InventoryItemDefinition` metadata from Task 1.
- Produces `bindItemTooltip(host: HTMLElement): () => void` and `renderItemTooltip(item, quantity): string`.

- [ ] **Step 1: Write failing tooltip rendering tests.**

```ts
const markup = renderItemTooltip(getInventoryItem('ossified-draco-ribs')!, 3);
expect(markup).toContain('Costelas de Draco Ossificadas');
expect(markup).toContain('item-tooltip__description');
```

- [ ] **Step 2: Run the focused test to verify failure.**

Run: `npm test -- ItemTooltip`

Expected: FAIL because the module is absent.

- [ ] **Step 3: Implement tooltip and slot presentation.**

Use one positioned tooltip element attached to the overlay root, populated on keyboard focus/pointer enter and removed on leave/blur. Render title, rarity label, image and description with a gold serif heading and dark glass/metal surface. Attach the same data attributes to lobby and scenario inventory slots. Redesign `.equipment-grid` slots as large framed cards: centered asset/slot icon, low-contrast engraved label in the lower plate, and no small duplicated label block.

- [ ] **Step 4: Run focused UI tests.**

Run: `npm test -- ItemTooltip InventoryOverlay LobbyScreen`

Expected: PASS.

- [ ] **Step 5: Commit.**

```powershell
git add src/ui/ItemTooltip.ts src/ui/ItemTooltip.test.ts src/ui/CraftRewardsPresentation.ts src/ui/LobbyScreen.ts src/ui/InventoryOverlay.ts src/style.css
git commit -m "feat: add crafted item tooltips and equipment slot treatment"
```

### Task 3: Dedicated full-screen workshop

**Files:**
- Create: `src/ui/BlacksmithScreen.ts`
- Create: `src/ui/BlacksmithScreen.test.ts`
- Modify: `index.html`
- Modify: `src/ui/LobbyScreen.ts`
- Modify: `src/crafting/BlacksmithWorkshop.ts`
- Modify: `src/style.css`

**Interfaces:**
- Consumes `BlacksmithWorkshop`, `InventoryStore`, `PlayerProfile`, `onPersist(profile)` and `onBack()` callbacks.
- Produces `BlacksmithScreen.show()` and `BlacksmithScreen.hide()`; `LobbyScreen` calls it when `data-lobby-tab="blacksmith"` is selected.

- [ ] **Step 1: Write failing workshop screen tests.**

```ts
screen.show();
expect(host.querySelector('[data-blacksmith-screen]')).not.toBeNull();
expect(host.querySelector('[data-workshop-recipes]')?.classList.contains('is-locked')).toBe(true);
```

- [ ] **Step 2: Run the focused test to verify failure.**

Run: `npm test -- BlacksmithScreen`

Expected: FAIL because the dedicated screen is absent.

- [ ] **Step 3: Implement the dedicated route.**

Replace the right-side workshop panel with one hidden `data-blacksmith-screen` root. The screen shows portrait/background art, equipment summary, back button and conversation choices. Only after `BlacksmithWorkshop.payLicense()` succeeds does it reveal recipes; existing active access reveals them immediately. Reuse the domain service for crafting and refresh profile/inventory only after successful persistence. Keep `Herói`, `Inventário` and `Skills` in the normal lobby.

- [ ] **Step 4: Center the normal lobby start action.**

Move `#start-game` into a dedicated bottom-center action container in `index.html`; style its desktop grid position to the center region and keep it unavailable while the workshop screen is open.

- [ ] **Step 5: Run workshop and lobby tests.**

Run: `npm test -- BlacksmithWorkshop BlacksmithScreen LobbyScreen`

Expected: PASS for fee gating, 36-hour access, crafting and screen navigation.

- [ ] **Step 6: Commit.**

```powershell
git add index.html src/ui/BlacksmithScreen.ts src/ui/BlacksmithScreen.test.ts src/ui/LobbyScreen.ts src/crafting/BlacksmithWorkshop.ts src/style.css
git commit -m "feat: move blacksmith to dedicated workshop screen"
```

### Task 4: Admin-only item injection

**Files:**
- Modify: `src/admin/AdminPanel.ts` (or the resolved current AdminPanel path)
- Modify: `src/admin/AdminGameActions.ts`
- Create: `src/admin/AdminInventoryActions.test.ts`
- Modify: `src/core/Game.ts`

**Interfaces:**
- Produces command `{ type: 'add-inventory-item'; itemId: string; quantity: number }`.
- Consumes `AdminCommandGate`, `InventoryStore.add()` and `persistProfileState(): boolean`.

- [ ] **Step 1: Write failing authorization and mutation tests.**

```ts
expect(actions.execute({ type: 'add-inventory-item', itemId: 'guild-token', quantity: 30 })).toEqual({ ok: false, reason: 'unauthorized' });
expect(adminActions.execute({ type: 'add-inventory-item', itemId: 'guild-token', quantity: 30 }).ok).toBe(true);
```

- [ ] **Step 2: Run the focused test to verify failure.**

Run: `npm test -- AdminInventoryActions`

Expected: FAIL because the command does not exist.

- [ ] **Step 3: Implement gated command and UI.**

Render the selector/quantity/button only from `AdminPanel.mount(..., true, ...)`. Populate options from `INVENTORY_ITEMS`, validate integer quantity before dispatch, use `InventoryStore.add()`, serialize its snapshot to profile and persist. Roll back to the prior snapshot if persistence fails. Return user-facing success/failure messages without exposing the control to non-admin sessions.

- [ ] **Step 4: Run focused admin tests.**

Run: `npm test -- AdminInventoryActions AdminPanel`

Expected: PASS, including non-admin invisibility and capacity rollback.

- [ ] **Step 5: Commit.**

```powershell
git add src/admin src/core/Game.ts
git commit -m "feat: allow admins to add catalog items for workshop tests"
```

### Task 5: Damage application and reliable post-boss reset

**Files:**
- Modify: `src/core/Game.ts`
- Modify: `src/core/GameProgressionContract.test.ts`
- Create: `src/core/GameVictoryReset.test.ts`
- Modify: `src/profile/PlayerProfile.test.ts`

**Interfaces:**
- Consumes `getPrimaryWeaponId(profile.equipment)`, `getInventoryItem(itemId)` and `resetRunProgression(profile)`.
- Produces `resolveEquippedBaseDamage(profile): number`, returning 8 only for equipped starter sword and 0 when no primary weapon is equipped.

- [ ] **Step 1: Write failing damage and victory-reset tests.**

```ts
expect(resolveEquippedBaseDamage(profileWithNoWeapon)).toBe(0);
expect(resolveEquippedBaseDamage(profileWithStarterSword)).toBe(8);
await game.returnToLobbyAfterVictoryForTest();
expect(saved.progression.level).toBe(1);
expect(saved.attributes).toEqual(createDefaultCharacterAttributes());
expect(saved.backpack).toEqual(originalBackpack);
```

- [ ] **Step 2: Run the focused tests to verify failure.**

Run: `npm test -- GameVictoryReset GameProgressionContract PlayerProfile`

Expected: FAIL for absent resolver or a non-persisted/reset-on-wrong-profile path.

- [ ] **Step 3: Implement explicit build and reset boundaries.**

Make `applyCharacterBuild()` derive weapon base damage from the profile equipment/catalog, never use a fallback sword when no weapon is equipped. In `returnToLobbyAfterVictory()`, reset the canonical profile, immediately synchronize inventory/profile state, persist the reset result, and only then create/show the lobby. Preserve equipment/backpack/capacity/vault and re-arm the victory flow only when persistence is confirmed.

- [ ] **Step 4: Run focused tests.**

Run: `npm test -- GameVictoryReset GameProgressionContract PlayerProfile`

Expected: PASS.

- [ ] **Step 5: Commit.**

```powershell
git add src/core/Game.ts src/core/GameProgressionContract.test.ts src/core/GameVictoryReset.test.ts src/profile/PlayerProfile.test.ts
git commit -m "fix: reset expedition progression after final boss victory"
```

### Task 6: Full validation and visual acceptance

**Files:**
- Modify only files required to correct failures discovered in this task.

- [ ] **Step 1: Run complete automated verification.**

Run: `npm test`

Expected: all existing and new tests PASS.

- [ ] **Step 2: Run production and asset validation.**

Run: `npm run build; npm run validate:warrior-glb`

Expected: TypeScript/Vite build and GLB validation PASS. Record but do not block on the known Vite chunk-size warning unless the build fails.

- [ ] **Step 3: Perform desktop visual review.**

Verify: centered lobby start action; full-screen workshop; initial sword unequipped then equipped; large equipment slots; ADM injection; common-material tooltip in lobby and scene; final-boss return reset with persistent backpack/equipment.

- [ ] **Step 4: Commit final verification corrections.**

```powershell
git add src index.html docs/superpowers
git commit -m "test: verify workshop and expedition progression flow"
```
