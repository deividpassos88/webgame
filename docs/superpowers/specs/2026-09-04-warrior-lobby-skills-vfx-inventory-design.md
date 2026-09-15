# Warrior Lobby, Skills, VFX, and Inventory Design

Date: 2026-09-04

## Goal

Replace the current direct-to-combat and initial weapon chest flow with a polished Warrior-first RPG flow: first-run class selection, a reusable 3D lobby, a five-skill combat bar, synchronized WebGL VFX, corrected sword handling in Blender, and paused in-world inventory and loot interfaces.

## Confirmed product decisions

- The only selectable class is **Guerreiro**.
- Class selection appears only when no valid local profile exists. Later visits open the lobby directly.
- The Warrior starts with the sword equipped. The initial weapon-selection chest and reward choice do not appear.
- The attack button/mouse input performs the fast, free basic attack.
- Five separate skill buttons use energy and cooldowns.
- Skill animations run at their native speed or up to `1.2x`; only the basic attack runs faster.
- The inventory and loot interfaces pause combat completely.
- The backpack has 30 slots and can store equipment, consumables, and stackable crafting materials.
- Crafting materials are stored only. Recipe, crafting, and upgrading logic are outside this increment.
- The skill UI reserves five stars per skill. All skills start at one star; no star-upgrade flow is included.
- Runtime VFX are implemented in Three.js, not baked into the GLB.
- The Blender source retains only the Warrior, rig, sword, and required animations. True duplicate actions may be removed.

## User experience

### First run

1. Load the minimum assets required for class selection.
2. Show the class-selection screen with one available card: Guerreiro.
3. Confirming the class creates a versioned local profile with the sword equipped, an empty backpack, empty armor slots, and five level-one skills.
4. Continue to the lobby.

If the saved profile is missing, malformed, or from an unsupported schema version, create a clean profile instead of failing startup.

### Lobby

The lobby uses a dark medieval presentation inspired by the supplied references without copying their branding or artwork. It contains:

- A rotatable and zoomable 3D Warrior preview in an idle pose.
- Equipment slots for helmet, chest, gloves, pants, boots, and sword.
- A 30-slot backpack with filters for all items, equipment, crafting materials, and consumables.
- A summary of the five skills, each with five star positions.
- Navigation tabs for Hero, Inventory, Skills, and Workshop. Workshop is a disabled/coming-later destination because crafting belongs to another system.
- A primary `Iniciar partida` action.

The preview reuses the loaded Warrior asset through a clone and owns a separate scene, camera, controls, animation mixer, and disposal lifecycle. It must not create duplicate network downloads or leak WebGL resources when entering the game.

### Gameplay HUD

- `ATK` or the existing primary attack input triggers `ataque_basico`.
- Buttons and keyboard keys `1` through `5` trigger the five skills.
- Every button has an authored icon, its keyboard shortcut, energy cost, and a radial or masked cooldown overlay.
- Disabled states distinguish cooldown, insufficient energy, player death, and paused UI.
- The blue energy bar displays current and maximum energy and updates continuously.
- The animation test panel is development-only and must not appear in the normal player UI.

### Inventory and loot in the world

- `I` opens the inventory overlay and pauses simulation.
- `E` interacts with a nearby loot container.
- A loot interaction presents equipment on the left, container contents in the center, and the backpack on the right while the 3D world remains visible and dimmed behind the interface.
- The player can transfer one item or take all items.
- If the backpack cannot accept an item or complete stack, the remainder stays in the container and a visible message explains that the backpack is full.
- Closing the overlay restores the previous gameplay state without applying a large accumulated frame delta.
- Equipment can move between compatible backpack and equipment slots. Armor without a supplied 3D wearable asset changes inventory state and stats only; it does not fabricate geometry on the model.
- The initial sword is a valid weapon item and is equipped in the weapon slot when a new profile is created.

## Combat and skill specification

The maximum energy is 50. Energy regenerates at 6 points per second after a one-second delay from the most recent skill activation. The basic attack does not spend energy.

| Input | Animation clip | Runtime presentation | Energy | Cooldown | Speed |
|---|---|---|---:|---:|---:|
| ATK / primary attack | `ataque_basico` | Blue-cyan blade trail | 0 | 0.45 s | Approximately `1.45x` |
| 1 | `ataque_giratorio` | Green circular arc and sparks | 8 | 2.5 s | `1.0x`-`1.2x` |
| 2 | `ataque_giratorio_2` | Magenta-violet circular arc | 10 | 3.5 s | `1.0x`-`1.2x` |
| 3 | `pulo_atacando` | Gold trail and ground impact | 14 | 5.0 s | `1.0x`-`1.2x` |
| 4 | `triplo_ataque` | Fire, sparks, and smoke | 18 | 7.0 s | `1.0x`-`1.2x` |
| 5 | `corte_duplo` | Violet trails and orange burst | 16 | 6.0 s | `1.0x`-`1.2x` |

For each skill, final time scale is chosen within the approved range so contact frames, locomotion lock, damage windows, and VFX remain synchronized. It must never exceed `1.2x`.

Each attack definition owns normalized timing windows:

- wind-up start/end;
- damage start/end;
- trail start/end;
- optional impact time;
- recovery end;
- post-effect fade duration.

The trail is visible throughout the authored swing and fades for `0.4` to `0.8` seconds after the final blade sample. Damage is applied only during the configured damage window. Repeated overlap with the same target during one attack activation must not apply duplicate damage unless the skill explicitly defines multiple hits, as `triplo_ataque` and `corte_duplo` do.

## VFX implementation

The existing `SwordTrail` becomes one renderer within a broader Warrior VFX system:

- A ribbon trail samples the blade base and tip in a stable player-local coordinate space.
- Additively blended sprites provide sparks, embers, smoke, and impact flashes.
- Ground impact meshes provide rings and short-lived decals without permanent scene objects.
- Per-skill profiles define palette, emission rate, lifetime, size, turbulence, trail width, impact style, and fade duration.
- Particle and impact objects are pooled and reset between uses.
- VFX failure never blocks damage, input recovery, or the next animation.

The external texture source is the official Kenney Particle Pack, licensed CC0. Only the textures actually used are copied into the project, with a small attribution/source note kept alongside the assets. Color textures use sRGB; alpha masks remain in a non-color space. The runtime uses Three.js sprite materials and additive blending where appropriate.

## Blender and GLB work

The connected Blender file is `C:\Users\pteix\Downloads\personagem HD\personagem_final.blend`. The exported game asset is `public/models/Guerreiro/guerreiro_animado.glb`.

Before changing the file:

1. Inspect the object hierarchy, active armature, sword object, modifiers, constraints, action list, NLA tracks, bone names, frame ranges, and current export state.
2. Save a recoverable backup of the source and current GLB without leaving multiple ambiguous final copies.
3. Identify duplicate actions by animation data, not by similar names alone.

Sword correction rules:

- Keep the sword driven by the right-hand bone or a dedicated weapon socket parented to it.
- Correct grip position and rotation so the palm encloses the handle across idle, movement, and all six attacks.
- Review every offensive action over its full frame range for body penetration, hand separation, flipped orientation, and abnormal offsets.
- Where an animation naturally brings the hands together, use a temporary left-hand IK or constraint target on the grip, then bake the result to animation keyframes before export.
- Do not force the left hand onto the sword during intentional one-handed moves.
- Preserve deformation and the existing animation names required by the game.

The export includes the character mesh, armature, sword, and eleven required clips, with compatible transforms and animation sampling. Runtime code must not attach a second visible sword when the exported asset already contains the corrected one. The exported file replaces `guerreiro_animado.glb` only after validation succeeds.

## Architecture

### `GameFlowController`

Owns transitions among:

- `class-select`
- `lobby`
- `loading-game`
- `playing`
- `paused-inventory`
- `paused-loot`
- existing terminal states such as victory and death

It is the sole authority for pausing simulation, switching visible UI, and determining which input context is active.

### `PlayerProfileStore`

Persists a versioned JSON document in local storage containing:

- schema version;
- selected class;
- equipped item identifiers by slot;
- backpack item stacks;
- five skill star levels;
- future-safe optional settings.

Reads validate every field and fall back to a clean profile on corruption. Writes happen after class confirmation and inventory/equipment changes, not every animation frame.

### `InventoryStore`

Owns slot capacity, stacking, transfers, equipping, unequipping, and serialization. UI screens consume immutable snapshots and dispatch commands. World containers retain their unclaimed contents until successfully transferred.

### `WarriorSkillController`

Owns energy, regeneration delay, cooldown timers, availability checks, and skill activation events. It does not render UI or VFX and depends on a small player-combat port.

### `WarriorAnimationController`

Owns the six offensive actions, approved time scales, blending, action completion, and normalized timing events. It replaces the current behavior that compresses every attack into a sub-half-second combo stage.

### `WarriorVfxController`

Subscribes to animation timing events and configures pooled trails, particles, and impacts. The VFX controller is presentation-only.

### UI screens

- `ClassSelectScreen` is narrowed to the available Warrior and becomes first-run only.
- `LobbyScreen` owns the 3D preview and lobby tabs.
- `GameplayHUD` owns health, energy, attack, and five skill buttons.
- `InventoryOverlay` renders equipment and backpack views.
- `LootOverlay` composes equipment, container, and backpack views.

The current monolithic `HUD` can remain as a facade while these focused views are extracted behind it. This limits disruption to existing `Game` callers.

## Data flow

### Skill activation

`InputManager/UI button -> WarriorSkillController -> Player/WarriorAnimationController -> normalized animation events -> damage window and WarriorVfxController -> HUD snapshots`

The controller rejects an activation when the game is paused, the player is dead, energy is insufficient, the skill is cooling down, or another uninterruptible attack owns the player.

### Loot transfer

`World interaction -> GameFlowController pause -> LootOverlay command -> InventoryStore transfer -> container remainder/profile persistence -> UI snapshot`

### Lobby start

`Profile load/create -> LobbyScreen preview -> Iniciar partida -> dispose preview resources -> create gameplay player from same character definition -> equip initial sword -> begin current wave progression`

## Removal and compatibility

- `InitialEquipmentCoordinator` and its reward-selection UI leave the startup path.
- No initial reward chest is spawned.
- Existing later-run rewards remain untouched unless they depend directly on the removed initial-choice callback.
- The legacy Dragon Miner asset is no longer a selectable or startup player, but unrelated files are not deleted solely for cleanup.
- Existing enemies, waves, boss logic, admin controls, camera, and movement remain behaviorally unchanged.

## Error handling

- If the Warrior model fails to load, the lobby shows a blocking retryable error and does not start an invisible player.
- If an optional VFX texture fails, use a procedural soft particle fallback and log one warning; combat continues.
- If local profile JSON is invalid, quarantine/replace it with a fresh schema-v1 profile.
- If inventory persistence fails, keep the in-memory state, warn visibly once, and allow the current session to continue.
- If a loot transfer is partial, update both inventories atomically for the accepted quantity and retain the remainder.
- Opening or closing a paused overlay resets the game clock delta to prevent movement, cooldown, AI, or physics jumps.
- Inputs are routed by active state so movement and attacks cannot leak through lobby or inventory clicks.

## Performance and asset budgets

- Target smooth 60 FPS at 1080p on a typical desktop WebGL-capable GPU, with graceful reduction of particle density on slower devices.
- Cap device pixel ratio at the existing maximum of 2.
- Pool transient VFX objects and cap the live particle count per attack profile.
- Load one compact particle texture atlas instead of many independent full-resolution images.
- Dispose lobby render targets, mixers, controls, and cloned materials when leaving the lobby.
- Keep VFX outside the GLB so visual tuning does not duplicate geometry or animation data.
- Validate the exported GLB size and report the final byte size; optimization must not remove required animations, rig data, sword, or visible material quality.

## Testing and verification

### Unit tests

- Profile schema validation, migration fallback, and serialization.
- Inventory capacity, stack merging, partial transfer, equip compatibility, and full-backpack behavior.
- Skill cost, cooldown, regeneration delay, pause behavior, and rejection reasons.
- Attack definition ordering and the `<= 1.2x` invariant for all five skills.
- Multi-hit deduplication and damage-window timing.
- VFX profile mapping, lifecycle, pool reuse, fade duration, and optional-texture fallback.
- Game-state transition legality and input routing.

### Integration tests

- First run opens class selection and creates a Warrior profile.
- Returning run skips class selection and opens the lobby.
- Starting a run equips exactly one sword and does not spawn the initial reward chest.
- Opening inventory or loot pauses AI, movement, attacks, cooldowns, and wave timers.
- Closing an overlay resumes without a large delta step.
- Every button and keyboard shortcut triggers its matching animation and VFX profile.

### Blender and asset validation

- Inspect all eleven exported clip names and durations.
- Verify the sword exists once, follows the right hand, and remains aligned across sampled frames.
- Verify intended two-hand grip contact on the applicable clips.
- Run a GLB validator and confirm there are no missing external resources.
- Load the final GLB through the game asset pipeline before replacing the prior runtime assumption.

### Browser validation

- Verify class selection, lobby, responsive layout, 3D rotation/zoom, inventory filters, loot transfer, and all button states.
- Exercise mouse and keyboard flows at desktop and narrow viewport sizes.
- Capture visual evidence for each VFX color profile in the running game.
- Run typecheck, the complete automated test suite serially, and a production build.

## Acceptance criteria

The increment is complete when:

1. A fresh browser profile selects the Warrior once and reaches the lobby.
2. A returning profile opens the lobby without class selection.
3. The game starts with one correctly aligned sword and no initial weapon chest.
4. Basic attack is fast; no skill animation exceeds `1.2x`.
5. Five skill buttons, energy costs, cooldowns, icons, and five-star displays work as specified.
6. Each of the six attacks shows its approved colored, long-lived VFX in WebGL.
7. Inventory and loot overlays pause and resume the game safely.
8. Equipment, a 30-slot backpack, material storage, container transfer, and persistence behave correctly.
9. The Blender/GLB asset preserves the required clips and corrects one-hand and two-hand sword handling.
10. Tests, typecheck, production build, GLB validation, and browser verification pass, with any remaining asset/performance limitations reported explicitly.

## Explicit non-goals

- Craft recipes, crafting stations, or item upgrading.
- Additional playable classes.
- Online accounts, cloud saves, multiplayer inventory synchronization, or a backend database.
- Copying proprietary UI art or proprietary VFX from the visual references.
- Creating missing 3D armor meshes without supplied assets.
