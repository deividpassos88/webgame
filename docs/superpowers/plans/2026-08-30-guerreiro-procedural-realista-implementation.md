# Guerreiro Procedural Realista Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Gerar por código um guerreiro medieval realista, integrá-lo como personagem inicial e entregar locomoção fluida e um combo de espada rápido de três golpes.

**Architecture:** Um pipeline Blender/Python determinístico importa a armature e os clipes atuais, substitui todas as malhas visuais por anatomia, roupas, armadura e espada procedurais, valida o skinning e exporta GLBs. No runtime, módulos TypeScript isolados resolvem fallback de ativo, clipes do combo, janelas de dano e rastro da espada sem mover regras de combate para o renderizador.

**Tech Stack:** Blender 5.2 Python API, Python 3, glTF/GLB, TypeScript 5.4, Three.js 0.161, Vitest 4, Vite 5.

**Spec:** `docs/superpowers/specs/2026-08-30-guerreiro-procedural-realista-design.md`

## Global Constraints

- O guerreiro é original; não copiar rosto, traje ou ativos de Geralt ou de *The Witcher 3*.
- Preservar os 65 ossos e os clipes `Idle`, `Walking`, `Running`, `Reaction`, `AttackHorizontal`, `JumpAttack` e `Death`.
- Limitar cada vértice skinned a quatro influências normalizadas.
- Preservar `public/models/guerreiro/Guerreiro.glb` como fallback recuperável.
- Exportar `public/models/guerreiro/ProceduralWarrior.glb` e `public/models/guerreiro/ProceduralSword.glb` somente após validação bem-sucedida.
- Cada golpe do combo deve durar de 0,32 a 0,45 segundo e atingir cada alvo no máximo uma vez por estágio.
- Não criar alocações recorrentes relevantes no update por frame.
- Manter 60 FPS no cenário de referência ou documentar que não houve regressão material em relação ao ativo anterior.
- Blender: `C:\Program Files\Blender Foundation\Blender 5.2\blender.exe`; não está no `PATH`.
- A pasta atual não é um repositório Git. Não inicializar Git sem autorização; commits são condicionais a `git rev-parse --is-inside-work-tree` retornar sucesso.

## File Structure

- `tools/procedural_warrior/config.py`: medidas, nomes e limites compartilhados.
- `tools/procedural_warrior/mesh.py`: primitivas, perfis, UVs e limpeza de malha.
- `tools/procedural_warrior/anatomy.py`: corpo, cabeça, rosto, cabelo e mãos.
- `tools/procedural_warrior/wardrobe.py`: roupa, armadura, bainha e espada.
- `tools/procedural_warrior/materials.py`: materiais PBR procedurais.
- `tools/procedural_warrior/rigging.py`: transferência/refino de pesos e placas rígidas.
- `tools/procedural_warrior/animation.py`: preservação e criação dos ataques adicionais.
- `tools/procedural_warrior/export.py`: validação transacional e exportação.
- `tools/build_procedural_warrior.py`: orquestrador CLI.
- `tools/test_procedural_warrior.py`: testes dentro do Blender.
- `tools/validate_procedural_warrior.py`: reimportação, métricas e renders.
- `src/characters/CharacterAssetStore.ts`: ativo principal e fallback.
- `src/characters/CharacterCatalog.ts`: caminhos e nomes dos clipes.
- `src/characters/CharacterAnimations.ts`: resolução dos três ataques.
- `src/combat/SwordComboController.ts`: máquina de estados pura do combo.
- `src/effects/SwordTrail.ts`: rastro reutilizável da lâmina.
- `src/effects/SwordImpactEffect.ts`: impacto visual com pool fixo.
- `src/entities/Player.ts`: integração de animação, combo e dano.
- `src/entities/PlayerLocomotion.ts`: aceleração e desaceleração determinísticas.
- `src/equipment/EquipmentCatalog.ts`: espada procedural.
- `src/equipment/WeaponAttachment.ts`: acesso ao objeto equipado.

---

### Task 1: Fallback transacional do personagem

**Files:**
- Modify: `src/characters/CharacterCatalog.ts`
- Modify: `src/characters/CharacterAssetStore.ts`
- Modify: `src/core/Game.ts`
- Create: `src/characters/CharacterAssetStore.test.ts`

**Interfaces:**
- Produces: `CharacterDefinition.fallbackModelPath?: string`.
- Produces: `CharacterModelLoader.loadAsync(path: string): Promise<GLTF>`.
- Produces: `getFallbackWarning(id): unknown`, usado por `Game` para registrar a falha primária.
- Preserves: `loadAll`, `has`, `getError`, `createModel`.

- [ ] **Step 1: Write the failing fallback tests**

```ts
import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { CharacterAssetStore } from './CharacterAssetStore';
import type { CharacterDefinition } from './CharacterCatalog';

const definition: CharacterDefinition = {
  id: 'paladin', name: 'Guerreiro',
  modelPath: '/models/guerreiro/ProceduralWarrior.glb',
  fallbackModelPath: '/models/guerreiro/Guerreiro.glb',
  gameScale: 0.9, previewScale: 0.9, clipMap: { idle: 'Idle' },
};
const gltf = { scene: new THREE.Group(), animations: [] } as unknown as GLTF;

it('uses the procedural asset when primary loading succeeds', async () => {
  const loader = { loadAsync: vi.fn().mockResolvedValue(gltf) };
  const store = new CharacterAssetStore(loader);
  await store.loadAll(undefined, [definition]);
  expect(loader.loadAsync).toHaveBeenCalledTimes(1);
  expect(store.has('paladin')).toBe(true);
  expect(store.getFallbackWarning('paladin')).toMatchObject({ primary: expect.any(Error) });
});

it('uses the preserved GLB when procedural loading fails', async () => {
  const loader = { loadAsync: vi.fn()
    .mockRejectedValueOnce(new Error('primary'))
    .mockResolvedValueOnce(gltf) };
  const store = new CharacterAssetStore(loader);
  await store.loadAll(undefined, [definition]);
  expect(loader.loadAsync.mock.calls.map(([path]) => path)).toEqual([
    definition.modelPath, definition.fallbackModelPath,
  ]);
  expect(store.has('paladin')).toBe(true);
});

it('retains both errors when both assets fail', async () => {
  const loader = { loadAsync: vi.fn()
    .mockRejectedValueOnce(new Error('primary'))
    .mockRejectedValueOnce(new Error('fallback')) };
  const store = new CharacterAssetStore(loader);
  await store.loadAll(undefined, [definition]);
  expect(store.has('paladin')).toBe(false);
  expect(store.getError('paladin')).toMatchObject({
    primary: expect.any(Error), fallback: expect.any(Error),
  });
});
```

- [ ] **Step 2: Run the test and confirm the constructor/type failures**

Run: `npm test -- src/characters/CharacterAssetStore.test.ts`

Expected: FAIL because `fallbackModelPath`, loader injection and composite failure do not exist.

- [ ] **Step 3: Add the loader contract and two-stage load**

```ts
export interface CharacterModelLoader {
  loadAsync(path: string): Promise<GLTF>;
}
export interface CharacterLoadFailure { primary: unknown; fallback?: unknown }

constructor(private readonly loader: CharacterModelLoader = createDefaultLoader()) {}

private async loadDefinition(definition: CharacterDefinition): Promise<GLTF> {
  try {
    return await this.loader.loadAsync(definition.modelPath);
  } catch (primary) {
    if (!definition.fallbackModelPath) throw { primary } satisfies CharacterLoadFailure;
    try {
      return await this.loader.loadAsync(definition.fallbackModelPath);
    } catch (fallback) {
      throw { primary, fallback } satisfies CharacterLoadFailure;
    }
  }
}
```

Move the current DRACO/Meshopt setup into `createDefaultLoader()` and call `loadDefinition` from `loadAll`. Store the primary error in a warning map only when fallback succeeds; clear it on primary success. After character loading, `Game.start()` logs that warning through `Logger.warn('Game:Character', ...)` without treating it as fatal.

- [ ] **Step 4: Run focused tests and typecheck**

Run: `npm test -- src/characters/CharacterAssetStore.test.ts && npm run typecheck`

Expected: PASS.

- [ ] **Step 5: Record checkpoint**

If Git exists: `git add src/characters/CharacterCatalog.ts src/characters/CharacterAssetStore.ts src/characters/CharacterAssetStore.test.ts` then `git commit -m "feat: add procedural character fallback"`. Otherwise record `Task 1 PASS` and do not initialize Git.

---

### Task 2: Núcleo geométrico procedural

**Files:**
- Create: `tools/procedural_warrior/__init__.py`
- Create: `tools/procedural_warrior/config.py`
- Create: `tools/procedural_warrior/mesh.py`
- Create: `tools/test_procedural_warrior.py`

**Interfaces:**
- Produces: `WarriorDimensions`, `BuildLimits`, `ring_points`, `loft_mesh`, `assert_mesh_valid`.

- [ ] **Step 1: Write a failing deterministic geometry test**

```python
import pathlib, sys, bpy
ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "tools"))
from procedural_warrior.mesh import loft_mesh, assert_mesh_valid

bpy.ops.wm.read_factory_settings(use_empty=True)
profile = [(0.00, .17, .13), (.28, .22, .16), (.62, .27, .19), (.94, .20, .15)]
torso = loft_mesh("TestTorso", profile, radial_segments=16)
assert len(torso.data.vertices) == 64
assert len(torso.data.polygons) == 50
assert_mesh_valid(torso)
print("PROCEDURAL_WARRIOR_TEST_OK")
```

- [ ] **Step 2: Run and confirm missing module**

Run: `& 'C:\Program Files\Blender Foundation\Blender 5.2\blender.exe' --background --python tools\test_procedural_warrior.py`

Expected: FAIL with `No module named 'procedural_warrior'`.

- [ ] **Step 3: Implement typed configuration**

```python
from dataclasses import dataclass

@dataclass(frozen=True)
class WarriorDimensions:
    height: float = 1.85
    shoulder_width: float = 0.49
    chest_depth: float = 0.25
    waist_width: float = 0.34
    head_height: float = 0.235
    hand_length: float = 0.19

@dataclass(frozen=True)
class BuildLimits:
    max_influences: int = 4
    minimum_weight: float = 0.001
    merge_distance: float = 0.00005
    body_radial_segments: int = 24
```

- [ ] **Step 4: Implement lofting and validation**

```python
def loft_mesh(name, profile, radial_segments=24):
    vertices = [p for z, rx, ry in profile for p in ring_points(z, rx, ry, radial_segments)]
    faces = []
    for ring in range(len(profile) - 1):
        for i in range(radial_segments):
            a = ring * radial_segments + i
            b = ring * radial_segments + (i + 1) % radial_segments
            faces.append((a, b, b + radial_segments, a + radial_segments))
    faces += [tuple(reversed(range(radial_segments))),
              tuple((len(profile)-1)*radial_segments+i for i in range(radial_segments))]
    data = bpy.data.meshes.new(name)
    data.from_pydata(vertices, [], faces)
    data.update(calc_edges=True)
    obj = bpy.data.objects.new(name, data)
    bpy.context.collection.objects.link(obj)
    return obj

def assert_mesh_valid(obj):
    if obj.type != "MESH" or not obj.data.vertices or not obj.data.polygons:
        raise RuntimeError(f"{obj.name}: empty mesh")
    if obj.data.validate(clean_customdata=True):
        raise RuntimeError(f"{obj.name}: invalid mesh data")
```

- [ ] **Step 5: Run twice and compare results**

Expected both runs: `PROCEDURAL_WARRIOR_TEST_OK`, 64 vertices and 50 polygons.

- [ ] **Step 6: Record checkpoint**

Conditional commit: `feat: add procedural warrior geometry core`.

---

### Task 3: Anatomia, rosto, cabelo e mãos

**Files:**
- Create: `tools/procedural_warrior/anatomy.py`
- Modify: `tools/test_procedural_warrior.py`

**Interfaces:**
- Produces: `AnatomyParts` and `build_anatomy(armature, source_body, dimensions)`.

- [ ] **Step 1: Add failing anatomy tests**

```python
from procedural_warrior.anatomy import build_anatomy
source = pathlib.Path("public/models/guerreiro/Guerreiro.glb").resolve()
bpy.ops.import_scene.gltf(filepath=str(source))
armature = next(o for o in bpy.context.scene.objects if o.type == "ARMATURE")
source_body = next(o for o in bpy.context.scene.objects if o.type == "MESH" and "Corpo" in o.name)
parts = build_anatomy(armature, source_body)
required = {"Procedural_Body", "Procedural_Eyes", "Procedural_Hair", "Procedural_Beard"}
assert required <= {o.name for o in parts.objects}
assert 1.80 <= parts.height <= 1.90
for obj in parts.objects: assert_mesh_valid(obj)
```

- [ ] **Step 2: Run and confirm missing anatomy module**

Expected: FAIL importing `build_anatomy`.

- [ ] **Step 3: Extract mandatory bone landmarks**

```python
REQUIRED = {
  "hips":"mixamorig:Hips", "chest":"mixamorig:Spine2",
  "neck":"mixamorig:Neck", "head":"mixamorig:Head",
  "left_hand":"mixamorig:LeftHand", "right_hand":"mixamorig:RightHand",
  "left_foot":"mixamorig:LeftFoot", "right_foot":"mixamorig:RightFoot",
}
def bone_world(armature, name):
    bone = armature.pose.bones.get(name)
    if bone is None: raise RuntimeError(f"missing required bone: {name}")
    return armature.matrix_world @ bone.head
```

- [ ] **Step 4: Build continuous athletic anatomy**

Create torso, pelvis, neck, upper/lower limbs, feet and hands from loft profiles between landmarks. Use multi-ring transitions at shoulders, elbows, hips and knees; join and weld at `0.00005`; recalculate outward normals; add subdivision level 1 and smooth-by-angle. Hands contain palm, thumb and four separate fingers with three segments each.

```python
def build_anatomy(armature, source_body, dimensions=WarriorDimensions()):
    landmarks = extract_landmarks(armature)
    body = build_continuous_body(landmarks, dimensions)
    head = build_head_and_face(landmarks, dimensions)
    hands = build_hands(landmarks, dimensions, finger_segments=3)
    join_into_body(body, head, hands)
    eyes = build_eyes(landmarks, dimensions)
    hair, beard = build_groom(landmarks, dimensions)
    return AnatomyParts(body=body, eyes=eyes, hair=hair, beard=beard)
```

- [ ] **Step 5: Shape an original face with vertex falloffs**

Use ellipsoidal falloffs for jaw, cheeks, brow, nose, lips and chin. Keep seeded asymmetry below 1.5 mm. Eyes and eyelids remain separate so eye roughness is independent.

```python
def offset_vertices(obj, center, radii, delta):
    for vertex in obj.data.vertices:
        q = vertex.co - center
        d2 = sum((q[i] / radii[i]) ** 2 for i in range(3))
        if d2 < 1: vertex.co += delta * ((1 - d2) ** 2)
    obj.data.update()
```

- [ ] **Step 6: Run tests and render neutral front/profile**

Expected: height 1.80–1.90 m, valid meshes and continuous silhouette at all major joints.

- [ ] **Step 7: Record checkpoint**

Conditional commit: `feat: generate procedural warrior anatomy`.

---

### Task 4: Roupas, armadura, materiais e espada

**Files:**
- Create: `tools/procedural_warrior/wardrobe.py`
- Create: `tools/procedural_warrior/materials.py`
- Modify: `tools/test_procedural_warrior.py`

**Interfaces:**
- Produces: `build_wardrobe`, `build_sword`, `create_material_library`.
- Each object declares `rig_mode` as `deform`, `rigid:<bone>` or `unskinned`.

- [ ] **Step 1: Add failing wardrobe/material tests**

```python
materials = create_material_library()
assert set(materials) == {"Skin","Eye","Hair","Cloth","Leather","Steel","DarkMetal"}
wardrobe = build_wardrobe(parts, materials)
sword = build_sword(materials)
required = {"Leather_Jacket","Trousers","Boots","Gloves","Breastplate","Pauldrons","Bracers","Greaves","Belt","Scabbard"}
assert required <= {o.name for o in wardrobe.objects}
assert sword.name == "Procedural_Sword"
assert 1.25 <= max(sword.dimensions) <= 1.45
```

- [ ] **Step 2: Run and confirm missing modules**

Expected: FAIL importing wardrobe/material functions.

- [ ] **Step 3: Build PBR node materials**

Use Principled BSDF values: skin `(metallic=0, roughness=0.48)`, leather `(0, 0.58)`, cloth `(0, 0.76)`, steel `(0.92, 0.24)`, dark metal `(0.82, 0.34)`. Feed restrained Noise → ColorRamp into color/roughness and Bump strength `0.08` for leather, `0.035` for steel.

- [ ] **Step 4: Derive fitted garments from body surfaces**

Duplicate relevant body faces for shirt, jacket, trousers, gloves and boots; separate; offset normals by 4–12 mm; close borders; add Solidify. This preserves topology and stable weight transfer.

- [ ] **Step 5: Build rigid armor and accessories**

Create partial breastplate, asymmetrical pauldrons, bracers and greaves from curved lofts with 2–5 mm bevels. Mark controlling bones explicitly. Create belt, buckle and scabbard with clearance from torso and right-arm attack arcs.

- [ ] **Step 6: Build sword from explicit dimensions**

Use 1.02 m blade, 0.22 m hilt, 0.20 m guard and 0.09 m pommel. Add central fuller, steel blade and leather grip. Apply transforms, place origin at grip and name grip child `SwordGrip`.

- [ ] **Step 7: Test and render material turntable**

Expected: every named piece exists, materials are visibly distinct, sword is 1.25–1.45 m, no neutral-pose penetration.

- [ ] **Step 8: Record checkpoint**

Conditional commit: `feat: add procedural wardrobe armor and sword`.

---

### Task 5: Skinning, ataques adicionais e exportação

**Files:**
- Create: `tools/procedural_warrior/rigging.py`
- Create: `tools/procedural_warrior/animation.py`
- Create: `tools/procedural_warrior/export.py`
- Create: `tools/build_procedural_warrior.py`
- Modify: `tools/test_procedural_warrior.py`

**Interfaces:**
- Produces: `skin_deformable`, `bind_rigid`, `rig_all(anatomy, wardrobe, source_body, armature)`, `create_attack_variants`, `validate_scene`, `export_outputs`.
- Outputs: `ProceduralWarrior.glb`, `ProceduralSword.glb`, `procedural-warrior-manifest.json`.

- [ ] **Step 1: Add failing rig/action tests**

```python
skin_deformable(parts.body, source_body, armature)
assert_weights(parts.body, max_influences=4, tolerance=1e-4)
variants = create_attack_variants(armature, bpy.data.actions["AttackHorizontal"])
assert set(variants) == {"AttackReverse", "AttackDiagonal"}
required = {"Idle","Walking","Running","Reaction","AttackHorizontal","AttackReverse","AttackDiagonal","JumpAttack","Death"}
assert required <= set(bpy.data.actions.keys())
```

- [ ] **Step 2: Run and confirm missing rig/animation functions**

Expected: FAIL importing the new modules.

- [ ] **Step 3: Implement deformable weight transfer**

Transfer source-body groups with `POLYINTERP_NEAREST`; clean below `0.001`; limit to four; normalize; smooth twice at `0.25`; retain one Armature modifier.

```python
def assert_weights(obj, max_influences=4, tolerance=1e-4):
    for vertex in obj.data.vertices:
        active = [g.weight for g in vertex.groups if g.weight > .001]
        if len(active) > max_influences:
            raise RuntimeError(f"{obj.name}: vertex {vertex.index} has {len(active)} influences")
        if active and abs(sum(active)-1) > tolerance:
            raise RuntimeError(f"{obj.name}: vertex {vertex.index} weights={sum(active)}")
```

- [ ] **Step 4: Bind rigid pieces**

For `rigid:<bone>`, create exactly one matching vertex group, assign `1.0` to all vertices and add the Armature modifier. Fail on a missing bone.

- [ ] **Step 5: Author two attack variants**

Duplicate `AttackHorizontal`. `AttackReverse` reverses timing and adds controlled spine/right-arm quaternion deltas. `AttackDiagonal` keys high-right anticipation, diagonal contact and low-left recovery. Target durations: horizontal `0.36`, reverse `0.38`, diagonal `0.44` second at 30 FPS. Do not translate root horizontally; keep the right hand closed around the grip.

```python
ATTACK_DURATIONS = {"AttackHorizontal":.36, "AttackReverse":.38, "AttackDiagonal":.44}
def set_quaternion_key(armature, bone_name, frame, quaternion):
    bone = armature.pose.bones[bone_name]
    bone.rotation_mode = "QUATERNION"
    bone.rotation_quaternion = quaternion
    bone.keyframe_insert("rotation_quaternion", frame=frame, group=bone_name)
```

- [ ] **Step 6: Export transactionally**

Export to a temporary sibling directory, reimport into a clean scene, validate, then use `Path.replace` for final outputs. Character includes armature, character meshes and nine actions; sword contains only sword meshes and no animation. Never overwrite the fallback GLB.

- [ ] **Step 7: Implement CLI orchestration**

```python
def main():
    project = pathlib.Path(__file__).resolve().parents[1]
    scene = import_source(project / "public/models/guerreiro/Guerreiro.glb")
    anatomy = build_anatomy(scene.armature, scene.body)
    materials = create_material_library()
    wardrobe = build_wardrobe(anatomy, materials)
    sword = build_sword(materials)
    rig_all(anatomy, wardrobe, scene.body, scene.armature)
    create_attack_variants(scene.armature, bpy.data.actions["AttackHorizontal"])
    export_outputs(project / "public/models/guerreiro", scene.armature, anatomy, wardrobe, sword)
```

- [ ] **Step 8: Run generator and tests**

Run both:

```powershell
& 'C:\Program Files\Blender Foundation\Blender 5.2\blender.exe' --background --python tools\build_procedural_warrior.py
& 'C:\Program Files\Blender Foundation\Blender 5.2\blender.exe' --background --python tools\test_procedural_warrior.py
```

Expected: exit 0; outputs and manifest exist; fallback file hash is unchanged.

- [ ] **Step 9: Record checkpoint**

Conditional commit: `feat: rig animate and export procedural warrior`.

---

### Task 6: Validação visual automatizada

**Files:**
- Create: `tools/validate_procedural_warrior.py`
- Produce at runtime: `artifacts/procedural-warrior/`

**Interfaces:**
- Produces: `validation.json`, `neutral-turntable.png`, `face-hands.png`, animation contact sheets.

- [ ] **Step 1: Implement strict import assertions**

```python
EXPECTED_BONES = 65
REQUIRED_ACTIONS = {"Idle","Walking","Running","Reaction","AttackHorizontal","AttackReverse","AttackDiagonal","JumpAttack","Death"}
def validate_import(objects):
    armatures = [o for o in objects if o.type == "ARMATURE"]
    if len(armatures) != 1 or len(armatures[0].data.bones) != EXPECTED_BONES:
        raise RuntimeError("expected one 65-bone armature")
    missing = REQUIRED_ACTIONS - set(bpy.data.actions.keys())
    if missing: raise RuntimeError(f"missing actions: {sorted(missing)}")
```

- [ ] **Step 2: Add deterministic render rig**

Use Eevee, AgX Medium High Contrast, 1200×1200 body renders, 1600×1000 face/hands, neutral key/fill/rim lights and mid-gray floor.

- [ ] **Step 3: Render exact validation frames**

Render first, 25%, 50%, 75% and last frame of every action, plus shoulder/elbow/grip/hip/knee closeups. Write bounds, durations, material names, triangles, texture sizes, file sizes and influence maxima to `validation.json`.

- [ ] **Step 4: Run validator**

Run: `& 'C:\Program Files\Blender Foundation\Blender 5.2\blender.exe' --background --python tools\validate_procedural_warrior.py -- public\models\guerreiro\ProceduralWarrior.glb artifacts\procedural-warrior`

Expected: exit 0, 65 bones, nine actions, zero invalid vertices, maximum four influences and all PNGs present.

- [ ] **Step 5: Iterate on objective defects**

Reject clipping, collapsed joint volume, stretched texture, floating parts, eye penetration, false grip contact, foot slide or bending plates. Record image/frame/object/defect in `validation.json`, fix the responsible builder, rerun Tasks 5–6.

- [ ] **Step 6: Record checkpoint**

Conditional commit: `test: add procedural warrior visual validation`.

---

### Task 7: Máquina de estados do combo rápido

**Files:**
- Create: `src/combat/SwordComboController.ts`
- Create: `src/combat/SwordComboController.test.ts`

**Interfaces:**
- Produces: `request()`, `update(delta)`, `cancel()`, `activeStage`, `active`.
- Events: `stage-started`, `damage-opened`, `damage-closed`, `combo-ended`.

- [ ] **Step 1: Write failing combo tests**

```ts
it('opens damage once and completes the first strike in 0.36s', () => {
  const combo = new SwordComboController();
  expect(combo.request()).toBe(true);
  expect(combo.update(.10).map(e => e.type)).not.toContain('damage-opened');
  expect(combo.update(.04).map(e => e.type)).toContain('damage-opened');
  expect(combo.update(.22).map(e => e.type)).toContain('combo-ended');
});

it('buffers commands through three stages', () => {
  const combo = new SwordComboController();
  combo.request(); combo.request(); combo.update(.36);
  expect(combo.activeStage).toBe(1);
  combo.request(); combo.update(.38);
  expect(combo.activeStage).toBe(2);
  combo.update(.44);
  expect(combo.active).toBe(false);
});

it('cancels immediately', () => {
  const combo = new SwordComboController();
  combo.request(); combo.cancel();
  expect(combo.activeStage).toBeNull();
});
```

- [ ] **Step 2: Run and confirm missing module**

Run: `npm test -- src/combat/SwordComboController.test.ts`

Expected: FAIL importing the controller.

- [ ] **Step 3: Implement thresholds and events**

```ts
export const SWORD_COMBO_STAGES = [
  { clip:'AttackHorizontal', duration:.36, damageOpen:.34, damageClose:.62, bufferOpen:.55 },
  { clip:'AttackReverse', duration:.38, damageOpen:.30, damageClose:.60, bufferOpen:.52 },
  { clip:'AttackDiagonal', duration:.44, damageOpen:.38, damageClose:.70, bufferOpen:.58 },
] as const;
export type SwordComboEvent =
  | { type:'stage-started'; stage:number; clip:string }
  | { type:'damage-opened'|'damage-closed'; stage:number }
  | { type:'combo-ended' };
```

Store only primitives. Reuse one internal event array and evaluate crossed thresholds so a large delta cannot skip damage or completion.

- [ ] **Step 4: Test and typecheck**

Run: `npm test -- src/combat/SwordComboController.test.ts && npm run typecheck`

Expected: PASS.

- [ ] **Step 5: Record checkpoint**

Conditional commit: `feat: add rapid sword combo state machine`.

---

### Task 8: Resolver clipes e integrar combo ao Player

**Files:**
- Modify: `src/characters/CharacterCatalog.ts`
- Modify: `src/characters/CharacterAnimations.ts`
- Modify: `src/characters/CharacterAnimations.test.ts`
- Modify: `src/entities/Player.ts`
- Modify: `src/entities/PlayerLocomotion.ts`
- Modify: `src/entities/PlayerLocomotion.test.ts`
- Create: `src/entities/PlayerCombo.integration.test.ts`

**Interfaces:**
- Adds: `attackClipNames?: readonly [string,string,string]`.
- Adds: `resolveCharacterAttackClips(id, source): THREE.AnimationClip[]`.
- Preserves public Player attack methods.

- [ ] **Step 1: Add failing ordered clip test**

```ts
function sourceWithPaladinClips(names: readonly string[]): CharacterAnimationSource {
  const clips = names.map(name => rotationClip(name));
  return {
    getAnimations: id => id === 'paladin' ? clips : [],
    getBoneNames: () => new Set(['mixamorig:Hips']),
    getBoneRestRotations: () => new Map([['mixamorig:Hips', new THREE.Quaternion()]]),
  };
}

it('resolves the procedural combo in order', () => {
  const clips = resolveCharacterAttackClips('paladin', sourceWithPaladinClips([
    'AttackHorizontal','AttackReverse','AttackDiagonal',
  ]));
  expect(clips.map(c => c.name)).toEqual([
    'paladin:attack:0','paladin:attack:1','paladin:attack:2',
  ]);
});
```

- [ ] **Step 2: Add failing Player integration tests**

Verify no damage before `damageOpen`; one hit per target/stage; buffered stage 2; death cancellation; marked-target movement does not erase the combo.

- [ ] **Step 3: Run and confirm failures**

Run: `npm test -- src/characters/CharacterAnimations.test.ts src/entities/PlayerCombo.integration.test.ts`

Expected: FAIL because the resolver and Player combo do not exist.

- [ ] **Step 4: Resolve and normalize combo clips**

Add `attackClipNames: ['AttackHorizontal','AttackReverse','AttackDiagonal']`. Clone, make in place and rename to `paladin:attack:<index>`. If fallback lacks variants, reuse its `AttackHorizontal` for all stages.

- [ ] **Step 5: Replace old swing timers**

Replace `swingTimer`, `swingDuration`, `hasDealtDamageThisSwing` with `SwordComboController`, three AnimationActions and a per-stage hit Set.

```ts
private applyComboEvents(events: readonly SwordComboEvent[]): void {
  for (const event of events) {
    if (event.type === 'stage-started') {
      this.hitTargets.clear(); this.playAttackStage(event.stage);
    } else if (event.type === 'damage-opened') {
      const target = this.attackTargetEnemy;
      if (target && this.targetIsInEffectiveRange(target) && !this.hitTargets.has(target)) {
        this.hitTargets.add(target); this.onAttackHitCallback?.(target);
      }
    } else if (event.type === 'combo-ended') {
      this.playState(this.getLocomotionState() ?? 'idle');
    }
  }
}
```

Remove guaranteed damage at attack start/end. Scale each AnimationAction to the stage duration, fade between stages in `0.06s`, fade out in `0.08s`, LoopOnce and ClampWhenFinished.

- [ ] **Step 6: Add deterministic acceleration and deceleration**

Add and test a pure helper so current movement speed approaches `4.5` at `14 units/s²` while moving and approaches zero at `18 units/s²` while stopping.

```ts
export function approachMovementSpeed(
  current: number,
  target: number,
  acceleration: number,
  deceleration: number,
  delta: number
): number {
  const rate = target > current ? acceleration : deceleration;
  const step = Math.max(0, rate * delta);
  return target > current
    ? Math.min(target, current + step)
    : Math.max(target, current - step);
}

expect(approachMovementSpeed(0, 4.5, 14, 18, .1)).toBeCloseTo(1.4);
expect(approachMovementSpeed(4.5, 0, 14, 18, .1)).toBeCloseTo(2.7);
```

Use one `currentMoveSpeed` field in both click and keyboard paths. Set running action time scale to `clamp(currentMoveSpeed / 4.5, 0.75, 1.15)` while moving, preventing cadence drift. Preserve the existing `cappedMovementStep` rule and use `0.15s` idle/running cross-fades.

- [ ] **Step 7: Run affected tests**

Run: `npm test -- src/characters/CharacterAnimations.test.ts src/entities/PlayerCombo.integration.test.ts src/entities/PlayerLocomotion.test.ts && npm run typecheck`

Expected: PASS.

- [ ] **Step 8: Record checkpoint**

Conditional commit: `feat: integrate three-stage sword combo`.

---

### Task 9: Rastro da espada sem alocação por frame

**Files:**
- Create: `src/effects/SwordTrail.ts`
- Create: `src/effects/SwordTrail.test.ts`
- Create: `src/effects/SwordImpactEffect.ts`
- Create: `src/effects/SwordImpactEffect.test.ts`
- Modify: `src/equipment/WeaponAttachment.ts`
- Modify: `src/equipment/WeaponAttachment.test.ts`
- Modify: `src/entities/Player.ts`

**Interfaces:**
- Adds: `WeaponEquipment.equippedObject: THREE.Object3D | null`.
- Produces: `SwordTrail.attach`, `setActive`, `update`, `dispose`.
- Produces: `SwordImpactEffect.spawn(worldPoint)`, `update(delta)`, `dispose`.

- [ ] **Step 1: Write failing equipment/trail tests**

```ts
it('exposes only the equipped object', () => {
  const equipment = new WeaponEquipment();
  expect(equipment.equippedObject).toBeNull();
  equipment.equip(character, weaponModel(), sword);
  expect(equipment.equippedObject).toBeTruthy();
  equipment.unequip();
  expect(equipment.equippedObject).toBeNull();
});

it('reuses one geometry while toggling', () => {
  const trail = new SwordTrail();
  const geometry = trail.object.geometry;
  trail.setActive(true); trail.update(); trail.update(); trail.setActive(false);
  expect(trail.object.geometry).toBe(geometry);
  expect(trail.object.visible).toBe(false);
});

it('reuses a fixed impact particle pool', () => {
  const impact = new SwordImpactEffect(12);
  const children = [...impact.object.children];
  impact.spawn(new THREE.Vector3(1, 2, 3));
  impact.update(.1); impact.spawn(new THREE.Vector3());
  expect(impact.object.children).toEqual(children);
});
```

- [ ] **Step 2: Run and confirm missing APIs**

Run: `npm test -- src/effects/SwordTrail.test.ts src/equipment/WeaponAttachment.test.ts`

Expected: FAIL.

- [ ] **Step 3: Implement pooled trail**

Create one BufferGeometry with fixed Float32Array for eight blade segments. Cache base/tip Vector3s, shift values in place, set `needsUpdate`; use transparent additive material and `depthWrite=false`. Allocate nothing inside `update()`.

- [ ] **Step 4: Implement pooled impact sparks**

Preallocate 12 small meshes and their position/velocity/lifetime records. `spawn` resets the records in place around the target contact point; `update` advances and hides them. No mesh, material, geometry, vector or record may be constructed inside `spawn` or `update`.

- [ ] **Step 5: Connect to damage windows and contact**

Attach the trail after sword equip; activate on `damage-opened`; deactivate on `damage-closed`, cancellation, unequip, death and respawn. Measure blade axis once from the equipped bounds. Spawn impact only after the damage callback accepts an in-range target, using the closest point between blade midpoint and target world position.

- [ ] **Step 6: Test and typecheck**

Run: `npm test -- src/effects/SwordTrail.test.ts src/effects/SwordImpactEffect.test.ts src/equipment/WeaponAttachment.test.ts src/entities/PlayerCombo.integration.test.ts && npm run typecheck`

Expected: PASS.

- [ ] **Step 7: Record checkpoint**

Conditional commit: `feat: add pooled sword trail`.

---

### Task 10: Ativar personagem e espada procedurais

**Files:**
- Modify: `src/characters/CharacterCatalog.ts`
- Modify: `src/characters/PlayableCharacter.test.ts`
- Modify: `src/equipment/EquipmentCatalog.ts`
- Modify: `src/equipment/RewardAssetStore.test.ts`

**Interfaces:**
- Primary: `/models/guerreiro/ProceduralWarrior.glb`.
- Fallback: `/models/guerreiro/Guerreiro.glb`.
- Sword: `/models/guerreiro/ProceduralSword.glb`.

- [ ] **Step 1: Change expected paths in tests**

```ts
expect(getPlayableCharacters()[0]).toMatchObject({
  id:'paladin', name:'Guerreiro',
  modelPath:'/models/guerreiro/ProceduralWarrior.glb',
  fallbackModelPath:'/models/guerreiro/Guerreiro.glb',
  attackClipNames:['AttackHorizontal','AttackReverse','AttackDiagonal'],
});
expect(getWeaponDefinition('sword')?.modelPath)
  .toBe('/models/guerreiro/ProceduralSword.glb');
```

- [ ] **Step 2: Run and confirm old-path failures**

Run: `npm test -- src/characters/PlayableCharacter.test.ts src/equipment/RewardAssetStore.test.ts`

Expected: FAIL on old paths.

- [ ] **Step 3: Update catalogs**

Set paths exactly as asserted. Remove paladin `animationTimeScale.attacking = 4.5`; combo owns its playback rate.

- [ ] **Step 4: Run full automated verification**

Run: `npm test && npm run typecheck && npm run build`

Expected: PASS and production build exit 0.

- [ ] **Step 5: Record checkpoint**

Conditional commit: `feat: start game with procedural warrior`.

---

### Task 11: Integração, desempenho e refinamento final

**Files:**
- Produce: `artifacts/procedural-warrior/runtime-baseline.json`
- Produce: `artifacts/procedural-warrior/runtime-final.json`
- Produce: `artifacts/procedural-warrior/final-scene.png`
- Produce: `artifacts/procedural-warrior/acceptance.md`
- Modify code only when evidence identifies the responsible component.

**Interfaces:**
- Produces evidence for all 11 acceptance criteria in the spec.

- [ ] **Step 1: Capture old-character baseline**

Before catalog activation, record the same 60-second route and camera: average FPS, worst frame, long frames, draw calls, triangles, geometries, textures and heap if available. Save exact values in `runtime-baseline.json`.

- [ ] **Step 2: Exercise the final game scene**

Run: `npm run dev -- --host 127.0.0.1`. Select the sword and exercise Idle, keyboard/click movement, all combo stages, reaction, jump, death and respawn.

- [ ] **Step 3: Capture final metrics**

Repeat the identical 60-second route in `runtime-final.json`. If sustained FPS is below 60 and materially worse than baseline, optimize the measured bottleneck in materials, geometry or textures and rerun Tasks 5–11.

- [ ] **Step 4: Inspect visual acceptance in the real scene**

Capture `final-scene.png`; inspect face, hands, grip, shoulders, hips, knees, clothing, metal/leather distinction, shadows and sword trail. Reopen the responsible task for every objective defect.

- [ ] **Step 5: Write acceptance evidence**

`acceptance.md` contains all 11 spec criteria, `PASS` or `BLOCKED`, and the command/render/metric proving each result. Do not mark complete with any `FAIL` row.

- [ ] **Step 6: Run final clean verification**

```powershell
& 'C:\Program Files\Blender Foundation\Blender 5.2\blender.exe' --background --python tools\test_procedural_warrior.py
& 'C:\Program Files\Blender Foundation\Blender 5.2\blender.exe' --background --python tools\validate_procedural_warrior.py -- public\models\guerreiro\ProceduralWarrior.glb artifacts\procedural-warrior
npm test
npm run typecheck
npm run build
```

Expected: every command exits 0 and acceptance contains no `FAIL` rows.

- [ ] **Step 7: Record final checkpoint**

Conditional commit: `feat: complete procedural warrior experience`.
