# Monster, Reward, and Combat Adjustment Design

Date: 2026-08-27
Status: Approved

## Scope

This change finishes the animated `monstro.glb` integration and changes only:

- the regular-monster GLB visual and animation behavior;
- the regular-monster death presentation;
- the initial Sword/Axe selection interface;
- weapon-specific kill healing and regular-monster defense chance;
- floating healing-number formatting;
- the explicitly supplied combat and wave balance values.

Mini-boss and boss visuals remain procedural. Wave quantities, batch cadence, countdowns, plasma travel, equipment attachment, player animations, targeting, arena collision, and enemy separation remain unchanged except where this document explicitly says otherwise.

## Regular Monster Model and Animation

The game preloads `/models/monstro.glb` once and creates an independent skeleton clone for each regular monster. A failed load retains the current procedural regular-monster visual and records a warning without preventing the run from starting.

The exported clips map as follows:

| Game behavior | GLB clip |
|---|---|
| Static/idle | `Character_output.fbx` |
| Patrol | `Walking` |
| Player pursuit | `Running` |
| First attack | `Charged_Slash` |
| Second attack | `Charged_Upward_Slash` |
| Death | `dying_backwards` |

Horizontal Hips root motion is removed relative to the static reference clip. World movement continues to be controlled by the existing enemy AI, preventing animation snapping or returning the monster to an earlier position.

The two slash clips alternate for consecutive attacks while the monster remains alive and in range. Each attack causes damage once at its strike point. Leaving attack range cancels the current attack behavior and returns the monster to pursuit.

Regular monsters spawn with their original GLB colors, materials, and textures. No white-spawn effect is added.

## Monster Death Presentation

On lethal damage, the regular monster first plays `dying_backwards`. It then uses the chest visual language:

1. a short scale pulse and shake;
2. a small vertical lift;
3. a bright warm flash;
4. opacity and scale collapse until removal.

The existing light-blue healing plasma still launches toward the player when applicable. Death is reported to wave progression once, and delayed visual removal does not award a second reward.

Mini-bosses and the final boss use the same chest-style pulse, shake, lift, flash, and collapse immediately after lethal damage because their procedural visuals do not contain `dying_backwards`.

## Weapon Rules

Weapon definitions are the authoritative source for attack values, kill-heal percentages, and defense chances.

| Weapon | Damage | Range | Cooldown | Regular kill heal | Mini-boss kill heal | Defense vs regular |
|---|---:|---:|---:|---:|---:|---:|
| Long Sword | 8 | 2.2 m | 1.0 s | 3% max HP | 6% max HP | 3% |
| War Axe | 10 | 1.5 m | 1.3 s | 3.1% max HP | 6.2% max HP | 5% |

Kill healing occurs only when the enemy dies and is delivered by the existing plasma effect. The boss gives no healing or damage reward.

Damage growth per kill is independent of weapon:

- regular monster: `+0.3` damage;
- mini-boss: `+0.4` damage;
- final boss: no reward.

Defense is rolled independently for each incoming regular-monster attack. A successful defense reduces that attack to zero damage. Mini-boss and boss attacks cannot be blocked by these weapon chances. The event is recorded in the game log without adding a new HUD system.

Kill healing is rounded to one decimal place. Floating healing feedback uses Brazilian decimal formatting with exactly one decimal and an HP suffix, for example `+4,0 HP`.

## Balance

Base values:

| Entity | HP | Damage | Scale | Detection | Attack range | Speed |
|---|---:|---:|---:|---:|---:|---:|
| Regular | 50 | 4 | 0.7 | 18 m | 1.7 m | 2.2 |
| Mini-boss | 80 | 7 | 1.2 | 24 m | 2.0 m | 2.5 |
| Final boss | 700 | 22 | 5.0 | 45 m | 5.8 m | 1.6 |

Regular-wave multipliers:

| Wave | HP | Damage | Speed |
|---:|---:|---:|---:|
| 1 | 1.00 | 1.00 | 1.00 |
| 2 | 1.45 | 1.15 | 1.00 |
| 3 | 1.55 | 1.25 | 1.06 |
| 4 | 1.65 | 1.35 | 1.15 |
| 5 | 1.75 | 1.50 | 1.20 |

Wave structure remains five regular waves, 25 monsters per wave, five monsters per batch, four seconds between batches, five seconds for the initial countdown, five seconds between waves, and five seconds before the boss battle.

## Initial Weapon Selection Interface

### Design contract

- Approval evidence: the user approved the recommended modular approach and the final design.
- Subject world: the initial armory inside the Dragon Miner dungeon.
- Audience: a player choosing the run's starting weapon.
- Single interface job: choose the starting weapon from its real GLB and combat attributes.
- Palette: Obsidian `#070A0D`, Steel `#151B22`, Brass `#C7923E`, Plasma `#69D7E8`, Bone `#E9EEF2`, Ember `#B94A3C`.
- Display typography: Georgia, restrained and high contrast.
- Body typography: Segoe UI for readable descriptions.
- Utility typography: Consolas for numerical combat values.
- Layout thesis: two armory plates compare the weapons side by side on desktop and stack on narrow screens.
- Signature element: each actual weapon GLB rotates over a restrained forge-ring stage.
- Justified aesthetic risk: a narrow energy seam divides the competing weapons while the rest of the interface remains disciplined.
- Icon source/system: real weapon GLBs and project-native inline SVG symbols for damage, range, cooldown, kill healing, and defense. Emoji and star ratings are removed.
- Critique ledger: generic emoji icons rejected; imprecise star ratings rejected; the existing dark modal revised into a dungeon-specific armory; real rotating GLBs accepted.
- Roles: explicit Sol/Luna routing is unavailable. The current agent assumes direction/review and execution in separate phases.

Each weapon card contains its real rotating GLB and exact values from the Weapon Rules table. Mouse click, Enter, and Space select the focused available weapon. An unavailable model disables only its own card and exposes an understandable status.

Desktop uses two columns. Mobile stacks the cards without horizontal overflow. Keyboard focus is prominent and follows a logical order. When `prefers-reduced-motion: reduce` is active, weapon rotation and nonessential transitions stop. Preview render loops stop while the dialog is hidden and release resources during disposal or replacement.

## Components and Data Flow

- `EnemyAssetStore` owns one loaded monster GLB and creates independent animated visual instances.
- `EnemyAnimationController` maps clips, removes horizontal root motion, blends locomotion, alternates attacks, and exposes death timing.
- `Enemy` retains combat AI and receives an optional animated visual. It owns strike timing and the chest-style death presentation.
- `EquipmentCatalog` owns weapon attack, kill-heal, and defense values.
- `KillRewards` calculates the weapon-specific healing and role-specific damage bonus.
- `CombatEntityRegistry` forwards the attacking entity role with incoming damage so `Game` can apply defense only to regular attacks.
- `RewardWeaponPreview` owns the modal's Three.js preview scenes and render-loop lifecycle.
- `HUD` controls dialog state and accessible interaction; it does not calculate gameplay values.
- `Game` connects loaded assets, rewards, incoming attacks, plasma healing, and UI feedback.

## Failure Handling

- Missing monster GLB: use the procedural regular-monster fallback and log the loader error.
- Missing static clip: use `Walking`, then `Running`, as the idle fallback.
- Missing `Walking` or `Running`: keep the last available locomotion action while world movement continues.
- Missing one slash: reuse the available slash for every attack. Missing both slashes: retain the procedural lunge and one immediate damage event.
- Missing death clip: start the chest-style death presentation immediately.
- Missing one weapon GLB: disable only that weapon card.
- Preview WebGL failure: keep the weapon's textual statistics and selection available.
- A blocked attack or kill reward is processed at most once per combat event.

## Testing and Acceptance

Automated tests cover:

- monster asset loading and independent skeleton clones;
- exact clip mapping and horizontal root-motion removal;
- locomotion, alternating slash actions, single strike damage, death sequence, and procedural fallback;
- weapon-specific kill healing, damage rewards, and regular-only defense boundaries;
- one-decimal Brazilian HP formatting;
- all base stats and five wave multiplier profiles;
- preview lifecycle and reward-card accessibility states;
- existing wave progression, collision, separation, equipment, plasma, and animation regressions.

Visual acceptance uses the runnable game with the actual Sword and Axe GLBs.

- Real rendered desktop and mobile screenshots reviewed before Sol acceptance.
- Complete no-mouse traversal and active prefers-reduced-motion: reduce emulation completed before Sol acceptance.
- Full automated test suite and production build must pass.
- The temporary development service used for visual inspection must be stopped before handoff.
