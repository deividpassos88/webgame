export type EquipmentId = 'sword' | 'axe';
export type EquipmentSlot = 'weapon' | 'chest';

export const EQUIPMENT_SLOTS: readonly EquipmentSlot[] = ['weapon', 'chest'];

export interface WeaponDefinition {
  id: EquipmentId;
  label: 'Espada' | 'Machado';
  assetLabel: 'Sword' | 'Axe';
  modelPath: string;
  slot: 'weapon';
  socketName: 'mixamorigRightHand';
  desiredLength: number;
  gripFraction: number;
  rotation: readonly [number, number, number];
  offset: readonly [number, number, number];
  /** Alcance do golpe em unidades de mundo (espada maior que machado) */
  attackRange: number;
  /** Dano por golpe */
  attackDamage: number;
  /** Velocidade de ataque: segundos entre golpes */
  attackCooldownTime: number;
  readonly killHealFraction: {
    readonly regular: number;
    readonly miniBoss: number;
  };
  readonly regularDefenseChance: number;
}

// Balancamento: espada = alcance maior, dano médio, rápido
//               machado = alcance curto, dano alto, lento
const SWORD_RANGE = 2.7;
const AXE_RANGE = 2.0;

export const WEAPONS: readonly WeaponDefinition[] = [
  {
    id: 'sword',
    label: 'Espada',
    assetLabel: 'Sword',
    modelPath: '/models/sword.glb',
    slot: 'weapon',
    socketName: 'mixamorigRightHand',
    desiredLength: 1.35,
    gripFraction: 0.12,
    rotation: [-1.7628, 0.4189, -1.2217],
    offset: [0.02, -0.35, -0.15],
    attackRange: SWORD_RANGE,
    attackDamage: 8,
    attackCooldownTime: 0.67,
    killHealFraction: { regular: 0.03, miniBoss: 0.06 },
    regularDefenseChance: 0.03,
  },
  {
    id: 'axe',
    label: 'Machado',
    assetLabel: 'Axe',
    modelPath: '/models/axe.glb',
    slot: 'weapon',
    socketName: 'mixamorigRightHand',
    desiredLength: 0.9,
    gripFraction: 0.12,
    rotation: [0.0175, 0.1745, -2.2340],
    offset: [0.16, 0.09, 0.09],
    attackRange: AXE_RANGE,
    attackDamage: 10,
    attackCooldownTime: 0.87,
    killHealFraction: { regular: 0.031, miniBoss: 0.062 },
    regularDefenseChance: 0.05,
  },
];

export function getAvailableWeaponDefinitions(): readonly WeaponDefinition[] {
  return WEAPONS;
}

export function getWeaponDefinition(id: unknown): WeaponDefinition | undefined {
  return WEAPONS.find((weapon) => weapon.id === id);
}
