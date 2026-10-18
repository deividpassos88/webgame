import * as THREE from 'three';
import { createCelestialMarble, createCelestialLimestone } from './CelestialSurface';
import { buildCelestialStadium } from './CelestialGrandstand';
import {
  buildCelestialArchitectureDetails,
  createFloatingRock,
  addIslandVegetation,
  createCelestialWaterfallTexture,
  addIslandWaterfalls,
  enhanceCelestialFlame,
} from './CelestialArchitecturalDetails';

/**
 * Campo dos Deuses: cenário jogável de 162 x 162m, inspirado nas três imagens
 * fornecidas. O solo, as arquibancadas, as ilhas e as nuvens são geometria
 * real (não um plano contendo uma captura de tela).
 *
 * O centro fica livre para habilidades e combate. Tudo que é estrutural está
 * fora do limite de movimentação do jogo; a malha de chão serve ao raycast.
 */
export const CELESTIAL_ARENA_SIZE = 162;
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
  const count = 1400;
  const clouds = new THREE.InstancedMesh(geometry, mat, count);
  clouds.name = 'CelestialVolumetricCloudBanks';
  clouds.frustumCulled = false;
  const dummy = new THREE.Object3D();
  const col = new THREE.Color();
  for (let i = 0; i < count; i++) {
    // Local clusters instead of evenly scattered individual spheres.
    // Near clouds stay below the arena; distant banks form a visible horizon.
    const cluster = Math.floor(i / 14);
    const az = pseudo(cluster * 2 + 3) * Math.PI * 2
      + (pseudo(i * 13 + 9) - 0.5) * 0.15;
    const r = 110 + pseudo(cluster * 2 + 9) * 300
      + (pseudo(i * 7 + 14) - 0.5) * 15;
    const x = Math.cos(az) * r;
    const z = Math.sin(az) * r;
    const y = (r < 150 ? -22 : -6 + pseudo(cluster * 4 + 11) * 28)
      + (pseudo(i * 11 + 73) - 0.5) * 6;
    const size = 7 + pseudo(i * 7 + 12) * 9;
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
  const sky = new THREE.Mesh(new THREE.SphereGeometry(720, 48, 32),
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

function createIsland(
  parent: THREE.Object3D, palette: Palette,
  x: number, y: number, z: number, radius: number, seed: number,
  waterfall: THREE.Material
): void {
  const root = new THREE.Group();
  root.position.set(x, y, z);
  root.name = 'CelestialDistantFloatingTempleIsland';
  parent.add(root);

  // Jagged stone mass; the original perfectly smooth cone looked like a prop.
  const rock = new THREE.Mesh(createFloatingRock(radius, seed), palette.stone);
  rock.name = 'CelestialSculptedFloatingRock';
  rock.rotation.z = Math.PI;
  rock.position.y = -radius * 1.31;
  root.add(rock);

  const vegetation = new THREE.Mesh(
    new THREE.CylinderGeometry(radius * 0.96, radius * 0.91, 0.50, 24),
    standard(0x6b845f, 0.91)
  );
  vegetation.position.y = 0.24;
  root.add(vegetation);
  addIslandVegetation(root, radius, seed);

  const deck = new THREE.Mesh(
    new THREE.CylinderGeometry(radius * 0.66, radius * 0.71, 0.53, 24),
    palette.marble
  );
  deck.position.y = 0.73;
  root.add(deck);
  const goldFrieze = new THREE.Mesh(
    new THREE.TorusGeometry(radius * 0.68, 0.09, 7, 48), palette.gold
  );
  goldFrieze.rotation.x = Math.PI / 2;
  goldFrieze.position.y = 0.72;
  root.add(goldFrieze);

  // Temple drums, paired fluted columns and gilded roof are readable even
  // from the actual gameplay perspective, not only from an aerial screenshot.
  const roofY = 4.0 + radius * 0.22;
  const n = radius > 12 ? 12 : 10;
  for (let i = 0; i < n; i++) {
    const a = i * Math.PI * 2 / n;
    const px = Math.cos(a) * radius * 0.50;
    const pz = Math.sin(a) * radius * 0.50;
    column(root, palette.ivory, px, roofY / 2 + 0.53, pz, roofY - 0.67, 0.29, 16);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.48, 0.44, 0.21, 12), palette.goldSoft);
    cap.position.set(px, roofY - 0.02, pz);
    root.add(cap);
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.46, 0.50, 0.22, 12), palette.ivory);
    base.position.set(px, 0.87, pz);
    root.add(base);
  }

  const entablature = new THREE.Mesh(
    new THREE.CylinderGeometry(radius * 0.66, radius * 0.70, 0.37, 24),
    palette.ivory
  );
  entablature.position.y = roofY + 0.04;
  root.add(entablature);
  const crown = new THREE.Mesh(
    new THREE.CylinderGeometry(radius * 0.70, radius * 0.70, 0.20, 24),
    palette.gold
  );
  crown.position.y = roofY + 0.29;
  root.add(crown);
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(radius * 0.53, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2),
    palette.ivory
  );
  dome.position.y = roofY + 0.42;
  root.add(dome);
  const cupola = new THREE.Mesh(
    new THREE.CylinderGeometry(radius * 0.19, radius * 0.23, 0.35, 16),
    palette.goldBright
  );
  cupola.position.y = roofY + radius * 0.52;
  root.add(cupola);
  const finial = new THREE.Mesh(
    new THREE.ConeGeometry(0.22, 1.8, 10), palette.goldBright
  );
  finial.position.y = roofY + radius * 0.54 + 0.85;
  root.add(finial);

  addIslandWaterfalls(root, radius, seed, waterfall);
}

export class CelestialArena {
  public readonly group = new THREE.Group();
  public readonly groundMeshes: THREE.Object3D[] = [];
  public readonly ambientTorches: THREE.PointLight[] = [];
  public readonly flameVisuals: THREE.Mesh[] = [];
  private readonly materials: Palette;
  private readonly cloudField: THREE.InstancedMesh;
  private readonly waterfallTexture = createCelestialWaterfallTexture();
  private readonly waterfallMaterial = new THREE.MeshBasicMaterial({
    color: 0xd1f3ff, map: this.waterfallTexture,
    transparent: true, opacity: 0.77, side: THREE.DoubleSide,
    depthWrite: false, fog: true
  });

  public constructor() {
    this.group.name = 'CampoDosDeusesCelestialArena';
    this.materials = {
      marble: standard(0xf3f0e8, 0.39),
      tile: createCelestialMarble(),
      ivory: createCelestialLimestone(),
      stone: standard(0x929ba9, 0.87),
      gold: standard(0xc9a45e, 0.28, 0.71),
      goldBright: standard(0xffd68a, 0.22, 0.68),
      goldSoft: standard(0xd6c090, 0.37, 0.35),
      royalBlue: standard(0x13468e, 0.77),
      deepBlue: standard(0x092f6c, 0.5),
      flame: new THREE.MeshBasicMaterial({ color: 0xffc065 }),
    };
    makeSky(this.group);
    this.cloudField = makeClouds(this.group);
    this.buildSquarePlatform();
    this.buildEngravedFloor();
    this.buildCornerPillarsAndBanners();
    buildCelestialStadium(this.group, this.materials);
    buildCelestialArchitectureDetails(this.group, this.materials, CELESTIAL_ARENA_SIZE);
    this.buildFloatingIslands();
    this.buildCeremonialTorches();
    this.buildGoldenWingedOrnaments();
  }

  private buildCeremonialTorches(): void {
    const p=this.materials;
    const sites: Array<[number,number]>=[[-84,-74],[84,-74],[-84,74],[84,74]];
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
      enhanceCelestialFlame(flame);
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
    const S = CELESTIAL_ARENA_SIZE;
    const H = CELESTIAL_HALF;
    block(this.group, p.stone, 0, -3.7, 0, S + 0.4, 7.4, S + 0.4, 'CelestialFloatingSquareFoundation');
    block(this.group, p.ivory, 0, -0.33, 0, S + 1, 0.72, S + 1, 'CelestialMarbleUpperSlab');
    block(this.group, p.gold, 0, -0.92, 0, S + 2, 0.24, S + 2, 'CelestialGildedLowerCornice');
    block(this.group, p.goldBright, 0, -0.045, 0, S + 0.3, 0.13, S + 0.3, 'CelestialGoldenFloorRim');
    for (const sign of [-1, 1]) {
      block(this.group, p.gold, sign * (H - 0.2), 0.13, 0, 0.32, 0.22, S + 0.4);
      block(this.group, p.gold, 0, 0.13, sign * (H - 0.2), S + 0.4, 0.22, 0.32);
      block(this.group, p.royalBlue, sign * (H + 0.21), -2.2, 0, 0.1, 3.4, S - 2);
      block(this.group, p.royalBlue, 0, -2.2, sign * (H + 0.21), S - 2, 3.4, 0.1);
      for (let offset = -72; offset <= 72; offset += 9) {
        block(this.group, p.gold, sign * (H + 0.38), -2.6, offset, 0.36, 4.3, 0.4);
        block(this.group, p.gold, offset, -2.6, sign * (H + 0.38), 0.4, 4.3, 0.36);
      }
    }
    for (const x of [-H + 4, H - 4]) for (const z of [-H + 4, H - 4]) {
      const support = new THREE.Mesh(new THREE.ConeGeometry(6, 20, 8), p.stone);
      support.position.set(x, -15.6, z);
      support.rotation.z = Math.PI;
      this.group.add(support);
    }
  }

  private buildEngravedFloor(): void {
    const p = this.materials;
    // One uninterrupted clickable floor at y=0. Decorative pieces don't steal raycasts.
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(CELESTIAL_ARENA_SIZE - 0.5, CELESTIAL_ARENA_SIZE - 0.5), p.tile);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = 0.035;
    floor.receiveShadow = true;
    floor.name = 'CelestialPlayableSmoothMarbleFloor';
    floor.userData.isGround = true;
    this.groundMeshes.push(floor);
    this.group.add(floor);

    // Very faint white-on-white tile veining and narrow joints.
    const jointMat = standard(0xbcc3d3, 0.77);
    for (let at = -70; at <= 70; at += 10) {
      carvedLine(this.group, jointMat, at, -80.4, at, 80.4, 0.057, 0.027);
      carvedLine(this.group, jointMat, -80.4, at, 80.4, at, 0.057, 0.027);
    }
    for (const r of [11.4, 11.65, 12.7, 18.2, 18.5]) {
      ring(this.group, r, r < 6 ? 0.052 : 0.039, 0, 0.082, 0, p.gold);
    }
    for (const sign of [-1, 1]) {
      carvedLine(this.group, p.goldSoft, 0, sign * 13.45, 0, sign * 77, 0.072, 0.13);
      carvedLine(this.group, p.goldSoft, sign * 13.45, 0, sign * 77, 0, 0.072, 0.13);
      carvedLine(this.group, p.goldSoft, sign * 10, sign * 10,
        sign * 63, sign * 63, 0.073, 0.073);
      carvedLine(this.group, p.goldSoft, sign * 10, -sign * 10,
        sign * 63, -sign * 63, 0.073, 0.073);
    }
    // Decorative nested diamond, central constellation emblem.
    for (const radius of [6.8, 9.5]) {
      const coords: [number, number][] = [[0,-radius],[radius,0],[0,radius],[-radius,0],[0,-radius]];
      for (let k = 1; k < coords.length; k++) {
        carvedLine(this.group, p.goldBright,
          coords[k-1][0], coords[k-1][1], coords[k][0], coords[k][1], 0.091, 0.105);
      }
    }
    emblem(this.group, p.goldBright, p.deepBlue, 0, 0, 2.2);
    for (const x of [-44, 44]) {
      for (const z of [-44, 44]) emblem(this.group, p.goldSoft, p.marble, x, z, 1.2);
    }
  }

  private buildCornerPillarsAndBanners(): void {
    const p = this.materials;
    const signs = [-1, 1];
    for (const xSign of signs) for (const zSign of signs) {
      const x = xSign * 80.7;
      const z = zSign * 80.7;
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
    for (const v of [-66, -33, 0, 33, 66]) {
      createBanner(this.group, p.royalBlue, p.gold, v, -5.6, 81.49, false);
      createBanner(this.group, p.royalBlue, p.gold, v, -5.6, -81.49, false);
      createBanner(this.group, p.royalBlue, p.gold, 81.49, -5.6, v, true);
      createBanner(this.group, p.royalBlue, p.gold, -81.49, -5.6, v, true);
    }
  }

  private buildGoldenWingedOrnaments(): void {
    const p=this.materials;
    for (const sign of [-1, 1]) for (const z of [-70, 70]) {
      const statue=new THREE.Group();
      statue.name='CelestialGoldenWingedStatue';
      statue.position.set(sign*110.1,20.6,z);
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
    // Lower and nearer silhouettes remain visible behind the grandstands
    // from the actual gameplay camera, rather than sitting above its frustum.
    const islandDefs: Array<[number, number, number, number]> = [
      [-152, 18, -190, 16], [150, 19, -195, 17],
      [5, 25, -255, 23], [-196, 17, -285, 12],
      [192, 17, -289, 12], [-89, 19, -238, 13],
      [92, 20, -240, 13],
    ];
    islandDefs.forEach(([x,y,z,r],i)=>createIsland(
      this.group, p, x, y, z, r, i * 1.13, this.waterfallMaterial
    ));
  }

  public update(time: number): void {
    this.waterfallTexture.offset.y = -(time * 0.19 % 1);
    // Four subtle warm decorative flames at the platform perimeter.
    for (let i = 0; i < this.flameVisuals.length; i++) {
      const flame=this.flameVisuals[i];
      flame.scale.setScalar(1+Math.sin(time*7.3+i*1.7)*0.1);
      this.ambientTorches[i].intensity=3.2+Math.sin(time*6.3+i*1.8)*0.5;
    }
  }
}
