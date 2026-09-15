# Progressão por XP, Status no Cenário e Mochila de 20 Espaços

## Status

Approved design. This specification replaces the one-time, lobby-only allocation of 100 status points with progression earned in the dungeon. It also removes the gameplay side backpack, adds two supplied HUD icons, and corrects the player portrait framing.

## Subject and interface contract

- **Subject:** Fortaleza de Cinzafogo, a desktop WebGL action-RPG dungeon.
- **Audience:** desktop action-RPG players progressing through five waves into a final boss fight.
- **Single interface job:** distribute attribute points earned in the dungeon.
- **Approval evidence:** the player explicitly chose five points per level and approved the full direction on 2026-09-07.
- **Palette:** Obsidian `#0B0E13`, Night Steel `#101923`, Forge Gold `#C9973E`, Pale Gold `#F1D28A`, Parchment `#E8E2D6`, Ember `#A93B2F`.
- **Typography:** Georgia for display headings, project sans-serif for explanatory copy, monospace for XP and numeric values.
- **Layout thesis:** a compact HUD utility cluster opens focused, pause-safe modal surfaces; neither Status nor Backpack permanently covers the dungeon.
- **Signature:** a forged-gold level medallion that makes current level, XP progress, and unspent points legible at a glance.
- **Aesthetic risk:** a modal can obscure active combat. It opens only while simulation is paused, has a light backdrop, and always closes via its visible control or Escape.
- **Icon source/system:** supplied backpack and status PNG files stored in `public/assets/ui/`; existing project-native SVG icons remain the system for attribute and equipment rows.
- **Routing roles:** Sol Elevated direction/review is performed by the primary agent; implementation uses the primary agent as fallback because separate Sol Light/Luna routing is unavailable.

### Critique ledger

| Prompt-supplied pattern | Decision | Rationale |
| --- | --- | --- |
| Portrait showing torso instead of face | Revised | The portrait render will frame the head from live model bounds rather than fixed world-height values. |
| Supplied backpack artwork | Accepted | It is the real requested icon asset, displayed with `object-fit: contain`. |
| Supplied status artwork | Accepted | It is the real requested icon asset, displayed with `object-fit: contain`. |
| Permanent gameplay backpack panel | Rejected | It competes with the combat view and is replaced by an explicit icon-triggered modal. |
| Lobby Status build panel | Rejected | Attributes are now earned and allocated inside the dungeon. |

## Encounter and XP calculation

The mandatory route before the final boss has a fixed population:

| Encounter | Count | XP each | XP total |
| --- | ---: | ---: | ---: |
| Normal enemies | 125 | 10 | 1,250 |
| Mini-bosses | 10 | 75 | 750 |
| **Mandatory pre-boss total** | **135** | — | **2,000** |

WaveManager currently has five regular waves of 25 enemies and inserts two mini-bosses in each wave. The four boss allies can respawn, so they are intentionally excluded from the fixed progression budget.

The player begins at level 1 with 0 XP and 0 unspent attribute points. Every 100 XP grants one level and 5 points. Twenty level-ups therefore produce exactly 100 points at level 21, immediately before the final boss. XP is capped at 2,000 for this chapter, which prevents the respawning final-battle allies from becoming an infinite stat farm. The final boss still completes the reward flow but cannot exceed this chapter's 100-point progression cap.

## Saved profile and migration

`PlayerProfile` moves to schema version 4. It gains a progression record with level, XP, XP-to-next derived from the constant threshold, and chapter cap. The obsolete one-time-build fields and confirmation behavior are removed from active gameplay.

New profiles:

- retain the starter sword and five one-star skills;
- begin with all seven attributes at 0;
- begin with 0 available attribute points;
- start at level 1 with 0 / 100 XP;
- use a backpack capacity of 20.

Schema-v3 saves preserve equipment, skills, backpack contents, and Guild Vault contents. Legacy pre-granted attributes are reset to zero and no free points are carried forward, so the current browser profile follows the new campaign rule. If an old backpack has more than 20 distinct stacks, the overflow is merged into the Guild Vault without deleting items; the overflow ledger accepts any valid item type so equipment and consumables are also preserved.

## Status allocation rules

The seven attributes remain Strength, Attack, Defense, Agility, Critical Attack, Critical Magic, and Dodge. Derived combat formulas stay centralized in `CharacterAttributes` and are re-applied immediately after any successful allocation.

Allocation is immediately persistent and one-way in the playable version. It is allowed while points remain, with this anti-single-stat rule:

1. Any attribute may reach 30 normally.
2. To allocate a point above 30 in one attribute, a different attribute must already be at 30 or more.
3. A +5 interaction stops exactly at the first blocked value instead of overspending or crossing the gate.
4. The disabled control explains the gate: another attribute must reach 30 first.
5. The Status surface has no free minus or clear controls; a future reset surface remains visibly unavailable and does not claim a working USDT or Guild Token payment integration.

## Interface behavior

### Lobby

- Remove the Status tab and `LobbyAttributesPanel` from the lobby.
- Keep lobby inventory at exactly 20 slots.
- Retain equipment, hero preview, skill display, and the start action.

### Gameplay HUD

- Remove the `hud-backpack-panel` side panel.
- Preserve the circular character portrait button, but make its image a face crop based on the character's actual visible bounds.
- Add a Backpack icon button that opens the backpack surface.
- Add a Status icon button that opens the status surface.
- Portrait opens the equipment surface; Backpack opens only the 20-slot inventory; Status opens only XP and attributes.
- Opening any of these surfaces uses the existing pause-safe overlay flow. Escape and the close button restore focus to the trigger and resume input cleanly.

### Status modal

It shows the current level, `XP / 100`, available points, the seven editable rows, the anti-focus explanation, and derived combat values. It does not show a one-time confirmation button.

### Backpack modal

It renders exactly 20 slots, keeps current craft-item inspection behavior, shows Guild Vault overflow separately, and preserves current equipment flows in the portrait-opened character surface.

## Boundaries and accessibility

- The game remains desktop-first; a narrow viewport must not produce horizontal overflow or imply supported mobile gameplay.
- All icon controls have real labels, visible `:focus-visible` treatment, deterministic tab order, Escape handling, and focus traps inside modal dialogs.
- `prefers-reduced-motion: reduce` disables nonessential panel transitions and preserves a usable static state.
- The supplied raster assets are not regenerated or replaced with emoji or unrelated generic icons.

## Implementation units

1. `CharacterProgression` (pure): encounter XP, level-up, cap, and tests.
2. `CharacterAttributes` / `PlayerProfile` (pure persistence): anti-focus validation, schema-v4 migration, and 20-slot preservation.
3. `InventoryStore` / RPG view model: fixed 20 capacity and Guild Vault overflow.
4. HUD and `InventoryOverlay`: explicit Backpack, Status, and Equipment entry modes with keyboard-safe modal behavior.
5. `LobbyScreen` / `index.html` / `style.css`: remove lobby allocation UI and reflect 20 slots.
6. `Game`: awards XP exactly once for a valid kill, applies live stats after allocation, captures a face portrait, and persists state.

## Verification

- Unit tests cover 125 normal + 10 mini-boss XP reaching exactly 2,000, twenty level-ups, chapter cap, duplicate-death rejection, and no final-allies farming.
- Unit tests cover the 30-point gate, boundary behavior for +1/+5, profile migration, 20-slot overflow preservation, and modal entry modes.
- Existing test suite and production build must pass.
- Rendered desktop verification must show lobby, combat HUD, Backpack, Status, face portrait, empty/full inventory, and gated/unlocked status controls.
- Real rendered desktop and mobile screenshots reviewed before Sol acceptance.
- Complete no-mouse traversal and active prefers-reduced-motion: reduce emulation completed before Sol acceptance.
- The narrow/mobile screenshot is evidence of the explicit desktop-only treatment, not a mobile support claim.
