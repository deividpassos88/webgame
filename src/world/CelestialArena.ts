import * as THREE from 'three';

/**
 * Campo dos Deuses: cenário jogável de 50 x 50m, inspirado nas três imagens
 * fornecidas. O solo, as arquibancadas, as ilhas e as nuvens são geometria
 * real (não um plano contendo uma captura de tela).
 *
 * O centro fica livre para habilidades e combate. Tudo que é estrutural está
 * fora do limite de movimentação do jogo; a malha de chão serve ao raycast.
 */
export const CELESTIAL_ARENA_SIZE = 50;
export const CELESTIAL_HALF = CELESTIAL_ARENA_SIZE / 2;

type Palette = {
  marble: THREE.MeshStandardMaterial;
  tile: THREE.MeshPhysicalMaterial;
  ivory: THREE.MeshStandardMaterial;
  stone: THREE.MeshStandardMaterial;
  gold: THREE.MeshStandardMaterial;
  goldBright: THREE.MeshStandardMaterial;
  goldSoft: THREE.MeshStandardMaterial;
  royalBlue: THREE.MeshStandardMaterial;
  deepBlue: THREE.MeshStandardMaterial;
  flame: THREE.MeshBasicMaterial;
};
const GOLD = 0xd9ad58;

function pseudo(seed: number): number {
  const value = Math.sin(seed * 127.1 + seed * seed * 0.017) * 43758.5453;
  return value - Math.floor(value);
}

/** Deterministic, subtly veined pale marble; no network assets or canvas needed. */
function marbleTexture(): THREE.DataTexture {
  const size = 256;
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const nx = x / size;
      const ny = y / size;
      const shift = Math.sin(ny * 15.1 + Math.sin(nx * 21) * 1.7) * 0.08;
      const contour = Math.sin((nx + ny * 0.49 + shift) * 39);
      const vein = Math.pow(Math.max(0, contour), 19);
      const granular = (pseudo(x + y * 256 + 67) - 0.5) * 3.5;
      const soft = Math.sin(nx * 11.2 + Math.sin(ny * 9.2)) * 2.8;
      const value = THREE.MathUtils.clamp(250 - vein * 22 + granular + soft, 210, 255);
      const i = (y * size + x) * 4;
      data[i] = value;
      data[i + 1] = value;
      data[i + 2] = Math.min(255, value + 2);
      data[i + 3] = 255;
    }
  }
  const t = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  t.name = 'CampoDosDeusesMarbleVeining';
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(6, 6);
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.needsUpdate = true;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function standard(color: number, roughness = 0.48, metalness = 0.02): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness });
}

function block(
  parent: THREE.Object3D, mat: THREE.Material,
  x: number, y: number, z: number, sx: number, sy: number, sz: number,
  name = ''
): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), mat);
  mesh.position.set(x, y, z);
  mesh.name = name;
  mesh.receiveShadow = y > -3;
  // Shadows on just architectural cornerstones: keep calls affordable.
  mesh.castShadow = false;
  parent.add(mesh);
  return mesh;
}

function column(
  parent: THREE.Object3D, mat: THREE.Material,
  x: number, y: number, z: number, height: number,
  radius = 0.3, segments = 10
): THREE.Mesh {
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(radius * 0.89, radius, height, segments), mat
  );
  mesh.position.set(x, y, z);
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

function ring(
  parent: THREE.Object3D, radius: number, tube: number,
  x: number, y: number, z: number, mat: THREE.Material
): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.TorusGeometry(radius, tube, 5, 104), mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(x, y, z);
  parent.add(mesh);
  return mesh;
}

function carvedLine(
  parent: THREE.Object3D, mat: THREE.Material,
  x1: number, z1: number, x2: number, z2: number,
  y = 0.07, thickness = 0.075
): void {
  const dx = x2 - x1;
  const dz = z2 - z1;
  const length = Math.hypot(dx, dz);
  if (length < 0.001) return;
  const segment = block(parent, mat, (x1 + x2) / 2, y, (z1 + z2) / 2,
    thickness, 0.014, length);
  segment.rotation.y = Math.atan2(dx, dz);
}

function emblem(parent: THREE.Object3D, gold: THREE.Material, blue: THREE.Material, x: number, z: number, size = 1): void {
  const frame = block(parent, gold, x, 0.11, z, size, 0.025, size);
  frame.rotation.y = Math.PI / 4;
  const inset = block(parent, blue, x, 0.13, z, size * 0.68, 0.027, size * 0.68);
  inset.rotation.y = Math.PI / 4;
  const mark = block(parent, gold, x, 0.153, z, size * 0.1, 0.012, size * 0.53);
  mark.rotation.y = Math.PI / 4;
  const cross = block(parent, gold, x, 0.155, z, size * 0.5, 0.012, size * 0.09);
  cross.rotation.y = Math.PI / 4;
}

function createBanner(parent: THREE.Object3D, blue: THREE.Material, gold: THREE.Material, x: number, y: number, z: number, alongZ: boolean): void {
  const banner = block(parent, blue, x, y, z, alongZ ? 0.08 : 1.9, 5.7, alongZ ? 1.9 : 0.08);
  banner.name = 'CelestialAzureBanner';
  const rim = block(parent, gold, x, y + 2.93, z, alongZ ? 0.22 : 2.02, 0.12, alongZ ? 2.02 : 0.22);
  rim.name = 'CelestialBannerGoldRail';
  const badge = block(parent, gold,
    x + (alongZ ? 0.065 : 0), y + 0.4, z + (!alongZ ? 0.065 : 0),
    alongZ ? 0.08 : 0.7, 0.7, alongZ ? 0.7 : 0.08);
  badge.rotation.set(0, alongZ ? Math.PI / 4 : 0, Math.PI / 4);
}

function makeClouds(parent: THREE.Object3D): THREE.InstancedMesh {
  // Rounded overlapping cloud puffs rather than low-poly floating rocks.
  const geometry = new THREE.SphereGeometry(1, 10, 8);
  const mat = new THREE.MeshLambertMaterial({
    color: 0xffffff, emissive: 0x8faee1, emissiveIntensity: 0.085,
    flatShading: false
  });
  const count = 860;
  const clouds = new THREE.InstancedMesh(geometry, mat, count);
  clouds.name = 'CelestialVolumetricCloudBanks';
  clouds.frustumCulled = false;
  const dummy = new THREE.Object3D();
  const col = new THREE.Color();
  for (let i = 0; i < count; i++) {
    const az = pseudo(i * 2 + 3) * Math.PI * 2;
    const r = 33 + Math.pow(pseudo(i * 2 + 9), 0.68) * 113;
    const depth = pseudo(i * 7 + 39);
    const x = Math.cos(az) * r;
    const z = Math.sin(az) * r;
    const y = -14 - depth * 11 + pseudo(i * 11 + 73) * 9;
    const size = 3.5 + pseudo(i * 7 + 12) * 5.5;
    dummy.position.set(x, y, z);
    dummy.scale.set(size * (1.08 + pseudo(i * 17 + 5)),
      size * (0.5 + pseudo(i * 13 + 8) * 0.30),
      size * (0.85 + pseudo(i * 3 + 99)));
    dummy.rotation.y = pseudo(i * 9 + 1) * Math.PI * 2;
    dummy.updateMatrix();
    clouds.setMatrixAt(i, dummy.matrix);
    col.setHSL(0.585 + pseudo(i * 3 + 2) * 0.018,
      0.18 + pseudo(i * 5 + 6) * 0.11, 0.90 + pseudo(i * 11 + 13) * 0.066);
    clouds.setColorAt(i, col);
  }
  clouds.instanceMatrix.needsUpdate = true;
  if (clouds.instanceColor) clouds.instanceColor.needsUpdate = true;
  parent.add(clouds);
  return clouds;
}

function makeSky(parent: THREE.Object3D): void {
  const sky = new THREE.Mesh(new THREE.SphereGeometry(185, 32, 20),
    new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: {
        top: { value: new THREE.Color(0x4b91e5) },
        horizon: { value: new THREE.Color(0xb8dcff) },
        sunColor: { value: new THREE.Color(0xffebbd) },
      },
      vertexShader: /* glsl */ `
        varying vec3 vDirection;
        void main() {
          vDirection = normalize(position);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        varying vec3 vDirection;
        uniform vec3 top;
        uniform vec3 horizon;
        uniform vec3 sunColor;
        void main() {
          vec3 dir = normalize(vDirection);
          float h = smoothstep(-0.16, 0.89, dir.y);
          vec3 sky = mix(horizon, top, h);
          float sun = pow(max(dot(dir, normalize(vec3(0.43, 0.64, -0.52))), 0.0), 215.0);
          float corona = pow(max(dot(dir, normalize(vec3(0.43, 0.64, -0.52))), 0.0), 10.0);
          gl_FragColor = vec4(sky + sunColor * sun * 1.8 + sunColor * corona * 0.16, 1.0);
        }
      `
    }));
  sky.name = 'CelestialSkydomeSun';
  sky.renderOrder = -10;
  parent.add(sky);
}

function createIsland(parent: THREE.Object3D, palette: Palette, x: number, y: number, z: number, radius: number, seed: number): void {
  const root = new THREE.Group();
  root.position.set(x, y, z);
  root.name = 'CelestialDistantFloatingTempleIsland';
  parent.add(root);
  const rock = new THREE.Mesh(
    new THREE.ConeGeometry(radius * 0.92, radius * 2.4, 7),
    palette.stone
  );
  rock.rotation.z = Math.PI;
  rock.position.y = -radius * 0.72;
  root.add(rock);
  const vegetation = new THREE.Mesh(
    new THREE.CylinderGeometry(radius * 0.91, radius * 1.08, 0.65, 12),
    standard(0x6a875d, 0.95)
  );
  root.add(vegetation);
  const deck = new THREE.Mesh(
    new THREE.CylinderGeometry(radius, radius * 0.96, 0.34, 12),
    palette.marble
  );
  deck.position.y = 0.52;
  root.add(deck);
  const roofY = 4 + radius * 0.21;
  for (let p = 0; p < 7; p++) {
    const a = p * Math.PI * 2 / 7;
    column(root, palette.ivory, Math.cos(a) * radius * 0.51,
      roofY / 2 + 0.45, Math.sin(a) * radius * 0.51, roofY - 0.4, 0.24);
  }
  const roof = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.68, radius * 0.77, 0.46, 12), palette.gold);
  roof.position.y = roofY + 0.30;
  root.add(roof);
  const dome = new THREE.Mesh(new THREE.ConeGeometry(radius * 0.6, radius * 0.48, 12), palette.ivory);
  dome.position.y = roofY + 0.82;
  root.add(dome);
  const finial = new THREE.Mesh(new THREE.ConeGeometry(0.16, 1.3, 7), palette.goldBright);
  finial.position.y = roofY + radius * 0.48 + 0.7;
  root.add(finial);
  // Waterfalls falling off two sides of remote islands.
  for (let k = 0; k < 2; k++) {
    const a = seed + k * 2.5;
    const fall = block(root,
      new THREE.MeshBasicMaterial({
        color: 0x9feaff, transparent: true, opacity: 0.33,
        depthWrite: false, side: THREE.DoubleSide
      }),
      Math.cos(a) * radius * 0.68, -radius * 2.0,
      Math.sin(a) * radius * 0.68, 0.38, radius * 4.5, 0.07);
    fall.rotation.y = a;
  }
}

export class CelestialArena {
  public readonly group = new THREE.Group();
  public readonly groundMeshes: THREE.Object3D[] = [];
  public readonly ambientTorches: THREE.PointLight[] = [];
  public readonly flameVisuals: THREE.Mesh[] = [];
  private readonly materials: Palette;
  private readonly cloudField: THREE.InstancedMesh;

  public constructor() {
    this.group.name = 'CampoDosDeusesCelestialArena';
    this.materials = {
      marble: standard(0xe1e7f0, 0.42),
      tile: new THREE.MeshPhysicalMaterial({
        color: 0xe1e6ef, map: marbleTexture(), metalness: 0.08, roughness: 0.29,
        clearcoat: 0.46, clearcoatRoughness: 0.27, vertexColors: false
      }),
      ivory: standard(0xe8e8e9, 0.37),
      stone: standard(0x8794b2, 0.85),
      gold: standard(0xc5a05c, 0.29, 0.64),
      goldBright: standard(0xffd68a, 0.24, 0.6),
      goldSoft: standard(0xdac995, 0.35, 0.27),
      royalBlue: standard(0x13468e, 0.77),
      deepBlue: standard(0x092f6c, 0.5),
      flame: new THREE.MeshBasicMaterial({ color: 0xffc065 }),
    };
    makeSky(this.group);
    this.cloudField = makeClouds(this.group);
    this.buildSquarePlatform();
    this.buildEngravedFloor();
    this.buildCornerPillarsAndBanners();
    this.buildGrandstands();
    this.buildFloatingIslands();
    this.buildCeremonialTorches();
    this.buildGoldenWingedOrnaments();
  }

  private buildCeremonialTorches(): void {
    const p=this.materials;
    const sites: Array<[number,number]>=[[-28,-23],[28,-23],[-28,23],[28,23]];
    sites.forEach(([x,z],index)=>{
      const node=new THREE.Group();
      node.name='CelestialGoldenFlameColumn';
      node.position.set(x,0,z);
      this.group.add(node);
      block(node,p.stone,0,0.8,0,2.25,1.6,2.25);
      block(node,p.gold,0,1.66,0,2.45,0.22,2.45);
      column(node,p.ivory,0,4.1,0,4.8,0.66,12);
      block(node,p.gold,0,6.55,0,2.15,0.44,2.15);
      const bowl=new THREE.Mesh(new THREE.CylinderGeometry(0.81,0.52,0.58,14),p.goldBright);
      bowl.position.y=7.0;
      node.add(bowl);
      const flame=new THREE.Mesh(new THREE.ConeGeometry(0.44,1.5,8),p.flame);
      flame.name='CelestialDivineFlame';
      flame.position.y=8.05;
      node.add(flame);
      this.flameVisuals.push(flame);
      const light=new THREE.PointLight(0xffc989,3.7,16,2);
      light.position.set(x,8.1,z);
      light.name='CelestialBrazierLight'+index;
      this.group.add(light);
      this.ambientTorches.push(light);
      createBanner(node,p.royalBlue,p.gold,0,3.0,0.78,false);
    });
  }

  private buildSquarePlatform(): void {
    const p = this.materials;
    block(this.group, p.stone, 0, -2.5, 0, 50.4, 5, 50.4, 'CelestialFloatingSquareFoundation');
    block(this.group, p.ivory, 0, -0.33, 0, 51, 0.72, 51, 'CelestialMarbleUpperSlab');
    block(this.group, p.gold, 0, -0.7, 0, 52, 0.25, 52, 'CelestialGildedLowerCornice');
    block(this.group, p.goldBright, 0, -0.045, 0, 50.3, 0.13, 50.3, 'CelestialGoldenFloorRim');
    const halves = [-1, 1];
    for (const sign of halves) {
      block(this.group, p.gold, sign * 24.8, 0.13, 0, 0.32, 0.22, 50.4);
      block(this.group, p.gold, 0, 0.13, sign * 24.8, 50.4, 0.22, 0.32);
      block(this.group, p.royalBlue, sign * 25.21, -1.9, 0, 0.09, 2.8, 47.5);
      block(this.group, p.royalBlue, 0, -1.9, sign * 25.21, 47.5, 2.8, 0.09);
      block(this.group, p.goldSoft, sign * 25.3, -2.15, 0, 0.11, 0.10, 48);
      block(this.group, p.goldSoft, 0, -2.15, sign * 25.3, 48, 0.10, 0.11);
      // Underlying gilded buttresses make the slab read as a floating fortress.
      for (const offset of [-19, -9, 0, 9, 19]) {
        block(this.group, p.gold, sign * 25.36, -2.05, offset, 0.37, 3.2, 0.35);
        block(this.group, p.gold, offset, -2.05, sign * 25.36, 0.35, 3.2, 0.37);
      }
    }
    for (const x of [-22, 22]) {
      for (const z of [-22, 22]) {
        const support = new THREE.Mesh(new THREE.ConeGeometry(3.5, 11, 4), p.stone);
        support.position.set(x, -9.9, z);
        support.rotation.y = Math.PI / 4;
        this.group.add(support);
        block(this.group, p.gold, x, -5.6, z, 4.2, 0.6, 4.2);
      }
    }
  }

  private buildEngravedFloor(): void {
    const p = this.materials;
    // One uninterrupted clickable floor at y=0. Decorative pieces don't steal raycasts.
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(49.5, 49.5), p.tile);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = 0.035;
    floor.receiveShadow = true;
    floor.name = 'CelestialPlayableSmoothMarbleFloor';
    floor.userData.isGround = true;
    this.groundMeshes.push(floor);
    this.group.add(floor);

    // Very faint white-on-white tile veining and narrow joints.
    const jointMat = standard(0xbcc3d3, 0.77);
    for (let at = -20; at <= 20; at += 5) {
      carvedLine(this.group, jointMat, at, -24.4, at, 24.4, 0.057, 0.027);
      carvedLine(this.group, jointMat, -24.4, at, 24.4, at, 0.057, 0.027);
    }
    for (const r of [4.5, 4.74, 5.32, 7.3, 7.52]) {
      ring(this.group, r, r < 6 ? 0.052 : 0.039, 0, 0.082, 0, p.gold);
    }
    for (const sign of [-1, 1]) {
      carvedLine(this.group, p.goldSoft, 0, sign * 5.45, 0, sign * 23.1, 0.072, 0.13);
      carvedLine(this.group, p.goldSoft, sign * 5.45, 0, sign * 23.1, 0, 0.072, 0.13);
      carvedLine(this.group, p.goldSoft, sign * 3.6, sign * 3.6,
        sign * 19, sign * 19, 0.073, 0.073);
      carvedLine(this.group, p.goldSoft, sign * 3.6, -sign * 3.6,
        sign * 19, -sign * 19, 0.073, 0.073);
    }
    // Decorative nested diamond, central constellation emblem.
    for (const radius of [2.6, 4.1]) {
      const coords: [number, number][] = [[0,-radius],[radius,0],[0,radius],[-radius,0],[0,-radius]];
      for (let k = 1; k < coords.length; k++) {
        carvedLine(this.group, p.goldBright,
          coords[k-1][0], coords[k-1][1], coords[k][0], coords[k][1], 0.091, 0.105);
      }
    }
    emblem(this.group, p.goldBright, p.deepBlue, 0, 0, 0.92);
    for (const x of [-13.5, 13.5]) {
      for (const z of [-13.5, 13.5]) emblem(this.group, p.goldSoft, p.marble, x, z, 0.75);
    }
  }

  private buildCornerPillarsAndBanners(): void {
    const p = this.materials;
    const signs = [-1, 1];
    for (const xSign of signs) for (const zSign of signs) {
      const x = xSign * 24.7;
      const z = zSign * 24.7;
      block(this.group, p.gold, x, 0.49, z, 3.4, 0.89, 3.4);
      block(this.group, p.deepBlue, x, 0.98, z, 2.35, 0.11, 2.35);
      block(this.group, p.goldBright, x, 1.12, z, 2.3, 0.15, 2.3);
      const crest = block(this.group, p.royalBlue, x, 1.21, z, 1.5, 0.06, 1.5);
      crest.rotation.y = Math.PI / 4;
      const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.32), p.goldBright);
      gem.position.set(x, 1.37, z);
      this.group.add(gem);
    }
    // Banners hang into the clouds, never across the playable floor.
    for (const v of [-15, 0, 15]) {
      createBanner(this.group, p.royalBlue, p.gold, v, -5.6, 25.49, false);
      createBanner(this.group, p.royalBlue, p.gold, v, -5.6, -25.49, false);
      createBanner(this.group, p.royalBlue, p.gold, 25.49, -5.6, v, true);
      createBanner(this.group, p.royalBlue, p.gold, -25.49, -5.6, v, true);
    }
  }

  private buildGrandstands(): void {
    const p = this.materials;
    for (const sign of [-1, 1]) {
      const side = new THREE.Group();
      side.name = sign === -1 ? 'CelestialWestGrandstand' : 'CelestialEastGrandstand';
      this.group.add(side);
      // Elevated floating structural foundation.
      block(side, p.stone, sign * 42, 1.7, -6, 19.5, 4, 55);
      block(side, p.ivory, sign * 42, 4.0, -6, 19.7, 0.42, 55);
      block(side, p.gold, sign * 42, 4.24, -6, 19.9, 0.12, 55);
      // Nine tiers of seats ascending away from the arena.
      for (let row = 0; row < 9; row++) {
        const x = sign * (31.8 + row * 1.99);
        const h = 4.55 + row * 0.61;
        block(side, p.ivory, x, h - 0.24, -6, 1.88, 0.50, 53);
        block(side, p.gold, x, h + 0.065, -6, 1.86, 0.1, 53);
        block(side, p.deepBlue, x, h + 0.16, -6, 1.6, 0.14, 51);
      }
      // Decorative spectator silhouettes as one efficient mesh per stand.
      const spectators = new THREE.InstancedMesh(
        new THREE.CapsuleGeometry(0.16, 0.28, 2, 4),
        standard(0x33446b, 0.92),
        9 * 90
      );
      spectators.name = 'CelestialGrandstandSpectatorSilhouettes';
      const dummy = new THREE.Object3D();
      const personColor = new THREE.Color();
      for (let row = 0; row < 9; row++) for (let seat = 0; seat < 90; seat++) {
        const i = row * 90 + seat;
        const x = sign * (31.8 + row * 1.99);
        const z = -31.2 + seat * 0.56;
        dummy.position.set(x, 4.85 + row * 0.61 + pseudo(i + 38) * 0.11, z);
        dummy.rotation.set(0, pseudo(i+9) * Math.PI * 2, 0);
        const scale = 0.75 + pseudo(i + 91) * 0.44;
        dummy.scale.set(scale, scale, scale);
        dummy.updateMatrix();
        spectators.setMatrixAt(i, dummy.matrix);
        personColor.setHex(i % 4 === 0 ? 0x7384b0 : i % 5 === 0 ? 0xe0d7b7 : 0x344774);
        spectators.setColorAt(i, personColor);
      }
      spectators.instanceMatrix.needsUpdate = true;
      if (spectators.instanceColor) spectators.instanceColor.needsUpdate = true;
      side.add(spectators);
      // Nine tall colonnades with golden capitals and azure banners.
      for (let k = 0; k < 9; k++) {
        const z = -30 + k * 6;
        column(side, p.ivory, sign * 51.8, 9.3, z, 10.5, 0.66, 12);
        block(side, p.gold, sign * 51.8, 14.73, z, 1.9, 0.54, 1.9);
        block(side, p.ivory, sign * 51.8, 4.0, z, 2.3, 0.64, 2.3);
        if (k % 2 === 0) {
          createBanner(side, p.royalBlue, p.gold, sign * 51.3, 7.7, z, true);
        }
        // Round arches between the bleacher colonnades.
        if (k < 8) {
          const arch = new THREE.Mesh(
            new THREE.TorusGeometry(2.85, 0.22, 6, 30, Math.PI),
            p.ivory
          );
          arch.name = 'CelestialMarbleGrandstandArch';
          arch.position.set(sign * 51.8, 11.0, z + 3);
          arch.rotation.y = Math.PI / 2;
          side.add(arch);
        }
        // Segmental arches linking columns.
        if (k < 8) {
          block(side, p.ivory, sign * 51.8, 14.1, z + 3, 1.2, 0.75, 6.1);
          block(side, p.gold, sign * 51.8, 13.76, z + 3, 1.35, 0.13, 5.9);
        }
      }
    }
  }

  private buildGoldenWingedOrnaments(): void {
    const p=this.materials;
    for (const sign of [-1, 1]) for (const z of [-28, 28]) {
      const statue=new THREE.Group();
      statue.name='CelestialGoldenWingedStatue';
      statue.position.set(sign*51.8,15.35,z);
      this.group.add(statue);
      const body=new THREE.Mesh(new THREE.OctahedronGeometry(0.37,1),p.goldBright);
      body.scale.set(0.83,1.65,0.8);
      statue.add(body);
      const head=new THREE.Mesh(new THREE.SphereGeometry(0.2,8,6),p.goldBright);
      head.position.y=0.66;
      statue.add(head);
      for(const wingSide of [-1,1]){
        const wing=new THREE.Mesh(new THREE.ConeGeometry(0.43,1.8,4),p.gold);
        wing.rotation.z=wingSide*(Math.PI/2+0.3);
        wing.position.set(wingSide*0.78,0.38,0);
        statue.add(wing);
        const plume=new THREE.Mesh(new THREE.ConeGeometry(0.24,1.1,4),p.goldBright);
        plume.rotation.z=wingSide*(Math.PI/2+0.68);
        plume.position.set(wingSide*1.26,0.61,-0.08);
        statue.add(plume);
      }
      const pedestal=block(statue,p.gold,0,-1.13,0,1.5,0.32,1.5);
      pedestal.name='CelestialWingedStatuePedestal';
    }
  }

  private buildFloatingIslands(): void {
    const p = this.materials;
    // Visible over the far side of the battlefield, but outside collision/raycast.
    const islandDefs: Array<[number, number, number, number]> = [
      [-68, 1, -82, 12], [63, 4, -79, 14], [10, -2, -122, 17],
      [-112, 9, -42, 8], [104, 5, -37, 8], [-20, -3, -66, 6],
      [36, -3, -107, 6],
    ];
    islandDefs.forEach(([x,y,z,r],i)=>createIsland(this.group,p,x,y,z,r,i*1.13));
  }

  public update(time: number): void {
    // Four subtle warm decorative flames at the platform perimeter.
    for (let i = 0; i < this.flameVisuals.length; i++) {
      const flame=this.flameVisuals[i];
      flame.scale.setScalar(1+Math.sin(time*7.3+i*1.7)*0.1);
      this.ambientTorches[i].intensity=3.2+Math.sin(time*6.3+i*1.8)*0.5;
    }
  }
}
