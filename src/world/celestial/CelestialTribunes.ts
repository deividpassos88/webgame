import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {
  ARENA,
  PALETTE,
  STAND_CENTER_X,
  STAND_LENGTH,
  STAND_YAW,
  createSeededRandom,
} from './CelestialConfig';
import {
  MeshBatch,
  createBushGeometry,
  createColumnParts,
  createRockGeometry,
} from './CelestialGeometry';
import type { CelestialMaterials } from './CelestialMaterials';

/**
 * Arquibancadas laterais.
 *
 * Estrutura: promenade baixa (onde ficam os brasseiros), balaústre dourado,
 * quatro degraus de multidão, colunata de 7,8 m com entablamento e ático.
 * A multidão é uma única `InstancedMesh` por lado; o resto é fundido por
 * material. Nada aqui entra na área jogável (|x| ≤ 23,5).
 */
export class CelestialTribunes {
  public readonly group = new THREE.Group();
  private readonly localMaterials: THREE.Material[] = [];
  private readonly localTextures: THREE.Texture[] = [];

  public constructor(private readonly materials: CelestialMaterials) {
    this.group.name = 'celestial-tribunes';
    for (const side of [-1, 1] as const) {
      const sideGroup = new THREE.Group();
      sideGroup.name = `tribune-side-${side}`;
      sideGroup.position.x = side * STAND_CENTER_X;
      sideGroup.rotation.y = side > 0 ? STAND_YAW : Math.PI + STAND_YAW;
      // O corpo é construído em coordenadas locais; o pivô fica no centro.
      const local = new THREE.Group();
      local.position.x = -STAND_CENTER_X;
      sideGroup.add(local);
      this.group.add(sideGroup);
      this.buildSide(side, local);
    }
  }

  private copyLimestone(repeatX: number, repeatY: number): THREE.MeshStandardMaterial {
    const source = this.materials.limestoneBlock;
    const material = source.clone();
    if (source.map) {
      const map = source.map.clone();
      map.needsUpdate = true;
      map.repeat.set(repeatX, repeatY);
      material.map = map;
      this.localTextures.push(map);
    }
    this.localMaterials.push(material);
    return material;
  }

  private buildSide(side: -1 | 1, parent: THREE.Group): void {
    const materials = this.materials;
    const batch = new MeshBatch();
    const blockMaterial = this.copyLimestone(26, 5);
    const facadeMaterial = this.copyLimestone(34, 6);
    const length = STAND_LENGTH;
    const promenadeInner = 24.6;
    const balustradeX = 26.9;
    const columnX = 27.55;
    const rearColumnX = 33.6;
    const rearWallX = 35.0;
    const podiumTop = 1.95;
    const columnHeight = 7.2;
    const entablatureY = podiumTop + columnHeight + 0.65;
    const roofY = entablatureY + 1.35;

    // ------------------------------------------------------- promenade da arena
    batch.add(
      new THREE.BoxGeometry(3.5, 0.5, length),
      blockMaterial,
      new THREE.Matrix4().setPosition(promenadeInner + 1.7, -0.13, 0)
    );
    for (const lineX of [promenadeInner + 0.05, 27.3]) {
      batch.add(
        new THREE.BoxGeometry(0.18, 0.09, length),
        materials.gold,
        new THREE.Matrix4().setPosition(lineX, 0.14, 0)
      );
    }

    // ------------------------------------------------------------ pódio (base)
    batch.add(
      new THREE.BoxGeometry(rearWallX - balustradeX + 0.6, 10, length),
      blockMaterial,
      new THREE.Matrix4().setPosition((balustradeX + rearWallX) / 2, podiumTop - 5, 0)
    );
    // Faixa dourada na base do pódio, visível de fora.
    batch.add(
      new THREE.BoxGeometry(0.5, 0.22, length),
      materials.gold,
      new THREE.Matrix4().setPosition(balustradeX + 0.15, -8.1, 0)
    );

    // ------------------------------------------------------------- balaústre
    const baluster = new THREE.CylinderGeometry(0.09, 0.12, 0.78, 8);
    for (let z = -length / 2 + 0.8; z <= length / 2 - 0.8; z += 0.86) {
      batch.add(
        baluster,
        materials.ivory,
        new THREE.Matrix4().setPosition(balustradeX, 0.62, z)
      );
    }
    batch.add(
      new THREE.BoxGeometry(0.22, 0.14, length),
      materials.gold,
      new THREE.Matrix4().setPosition(balustradeX, 1.08, 0)
    );
    batch.add(
      new THREE.BoxGeometry(0.3, 0.22, length),
      materials.ivory,
      new THREE.Matrix4().setPosition(balustradeX, 0.21, 0)
    );

    // ------------------------------------------------------- degraus da multidão
    for (let row = 0; row < ARENA.crowdRows; row++) {
      const top = 1.8 + row * 0.86;
      const x = 27.95 + row * 1.12;
      batch.add(
        new THREE.BoxGeometry(1.22, 0.86, length - 2.4),
        materials.limestone,
        new THREE.Matrix4().setPosition(x, top - 0.43, 0)
      );
      batch.add(
        new THREE.BoxGeometry(0.05, 0.04, length - 2.4),
        materials.goldDark,
        new THREE.Matrix4().setPosition(x - 0.58, top + 0.01, 0)
      );
    }

    // ---------------------------------------------------------------- colunata
    const column = createColumnParts(columnHeight, 0.42);
    const zStart = -35;
    const zStep = 7;
    for (let i = 0; i < 11; i++) {
      const z = zStart + i * zStep;
      batch.add(
        column.base,
        materials.ivory,
        new THREE.Matrix4().setPosition(columnX, podiumTop + columnHeight * 0.025, z)
      );
      batch.add(
        column.shaft,
        materials.ivory,
        new THREE.Matrix4().setPosition(columnX, podiumTop + columnHeight * 0.51, z)
      );
      batch.add(
        column.capital,
        materials.ivory,
        new THREE.Matrix4().setPosition(columnX, podiumTop + columnHeight * 0.94, z)
      );
      batch.add(
        column.abacus,
        materials.gold,
        new THREE.Matrix4().setPosition(columnX, podiumTop + columnHeight * 0.985, z)
      );
      // Coluna traseira, mais alta (fecha a composição atrás da multidão).
      batch.add(
        column.shaft,
        materials.ivory,
        new THREE.Matrix4().setPosition(rearColumnX, podiumTop + columnHeight * 0.75, z)
      );
    }

    // Entablamento, friso dourado, cornija e cobertura.
    batch.add(
      new THREE.BoxGeometry(2.6, 1.3, length),
      materials.ivory,
      new THREE.Matrix4().setPosition(columnX, entablatureY, 0)
    );
    batch.add(
      new THREE.BoxGeometry(3.1, 0.24, length),
      materials.gold,
      new THREE.Matrix4().setPosition(columnX, entablatureY + 0.77, 0)
    );
    batch.add(
      new THREE.BoxGeometry(0.14, 0.5, length),
      materials.goldInlay,
      new THREE.Matrix4().setPosition(columnX - 1.28, entablatureY - 0.1, 0)
    );
    batch.add(
      new THREE.BoxGeometry(4.6, 0.35, length),
      materials.ivory,
      new THREE.Matrix4().setPosition(columnX + 4.4, roofY - 0.55, 0)
    );
    batch.add(
      new THREE.BoxGeometry(4.9, 0.14, length),
      materials.gold,
      new THREE.Matrix4().setPosition(columnX + 4.4, roofY - 0.32, 0)
    );
    batch.add(
      new THREE.BoxGeometry(0.4, 0.7, length),
      materials.gold,
      new THREE.Matrix4().setPosition(columnX + 2.05, roofY - 0.2, 0)
    );
    // Parede de fundo: contraste para a silhueta da multidão.
    batch.add(
      new THREE.BoxGeometry(0.8, 8.4, length),
      facadeMaterial,
      new THREE.Matrix4().setPosition(rearWallX, 5.6, 0)
    );

    // Cabeceiras (fechamento lateral da tribuna).
    for (const endZ of [-length / 2, length / 2]) {
      batch.add(
        new THREE.BoxGeometry(rearWallX - balustradeX + 1.2, 12, 0.8),
        blockMaterial,
        new THREE.Matrix4().setPosition((balustradeX + rearWallX) / 2, -1.4, endZ)
      );
      batch.add(
        new THREE.BoxGeometry(rearWallX - balustradeX + 1.6, 0.3, 1.05),
        materials.gold,
        new THREE.Matrix4().setPosition((balustradeX + rearWallX) / 2, 4.75, endZ)
      );
    }

    batch.build(parent, { castShadow: true, receiveShadow: true, name: 'tribune' });

    this.addCrowd(side, parent);
    this.addUnderstructure(side, parent);
  }

  /** Multidão: quatro filas de silhuetas, uma InstancedMesh por lado. */
  private addCrowd(side: -1 | 1, parent: THREE.Group): void {
    const body = new THREE.CapsuleGeometry(0.26, 0.55, 4, 8);
    body.translate(0, 0.78, 0);
    const head = new THREE.SphereGeometry(0.17, 8, 6);
    head.translate(0, 1.43, 0);
    const shoulders = new THREE.SphereGeometry(0.28, 8, 6);
    shoulders.scale(1.25, 0.55, 0.9);
    shoulders.translate(0, 1.08, 0);
    const geometry = mergeGeometries(
      [body, head, shoulders].map((part) => part.toNonIndexed()),
      false
    );
    if (!geometry) throw new Error('Falha ao montar a geometria da multidão.');
    geometry.computeVertexNormals();

    const rows = ARENA.crowdRows + 1; // última "fila" = público no corrimão
    const spacing = ARENA.crowdSpacing;
    const zLimit = ARENA.standFrontZ - 3;
    const perRow = Math.floor((zLimit * 2) / spacing);
    const count = rows * perRow;
    const material = this.materials.crowd.clone();
    material.color.setHex(0xffffff);
    this.localMaterials.push(material);

    const mesh = new THREE.InstancedMesh(geometry, material, count);
    mesh.name = `tribune-crowd-${side}`;
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    mesh.frustumCulled = false;
    const rand = createSeededRandom(0x0c0d + side * 17);
    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    const quaternion = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    const color = new THREE.Color();
    let index = 0;
    for (let row = 0; row < rows; row++) {
      const isFrontRow = row === rows - 1;
      const x = isFrontRow ? 26.35 : 28.15 + row * 1.18;
      const top = isFrontRow ? 2.72 : 1.8 + row * 0.86;
      for (let i = 0; i < perRow; i++) {
        const z = -zLimit + i * spacing + (rand() - 0.5) * 0.35;
        const height = 1.28 + rand() * 0.22;
        // Os degraus têm 0,8 m de altura e topo em `top`; a origem da
        // silhueta fica no piso da fila, um degrau abaixo.
        position.set(
          side * (x + (rand() - 0.5) * 0.24),
          top - 0.68,
          z + (rand() - 0.5) * 0.18
        );
        quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), (rand() - 0.5) * 0.6);
        scale.set(height, height, height);
        matrix.compose(position, quaternion, scale);
        mesh.setMatrixAt(index, matrix);
        const tone = rand();
        if (tone > 0.9) {
          color.setHex(0x4c3f33);
        } else if (tone > 0.55) {
          color.setHex(0x2a2e38);
        } else {
          color.setHex(PALETTE.crowd);
        }
        color.offsetHSL(0, 0, (rand() - 0.5) * 0.05);
        mesh.setColorAt(index, color);
        index++;
      }
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
    parent.add(mesh);
  }

  /** Rocha e vegetação sob a tribuna (a arena flutua). */
  private addUnderstructure(side: -1 | 1, parent: THREE.Group): void {
    const batch = new MeshBatch();
    const rand = createSeededRandom(0x51de + side * 5);
    for (let i = 0; i < 7; i++) {
      const z = -34 + i * 11 + (rand() - 0.5) * 3;
      const scale = 4 + rand() * 4;
      const rock = createRockGeometry(900 + i + side * 31, 2, 0.5, 0.6);
      const matrix = new THREE.Matrix4()
        .makeRotationY(rand() * Math.PI)
        .scale(new THREE.Vector3(scale, scale * 0.9, scale))
        .setPosition(28 + rand() * 6, -6.5 - rand() * 2, z);
      batch.add(rock, this.materials.rockDark, matrix);
    }
    // Tufos verdes pendurados na borda do terraço.
    for (let i = 0; i < 16; i++) {
      const z = -38 + i * 4.9;
      const bush = createBushGeometry(70 + i);
      const matrix = new THREE.Matrix4()
        .makeRotationY(rand() * Math.PI)
        .scale(new THREE.Vector3(0.8 + rand() * 0.9, 0.5 + rand() * 0.6, 0.8 + rand() * 0.9))
        .setPosition(26.55, 0.35 + rand() * 0.25, z);
      batch.add(bush, this.materials.moss, matrix);
    }
    batch.build(parent, { castShadow: false, receiveShadow: true, name: 'tribune-rock' });
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
