import { MathUtils } from 'three';
import { WATER_DRAGON_SHAPE } from './WaterDragonGeometry';

export const WATER_DRAGON_FALL_SECONDS = 0.22;
export const WATER_DRAGON_IMPACT_SECONDS = 0.85;

/**
 * Art-direction contract: down -> contact -> spread OUT and settle DOWN.
 * In particular, never scale the splash uniformly from small to large: that
 * made the previous version grow a rising dome while its column disappeared.
 */
export function sampleWaterDragonStrike(age: number) {
  const safeAge = Number.isFinite(age) ? Math.max(0, age) : 0;
  const descent = MathUtils.clamp(safeAge / WATER_DRAGON_FALL_SECONDS, 0, 1);
  const impactAge = Math.max(0, safeAge - WATER_DRAGON_FALL_SECONDS);
  return {
    columnY: WATER_DRAGON_SHAPE.columnHeight * Math.pow(1 - descent, 1.4),
    impactAge,
    landed: descent >= 1,
    // The tail of the water packet comes DOWN from the sky at the end.
    topCut: 1.05 * (1 - MathUtils.smoothstep(impactAge, 0.55, 0.85)),
    columnOpacity: 1 - MathUtils.smoothstep(impactAge, 0.71, 0.85),
    splashOpacity: 1 - MathUtils.smoothstep(impactAge, 0.36, 0.82),
    crownRadius: 0.82 + MathUtils.smoothstep(impactAge, 0, 0.23) * 0.38,
    crownHeight: 1 - MathUtils.smoothstep(impactAge, 0, 0.26) * 0.86,
    ringRadius: 0.72 + MathUtils.smoothstep(impactAge, 0, 0.20) * 0.50,
    alive: impactAge < WATER_DRAGON_IMPACT_SECONDS,
  };
}
