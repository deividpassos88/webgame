# Initial Chest and Wave Progression Design

**Date:** 2026-08-25

## Objective

Replace the current immediate enemy spawn and proximity-triggered boss flow with a deterministic arena progression:

1. The Paladin starts alone with a reward chest in front of him.
2. Choosing Sword or Axe starts five regular waves.
3. Each regular wave contains exactly 15 enemies, delivered gradually.
4. Completing the fifth wave starts a final battle with one boss and four mini-bosses.
5. Completing the final battle shows a victory screen.
6. Player death restarts the entire run from the initial chest.

## Scope

### Included

- Initial chest and weapon selection before combat.
- Five regular enemy waves.
- Gradual enemy batches and inter-wave countdowns.
- Per-wave difficulty multipliers.
- Final boss plus four mini-bosses.
- Wave/countdown/enemy-count HUD.
- Victory screen and `Jogar novamente` action.
- Full-run restart on player death.
- Automated regression coverage for the progression.

### Excluded

- Additional weapons or armor.
- New enemy or boss GLB models.
- Randomized rewards.
- Save/resume between browser sessions.
- Additional levels or arenas.

## Approved Player Flow

1. Load the scene with the Paladin at the existing player spawn point.
2. Do not create any enemies, mini-bosses, or boss.
3. Spawn `chest.glb` 2.5 world units in front of the Paladin along the arena's negative-Z direction.
4. Allow the existing click/approach/open interaction.
5. Show only the existing Sword and Axe choices.
6. Equip the selected weapon and remove the chest through its existing claim animation.
7. Start a five-second countdown.
8. Run regular waves 1 through 5.
9. After wave 5 is cleared, run another five-second countdown.
10. Spawn the final boss and four mini-bosses together.
11. When all five final enemies are dead, stop combat progression and show `Dungeon concluída` with `Jogar novamente`.
12. `Jogar novamente` performs the same full reset used after player death.

## Architecture

Create a dedicated `WaveManager` state machine. `Game` remains responsible for Three.js scene operations, input, and frame updates, while `WaveManager` owns progression decisions and emits commands/events for `Game` to execute.

The approved states are:

```text
waiting-for-weapon
  -> countdown
  -> regular-wave
  -> intermission
  -> regular-wave (until wave 5)
  -> final-countdown
  -> final-battle
  -> victory
```

Any full restart returns directly to `waiting-for-weapon`.

### Component Responsibilities

#### `WaveManager`

- Owns the current state and regular wave number.
- Owns total spawned, alive, and defeated counts for the current phase.
- Advances countdown timers.
- Schedules exactly five batches of three regular enemies per wave.
- Prevents duplicate batch, wave, final-battle, and victory transitions.
- Applies difficulty multipliers through immutable spawn descriptors.
- Produces HUD snapshots without importing DOM or Three.js scene code.
- Resets all progression state for a new run.

#### `Game`

- Creates the initial chest after Player and reward assets are ready.
- Starts `WaveManager` only after weapon equipment succeeds.
- Converts manager spawn commands into `Enemy` instances.
- Registers enemy deaths exactly once with the manager.
- Removes scene objects during reset.
- Creates the boss and mini-bosses from final-battle descriptors.
- Routes player death and `Jogar novamente` into one full-reset method.

#### `BossRewardCoordinator`

The existing coordinator is generalized from a boss reward into an initial equipment coordinator, or replaced by a narrowly named equivalent. It retains:

- Chest approach and opening behavior.
- Sword/Axe availability and equipment.
- Input locking while choosing.
- Recoverable asset and socket failures.

It no longer waits for boss death. Its successful weapon choice emits a single `weapon-selected` result that starts the first countdown.

#### `HUD`

Add a compact wave status area with:

- Regular wave label: `Onda N/5`.
- Regular remaining label: `Restantes: X/15`.
- Countdown label: `Próxima onda em: N`.
- Final label: `BOSS FINAL`.
- Final remaining label: `Inimigos restantes: X/5`.

Add a victory overlay containing:

- Heading: `Dungeon concluída`.
- Button: `Jogar novamente`.

The existing health, mana, animation-test, reward, death, and logging interfaces remain available.

## Regular Wave Rules

- Total waves: 5.
- Total enemies per wave: 15.
- Batch size: 3.
- Batches per wave: 5.
- Batch interval: 2 seconds.
- Inter-wave countdown: 5 seconds.
- A later wave cannot start until all 15 enemies from the current wave are dead.
- Batch timing does not wait for previously spawned enemies to die; it only obeys the two-second interval.
- Spawn positions are distributed across arena perimeter points and must not overlap the Paladin.
- The same spawn point must not be assigned twice within one three-enemy batch.

The regular-enemy base descriptor is 60 health, 8 damage, scale 0.95, detection range 8, attack range 1.5, and speed 2.2. Existing regular-enemy colors continue cycling across spawned enemies.

### Difficulty Multipliers

Multipliers apply to both health and damage relative to the regular enemy base descriptor:

| Wave | Health | Damage |
|---|---:|---:|
| 1 | 100% | 100% |
| 2 | 110% | 110% |
| 3 | 120% | 120% |
| 4 | 130% | 130% |
| 5 | 140% | 140% |

Speed, detection range, attack range, and visual scale remain at the regular-enemy base values. Integer health and damage values are rounded to the nearest whole number when descriptors are created.

## Final Battle Rules

The final battle begins only after:

- Wave 5 spawned all 15 enemies.
- All 15 wave-5 enemies were defeated.
- The five-second final countdown completed.

All five final enemies spawn together:

### Main Boss

- Count: 1.
- Health: 800.
- Damage: 22.
- Scale: 2.6.
- Detection range: 14.
- Attack range: 2.8.
- Speed: 1.6.

### Mini-Bosses

- Count: 4.
- Health: 220 each.
- Damage: 14 each.
- Scale: 1.6.
- Spawn around the boss platform with distinct positions.
- Use the existing procedural `Enemy` implementation with a distinct mini-boss color and standard non-boss behavior.

Victory is emitted only after the main boss and all four mini-bosses are dead. The boss health bar continues to represent only the main boss.

## Initial Chest and Equipment Rules

- The chest exists at the beginning of every run, never as a post-boss reward.
- No combat entity can spawn before a weapon is successfully equipped.
- The chest uses its existing static-model procedural opening animation.
- The player may choose only Sword or Axe.
- Successful selection is final for that run.
- Repeated clicks or selection events cannot start the wave system more than once.
- When `chest.glb` fails, show weapon selection directly.
- When one weapon asset fails, keep the other enabled.
- When both weapon assets fail, show a restart action; combat must not start without an equipped weapon.

## Death and Full Reset

Player death shows the existing death overlay. Pressing `Renascer` restarts the full run rather than preserving wave progress; it never resumes the interrupted wave.

The reset operation must:

1. Stop pending batch and countdown transitions.
2. Remove every regular enemy, boss, mini-boss, chest, and owned temporary effect from the scene.
3. Clear player attack and movement targets.
4. Remove the equipped weapon.
5. Restore player health and mana.
6. Return the player to the existing spawn point with idle animation.
7. Hide death, boss-health, wave, reward, and victory overlays as appropriate.
8. Reset `WaveManager` to `waiting-for-weapon`.
9. Spawn a fresh initial chest or direct weapon-selection fallback.

The same reset path is called by both the death screen's `Renascer` button and the victory screen's `Jogar novamente` button. Reset must be idempotent so duplicate UI events cannot create duplicate chests or wave timers.

## Enemy Lifecycle and Counting

- Every spawned enemy receives a unique run-scoped enemy identifier and phase identifier.
- An enemy death is reported to `WaveManager` once.
- Visual death/removal delay does not keep the enemy in the alive count.
- Dead enemies remain non-targetable through the current raycast filtering.
- Stale death reports from a previous run or phase are ignored.
- A wave completes only when `spawned === 15` and `alive === 0`.
- The final battle completes only when `spawned === 5` and `alive === 0`.

## Error Handling

- Invalid state transitions are ignored and logged rather than throwing inside the render loop.
- Spawn failures do not silently mark an enemy as alive; the manager receives only successfully created entity IDs.
- If a complete three-enemy batch cannot be created, retry missing members on the next update without duplicating successful members.
- Asset failure follows the initial equipment fallback rules and prevents combat from starting without a weapon.
- Reset cancels all scheduled progression using state/timer reset rather than browser `setTimeout` callbacks, avoiding callbacks from an older run.

## Testing Strategy

### `WaveManager` Unit Tests

- Starts with `waiting-for-weapon` and emits no spawn commands.
- Weapon selection begins a five-second countdown once.
- Emits five batches of exactly three enemies at two-second intervals.
- Never exceeds 15 regular enemies per wave.
- Does not advance while a live enemy remains.
- Advances through exactly five regular waves.
- Applies 100%, 110%, 120%, 130%, and 140% health/damage multipliers.
- Emits one final-battle command after the final countdown.
- Requires five final enemy deaths before victory.
- Ignores duplicate death, selection, and update signals.
- Reset invalidates prior phase IDs and clears timers/counts.

### Integration Tests

- Game startup creates chest but no enemies.
- Successful Sword/Axe equipment starts wave progression.
- Regular spawn commands produce targetable `Enemy` instances.
- Main boss and four mini-bosses use the approved descriptors.
- Player death removes all combat entities, weapon, and wave progress.
- Victory overlay appears once and `Jogar novamente` creates one fresh chest.
- Chest or weapon failure follows the approved fallback without starting combat improperly.

### Regression and Manual Verification

- Run the complete Vitest suite and production build.
- Verify Sword and Axe still follow the Paladin through all five animations.
- Verify no enemies are visible before weapon selection.
- Verify the wave HUD on desktop and narrow mobile viewport.
- Run a shortened development-only timing configuration for visual verification, remove it afterward, and prove no preview/test hook remains in production source.

## Acceptance Criteria

- The scene opens with only the Paladin and initial chest.
- Weapon choice is required before combat.
- Exactly five regular waves run, with exactly 15 enemies each.
- Enemies enter in groups of 3 every 2 seconds.
- Each next phase waits for all current enemies to die and then counts down 5 seconds.
- Difficulty increases by the approved health/damage multipliers.
- Final battle contains exactly 1 main boss and 4 mini-bosses.
- Victory requires defeating all five final enemies.
- Death and `Jogar novamente` both perform a complete clean restart.
- Automated tests, TypeScript checking, production build, and visual checks pass.
