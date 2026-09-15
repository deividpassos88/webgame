import {
  getAvailableWeaponDefinitions,
  type EquipmentId,
  type WeaponDefinition,
} from '../equipment/EquipmentCatalog';

export interface RewardOptionViewModel {
  readonly id: EquipmentId;
  readonly name: string;
  readonly subtitle: string;
  readonly damage: string;
  readonly range: string;
  readonly cooldown: string;
  readonly regularHeal: string;
  readonly miniBossHeal: string;
  readonly defense: string;
  readonly enabled: boolean;
  readonly definition: WeaponDefinition;
}

function decimal(value: number, digits = 1): string {
  return value.toFixed(digits).replace('.', ',');
}

function percent(fraction: number): string {
  const value = fraction * 100;
  return `${decimal(value, Number.isInteger(value) ? 0 : 1)}%`;
}

export function parseEquipmentId(value: unknown): EquipmentId | null {
  return value === 'sword' || value === 'axe' ? value : null;
}

export function rewardOptionsForAvailability(
  availability: Readonly<Record<EquipmentId, boolean>>
): RewardOptionViewModel[] {
  return getAvailableWeaponDefinitions().map((definition) => ({
    id: definition.id,
    name: definition.id === 'sword' ? 'Espada Longa' : 'Machado de Guerra',
    subtitle: definition.id === 'sword' ? 'Alcance tático' : 'Impacto brutal',
    damage: String(definition.attackDamage),
    range: `${decimal(definition.attackRange)} m`,
    cooldown: `${decimal(definition.attackCooldownTime)} s`,
    regularHeal: percent(definition.killHealFraction.regular),
    miniBossHeal: percent(definition.killHealFraction.miniBoss),
    defense: percent(definition.regularDefenseChance),
    enabled: availability[definition.id],
    definition,
  }));
}
