# Guerreiro HUD e mochila em tempo real — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tornar a mochila expansível, os painéis não-pausáveis e o HUD do Guerreiro alinhado ao layout e aos assets fornecidos.

**Architecture:** A capacidade da mochila passa a pertencer ao perfil persistido e é usada por `InventoryStore` por referência. Uma transação pura valida e prepara a compra antes de qualquer mutação; `Game` persiste o resultado e atualiza as telas. `GameFlowController` deixa de modelar painéis como pausa, enquanto `FatigueMeter` alimenta o HUD sem alterar a movimentação.

**Tech Stack:** TypeScript, Three.js, Vitest, DOM/CSS, Vite.

**Spec:** `docs/superpowers/specs/2026-09-08-warrior-hud-inventory-realtime-design.md`

## Global Constraints

- Desktop WebGL somente; não criar controles mobile.
- Guild Token é o item `guild-token`; CM não tem integração e permanece indisponível.
- A expansão é +5 slots, custo 30 Guild Tokens, capacidade inicial 20, máximo 60.
- Nenhuma janela de jogo pausa a simulação.
- Manter dados de overflow do cofre, mas remover sua apresentação visual.
- Não há repositório Git neste diretório; não criar commits ou worktrees.

---

### Task 1: Persistir capacidade e compra atômica

**Files:**
- Create: `src/inventory/BackpackExpansion.ts`
- Create: `src/inventory/BackpackExpansion.test.ts`
- Modify: `src/profile/PlayerProfile.ts`
- Modify: `src/profile/PlayerProfile.test.ts`
- Modify: `src/inventory/InventoryCapacity.ts`
- Modify: `src/inventory/InventoryStore.ts`
- Modify: `src/inventory/InventoryStore.test.ts`

**Interfaces:**
- Produces `BACKPACK_INITIAL_CAPACITY`, `BACKPACK_CAPACITY_INCREMENT`, `BACKPACK_MAX_CAPACITY`.
- Produces `prepareGuildTokenBackpackExpansion(profile, snapshot): BackpackExpansionResult`.
- `PlayerProfile` gains `backpackCapacity: number` and schema 6 migration.

- [ ] **Step 1: Write failing profile and transaction tests**

```ts
expect(createDefaultPlayerProfile().backpackCapacity).toBe(20);
expect(prepareGuildTokenBackpackExpansion(profileWithThirtyTokens, inventory).kind).toBe('expanded');
expect(prepareGuildTokenBackpackExpansion(profileWithTwentyNineTokens, inventory).kind).toBe('insufficient-guild-tokens');
expect(prepareGuildTokenBackpackExpansion(profileAtSixtySlots, inventory).kind).toBe('capacity-maximum');
```

- [ ] **Step 2: Run the focused tests and confirm they fail**

Run: `npm test -- src/inventory/BackpackExpansion.test.ts src/profile/PlayerProfile.test.ts --run`

Expected: failure because capacity and transaction do not exist.

- [ ] **Step 3: Implement schema six and migration**

Add `backpackCapacity` to new profiles, validation and every earlier migration. Clamp migrated values to `20..60` and the nearest 5-slot step. Existing profiles without the field receive 20 and retain all backpack/cofre items.

- [ ] **Step 4: Implement a non-mutating expansion draft**

Build a token count across `InventoryStore.snapshot().backpack` and `profile.guildVault`; calculate removals before returning a result. The success result contains the next capacity and exact next stacks. Any error result returns the unchanged input state.

- [ ] **Step 5: Make `InventoryStore` consume profile capacity**

Replace the fixed `BACKPACK_CAPACITY` call site in `fromProfile` with the profile’s persisted capacity. Add a safe store replacement/commit path so an expansion does not invalidate overlay references.

- [ ] **Step 6: Run focused tests**

Run: `npm test -- src/inventory/BackpackExpansion.test.ts src/profile/PlayerProfile.test.ts src/inventory/InventoryStore.test.ts --run`

Expected: PASS.

### Task 2: Expansão na mochila e status atual no lobby

**Files:**
- Modify: `index.html`
- Modify: `src/ui/InventoryOverlay.ts`
- Modify: `src/ui/InventoryOverlay.test.ts`
- Modify: `src/ui/LobbyScreen.ts`
- Modify: `src/ui/LobbyScreen.test.ts`
- Modify: `src/ui/RpgUiViewModel.ts`
- Modify: `src/ui/RpgUiViewModel.test.ts`
- Modify: `src/core/Game.ts`
- Modify: `src/style.css`

**Interfaces:**
- Consumes the expansion result from Task 1.
- Produces a `data-expand-backpack="guild-token"` action and a disabled `data-expand-backpack="cm"` action.
- `buildRpgUiViewModel` exposes the seven persisted attributes for lobby rendering.

- [ ] **Step 1: Write failing UI tests**

```ts
expect(view.backpack).toHaveLength(25);
expect(lobbyMarkup).toContain('Status atual');
expect(overlayMarkup).not.toContain('Proteção de recompensa');
expect(overlayMarkup).toContain('30 Token da Guilda');
expect(overlayMarkup).toContain('5 CM — indisponível');
```

- [ ] **Step 2: Run the focused tests and confirm failure**

Run: `npm test -- src/ui/InventoryOverlay.test.ts src/ui/LobbyScreen.test.ts src/ui/RpgUiViewModel.test.ts --run`

- [ ] **Step 3: Add the expansion controls and commit flow**

Render a clear `+5 espaços` affordance beside capacity. On Guild Token success, apply the prepared transaction, persist once, refresh lobby/overlay and call existing overflow delivery. On failure, show an exact real reason. CM remains disabled and cannot create a success state.

- [ ] **Step 4: Remove only the visible guild-vault panel**

Delete its HTML and DOM rendering from the backpack panel. Keep profile `guildVault` and automatic delivery logic untouched.

- [ ] **Step 5: Render compact current status below equipment**

Use the existing seven persisted attribute values, not fabricated derived figures. Preserve equipment slots and primary/secondary weapon layout.

- [ ] **Step 6: Style the larger slots and glass panel**

Make lobby and overlay grids readable at desktop scale, use translucent obsidian glass and deliberate forged-gold borders. Preserve visible keyboard focus and disabled-state contrast.

- [ ] **Step 7: Run focused UI tests**

Run: `npm test -- src/ui/InventoryOverlay.test.ts src/ui/LobbyScreen.test.ts src/ui/RpgUiViewModel.test.ts --run`

Expected: PASS.

### Task 3: Keep the world running behind panels

**Files:**
- Modify: `src/core/GameFlowController.ts`
- Modify: `src/core/GameFlowController.test.ts`
- Modify: `src/core/Game.ts`
- Modify: `src/core/InputManager.ts`
- Modify: `src/ui/InventoryOverlay.ts`
- Modify: `src/ui/LootOverlay.ts`
- Create: `src/core/GameRealtimeOverlayContract.test.ts`

**Interfaces:**
- `GameFlowState` keeps `playing` while character or loot panels are shown.
- Overlay opening calls `cancelMovement()` and releases input without setting simulation pause.

- [ ] **Step 1: Write failing flow tests**

```ts
flow.transition({ type: 'open-inventory' });
expect(flow.state).toBe('playing');
expect(flow.isSimulationPaused).toBe(false);
expect(gameSource).toContain('this.player.cancelMovement()');
```

- [ ] **Step 2: Run focused tests and confirm failure**

Run: `npm test -- src/core/GameFlowController.test.ts src/core/GameRealtimeOverlayContract.test.ts --run`

- [ ] **Step 3: Separate presentation from simulation state**

Remove `paused-inventory` and `paused-loot` as simulation states. Retain overlay visibility/focus independently. Keep death/victory priority and clear any open overlay when either terminal state begins.

- [ ] **Step 4: Block accidental input, not simulation**

When any overlay opens, clear `InputManager`, call `player.cancelMovement()`, and prevent keyboard controls from escaping the modal. Enemy updates, player damage, cooldowns, waves and fatigue continue in the ordinary game loop.

- [ ] **Step 5: Run focused tests**

Run: `npm test -- src/core/GameFlowController.test.ts src/core/GameRealtimeOverlayContract.test.ts --run`

Expected: PASS.

### Task 4: Fadiga independente da mana

**Files:**
- Create: `src/combat/FatigueMeter.ts`
- Create: `src/combat/FatigueMeter.test.ts`
- Modify: `src/entities/Player.ts`
- Modify: `src/core/Game.ts`
- Modify: `src/ui/HUD.ts`
- Modify: `src/ui/HudVitals.ts`
- Modify: `src/ui/HudVitals.test.ts`
- Modify: `index.html`

**Interfaces:**
- `FatigueMeter.update(delta, moving): number` clamps a percentage to 0–100.
- `HUD.updatePlayerFatigue(current, max)` renders percentage text and width.
- Player exposes actual movement (`currentMoveSpeed > epsilon`) rather than keyboard intent only.

- [ ] **Step 1: Write failing meter tests**

```ts
const fatigue = new FatigueMeter();
expect(fatigue.update(1, true)).toBe(88);
expect(fatigue.update(1, false)).toBe(100);
expect(fatigue.update(100, true)).toBe(0);
```

- [ ] **Step 2: Run the focused tests and confirm failure**

Run: `npm test -- src/combat/FatigueMeter.test.ts src/ui/HudVitals.test.ts --run`

- [ ] **Step 3: Implement the meter and HUD binding**

Drain 12 points/second during effective locomotion; recover 18 points/second otherwise. Do not alter speed, attacks or mana. Update the HUD once per game frame alongside health/mana.

- [ ] **Step 4: Run focused tests**

Run: `npm test -- src/combat/FatigueMeter.test.ts src/ui/HudVitals.test.ts --run`

Expected: PASS.

### Task 5: Integrar retrato e ícones fornecidos, redesenhar HUD e cards de skills

**Files:**
- Create: `public/assets/ui/portrait/warrior-portrait.png`
- Create: `public/assets/ui/skills/basic-attack.png`
- Create: `public/assets/ui/skills/spin.png`
- Create: `public/assets/ui/skills/frost-spin.png`
- Create: `public/assets/ui/skills/jump-impact.png`
- Create: `public/assets/ui/skills/flame-strike.png`
- Create: `public/assets/ui/skills/double-cut.png`
- Create: `src/ui/WarriorSkillAssets.ts`
- Create: `src/ui/WarriorSkillAssets.test.ts`
- Modify: `src/ui/HUD.ts`
- Modify: `src/ui/LobbyScreen.ts`
- Modify: `src/ui/RpgUiViewModel.ts`
- Modify: `src/core/Game.ts`
- Modify: `src/ui/PortraitFraming.ts`
- Modify: `src/style.css`
- Modify: `index.html`

**Interfaces:**
- `warriorSkillAsset(id | 'ataque_basico')` returns a stable public image path.
- `renderSkillStars(level)` returns five accessible SVG star elements; no Unicode fallback.
- `HUD.setPortraitImage(path)` uses the supplied portrait without a render-target capture.

- [ ] **Step 1: Copy the user-provided PNG files under stable names**

Copy the portrait and six images from the listed temporary attachments into the exact public paths above. Do not re-encode or regenerate them.

- [ ] **Step 2: Write failing mapping and markup tests**

```ts
expect(warriorSkillAsset('ataque_basico')).toBe('/assets/ui/skills/basic-attack.png');
expect(renderSkillStars(3).match(/<svg/g)).toHaveLength(5);
expect(renderLobbySkills(profile)).toContain('flame-strike.png');
```

- [ ] **Step 3: Run focused tests and confirm failure**

Run: `npm test -- src/ui/WarriorSkillAssets.test.ts src/ui/RpgUiViewModel.test.ts --run`

- [ ] **Step 4: Replace generic skill glyphs**

Use the shared explicit asset map in both HUD and lobby. Keep the existing keyboard labels, cooldown, locking and accessibility labels.

- [ ] **Step 5: Replace diamond markers with SVG stars**

Render exactly five stars inside each lobby skill card; filled state derives solely from `profile.skillStars`.

- [ ] **Step 6: Remove portrait capture work**

Remove the runtime portrait render target/capture invocation, set the fixed user-provided portrait through CSS/image markup, and preserve the equipment button’s accessible name.

- [ ] **Step 7: Recompose the HUD**

Place portrait/life/level at upper-left, keep utility buttons below, put XP/mana/fadiga at the lower rail, and place six icon-based action tiles at lower-right. The life bar moves out of the lower rail so all four resource values remain visible as percentages without duplication.

- [ ] **Step 8: Run focused asset/UI tests**

Run: `npm test -- src/ui/WarriorSkillAssets.test.ts src/ui/RpgUiViewModel.test.ts src/ui/CharacterHudContract.test.ts --run`

Expected: PASS.

### Task 6: Terra Elevado verification and Sol critical acceptance

**Files:**
- Modify only files required by test fixes from Tasks 1–5.

- [ ] **Step 1: Run all automated checks**

Run: `npm test -- --reporter=dot --silent`

Run: `npm run build`

Run: `npm run validate:warrior-glb`

- [ ] **Step 2: Launch a temporary local Vite server and inspect rendered UI**

Check lobby inventory/equipment/skills and gameplay HUD. Open character backpack/status panels while enemies are active and verify updates continue. Confirm static portrait and all six icons are visible.

- [ ] **Step 3: Test keyboard and reduced motion**

Traverse every interactive HUD/overlay action without mouse, inspect visible focus, test `Escape`, and actively emulate `prefers-reduced-motion: reduce`.

- [ ] **Step 4: Capture desktop and constrained viewport evidence**

Inspect for clipping, contrast, overflow and transparent-panel readability. Stop the temporary server afterwards.

- [ ] **Step 5: Sol Elevado reviews implementation against the spec**

Reject any fake CM payment, lost overflow reward, paused simulation, mismatched icon order, missing stars, or unverified visual claim.
