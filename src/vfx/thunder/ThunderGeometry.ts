import * as THREE from 'three';
import { createWaterRibbon, createWaterRippleDisc } from '../water/WaterDragonGeometry';

/**
 * Thick lightning bolt made of two crossed ribbons (X and Z). Reads as a solid,
 * glowing column from any camera angle without per-frame billboarding.
 * uv.x = across the ribbon (0..1), uv.y = along the bolt (0 top → 1 bottom).
 */
export class ThunderBolt {
  public readonly geometry: THREE.BufferGeometry;
  public readonly mesh: THREE.Mesh;
  private readonly positions: Float32Array;
  private readonly count: number;

  public constructor(count: number, material: THREE.Material, name: string) {
    this.count = count;
    this.positions = new Float32Array(count * 2 * 2 * 3);
    const uv = new Float32Array(count * 2 * 2 * 2);
    const indices: number[] = [];
    for (let i = 0; i < count; i += 1) {
      const along = i / Math.max(1, count - 1);
      for (let strip = 0; strip < 2; strip += 1) {
        const base = (strip * count + i) * 2;
        uv[base * 2] = 0;
        uv[base * 2 + 1] = along;
        uv[(base + 1) * 2] = 1;
        uv[(base + 1) * 2 + 1] = along;
      }
    }
    for (let strip = 0; strip < 2; strip += 1) {
      for (let i = 0; i < count - 1; i += 1) {
        const a = (strip * count + i) * 2;
        const b = a + 2;
        indices.push(a, b, a + 1, a + 1, b, b + 1);
      }
    }
    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    this.geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    this.geometry.setIndex(indices);
    this.mesh = new THREE.Mesh(this.geometry, material);
    this.mesh.name = name;
    this.mesh.frustumCulled = false;
  }

  /**
   * Writes the path; `halfWidths[i]` is the half thickness at point i (world units).
   * A shorter list repeats its last value; an empty list falls back to `DEFAULT_HALF_WIDTH`.
   */
  public setPath(path: readonly THREE.Vector3[], halfWidths: readonly number[]): void {
    const n = Math.min(this.count, path.length);
    for (let i = 0; i < n; i += 1) {
      const p = path[i];
      const w = halfWidths[i] ?? halfWidths[halfWidths.length - 1] ?? DEFAULT_HALF_WIDTH;
      // Strip 0 spans X, strip 1 spans Z; each has two verts (−w, +w).
      for (let strip = 0; strip < 2; strip += 1) {
        const offset = (strip * this.count + i) * 2 * 3;
        const sx = strip === 0 ? w : 0;
        const sz = strip === 1 ? w : 0;
        this.positions[offset] = p.x - sx;
        this.positions[offset + 1] = p.y;
        this.positions[offset + 2] = p.z - sz;
        this.positions[offset + 3] = p.x + sx;
        this.positions[offset + 4] = p.y;
        this.positions[offset + 5] = p.z + sz;
      }
    }
    // Points past `n` collapse onto the last point so the strip ends cleanly.
    for (let i = n; i < this.count; i += 1) {
      const last = Math.max(0, n - 1);
      for (let strip = 0; strip < 2; strip += 1) {
        const src = (strip * this.count + last) * 2 * 3;
        const dst = (strip * this.count + i) * 2 * 3;
        for (let k = 0; k < 6; k += 1) this.positions[dst + k] = this.positions[src + k];
      }
    }
    (this.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
  }

  public dispose(): void {
    this.geometry.dispose();
  }
}

/** Half thickness used when a path is written without explicit widths. */
export const DEFAULT_HALF_WIDTH = 0.1;

/** Jagged, self-similar path from `from` to `to`. Ends are pinned; the middle wanders. */
export function jaggedBoltPath(
  from: THREE.Vector3,
  to: THREE.Vector3,
  segments: number,
  jitter: number,
  random: () => number,
  out: THREE.Vector3[]
): THREE.Vector3[] {
  out.length = 0;
  const length = from.distanceTo(to);
  for (let i = 0; i <= segments; i += 1) {
    const t = i / segments;
    const pinned = Math.sin(t * Math.PI);
    const p = new THREE.Vector3().lerpVectors(from, to, t);
    if (i > 0 && i < segments) {
      p.x += (random() - 0.5) * jitter * length * 0.22 * pinned;
      p.z += (random() - 0.5) * jitter * length * 0.22 * pinned;
    }
    out.push(p);
  }
  return out;
}

/** Swept, pointed fin that orbits the bolt (the grey-violet blades of the reference). */
export function createThunderBladeGeometry(phase: number, sweep: number, radius: number, height: number, width: number, segments = 36): THREE.BufferGeometry {
  return createWaterRibbon(
    (t) => {
      const angle = phase + sweep * t;
      const r = radius * (0.7 + 0.3 * Math.sin(t * Math.PI));
      return new THREE.Vector3(Math.cos(angle) * r, height + Math.sin(t * Math.PI) * 0.35 - t * 0.6, Math.sin(angle) * r);
    },
    (t) => {
      const angle = phase + sweep * t;
      return new THREE.Vector3(-Math.sin(angle), 0.25, Math.cos(angle));
    },
    (t) => width * Math.pow(Math.sin(Math.min(1, t * 1.05) * Math.PI), 0.45) * (1 - t * 0.35),
    segments
  );
}

/** Flat polar disc (uv.x = radius) for shock rings and the bubble's crater rim. */
export function createThunderDiscGeometry(radial = 24, angular = 72): THREE.BufferGeometry {
  return createWaterRippleDisc(radial, angular);
}
