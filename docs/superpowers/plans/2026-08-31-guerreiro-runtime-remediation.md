# Runtime Warrior Final Remediation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the final-review runtime correctness, complete-budget, combat/trail and hot-path allocation defects before re-running visual acceptance.

**Architecture:** Preserve the generated body as the source-local shared-skeleton visual, but make shader injection valid GLSL and treat the equipped sword/trail as part of the same hard rendering budget. The Player exposes weapon-specific combat behavior; FramePerformanceMonitor returns one reusable report buffer. Browser WebGL smoke evidence is recorded only after shader code is validated by the real renderer.

**Tech Stack:** TypeScript, Three.js r161, Vitest, Vite, WebGL browser smoke validation.

**Spec:** `docs/superpowers/specs/2026-08-31-guerreiro-runtime-threejs-design.md`

## Global Constraints

- Keep GLB skeleton/clips and transactional fallback; no new external assets, loaders or packages.
- Preserve exactly seven shared PBR role definitions and four maximum normalized skin influences.
- The complete equipped procedural warrior, including the active sword trail, must use no more than eight rendering draw calls.
- No Vector3, geometry, material, Mesh or array allocation from new per-frame hot paths.
- Sword owns the rapid three-stage combo and trail; axe retains its own configured single-strike/cooldown behavior.
- Browser evidence must distinguish a genuine GPU smoke result from an unavailable foreground FPS benchmark.

---

### Task 1: Valid PBR injection, role roughness/bump behavior and GPU smoke evidence

**Files:**
- Modify: `src/characters/RuntimeWarriorMaterials.ts`
- Modify: `src/characters/RuntimeWarriorMaterials.test.ts`
- Create: `artifacts/procedural-warrior/shader-smoke.md` (after real browser pass)

**Interfaces:**
- Keep `getRuntimeWarriorMaterials(): RuntimeWarriorMaterialLibrary`.
- Each compiled material must retain standard shader anchors and only valid GLSL statements/comments.

- [ ] **Step 1: Write failing source-level shader tests.** Assert injected shaders have no bare marker line, preserve `#include <skinning_vertex>`, inject bounded `roughnessFactor` variation after the roughness chunk and a normalized derivative-safe normal perturbation after normal-map processing. Assert leather/steel strengths are distinct and nonzero.
- [ ] **Step 2: Run `npm test -- src/characters/RuntimeWarriorMaterials.test.ts` and record the expected raw-marker/roughness/bump failure.**
- [ ] **Step 3: Replace marker-only insertion with a GLSL comment anchor and inject valid code.** Keep `dFdx/dFdy` guarded by derivative extension; clamp roughness, calculate a finite tangent-free derivative perturbation, and apply `normalize` only to the existing normal variable. Do not inject pseudo-GLSL labels.
- [ ] **Step 4: Re-run the focused test, then run the local Vite game and record browser console shader-error absence in `shader-smoke.md`.**

### Task 2: Complete equipped-warrior draw budget and zero-extra-draw runtime sword

**Files:**
- Modify: `src/characters/RuntimeWarriorFactory.ts`
- Modify: `src/characters/RuntimeWarriorFactory.test.ts`
- Modify: `src/characters/RuntimeWarriorBudget.ts`
- Modify: `src/characters/RuntimeWarriorBudget.test.ts`
- Modify: `src/characters/RuntimeWarriorWeapon.ts`
- Modify: `src/characters/RuntimeWarriorWeapon.test.ts`
- Modify: `src/entities/Player.ts`
- Modify: `src/equipment/WeaponAttachment.ts`
- Modify: relevant tests

**Interfaces:**
- Extend `RuntimeWarriorVisual` with `setRuntimeSwordEquipped(equipped: boolean): void` and a complete cached report.
- Keep public reward factory `createRuntimeWarriorSword()` for fallback attachment; the mounted visual path uses its merged, right-hand-skinned render geometry instead of adding draw calls.

- [ ] **Step 1: Write failing tests that count renderable meshes for body + equipped sword + active trail and reject more than eight calls.** Also prove a mounted runtime sword toggles visible only after reward and remains rigid to right hand under the shared skeleton.
- [ ] **Step 2: Run relevant factory/budget/weapon/Player tests and record the existing 16/17-call failure.**
- [ ] **Step 3: Implement a merged runtime sword segment in the existing dark-metal skinned role.** Append right-hand weighted blade geometry in the source rest frame, retain sword vertices through a dedicated per-vertex visibility attribute, and use a dark-metal shader uniform/discard toggle. The reward marks visual sword equipped without attaching the multi-mesh fallback group. Fallback GLB still uses the existing procedural group.
- [ ] **Step 4: Include the active trail one-call allowance in the complete report, prove body+sword+trail is at most eight calls, and run focused tests.**

### Task 3: Weapon-specific combat, seeded directed trail and allocation-free monitor output

**Files:**
- Modify: `src/entities/Player.ts`
- Modify: `src/entities/PlayerCombo.integration.test.ts`
- Modify: `src/effects/SwordTrail.ts`
- Modify: `src/effects/SwordTrail.test.ts`
- Modify: `src/core/FramePerformanceMonitor.ts`
- Modify: `src/core/FramePerformanceMonitor.test.ts`

**Interfaces:**
- `SwordTrail.setStageDirection(stage: number): void` stores one of three fixed directional signs without allocation.
- `FramePerformanceMonitor.sample()` may retain its array signature but returns one stable internal array valid until the next sample.

- [ ] **Step 1: Write failing tests.** Axe has only one hit per cooldown/request (no automatic stages 1/2); sword has the existing triple combo. First active trail update seeds every segment at the blade rather than zero origin and stage directions differ. Consecutive no-report monitor calls return the same empty buffer identity.
- [ ] **Step 2: Run focused tests and record expected failures.**
- [ ] **Step 3: Restrict continuation/trail activation to sword; give axe its single existing-timing action/damage path.** Seed the fixed trail history on activation, select stage directions from constants, and reuse the monitor array after clearing its length.
- [ ] **Step 4: Run focused suites, serialized whole suite, typecheck and build.**

### Task 4: Final visual and performance evidence

**Files:**
- Update: `artifacts/procedural-warrior/runtime-preview.png`
- Update: `artifacts/procedural-warrior/runtime-metrics.json`
- Update: `artifacts/procedural-warrior/runtime-acceptance.md`

- [ ] **Step 1: Repeat local browser chest → sword → attack route and inspect console for shader compilation errors.**
- [ ] **Step 2: Capture an equipped runtime-sword/trail image and record exact construction budget.**
- [ ] **Step 3: Attempt visible foreground 60-second desktop measurement; mark only that criterion BLOCKED if foreground capability remains unavailable.**
- [ ] **Step 4: Perform final independent review and verify fresh serialized tests/typecheck/build before reporting results.**
