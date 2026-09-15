import * as THREE from 'three';
import type { EquipmentId } from '../equipment/EquipmentCatalog';
import {
  getRuntimeWarriorMaterials,
  RUNTIME_WARRIOR_SWORD_VISIBILITY_ATTRIBUTE,
  type RuntimeWarriorMaterialLibrary,
} from './RuntimeWarriorMaterials';

type RuntimeWeaponMaterialRole = 'steel' | 'darkMetal' | 'leather';

interface BladeRing {
  readonly y: number;
  readonly halfWidth: number;
  readonly halfThickness: number;
}

/** Blade-space limits consumed by the fixed runtime trail anchor. */
export const RUNTIME_WARRIOR_SWORD_BLADE_BASE_Y = 0.16;
export const RUNTIME_WARRIOR_SWORD_BLADE_TIP_Y = 1.5;
export const RUNTIME_WARRIOR_SWORD_BLADE_LENGTH =
  RUNTIME_WARRIOR_SWORD_BLADE_TIP_Y - RUNTIME_WARRIOR_SWORD_BLADE_BASE_Y;

// Matches the authored reward-sword hand pose while the mounted silhouette
// stays inside the existing dark-metal skinned role mesh.
const MOUNTED_SWORD_OFFSET = new THREE.Vector3(0.02, -0.35, -0.15);
const MOUNTED_SWORD_ROTATION = new THREE.Euler(-1.7628, 0.4189, -1.2217);
const MOUNTED_SWORD_SCALE = 0.75;
export const RUNTIME_WARRIOR_MOUNTED_SWORD_BLADE_LENGTH =
  RUNTIME_WARRIOR_SWORD_BLADE_LENGTH * MOUNTED_SWORD_SCALE;

const BLADE_CROSS_SECTION: readonly (readonly [number, number])[] = [
  [-1, 0],
  [-0.72, 1],
  [0, 1.16],
  [0.72, 1],
  [1, 0],
  [0.72, -1],
  [0, -1.16],
  [-0.72, -1],
];

const BLADE_RINGS: readonly BladeRing[] = [
  { y: RUNTIME_WARRIOR_SWORD_BLADE_BASE_Y, halfWidth: 0.095, halfThickness: 0.030 },
  { y: 0.30, halfWidth: 0.120, halfThickness: 0.036 },
  { y: 0.80, halfWidth: 0.105, halfThickness: 0.030 },
  { y: 1.19, halfWidth: 0.080, halfThickness: 0.024 },
  { y: 1.35, halfWidth: 0.025, halfThickness: 0.008 },
];

function materialFor(
  materials: RuntimeWarriorMaterialLibrary,
  role: RuntimeWeaponMaterialRole
): THREE.MeshStandardMaterial {
  return materials.get(role);
}

function markMesh(
  mesh: THREE.Mesh,
  role: RuntimeWeaponMaterialRole
): THREE.Mesh {
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.userData.runtimeWarriorMaterialRole = role;
  if (role === 'darkMetal') {
    const position = mesh.geometry.getAttribute('position');
    if (!position) throw new Error('Runtime warrior fallback sword requires positions');
    mesh.geometry.setAttribute(
      RUNTIME_WARRIOR_SWORD_VISIBILITY_ATTRIBUTE,
      new THREE.Float32BufferAttribute(new Float32Array(position.count), 1)
    );
  }
  return mesh;
}

function createBladeGeometry(): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const sectionSize = BLADE_CROSS_SECTION.length;
  const firstRing = BLADE_RINGS[0];
  const tipY = RUNTIME_WARRIOR_SWORD_BLADE_TIP_Y;
  const ySpan = tipY - firstRing.y;

  for (const ring of BLADE_RINGS) {
    for (let section = 0; section < sectionSize; section += 1) {
      const [sectionX, sectionZ] = BLADE_CROSS_SECTION[section];
      positions.push(
        sectionX * ring.halfWidth,
        ring.y,
        sectionZ * ring.halfThickness
      );
      uvs.push(section / sectionSize, (ring.y - firstRing.y) / ySpan);
    }
  }

  for (let ringIndex = 0; ringIndex < BLADE_RINGS.length - 1; ringIndex += 1) {
    const current = ringIndex * sectionSize;
    const next = (ringIndex + 1) * sectionSize;
    for (let section = 0; section < sectionSize; section += 1) {
      const following = (section + 1) % sectionSize;
      const a = current + section;
      const b = current + following;
      const c = next + following;
      const d = next + section;
      indices.push(a, d, c, a, c, b);
    }
  }

  const bottomCenter = positions.length / 3;
  positions.push(0, firstRing.y, 0);
  uvs.push(0.5, 0);
  for (let section = 0; section < sectionSize; section += 1) {
    const following = (section + 1) % sectionSize;
    indices.push(bottomCenter, following, section);
  }

  const tip = positions.length / 3;
  positions.push(0, tipY, 0);
  uvs.push(0.5, 1);
  const lastStart = (BLADE_RINGS.length - 1) * sectionSize;
  for (let section = 0; section < sectionSize; section += 1) {
    const following = (section + 1) % sectionSize;
    indices.push(lastStart + section, lastStart + following, tip);
  }

  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  // Keep the local bounds explicit: WeaponAttachment uses this same local
  // frame to move the grip to the hand socket before scaling the pivot.
  if (!geometry.boundingBox || !geometry.boundingSphere) {
    throw new Error('Runtime warrior sword blade bounds could not be computed');
  }
  return geometry;
}

function geometryAttributeOrThrow(
  geometry: THREE.BufferGeometry,
  name: 'position' | 'normal' | 'uv'
): THREE.BufferAttribute | THREE.InterleavedBufferAttribute {
  const attribute = geometry.getAttribute(name) as
    | THREE.BufferAttribute
    | THREE.InterleavedBufferAttribute
    | undefined;
  if (!attribute) {
    throw new Error(`Runtime warrior sword ${name} attribute is missing`);
  }
  return attribute;
}

/** Merge construction-time indexed pieces without introducing a render mesh. */
function mergeIndexedGeometries(
  geometries: readonly THREE.BufferGeometry[]
): THREE.BufferGeometry {
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  let vertexOffset = 0;

  for (const geometry of geometries) {
    const position = geometryAttributeOrThrow(geometry, 'position');
    const normal = geometryAttributeOrThrow(geometry, 'normal');
    const uv = geometryAttributeOrThrow(geometry, 'uv');
    const index = geometry.getIndex();
    if (!index || index.count === 0 || index.count % 3 !== 0) {
      throw new Error('Runtime warrior sword requires finite indexed component geometry');
    }
    if (
      normal.count !== position.count ||
      uv.count !== position.count ||
      position.itemSize !== 3 ||
      normal.itemSize !== 3 ||
      uv.itemSize !== 2
    ) {
      throw new Error('Runtime warrior sword component attributes do not share a valid layout');
    }

    for (let vertex = 0; vertex < position.count; vertex += 1) {
      positions.push(position.getX(vertex), position.getY(vertex), position.getZ(vertex));
      normals.push(normal.getX(vertex), normal.getY(vertex), normal.getZ(vertex));
      uvs.push(uv.getX(vertex), uv.getY(vertex));
    }
    for (let indexOffset = 0; indexOffset < index.count; indexOffset += 1) {
      const localIndex = index.getX(indexOffset);
      if (!Number.isInteger(localIndex) || localIndex < 0 || localIndex >= position.count) {
        throw new Error('Runtime warrior sword component has an invalid index');
      }
      indices.push(vertexOffset + localIndex);
    }
    vertexOffset += position.count;
  }

  const merged = new THREE.BufferGeometry();
  merged.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  merged.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  merged.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  merged.setIndex(
    vertexOffset > 0xffff
      ? new THREE.Uint32BufferAttribute(new Uint32Array(indices), 1)
      : new THREE.Uint16BufferAttribute(new Uint16Array(indices), 1)
  );
  return merged;
}

function createMountedSwordHandTransform(): THREE.Matrix4 {
  return new THREE.Matrix4().compose(
    MOUNTED_SWORD_OFFSET,
    new THREE.Quaternion().setFromEuler(MOUNTED_SWORD_ROTATION),
    new THREE.Vector3(MOUNTED_SWORD_SCALE, MOUNTED_SWORD_SCALE, MOUNTED_SWORD_SCALE)
  );
}

function updateRestFrame(rightHand: THREE.Bone, source: THREE.SkinnedMesh): void {
  let boneHierarchyRoot: THREE.Object3D = rightHand;
  while (boneHierarchyRoot.parent) boneHierarchyRoot = boneHierarchyRoot.parent;
  boneHierarchyRoot.updateMatrixWorld(true);
  source.updateMatrixWorld(true);
}

/**
 * Build the compact mounted sword in the source SkinnedMesh local rest frame.
 * Its caller applies a single 100%-rightHand skin weight before merging it
 * into the existing dark-metal role mesh.
 */
export function createMountedRuntimeWarriorSwordGeometry(
  source: THREE.SkinnedMesh,
  rightHand: THREE.Bone,
  sourceHandAnchor?: THREE.Vector3
): THREE.BufferGeometry {
  updateRestFrame(rightHand, source);
  const blade = createBladeGeometry();
  const guard = new THREE.BoxGeometry(0.44, 0.055, 0.10);
  guard.translate(0, 0.13, 0);
  let geometry: THREE.BufferGeometry;
  try {
    geometry = mergeIndexedGeometries([blade, guard]);
  } finally {
    blade.dispose();
    guard.dispose();
  }

  const swordPlacement = createMountedSwordHandTransform();
  if (sourceHandAnchor) {
    swordPlacement.setPosition(
      sourceHandAnchor.x + MOUNTED_SWORD_OFFSET.x,
      sourceHandAnchor.y + MOUNTED_SWORD_OFFSET.y,
      sourceHandAnchor.z + MOUNTED_SWORD_OFFSET.z
    );
    geometry.applyMatrix4(swordPlacement);
  } else {
    const sourceFromHand = new THREE.Matrix4()
      .copy(source.matrixWorld)
      .invert()
      .multiply(rightHand.matrixWorld);
    geometry.applyMatrix4(sourceFromHand.multiply(swordPlacement));
  }
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  if (
    !geometry.boundingBox ||
    !geometry.boundingSphere ||
    !geometry.boundingBox.min.toArray().every(Number.isFinite) ||
    !geometry.boundingBox.max.toArray().every(Number.isFinite) ||
    !geometry.boundingSphere.center.toArray().every(Number.isFinite) ||
    !Number.isFinite(geometry.boundingSphere.radius)
  ) {
    geometry.dispose();
    throw new Error('Runtime warrior mounted sword has invalid source-local bounds');
  }
  return geometry;
}

/**
 * A non-renderable hand child matching the merged blade pose. SwordTrail can
 * use it as its blade frame without creating a ninth runtime weapon mesh.
 */
export function createRuntimeWarriorSwordTrailAnchor(
  sourceHandAnchor?: THREE.Vector3
): THREE.Group {
  const anchor = new THREE.Group();
  anchor.name = 'RuntimeWarrior_SwordTrailAnchor';
  anchor.position.copy(sourceHandAnchor ?? new THREE.Vector3());
  anchor.position.add(MOUNTED_SWORD_OFFSET);
  anchor.rotation.copy(MOUNTED_SWORD_ROTATION);
  anchor.scale.setScalar(MOUNTED_SWORD_SCALE);
  anchor.userData.runtimeWarriorSwordBladeLength =
    RUNTIME_WARRIOR_MOUNTED_SWORD_BLADE_LENGTH;

  const bladeFrame = new THREE.Group();
  bladeFrame.name = 'RuntimeWarrior_SwordBlade';
  anchor.add(bladeFrame);
  return anchor;
}

function createFuller(
  materials: RuntimeWarriorMaterialLibrary
): THREE.Mesh {
  const fuller = new THREE.Mesh(
    new THREE.BoxGeometry(0.030, 0.91, 0.008),
    materialFor(materials, 'darkMetal')
  );
  fuller.name = 'RuntimeWarrior_SwordFuller';
  fuller.position.set(0, 0.76, 0.034);
  return markMesh(fuller, 'darkMetal');
}

function createGuard(
  materials: RuntimeWarriorMaterialLibrary
): THREE.Mesh {
  const guard = new THREE.Mesh(
    new THREE.BoxGeometry(0.44, 0.055, 0.10),
    materialFor(materials, 'darkMetal')
  );
  guard.name = 'RuntimeWarrior_SwordGuard';
  guard.position.y = 0.13;
  return markMesh(guard, 'darkMetal');
}

function createGrip(
  materials: RuntimeWarriorMaterialLibrary
): THREE.Group {
  const grip = new THREE.Group();
  grip.name = 'RuntimeWarrior_SwordGrip';

  const handle = new THREE.Mesh(
    new THREE.CylinderGeometry(0.047, 0.054, 0.31, 16, 1, false),
    materialFor(materials, 'leather')
  );
  handle.name = 'RuntimeWarrior_SwordLeatherHandle';
  handle.position.y = -0.035;
  grip.add(markMesh(handle, 'leather'));

  for (let index = 0; index < 4; index += 1) {
    const wrap = new THREE.Mesh(
      new THREE.TorusGeometry(0.052, 0.007, 5, 16),
      materialFor(materials, 'darkMetal')
    );
    wrap.name = `RuntimeWarrior_SwordGripWrap${index + 1}`;
    wrap.rotation.x = Math.PI * 0.5;
    wrap.position.y = -0.14 + index * 0.07;
    grip.add(markMesh(wrap, 'darkMetal'));
  }

  return grip;
}

function createPommel(
  materials: RuntimeWarriorMaterialLibrary
): THREE.Mesh {
  const pommel = new THREE.Mesh(
    new THREE.SphereGeometry(0.065, 16, 8),
    materialFor(materials, 'darkMetal')
  );
  pommel.name = 'RuntimeWarrior_SwordPommel';
  pommel.position.y = -0.235;
  return markMesh(pommel, 'darkMetal');
}

function assertFiniteBounds(root: THREE.Group): void {
  root.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(root);
  if (
    bounds.isEmpty() ||
    !bounds.min.toArray().every(Number.isFinite) ||
    !bounds.max.toArray().every(Number.isFinite)
  ) {
    throw new Error('Runtime warrior sword has invalid bounds');
  }
  root.userData.runtimeWarriorBounds = bounds;
}

/** Build a fresh, texture-free sword in a local frame centered near its grip. */
export function createRuntimeWarriorSword(): THREE.Group {
  const materials = getRuntimeWarriorMaterials();
  const sword = new THREE.Group();
  sword.name = 'RuntimeWarrior_Sword';
  // This remains an explicit multi-mesh fallback asset. The mounted runtime
  // character uses `createMountedRuntimeWarriorSwordGeometry` instead.
  sword.userData.runtimeWarriorFallbackOnly = true;

  const blade = new THREE.Mesh(
    createBladeGeometry(),
    materialFor(materials, 'steel')
  );
  blade.name = 'RuntimeWarrior_SwordBlade';
  sword.add(markMesh(blade, 'steel'));
  sword.add(createFuller(materials));
  sword.add(createGuard(materials));
  sword.add(createGrip(materials));
  sword.add(createPommel(materials));

  assertFiniteBounds(sword);
  return sword;
}

/** Equipment IDs that are synthesized locally instead of fetched as GLB files. */
export function isRuntimeWeapon(id: EquipmentId): boolean {
  return id === 'sword';
}
