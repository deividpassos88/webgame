import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { createSeededRandom } from './CelestialConfig';

/**
 * Utilitarios de geometria da arena.
 *
 * O cenario tem centenas de pecas pequenas (molduras, capiteis, balaustres).
 * Elas sao acumuladas por material em `MeshBatch` e fundidas em uma malha por
 * material — o jogo inteiro desenha a arena com poucas dezenas de draw calls.
 */

const MERGE_ATTRIBUTES = ['position', 'normal', 'uv'] as const;

export function diamondShape(width: number, height = width): THREE.Shape {
  const shape = new THREE.Shape();
  shape.moveTo(0, height / 2);
  shape.lineTo(width / 2, 0);
  shape.lineTo(0, -height / 2);
  shape.lineTo(-width / 2, 0);
  shape.closePath();
  return shape;
}

/** Losango com um entalhe vertical (o emblema das bandeiras/plintos). */
export function emblemShape(width: number, height: number): THREE.Shape {
  const shape = new THREE.Shape();
  const halfW = width / 2;
  const halfH = height / 2;
  shape.moveTo(0, halfH);
  shape.lineTo(halfW * 0.72, halfH * 0.12);
  shape.lineTo(0, -halfH);
  shape.lineTo(-halfW * 0.72, halfH * 0.12);
  shape.closePath();
  return shape;
}

/** Placa horizontal com bisel, usada em todas as incrustacoes do piso. */
export function horizontalPlate(
  shape: THREE.Shape,
  height: number,
  bevel: number,
  y = 0
): THREE.BufferGeometry {
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: height,
    bevelEnabled: true,
    bevelThickness: bevel * 0.55,
    bevelSize: bevel,
    bevelSegments: 2,
    curveSegments: 6,
  });
  geometry.rotateX(-Math.PI / 2);
  geometry.translate(0, y, 0);
  return geometry;
}

/**
 * Bandeira: malha aberta com ondulacao, ponta triangular para baixo.
 * A textura vem de `makeBannerTexture`; a geometria recorta a ponta.
 */
export function createBannerGeometry(
  width: number,
  height: number,
  tip: number,
  seed = 1,
  columns = 14,
  rows = 26
): THREE.BufferGeometry {
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const rand = createSeededRandom(seed);
  const phase = rand() * Math.PI * 2;

  const bottomAt = (u: number) => -(height + tip * Math.pow(1 - Math.abs(2 * u - 1), 1.35));
  const zAt = (u: number, v: number) => {
    const wave = Math.sin(u * Math.PI) * 0.10 * (0.35 + 0.65 * v);
    const fold = Math.sin(u * Math.PI * 5.5 + phase) * 0.028 * v;
    const sag = Math.sin(v * Math.PI * 0.8) * 0.02;
    return wave + fold + sag;
  };

  for (let row = 0; row <= rows; row++) {
    const v = row / rows;
    for (let col = 0; col <= columns; col++) {
      const u = col / columns;
      const x = (u - 0.5) * width;
      const y = v * bottomAt(u);
      positions.push(x, y, zAt(u, v));
      uvs.push(u, 1 - v);
    }
  }
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < columns; col++) {
      const a = row * (columns + 1) + col;
      const b = a + 1;
      const c = a + columns + 1;
      const d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

/**
 * Rocha flutuante: esfera baixa com deslocamento deterministico, topo plano e
 * base afinada. A mesma funcao gera ilhas grandes e cascalhos.
 */
export function createRockGeometry(
  seed: number,
  detail = 3,
  topFlat = 0.52,
  taper = 0.5
): THREE.BufferGeometry {
  const geometry = new THREE.IcosahedronGeometry(1, detail);
  const position = geometry.getAttribute('position') as THREE.BufferAttribute;
  const rand = createSeededRandom(seed);
  const wobbleA = 1.6 + rand() * 2.2;
  const wobbleB = 2.4 + rand() * 3.1;
  const wobbleC = 4.1 + rand() * 3.7;
  const offset = rand() * 10;

  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i);
    const y = position.getY(i);
    const z = position.getZ(i);
    const noise =
      Math.sin(x * wobbleA + offset) * Math.cos(z * wobbleB - offset) * 0.16 +
      Math.sin(y * wobbleC + x * 1.7) * 0.09;
    const radial = 1 + noise;
    let nx = x * radial;
    let ny = y * radial;
    let nz = z * radial;
    if (ny > topFlat) ny = topFlat + (ny - topFlat) * 0.06;
    if (ny < 0) {
      const t = 1 + ny * taper;
      nx *= t;
      nz *= t;
    }
    position.setXYZ(i, nx, ny, nz);
  }
  geometry.computeVertexNormals();
  return geometry;
}

/** Coluna classica: base, fuste com caneluras, capitel e abaco. */
export function createColumnParts(height: number, radius: number): {
  base: THREE.BufferGeometry;
  shaft: THREE.BufferGeometry;
  capital: THREE.BufferGeometry;
  abacus: THREE.BufferGeometry;
} {
  const base = new THREE.CylinderGeometry(radius * 1.42, radius * 1.55, height * 0.05, 20);
  const shaft = new THREE.CylinderGeometry(radius * 0.88, radius, height * 0.82, 20, 1, false);
  const capital = new THREE.CylinderGeometry(radius * 1.25, radius * 0.88, height * 0.08, 20);
  const abacus = new THREE.BoxGeometry(radius * 3.1, height * 0.05, radius * 3.1);
  return { base, shaft, capital, abacus };
}

/** Taça do braseiro (perfil em lathe) com lábio reforcado. */
export function createBrazierBowlGeometry(radius: number, height: number): THREE.BufferGeometry {
  const points: THREE.Vector2[] = [];
  points.push(new THREE.Vector2(radius * 0.16, 0));
  points.push(new THREE.Vector2(radius * 0.42, height * 0.12));
  points.push(new THREE.Vector2(radius * 0.72, height * 0.4));
  points.push(new THREE.Vector2(radius * 0.92, height * 0.72));
  points.push(new THREE.Vector2(radius, height));
  points.push(new THREE.Vector2(radius * 0.93, height));
  points.push(new THREE.Vector2(radius * 0.86, height * 0.8));
  points.push(new THREE.Vector2(radius * 0.64, height * 0.46));
  points.push(new THREE.Vector2(radius * 0.34, height * 0.16));
  points.push(new THREE.Vector2(radius * 0.1, height * 0.04));
  const geometry = new THREE.LatheGeometry(points, 24);
  geometry.computeVertexNormals();
  return geometry;
}

/** Coroa de folhas low-poly (uma esfera achatada por arbusto). */
export function createBushGeometry(seed: number): THREE.BufferGeometry {
  const rand = createSeededRandom(seed);
  const geometry = new THREE.IcosahedronGeometry(1, 1);
  const position = geometry.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < position.count; i++) {
    const scale = 0.75 + rand() * 0.5;
    position.setXYZ(
      i,
      position.getX(i) * scale,
      position.getY(i) * scale * 0.8,
      position.getZ(i) * scale
    );
  }
  geometry.computeVertexNormals();
  return geometry;
}

/** Cipreste: tronco fino + tres cones empilhados. */
export function createCypressParts(): {
  trunk: THREE.BufferGeometry;
  crown: THREE.BufferGeometry;
} {
  const trunk = new THREE.CylinderGeometry(0.1, 0.14, 1.4, 6);
  trunk.translate(0, 0.7, 0);
  const crownA = new THREE.ConeGeometry(0.85, 2.6, 7);
  crownA.translate(0, 2.2, 0);
  const crownB = new THREE.ConeGeometry(0.62, 2.0, 7);
  crownB.translate(0, 3.5, 0);
  const crownC = new THREE.ConeGeometry(0.36, 1.5, 7);
  crownC.translate(0, 4.5, 0);
  const crown = mergeGeometries([crownA, crownB, crownC].map((g) => g.toNonIndexed()), false)!;
  return { trunk, crown };
}

type BatchPart = { geometry: THREE.BufferGeometry; matrix?: THREE.Matrix4 };

/**
 * Acumulador de malhas por material. `build` devolve uma malha fundida por
 * material, com sombra configuravel.
 */
export class MeshBatch {
  private readonly parts = new Map<THREE.Material, BatchPart[]>();

  public add(
    geometry: THREE.BufferGeometry,
    material: THREE.Material,
    matrix?: THREE.Matrix4
  ): void {
    const list = this.parts.get(material) ?? [];
    list.push({ geometry, matrix });
    this.parts.set(material, list);
  }

  /** Atalho: caixa posicionada/rotacionada em Y. */
  public addBox(
    size: readonly [number, number, number],
    position: readonly [number, number, number],
    material: THREE.Material,
    rotationY = 0
  ): void {
    const matrix = new THREE.Matrix4()
      .makeRotationY(rotationY)
      .setPosition(position[0], position[1], position[2]);
    this.add(new THREE.BoxGeometry(size[0], size[1], size[2]), material, matrix);
  }

  /** Atalho: peca com rotacao/posicao completas. */
  public addTransformed(
    geometry: THREE.BufferGeometry,
    material: THREE.Material,
    position: readonly [number, number, number],
    rotation: THREE.Euler | null = null,
    scale: readonly [number, number, number] = [1, 1, 1]
  ): void {
    const matrix = new THREE.Matrix4();
    const quaternion = new THREE.Quaternion();
    if (rotation) quaternion.setFromEuler(rotation);
    matrix.compose(
      new THREE.Vector3(position[0], position[1], position[2]),
      quaternion,
      new THREE.Vector3(scale[0], scale[1], scale[2])
    );
    this.add(geometry, material, matrix);
  }

  public get empty(): boolean {
    return this.parts.size === 0;
  }

  public build(
    parent: THREE.Object3D,
    options: { castShadow?: boolean; receiveShadow?: boolean; name?: string } = {}
  ): THREE.Mesh[] {
    const meshes: THREE.Mesh[] = [];
    for (const [material, parts] of this.parts) {
      const geometries: THREE.BufferGeometry[] = [];
      for (const part of parts) {
        const geometry = part.geometry.index ? part.geometry.toNonIndexed() : part.geometry.clone();
        for (const name of Object.keys(geometry.attributes)) {
          if (!(MERGE_ATTRIBUTES as readonly string[]).includes(name)) {
            geometry.deleteAttribute(name);
          }
        }
        if (!geometry.getAttribute('uv')) {
          const count = geometry.getAttribute('position').count;
          geometry.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(count * 2), 2));
        }
        if (part.matrix) geometry.applyMatrix4(part.matrix);
        geometries.push(geometry);
      }
      const merged = mergeGeometries(geometries, false);
      if (!merged) {
        throw new Error('Falha ao fundir a geometria da arena (atributos incompatíveis).');
      }
      merged.computeBoundingSphere();
      const mesh = new THREE.Mesh(merged, material);
      mesh.name = options.name ?? 'celestial-batch';
      mesh.castShadow = options.castShadow ?? true;
      mesh.receiveShadow = options.receiveShadow ?? true;
      parent.add(mesh);
      meshes.push(mesh);
    }
    this.parts.clear();
    return meshes;
  }
}

/** Caixa com cantos arredondados, usada em capiteis e bases. */
export function roundedBox(
  width: number,
  height: number,
  depth: number,
  radius = 0.04
): THREE.BufferGeometry {
  return new THREE.BoxGeometry(width, height, depth);
}

/** Viga horizontal entre dois pontos (para corrimãos e mastros). */
export function beamBetween(
  from: THREE.Vector3,
  to: THREE.Vector3,
  radius: number
): THREE.BufferGeometry {
  const direction = new THREE.Vector3().subVectors(to, from);
  const length = direction.length();
  const geometry = new THREE.CylinderGeometry(radius, radius, length, 8);
  const quaternion = new THREE.Quaternion().setFromUnitVectors(
    new THREE.Vector3(0, 1, 0),
    direction.clone().normalize()
  );
  const matrix = new THREE.Matrix4().compose(
    new THREE.Vector3().addVectors(from, to).multiplyScalar(0.5),
    quaternion,
    new THREE.Vector3(1, 1, 1)
  );
  geometry.applyMatrix4(matrix);
  return geometry;
}
