import { describe, expect, it } from 'vitest';
import { WARRIOR_ATTACK_IDS } from '../characters/CharacterCatalog';
import { getWarriorAttackVfxProfile } from './WarriorAttackVfxProfiles';

describe('warrior attack VFX profiles', () => {
  it('maps every warrior attack to the approved colors in animation order', () => {
    expect(WARRIOR_ATTACK_IDS.map((id) => {
      const profile = getWarriorAttackVfxProfile(id);
      return [profile.id, profile.primary, profile.secondary];
    })).toEqual([
      ['ataque_basico', 0xd9f4ff, 0x2aa8ff],
      ['ataque_giratorio', 0xb9ff39, 0x16e868],
      ['ataque_giratorio_2', 0xff66ff, 0x633cff],
      ['pulo_atacando', 0xfff19a, 0xffad16],
      ['triplo_ataque', 0xffb11a, 0xff3d00],
      ['corte_duplo', 0xd573ff, 0xff8a32],
    ]);
  });

  it('keeps every profile inside the fixed particle pools', () => {
    for (const id of WARRIOR_ATTACK_IDS) {
      const profile = getWarriorAttackVfxProfile(id);
      expect(profile.sparkCount).toBeGreaterThan(0);
      expect(profile.sparkCount).toBeLessThanOrEqual(160);
      expect(profile.smokeCount).toBeGreaterThanOrEqual(0);
      expect(profile.smokeCount).toBeLessThanOrEqual(64);
      expect(profile.flameCount).toBeGreaterThanOrEqual(0);
      expect(profile.flameCount).toBeLessThanOrEqual(48);
    }
    expect(getWarriorAttackVfxProfile('pulo_atacando').impact).toBe(true);
    expect(getWarriorAttackVfxProfile('triplo_ataque').smokeCount).toBeGreaterThan(0);
    expect(getWarriorAttackVfxProfile('triplo_ataque').fire).toBe(true);
  });

  it('gives every skill a longer trail and more particles than the basic attack', () => {
    const basic = getWarriorAttackVfxProfile('ataque_basico');
    for (const id of WARRIOR_ATTACK_IDS.filter((id) => id !== 'ataque_basico')) {
      const profile = getWarriorAttackVfxProfile(id);
      expect(profile.fadeSeconds).toBeGreaterThanOrEqual(0.9);
      expect(profile.fadeSeconds).toBeLessThanOrEqual(1.4);
      expect(profile.sparkCount + profile.smokeCount + profile.flameCount)
        .toBeGreaterThan(basic.sparkCount + basic.smokeCount + basic.flameCount);
    }
  });
});
