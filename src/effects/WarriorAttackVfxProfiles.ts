import type { WarriorAttackId } from '../characters/CharacterCatalog';

export interface WarriorAttackVfxProfile {
  readonly id: WarriorAttackId;
  readonly primary: number;
  readonly secondary: number;
  readonly sparkCount: number;
  readonly smokeCount: number;
  readonly flameCount: number;
  readonly sparkRate: number;
  readonly sparkLife: number;
  readonly sparkSize: number;
  readonly smokeSize: number;
  readonly trailOpacity: number;
  readonly glowOpacity: number;
  readonly impact: boolean;
  readonly fire: boolean;
  readonly fadeSeconds: number;
}

const PROFILES: Readonly<Record<WarriorAttackId, WarriorAttackVfxProfile>> = {
  ataque_basico: {
    id: 'ataque_basico', primary: 0xd9f4ff, secondary: 0x2aa8ff,
    sparkCount: 40, smokeCount: 0, flameCount: 0, sparkRate: 72, sparkLife: 0.32,
    sparkSize: 0.075, smokeSize: 0.2, trailOpacity: 0.9,
    glowOpacity: 0.42, impact: false, fire: false, fadeSeconds: 0.55,
  },
  ataque_giratorio: {
    id: 'ataque_giratorio', primary: 0xb9ff39, secondary: 0x16e868,
    sparkCount: 96, smokeCount: 8, flameCount: 0, sparkRate: 152, sparkLife: 0.62,
    sparkSize: 0.095, smokeSize: 0.22, trailOpacity: 0.94,
    glowOpacity: 0.52, impact: false, fire: false, fadeSeconds: 0.95,
  },
  ataque_giratorio_2: {
    id: 'ataque_giratorio_2', primary: 0xff66ff, secondary: 0x633cff,
    sparkCount: 112, smokeCount: 12, flameCount: 0, sparkRate: 172, sparkLife: 0.68,
    sparkSize: 0.1, smokeSize: 0.22, trailOpacity: 0.96,
    glowOpacity: 0.56, impact: false, fire: false, fadeSeconds: 1.05,
  },
  pulo_atacando: {
    id: 'pulo_atacando', primary: 0xfff19a, secondary: 0xffad16,
    sparkCount: 128, smokeCount: 18, flameCount: 0, sparkRate: 146, sparkLife: 0.74,
    sparkSize: 0.11, smokeSize: 0.3, trailOpacity: 0.98,
    glowOpacity: 0.58, impact: true, fire: false, fadeSeconds: 1.2,
  },
  triplo_ataque: {
    id: 'triplo_ataque', primary: 0xffb11a, secondary: 0xff3d00,
    sparkCount: 160, smokeCount: 64, flameCount: 48, sparkRate: 220, sparkLife: 0.82,
    sparkSize: 0.18, smokeSize: 0.42, trailOpacity: 1,
    glowOpacity: 0.62, impact: false, fire: true, fadeSeconds: 1.4,
  },
  corte_duplo: {
    id: 'corte_duplo', primary: 0xd573ff, secondary: 0xff8a32,
    sparkCount: 136, smokeCount: 24, flameCount: 0, sparkRate: 184, sparkLife: 0.72,
    sparkSize: 0.105, smokeSize: 0.3, trailOpacity: 0.98,
    glowOpacity: 0.58, impact: false, fire: false, fadeSeconds: 1.15,
  },
};

export function getWarriorAttackVfxProfile(
  id: WarriorAttackId
): WarriorAttackVfxProfile {
  return PROFILES[id];
}
