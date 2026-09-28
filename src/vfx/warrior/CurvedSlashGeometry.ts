export interface CurvedArcMeshOptions {
  /** Outer radius of the blade arc */
  readonly outerRadius?: number;
  /** Inner radius of the arc */
  readonly innerRadius?: number;
  /** Total angular span in radians */
  readonly angleSpan?: number;
  /** Number of segments along the arc (smoothness) */
  readonly radialSegments?: number;
  /** Number of rings across the blade width */
  readonly widthSegments?: number;
  /** Twist / tilt angle along the swing in radians */
  readonly pitchTilt?: number;
  /** Downward / upward curvature along the arc (dish shape) */
  readonly verticalCurvature?: number;
}

import * as THREE from 'three';

/**
 * Builds a 3D crescent blade ribbon arc geometry matching the user's reference image:
 * - Thick, wide, radiant leading edge/head (tRadial = 1.0)
 * - Very long, extended sweeping tail/whip ("rabo longo e bem grande", tRadial = 0.0)
 *   that tapers smoothly into a fine needle-like point.
 * - Parabolic 3D curvature and tilt for authentic dynamic sword-swing trajectory.
 */
export function createCurvedSlashGeometry(options: CurvedArcMeshOptions = {}): THREE.BufferGeometry {
  const outerRadius = options.outerRadius ?? 3.8;
  const innerRadius = options.innerRadius ?? 1.1;
  const angleSpan = options.angleSpan ?? Math.PI * 1.35;
  const radialSegments = options.radialSegments ?? 64;
  const widthSegments = options.widthSegments ?? 6;
  const pitchTilt = options.pitchTilt ?? 0.16;
  const verticalCurvature = options.verticalCurvature ?? -0.20;

  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  const vertexCountPerRow = widthSegments + 1;
  const baseBladeWidth = outerRadius - innerRadius;

  for (let r = 0; r <= radialSegments; r++) {
    const tRadial = r / radialSegments; // 0.0 at tail end, 1.0 at slash head

    // Angle span: tail sweeps far back, head strikes forward
    // Center of impact is near tRadial = 0.85
    const angle = (tRadial - 0.85) * angleSpan;
    const cosAngle = Math.cos(angle);
    const sinAngle = Math.sin(angle);

    // Asymmetric taper matching the reference image:
    // Tail (tRadial = 0) has a long graceful whip taper ("rabo bem grande")
    // Head (tRadial = 1) is thick, broad, and impactful
    // tRadial = 0 -> widthFactor = 0.02 (fine tip)
    // tRadial = 0.5 -> widthFactor = 0.65
    // tRadial = 0.9 -> widthFactor = 1.0 (thickest blade head)
    // tRadial = 1.0 -> widthFactor = 0.85 (blade tip cut)
    let widthFactor: number;
    if (tRadial < 0.88) {
      // Smooth power curve for long extending tail
      widthFactor = Math.pow(tRadial / 0.88, 0.75);
    } else {
      // Slight rounding at the immediate cutting tip
      const headT = (tRadial - 0.88) / 0.12;
      widthFactor = 1.0 - headT * 0.2;
    }

    const currentWidth = Math.max(0.04, baseBladeWidth * widthFactor);

    // Radius progression: outer razor edge curves naturally along the sweep
    const midRadius = (innerRadius + outerRadius) * 0.5 + (tRadial - 0.5) * 0.35;
    const currentInner = midRadius - currentWidth * 0.55;
    const currentOuter = midRadius + currentWidth * 0.45;

    // Parabolic vertical swoop and dynamic tilt
    const arcHeight = Math.sin(tRadial * Math.PI) * verticalCurvature;
    const currentTilt = (tRadial - 0.5) * pitchTilt;

    for (let w = 0; w <= widthSegments; w++) {
      const tWidth = w / widthSegments; // 0 at inner boundary, 1 at outer razor edge
      const radius = THREE.MathUtils.lerp(currentInner, currentOuter, tWidth);

      const x = radius * sinAngle;
      const z = radius * cosAngle;
      const y = arcHeight + (tWidth - 0.5) * Math.sin(currentTilt) * currentWidth;

      positions.push(x, y, z);
      uvs.push(tRadial, tWidth);
    }
  }

  for (let r = 0; r < radialSegments; r++) {
    for (let w = 0; w < widthSegments; w++) {
      const current = r * vertexCountPerRow + w;
      const next = current + vertexCountPerRow;

      indices.push(current, next, current + 1);
      indices.push(current + 1, next, next + 1);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

