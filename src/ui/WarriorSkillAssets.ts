import type { WarriorSkillId } from '../combat/WarriorSkillCatalog';

export type WarriorSkillArtId = WarriorSkillId | 'ataque_basico';

const WARRIOR_SKILL_ASSETS: Readonly<Record<WarriorSkillArtId, string>> = {
  ataque_basico: '/assets/ui/skills/basic-attack.png',
  ataque_giratorio: '/assets/ui/skills/spin.png',
  ataque_giratorio_2: '/assets/ui/skills/frost-spin.png',
  pulo_atacando: '/assets/ui/skills/jump-impact.png',
  triplo_ataque: '/assets/ui/skills/flame-strike.png',
  corte_duplo: '/assets/ui/skills/double-cut.png',
};

export function warriorSkillAsset(id: WarriorSkillArtId): string {
  return WARRIOR_SKILL_ASSETS[id];
}

export function renderSkillStars(level: number): string {
  const safeLevel = Math.max(0, Math.min(5, Math.floor(level)));
  return `<span class="skill-stars" aria-label="${safeLevel} de 5 estrelas">${Array.from({ length: 5 }, (_, index) => {
    const filled = index < safeLevel;
    return `<svg class="skill-star${filled ? ' is-filled' : ''}" viewBox="0 0 24 24" aria-hidden="true"><path d="m12 2.4 2.9 5.87 6.48.94-4.69 4.57 1.11 6.46L12 17.2l-5.8 3.04 1.11-6.46-4.69-4.57 6.48-.94L12 2.4Z"/></svg>`;
  }).join('')}</span>`;
}
