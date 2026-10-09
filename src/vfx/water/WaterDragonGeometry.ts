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
  const radius = WATER_DRAGON_SHAPE.radius * (1 - neck * 0.54) + Math.sin(t * TAU * 2) * 0.065;
  const angle = t * TAU * WATER_DRAGON_SHAPE.turns;
  const y = 0.5 + Math.min(t / 0.52, 1) * 1.6 + neck * 2.85;
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

/** Faceted, long-snouted hydro-dragon head, shaped like the crest of the reference. */
export function createWaterDragonHead(): THREE.BufferGeometry {
  const sections = [
    [-1.0, -0.06, 0.23, 0.25], [-0.55, 0.06, 0.30, 0.38],
    [-0.12, 0.16, 0.24, 0.33], [0.35, 0.10, 0.13, 0.23],
    [0.95, 0.05, 0.09, 0.15], [1.60, 0.06, 0.08, 0.11],
    [1.85, 0.11, 0.05, 0.08],
  ];
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const sides = 8;
  sections.forEach(([x, y, h, w], index) => {
    for (let side = 0; side <= sides; side += 1) {
      const angle = side / sides * TAU;
      positions.push(x, y + Math.cos(angle) * h, Math.sin(angle) * w);
      uvs.push(index / (sections.length - 1), side / sides);
      if (index === sections.length - 1 || side === sides) continue;
      const a = index * (sides + 1) + side;
      const b = a + sides + 1;
      indices.push(a, b, a + 1, a + 1, b, b + 1);
    }
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setAttribute('aFlowCross', new THREE.Float32BufferAttribute(new Float32Array(positions.length), 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

/** A separate lower jaw leaves a readable dragon profile, rather than a round snout. */
export function createWaterDragonJaw(): THREE.BufferGeometry {
  return createWaterRibbon(
    (t) => new THREE.Vector3(0.05 + t * 1.55, -0.09 - Math.sin(t * Math.PI) * 0.15, 0),
    () => new THREE.Vector3(0, 0, 1),
    (t) => (0.32 - t * 0.26) * THREE.MathUtils.smoothstep(t, 0, 0.12),
    24
  );
}

export function createWaterDragonFin(side: number): THREE.BufferGeometry {
  return createWaterRibbon(
    (t) => new THREE.Vector3(-0.5 - t * 1.65, 0.17 + Math.sin(t * Math.PI) * 0.045, side * (0.2 + t * 0.26)),
    () => UP.clone(),
    (t) => Math.sin(t * Math.PI) * (1 - t) * 0.28,
    28
  );
}

/** Low, outward impact sheets. Never build the old rising "flower"/dome. */
export function createWaterCrownPetal(angle: number, seed: number): THREE.BufferGeometry {
  // Low, rolling lip that spreads across the floor. Taller arcs read as a rising
  // dome/flame, which is exactly what the impact must avoid.
  const height = 0.10 + (Math.sin(seed * 2.71) * 0.5 + 0.5) * 0.14;
  const reach = 1.4 + (Math.sin(seed * 4.31) * 0.5 + 0.5) * 0.55;
  return createWaterRibbon(
    (t) => {
      const a = angle + Math.sin(t * Math.PI) * 0.10;
      const radius = 0.42 + t * reach;
      return new THREE.Vector3(Math.cos(a) * radius, 0.05 + Math.sin(t * Math.PI * 0.9) * height, Math.sin(a) * radius);
    },
    () => new THREE.Vector3(-Math.sin(angle), 0.04, Math.cos(angle)),
    // Rounded, broader body with blunt tips (sqrt-like), not needle-thin points.
    (t) => Math.pow(Math.sin(t * Math.PI), 0.32) * (1.02 - t * 0.30),
    32
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

/** Back-swept, pointed sheets tear away from the main spiral like water fins. */
export function createWaterWakeFin(at: number, side: number): THREE.BufferGeometry {
  const origin = waterDragonSpine(at);
  const tangent = waterDragonSpine(Math.min(1, at + 0.01)).sub(origin).normalize();
  const radial = new THREE.Vector3(origin.x, 0, origin.z).normalize();
  return createWaterRibbon(
    (t) => origin.clone().addScaledVector(tangent, -t * 1.6)
      .addScaledVector(radial, t * t * 0.48)
      .addScaledVector(UP, side * (0.10 + Math.sin(t * Math.PI * 0.7) * 0.28)),
    () => UP.clone().addScaledVector(radial, 0.2),
    (t) => Math.sin(t * Math.PI) * (0.8 - t * 0.55),
    24
  );
}

/**
 * Flat polar disc for the floor ripples. uv.x = radius (0 centre → 1 edge),
 * uv.y = angle / TAU, so the shader can draw concentric rings that expand from the strike.
 */
export function createWaterRippleDisc(radialSegments = 24, angularSegments = 72): THREE.BufferGeometry {
  const positions: number[] = [];
  const uv: number[] = [];
  const indices: number[] = [];
  for (let ring = 0; ring <= radialSegments; ring += 1) {
    const r = ring / radialSegments;
    for (let slice = 0; slice <= angularSegments; slice += 1) {
      const theta = slice / angularSegments * TAU;
      positions.push(Math.cos(theta) * r, 0, Math.sin(theta) * r);
      uv.push(r, slice / angularSegments);
      if (ring === radialSegments || slice === angularSegments) continue;
      const a = ring * (angularSegments + 1) + slice;
      const b = a + angularSegments + 1;
      indices.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geometry.setAttribute('aFlowCross', new THREE.Float32BufferAttribute(new Float32Array(positions.length), 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}
