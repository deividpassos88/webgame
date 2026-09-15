import { describe, expect, it } from 'vitest';
import {
  getAvailableWeaponDefinitions,
  getWeaponDefinition,
} from './EquipmentCatalog';

describe('equipment catalog', () => {
  it('offers only Sword and Axe with their real GLB paths', () => {
    expect(
      getAvailableWeaponDefinitions().map(({ id, label, modelPath }) => ({
        id,
        label,
        modelPath,
      }))
    ).toEqual([
      { id: 'sword', label: 'Espada', modelPath: '/models/sword.glb' },
      { id: 'axe', label: 'Machado', modelPath: '/models/axe.glb' },
    ]);
  });

  it('rejects an unknown reward id instead of producing equipment', () => {
    expect(getWeaponDefinition('armor')).toBeUndefined();
  });

  it('uses the approved combat values for both weapons', () => {
    expect(getWeaponDefinition('sword')).toMatchObject({
      attackDamage: 8,
      attackRange: 2.7,
      attackCooldownTime: 0.67,
      killHealFraction: { regular: 0.03, miniBoss: 0.06 },
      regularDefenseChance: 0.03,
    });
    expect(getWeaponDefinition('axe')).toMatchObject({
      attackDamage: 10,
      attackRange: 2.0,
      attackCooldownTime: 0.87,
      killHealFraction: { regular: 0.031, miniBoss: 0.062 },
      regularDefenseChance: 0.05,
    });
  });
});
