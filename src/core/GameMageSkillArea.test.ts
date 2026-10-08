import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { Game } from './Game';
import type { CombatRecord } from '../waves/CombatEntityRegistry';
import { MAGE_SKILL_AREA_RADIUS_METERS } from '../combat/MageSkillImpact';
import { warriorSkillDamageMultiplier, warriorSkillElement } from '../combat/WarriorSkillCatalog';
import { getWarriorSkillDamage } from '../combat/WarriorSkillArea';
import { getTypedAttackBaseDamage } from '../combat/CombatDamage';
import {
  applyDistanceFalloff,
  getEffectiveTargetDistance,
  MAGE_MAX_RANGE_METERS,
} from '../combat/DistanceDamage';
import type { MageSpellId } from '../vfx/VFXTypes';

const ATTACK_DAMAGE = 100;
const COLLISION_RADIUS = 0.45;
const PLAYER_POSITION = new THREE.Vector3(0, 0, 0);

interface FakeEnemy {
  readonly root: THREE.Object3D;
  isDead: boolean;
  readonly collisionRadius: number;
  readonly hits: number[];
  readonly freezes: number;
  readonly slows: number;
  elementalHits: number;
}

function fakeEnemy(x: number, z: number): FakeEnemy {
  const root = new THREE.Object3D();
  root.position.set(x, 0, z);
  root.userData.isEnemyRoot = true;
  const enemy: FakeEnemy = {
    root,
    isDead: false,
    collisionRadius: COLLISION_RADIUS,
    hits: [],
    freezes: 0,
    slows: 0,
    elementalHits: 0,
  };
  Object.assign(root.userData, {
    receivePlayerHit: (damage: number) => enemy.hits.push(damage),
  });
  return enemy;
}

function buildGame(enemies: FakeEnemy[]) {
  const game = Object.create(Game.prototype) as Game & Record<string, unknown>;
  const records: CombatRecord[] = enemies.map((enemy, index) => ({
    id: `enemy-${index}`,
    phaseId: 1,
    role: 'regular',
    deathReported: false,
    enemy: {
      root: enemy.root,
      isDead: false,
      collisionRadius: enemy.collisionRadius,
      receivePlayerHit: (damage: number) => enemy.hits.push(damage),
      applyElementalHit: () => { enemy.elementalHits += 1; },
      applyMageFreeze: () => { (enemy as { freezes: number }).freezes += 1; },
      applyMageSlow: () => { (enemy as { slows: number }).slows += 1; },
    } as unknown as CombatRecord['enemy'],
  }));
  const controlCalls: Array<{ spellId: MageSpellId; enemy: unknown }> = [];
  const decals: Array<{ position: THREE.Vector3; radius: number; style: string }> = [];
  Object.assign(game, {
    profile: { selectedClass: 'mage', progression: { level: 20 } },
    player: {
      attackDamage: ATTACK_DAMAGE,
      root: { position: PLAYER_POSITION },
      isDead: false,
      hp: 100,
      maxHP: 100,
    },
    trainingDummy: undefined,
    combatRegistry: {
      activeRoots: () => records.filter((record) => !record.enemy.isDead).map((record) => record.enemy.root),
      findByRoot: (root: THREE.Object3D) => records.find((record) => record.enemy.root === root) ?? null,
    },
    mageVFX: {
      playGroundImpactDecal: (options: { position: THREE.Vector3; radius: number; style: string }) => {
        decals.push({ position: options.position.clone(), radius: options.radius, style: options.style });
      },
    },
    getCharacterStats: () => ({ physicalDamageMultiplier: 1, lifeStealFraction: 0 }),
    comboDamageMultiplierFor: () => 1,
    // Sem crítico aleatório: o dano fica previsível para conferir a conta.
    resolveOutgoingDamage: (damage: number) => Math.round(damage),
    hasAdminFreeSkills: () => false,
    healFromLifeSteal: vi.fn(),
    showFloatingDamage: vi.fn(),
    syncCombatHealthBars: vi.fn(),
    handleEnemyDeath: vi.fn(),
    applyMageSkillControl: (
      spellId: MageSpellId,
      enemy: { applyMageFreeze?: (seconds: number) => void; applyMageSlow?: (seconds: number) => void }
    ) => {
      controlCalls.push({ spellId, enemy });
      if (spellId === 'ice') enemy.applyMageFreeze?.(3);
      if (spellId === 'water') enemy.applyMageSlow?.(3);
    },
  });
  const cast = (spellId: MageSpellId, target: THREE.Object3D): void => {
    (game as unknown as {
      applyMageSkillBodyDamage(id: MageSpellId, root: THREE.Object3D): void;
    }).applyMageSkillBodyDamage(spellId, target);
  };
  return { game, cast, controlCalls, decals, records };
}

/** Mesma conta que o jogo faz para uma vítima do feitiço. */
function expectedDamage(spellId: MageSpellId, victim: THREE.Vector3): number {
  const attackId = spellId === 'water' ? 'ataque_giratorio' : 'ataque_giratorio_2';
  const elemental = warriorSkillElement(attackId, 'mage') !== null;
  const baseDamage = getTypedAttackBaseDamage(
    getWarriorSkillDamage(ATTACK_DAMAGE) * warriorSkillDamageMultiplier(attackId, 'mage'),
    1,
    elemental
  );
  const rawDistance = getEffectiveTargetDistance(
    PLAYER_POSITION.distanceTo(victim),
    COLLISION_RADIUS
  );
  const distance = rawDistance <= MAGE_MAX_RANGE_METERS + 0.45
    ? Math.min(rawDistance, MAGE_MAX_RANGE_METERS)
    : rawDistance;
  return Math.round(applyDistanceFalloff(baseDamage, distance, 'mage'));
}

describe('dano em área das cinco skills da Maga', () => {
  it('a água atinge todos os monstros vivos num raio de 3 m do impacto', () => {
    const primary = fakeEnemy(6, 0);
    const perto = fakeEnemy(8.9, 0);      // 2,9 m do alvo: dentro
    const fora = fakeEnemy(9.1, 0);       // 3,1 m do alvo: fora
    const diagonal = fakeEnemy(6, 2.9);   // 2,9 m do alvo: dentro
    const { cast, decals } = buildGame([primary, perto, fora, diagonal]);

    cast('water', primary.root);

    // Um golpe por corpo, sem repetição no alvo que levou o feitiço em cheio.
    expect(primary.hits).toHaveLength(1);
    expect(perto.hits).toHaveLength(1);
    expect(diagonal.hits).toHaveLength(1);
    expect(fora.hits).toEqual([]);
    // Cada vítima leva a MESMA conta que o alvo principal levava: falloff pela
    // distância até a Maga.
    expect(primary.hits[0]).toBe(expectedDamage('water', primary.root.position));
    expect(perto.hits[0]).toBe(expectedDamage('water', perto.root.position));
    expect(diagonal.hits[0]).toBe(expectedDamage('water', diagonal.root.position));
    // E o vizinho mais longe leva menos que o alvo colado na Maga.
    expect(perto.hits[0]).toBeLessThan(primary.hits[0]);
    // O desenho de chão nasce no ponto do impacto, cobrindo o mesmo raio do dano.
    expect(decals).toHaveLength(1);
    expect(decals[0].style).toBe('cracked');
    expect(decals[0].radius).toBe(MAGE_SKILL_AREA_RADIUS_METERS);
    expect(decals[0].position.x).toBeCloseTo(primary.root.position.x, 5);
    expect(decals[0].position.z).toBeCloseTo(primary.root.position.z, 5);
  });

  it('o gelo estoura em área e desenha o chão congelado, sem congelar os vizinhos', () => {
    const primary = fakeEnemy(6, 0);
    const dentro = fakeEnemy(6, 2.8);
    const fora = fakeEnemy(6, 3.4);
    const { cast, decals, controlCalls } = buildGame([primary, dentro, fora]);

    cast('ice', primary.root);

    expect(primary.hits).toHaveLength(1);
    expect(dentro.hits).toHaveLength(1);
    expect(fora.hits).toEqual([]);
    expect(decals).toHaveLength(1);
    expect(decals[0].style).toBe('frozen');
    expect(decals[0].radius).toBe(3);
    // Congelar continua sendo só do alvo que o feitiço acertou (como antes):
    // a explosão entrega dano, não controle.
    expect(controlCalls).toHaveLength(1);
    expect(controlCalls[0].spellId).toBe('ice');
    expect(primary.freezes).toBe(1);
    expect(dentro.freezes).toBe(0);
  });

  it('quem já estava morto não leva dano e não conta na área', () => {
    const primary = fakeEnemy(6, 0);
    const morto = fakeEnemy(6, 1.5);
    const { cast, records } = buildGame([primary, morto]);
    const mortoRecord = records[1];
    Object.defineProperty(mortoRecord.enemy, 'isDead', { get: () => true });

    cast('water', primary.root);

    expect(primary.hits).toHaveLength(1);
    expect(morto.hits).toEqual([]);
  });

  it('raio, laser e lava também atingem vizinhos a até 3 m, sem mexer no chão', () => {
    for (const spellId of ['lightning', 'laser', 'lava'] as const) {
      const primary = fakeEnemy(6, 0);
      const dentro = fakeEnemy(8.9, 0); // 2,9 m: dentro do raio
      const fora = fakeEnemy(9.01, 0);  // 3,01 m: fora do raio
      const { cast, decals } = buildGame([primary, dentro, fora]);

      cast(spellId, primary.root);

      // Direto e respingo: cada corpo vivo recebe exatamente um acerto.
      expect(primary.hits).toHaveLength(1);
      expect(dentro.hits).toHaveLength(1);
      expect(fora.hits).toEqual([]);
      // Mantêm os visuais próprios: sem rachadura nem gelo no piso.
      expect(decals).toEqual([]);
      if (spellId === 'lightning' || spellId === 'laser') {
        // A propagação de dano não amplia o status elemental do alvo principal.
        expect(primary.elementalHits).toBe(1);
        expect(dentro.elementalHits).toBe(0);
      }
    }
  });

  it('o impacto acontece no ponto do alvo, não em volta da Maga', () => {
    const primary = fakeEnemy(9, 0);
    const coladoNaMaga = fakeEnemy(0.5, 0);   // perto da Maga, longe do impacto
    const pertoDoAlvo = fakeEnemy(9, 2.5);    // longe da Maga, dentro do raio
    const { cast, decals } = buildGame([primary, coladoNaMaga, pertoDoAlvo]);

    cast('water', primary.root);

    expect(pertoDoAlvo.hits).toHaveLength(1);
    expect(coladoNaMaga.hits).toEqual([]);
    expect(decals[0].position.x).toBeCloseTo(9, 5);
    expect(decals[0].position.y).toBeCloseTo(0, 5);
  });
});
