import type { PlayableCharacterId, WarriorAttackId } from '../characters/CharacterCatalog';
import type { ElementalType } from './ElementalStatus';
import { getWarriorSkillArea, type WarriorSkillAreaDefinition } from './WarriorSkillArea';

export type WarriorSkillId = Exclude<WarriorAttackId, 'ataque_basico'>;

export interface WarriorSkillDefinition {
  readonly id: WarriorSkillId;
  readonly label: string;
  readonly mageLabel?: string;
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
  /** Mage cast tempo only: damage, MP and cooldowns remain unchanged. */
  readonly magePlaybackRate?: number;
  readonly area: WarriorSkillAreaDefinition;
}

export const WARRIOR_SKILLS: readonly WarriorSkillDefinition[] = [
  {
    id: 'ataque_giratorio',
    label: 'Ataque Giratório',
    mageLabel: 'Dragão das Marés',
    input: '1',
    unlockLevel: 3,
    damageMultiplier: 1.1,
    // Maga: multiplicador base na estrela 1 (+0,5× por estrela extra, até 5★).
    mageDamageMultiplier: 1.5,
    icon: 'spin',
    element: null,
    energyCost: 8,
    cooldown: 6,
    playbackRate: 1.1,
    magePlaybackRate: 1.8,
    area: getWarriorSkillArea('ataque_giratorio'),
  },
  {
    id: 'ataque_giratorio_2',
    label: 'Giro Glacial',
    input: '2',
    unlockLevel: 6,
    damageMultiplier: 1.14,
    mageDamageMultiplier: 1.7,
    icon: 'arcane-spin',
    element: 'ice',
    energyCost: 10,
    cooldown: 8,
    playbackRate: 1.1,
    magePlaybackRate: 1.8,
    area: getWarriorSkillArea('ataque_giratorio_2'),
  },
  {
    id: 'pulo_atacando',
    label: 'Pulo Atacando',
    mageLabel: 'Juízo do Trovão',
    input: '3',
    unlockLevel: 9,
    damageMultiplier: 1.18,
    mageDamageMultiplier: 2,
    icon: 'jump-impact',
    element: 'fire',
    energyCost: 14,
    cooldown: 10,
    playbackRate: 1,
    magePlaybackRate: 2.1,
    area: getWarriorSkillArea('pulo_atacando'),
  },
  {
    id: 'triplo_ataque',
    label: 'Golpe Flamejante',
    input: '4',
    unlockLevel: 12,
    damageMultiplier: 1.22,
    mageDamageMultiplier: 2.3,
    icon: 'triple-flame',
    element: 'fire',
    energyCost: 18,
    cooldown: 12,
    // Animação em velocidade normal (1x): a skill toca exatamente como o clipe
    // foi autorado; quem acelera é só o combo empoderado.
    playbackRate: 1,
    magePlaybackRate: 1.8,
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
    mageDamageMultiplier: 2.6,
    mageElement: null,
    playbackRate: 1.2,
    magePlaybackRate: 1.9,
    area: getWarriorSkillArea('corte_duplo'),
  },
] as const;

export function getWarriorSkill(id: WarriorSkillId): WarriorSkillDefinition {
  const definition = WARRIOR_SKILLS.find((skill) => skill.id === id);
  if (!definition) throw new Error(`Skill de Guerreiro desconhecida: ${id}`);
  return definition;
}

export function warriorSkillLabel(
  id: WarriorSkillId,
  playerClass: PlayableCharacterId = 'paladin'
): string {
  const skill = getWarriorSkill(id);
  return playerClass === 'mage' ? skill.mageLabel ?? skill.label : skill.label;
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

/** Estrelas de uma skill (1 a 5). Cada estrela acima da 1ª soma 0,5× ao dano da Maga. */
export const MAX_SKILL_STARS = 5;
export const MAGE_SKILL_STAR_DAMAGE_STEP = 0.5;

export function clampSkillStars(stars: number | undefined): number {
  if (stars === undefined || !Number.isFinite(stars)) return 1;
  return Math.min(MAX_SKILL_STARS, Math.max(1, Math.floor(stars)));
}

export function warriorSkillDamageMultiplier(
  id: WarriorSkillId,
  playerClass: PlayableCharacterId = 'paladin',
  stars: number = 1
): number {
  const skill = getWarriorSkill(id);
  if (playerClass !== 'mage') return skill.damageMultiplier;
  const base = skill.mageDamageMultiplier ?? skill.damageMultiplier;
  const extraStars = clampSkillStars(stars) - 1;
  // Arredonda para evitar ruído de ponto flutuante (ex.: 1.7 + 0.5 = 2.2).
  return Math.round((base + extraStars * MAGE_SKILL_STAR_DAMAGE_STEP) * 100) / 100;
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
