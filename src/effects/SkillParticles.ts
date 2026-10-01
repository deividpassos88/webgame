import * as THREE from 'three';

/** Anything that owns GPU resources and disposes them later (effects, etc.). */
export interface ParticleOwner {
  geometries: Set<THREE.BufferGeometry>;
  materials: Set<THREE.Material>;
}

export interface ParticleSpawn {
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  delay: number;
}

export interface ParticleSpec {
  count: number;
  size: number;
  /** Size multiplier gained per second (smoke puffs billow). */
  growth?: number;
  color: number;
  additive: boolean;
  opacity: number;
  life: readonly [number, number];
  gravity: number;
  drag: number;
  spawn: (index: number, out: ParticleSpawn) => void;
}

let softParticleTexture: THREE.Texture | null = null;

/** Soft round sprite shared by every mini-boss particle (raw bytes: works headless). */
export function getSoftParticleTexture(): THREE.Texture {
  if (softParticleTexture) return softParticleTexture;
  const size = 64;
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const dx = (x + 0.5) / size - 0.5;
      const dy = (y + 0.5) / size - 0.5;
      const alpha = THREE.MathUtils.clamp(1 - Math.sqrt(dx * dx + dy * dy) * 2, 0, 1);
      const offset = (y * size + x) * 4;
      data[offset] = 255;
      data[offset + 1] = 255;
      data[offset + 2] = 255;
      data[offset + 3] = Math.round(alpha * alpha * 255);
    }
  }
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  texture.needsUpdate = true;
  softParticleTexture = texture;
  return texture;
}

export function smooth(edge0: number, edge1: number, value: number): number {
  const t = THREE.MathUtils.clamp((value - edge0) / (edge1 - edge0 || 1e-5), 0, 1);
  return t * t * (3 - 2 * t);
}


/**
 * One GPU Points object with analytic (stateless) motion: position follows
 * velocity with drag plus gravity; per-point colour carries the fade so a
 * single material serves the whole burst.
 */
export function createParticleBurst(
track: ParticleOwner,
parent: THREE.Object3D,
spec: ParticleSpec
): (age: number) => void {
  const count = spec.count;
  const origins = new Float32Array(count * 3);
  const velocities = new Float32Array(count * 3);
  const delays = new Float32Array(count);
  const lives = new Float32Array(count);
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 4);
  const spawn: ParticleSpawn = {
    position: new THREE.Vector3(),
    velocity: new THREE.Vector3(),
    delay: 0,
  };
  const tint = new THREE.Color(spec.color);
  for (let index = 0; index < count; index += 1) {
    spec.spawn(index, spawn);
    origins.set([spawn.position.x, spawn.position.y, spawn.position.z], index * 3);
    velocities.set([spawn.velocity.x, spawn.velocity.y, spawn.velocity.z], index * 3);
    delays[index] = spawn.delay;
    lives[index] = spec.life[0] + Math.random() * (spec.life[1] - spec.life[0]);
    colors[index * 4] = tint.r;
    colors[index * 4 + 1] = tint.g;
    colors[index * 4 + 2] = tint.b;
    positions[index * 3 + 1] = -999;
  }

  const geometry = new THREE.BufferGeometry();
  const positionAttribute = new THREE.BufferAttribute(positions, 3);
  const colorAttribute = new THREE.BufferAttribute(colors, 4);
  geometry.setAttribute('position', positionAttribute);
  geometry.setAttribute('color', colorAttribute);
  const material = new THREE.PointsMaterial({
    map: getSoftParticleTexture(),
    size: spec.size,
    sizeAttenuation: true,
    vertexColors: true,
    transparent: true,
    opacity: spec.opacity,
    depthWrite: false,
    blending: spec.additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    toneMapped: false,
  });
  const points = new THREE.Points(geometry, material);
  points.name = 'mini-boss-skill-particles';
  points.frustumCulled = false;
  points.renderOrder = 6;
  parent.add(points);
  track.geometries.add(geometry);
  track.materials.add(material);

  const drag = Math.max(spec.drag, 1e-3);
  return (age: number) => {
    for (let index = 0; index < count; index += 1) {
      const local = age - delays[index];
      const life = lives[index];
      const base = index * 3;
      if (local < 0 || local > life) {
        positions[base + 1] = -999;
        colors[index * 4 + 3] = 0;
        continue;
      }
      const travel = (1 - Math.exp(-drag * local)) / drag;
      const lifeProgress = local / life;
      positions[base] = origins[base] + velocities[base] * travel;
      positions[base + 1] = Math.max(
        0.06,
        origins[base + 1] + velocities[base + 1] * travel - 0.5 * spec.gravity * local * local
      );
      positions[base + 2] = origins[base + 2] + velocities[base + 2] * travel;
      const fade = smooth(0, 0.08, lifeProgress) * (1 - smooth(0.45, 1, lifeProgress));
      const alpha = spec.additive ? 1 : fade;
      const brightness = spec.additive ? fade : 1;
      colors[index * 4] = tint.r * brightness;
      colors[index * 4 + 1] = tint.g * brightness;
      colors[index * 4 + 2] = tint.b * brightness;
      colors[index * 4 + 3] = alpha;
    }
    positionAttribute.needsUpdate = true;
    colorAttribute.needsUpdate = true;
    if (spec.growth) material.size = spec.size * (1 + spec.growth * age);
  };
}

