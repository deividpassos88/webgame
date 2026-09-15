/** Regions that receive vertex influences from the runtime warrior rig. */
export type RuntimeDeformRegion =
  | 'head'
  | 'torso'
  | 'leftArm'
  | 'rightArm'
  | 'leftLeg'
  | 'rightLeg';

/** Mixamo bones used by the runtime geometry and skinning stages. */
export type RuntimeRigBoneId =
  | 'hips'
  | 'spine'
  | 'spine1'
  | 'spine2'
  | 'neck'
  | 'head'
  | 'leftUpperArm'
  | 'leftForeArm'
  | 'leftHand'
  | 'rightUpperArm'
  | 'rightForeArm'
  | 'rightHand'
  | 'leftUpLeg'
  | 'leftLeg'
  | 'leftFoot'
  | 'rightUpLeg'
  | 'rightLeg'
  | 'rightFoot';

export type RuntimeMaterialRole =
  | 'skin'
  | 'eye'
  | 'hair'
  | 'cloth'
  | 'leather'
  | 'steel'
  | 'darkMetal';

/**
 * Proportions are expressed in model units (the default is approximately
 * 1.85m tall). Optional fields make it possible for a caller to override a
 * single proportion while the geometry factory keeps safe defaults for the
 * remaining values.
 */
export interface RuntimeWarriorMeasurements {
  readonly height?: number;
  readonly shoulderWidth?: number;
  readonly chestWidth?: number;
  readonly chestDepth?: number;
  readonly waistWidth?: number;
  readonly hipWidth?: number;
  readonly torsoLength?: number;
  readonly neckRadius?: number;
  readonly headHeight?: number;
  readonly headWidth?: number;
  readonly headDepth?: number;
  readonly upperArmLength?: number;
  readonly foreArmLength?: number;
  readonly upperLegLength?: number;
  readonly lowerLegLength?: number;
  readonly footLength?: number;
  readonly footWidth?: number;
  readonly handLength?: number;
  readonly handWidth?: number;
  readonly upperArmRadius?: number;
  readonly foreArmRadius?: number;
  readonly thighRadius?: number;
  readonly calfRadius?: number;
  readonly ankleRadius?: number;
  readonly tunicOffset?: number;
  readonly armourOffset?: number;
}

/** Measurements used by the playable warrior when no custom proportions are supplied. */
export const DEFAULT_RUNTIME_WARRIOR_MEASUREMENTS: Readonly<Required<RuntimeWarriorMeasurements>> = {
  height: 1.85,
  shoulderWidth: 0.62,
  chestWidth: 0.42,
  chestDepth: 0.29,
  waistWidth: 0.32,
  hipWidth: 0.40,
  torsoLength: 0.67,
  neckRadius: 0.105,
  headHeight: 0.29,
  headWidth: 0.22,
  headDepth: 0.20,
  upperArmLength: 0.30,
  foreArmLength: 0.27,
  upperLegLength: 0.44,
  lowerLegLength: 0.42,
  footLength: 0.28,
  footWidth: 0.13,
  handLength: 0.18,
  handWidth: 0.095,
  upperArmRadius: 0.095,
  foreArmRadius: 0.075,
  thighRadius: 0.145,
  calfRadius: 0.105,
  ankleRadius: 0.075,
  tunicOffset: 0.018,
  armourOffset: 0.035,
};

export interface RuntimeWarriorPartGeometry {
  readonly id: string;
  readonly materialRole: RuntimeMaterialRole;
  readonly deformRegion: RuntimeDeformRegion | null;
  readonly geometry: import('three').BufferGeometry;
  readonly rigidBone: RuntimeRigBoneId | null;
}

/** Runtime rendering limits shared by geometry, factory and budget validation. */
export const RUNTIME_WARRIOR_BUDGET = {
  minTriangles: 14_000,
  maxTriangles: 18_000,
  maxDrawCalls: 8,
  maxInfluences: 4,
  minimumWeight: 0.001,
  materialRoles: 7,
} as const;

/** Canonical landmark used when fitting procedural vertices to an imported rig. */
export const RUNTIME_WARRIOR_CANONICAL_HIP_Y =
  Math.max(0.025, DEFAULT_RUNTIME_WARRIOR_MEASUREMENTS.height * 0.02) +
  DEFAULT_RUNTIME_WARRIOR_MEASUREMENTS.lowerLegLength +
  DEFAULT_RUNTIME_WARRIOR_MEASUREMENTS.upperLegLength;
