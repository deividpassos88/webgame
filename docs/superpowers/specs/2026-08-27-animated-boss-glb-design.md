# Animated Boss GLB and Skill Integration Design

## Objective

Replace the procedural final boss with one optimized animated GLB built from the compatible FBX files in `public/models/Boss`, then synchronize its animations with the four existing dodgeable boss skills. Also increase regular-enemy base speed to 2.8 and mini-boss base speed to 5.6.

## Source Assets

The Blender 5.2 inspection confirmed that every FBX contains one armature with 81 bones:

- `Boss parado.fbx`: principal mesh, rig, materials, textures, and idle animation.
- `Running.fbx`: running animation.
- `atacando.fbx`: meteor attack animation.
- `atacando2.fbx`: dash attack animation.
- `morrendo.fbx`: death animation.
- `pulando.fbx`: circular explosion jump.
- `pulando atacando.fbx`: rectangular attack jump.

The main mesh has approximately 12,626 polygons. Most source size comes from three packed 2048×2048 textures, not geometry.

## Blender Assembly

Use `Boss parado.fbx` as the sole mesh and skeleton. Import each animation FBX temporarily, copy its Action to the main armature, rename it, then remove the temporary armature, mesh, material, and other duplicate data.

The final Actions are:

| Source | Action name |
|---|---|
| `Boss parado.fbx` | `idle` |
| `Running.fbx` | `running` |
| `atacando.fbx` | `attack_meteors` |
| `atacando2.fbx` | `attack_dash` |
| `morrendo.fbx` | `death` |
| `pulando.fbx` | `jump_circle` |
| `pulando atacando.fbx` | `jump_rectangle` |

All Actions must be retained with fake users or NLA stashes so Blender exports every clip. Horizontal root displacement must be neutralized relative to each clip's first frame, while vertical jump motion remains intact. This prevents the rendered model from moving independently of the Three.js entity root or snapping back when a clip ends.

Before saving and exporting, clean the principal mesh with a conservative `Merge by Distance` threshold and remove loose vertices. The cleanup must not merge visibly distinct seams, change the armature, or alter skin weights materially.

Save the full-resolution source as:

- `public/models/Boss/Boss-completo.blend`

The `.blend` retains the original-resolution packed textures, rig, mesh, and all seven Actions.

## GLB Optimization

Export the runtime model as:

- `public/models/Boss/Boss.glb`

Optimization order:

1. Export only the principal mesh and armature.
2. Enable Draco mesh compression and animation sampling.
3. Remove unused Blender data from the exported scene.
4. Export WebP runtime textures at 1024×1024 with a balanced quality setting.
5. If useful without visible damage, reduce runtime textures to 512×512 or lower WebP quality.

Three megabytes is a soft target, not a hard acceptance condition. Rig integrity, readable textures, and correct animations take priority. A larger valid GLB may be delivered and optimized again locally or with a specialized external optimizer later. The full-resolution `.blend` must never be degraded by runtime texture processing.

## Runtime Architecture

Add a boss asset store that loads `/models/Boss/Boss.glb` through the same Draco- and Meshopt-capable GLTF loader pattern used by regular enemies. Loading happens before wave gameplay begins. The store clones the skinned scene and clips for the final-boss instance.

Create a boss-specific animation controller rather than adding boss-only state to the regular-monster animation controller. It owns the animation mixer and exposes:

- looping `idle` and `running` locomotion;
- scheduled one-shot skill animations;
- one-shot `death`;
- update and cleanup behavior.

The final boss remains compatible with `CombatEntityRegistry` and the existing health, collision, damage, skill, death, and disposal flows. If the GLB fails to load, log the failure and use the current procedural boss so the run remains playable.

## Skill Synchronization

The red telegraph always begins immediately and lasts three seconds. Each Action is scheduled so its decisive ending aligns with the gameplay impact:

| Skill | Animation | Gameplay impact |
|---|---|---|
| Circle | `jump_circle` | 23 damage at landing inside the 17.5 m radius |
| Rectangle | `jump_rectangle` | 24 damage at the final strike inside the 120 × 12 m area |
| Meteors | `attack_meteors` | 9 damage at meteor impact points |
| Dash | `attack_dash` | 13 damage when the 0.2 s dash reaches its endpoint |

If an Action is shorter than three seconds, it starts late enough to finish at impact. If it is longer, its time scale increases only enough to fit the warning. The controller returns to `running` while the boss chases during its five-second recovery and to `idle` when stationary. Skills remain random with no immediate repetition.

The death Action plays before the existing burn-and-ash particle removal effect.

## Enemy Speed Adjustment

- Regular enemy base speed: 2.2 → 2.8.
- Mini-boss base speed: 4.4 → 5.6.
- Existing wave speed multipliers continue to apply after these base values.

## Verification

Blender verification:

- main armature still has 81 bones;
- only one runtime mesh and armature remain;
- cleaned mesh has no loose vertices or near-identical duplicates at the approved threshold;
- all seven Actions exist with nonzero frame ranges;
- saved `.blend` reopens correctly;
- exported GLB reimports with the skinned mesh and seven named clips;
- GLB size is reported, with 3 MB treated as a soft goal.

Game verification:

- unit tests cover boss asset loading, clip mapping, scheduling, locomotion, death, fallback, and new enemy speeds;
- each telegraph and visual animation matches its real damage area and impact time;
- horizontal clip motion does not move or snap the entity root;
- random skills remain dodgeable and do not repeat immediately;
- full tests, TypeScript typecheck, and production build pass.

## Scope Boundaries

No boss damage, telegraph duration, skill geometry, wave composition, weapon values, reward values, or camera behavior changes are included beyond the explicitly approved speed and animated-boss work.
