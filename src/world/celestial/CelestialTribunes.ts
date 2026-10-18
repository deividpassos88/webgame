import * as THREE from 'three';
import {
  STAND_CENTER_X,
  STAND_LENGTH,
  STAND_YAW,
  createSeededRandom,
} from './CelestialConfig';
import {
  MeshBatch,
  createBrazierBowlGeometry,
  createBushGeometry,
  createColumnParts,
  createRockGeometry,
} from './CelestialGeometry';
import type { CelestialMaterials } from './CelestialMaterials';

/**
 * Tribunas laterais, na leitura da ref 1:
 *
 * - deck no mesmo nível do piso da arena;
 * - fachada de pedra com molduras douradas, painéis e placa de safira;
 * - balaustrada dourada na frente e banco de multidão inclinado atrás;
 * - colunata clássica fechando o fundo;
 * - dois pilares altos com braseiro e bandeira, nos cantos da frente;
 * - rocha e musgo pendurados sob a fachada (a arena flutua).
 *
 * O lado esquerdo é o direito rodado 180°, então as duas tribunas são espelhos
 * exatos. Nada entra na área jogável (|x| ≤ 25).
 */
export class CelestialTribunes {
  public readonly group = new THREE.Group();
  private readonly localMaterials: THREE.Material[] = [];
  private readonly localTextures: THREE.Texture[] = [];
  private readonly flameSprites: { sprite: THREE.Sprite; base: THREE.Vector2; phase: number }[] = [];

  public constructor(private readonly materials: CelestialMaterials) {
    this.group.name = 'celestial-tribunes';
    for (const side of [-1, 1] as const) {
      const sideGroup = new THREE.Group();
      sideGroup.name = `tribune-side-${side}`;
      // As tribunas ficam atrás das esquinas do fundo, de frente para a
      // câmera da ref 1 (o eixo longo corre em x).
      sideGroup.position.set(side * 42, 0, -26);
      sideGroup.rotation.y = Math.PI / 2;
      const local = new THREE.Group();
      local.position.x = -STAND_CENTER_X;
      sideGroup.add(local);
      this.group.add(sideGroup);
      this.buildSide(side, local);
    }
  }

  private cloneMaterial(
    source: THREE.MeshStandardMaterial,
    repeatX: number,
    repeatY: number
  ): THREE.MeshStandardMaterial {
    const material = source.clone();
    if (source.map) {
      const map = source.map.clone();
      map.needsUpdate = true;
      map.wrapS = THREE.RepeatWrapping;
      map.wrapT = THREE.RepeatWrapping;
      map.repeat.set(repeatX, repeatY);
      material.map = map;
      this.localTextures.push(map);
    }
    this.localMaterials.push(material);
    return material;
  }

  /** Plano de 4 vértices sobre o talude da multidão (frente embaixo, fundo em cima). */
  private slopePlane(
    start: THREE.Vector3,
    end: THREE.Vector3,
    z0: number,
    z1: number,
    uRepeat: number
  ): THREE.BufferGeometry {
    const geometry = new THREE.BufferGeometry();
    const p = [
      start.x, start.y, z0,
      end.x, end.y, z0,
      end.x, end.y, z1,
      start.x, start.y, z1,
    ];
    const uv = [0, 0, 1, 0, 1, 1, 0, 1];
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
    // u corre no comprimento (repetição horizontal), v sobe o talude.
    const uvScaled = [0, 0, 0, 1, uRepeat, 1, uRepeat, 0];
    void uv;
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvScaled, 2));
    geometry.setIndex([0, 1, 2, 0, 2, 3]);
    geometry.computeVertexNormals();
    return geometry;
  }

  private buildSide(side: -1 | 1, parent: THREE.Group): void {
    const materials = this.materials;
    const batch = new MeshBatch();
    const length = STAND_LENGTH;
    const halfLength = length / 2;
    const block = this.cloneMaterial(materials.limestoneBlock, 22, 3);
    const blockLight = this.cloneMaterial(materials.marblePolished, 18, 2);

    // Medidas em x absoluto (a frente fica em 26, o fundo em 38.5).
    const frontX = 32.9;
    const deckBackX = 44.5;
    const deckTop = 0;
    const fasciaBottom = -8.4;
    const railX = 32.35;
    const seatFrontX = 33.55;
    const seatBackX = 40.3;
    const seatFrontY = 1.1;
    const seatBackY = 5.6;
    const columnX = 43.6;
    const columnHeight = 7.0;
    const entablatureY = 7.2;

    // ------------------------------------------------------------- deck e laje
    batch.add(
      new THREE.BoxGeometry(deckBackX - frontX, 1.3, length),
      block,
      new THREE.Matrix4().setPosition((frontX + deckBackX) / 2, deckTop - 0.65, 0)
    );
    batch.add(
      new THREE.BoxGeometry(deckBackX - frontX + 0.3, 0.12, length),
      block,
      new THREE.Matrix4().setPosition((frontX + deckBackX) / 2, deckTop + 0.06, 0)
    );

    // --------------------------------------------------------------- fachada
    batch.add(
      new THREE.BoxGeometry(1.0, deckTop - fasciaBottom, length),
      block,
      new THREE.Matrix4().setPosition(frontX - 0.4, (deckTop + fasciaBottom) / 2, 0)
    );
    for (const [y, h, out] of [
      [deckTop - 0.35, 0.5, 0.28],
      [deckTop - 3.6, 0.28, 0.2],
      [fasciaBottom + 0.35, 0.6, 0.24],
    ] as const) {
      batch.add(
        new THREE.BoxGeometry(0.36 + out, h, length + 0.2),
        materials.gold,
        new THREE.Matrix4().setPosition(frontX - 0.55 + out / 2, y, 0)
      );
    }
    // Painéis rebaixados entre as bandeiras.
    for (let i = -2; i <= 2; i++) {
      batch.add(
        new THREE.BoxGeometry(0.24, 3.2, 6.6),
        materials.limestone,
        new THREE.Matrix4().setPosition(frontX - 0.86, deckTop - 2.2, i * 9.4)
      );
      batch.add(
        new THREE.BoxGeometry(0.22, 2.7, 6.0),
        block,
        new THREE.Matrix4().setPosition(frontX - 0.9, deckTop - 2.2, i * 9.4)
      );
    }
    // Placa de safira na quina da fachada (ref 1).
    for (const endZ of [-halfLength + 1.4, halfLength - 1.4]) {
      batch.add(
        new THREE.OctahedronGeometry(0.62, 0),
        materials.sapphire,
        new THREE.Matrix4()
          .makeScale(0.55, 1.5, 1.0)
          .setPosition(frontX - 0.95, deckTop - 1.6, endZ)
      );
      batch.add(
        new THREE.BoxGeometry(0.18, 2.2, 1.9),
        materials.gold,
        new THREE.Matrix4().setPosition(frontX - 0.9, deckTop - 1.6, endZ)
      );
    }

    // ------------------------------------------------------------- balaustrada
    const postCount = Math.floor(length / 1.35);
    for (let i = 0; i <= postCount; i++) {
      const z = -halfLength + (i * length) / postCount;
      batch.add(
        new THREE.BoxGeometry(0.16, 1.05, 0.16),
        materials.gold,
        new THREE.Matrix4().setPosition(railX, 0.62, z)
      );
    }
    for (const y of [0.32, 0.72, 1.14]) {
      batch.add(
        new THREE.BoxGeometry(0.12, y > 1 ? 0.14 : 0.08, length),
        materials.gold,
        new THREE.Matrix4().setPosition(railX, y, 0)
      );
    }

    // ------------------------------------------------------ banco de multidão
    const crowd = this.materials.crowdReference.clone();
    crowd.side = THREE.DoubleSide;
    crowd.color = new THREE.Color(0xd9dfea);
    const crowdMap = this.materials.crowdReference.map?.clone();
    if (crowdMap) {
      crowdMap.needsUpdate = true;
      crowdMap.wrapS = THREE.RepeatWrapping;
      crowdMap.wrapT = THREE.ClampToEdgeWrapping;
      crowdMap.repeat.set(Math.max(1, Math.round(length / 2.8)), 1);
      this.localTextures.push(crowdMap);
      crowd.map = crowdMap;
    }
    this.localMaterials.push(crowd);
    const bank = new THREE.Mesh(
      this.slopePlane(
        new THREE.Vector3(seatFrontX, seatFrontY, 0),
        new THREE.Vector3(seatBackX, seatBackY, 0),
        -halfLength + 0.4,
        halfLength - 0.4,
        1
      ),
      crowd
    );
    bank.name = 'tribune-crowd';
    bank.frustumCulled = false;
    parent.add(bank);

    // Volume escuro sob/atrás da multidão: nenhuma fresta de céu.
    batch.add(
      new THREE.BoxGeometry(0.9, 4.0, length),
      materials.crowd,
      new THREE.Matrix4().setPosition(seatBackX + 0.1, seatFrontY + 2.0, 0)
    );
    batch.add(
      new THREE.BoxGeometry(0.9, 1.1, length),
      materials.crowd,
      new THREE.Matrix4().setPosition(seatFrontX + 0.1, seatFrontY - 0.25, 0)
    );
    // Guarda-corpo dourado na boca da multidão (ref 1).
    batch.add(
      new THREE.BoxGeometry(0.16, 0.12, length),
      materials.gold,
      new THREE.Matrix4().setPosition(seatFrontX - 0.3, seatFrontY + 1.05, 0)
    );
    batch.add(
      new THREE.BoxGeometry(0.12, 0.1, length),
      materials.gold,
      new THREE.Matrix4().setPosition(seatFrontX - 0.3, seatFrontY + 0.6, 0)
    );
    for (let i = 0; i <= Math.floor(length / 1.8); i++) {
      const z = -halfLength + (i * length) / Math.floor(length / 1.8);
      batch.add(
        new THREE.BoxGeometry(0.1, 1.0, 0.1),
        materials.gold,
        new THREE.Matrix4().setPosition(seatFrontX - 0.3, seatFrontY + 0.55, z)
      );
    }

    // ---------------------------------------------------------------- colunata
    const column = createColumnParts(columnHeight, 0.52);
    const columnStep = 6.6;
    const columnCount = Math.floor(length / columnStep);
    for (let i = 0; i <= columnCount; i++) {
      const z = -halfLength + 1.6 + (i * (length - 3.2)) / columnCount;
      batch.add(
        column.base,
        materials.ivory,
        new THREE.Matrix4().setPosition(columnX, deckTop + columnHeight * 0.03, z)
      );
      batch.add(
        column.shaft,
        materials.ivory,
        new THREE.Matrix4().setPosition(columnX, deckTop + columnHeight * 0.52, z)
      );
      batch.add(
        column.capital,
        materials.ivory,
        new THREE.Matrix4().setPosition(columnX, deckTop + columnHeight * 0.95, z)
      );
      batch.add(
        column.abacus,
        materials.gold,
        new THREE.Matrix4().setPosition(columnX, deckTop + columnHeight * 0.995, z)
      );
    }
    batch.add(
      new THREE.BoxGeometry(2.3, 1.0, length),
      materials.ivory,
      new THREE.Matrix4().setPosition(columnX, entablatureY + 0.4, 0)
    );
    batch.add(
      new THREE.BoxGeometry(2.7, 0.2, length + 0.1),
      materials.gold,
      new THREE.Matrix4().setPosition(columnX, entablatureY + 1.0, 0)
    );
    batch.add(
      new THREE.BoxGeometry(2.45, 0.28, length + 0.2),
      materials.ivory,
      new THREE.Matrix4().setPosition(columnX, entablatureY + 1.24, 0)
    );
    // Parede de fundo, só até a altura da multidão.
    batch.add(
      new THREE.BoxGeometry(0.7, 3.0, length),
      block,
      new THREE.Matrix4().setPosition(deckBackX - 0.6, deckTop - 1.5, 0)
    );

    // ------------------------------------------------- pilares com braseiro
    for (const z of [-9.5, 9.5]) {
      const px = frontX - 0.6;
      batch.add(
        new THREE.BoxGeometry(1.9, 10.6, 1.9),
        block,
        new THREE.Matrix4().setPosition(px, 4.2, z)
      );
      batch.add(
        new THREE.BoxGeometry(2.2, 0.36, 2.2),
        materials.gold,
        new THREE.Matrix4().setPosition(px, 0.18, z)
      );
      for (const y of [3.1, 6.9]) {
        batch.add(
          new THREE.BoxGeometry(2.12, 0.24, 2.12),
          materials.gold,
          new THREE.Matrix4().setPosition(px, y, z)
        );
      }
      batch.add(
        new THREE.BoxGeometry(2.5, 0.34, 2.5),
        materials.gold,
        new THREE.Matrix4().setPosition(px, 9.62, z)
      );
      batch.add(
        new THREE.BoxGeometry(2.1, 0.2, 2.1),
        materials.goldDark,
        new THREE.Matrix4().setPosition(px, 9.82, z)
      );
      const bowl = createBrazierBowlGeometry(1.05, 0.72);
      batch.add(bowl, materials.gold, new THREE.Matrix4().setPosition(px, 10.05, z));
      batch.add(
        new THREE.CylinderGeometry(1.12, 1.12, 0.08, 16),
        materials.goldDark,
        new THREE.Matrix4().setPosition(px, 10.12, z)
      );
      const flame = new THREE.Sprite(materials.flame);
      flame.position.set(px, 10.95, z);
      flame.scale.set(1.9, 3.1, 1);
      flame.renderOrder = 3;
      parent.add(flame);
      this.flameSprites.push({ sprite: flame, base: new THREE.Vector2(1.9, 3.1), phase: z });
      const glow = new THREE.Sprite(materials.flame);
      glow.position.set(px, 10.5, z);
      glow.scale.set(3.1, 2.4, 1);
      glow.renderOrder = 2;
      parent.add(glow);
      this.flameSprites.push({ sprite: glow, base: new THREE.Vector2(3.1, 2.4), phase: z + 1 });
    }

    // Cabeceiras: fecham a tribuna nas pontas.
    for (const endZ of [-halfLength, halfLength]) {
      batch.add(
        new THREE.BoxGeometry(deckBackX - frontX + 1.4, 2.2, 1.0),
        block,
        new THREE.Matrix4().setPosition((frontX + deckBackX) / 2, deckTop - 9.6, endZ)
      );
    }

    batch.build(parent, { castShadow: true, receiveShadow: true, name: 'tribune' });
    this.addUnderstructure(side, parent);
  }

  /** Posições das bandeiras das pilastras, em coordenadas de mundo. */
  public bannerPlacements(): { x: number; y: number; z: number; rotationY: number }[] {
    const out: { x: number; y: number; z: number; rotationY: number }[] = [];
    for (const side of [-1, 1] as const) {
      for (const z of [-9.5, 9.5]) {
        out.push({
          x: side * (26.1 - 1.62),
          y: 6.5,
          z,
          rotationY: side > 0 ? 0 : Math.PI,
        });
      }
    }
    return out;
  }

  /** Rocha, musgo e pedras penduradas sob a fachada. */
  private addUnderstructure(side: -1 | 1, parent: THREE.Group): void {
    const batch = new MeshBatch();
    const rand = createSeededRandom(0x51de + side * 5);
    for (let i = 0; i < 8; i++) {
      const z = -34 + i * 9.7 + (rand() - 0.5) * 3;
      const scale = 4.5 + rand() * 4.5;
      const rock = createRockGeometry(900 + i + side * 31, 2, 0.5, 0.6);
      const matrix = new THREE.Matrix4()
        .makeRotationY(rand() * Math.PI)
        .scale(new THREE.Vector3(scale, scale * 1.15, scale))
        .setPosition(35.8 + rand() * 6, -10 - rand() * 4, z);
      batch.add(rock, this.materials.rockDark, matrix);
    }
    // Saia de rocha logo sob a laje: é ela que faz a tribuna "flutuar" na ref 1.
    for (let i = 0; i < 7; i++) {
      const z = -15.5 + i * 5.2 + (rand() - 0.5) * 2;
      const scale = 3.2 + rand() * 2.6;
      const rock = createRockGeometry(1200 + i + side * 17, 2, 0.45, 0.55);
      const matrix = new THREE.Matrix4()
        .makeRotationY(rand() * Math.PI)
        .scale(new THREE.Vector3(scale, scale * 0.9, scale))
        .setPosition(33.6 + rand() * 3.4, -2.6 - rand() * 3.4, z);
      batch.add(rock, this.materials.rock, matrix);
    }
    for (let i = 0; i < 18; i++) {
      const z = -24 + i * 2.8;
      const bush = createBushGeometry(70 + i);
      const matrix = new THREE.Matrix4()
        .makeRotationY(rand() * Math.PI)
        .scale(new THREE.Vector3(0.9 + rand() * 0.9, 0.6 + rand() * 0.7, 0.9 + rand() * 0.9))
        .setPosition(32.8, -8.4 - rand() * 1.2, z);
      batch.add(bush, this.materials.moss, matrix);
    }
    batch.build(parent, { castShadow: false, receiveShadow: true, name: 'tribune-rock' });
  }

  public update(time: number): void {
    for (const item of this.flameSprites) {
      const pulse = 0.94 + Math.sin(time * 6.5 + item.phase) * 0.06;
      item.sprite.scale.set(item.base.x * pulse, item.base.y * (2 - pulse), 1);
    }
  }

  public dispose(): void {
    this.group.traverse((object) => {
      if (object instanceof THREE.Mesh) object.geometry.dispose();
    });
    for (const material of this.localMaterials) material.dispose();
    for (const texture of this.localTextures) texture.dispose();
    this.localMaterials.length = 0;
    this.localTextures.length = 0;
  }
}
