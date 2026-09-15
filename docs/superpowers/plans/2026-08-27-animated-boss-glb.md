# Animated Boss GLB Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. The user explicitly prohibited subagents. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build one animated boss GLB from the seven compatible FBX files, integrate its named animations with the existing boss skills, and increase regular/mini-boss movement speeds.

**Architecture:** A reproducible Blender 5.2 Python pipeline assembles and cleans the full-resolution `.blend`, then exports a runtime GLB with a soft 3 MB target. The game loads and clones that GLB through a dedicated asset store, while a boss-specific mixer implements locomotion, delayed skill cues, and death without changing the regular-monster animation policy.

**Tech Stack:** Blender 5.2 Python API, FBX/glTF 2.0, Three.js r161, TypeScript, Vitest, Vite.

**Spec:** `docs/superpowers/specs/2026-08-27-animated-boss-glb-design.md`

## Global Constraints

- Do not use subagents.
- `Boss-completo.blend` retains original-resolution packed textures and all seven Actions.
- `Boss.glb` targets 3 MB, but animation/rig correctness and acceptable texture quality take priority.
- Apply conservative Merge by Distance and remove loose vertices without damaging UV seams or weights.
- Keep boss damage, skill geometry, three-second telegraphs, wave counts, rewards, weapons, and camera unchanged.
- Preserve vertical jump motion and remove horizontal clip displacement.
- The workspace has no Git repository; replace commit steps with explicit verification checkpoints.

---

### Task 1: Approved Enemy Speeds

**Files:**
- Modify: `src/waves/WaveEnemyFactory.test.ts`
- Modify: `src/waves/WaveEnemyFactory.ts`

**Interfaces:**
- Produces regular `EnemyOptions.speed = 2.8 * speedMultiplier`.
- Produces mini-boss `EnemyOptions.speed = 5.6 * speedMultiplier`.

- [ ] **Step 1: Change the factory test first**

Assert these hand-calculated results for `speedMultiplier = 1.06`:

```ts
expect(first.speed).toBeCloseTo(3.024, 6); // regular: 2.8 × 1.08
expect(options.speed).toBe(5.936);         // mini: 5.6 × 1.06
```

- [ ] **Step 2: Verify RED**

Run: `npm test -- --run src/waves/WaveEnemyFactory.test.ts`

Expected: FAIL because current results are 2.376 and 4.664.

- [ ] **Step 3: Change the base speed and mini-boss multiplier**

```ts
const REGULAR_BASE = {
  hp: 50,
  damage: 8,
  scale: 0.7,
  detectionRange: 22,
  attackRange: 2.2,
  speed: 2.8,
} as const;
// createMiniBossOptions
speed: Number((REGULAR_BASE.speed * 2 * speedMultiplier).toFixed(6)),
```

- [ ] **Step 4: Verify GREEN**

Run: `npm test -- --run src/waves/WaveEnemyFactory.test.ts`

Expected: 4 tests pass.

---

### Task 2: Reproducible Blender Assembly and Export

**Files:**
- Create: `tools/build_boss_asset.py`
- Create: `tools/inspect_boss_asset.py`
- Create: `public/models/Boss/Boss-completo.blend`
- Create: `public/models/Boss/Boss.glb`

**Interfaces:**
- `build_boss_asset.py -- <source-dir>` consumes the seven named FBX files.
- Produces one blend with Actions `idle`, `running`, `attack_meteors`, `attack_dash`, `death`, `jump_circle`, `jump_rectangle`.
- Produces one GLB containing one armature, the principal skinned mesh, and the same seven clips.

- [ ] **Step 1: Implement inspection failure checks before the builder**

`inspect_boss_asset.py` must exit nonzero unless all checks pass:

```py
EXPECTED = {
    "idle", "running", "attack_meteors", "attack_dash",
    "death", "jump_circle", "jump_rectangle",
}
armatures = [o for o in bpy.context.scene.objects if o.type == "ARMATURE"]
meshes = [o for o in bpy.context.scene.objects if o.type == "MESH"]
names = {action.name for action in bpy.data.actions}
assert len(armatures) == 1
assert len(armatures[0].data.bones) == 81
assert len(meshes) >= 1
assert EXPECTED <= names
assert all(action.frame_range[1] > action.frame_range[0]
           for action in bpy.data.actions if action.name in EXPECTED)
```

- [ ] **Step 2: Run inspection to verify RED**

Run:

```powershell
& 'C:\Program Files\Blender Foundation\Blender 5.2\blender.exe' --background --python tools/inspect_boss_asset.py -- public/models/Boss/Boss.glb
```

Expected: FAIL because `Boss.glb` does not exist yet.

- [ ] **Step 3: Implement FBX assembly**

Use the exact mapping:

```py
ACTION_FILES = {
    "idle": "Boss parado.fbx",
    "running": "Running.fbx",
    "attack_meteors": "atacando.fbx",
    "attack_dash": "atacando2.fbx",
    "death": "morrendo.fbx",
    "jump_circle": "pulando.fbx",
    "jump_rectangle": "pulando atacando.fbx",
}
```

Import the idle FBX first and retain its armature/mesh. For every remaining FBX, import into a temporary collection, locate its single armature Action, copy it, assign the approved name, set `use_fake_user = True`, then delete every temporary object and duplicate datablock.

- [ ] **Step 4: Neutralize horizontal displacement and retain vertical jump**

For location F-curves targeting the armature object or hips/root bone, subtract the first keyframe value from the two horizontal channels for every Action. Do not change the vertical channel. Preserve keyframe handles after translating values.

- [ ] **Step 5: Clean the principal mesh**

For each retained mesh:

```py
bpy.context.view_layer.objects.active = mesh
mesh.select_set(True)
bpy.ops.object.mode_set(mode="EDIT")
bpy.ops.mesh.select_all(action="SELECT")
bpy.ops.mesh.remove_doubles(threshold=0.0001)
bpy.ops.mesh.delete_loose(use_verts=True, use_edges=True, use_faces=False)
bpy.ops.object.mode_set(mode="OBJECT")
```

Record vertex counts before/after and abort if more than 2% of vertices disappear.

- [ ] **Step 6: Save the full-resolution blend before runtime optimization**

Pack external resources and save:

```py
bpy.ops.file.pack_all()
bpy.ops.wm.save_as_mainfile(filepath=str(source_dir / "Boss-completo.blend"))
```

- [ ] **Step 7: Export the runtime GLB**

Work on copied runtime images, resize to 1024×1024, then export selected armature/mesh with animations and Draco:

```py
bpy.ops.export_scene.gltf(
    filepath=str(source_dir / "Boss.glb"),
    export_format="GLB",
    use_selection=True,
    export_animations=True,
    export_force_sampling=True,
    export_draco_mesh_compression_enable=True,
    export_draco_mesh_compression_level=6,
)
```

If the GLB exceeds 3 MB, try 512×512 runtime image copies once. Keep the smaller result only if inspection still passes; otherwise restore the valid 1024 result. Never resave the optimized image state over `Boss-completo.blend`.

- [ ] **Step 8: Inspect blend and GLB**

Run `inspect_boss_asset.py` once for each artifact. Expected: one 81-bone armature, principal mesh, seven nonempty Actions/clips. Print blend size, GLB size, vertices before/after cleanup, and clip frame ranges.

---

### Task 3: Boss Asset Store

**Files:**
- Create: `src/entities/BossAssetStore.test.ts`
- Create: `src/entities/BossAssetStore.ts`

**Interfaces:**
- Consumes `Boss.glb` at `/models/Boss/Boss.glb`.
- Produces `load(): Promise<void>`, `hasBoss(): boolean`, `createBossVisual(): RegularEnemyVisual`, and `getError(): unknown`.

- [ ] **Step 1: Write failing load/clone/failure tests**

Use a fake `EnemyModelLoader` returning a real Three.js group, a skinned-compatible child, and seven literal `AnimationClip` names. Verify separate calls clone both skeleton scene and clips. Verify rejected loading keeps `hasBoss()` false and exposes the original error.

- [ ] **Step 2: Verify RED**

Run: `npm test -- --run src/entities/BossAssetStore.test.ts`

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement the store using the existing loader pattern**

Extract and export `createModelLoader()` from `EnemyAssetStore.ts` so both stores share Draco and Meshopt setup. Load exactly `/models/Boss/Boss.glb`; clone with `SkeletonUtils.clone`; clone every clip.

- [ ] **Step 4: Verify GREEN**

Run: `npm test -- --run src/entities/BossAssetStore.test.ts src/waves/EnemyAssetStore.test.ts`

Expected: both test files pass.

---

### Task 4: Boss Animation Controller and Enemy Animation Port

**Files:**
- Create: `src/entities/BossAnimationController.test.ts`
- Create: `src/entities/BossAnimationController.ts`
- Modify: `src/entities/Enemy.ts`
- Modify: `src/entities/EnemyAnimationController.ts`
- Modify: `src/entities/EnemyAnimationController.test.ts`
- Modify: `src/entities/Boss.ts`
- Modify: `src/waves/WaveEnemyFactory.test.ts`

**Interfaces:**
- Produce `EnemyAnimator` with `update`, `play`, `playNextAttack`, `playDeath`, `state`, `deathDuration`, and optional `scheduleSkill(skill, secondsUntilImpact)`.
- Produce `Enemy.playSkillAnimation(skill: BossSkillKind, secondsUntilImpact: number): boolean`.
- Change `createBoss(position, visual?)` to construct a visual boss with `BossAnimationController` when an asset is available, while retaining procedural fallback.

- [ ] **Step 1: Write failing controller tests**

Tests must prove:

```ts
expect(controller.play('idle')).toBe(true);
expect(controller.play('running')).toBe(true);
expect(controller.scheduleSkill('circle', 3)).toBe(true);
expect(controller.scheduleSkill('rectangle', 3)).toBe(true);
expect(controller.scheduleSkill('meteors', 3)).toBe(true);
expect(controller.scheduleSkill('dash', 3)).toBe(true);
expect(controller.playDeath()).toBeGreaterThan(0);
```

With a 0.6-second `jump_circle`, assert it stays pending for 2.4 seconds and begins for the final 0.6 seconds. With a 4-second `jump_rectangle`, assert its effective time scale is `4 / 3`. Assert running requests cannot interrupt an active skill or death.

- [ ] **Step 2: Verify RED**

Run: `npm test -- --run src/entities/BossAnimationController.test.ts`

Expected: FAIL because the controller does not exist.

- [ ] **Step 3: Introduce the animator interface without changing regular behavior**

Move the shared behavioral surface to `EnemyAnimator`, make `EnemyAnimationController` implement it, and let `Enemy` accept an optional animator factory:

```ts
export type EnemyAnimatorFactory = (
  model: THREE.Group,
  clips: readonly THREE.AnimationClip[]
) => EnemyAnimator;
```

Default to the current regular controller. Add `playSkillAnimation` as a guarded optional call.

- [ ] **Step 4: Implement boss clip mapping and scheduling**

Use exact mappings:

```ts
const SKILL_CLIPS = {
  circle: 'jump_circle',
  rectangle: 'jump_rectangle',
  meteors: 'attack_meteors',
  dash: 'attack_dash',
} as const;
```

Prepare clips with `makeClipInPlace` for X/Z, loop idle/running, use LoopOnce for skill/death, and implement delayed starts plus long-clip time scaling.

- [ ] **Step 5: Wire the factory fallback**

`createBoss(position, visual)` passes `visual` and the boss animator factory when present. Without `visual`, return the current procedural `Enemy` with the approved 1400 HP, 11 damage, 1.9 m attack range, and 2.4 speed.

- [ ] **Step 6: Verify GREEN and regular regressions**

Run:

```powershell
npm test -- --run src/entities/BossAnimationController.test.ts src/entities/EnemyAnimationController.test.ts src/entities/EnemyAnimation.test.ts src/waves/WaveEnemyFactory.test.ts
```

Expected: all pass.

---

### Task 5: Game Loading and Skill Cues

**Files:**
- Modify: `src/core/Game.ts`
- Modify: `src/entities/BossSkillController.test.ts`
- Modify: `src/entities/BossSkillController.ts`

**Interfaces:**
- Game owns `BossAssetStore` and includes it in initial asset loading.
- `BossSkillEvent` retains type/skill/origin/target data and adds `secondsUntilImpact: number`; Game forwards it to `boss.playSkillAnimation`.

- [ ] **Step 1: Add a failing event-timing test**

Assert a newly emitted telegraph carries `secondsUntilImpact: 3`, while its later impact event carries `secondsUntilImpact: 0`. This gives Game an explicit animation-scheduling contract without changing damage timing.

- [ ] **Step 2: Verify RED for the integration expectation**

Run: `npm test -- --run src/entities/BossSkillController.test.ts`

Expected: FAIL because `secondsUntilImpact` is absent.

- [ ] **Step 3: Load boss assets during startup**

Add `bossProgress` to the existing loading calculation and include `bossAssets.load()` in `Promise.all`. A load error logs a warning but does not abort startup.

- [ ] **Step 4: Spawn the animated boss or fallback**

```ts
const visual = this.bossAssets.hasBoss()
  ? this.bossAssets.createBossVisual()
  : undefined;
const boss = createBoss(layout.boss, visual);
```

- [ ] **Step 5: Schedule the matching animation on each telegraph**

Inside `updateBossSkills`, before passing the event to effects:

```ts
if (event.type === 'telegraph') {
  boss.playSkillAnimation(event.skill, event.secondsUntilImpact);
}
this.bossEffects.handle(event);
```

Keep the existing random choice, no-repeat logic, damage checks, five-second recovery, and dash motion unchanged.

- [ ] **Step 6: Verify focused integration**

Run:

```powershell
npm test -- --run src/entities/BossSkillController.test.ts src/entities/BossAnimationController.test.ts src/effects/BossSkillEffects.test.ts src/waves/CombatEntityRegistry.test.ts
npm run typecheck
```

Expected: all focused tests and TypeScript pass.

---

### Task 6: End-to-End Verification

**Files:**
- Verify: `public/models/Boss/Boss-completo.blend`
- Verify: `public/models/Boss/Boss.glb`
- Verify: all modified TypeScript and tests

**Interfaces:**
- Consumes every deliverable from Tasks 1–5.
- Produces verified runtime assets and a production build.

- [ ] **Step 1: Run Blender artifact inspection again**

Expected: blend and GLB contain one valid rig, expected mesh, and all seven nonempty animations. Report exact file sizes.

- [ ] **Step 2: Run the full automated suite**

Run: `npm test`

Expected: zero failed test files and zero failed tests.

- [ ] **Step 3: Run the production build**

Run: `npm run build`

Expected: TypeScript and Vite exit 0. The existing large-chunk advisory is non-blocking.

- [ ] **Step 4: Browser smoke test**

Start `npm run dev`, load the game, choose a weapon, reach or invoke the final-boss test route/state, and verify:

- GLB boss is visible with correct materials;
- idle and running do not snap the boss root;
- circle uses `jump_circle` and lands at impact;
- rectangle uses `jump_rectangle` and strikes at impact;
- meteors use `attack_meteors`;
- dash uses `attack_dash` and moves only through game-controlled root motion;
- death uses `death`, then burn/ash particles;
- failed GLB loading still spawns the procedural boss.

- [ ] **Step 5: Report final evidence**

Report Blender version, bone count, mesh count, vertex cleanup delta, seven clip names/ranges, blend size, GLB size, full test count, and build result.
