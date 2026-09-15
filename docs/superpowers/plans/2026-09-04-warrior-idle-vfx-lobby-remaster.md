# Warrior Idle, VFX and Lobby Remaster Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Warrior idle, eliminate T-pose exposure, add stronger licensed VFX and multi-target skill damage, and rebuild the lobby as a bright medieval forge.

**Architecture:** Blender remains the source of rig, sword, markers and animation clips. The GLB exports authored animation and markers, while Three.js owns pooled WebGL VFX, area targeting and the lobby presentation. Combat geometry, VFX geometry and UI state share typed profiles so the displayed area matches actual damage.

**Tech Stack:** Blender 5.2 LTS Python API, FBX/glTF 2.0, TypeScript, Three.js, HTML/CSS, Vitest, Vite.

**Spec:** `docs/superpowers/specs/2026-09-04-warrior-idle-vfx-lobby-remaster-design.md`

## Global Constraints

- Preserve `C:\Users\pteix\Downloads\personagem HD\personagem_final.blend` until a verified backup exists.
- Import idle from `C:\Users\pteix\Downloads\personagem HD\Idle_sword.fbx`.
- Export only to `public/models/Guerreiro/guerreiro_animado.glb` after candidate validation passes.
- Final GLB contains 12 unique named animations: the existing 11 plus `idle_sword`.
- Skill playback rate never exceeds `1.2`; basic attack retains its current fast rate.
- Skill damage is sword damage plus exactly 1 per timeline hit; basic attack is unchanged.
- Only CC0 or equivalently redistributable assets with a written source record may enter `public/`.
- Blender preview helpers are excluded from the gameplay GLB.
- VFX uses fixed pools and does not allocate geometry or materials in the frame loop.
- The workspace has no Git metadata, so each task ends with a test/backup checkpoint rather than a commit.

---

### Task 1: Blender idle import and deterministic animation sanitation

**Files:**
- Create: `scripts/blender/remaster_warrior_idle.py`
- Create: `scripts/blender/audit_warrior_actions.py`
- Modify: `C:\Users\pteix\Downloads\personagem HD\personagem_final.blend`
- Create backup: `C:\Users\pteix\Downloads\personagem HD\personagem_final.pre-remaster-20260904.blend`

**Interfaces:**
- Consumes: `Idle_sword.fbx`, target object `Armature`, 57-bone Mixamo rig.
- Produces: Action `idle_sword`, 12 sanitized Actions, JSON audit result from `audit_warrior_actions.py`.

- [ ] **Step 1: Audit source and target without modifying the file**

  Run `audit_warrior_actions.py` through Blender MCP. For every action, sample every integer frame and return: action name, frame range, keyed pose-bone count, non-finite transforms, maximum left/right upper-arm elevation, and frames whose arm configuration is within 8 degrees of the rig rest T-pose.

- [ ] **Step 2: Create the backup before mutation**

  Use Blender `bpy.ops.wm.save_as_mainfile()` to create the exact backup, verify it opens in a background Blender process, then restore the active file path to `personagem_final.blend`. Abort rather than overwrite an existing backup with different size.

- [ ] **Step 3: Import and retarget the idle**

  In `remaster_warrior_idle.py`, import the FBX into a temporary collection, locate its armature and Action by datablock ownership, verify compatible bone names after colon/case normalization, copy its pose transforms onto the existing `Armature`, remove horizontal root motion, and bake frames at 30 fps into `idle_sword`. Delete only the temporary imported objects and collection.

- [ ] **Step 4: Bake complete pose channels**

  For each of the 12 Actions, evaluate its original action at every integer frame and key `location`, `rotation_quaternion` and `scale` for every deforming pose bone into a replacement action. Use the evaluated pose, never the armature rest pose, for missing channels. Preserve the existing two-hand sword-contact corrections.

- [ ] **Step 5: Remove T-pose exposure and isolate NLA**

  Replace Actions atomically, keep one NLA strip per Action with matching name, mute all strips except the one under audit, and ensure extrapolation cannot reveal the bind pose. The audit must return zero non-finite values and zero T-pose-like frames for `idle_sword` and the six attacks.

- [ ] **Step 6: Create a Blender VFX preview collection**

  Create `VFX_PREVIEW` containing emissive ribbon/impact planes parented to `VFX_SwordBase`, `VFX_SwordTip` and `VFX_Impact`. Mark the collection `hide_render=True` and exclude it from GLB export. It is a positioning preview only.

- [ ] **Step 7: Save and verify the master file**

  Save `personagem_final.blend`, reopen it in a background process, and rerun the audit. Expected: 12 unique Actions including `idle_sword`, one Armature, one sword parented to `mixamorig:RightHand`, and three sword marker children.

---

### Task 2: Export contract and runtime idle mapping

**Files:**
- Modify: `src/characters/CharacterCatalog.ts`
- Modify: `src/characters/CharacterAnimations.test.ts`
- Modify: `src/characters/PlayableCharacter.test.ts`
- Modify: `scripts/validate-warrior-glb.mjs`
- Test: `src/characters/CharacterAnimations.test.ts`

**Interfaces:**
- Consumes: native `idle_sword` GLB clip.
- Produces: `clipMap.idle === 'idle_sword'`; validator requiring the 12-clip contract.

- [ ] **Step 1: Write the failing idle-resolution test**

  Add `rotationClip('idle_sword', true)` to the Paladin fixture and assert:

  ```ts
  const clips = resolveCharacterClips('paladin', source());
  expect(clips.idle?.name).toBe('paladin:idle');
  expect(clips.idle?.duration).toBe(1);
  ```

  Also change the playable-character expectation to require `clipMap.idle` as `idle_sword` and no `idlePoseSource` fallback.

- [ ] **Step 2: Run the tests and verify RED**

  Run: `npx vitest run src/characters/CharacterAnimations.test.ts src/characters/PlayableCharacter.test.ts`  
  Expected: failure because Paladin still derives idle from `caminhando`.

- [ ] **Step 3: Map the native idle**

  Set `clipMap.idle: 'idle_sword'` in the Paladin definition and remove `idlePoseSource: 'caminhando'`. Keep `inPlaceAxes` so horizontal drift is removed.

- [ ] **Step 4: Strengthen GLB validation**

  Add `idle_sword` to `requiredAnimations`, require exactly 12 animations, and assert that `VFX_PREVIEW` is absent from exported node names. Keep the existing exact sword-parent and marker-parent checks.

- [ ] **Step 5: Export a candidate and validate before replacement**

  Export selected objects and all Actions to `C:\Users\pteix\Downloads\personagem HD\guerreiro_animado.remaster-candidate.glb`. Run the validator against the candidate; only after `{ "ok": true }` replace the public GLB and rerun validation there.

- [ ] **Step 6: Run focused tests**

  Run: `npx vitest run src/characters/CharacterAnimations.test.ts src/characters/PlayableCharacter.test.ts src/entities/PlayerAuthoredWarrior.integration.test.ts`  
  Expected: all pass.

---

### Task 3: Typed skill-area and damage policy

**Files:**
- Create: `src/combat/WarriorSkillArea.ts`
- Create: `src/combat/WarriorSkillArea.test.ts`
- Modify: `src/combat/WarriorSkillCatalog.ts`
- Modify: `src/combat/WarriorSkillController.test.ts`

**Interfaces:**
- Produces: `WarriorSkillAreaDefinition`, `getWarriorSkillArea(id)`, `isPointInWarriorSkillArea(origin, forward, point, definition)`, and `getWarriorSkillDamage(baseDamage): number`.
- Consumes later: Game area-hit resolution and VFX area indicator.

- [ ] **Step 1: Write failing geometry and damage tests**

  Cover the exact contract:

  ```ts
  expect(getWarriorSkillArea('ataque_giratorio')).toMatchObject({ shape: 'circle', radius: 3.4 });
  expect(getWarriorSkillArea('ataque_giratorio_2')).toMatchObject({ shape: 'circle', radius: 3.8 });
  expect(getWarriorSkillArea('pulo_atacando')).toMatchObject({ shape: 'impact', radius: 4.2 });
  expect(getWarriorSkillArea('triplo_ataque')).toMatchObject({ shape: 'arc', radius: 4, angleDegrees: 140 });
  expect(getWarriorSkillArea('corte_duplo')).toMatchObject({ shape: 'arc', radius: 3.6, angleDegrees: 125 });
  expect(getWarriorSkillDamage(18)).toBe(19);
  ```

  Add inside/outside boundary cases for circles and arcs using `THREE.Vector3`.

- [ ] **Step 2: Run the new test and verify RED**

  Run: `npx vitest run src/combat/WarriorSkillArea.test.ts`  
  Expected: module-not-found failure.

- [ ] **Step 3: Implement the pure policy**

  Store immutable definitions keyed by `WarriorSkillId`. Ignore vertical distance, normalize forward vectors safely, compare squared distance for circles, and use dot-product cosine thresholds for arcs. Return `Math.max(0, baseDamage) + 1` for finite base damage.

- [ ] **Step 4: Expose area metadata in the catalog**

  Keep cooldown, cost and playback rate unchanged. Add tests proving all five skill speeds remain between 1 and 1.2.

- [ ] **Step 5: Run focused tests**

  Run: `npx vitest run src/combat/WarriorSkillArea.test.ts src/combat/WarriorSkillController.test.ts`  
  Expected: all pass.

---

### Task 4: Multi-target skill damage integration

**Files:**
- Modify: `src/entities/Player.ts`
- Modify: `src/core/Game.ts`
- Create: `src/core/WarriorAreaDamage.test.ts`
- Create: `src/core/WarriorAreaDamage.ts`
- Modify: `src/entities/PlayerCombo.integration.test.ts`

**Interfaces:**
- `Player.onWarriorSkillHit(callback: (event: { attackId: WarriorSkillId; hitIndex: number; origin: Vector3; forward: Vector3 }) => void): void`
- `resolveWarriorAreaTargets(records, event, area): CombatRecord[]`
- Game applies `getWarriorSkillDamage(player.attackDamage)` to each returned living enemy.

- [ ] **Step 1: Write the failing target-selection tests**

  Build living/dead records at known coordinates. Assert circles hit all living records in radius, arcs exclude enemies behind the player, impact uses the forward impact center, and duplicate object roots are returned once.

- [ ] **Step 2: Run the new test and verify RED**

  Run: `npx vitest run src/core/WarriorAreaDamage.test.ts`  
  Expected: module-not-found failure.

- [ ] **Step 3: Implement selection as a pure function**

  Filter dead records, use `isPointInWarriorSkillArea`, retain boss HUD compatibility, and return deterministic registry order.

- [ ] **Step 4: Emit skill-hit context from Player**

  On each `WarriorAttackController` hit event, emit attack ID, hit index, root world position and normalized facing. Basic combo continues using `onAttackHitCallback` and keeps current single-target damage.

- [ ] **Step 5: Apply area damage in Game**

  Register the skill callback after Player load. For each resolved record, apply base sword damage plus 1, show one floating number, update boss health when relevant, and call existing death handling. Do not add the run kill bonus twice.

- [ ] **Step 6: Verify multiple timeline hits**

  Add a regression test proving `triplo_ataque` may hit the same enemy once at each of its three hit indices but not twice at one index.

- [ ] **Step 7: Run combat regression tests**

  Run: `npx vitest run src/core/WarriorAreaDamage.test.ts src/entities/PlayerCombo.integration.test.ts src/combat/WarriorAttackController.test.ts src/combat/WarriorAttackTimeline.test.ts`  
  Expected: all pass.

---

### Task 5: Acquire and document licensed visual assets

**Files:**
- Modify: `public/vfx/warrior/SOURCE.md`
- Create/replace selected PNG files under: `public/vfx/warrior/`
- Create: `public/ui/lobby/SOURCE.md`
- Create selected WebP/JPG/PNG files under: `public/ui/lobby/`

**Interfaces:**
- VFX URLs consumed by `SwordTrail.loadTextureAssets()`.
- Lobby URLs consumed by CSS custom properties/background layers.

- [ ] **Step 1: Download only from verified CC0 source pages**

  Use [Kenney Particle Pack](https://kenney.nl/assets/particle-pack), [Kenney Smoke Particles](https://kenney.nl/assets/smoke-particles), [Kenney UI Pack RPG Expansion](https://kenney.nl/assets/ui-pack-rpg-expansion), and the 1K maps from [Poly Haven Medieval Wall 02](https://polyhaven.com/a/medieval_wall_02). Do not use search-result thumbnails or hotlink remote assets at runtime.

- [ ] **Step 2: Select a minimal asset set**

  Keep one soft glow, one spark, one slash/noise mask, one impact mask, one fire/flame sheet, one smoke texture, one 1K stone diffuse, one 1K normal map, and the smallest set of UI border/button slices needed by the design.

- [ ] **Step 3: Optimize and inspect transparency**

  Keep VFX textures at 512×512 or smaller and lobby textures at 1024×1024 or smaller. Preserve alpha, use sRGB only for color maps, and visually inspect every output. Reject blank, opaque-background or corrupt images.

- [ ] **Step 4: Write complete source manifests**

  For each retained file record local filename, original pack/page URL, author/provider, `CC0 1.0`, download date `2026-09-04`, and any conversion performed.

- [ ] **Step 5: Verify runtime independence**

  Run `rg -n "https?://" src public --glob '!**/SOURCE.md'` and ensure no new runtime dependency points at the source sites.

---

### Task 6: Long-lived layered sword and fire VFX

**Files:**
- Modify: `src/effects/WarriorAttackVfxProfiles.ts`
- Modify: `src/effects/WarriorAttackVfxProfiles.test.ts`
- Modify: `src/effects/SwordTrail.ts`
- Modify: `src/effects/SwordTrail.test.ts`
- Modify: `src/effects/WarriorVfxController.test.ts`
- Create: `src/effects/WarriorSkillAreaIndicator.ts`
- Create: `src/effects/WarriorSkillAreaIndicator.test.ts`

**Interfaces:**
- `WarriorAttackVfxProfile` gains trail length/fade/fire/area presentation settings.
- `SwordTrail` loads `flame` in addition to spark, smoke, slash and impact.
- `WarriorSkillAreaIndicator.show(id, origin, forward)` and `.update(delta)` render the combat policy area.

- [ ] **Step 1: Write failing profile-budget tests**

  Require at least 32 ribbon segments, skill fade durations between 0.9 and 1.4 seconds, stronger skill particle counts than the basic attack, and `triplo_ataque.fire === true`. Require pool ceilings of at most 160 sparks, 64 smoke particles and 48 flame sprites.

- [ ] **Step 2: Run VFX tests and verify RED**

  Run: `npx vitest run src/effects/WarriorAttackVfxProfiles.test.ts src/effects/SwordTrail.test.ts`  
  Expected: failures on the new trail/fire requirements.

- [ ] **Step 3: Extend the fixed buffers**

  Increase ribbon history from 18 to 36 segments, add a second core ribbon material over the existing colored edge, and add fixed typed arrays for flame sprite position, velocity, lifetime and size. Reuse vectors and arrays inside update paths.

- [ ] **Step 4: Load and apply the new textures**

  Extend `WarriorVfxTextures` with `flame`. Set wrapping/filtering deliberately, assign additive blending to core/sparks/fire and alpha blending to smoke. Texture failure returns `false` and preserves procedural fallbacks.

- [ ] **Step 5: Strengthen each skill identity**

  Keep blue/basic, green/spin, purple/arcane, gold/jump, orange-red/flame and purple-orange/double-cut identities. Give skills wider ribbons, 0.9–1.4 second fade, larger impact flashes and directional emission. Only `triplo_ataque` emits sustained flames and dense smoke.

- [ ] **Step 6: Implement the area indicator**

  Prebuild circle and arc geometries using the exact `WarriorSkillArea` values. Fade the emissive decal with depth write disabled and keep it visible only during the damage window.

- [ ] **Step 7: Test lifecycle and cancellation**

  Assert cancel, hit reaction, death, unequip and dispose hide both ribbons, fire, particles, impact and area indicator. Assert repeated activation retains the same geometry/material objects.

- [ ] **Step 8: Run focused VFX tests**

  Run: `npx vitest run src/effects/WarriorAttackVfxProfiles.test.ts src/effects/SwordTrail.test.ts src/effects/WarriorVfxController.test.ts src/effects/WarriorSkillAreaIndicator.test.ts`  
  Expected: all pass.

---

### Task 7: Bright medieval-forge lobby rebuild

**Files:**
- Modify: `index.html`
- Modify: `src/style.css`
- Modify: `src/ui/LobbyScreen.ts`
- Create: `src/ui/LobbyPresentation.ts`
- Create: `src/ui/LobbyPresentation.test.ts`
- Create: `src/ui/LobbyScreen.test.ts`

**Interfaces:**
- `prepareLobbyModel(model): { hiddenWeaponCount: number }`
- `LobbyPresentation.enter(renderer)` stores renderer exposure/tone mapping; `.leave(renderer)` restores both.
- Lobby continues consuming `buildRpgUiViewModel()` for equipment, backpack and five skill cards.

- [ ] **Step 1: Write failing presentation tests**

  Create a model with nodes named `sword`, `Axe`, `weapon_socket` and `personagem`; assert only weapon nodes become invisible. Assert entering lobby raises exposure and leaving restores the exact prior value. Assert missing textures do not throw.

- [ ] **Step 2: Run the new tests and verify RED**

  Run: `npx vitest run src/ui/LobbyPresentation.test.ts src/ui/LobbyScreen.test.ts`  
  Expected: module-not-found or missing-behavior failure.

- [ ] **Step 3: Rebuild semantic markup**

  Add a decorative forge frame, Warrior crest, stronger tab rail, framed equipment cells, central stage layers, attribute plaques and a primary start plate. Retain six equipment slots, 30 backpack cells, five skill cards/five stars and the disabled workshop tab.

- [ ] **Step 4: Implement the visual system**

  Use stone texture, warm radial firelight, brushed-metal borders, leather/burnished panels and restrained vignette. Define distinct hover, active, pressed, disabled and focus-visible states. Keep text contrast at least 4.5:1.

- [ ] **Step 5: Correct the 3D preview**

  Hide every weapon node in the cloned lobby model, play only resolved `idle_sword`, remove the artificial emissive-map override from the preview, and use warm key, neutral fill and cool rim lighting. Restore gameplay renderer settings in `dispose()`.

- [ ] **Step 6: Add keyboard-equivalent preview control**

  Make the hero stage focusable. Arrow Left/Right rotate by 12 degrees; Arrow Up/Down adjusts zoom within the existing 4.7–8.2 bounds. Keep pointer drag and wheel behavior.

- [ ] **Step 7: Preserve responsive usability**

  At widths below 900 px stack equipment, stage and details without horizontal overflow. Keep the start button reachable, all tabs keyboard accessible and inventory grids scrollable inside their panel.

- [ ] **Step 8: Run lobby and flow tests**

  Run: `npx vitest run src/ui/LobbyPresentation.test.ts src/ui/LobbyScreen.test.ts src/core/GameFlowController.test.ts src/core/GameAssetPhases.test.ts src/ui/RpgUiViewModel.test.ts`  
  Expected: all pass.

---

### Task 8: Blender and WebGL visual QA loop

**Files:**
- Create QA outputs under: `.codex-artifacts/warrior-remaster/`
- Modify only the Task 1–7 files when a verified defect requires correction.

**Interfaces:**
- Consumes: final Blender file, candidate GLB, Vite dev server.
- Produces: contact sheets/screenshots and an acceptance checklist; QA artifacts are not copied to `public/`.

- [ ] **Step 1: Render animation contact sheets in Blender**

  Render `idle_sword` at start/middle/end and each six attacks at anticipation/contact/recovery. Use front and three-quarter cameras. Inspect arms, hands, feet, sword and silhouette; any T-pose frame fails the task.

- [ ] **Step 2: Inspect all 12 clips continuously**

  Play every Action through at least two loops or through completion. Test crossfades idle→run→idle, idle→each skill→idle, hit→idle and death. Record zero bind-pose flashes.

- [ ] **Step 3: Validate desktop lobby visually**

  In the in-app browser at 1920×1080 and 1366×768, verify original character textures, bright face/body, no visible weapon, readable panels, attractive button states and stable idle looping.

- [ ] **Step 4: Validate mobile layout**

  At 390×844, verify `scrollWidth <= innerWidth`, keyboard/focus order, reachable start action and scrollable inventory/skills panels.

- [ ] **Step 5: Validate all skills in combat**

  Spawn clustered enemies with admin controls. Activate skills 1–5, capture each damage window, verify area indicator matches damaged targets, confirm sword damage 18 becomes 19 for skills, and confirm basic remains 18.

- [ ] **Step 6: Profile runtime stability**

  Repeat each skill 20 times. Confirm no rising scene object/geometry/material counts after effects expire, no persistent invisible draw calls, no console errors and no frame-time regression beyond the existing monitor threshold.

---

### Task 9: Final verification and delivery gate

**Files:**
- Verify: `public/models/Guerreiro/guerreiro_animado.glb`
- Verify: all files changed in Tasks 1–8.

- [ ] **Step 1: Run GLB validation**

  Run: `npm run validate:warrior-glb`  
  Expected: `ok: true`, 12 animations, one skin, exactly one correctly parented sword, all three markers, no external URI and no `VFX_PREVIEW` node.

- [ ] **Step 2: Run the complete automated suite**

  Run: `npm test`  
  Expected: every test file and test passes with zero failures.

- [ ] **Step 3: Run typecheck and production build**

  Run: `npm run build`  
  Expected: TypeScript success and Vite production build success. Record any non-fatal chunk-size warning separately.

- [ ] **Step 4: Inspect production asset size**

  Report GLB size, VFX/UI texture totals and generated JS/CSS gzip sizes. Confirm decorative assets do not unexpectedly duplicate source archives in `dist/`.

- [ ] **Step 5: Perform final browser acceptance**

  Load the production-equivalent page from a clean reload, pass class/lobby/game flow, activate all five skills, open inventory and verify desktop/mobile layouts. Capture final lobby and VFX screenshots.

- [ ] **Step 6: Deliver only after evidence is current**

  Report exact test totals, build result, validator result, output paths, licenses and any remaining non-blocking warning. Do not claim 100% while a required acceptance item remains unverified.
