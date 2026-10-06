import * as THREE from 'three';

const TAU = Math.PI * 2;
const UP = new THREE.Vector3(0, 1, 0);

/** A swept sheet, not a cylinder: the open ends and wide water blades define the silhouette. */
export function createWaterRibbon(
  point: (t: number) => THREE.Vector3,
  across: (t: number) => THREE.Vector3,
  width: (t: number) => number,
  segments = 80
): THREE.BufferGeometry {
  const rows = 4;
  const positions: number[] = [];
  const uv: number[] = [];
  const flowCross: number[] = [];
  const indices: number[] = [];
  for (let index = 0; index <= segments; index += 1) {
    const t = index / segments;
    const center = point(t);
    const direction = across(t).normalize();
    const breadth = width(t);
    for (let row = 0; row <= rows; row += 1) {
      const v = row / rows;
      const p = center.clone().addScaledVector(direction, (v - 0.5) * breadth);
      positions.push(p.x, p.y, p.z);
      uv.push(t, v);
      flowCross.push(direction.x * breadth, direction.y * breadth, direction.z * breadth);
      if (index === segments || row === rows) continue;
      const a = index * (rows + 1) + row;
      const b = a + rows + 1;
      indices.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geometry.setAttribute('aFlowCross', new THREE.Float32BufferAttribute(flowCross, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

export const WATER_DRAGON_SHAPE = Object.freeze({
  radius: 2.7,
  height: 4.7,
  turns: 1.82,
  columnHeight: 8.5,
  columnRadius: 0.78,
  impactRadius: 2.65,
});

export function waterDragonSpine(t: number): THREE.Vector3 {
  // A dense, low coil around the torso, then one open S-shaped neck.
  // A constant-pitch spring leaves the character in an empty wire cage.
  const neck = THREE.MathUtils.smoothstep(t, 0.52, 1);
  // Bowl, not a cage: the coil flares wider at the bottom and the mass sits
  // LOW, so the torso and head stay readable instead of being swallowed by the
  // water. The neck then climbs to keep the crest above the character.
  const flare = 1 + (1 - Math.min(t / 0.52, 1)) * 0.16;
  const radius = WATER_DRAGON_SHAPE.radius * flare * (1 - neck * 0.56)
    + Math.sin(t * TAU * 2) * 0.065;
  const angle = t * TAU * WATER_DRAGON_SHAPE.turns;
  const y = 0.40 + Math.min(t / 0.52, 1) * 1.34 + neck * 2.72;
  return new THREE.Vector3(Math.cos(angle) * radius, y, Math.sin(angle) * radius);
}

export function createWaterDragonBody(segments: number): THREE.BufferGeometry {
  return createWaterRibbon(
    waterDragonSpine,
    (t) => {
      const angle = t * TAU * WATER_DRAGON_SHAPE.turns;
      // Bank INWARD. The outward/upward face stays broad in the gameplay camera.
      return new THREE.Vector3(-Math.cos(angle) * 0.5, 1, -Math.sin(angle) * 0.5);
    },
    (t) => (2.05 - THREE.MathUtils.smoothstep(t, 0.42, 1) * 1.12)
      * THREE.MathUtils.smoothstep(t, 0, 0.055),
    segments
  );
}

export function createWaterOrbit(
  radius: number,
  height: number,
  phase: number,
  sweep: number,
  width: number,
  rise = 0,
  bank = 0.2,
  segments = 64
): THREE.BufferGeometry {
  return createWaterRibbon(
    (t) => {
      const angle = phase + sweep * t;
      const r = radius + Math.sin(t * Math.PI) * 0.14;
      return new THREE.Vector3(Math.cos(angle) * r, height + rise * t + Math.sin(t * Math.PI * 2) * 0.1, Math.sin(angle) * r);
    },
    (t) => {
      const angle = phase + sweep * t;
      return new THREE.Vector3(Math.cos(angle) * Math.sin(bank), Math.cos(bank), Math.sin(angle) * Math.sin(bank));
    },
    (t) => width * Math.pow(Math.sin(t * Math.PI), 0.38),
    segments
  );
}

/**
 * A long, tapered water blade that sweeps forward and curls up at the tip —
 * the crest of the reference image, not a faceted tube. Eight-sided
 * cross-sections read as folded paper at gameplay distance; a smooth ribbon
 * with a swelling profile reads as water.
 */
export function createWaterDragonHead(): THREE.BufferGeometry {
  return createWaterRibbon(
    (t) => new THREE.Vector3(
      -1.02 + t * 2.72,
      0.06 + Math.pow(t, 1.7) * 0.72,
      0
    ),
    (t) => new THREE.Vector3(0, 1, 0.30 + t * 0.22),
    // Zero at both ends: joins the neck at the base and ends in a point.
    (t) => 0.42 * Math.pow(Math.sin(Math.PI * Math.pow(t, 0.52)), 0.62),
    44
  );
}

/** A separate lower jaw leaves a readable dragon profile, rather than a round snout. */
export function createWaterDragonJaw(): THREE.BufferGeometry {
  return createWaterRibbon(
    (t) => new THREE.Vector3(-0.42 + t * 2.1, -0.12 - Math.sin(t * Math.PI) * 0.12 + t * 0.24, 0),
    () => new THREE.Vector3(0, 1, 0.55),
    (t) => 0.20 * Math.pow(Math.sin(Math.PI * Math.pow(t, 0.6)), 0.7),
    28
  );
}

/**
 * Thin membrane swept BACK along the neck, like water torn off the crest.
 * Longer/straighter blades read as horns or a beak, which breaks the silhouette.
 */
export function createWaterDragonFin(side: number): THREE.BufferGeometry {
  return createWaterRibbon(
    (t) => new THREE.Vector3(
      -0.30 - t * 1.30,
      0.20 + Math.sin(t * Math.PI * 0.7) * 0.20 - t * t * 0.30,
      side * (0.10 + t * 0.22)
    ),
    (t) => new THREE.Vector3(0, 0.9, side * (0.45 + t * 0.5)),
    (t) => 0.20 * Math.pow(Math.sin(Math.PI * Math.pow(t, 0.55)), 0.9),
    26
  );
}

/**
 * Lâmina da coroa de respingos: estreita, alta e pontuda, subindo em curva.
 * Larga e baixa (a versão anterior) ela virava uma aba mole deitada no chão em
 * vez dos bicos que a referência mostra em volta da coluna.
 */
export function createWaterCrownPetal(angle: number, seed: number): THREE.BufferGeometry {
  const height = 0.85 + (Math.sin(seed * 2.71) * 0.5 + 0.5) * 1.05;
  const reach = 0.95 + (Math.sin(seed * 4.31) * 0.5 + 0.5) * 0.85;
  return createWaterRibbon(
    (t) => {
      const a = angle + Math.sin(t * Math.PI) * 0.16;
      // Arco de fonte: sobe quase reto junto da coluna e só então abre para
      // fora. Abrindo desde o pé (versão anterior) a lâmina deitava no chão.
      const radius = 0.42 + Math.pow(t, 1.5) * reach;
      const lift = Math.sin(Math.pow(t, 0.7) * Math.PI * 0.85) * height;
      return new THREE.Vector3(Math.cos(a) * radius, 0.08 + lift, Math.sin(a) * radius);
    },
    () => new THREE.Vector3(-Math.sin(angle), 0.35, Math.cos(angle)),
    // Zero nas duas pontas: nasce no pé da coluna e termina em bico.
    (t) => Math.pow(Math.sin(Math.PI * Math.pow(t, 0.85)), 0.9) * (0.78 - t * 0.30),
    30
  );
}

export function createWaterColumnBody(radialSegments: number): THREE.BufferGeometry {
  const shape = WATER_DRAGON_SHAPE;
  const geometry = new THREE.CylinderGeometry(shape.columnRadius * 0.88, shape.columnRadius, shape.columnHeight, radialSegments, 48, true);
  geometry.translate(0, shape.columnHeight / 2, 0);
  geometry.setAttribute('aFlowCross', new THREE.Float32BufferAttribute(new Float32Array(geometry.getAttribute('position').count * 3), 3));
  return geometry;
}

export function createWaterColumnVeil(phase: number): THREE.BufferGeometry {
  const geometry = createWaterRibbon(
    (t) => {
      const angle = phase + Math.sin(t * 6.2 + phase) * 0.12;
      const radius = WATER_DRAGON_SHAPE.columnRadius * (0.92 + Math.sin(t * 11 + phase) * 0.14);
      return new THREE.Vector3(Math.cos(angle) * radius, t * WATER_DRAGON_SHAPE.columnHeight, Math.sin(angle) * radius);
    },
    () => new THREE.Vector3(-Math.sin(phase), 0, Math.cos(phase)),
    (t) => (0.55 + Math.sin(t * 17 + phase) * 0.14) * Math.pow(Math.sin(t * Math.PI), 0.16),
    80
  );
  const uv = geometry.getAttribute('uv');
  // Every falling layer shares the same vertical convention: v=0 at the floor.
  // Never pass negative animation time to a ribbon pretending to be a waterfall.
  for (let index = 0; index < uv.count; index += 1) {
    const along = uv.getX(index), across = uv.getY(index);
    uv.setXY(index, across + phase / TAU, along);
  }
  return geometry;
}

/**
 * Broad sheet trailing the main spiral, like water pulled off the band.
 * Narrow, sharply pointed sheets read as torn paper or debris stuck to the
 * effect, so these stay wide, short and soft.
 */
export function createWaterWakeFin(at: number, side: number): THREE.BufferGeometry {
  const origin = waterDragonSpine(at);
  const tangent = waterDragonSpine(Math.min(1, at + 0.01)).sub(origin).normalize();
  const radial = new THREE.Vector3(origin.x, 0, origin.z).normalize();
  return createWaterRibbon(
    (t) => origin.clone().addScaledVector(tangent, -t * 1.15)
      .addScaledVector(radial, t * t * 0.34)
      .addScaledVector(UP, side * (0.06 + Math.sin(t * Math.PI * 0.7) * 0.20)),
    () => UP.clone().addScaledVector(radial, 0.25),
    (t) => Math.pow(Math.sin(t * Math.PI), 0.6) * (0.62 - t * 0.30),
    22
  );
}
