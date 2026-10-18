import * as THREE from 'three';
import type { CelestialArtMaterials } from './CelestialArchitecturalDetails';

/** Two independent stands on EVERY side of the 162m square (eight galleries). */
export type StadiumSide = 'north' | 'south' | 'east' | 'west';
export const CELESTIAL_GALLERY_SECTORS_PER_SIDE = 2;
export const CELESTIAL_GALLERY_FRONT = 84.5;
export const CELESTIAL_GALLERY_LENGTH = 65;
export const CELESTIAL_GALLERY_DEPTH = 24;

type MaterialSet = CelestialArtMaterials & { deepBlue: THREE.Material };
const standSides: StadiumSide[] = ['west', 'east', 'north', 'south'];

function slab(parent: THREE.Object3D, material: THREE.Material,
  x: number, y: number, z: number, w: number, h: number, d: number,
  name = ''): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  mesh.position.set(x, y, z);
  mesh.name = name;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

function site(parent: THREE.Object3D, material: THREE.Material, x: number, y: number, z: number,
  lower: number, upper: number, height: number, segments = 16): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(upper, lower, height, segments), material);
  mesh.position.set(x, y, z);
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

function seeded(i: number): number {
  const v = Math.sin(i * 128.81 + 54.32) * 42758.5453;
  return v - Math.floor(v);
}

/** Build the large marble galleries with instanced balustrades and spectators.
 * Geometry lives in the local coordinate system: +Z is away from the combat
 * floor, X is along its edge. No spectator geometry becomes a navigation wall.
 */
function buildSector(sideGroup: THREE.Group, side: StadiumSide, half: -1 | 1, p: MaterialSet): THREE.Group {
  const sector = new THREE.Group();
  const sideName = side.charAt(0).toUpperCase() + side.slice(1);
  sector.name = 'Celestial' + sideName + (half < 0 ? 'Left' : 'Right') + 'Gallery';
  // Local +Z is outward from the arena, along the bearing of this side.
  const yaw = side === 'north' ? Math.PI : side === 'south' ? 0
    : side === 'east' ? Math.PI / 2 : -Math.PI / 2;
  sector.rotation.y = yaw;
  const edgeMid = half * 43;
  sector.position.set(
    side === 'east' ? 81 : side === 'west' ? -81 : edgeMid,
    0,
    side === 'north' ? -81 : side === 'south' ? 81 : edgeMid
  );
  // Rotated east/west: sector's local X points along ±Z. The side split stays
  // symmetrical even if the coordinate handedness is reversed.
  sideGroup.add(sector);

  const centerDepth = CELESTIAL_GALLERY_FRONT - 81 + CELESTIAL_GALLERY_DEPTH / 2;
  slab(sector, p.stone, 0, 0.8, centerDepth, CELESTIAL_GALLERY_LENGTH + 1.7, 6.4,
    CELESTIAL_GALLERY_DEPTH + 1.9, 'CelestialGalleryFloatingFoundation');
  slab(sector, p.ivory, 0, 4.13, centerDepth, CELESTIAL_GALLERY_LENGTH + 2, 0.47,
    CELESTIAL_GALLERY_DEPTH + 2, 'CelestialGalleryMarbleTerrace');
  slab(sector, p.gold, 0, 4.40, centerDepth, CELESTIAL_GALLERY_LENGTH + 2.2, 0.15,
    CELESTIAL_GALLERY_DEPTH + 2.1, 'CelestialGalleryGoldCornice');

  for (let row = 0; row < 10; row++) {
    const z = (CELESTIAL_GALLERY_FRONT - 81) + 0.9 + row * 2.04;
    const y = 4.87 + row * 0.83;
    slab(sector, p.ivory, 0, y - 0.37, z,
      CELESTIAL_GALLERY_LENGTH - 0.5, 0.78, 1.95, 'CelestialGalleryStoneTier');
    slab(sector, p.goldSoft, 0, y + 0.025, z - 0.72,
      CELESTIAL_GALLERY_LENGTH - 0.7, 0.08, 0.13);
    slab(sector, p.deepBlue, 0, y + 0.17, z + 0.5,
      CELESTIAL_GALLERY_LENGTH - 1.3, 0.23, 0.65);
  }

  // Stone staircase strips create clear, believable spectator access.
  for (const x of [-CELESTIAL_GALLERY_LENGTH * 0.25, CELESTIAL_GALLERY_LENGTH * 0.25]) {
    for (let row = 0; row < 10; row++) {
      const z = (CELESTIAL_GALLERY_FRONT - 81) + 0.9 + row * 2.04;
      const y = 4.87 + row * 0.83;
      slab(sector, p.ivory, x, y + 0.16, z, 2.7, 0.20, 1.97, 'CelestialGalleryStairway');
      slab(sector, p.gold, x, y + 0.28, z - 0.85, 2.6, 0.10, 0.08);
    }
  }

  const numSeats = 10 * 99;
  const spectators = new THREE.InstancedMesh(
    new THREE.CapsuleGeometry(0.19, 0.35, 2, 4),
    new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.92 }), numSeats
  );
  spectators.name = side === 'north' ? 'CelestialNorthStadiumAudience' : 'CelestialStadiumSpectators';
  const dummy = new THREE.Object3D();
  const color = new THREE.Color();
  for (let row = 0; row < 10; row++) for (let seat = 0; seat < 99; seat++) {
    const i = row * 99 + seat;
    const x = -31.0 + seat * 0.632;
    dummy.position.set(x, 5.15 + row * 0.83 + seeded(i + row * 3) * 0.12,
      (CELESTIAL_GALLERY_FRONT - 81) + 0.9 + row * 2.04);
    const jitter = 0.80 + seeded(i + half * 39 + 2381) * 0.27;
    dummy.scale.setScalar(jitter);
    dummy.rotation.y = (seeded(i * 9 + 3) - 0.5) * 0.5;
    dummy.updateMatrix();
    spectators.setMatrixAt(i, dummy.matrix);
    color.setHex(i % 23 === 0 ? 0xd5bb83 : i % 11 === 0 ? 0x9ca5ac
      : i % 7 === 0 ? 0x6f78a2 : 0x334562);
    spectators.setColorAt(i, color);
  }
  spectators.instanceMatrix.needsUpdate = true;
  if (spectators.instanceColor) spectators.instanceColor.needsUpdate = true;
  sector.add(spectators);

  const front = CELESTIAL_GALLERY_FRONT - 81;
  const back = front + CELESTIAL_GALLERY_DEPTH + 0.6;
  // Recessed two-storey classical arcade, pillars with decorated capitals.
  slab(sector, p.ivory, 0, 19.52, back, 68, 1.24, 2.75, 'CelestialGalleryMonumentalEntablature');
  slab(sector, p.gold, 0, 20.22, back, 68.3, 0.22, 2.83);
  slab(sector, p.goldSoft, 0, 18.78, back - 1.2, 67.8, 0.16, 0.22);
  for (let i = 0; i < 11; i++) {
    const x = -30.9 + i * 6.18;
    site(sector, p.ivory, x, 13.18, back, 0.64, 0.57, 11.4, 20);
    site(sector, p.goldSoft, x, 19.04, back, 0.91, 0.86, 0.40, 12);
    site(sector, p.ivory, x, 7.32, back, 0.96, 0.94, 0.35, 12);
    if (i < 10) {
      const arch = new THREE.Mesh(
        new THREE.TorusGeometry(3.02, 0.22, 8, 36, Math.PI), p.ivory
      );
      arch.name = 'CelestialNorthClassicalArch';
      arch.position.set(x + 3.09, 15.9, back - 0.3);
      sector.add(arch);
      slab(sector, p.goldSoft, x + 3.09, 18.34, back - 0.38, 5.75, 0.14, 0.12);
    }
  }

  // Repetitive balustrades built as one instance batch per material.
  const balusterCount = 88;
  const balusters = new THREE.InstancedMesh(
    new THREE.CylinderGeometry(0.15, 0.18, 1.4, 9), p.ivory, balusterCount
  );
  balusters.name = 'CelestialStadiumStoneBalusters';
  for (let i = 0; i < balusterCount; i++) {
    const x = -32.0 + i * 0.735;
    dummy.position.set(x, 5.66, front - 0.7);
    dummy.scale.setScalar(1);
    dummy.rotation.set(0, 0, 0);
    dummy.updateMatrix();
    balusters.setMatrixAt(i, dummy.matrix);
  }
  balusters.instanceMatrix.needsUpdate = true;
  sector.add(balusters);
  slab(sector, p.ivory, 0, 6.45, front - 0.7, 65, 0.22, 0.32,
    'CelestialStadiumBalustradeRail');
  slab(sector, p.gold, 0, 6.60, front - 0.7, 65.1, 0.075, 0.34);
  for (const x of [-31.5, 0, 31.5]) {
    site(sector, p.ivory, x, 7.45, front - 0.7, 0.62, 0.55, 2, 12);
    slab(sector, p.goldBright, x, 8.58, front - 0.7, 1.4, 0.29, 1.4);
    // Tall fabric panels with a central gilded sigil.
    const banner = slab(sector, p.royalBlue, x, 12.4, back - 1.65, 2.0, 6.1, 0.09,
      'CelestialStadiumRoyalBanner');
    banner.receiveShadow = false;
    slab(sector, p.goldBright, x, 15.50, back - 1.63, 2.13, 0.16, 0.13);
    slab(sector, p.gold, x, 12.7, back - 1.56, 0.72, 0.11, 0.13);
  }
  // Floating supports make the side structures genuinely separate islands.
  for (const x of [-25, 0, 25]) {
    const stone = new THREE.Mesh(new THREE.ConeGeometry(3.0, 12.5, 7), p.stone);
    stone.rotation.z = Math.PI;
    stone.position.set(x, -8.4, centerDepth);
    stone.name = 'CelestialGrandstandFloatingSupport';
    sector.add(stone);
  }
  return sector;
}

/** 8 stands: 2 per side, with a clear central 20m vista on every face. */
export function buildCelestialStadium(root: THREE.Object3D, p: MaterialSet): void {
  const vista = new THREE.Group();
  vista.name = 'CelestialCentralOpenSkyVista';
  root.add(vista);
  for (const side of standSides) {
    const group = new THREE.Group();
    group.name = 'Celestial' + side.charAt(0).toUpperCase() + side.slice(1) + 'Grandstand';
    root.add(group);
    for (const half of [-1, 1] as const) {
      const gallery = buildSector(group, side, half, p);
      // Stable historical names for north gallery tests/tools.
      if (side === 'north') {
        gallery.name = half === -1 ? 'CelestialNorthWestGallery' : 'CelestialNorthEastGallery';
      }
    }
  }
}
