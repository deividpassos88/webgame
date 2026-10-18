import * as THREE from 'three';
import { PALETTE, createSeededRandom } from './CelestialConfig';
import {
  MeshBatch,
  createBushGeometry,
  createColumnParts,
  createCypressParts,
  createRockGeometry,
} from './CelestialGeometry';
import { makeSkyGradientTexture } from './CelestialTextures';
import type { CelestialMaterials } from './CelestialMaterials';

/**
 * Céu, ilhas suspensas e mar de nuvens.
 *
 * O dome usa shader (gradiente + disco solar) e recebe nuvens em sprites, que
 * dão volume de cúmulo sem custo de volumetria. As ilhas são rocha deslocada
 * por ruído determinístico + templos clássicos simplificados, na escala das
 * referências (templo principal a ~170 m, ilha colossal a ~320 m).
 */

const SKY_VERTEX = /* glsl */ `
  varying vec3 vDirection;
  void main() {
    vDirection = normalize(position);
    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * viewMatrix * worldPosition;
  }
`;

const SKY_FRAGMENT = /* glsl */ `
  uniform vec3 topColor;
  uniform vec3 horizonColor;
  uniform vec3 bottomColor;
  uniform vec3 sunColor;
  uniform vec3 sunDirection;
  varying vec3 vDirection;

  void main() {
    vec3 direction = normalize(vDirection);
    float height = direction.y;
    vec3 color = mix(horizonColor, topColor, smoothstep(-0.01, 0.045, height));
    color = mix(bottomColor, color, smoothstep(-0.2, 0.01, height));

    float sunAmount = max(dot(direction, normalize(sunDirection)), 0.0);
    color += sunColor * pow(sunAmount, 900.0) * 2.4;
    color += sunColor * pow(sunAmount, 16.0) * 0.26;
    color += sunColor * pow(sunAmount, 3.0) * 0.05;

    // Névoa quente junto ao horizonte.
    color += vec3(1.0, 0.96, 0.88) * 0.07 * exp(-abs(height) * 9.0);

    gl_FragColor = vec4(color, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

interface IslandSpec {
  x: number;
  y: number;
  z: number;
  scale: number;
  rotation: number;
  kind: 'temple' | 'rotunda' | 'rock' | 'city';
  seed: number;
}

const ISLANDS: readonly IslandSpec[] = [
  { x: -18, y: 62, z: -262, scale: 2.2, rotation: 0.14, kind: 'temple', seed: 41 },
  { x: 96, y: 54, z: -330, scale: 1.25, rotation: -0.4, kind: 'rotunda', seed: 71 },
  { x: -120, y: 46, z: -300, scale: 1.05, rotation: 0.45, kind: 'rotunda', seed: 57 },
  { x: -58, y: 26, z: -190, scale: 0.52, rotation: 0.6, kind: 'rock', seed: 83 },
  { x: 128, y: 18, z: -215, scale: 0.44, rotation: 1.2, kind: 'rock', seed: 97 },
  { x: -210, y: 34, z: -330, scale: 0.6, rotation: 0.9, kind: 'rock', seed: 139 },
  { x: 220, y: 40, z: -350, scale: 0.8, rotation: 0.3, kind: 'temple', seed: 109 },
  { x: -300, y: 24, z: -380, scale: 0.7, rotation: 0.8, kind: 'rock', seed: 151 },
];

export class CelestialSky {
  public readonly group = new THREE.Group();
  public readonly sunDirection = new THREE.Vector3(-55, 65, 35).normalize();

  private readonly materials: CelestialMaterials;
  private readonly clouds: THREE.Sprite[] = [];
  private readonly waterfallMaterial: THREE.MeshBasicMaterial;
  private cloudSeaMaterial!: THREE.MeshBasicMaterial;
  private readonly waterMist: { sprite: THREE.Sprite; base: THREE.Vector2 }[] = [];
  private readonly sunSprite: THREE.Sprite;
  private domeMaterial?: THREE.MeshBasicMaterial;

  public constructor(materials: CelestialMaterials) {
    this.materials = materials;
    this.waterfallMaterial = materials.waterfall;
    this.group.name = 'celestial-sky';

    this.group.add(this.createDome());
    this.sunSprite = this.createSun();
    this.group.add(this.sunSprite);
    this.group.add(this.createCloudField());
    this.group.add(this.createCloudSea());

    for (const spec of ISLANDS) {
      this.group.add(this.createIsland(spec));
    }
    this.group.add(this.createDistantCity());
  }

  private createDome(): THREE.Mesh {
    // Textura em vez de shader: o gradiente tem de ficar idêntico em qualquer
    // GPU (o tone mapping do lab lavava o azul do shader).
    const material = new THREE.MeshBasicMaterial({
      map: makeSkyGradientTexture(),
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      toneMapped: false,
    });
    const dome = new THREE.Mesh(new THREE.SphereGeometry(800, 48, 32), material);
    dome.name = 'celestial-sky-dome';
    dome.renderOrder = -10;
    dome.frustumCulled = false;
    this.domeMaterial = material;
    return dome;
  }

  private createSun(): THREE.Sprite {
    const sprite = new THREE.Sprite(this.materials.sunGlow);
    sprite.position.copy(this.sunDirection).multiplyScalar(730);
    sprite.scale.setScalar(230);
    sprite.renderOrder = -8;
    sprite.name = 'celestial-sun';
    return sprite;
  }

  private createCloudField(): THREE.Group {
    const group = new THREE.Group();
    group.name = 'celestial-clouds';
    const rand = createSeededRandom(0xc10d5);
    const puff = (x: number, y: number, z: number, s: number, flat = 0.5) => {
      const sprite = new THREE.Sprite(this.materials.cloud);
      sprite.position.set(x, y, z);
      sprite.scale.set(s, s * flat, 1);
      sprite.renderOrder = -6;
      group.add(sprite);
      this.clouds.push(sprite);
    };
    // Cúmulos abaixo da arena: a ilha flutua sobre um mar de nuvens.
    for (let i = 0; i < 14; i++) {
      const angle = rand() * Math.PI * 2;
      const radius = 95 + rand() * 260;
      puff(Math.cos(angle) * radius, -62 + rand() * 24, Math.sin(angle) * radius, 14 + rand() * 24, 0.45);
    }
    // Banco médio: preenche o fundo atrás do anel, entre a arena e as ilhas.
    for (let i = 0; i < 22; i++) {
      const angle = -Math.PI * 0.95 + rand() * Math.PI * 1.9;
      const radius = 230 + rand() * 260;
      puff(Math.cos(angle) * radius, -54 + rand() * 26, Math.sin(angle) * radius - 70, 24 + rand() * 30, 0.5);
    }
    // Muralha de cúmulos na faixa média: substitui o plano do mar de nuvens.
    for (let i = 0; i < 26; i++) {
      const angle = -Math.PI * 0.95 + rand() * Math.PI * 1.9;
      const radius = 160 + rand() * 220;
      puff(Math.cos(angle) * radius, -86 + rand() * 34, Math.sin(angle) * radius - 45, 26 + rand() * 36, 0.55);
    }
    // Grandes bancos de cúmulos emoldurando as ilhas (ref 1).
    for (const b of [
      { x: -250, y: -34, z: -330, s: 120 },
      { x: -110, y: -22, z: -360, s: 96 },
      { x: 160, y: -30, z: -350, s: 110 },
      { x: 290, y: -18, z: -390, s: 88 },
      { x: 30, y: -46, z: -300, s: 130 },
    ]) {
      puff(b.x, b.y, b.z, b.s, 0.62);
    }
    // Coroa de cúmulos altos contra o azul (topo do quadro, ref 1).
    for (let i = 0; i < 12; i++) {
      const angle = -Math.PI * 0.8 + rand() * Math.PI * 1.6;
      const radius = 300 + rand() * 240;
      puff(Math.cos(angle) * radius, -14 + rand() * 18, Math.sin(angle) * radius - 80, 26 + rand() * 26, 0.55);
    }
    // Torres altas: como o horizonte fica acima do quadro, são elas que
    // fecham o fundo e emolduram as ilhas (ref 1).
    for (const t of [
      { x: -140, y: 2, z: -380, s: 44 },
      { x: 118, y: 6, z: -400, s: 50 },
      { x: 250, y: -16, z: -340, s: 38 },
    ]) {
      puff(t.x, t.y, t.z, t.s, 0.62);
    }
    return group;
  }

  private createCloudSea(): THREE.Group {
    const group = new THREE.Group();
    group.name = 'celestial-cloud-sea';
    this.cloudSeaMaterial = new THREE.MeshBasicMaterial({
      map: this.materials.cloudSeaTexture,
      color: 0xe9f1fb,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
      side: THREE.DoubleSide,
      toneMapped: false,
      fog: false,
    });
    this.materials.cloudSeaTexture.wrapS = THREE.RepeatWrapping;
    this.materials.cloudSeaTexture.wrapT = THREE.RepeatWrapping;
    this.materials.cloudSeaTexture.repeat.set(6, 6);
    const sea = new THREE.Mesh(new THREE.CircleGeometry(1100, 64), this.cloudSeaMaterial);
    sea.visible = false;
    sea.rotation.x = -Math.PI / 2;
    sea.position.y = -270;
    sea.name = 'cloud-sea';
    sea.receiveShadow = false;
    group.add(sea);

    const rand = createSeededRandom(0x5ea5);
    for (let i = 0; i < 10; i++) {
      const angle = (i / 10) * Math.PI * 2 + rand() * 0.3;
      const radius = 36 + rand() * 40;
      const sprite = new THREE.Sprite(this.materials.cloud);
      sprite.position.set(Math.cos(angle) * radius, -46 + rand() * 12, Math.sin(angle) * radius);
      const scale = 26 + rand() * 30;
      sprite.scale.set(scale, scale * 0.4, 1);
      sprite.renderOrder = -5;
      group.add(sprite);
      this.clouds.push(sprite);
    }
    return group;
  }

  private createIsland(spec: IslandSpec): THREE.Group {
    const group = new THREE.Group();
    group.name = `celestial-island-${spec.seed}`;
    group.position.set(spec.x, spec.y, spec.z);
    group.rotation.y = spec.rotation;

    const materials = this.materials;
    const rock = createRockGeometry(spec.seed, 2, 0.52, 0.55);
    const rockMesh = new THREE.Mesh(rock, materials.rockFar);
    const width = 17 * spec.scale;
    const height = 11 * spec.scale;
    rockMesh.scale.set(width, height, width * 0.82);
    rockMesh.castShadow = false;
    rockMesh.receiveShadow = false;
    group.add(rockMesh);

    // Espuma de nuvem na base da ilha, escondendo o "corte" da rocha.
    const baseMist = new THREE.Sprite(materials.cloudHaze);
    baseMist.position.set(0, -height * 0.72, 0);
    baseMist.scale.set(width * 2.2, height * 0.9, 1);
    baseMist.renderOrder = -4;
    group.add(baseMist);

    const topY = height * 0.52;

    if (spec.kind === 'rock') {
      this.addGreenery(group, width * 0.55, topY, spec.seed, 4 + Math.floor(spec.scale * 6));
      return group;
    }

    // Platô de grama e pedra.
    const plateau = new THREE.Mesh(
      new THREE.CylinderGeometry(width * 0.6, width * 0.64, height * 0.06, 14),
      materials.moss
    );
    plateau.position.y = topY;
    group.add(plateau);
    const rim = new THREE.Mesh(
      new THREE.CylinderGeometry(width * 0.62, width * 0.66, height * 0.035, 14),
      materials.limestone
    );
    rim.position.y = topY - height * 0.05;
    group.add(rim);

    const batch = new MeshBatch();
    const templeScale = spec.scale * 0.92;
    if (spec.kind === 'temple') {
      this.addTemple(batch, materials, templeScale);
    } else {
      this.addRotunda(batch, materials, templeScale);
    }
    this.addGreeneryToBatch(batch, materials, width * 0.55, topY, spec.seed, 8);
    batch.build(group, { castShadow: false, receiveShadow: false, name: 'island-temple' });

    // Cachoeiras: duas por ilha grande, caindo até o mar de nuvens.
    const fallHeight = width * 0.75 + 6;
    for (const side of [-1, 1] as const) {
      const fallWidth = width * (0.16 + (side > 0 ? 0.05 : 0));
      const waterfall = new THREE.Mesh(
        new THREE.PlaneGeometry(fallWidth, fallHeight, 1, 1),
        this.waterfallMaterial
      );
      waterfall.position.set(side * width * 0.52, topY - fallHeight * 0.5, width * 0.52);
      group.add(waterfall);
      const mist = new THREE.Sprite(materials.cloudHaze);
      mist.position.set(side * width * 0.52, topY - fallHeight * 0.95, width * 0.6);
      mist.scale.set(fallWidth * 5, fallWidth * 2.4, 1);
      mist.renderOrder = -3;
      group.add(mist);
      this.waterMist.push({ sprite: mist, base: new THREE.Vector2(mist.scale.x, mist.scale.y) });
    }

    return group;
  }

  private addGreenery(
    group: THREE.Object3D,
    radius: number,
    topY: number,
    seed: number,
    count: number
  ): void {
    const batch = new MeshBatch();
    this.addGreeneryToBatch(batch, this.materials, radius, topY, seed, count);
    batch.build(group, { castShadow: false, receiveShadow: false, name: 'island-greenery' });
  }

  private addGreeneryToBatch(
    batch: MeshBatch,
    materials: CelestialMaterials,
    radius: number,
    topY: number,
    seed: number,
    count: number
  ): void {
    const rand = createSeededRandom(seed * 31 + 7);
    const cypress = createCypressParts();
    for (let i = 0; i < count; i++) {
      const angle = rand() * Math.PI * 2;
      const r = radius * (0.35 + rand() * 0.6);
      const x = Math.cos(angle) * r;
      const z = Math.sin(angle) * r * 0.85;
      const scale = 0.7 + rand() * 0.8;
      if (rand() > 0.45) {
        const matrix = new THREE.Matrix4()
          .makeRotationY(rand() * Math.PI)
          .scale(new THREE.Vector3(scale, scale, scale))
          .setPosition(x, topY, z);
        batch.add(cypress.trunk, materials.foliage, matrix);
        batch.add(cypress.crown, materials.foliage, matrix);
      } else {
        const bush = createBushGeometry(seed + i);
        const matrix = new THREE.Matrix4()
          .makeRotationY(rand() * Math.PI)
          .scale(new THREE.Vector3(scale * 1.3, scale * 0.8, scale * 1.3))
          .setPosition(x, topY + scale * 0.4, z);
        batch.add(bush, materials.foliage, matrix);
      }
    }
  }

  /** Templo grego: estilóbato, peristilo, entablamento, frontão e friso azul. */
  private addTemple(batch: MeshBatch, materials: CelestialMaterials, scale: number): void {
    const scaleMatrix = new THREE.Matrix4().makeScale(scale, scale, scale);
    const add = (geometry: THREE.BufferGeometry, material: THREE.Material, x: number, y: number, z: number) => {
      const matrix = new THREE.Matrix4().setPosition(x, y, z);
      matrix.premultiply(scaleMatrix);
      batch.add(geometry, material, matrix);
    };
    const width = 26;
    const depth = 16;
    const columnHeight = 11;
    const baseY = 0.4;

    // Estilóbato em três degraus.
    add(new THREE.BoxGeometry(width + 4, 1.2, depth + 4), materials.limestone, 0, baseY + 0.6, 0);
    add(new THREE.BoxGeometry(width + 2, 1.2, depth + 2), materials.limestone, 0, baseY + 1.8, 0);
    add(new THREE.BoxGeometry(width, 1.2, depth), materials.ivory, 0, baseY + 3.0, 0);
    const floorY = baseY + 3.6;

    // Peristilo: 6 colunas na frente/atrás, 4 em cada lateral.
    const column = createColumnParts(columnHeight, 0.58);
    const columns: [number, number][] = [];
    for (let i = 0; i < 6; i++) {
      const x = -width * 0.38 + (i * width * 0.76) / 5;
      columns.push([x, depth * 0.38], [x, -depth * 0.38]);
    }
    for (let i = 0; i < 4; i++) {
      const z = -depth * 0.2 + (i * depth * 0.4) / 3;
      columns.push([width * 0.38, z], [-width * 0.38, z]);
    }
    for (const [x, z] of columns) {
      add(column.base, materials.ivory, x, floorY + columnHeight * 0.025, z);
      add(column.shaft, materials.ivory, x, floorY + columnHeight * 0.51, z);
      add(column.capital, materials.ivory, x, floorY + columnHeight * 0.94, z);
      add(column.abacus, materials.gold, x, floorY + columnHeight * 0.985, z);
    }

    // Entablamento + friso azul + filete dourado.
    add(new THREE.BoxGeometry(width * 0.9, 2.2, depth * 0.86), materials.ivory, 0, floorY + columnHeight + 1.1, 0);
    add(new THREE.BoxGeometry(width * 0.92, 0.8, depth * 0.88), materials.enamel, 0, floorY + columnHeight + 0.25, 0);
    add(new THREE.BoxGeometry(width * 0.94, 0.22, depth * 0.9), materials.gold, 0, floorY + columnHeight + 2.32, 0);

    // Telhado em duas águas (prisma triangular).
    const roofShape = new THREE.Shape();
    roofShape.moveTo(-width * 0.48, 0);
    roofShape.lineTo(width * 0.48, 0);
    roofShape.lineTo(0, 3.2);
    roofShape.closePath();
    const roof = new THREE.ExtrudeGeometry(roofShape, { depth: depth * 0.92, bevelEnabled: false });
    roof.translate(0, 0, -depth * 0.46);
    add(roof, materials.limestone, 0, floorY + columnHeight + 2.4, 0);
    add(new THREE.BoxGeometry(width * 0.99, 0.22, depth * 0.95), materials.gold, 0, floorY + columnHeight + 2.42, 0);

    // Porta azul e estátua de ouro no centro.
    add(new THREE.BoxGeometry(width * 0.22, columnHeight * 0.6, 1.2), materials.enamel, 0, floorY + columnHeight * 0.3, depth * 0.33);
    add(new THREE.CylinderGeometry(0.5, 0.7, 3.6, 8), materials.gold, 0, floorY + 1.8, 0);
    add(new THREE.SphereGeometry(0.52, 10, 8), materials.gold, 0, floorY + 3.9, 0);
  }

  /** Rotunda com cúpula: a ilha da direita na ref 1. */
  private addRotunda(batch: MeshBatch, materials: CelestialMaterials, scale: number): void {
    const scaleMatrix = new THREE.Matrix4().makeScale(scale, scale, scale);
    const add = (geometry: THREE.BufferGeometry, material: THREE.Material, y: number) => {
      const matrix = new THREE.Matrix4().setPosition(0, y, 0);
      matrix.premultiply(scaleMatrix);
      batch.add(geometry, material, matrix);
    };
    add(new THREE.CylinderGeometry(10, 11, 1.4, 24), materials.limestone, 0.7);
    add(new THREE.CylinderGeometry(9.2, 10, 1.2, 24), materials.ivory, 2.0);
    const column = createColumnParts(9, 0.5);
    for (let i = 0; i < 14; i++) {
      const angle = (i / 14) * Math.PI * 2;
      const x = Math.cos(angle) * 8.2;
      const z = Math.sin(angle) * 8.2;
      const base = new THREE.Matrix4().setPosition(x, 2.6 + 9 * 0.025, z);
      base.premultiply(scaleMatrix);
      batch.add(column.base, materials.ivory, base);
      const shaft = new THREE.Matrix4().setPosition(x, 2.6 + 9 * 0.51, z);
      shaft.premultiply(scaleMatrix);
      batch.add(column.shaft, materials.ivory, shaft);
      const cap = new THREE.Matrix4().setPosition(x, 2.6 + 9 * 0.94, z);
      cap.premultiply(scaleMatrix);
      batch.add(column.capital, materials.ivory, cap);
    }
    add(new THREE.CylinderGeometry(9.4, 9.4, 1.8, 24), materials.ivory, 12.3);
    add(new THREE.CylinderGeometry(9.8, 9.8, 0.3, 24), materials.gold, 13.3);
    const dome = new THREE.SphereGeometry(8.8, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2);
    add(dome, materials.ivory, 13.4);
    add(new THREE.CylinderGeometry(0.3, 0.6, 4.6, 8), materials.gold, 23.2);
    add(new THREE.SphereGeometry(0.55, 10, 8), materials.gold, 25.6);
  }

  /** Cidade-torre no horizonte direito (ref 2/1): silhueta, não detalhe. */
  private createDistantCity(): THREE.Group {
    const group = new THREE.Group();
    group.name = 'celestial-distant-city';
    group.position.set(205, 18, -460);
    const batch = new MeshBatch();
    const rand = createSeededRandom(0xc17);
    for (let i = 0; i < 14; i++) {
      const x = (rand() - 0.5) * 120;
      const z = (rand() - 0.5) * 70;
      const height = 18 + rand() * 58;
      const width = 4 + rand() * 7;
      const y = rand() * 28;
      batch.add(
        new THREE.BoxGeometry(width, height, width),
        this.materials.limestone,
        new THREE.Matrix4().setPosition(x, y + height / 2, z)
      );
      batch.add(
        new THREE.ConeGeometry(width * 0.8, height * 0.22, 4),
        this.materials.gold,
        new THREE.Matrix4().setPosition(x, y + height + height * 0.11, z)
      );
    }
    batch.add(
      new THREE.BoxGeometry(14, 64, 14),
      this.materials.ivory,
      new THREE.Matrix4().setPosition(0, 62, -22)
    );
    batch.add(
      new THREE.ConeGeometry(12, 26, 4),
      this.materials.gold,
      new THREE.Matrix4().setPosition(0, 115, -22)
    );
    batch.build(group, { castShadow: false, receiveShadow: false, name: 'distant-city' });
    return group;
  }

  public update(time: number): void {
    // Nuvens derivam lentamente; a cena tem de parecer viva, não um backdrop.
    for (let i = 0; i < this.clouds.length; i++) {
      const sprite = this.clouds[i];
      sprite.position.x += Math.cos(time * 0.01 + i) * 0.006;
      sprite.position.y += Math.sin(time * 0.35 + i) * 0.002;
    }
    const map = this.waterfallMaterial.map;
    if (map) {
      map.offset.y = (map.offset.y - 0.00035) % 1;
    }
    // A névoa pulsa em escala (material é compartilhado; opacidade não pode variar).
    for (let i = 0; i < this.waterMist.length; i++) {
      const mist = this.waterMist[i];
      const pulse = 0.97 + Math.sin(time * 1.1 + i) * 0.03;
      mist.sprite.scale.set(mist.base.x * pulse, mist.base.y * pulse, 1);
    }
  }

  public dispose(): void {
    this.group.traverse((object) => {
      if (object instanceof THREE.Mesh || object instanceof THREE.Sprite) {
        object.geometry?.dispose?.();
      }
    });
    this.cloudSeaMaterial.dispose();
    this.domeMaterial?.map?.dispose();
    this.domeMaterial?.dispose();
  }
}
