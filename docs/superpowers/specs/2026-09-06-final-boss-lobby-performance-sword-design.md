# Final Boss, Lobby, Performance, and Sword Design

## Goal

Deliver a desktop-WebGL run loop in which the Warrior carries the authored Blender sword, combat immunity matches the approved values, the final boss mixes melee and authored area skills at every relevant range, final rewards show their real item art, and victory returns automatically to a status-capable lobby without runtime stalls.

## Approved gameplay contract

- Basic attack grants 0.4 seconds of action invulnerability.
- Every Warrior skill grants 1 second of action invulnerability.
- A successful ordinary hit grants 0.2 seconds of post-hit anti-stunlock protection.
- Action invulnerability blocks regular, mini-boss, and boss-skill damage.
- Buffered basic-combo stages do not renew action invulnerability.
- Boss melee range must not reset or suppress circle, rectangle, or meteor scheduling.
- Final reward presentation precedes an automatic lobby transition.
- New character attributes start at zero with 100 unspent points.

## Blender asset contract

- Source blend: `C:/Users/pteix/Downloads/personagem HD/personagem_final.blend`.
- New sword source: `C:/Users/pteix/Downloads/personagem HD/sword/sword.fbx` (already imported as `Mesh_0`).
- Preserve all 13 named animation actions and the Mixamo armature.
- The exported sword is a single object named `sword`, parented to `mixamorig:RightHand`.
- Its transform is authored in bone-local space, with grip centred in the right palm and the blade extending away from the hand.
- No duplicate runtime sword and no Warrior trail/VFX objects are exported.
- Export destination: `public/models/Guerreiro/guerreiro_animado.glb`.

## Loot and end-of-run flow

- HUD backpack, lobby backpack, and final-reward notification use the same item-art renderer.
- Craft PNG assets are shown with rarity framing and accessible item labels.
- After the chest opening/collapse completes, rewards settle exactly once.
- The reward panel remains visible for 5 seconds, then the game tears down the active run and re-enters the lobby without a page reload.
- Persisted inventory and confirmed attributes survive the transition.

## Lobby Status tab

- Interface job: distribute the Warrior's 100 initial attribute points.
- Reuse the existing `PlayerProfile` attribute state and derivation formulas; no duplicate lobby-only state.
- Show Strength, Attack, Defense, Agility, Critical Attack, Critical Magic, and Dodge at zero for a fresh profile.
- Support +1, +5, undo, reset-before-confirmation, derived-stat preview, and one-time confirmation.
- Preserve already confirmed builds; do not silently wipe saved allocations.
- Visual system: Cinzafogo dark steel, transparent charcoal panels, restrained gold lower borders, Cinzel titles, Inter body, JetBrains Mono numerics.
- Palette: `#080A0D`, `#171A20`, `#C9973E`, `#F1D28A`, `#E8E2D6`, `#A63A32`.
- Every interactive state has visible keyboard focus; reduced motion removes decorative transitions.

## Boss combat coordination

- `follow` may pause skill scheduling while the boss closes distances above 15 metres.
- `melee`, `ranged`, and an already-started `casting` state continue updating the skill controller.
- Melee attacks and skill cooldowns are independent clocks.
- A telegraphed cast locks the boss long enough to complete its warning and impact, then returns control to movement/melee.

## Runtime performance design

- The player light radius becomes 18 metres.
- Torch meshes remain visible, but dynamic torch lights activate only near the player, with hysteresis to prevent flicker at the boundary.
- Directional shadow resolution becomes 1024 and the shadow volume follows the playable vicinity.
- The 624,833-triangle chest is replaced or simplified to a desktop-WebGL budget below 20,000 triangles.
- Health-plasma and enemy-death transient meshes/materials/lights use shared resources or pooling instead of creating and disposing GPU resources for every kill.
- Renderer diagnostics retain texture, geometry, triangle, and long-frame counts so a fresh run can prove the improvement.
- The Warrior model is not aggressively decimated unless post-fix profiling still identifies it as a bottleneck; its animation fidelity has priority.

## Acceptance criteria

- All targeted and full Vitest suites pass.
- TypeScript typecheck and Vite production build pass.
- Warrior GLB validator reports all required gameplay and lobby animations plus the embedded sword.
- Blender inspection confirms one sword, right-hand bone parenting, no missing files, and 13 actions.
- Browser verification shows real loot art, working lobby Status tab, automatic victory-to-lobby transition, and keyboard focus.
- A desktop gameplay run confirms boss melee plus skills and no multi-second chest-spawn stall.
- Desktop-only product: mobile gameplay support is intentionally absent.

Real rendered desktop and mobile screenshots reviewed before Sol acceptance. Mobile is not applicable to this desktop-only product; desktop screenshots are required.

Complete no-mouse traversal and active prefers-reduced-motion: reduce emulation completed before Sol acceptance.
