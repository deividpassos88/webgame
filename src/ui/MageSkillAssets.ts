import type { WarriorSkillId } from '../combat/WarriorSkillCatalog';
import type { WarriorSkillArtId } from './WarriorSkillAssets';

/**
 * Maga skill cards (webp set) live in public/assets/ui/skills/maga. The files
 * are numbered 1..6 and follow the same order as the shared skill ids used by
 * both classes: 1 basic attack, then the five unlocked skills in catalog order.
 */
const MAGE_SKILL_ASSETS: Readonly<Record<WarriorSkillArtId, string>> = {
  ataque_basico: '/assets/ui/skills/maga/1.webp',
  ataque_giratorio: '/assets/ui/skills/maga/2.webp',
  ataque_giratorio_2: '/assets/ui/skills/maga/3.webp',
  pulo_atacando: '/assets/ui/skills/maga/4.webp',
  triplo_ataque: '/assets/ui/skills/maga/5.webp',
  corte_duplo: '/assets/ui/skills/maga/6.webp',
};

export function mageSkillAsset(id: WarriorSkillArtId): string {
  return MAGE_SKILL_ASSETS[id];
}
