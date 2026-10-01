import type { PlayableCharacterId, WarriorAttackId } from '../characters/CharacterCatalog';
import type { ElementalType } from './ElementalStatus';
import { getWarriorSkillArea, type WarriorSkillAreaDefinition } from './WarriorSkillArea';

export type WarriorSkillId = Exclude<WarriorAttackId, 'ataque_basico'>;

export interface WarriorSkillDefinition {
  readonly id: WarriorSkillId;
  readonly label: string;
  readonly input: '1' | '2' | '3' | '4' | '5';
  readonly unlockLevel: number;
  readonly damageMultiplier: number;
  readonly icon: 'spin' | 'arcane-spin' | 'jump-impact' | 'triple-flame' | 'double-cut';
  readonly element: ElementalType | null;
  readonly energyCost: number;
  readonly cooldown: number;
  /** Mage mapping remains on its previous recharge when this warrior skill is redesigned. */
  readonly mageCooldown?: number;
  /** Mage keeps its pre-redesign Lava damage while the Paladin's skill is doubled. */
  readonly mageDamageMultiplier?: number;
  /** Explicit class-specific element override; `null` preserves a non-elemental Mage spell. */
  readonly mageElement?: ElementalType | null;
  readonly playbackRate: number;
  readonly area: WarriorSkillAreaDefinition;
}

export const WARRIOR_SKILLS: readonly WarriorSkillDefinition[] = [
  {
    id: 'ataque_giratorio',
    label: 'Ataque Giratório',
    input: '1',
    unlockLevel: 3,
    damageMultiplier: 1.1,
    icon: 'spin',
    element: null,
    energyCost: 8,
    cooldown: 6,
    playbackRate: 1.1,
    area: getWarriorSkillArea('ataque_giratorio'),
  },
  {
    id: 'ataque_giratorio_2',
    label: 'Giro Glacial',
    input: '2',
    unlockLevel: 6,
    damageMultiplier: 1.14,
    icon: 'arcane-spin',
    element: 'ice',
    energyCost: 10,
    cooldown: 8,
    playbackRate: 1.1,
    area: getWarriorSkillArea('ataque_giratorio_2'),
  },
  {
    id: 'pulo_atacando',
    label: 'Pulo Atacando',
    input: '3',
    unlockLevel: 9,
    damageMultiplier: 1.18,
    icon: 'jump-impact',
    element: 'fire',
    energyCost: 14,
    cooldown: 10,
    playbackRate: 1,
    area: getWarriorSkillArea('pulo_atacando'),
  },
  {
    id: 'triplo_ataque',
    label: 'Golpe Flamejante',
    input: '4',
    unlockLevel: 12,
    damageMultiplier: 1.22,
    icon: 'triple-flame',
    element: 'fire',
    energyCost: 18,
    cooldown: 12,
    playbackRate: 1.1,
    area: getWarriorSkillArea('triplo_ataque'),
  },
  {
    id: 'corte_duplo',
    label: 'Corte Duplo',
    input: '5',
    unlockLevel: 15,
    // The prior value was 1.26, so 2.52 doubles the previous per-cut damage.
    damageMultiplier: 2.52,
    icon: 'double-cut',
    element: 'fire',
    energyCost: 16,
    cooldown: 180,
    mageCooldown: 14,
    mageDamageMultiplier: 1.26,
    mageElement: null,
    playbackRate: 1.2,
    area: getWarriorSkillArea('corte_duplo'),
  },
] as const;

export function getWarriorSkill(id: WarriorSkillId): WarriorSkillDefinition {
  const definition = WARRIOR_SKILLS.find((skill) => skill.id === id);
  if (!definition) throw new Error(`Skill de Guerreiro desconhecida: ${id}`);
  return definition;
}

export function warriorSkillCooldown(
  id: WarriorSkillId,
  playerClass: PlayableCharacterId = 'paladin'
): number {
  const skill = getWarriorSkill(id);
  return playerClass === 'mage' ? skill.mageCooldown ?? skill.cooldown : skill.cooldown;
}

export function isWarriorSkillUnlocked(id: WarriorSkillId, characterLevel: number): boolean {
  return Math.floor(characterLevel) >= getWarriorSkill(id).unlockLevel;
}

export function warriorSkillDamageMultiplier(
  id: WarriorSkillId,
  playerClass: PlayableCharacterId = 'paladin'
): number {
  const skill = getWarriorSkill(id);
  return playerClass === 'mage' && skill.mageDamageMultiplier !== undefined
    ? skill.mageDamageMultiplier
    : skill.damageMultiplier;
}

export function warriorSkillElement(
  id: WarriorSkillId,
  playerClass: PlayableCharacterId = 'paladin'
): ElementalType | null {
  const skill = getWarriorSkill(id);
  return playerClass === 'mage' && skill.mageElement !== undefined
    ? skill.mageElement
    : skill.element;
}
