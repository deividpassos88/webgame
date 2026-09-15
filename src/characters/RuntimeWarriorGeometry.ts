import * as THREE from 'three';
import {
  DEFAULT_RUNTIME_WARRIOR_MEASUREMENTS,
  type RuntimeDeformRegion,
  type RuntimeMaterialRole,
  type RuntimeRigBoneId,
  type RuntimeWarriorMeasurements,
  type RuntimeWarriorPartGeometry,
} from './RuntimeWarriorConfig';

export {
  DEFAULT_RUNTIME_WARRIOR_MEASUREMENTS,
  RUNTIME_WARRIOR_BUDGET,
} from './RuntimeWarriorConfig';
export type {
  RuntimeDeformRegion,
  RuntimeMaterialRole,
  RuntimeRigBoneId,
  RuntimeWarriorMeasurements,
  RuntimeWarriorPartGeometry,
} from './RuntimeWarriorConfig';

interface ProfilePoint {
  readonly y: number;
  readonly radius: number;
}

interface RevolvedOptions {
  readonly profiles: readonly ProfilePoint[];
  readonly segments: number;
  readonly origin: readonly [number, number, number];
  readonly axis?: readonly [number, number, number];
  readonly radialScale?: readonly [number, number];
}

interface PanelOptions {
  readonly width: number;
  readonly height: number;
  readonly columns: number;
  readonly rows: number;
  readonly origin: readonly [number, number, number];
  readonly depth: number;
  readonly bulge: number;
  readonly rotationY?: number;
}

interface ResolvedMeasurements {
  readonly height: number;
  readonly shoulderWidth: number;
  readonly chestWidth: number;
  readonly chestDepth: number;
  readonly waistWidth: number;
  readonly hipWidth: number;
  readonly torsoLength: number;
  readonly neckRadius: number;
  readonly headHeight: number;
  readonly headWidth: number;
  readonly headDepth: number;
  readonly upperArmLength: number;
  readonly foreArmLength: number;
  readonly upperLegLength: number;
  readonly lowerLegLength: number;
  readonly footLength: number;
  readonly footWidth: number;
  readonly handLength: number;
  readonly handWidth: number;
  readonly upperArmRadius: number;
  readonly foreArmRadius: number;
  readonly thighRadius: number;
  readonly calfRadius: number;
  readonly ankleRadius: number;
  readonly tunicOffset: number;
  readonly armourOffset: number;
}

const TWO_PI = Math.PI * 2;
// A caller may provide a finite number that is still far outside the model
// coordinate range (for example Number.MAX_VALUE).  Capping dimensions before
// any multiplication keeps Float32 attributes and their squared bounds finite.
const MAX_RUNTIME_MEASUREMENT = 10;

function positive(value: number | undefined, fallback: number): number {
  return value !== undefined && Number.isFinite(value) && value > 0
    ? Math.min(value, MAX_RUNTIME_MEASUREMENT)
    : fallback;
}

function resolveMeasurements(measurements: RuntimeWarriorMeasurements): ResolvedMeasurements {
  const source = measurements ?? {};
  const defaults = DEFAULT_RUNTIME_WARRIOR_MEASUREMENTS;
  return {
    height: positive(source.height, defaults.height),
    shoulderWidth: positive(source.shoulderWidth, defaults.shoulderWidth),
    chestWidth: positive(source.chestWidth, defaults.chestWidth),
    chestDepth: positive(source.chestDepth, defaults.chestDepth),
    waistWidth: positive(source.waistWidth, defaults.waistWidth),
    hipWidth: positive(source.hipWidth, defaults.hipWidth),
    torsoLength: positive(source.torsoLength, defaults.torsoLength),
    neckRadius: positive(source.neckRadius, defaults.neckRadius),
    headHeight: positive(source.headHeight, defaults.headHeight),
    headWidth: positive(source.headWidth, defaults.headWidth),
    headDepth: positive(source.headDepth, defaults.headDepth),
    upperArmLength: positive(source.upperArmLength, defaults.upperArmLength),
    foreArmLength: positive(source.foreArmLength, defaults.foreArmLength),
    upperLegLength: positive(source.upperLegLength, defaults.upperLegLength),
    lowerLegLength: positive(source.lowerLegLength, defaults.lowerLegLength),
    footLength: positive(source.footLength, defaults.footLength),
    footWidth: positive(source.footWidth, defaults.footWidth),
    handLength: positive(source.handLength, defaults.handLength),
    handWidth: positive(source.handWidth, defaults.handWidth),
    upperArmRadius: positive(source.upperArmRadius, defaults.upperArmRadius),
    foreArmRadius: positive(source.foreArmRadius, defaults.foreArmRadius),
    thighRadius: positive(source.thighRadius, defaults.thighRadius),
    calfRadius: positive(source.calfRadius, defaults.calfRadius),
    ankleRadius: positive(source.ankleRadius, defaults.ankleRadius),
    tunicOffset: positive(source.tunicOffset, defaults.tunicOffset),
    armourOffset: positive(source.armourOffset, defaults.armourOffset),
  };
}

function addRevolvedIndices(
  indices: number[],
  profileCount: number,
  segments: number,
  bottomCenter: number,
  topCenter: number
): void {
  for (let ring = 0; ring < profileCount - 1; ring += 1) {
    const current = ring * segments;
    const next = (ring + 1) * segments;
    for (let segment = 0; segment < segments; segment += 1) {
      const following = (segment + 1) % segments;
      const a = current + segment;
      const b = current + following;
      const c = next + following;
      const d = next + segment;
      // The order gives an outward-facing surface for a profile that rises in Y.
      indices.push(a, d, c, a, c, b);
    }
  }

  for (let segment = 0; segment < segments; segment += 1) {
    const following = (segment + 1) % segments;
    // Bottom points down; top points up.
    indices.push(bottomCenter, segment, following);
    const top = (profileCount - 1) * segments;
    indices.push(topCenter, top + following, top + segment);
  }
}

/** Build a capped surface of revolution around an arbitrary local axis. */
function createRevolvedGeometry(options: RevolvedOptions): THREE.BufferGeometry {
  const profiles = options.profiles;
  const segments = Math.max(8, Math.floor(options.segments));
  const radialScaleX = options.radialScale?.[0] ?? 1;
  const radialScaleZ = options.radialScale?.[1] ?? 1;
  const axisX = options.axis?.[0] ?? 0;
  const axisY = options.axis?.[1] ?? 1;
  const axisZ = options.axis?.[2] ?? 0;
  const axisLength = Math.hypot(axisX, axisY, axisZ) || 1;
  const dx = axisX / axisLength;
  const dy = axisY / axisLength;
  const dz = axisZ / axisLength;

  // U/V form a stable frame around the axis.  The branch avoids a nearly
  // zero cross product when the axis is close to world up.
  let ux: number;
  let uy: number;
  let uz: number;
  if (Math.abs(dy) < 0.9) {
    ux = -dz;
    uy = 0;
    uz = dx;
    const length = Math.hypot(ux, uy, uz) || 1;
    ux /= length;
    uy /= length;
    uz /= length;
  } else {
    ux = 1;
    uy = 0;
    uz = 0;
  }
  // Keep the radial frame right-handed with the profile tangent.  For the
  // default Y axis this gives U=(+X), V=(+Z), so the existing a,b,c winding
  // has outward-facing normals rather than an inverted body.
  const vx = uy * dz - uz * dy;
  const vy = uz * dx - ux * dz;
  const vz = ux * dy - uy * dx;

  const positionValues: number[] = [];
  const uvValues: number[] = [];
  for (let ring = 0; ring < profiles.length; ring += 1) {
    const profile = profiles[ring];
    const v = profiles.length > 1 ? ring / (profiles.length - 1) : 0;
    for (let segment = 0; segment < segments; segment += 1) {
      const u = segment / segments;
      const angle = u * TWO_PI;
      const radialX = Math.cos(angle) * profile.radius * radialScaleX;
      const radialZ = Math.sin(angle) * profile.radius * radialScaleZ;
      positionValues.push(
        options.origin[0] + dx * profile.y + ux * radialX + vx * radialZ,
        options.origin[1] + dy * profile.y + uy * radialX + vy * radialZ,
        options.origin[2] + dz * profile.y + uz * radialX + vz * radialZ
      );
      uvValues.push(u, v);
    }
  }

  const bottomCenter = positionValues.length / 3;
  positionValues.push(
    options.origin[0] + dx * profiles[0].y,
    options.origin[1] + dy * profiles[0].y,
    options.origin[2] + dz * profiles[0].y
  );
  uvValues.push(0.5, 0);
  const topCenter = positionValues.length / 3;
  const lastProfile = profiles[profiles.length - 1];
  positionValues.push(
    options.origin[0] + dx * lastProfile.y,
    options.origin[1] + dy * lastProfile.y,
    options.origin[2] + dz * lastProfile.y
  );
  uvValues.push(0.5, 1);

  const indices: number[] = [];
  addRevolvedIndices(indices, profiles.length, segments, bottomCenter, topCenter);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positionValues, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvValues, 2));
  // Every part remains below 65,535 vertices, so a compact 16-bit index is
  // sufficient and is accepted by WebGL1 as well as WebGL2.
  geometry.setIndex(new THREE.Uint16BufferAttribute(new Uint16Array(indices), 1));
  return geometry;
}

/** Build a light-weight curved rectangular plate for chest and shoulder armour. */
function createCurvedPanelGeometry(options: PanelOptions): THREE.BufferGeometry {
  const columns = Math.max(1, Math.floor(options.columns));
  const rows = Math.max(1, Math.floor(options.rows));
  const positionValues: number[] = [];
  const uvValues: number[] = [];
  const yaw = options.rotationY ?? 0;
  const cosYaw = Math.cos(yaw);
  const sinYaw = Math.sin(yaw);

  for (let row = 0; row <= rows; row += 1) {
    const v = row / rows;
    const y = (v - 0.5) * options.height;
    for (let column = 0; column <= columns; column += 1) {
      const u = column / columns;
      const x = (u - 0.5) * options.width;
      const halfWidth = Math.max(options.width * 0.5, 0.0001);
      const normalizedX = x / halfWidth;
      const z = options.depth + options.bulge * Math.max(0, 1 - normalizedX * normalizedX);
      const rotatedX = cosYaw * x + sinYaw * z;
      const rotatedZ = -sinYaw * x + cosYaw * z;
      positionValues.push(
        options.origin[0] + rotatedX,
        options.origin[1] + y,
        options.origin[2] + rotatedZ
      );
      uvValues.push(u, v);
    }
  }

  const indices: number[] = [];
  const rowStride = columns + 1;
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const a = row * rowStride + column;
      const b = a + 1;
      const d = (row + 1) * rowStride + column;
      const c = d + 1;
      indices.push(a, b, c, a, c, d);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positionValues, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvValues, 2));
  geometry.setIndex(new THREE.Uint16BufferAttribute(new Uint16Array(indices), 1));
  return geometry;
}

function finishGeometry(geometry: THREE.BufferGeometry): THREE.BufferGeometry {
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

function part(
  id: string,
  materialRole: RuntimeMaterialRole,
  deformRegion: RuntimeDeformRegion | null,
  rigidBone: RuntimeRigBoneId | null,
  geometry: THREE.BufferGeometry
): RuntimeWarriorPartGeometry {
  return { id, materialRole, deformRegion, geometry: finishGeometry(geometry), rigidBone };
}

function limbProfiles(length: number, radius: number, count: number): ProfilePoint[] {
  const profiles: ProfilePoint[] = [];
  for (let index = 0; index < count; index += 1) {
    const t = index / (count - 1);
    // Slightly fuller at the middle, with broad enough end rings to avoid
    // pinching at joints when the skinning stage blends neighbouring bones.
    const fullness = 0.78 + 0.22 * Math.sin(Math.PI * t);
    profiles.push({ y: (t - 0.5) * length, radius: radius * fullness });
  }
  return profiles;
}

function ellipsoidProfiles(length: number, radius: number, count: number): ProfilePoint[] {
  const profiles: ProfilePoint[] = [];
  for (let index = 0; index < count; index += 1) {
    const t = index / (count - 1);
    const angle = -Math.PI * 0.5 + Math.PI * t;
    profiles.push({
      y: Math.sin(angle) * length * 0.5,
      radius: Math.max(radius * Math.cos(angle), radius * 0.035),
    });
  }
  return profiles;
}

function midpoint(
  from: readonly [number, number, number],
  to: readonly [number, number, number]
): readonly [number, number, number] {
  return [(from[0] + to[0]) * 0.5, (from[1] + to[1]) * 0.5, (from[2] + to[2]) * 0.5];
}

function direction(
  from: readonly [number, number, number],
  to: readonly [number, number, number]
): readonly [number, number, number] {
  return [to[0] - from[0], to[1] - from[1], to[2] - from[2]];
}

function segmentLength(axis: readonly [number, number, number]): number {
  return Math.max(Math.hypot(axis[0], axis[1], axis[2]), 0.0001);
}

/**
 * Create all runtime warrior pieces in model-local coordinates.
 *
 * The order is stable because the factory later uses it as its deterministic
 * source order when grouping pieces by material role.
 */
export function createRuntimeWarriorPartGeometries(
  measurements: RuntimeWarriorMeasurements = DEFAULT_RUNTIME_WARRIOR_MEASUREMENTS
): RuntimeWarriorPartGeometry[] {
  const m = resolveMeasurements(measurements);
  const parts: RuntimeWarriorPartGeometry[] = [];
  const floorY = Math.max(0.025, m.height * 0.02);
  const hipY = floorY + m.lowerLegLength + m.upperLegLength;
  const torsoBottom = hipY - 0.055;
  const torsoTop = torsoBottom + m.torsoLength;
  const shoulderY = torsoTop - 0.035;
  const headCenterY = torsoTop + 0.14 + m.headHeight * 0.5;
  const torsoDepthScale = m.chestDepth / Math.max(m.chestWidth, 0.0001);

  const bodyProfiles: ProfilePoint[] = [
    { y: -m.torsoLength * 0.5, radius: m.hipWidth * 0.40 },
    { y: -m.torsoLength * 0.44, radius: m.hipWidth * 0.50 },
    { y: -m.torsoLength * 0.29, radius: m.waistWidth * 0.50 },
    { y: -m.torsoLength * 0.12, radius: m.waistWidth * 0.49 },
    { y: m.torsoLength * 0.04, radius: m.chestWidth * 0.49 },
    { y: m.torsoLength * 0.18, radius: m.chestWidth * 0.52 },
    { y: m.torsoLength * 0.31, radius: m.shoulderWidth * 0.43 },
    { y: m.torsoLength * 0.43, radius: m.shoulderWidth * 0.40 },
    { y: m.torsoLength * 0.50, radius: m.shoulderWidth * 0.33 },
  ];
  parts.push(
    part(
      'RuntimeWarrior_Body',
      'skin',
      'torso',
      null,
      createRevolvedGeometry({
        profiles: bodyProfiles,
        segments: 40,
        origin: [0, hipY + m.torsoLength * 0.01, 0],
        radialScale: [1, torsoDepthScale],
      })
    )
  );

  parts.push(
    part(
      'RuntimeWarrior_Head',
      'skin',
      'head',
      null,
      createRevolvedGeometry({
        profiles: ellipsoidProfiles(m.headHeight, m.headWidth * 0.5, 13),
        segments: 44,
        origin: [0, headCenterY, 0],
        radialScale: [1, m.headDepth / Math.max(m.headWidth, 0.0001)],
      })
    ),
    part(
      'RuntimeWarrior_Neck',
      'skin',
      'head',
      null,
      createRevolvedGeometry({
        profiles: limbProfiles(0.14, m.neckRadius, 5),
        segments: 24,
        origin: [0, torsoTop + 0.055, 0],
        radialScale: [1, 0.9],
      })
    )
  );

  const shoulderX = m.shoulderWidth * 0.5;
  const shoulderZ = 0;
  const leftShoulder: readonly [number, number, number] = [-shoulderX, shoulderY, shoulderZ];
  const rightShoulder: readonly [number, number, number] = [shoulderX, shoulderY, shoulderZ];
  const leftElbow: readonly [number, number, number] = [
    -shoulderX - m.upperArmLength * 0.42,
    shoulderY - m.upperArmLength * 0.88,
    0,
  ];
  const rightElbow: readonly [number, number, number] = [
    shoulderX + m.upperArmLength * 0.42,
    shoulderY - m.upperArmLength * 0.88,
    0,
  ];
  const leftWrist: readonly [number, number, number] = [
    leftElbow[0] - m.foreArmLength * 0.22,
    leftElbow[1] - m.foreArmLength * 0.94,
    0.008,
  ];
  const rightWrist: readonly [number, number, number] = [
    rightElbow[0] + m.foreArmLength * 0.22,
    rightElbow[1] - m.foreArmLength * 0.94,
    0.008,
  ];

  for (const side of [-1, 1] as const) {
    const sideName = side < 0 ? 'Left' : 'Right';
    const region: RuntimeDeformRegion = side < 0 ? 'leftArm' : 'rightArm';
    const shoulder = side < 0 ? leftShoulder : rightShoulder;
    const elbow = side < 0 ? leftElbow : rightElbow;
    const wrist = side < 0 ? leftWrist : rightWrist;
    const upperAxis = direction(shoulder, elbow);
    const foreAxis = direction(elbow, wrist);
    const handEnd: readonly [number, number, number] = [
      wrist[0] + foreAxis[0] * (m.handLength / Math.max(segmentLength(foreAxis), 0.0001)),
      wrist[1] + foreAxis[1] * (m.handLength / Math.max(segmentLength(foreAxis), 0.0001)),
      wrist[2] + foreAxis[2] * (m.handLength / Math.max(segmentLength(foreAxis), 0.0001)),
    ];
    const handAxis = direction(wrist, handEnd);
    const handCenter = midpoint(wrist, handEnd);

    parts.push(
      part(
        `RuntimeWarrior_${sideName}UpperArm`,
        'skin',
        region,
        null,
        createRevolvedGeometry({
          profiles: limbProfiles(segmentLength(upperAxis), m.upperArmRadius, 9),
          segments: 28,
          origin: midpoint(shoulder, elbow),
          axis: upperAxis,
          radialScale: [1, 0.92],
        })
      ),
      part(
        `RuntimeWarrior_${sideName}ForeArm`,
        'skin',
        region,
        null,
        createRevolvedGeometry({
          profiles: limbProfiles(segmentLength(foreAxis), m.foreArmRadius, 8),
          segments: 24,
          origin: midpoint(elbow, wrist),
          axis: foreAxis,
          radialScale: [1, 0.9],
        })
      ),
      part(
        `RuntimeWarrior_${sideName}Hand`,
        'skin',
        region,
        null,
        createRevolvedGeometry({
          profiles: limbProfiles(m.handLength, m.handWidth * 0.5, 8),
          segments: 32,
          origin: handCenter,
          axis: handAxis,
          radialScale: [1, 0.78],
        })
      )
    );
  }

  const hipX = m.hipWidth * 0.235;
  const leftHip: readonly [number, number, number] = [-hipX, hipY, 0];
  const rightHip: readonly [number, number, number] = [hipX, hipY, 0];
  const leftKnee: readonly [number, number, number] = [-hipX * 0.94, floorY + m.lowerLegLength, 0];
  const rightKnee: readonly [number, number, number] = [hipX * 0.94, floorY + m.lowerLegLength, 0];
  const leftAnkle: readonly [number, number, number] = [-hipX * 0.90, floorY + 0.04, 0];
  const rightAnkle: readonly [number, number, number] = [hipX * 0.90, floorY + 0.04, 0];

  for (const side of [-1, 1] as const) {
    const sideName = side < 0 ? 'Left' : 'Right';
    const region: RuntimeDeformRegion = side < 0 ? 'leftLeg' : 'rightLeg';
    const hip = side < 0 ? leftHip : rightHip;
    const knee = side < 0 ? leftKnee : rightKnee;
    const ankle = side < 0 ? leftAnkle : rightAnkle;
    const thighAxis = direction(hip, knee);
    const calfAxis = direction(knee, ankle);
    const footCenter: readonly [number, number, number] = [
      ankle[0],
      floorY + 0.045,
      m.footLength * 0.5 - 0.025,
    ];

    parts.push(
      part(
        `RuntimeWarrior_${sideName}Thigh`,
        'skin',
        region,
        null,
        createRevolvedGeometry({
          profiles: limbProfiles(segmentLength(thighAxis), m.thighRadius, 8),
          segments: 24,
          origin: midpoint(hip, knee),
          axis: thighAxis,
          radialScale: [1, 0.86],
        })
      ),
      part(
        `RuntimeWarrior_${sideName}Calf`,
        'skin',
        region,
        null,
        createRevolvedGeometry({
          profiles: limbProfiles(segmentLength(calfAxis), m.calfRadius, 8),
          segments: 24,
          origin: midpoint(knee, ankle),
          axis: calfAxis,
          radialScale: [1, 0.85],
        })
      ),
      part(
        `RuntimeWarrior_${sideName}Foot`,
        'skin',
        null,
        side < 0 ? 'leftFoot' : 'rightFoot',
        createRevolvedGeometry({
          profiles: limbProfiles(m.footLength, m.footWidth * 0.49, 7),
          segments: 24,
          origin: footCenter,
          axis: [0, 0, 1],
          radialScale: [1, 0.62],
        })
      )
    );
  }

  const earRadius = m.headWidth * 0.16;
  for (const side of [-1, 1] as const) {
    const sideName = side < 0 ? 'Left' : 'Right';
    parts.push(
      part(
        `RuntimeWarrior_${sideName}Ear`,
        'skin',
        'head',
        null,
        createRevolvedGeometry({
          profiles: ellipsoidProfiles(m.headWidth * 0.34, earRadius, 7),
          segments: 24,
          origin: [side * m.headWidth * 0.53, headCenterY + 0.005, 0],
          axis: [side, 0, 0],
          radialScale: [1, 0.72],
        })
      )
    );
  }
  parts.push(
    part(
      'RuntimeWarrior_Nose',
      'skin',
      'head',
      null,
      createRevolvedGeometry({
        profiles: limbProfiles(0.105, m.headWidth * 0.13, 6),
        segments: 24,
        origin: [0, headCenterY - 0.005, m.headDepth * 0.48],
        axis: [0, 0, 1],
        radialScale: [1, 0.82],
      })
    )
  );

  for (const side of [-1, 1] as const) {
    const sideName = side < 0 ? 'Left' : 'Right';
    parts.push(
      part(
        `RuntimeWarrior_${sideName}Eye`,
        'eye',
        'head',
        null,
        createRevolvedGeometry({
          profiles: ellipsoidProfiles(0.045, m.headWidth * 0.115, 5),
          segments: 24,
          origin: [side * m.headWidth * 0.235, headCenterY + 0.035, m.headDepth * 0.46],
          axis: [0, 0, 1],
          radialScale: [1, 0.72],
        })
      )
    );
  }

  parts.push(
    part(
      'RuntimeWarrior_HairCap',
      'hair',
      'head',
      null,
      createRevolvedGeometry({
        profiles: [
          { y: -m.headHeight * 0.22, radius: m.headWidth * 0.44 },
          { y: -m.headHeight * 0.06, radius: m.headWidth * 0.53 },
          { y: m.headHeight * 0.10, radius: m.headWidth * 0.50 },
          { y: m.headHeight * 0.24, radius: m.headWidth * 0.43 },
          { y: m.headHeight * 0.37, radius: m.headWidth * 0.30 },
          { y: m.headHeight * 0.47, radius: m.headWidth * 0.10 },
          { y: m.headHeight * 0.50, radius: m.headWidth * 0.04 },
        ],
        segments: 36,
        origin: [0, headCenterY + 0.005, -m.headDepth * 0.01],
        radialScale: [1, m.headDepth / Math.max(m.headWidth, 0.0001)],
      })
    ),
    part(
      'RuntimeWarrior_Beard',
      'hair',
      'head',
      null,
      createRevolvedGeometry({
        profiles: ellipsoidProfiles(m.headWidth * 0.24, m.headWidth * 0.31, 7),
        segments: 24,
        origin: [0, headCenterY - m.headHeight * 0.22, m.headDepth * 0.42],
        axis: [0, 0, 1],
        radialScale: [1, 0.42],
      })
    )
  );

  const tunicProfiles: ProfilePoint[] = [
    { y: -m.torsoLength * 0.50, radius: m.hipWidth * 0.53 + m.tunicOffset },
    { y: -m.torsoLength * 0.40, radius: m.hipWidth * 0.55 + m.tunicOffset },
    { y: -m.torsoLength * 0.23, radius: m.waistWidth * 0.55 + m.tunicOffset },
    { y: -m.torsoLength * 0.02, radius: m.chestWidth * 0.54 + m.tunicOffset },
    { y: m.torsoLength * 0.20, radius: m.chestWidth * 0.56 + m.tunicOffset },
    { y: m.torsoLength * 0.39, radius: m.shoulderWidth * 0.44 + m.tunicOffset },
    { y: m.torsoLength * 0.50, radius: m.shoulderWidth * 0.38 + m.tunicOffset },
  ];
  parts.push(
    part(
      'RuntimeWarrior_Tunic',
      'cloth',
      'torso',
      null,
      createRevolvedGeometry({
        profiles: tunicProfiles,
        segments: 36,
        origin: [0, hipY + m.torsoLength * 0.01, 0],
        radialScale: [1, torsoDepthScale],
      })
    )
  );

  for (const side of [-1, 1] as const) {
    const sideName = side < 0 ? 'Left' : 'Right';
    const hip = side < 0 ? leftHip : rightHip;
    const knee = side < 0 ? leftKnee : rightKnee;
    const thighAxis = direction(hip, knee);
    const pantsOrigin = midpoint(hip, knee);
    parts.push(
      part(
        `RuntimeWarrior_${sideName}Pants`,
        'cloth',
        side < 0 ? 'leftLeg' : 'rightLeg',
        null,
        createRevolvedGeometry({
          profiles: limbProfiles(segmentLength(thighAxis) + 0.02, m.thighRadius * 1.04, 8),
          segments: 24,
          origin: pantsOrigin,
          axis: thighAxis,
          radialScale: [1, 0.88],
        })
      )
    );
  }

  parts.push(
    part(
      'RuntimeWarrior_Belt',
      'leather',
      null,
      'hips',
      createRevolvedGeometry({
        profiles: [
          { y: -0.035, radius: m.hipWidth * 0.54 },
          { y: -0.018, radius: m.hipWidth * 0.57 },
          { y: 0.018, radius: m.hipWidth * 0.57 },
          { y: 0.035, radius: m.hipWidth * 0.54 },
        ],
        segments: 28,
        origin: [0, hipY - 0.115, 0],
        radialScale: [1, 0.78],
      })
    )
  );

  for (const side of [-1, 1] as const) {
    const sideName = side < 0 ? 'Left' : 'Right';
    const armRegion: RuntimeDeformRegion = side < 0 ? 'leftArm' : 'rightArm';
    const elbow = side < 0 ? leftElbow : rightElbow;
    const wrist = side < 0 ? leftWrist : rightWrist;
    const foreAxis = direction(elbow, wrist);
    const foreLength = segmentLength(foreAxis);
    const braceCenter = midpoint(
      [
        elbow[0] + foreAxis[0] * 0.17,
        elbow[1] + foreAxis[1] * 0.17,
        elbow[2] + foreAxis[2] * 0.17,
      ],
      [
        elbow[0] + foreAxis[0] * 0.74,
        elbow[1] + foreAxis[1] * 0.74,
        elbow[2] + foreAxis[2] * 0.74,
      ]
    );
    parts.push(
      part(
        `RuntimeWarrior_${sideName}Bracer`,
        'leather',
        armRegion,
        null,
        createRevolvedGeometry({
          profiles: limbProfiles(foreLength * 0.55, m.foreArmRadius * 1.14, 8),
          segments: 28,
          origin: braceCenter,
          axis: foreAxis,
          radialScale: [1, 0.88],
        })
      )
    );
  }

  for (const side of [-1, 1] as const) {
    const sideName = side < 0 ? 'Left' : 'Right';
    const ankle = side < 0 ? leftAnkle : rightAnkle;
    parts.push(
      part(
        `RuntimeWarrior_${sideName}Boot`,
        'leather',
        null,
        side < 0 ? 'leftFoot' : 'rightFoot',
        createRevolvedGeometry({
          profiles: limbProfiles(m.footLength * 0.92, m.footWidth * 0.57, 8),
          segments: 24,
          origin: [ankle[0], floorY + 0.05, m.footLength * 0.49 - 0.026],
          axis: [0, 0, 1],
          radialScale: [1, 0.62],
        })
      )
    );
  }

  parts.push(
    part(
      'RuntimeWarrior_Breastplate',
      'steel',
      null,
      'spine2',
      createCurvedPanelGeometry({
        width: m.chestWidth * 0.93,
        height: m.torsoLength * 0.43,
        columns: 20,
        rows: 8,
        origin: [0, torsoTop - m.torsoLength * 0.25, m.chestDepth * 0.48 + m.armourOffset],
        depth: m.armourOffset * 0.55,
        bulge: m.armourOffset * 1.4,
      })
    )
  );

  for (const side of [-1, 1] as const) {
    const sideName = side < 0 ? 'Left' : 'Right';
    const region: RuntimeDeformRegion = side < 0 ? 'leftArm' : 'rightArm';
    parts.push(
      part(
        `RuntimeWarrior_${sideName}Pauldron`,
        'steel',
        region,
        null,
        createCurvedPanelGeometry({
          width: m.shoulderWidth * 0.34,
          height: m.torsoLength * 0.25,
          columns: 9,
          rows: 6,
          origin: [side * (m.shoulderWidth * 0.52), shoulderY - 0.015, m.chestDepth * 0.03],
          depth: m.armourOffset * 0.1,
          bulge: m.armourOffset,
          rotationY: side * 0.48,
        })
      )
    );
  }

  for (const side of [-1, 1] as const) {
    const sideName = side < 0 ? 'Left' : 'Right';
    const ankle = side < 0 ? leftAnkle : rightAnkle;
    const knee = side < 0 ? leftKnee : rightKnee;
    const calfAxis = direction(knee, ankle);
    parts.push(
      part(
        `RuntimeWarrior_${sideName}Greave`,
        'steel',
        side < 0 ? 'leftLeg' : 'rightLeg',
        null,
        createRevolvedGeometry({
          profiles: limbProfiles(segmentLength(calfAxis) * 0.76, m.calfRadius * 1.10, 7),
          segments: 24,
          origin: midpoint(knee, ankle),
          axis: calfAxis,
          radialScale: [1, 0.87],
        })
      )
    );
  }

  parts.push(
    part(
      'RuntimeWarrior_BeltBuckle',
      'darkMetal',
      null,
      'hips',
      createCurvedPanelGeometry({
        width: m.hipWidth * 0.24,
        height: 0.075,
        columns: 10,
        rows: 5,
        origin: [0, hipY - 0.115, m.hipWidth * 0.52],
        depth: m.armourOffset * 0.15,
        bulge: m.armourOffset * 0.26,
      })
    ),
    part(
      'RuntimeWarrior_Scabbard',
      'darkMetal',
      null,
      'hips',
      createRevolvedGeometry({
        profiles: limbProfiles(m.upperLegLength * 0.70, m.ankleRadius * 0.64, 8),
        segments: 16,
        origin: [-m.hipWidth * 0.49, hipY - m.upperLegLength * 0.34, -m.hipWidth * 0.30],
        axis: [-0.06, -1, 0.04],
        radialScale: [1, 0.72],
      })
    )
  );

  return parts;
}
