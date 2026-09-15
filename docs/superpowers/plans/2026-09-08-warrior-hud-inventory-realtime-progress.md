# Execution ledger — plan: docs/superpowers/plans/2026-09-08-warrior-hud-inventory-realtime.md

## Preflight review

| Tasks/interfaces | Finding | Ruling |
|---|---|---|
| 1 → 2 | Task 1 produces persisted capacity and an expansion draft; Task 2 owns UI and the commit flow. | Keep transaction preparation pure; Game applies it only after validation and persistence path is available. |
| 1 → 2 | `guild-token` can reside in backpack or hidden guild vault. | Consume across both sources deterministically, preserving unrelated stacks and never creating a fake currency balance. |
| 2 → 3 | Inventory overlay becomes real-time while it still traps keyboard focus. | Clear input and cancel movement on open; do not pause world simulation. |
| 3 → 4 | Fadiga must continue behind an open panel. | Update fatigue inside the normal playing loop, independent of overlay visibility. |
| 4 → 5 | HUD moves health away from lower rail while adding fatigue. | Top-left health remains the single health display; lower rail contains XP, mana and fatigue only. |
| 2 → 5 | Both tasks edit index HTML and stylesheet. | Execute sequentially; Task 5 composes the final visual structure after Task 2’s semantic controls exist. |

## Rulings

- Ruling: define the backpack maximum as 60 slots — the request gives a +5 increment but no ceiling; bounded storage protects desktop layout and can be raised later. Cost if wrong: the maximum must be adjusted in one constant and copy.
- Ruling: CM is visible but disabled — no wallet or payment integration exists, and a fictitious balance would be misleading. Cost if wrong: an EconomyPort must replace the disabled route later.
- Ruling: fatigue is informative only in this delivery — movement was recently stabilized and the user requested depletion, not a speed penalty. Cost if wrong: a later balance pass can make `FatigueMeter` affect speed through a single policy.

## Completed tasks

- Task 1 — complete. Schema 6 persists the capacity, migrates legacy profiles without dropping inventory, and prepares an atomic 30 Guild Token expansion. Sol review approved it after an explicit backpack-before-vault test was added. Focused tests: 5/5; typecheck: passed.
- Task 2 — complete. Lobby and overlay expose the +5 purchase, a disabled honest CM route, larger responsive slots, compact persisted status, and no visible vault. Persistence rollback, keyboard focus restoration, and desktop grid fit are covered. Sol review clean. Focused tests: 42/42; typecheck: passed.
- Task 3 — complete. Character panels now block only gameplay input, cancel movement on open, and leave the loop running; terminal states dismiss the panel. The obsolete, unreachable loot panel was removed because final-boss rewards are already automatically transferred and notified. Focused tests: 29/29; typecheck: passed.
- Task 4 — complete. A non-authoritative fatigue meter drains 12%/s on effective movement and recovers 18%/s at rest. It is displayed separately from mana and does not alter movement or combat. Focused tests: 29/29; typecheck: passed.
- Task 5 — complete. User-supplied portrait and six icon assets are served from stable public paths, lobby cards contain five SVG stars, and the desktop HUD separates top-left health from lower XP/mana/fatigue and lower-right actions. Visual desktop review was performed in the local browser.

## Final verification

- Full Vitest suite: 120 files / 609 tests passed.
- Typecheck, production build, and warrior GLB validation passed (13.63 MiB; expected animation set found).
- Browser review: lobby status/inventory/skill cards, static portrait, six ability tiles, and real-time backpack overlay checked on a 1440×900 desktop viewport. The health value changed while the backpack was open, proving simulation continued.
