import { describe, expect, it } from 'vitest';
import {
  WARRIOR_SKILLS,
  getWarriorSkill,
  warriorSkillCooldown,
  warriorSkillDamageMultiplier,
  warriorSkillElement,
} from './WarriorSkillCatalog';

describe('WarriorSkillCatalog', () => {
  it('keeps fire and ice assigned to the approved warrior skills', () => {
    expect(getWarriorSkill('triplo_ataque')).toMatchObject({
      label: 'Golpe Flamejante',
      element: 'fire',
    });
    expect(getWarriorSkill('ataque_giratorio_2')).toMatchObject({
      label: 'Giro Glacial',
      element: 'ice',
    });
    // O impacto do Pulo Atacando levanta os monstros em chamas: é elementar fogo.
    expect(getWarriorSkill('pulo_atacando')).toMatchObject({ element: 'fire' });
    expect(getWarriorSkill('corte_duplo')).toMatchObject({ element: 'fire' });
    expect(WARRIOR_SKILLS.filter(({ element }) => element === null)).toHaveLength(1);
  });

  it('extends only the two spins and Double Cut to ten meters', () => {
    expect(WARRIOR_SKILLS.filter(({ id }) => id === 'ataque_giratorio' || id === 'ataque_giratorio_2')
      .every(({ area }) => area.radius === 10)).toBe(true);
    expect(getWarriorSkill('corte_duplo').area.radius).toBe(10);
    expect(WARRIOR_SKILLS.filter(({ id }) =>
      id !== 'ataque_giratorio' && id !== 'ataque_giratorio_2' && id !== 'corte_duplo'
    ).every(({ area }) => area.radius + (area.forwardOffset ?? 0) <= 5)).toBe(true);
    expect(WARRIOR_SKILLS.every(({ playbackRate }) => playbackRate >= 1 && playbackRate <= 1.2)).toBe(true);
  });

  it('gives Double Cut a three-minute Paladin cooldown and keeps the Mage mapping at fourteen seconds', () => {
    expect(getWarriorSkill('corte_duplo')).toMatchObject({
      label: 'Corte Duplo',
      element: 'fire',
      cooldown: 180,
      mageCooldown: 14,
      mageDamageMultiplier: 1.26,
      mageElement: null,
      area: { shape: 'arc', radius: 10, angleDegrees: 125 },
    });
    expect(warriorSkillCooldown('corte_duplo', 'paladin')).toBe(180);
    expect(warriorSkillCooldown('corte_duplo', 'mage')).toBe(14);
    expect(warriorSkillDamageMultiplier('corte_duplo', 'paladin')).toBe(2.52);
    expect(warriorSkillDamageMultiplier('corte_duplo', 'mage')).toBe(1.26);
    expect(warriorSkillElement('corte_duplo', 'paladin')).toBe('fire');
    expect(warriorSkillElement('corte_duplo', 'mage')).toBeNull();
    expect(WARRIOR_SKILLS.map(({ cooldown }) => cooldown)).toEqual([6, 8, 10, 12, 180]);
  });

  it('unlocks skills every three levels with the approved progressive damage bonus', () => {
    expect(WARRIOR_SKILLS.map((skill) => ({
      id: skill.id,
      unlockLevel: skill.unlockLevel,
      damageMultiplier: skill.damageMultiplier,
    }))).toEqual([
      { id: 'ataque_giratorio', unlockLevel: 3, damageMultiplier: 1.1 },
      { id: 'ataque_giratorio_2', unlockLevel: 6, damageMultiplier: 1.14 },
      { id: 'pulo_atacando', unlockLevel: 9, damageMultiplier: 1.18 },
      { id: 'triplo_ataque', unlockLevel: 12, damageMultiplier: 1.22 },
      { id: 'corte_duplo', unlockLevel: 15, damageMultiplier: 2.52 },
    ]);
  });
});
