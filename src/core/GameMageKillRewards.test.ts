import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { Game } from './Game';

interface FakeEquipCall {
  definition: { id: string };
  model: THREE.Group;
}

function mageGameWithMocks() {
  const game = Object.create(Game.prototype) as Game & Record<string, unknown>;
  const equipCalls: FakeEquipCall[] = [];
  const player = {
    equippedWeaponId: null as string | null,
    maxHP: 100,
    hp: 80,
    equipWeapon: (definition: { id: string }, model: THREE.Group) => {
      equipCalls.push({ definition, model });
      // Mirrors Player.equipWeapon virtual path: combat status without visual.
      player.equippedWeaponId = definition.id;
      return true;
    },
  };
  const plasmaSpawns: Array<{ origin: THREE.Vector3; healAmount: number }> = [];
  Object.assign(game, {
    profile: {
      selectedClass: 'mage',
      equipment: {
        helmet: null,
        chest: null,
        gloves: null,
        pants: null,
        boots: null,
        weapon: 'starter-staff',
        primaryWeapon: 'starter-staff',
        secondaryWeapon: null,
      },
    },
    player,
    rewardAssets: { hasWeapon: vi.fn(() => true) },
    healthPlasma: {
      spawn: (origin: THREE.Vector3, healAmount: number) => {
        plasmaSpawns.push({ origin, healAmount });
      },
    },
    bonusAttackDamage: 0,
    bonusMaxHealth: 0,
    applyCharacterBuild: vi.fn(),
  });
  return { game, player, equipCalls, plasmaSpawns };
}

describe('Mage kill rewards', () => {
  it('equips the starter cajado as sword-equivalent combat status without a sword visual', () => {
    const { game, player, equipCalls } = mageGameWithMocks();
    (game as unknown as { synchronizeEquippedWeapon(): void }).synchronizeEquippedWeapon();
    expect(equipCalls).toHaveLength(1);
    expect(equipCalls[0].definition).toMatchObject({ id: 'sword' });
    // The Maga never receives the sword model: only an empty holder group.
    expect(equipCalls[0].model).toBeInstanceOf(THREE.Group);
    expect(equipCalls[0].model.children).toHaveLength(0);
    expect(player.equippedWeaponId).toBe('sword');
  });

  it('heals the Maga on a regular kill exactly like the Guerreiro', () => {
    const { game, player, plasmaSpawns } = mageGameWithMocks();
    (game as unknown as { synchronizeEquippedWeapon(): void }).synchronizeEquippedWeapon();
    expect(player.equippedWeaponId).toBe('sword');

    const enemyRoot = new THREE.Object3D();
    enemyRoot.position.set(2, 0, 3);
    enemyRoot.userData.enemyBodyScale = 1;
    (game as unknown as {
      applyKillRewards(role: string, enemy: { root: THREE.Object3D }): void;
    }).applyKillRewards('regular', { root: enemyRoot });

    // 3% of 100 max HP — the same plasma the sword grants the Guerreiro.
    expect(plasmaSpawns).toHaveLength(1);
    expect(plasmaSpawns[0].healAmount).toBe(3);
    expect(plasmaSpawns[0].origin.x).toBeCloseTo(2);
    expect(plasmaSpawns[0].origin.z).toBeCloseTo(3);
  });

  it('still grants no healing without an equipped weapon', () => {
    const { game, plasmaSpawns } = mageGameWithMocks();
    const equipment = (game as unknown as { profile: { equipment: Record<string, string | null> } })
      .profile.equipment;
    equipment.primaryWeapon = null;
    equipment.weapon = null;
    (game as unknown as { synchronizeEquippedWeapon(): void }).synchronizeEquippedWeapon();

    const enemyRoot = new THREE.Object3D();
    (game as unknown as {
      applyKillRewards(role: string, enemy: { root: THREE.Object3D }): void;
    }).applyKillRewards('regular', { root: enemyRoot });

    expect(plasmaSpawns).toHaveLength(0);
  });
});
