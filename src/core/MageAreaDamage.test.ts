import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import type { CombatRecord } from '../waves/CombatEntityRegistry';
import { MAGE_SKILL_AREA_RADIUS_METERS } from '../combat/MageSkillImpact';
import { resolveMageSkillAreaTargets } from './MageAreaDamage';

function recordWithRoot(id: string, root: THREE.Object3D, dead = false): CombatRecord {
  return {
    id,
    phaseId: 1,
    role: 'regular',
    deathReported: false,
    enemy: { root, isDead: dead } as CombatRecord['enemy'],
  };
}

function record(id: string, x: number, z: number, dead = false, y = 0): CombatRecord {
  const root = new THREE.Object3D();
  root.position.set(x, y, z);
  return recordWithRoot(id, root, dead);
}

const IMPACT = new THREE.Vector3(0, 0.95, 0);

describe('seleção de alvos para dano em área das skills da Maga', () => {
  it('o raio é 3 metros de verdade (não 3 de diâmetro)', () => {
    expect(MAGE_SKILL_AREA_RADIUS_METERS).toBe(3);
    const records = [
      record('quase', 2.99, 0),
      record('na-borda', 3, 0),
      record('fora', 3.01, 0),
      // (2.12, 2.12) fica a 2.998 m na diagonal: dentro. Se o alcance fosse
      // medido por eixo, ou fosse um diâmetro de 3 m, este corpo ficaria fora.
      record('diagonal', 2.12, 2.12),
    ];
    expect(resolveMageSkillAreaTargets(records, IMPACT).map(({ id }) => id))
      .toEqual(['quase', 'na-borda', 'diagonal']);
  });

  it('a altura do corpo não conta: o raio é horizontal', () => {
    const records = [record('no-chao', 2.5, 0), record('voando', 2.5, 0, false, 6)];
    expect(resolveMageSkillAreaTargets(records, IMPACT).map(({ id }) => id))
      .toEqual(['no-chao', 'voando']);
  });

  it('o alvo do feitiço fica de fora da varredura (ninguém leva duas vezes)', () => {
    const primary = record('alvo', 0, 1);
    const vizinho = record('vizinho', 0, 1.5);
    const records = [primary, vizinho];
    expect(resolveMageSkillAreaTargets(records, IMPACT, primary.enemy.root).map(({ id }) => id))
      .toEqual(['vizinho']);
    // Sem a exclusão o alvo principal apareceria — é o que garante o "sem dano duplicado".
    expect(resolveMageSkillAreaTargets(records, IMPACT).map(({ id }) => id))
      .toEqual(['alvo', 'vizinho']);
  });

  it('monstro morto fica fora e raiz compartilhada conta uma vez', () => {
    const shared = new THREE.Object3D();
    shared.position.set(1, 0, 0);
    const records = [
      record('vivo', 1, 0),
      record('morto', 1.2, 0, true),
      recordWithRoot('primeiro', shared),
      recordWithRoot('duplicado', shared),
    ];
    expect(resolveMageSkillAreaTargets(records, IMPACT).map(({ id }) => id))
      .toEqual(['vivo', 'primeiro']);
  });

  it('a ordem é a do registro (determinística) e o raio é configurável', () => {
    const records = [record('b', 0, 2), record('a', 2, 0), record('c', 0, 6)];
    expect(resolveMageSkillAreaTargets(records, IMPACT).map(({ id }) => id))
      .toEqual(['b', 'a']);
    expect(resolveMageSkillAreaTargets(records, IMPACT, null, 7).map(({ id }) => id))
      .toEqual(['b', 'a', 'c']);
    expect(resolveMageSkillAreaTargets(records, IMPACT, null, 0)).toEqual([]);
  });
});
