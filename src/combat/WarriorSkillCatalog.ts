import type { WarriorAttackId } from '../characters/CharacterCatalog';
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
  readonly playbackRate: number;
  readonly area: WarriorSkillAreaDefinition;
}

export const WARRIOR_SKILLS: readonly WarriorSkillDefinition[] = [
  {
    id: 'ataque_giratorio',
    label: 'Ataque Giratório',
    input: '1',
    unlockLevel: 2,
    damageMultiplier: 1.1,
    icon: 'spin',
    element: null,
    energyCost: 8,
    cooldown: 4,
    playbackRate: 1.1,
    area: getWarriorSkillArea('ataque_giratorio'),
  },
  {
    id: 'ataque_giratorio_2',
    label: 'Giro Glacial',
    input: '2',
    unlockLevel: 3,
    damageMultiplier: 1.14,
    icon: 'arcane-spin',
    element: 'ice',
    energyCost: 10,
    cooldown: 4,
    playbackRate: 1.1,
    area: getWarriorSkillArea('ataque_giratorio_2'),
  },
  {
    id: 'pulo_atacando',
    label: 'Pulo Atacando',
    input: '3',
    unlockLevel: 4,
    damageMultiplier: 1.18,
    icon: 'jump-impact',
    element: null,
    energyCost: 14,
    cooldown: 4,
    playbackRate: 1,
    area: getWarriorSkillArea('pulo_atacando'),
  },
  {
    id: 'triplo_ataque',
    label: 'Golpe Flamejante',
    input: '4',
    unlockLevel: 5,
    damageMultiplier: 1.22,
    icon: 'triple-flame',
    element: 'fire',
    energyCost: 18,
    cooldown: 4,
    playbackRate: 1.1,
    area: getWarriorSkillArea('triplo_ataque'),
  },
  {
    id: 'corte_duplo',
    label: 'Corte Duplo',
    input: '5',
    unlockLevel: 7,
    damageMultiplier: 1.26,
    icon: 'double-cut',
    element: null,
    energyCost: 16,
    cooldown: 4,
    playbackRate: 1.2,
    area: getWarriorSkillArea('corte_duplo'),
  },
] as const;

export function getWarriorSkill(id: WarriorSkillId): WarriorSkillDefinition {
  const definition = WARRIOR_SKILLS.find((skill) => skill.id === id);
  if (!definition) throw new Error(`Skill de Guerreiro desconhecida: ${id}`);
  return definition;
}

export function isWarriorSkillUnlocked(id: WarriorSkillId, characterLevel: number): boolean {
  return Math.floor(characterLevel) >= getWarriorSkill(id).unlockLevel;
}

export function warriorSkillDamageMultiplier(id: WarriorSkillId): number {
  return getWarriorSkill(id).damageMultiplier;
}
