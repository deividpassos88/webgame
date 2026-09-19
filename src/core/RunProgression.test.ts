import { describe, expect, it } from 'vitest';
import {
  WaveManager,
  type WaveEntityRole,
  type WaveSnapshot,
  type WaveSpawnRequest,
} from '../waves/WaveManager';
import { RunProgression, type RunProgressionPorts } from './RunProgression';

interface SceneEnemy {
  id: string;
  phaseId: number;
  role: WaveEntityRole;
}

function setup() {
  const scene = {
    enemies: [] as SceneEnemy[],
    snapshots: [] as WaveSnapshot[],
    victoryCount: 0,
    nextId: 1,
  };
  const ports: RunProgressionPorts = {
    spawn(request: WaveSpawnRequest) {
      const spawned: SceneEnemy[] = [
        ...Array.from({ length: request.regularCount }, () => ({
          id: `enemy-${scene.nextId++}`,
          phaseId: request.phaseId,
          role: 'regular' as const,
        })),
        ...Array.from({ length: request.bossCount }, () => ({
          id: `enemy-${scene.nextId++}`,
          phaseId: request.phaseId,
          role: 'boss' as const,
        })),
        ...Array.from({ length: request.miniBossCount }, () => ({
          id: `enemy-${scene.nextId++}`,
          phaseId: request.phaseId,
          role: 'mini-boss' as const,
        })),
      ];
      scene.enemies.push(...spawned);
      return spawned.map(({ id, role }) => ({ id, role }));
    },
    render(snapshot) {
      scene.snapshots.push({ ...snapshot });
    },
    victory() {
      scene.victoryCount += 1;
    },
  };
  return {
    scene,
    progression: new RunProgression(new WaveManager(), ports),
  };
}

describe('RunProgression ADM transitions', () => {
  it('starts an ADM-selected wave through the real spawn port', () => {
    const { scene, progression } = setup();

    progression.adminStartWave(3);
    progression.update(0);

    expect(scene.snapshots[scene.snapshots.length - 1]).toMatchObject({
      phase: 'regular-wave', wave: 3, spawned: 8,
    });
    expect(scene.enemies).toHaveLength(8);
  });

  it('starts the final battle through the real spawn port', () => {
    const { scene, progression } = setup();

    progression.adminStartBoss();
    progression.update(0);

    expect(scene.snapshots[scene.snapshots.length - 1]).toMatchObject({
      phase: 'final-battle', alive: 6,
    });
    expect(scene.enemies.map(({ role }) => role).sort()).toEqual([
      'boss', 'regular', 'regular', 'regular', 'regular', 'regular',
    ]);
  });
});

function defeatCurrentPhase(
  progression: RunProgression,
  enemies: SceneEnemy[]
): void {
  const phaseId = progression.snapshot.phaseId;
  const current = enemies.filter((enemy) => enemy.phaseId === phaseId);
  for (const enemy of current) {
    expect(progression.enemyDefeated(enemy.id, enemy.phaseId)).toBe(true);
  }
  enemies.splice(
    0,
    enemies.length,
    ...enemies.filter((enemy) => enemy.phaseId !== phaseId)
  );
}

function completeCurrentRegularWave(
  progression: RunProgression,
  enemies: SceneEnemy[]
): void {
  let safety = 0;
  while (progression.snapshot.phase === 'regular-wave') {
    expect(safety++).toBeLessThan(100);
    const phaseId = progression.snapshot.phaseId;
    const current = enemies.filter((enemy) => enemy.phaseId === phaseId);
    const activeMiniBoss = current.find((enemy) => enemy.role === 'mini-boss');
    const defeated = activeMiniBoss
      ? [activeMiniBoss]
      : current.slice(0, progression.snapshot.spawned < 25 ? 2 : current.length);
    expect(defeated.length).toBeGreaterThan(0);
    for (const enemy of defeated) {
      expect(progression.enemyDefeated(enemy.id, enemy.phaseId)).toBe(true);
    }
    const defeatedIds = new Set(defeated.map(({ id }) => id));
    enemies.splice(
      0,
      enemies.length,
      ...enemies.filter((enemy) => !defeatedIds.has(enemy.id))
    );
    progression.update(0);
    expect(progression.snapshot.alive).toBeLessThanOrEqual(8);
  }
}

describe('RunProgression', () => {
  it('gates combat, caps regular waves at eight living enemies and reaches one victory', () => {
    const { progression, scene } = setup();

    progression.update(30);
    expect(scene.enemies).toHaveLength(0);
    expect(progression.weaponEquipped()).toBe(true);
    expect(progression.weaponEquipped()).toBe(false);

    for (let wave = 1; wave <= 6; wave += 1) {
      progression.update(5);
      expect(scene.enemies).toHaveLength(8);
      expect(progression.snapshot).toMatchObject({ phase: 'regular-wave', wave });
      completeCurrentRegularWave(progression, scene.enemies);
      expect(scene.enemies).toHaveLength(0);
    }

    progression.update(5);
    expect(scene.enemies.map(({ role }) => role).sort()).toEqual([
      'boss',
      'regular',
      'regular',
      'regular',
      'regular',
      'regular',
    ]);

    defeatCurrentPhase(progression, scene.enemies);
    progression.update(0);
    progression.update(30);

    expect(progression.snapshot.phase).toBe('victory');
    expect(scene.victoryCount).toBe(1);
    expect(scene.snapshots[scene.snapshots.length - 1]?.phase).toBe('victory');
  });

  it('resets an active run to the weapon gate and rejects stale deaths', () => {
    const { progression, scene } = setup();
    progression.weaponEquipped();
    progression.update(5);
    const staleEnemy = scene.enemies[0];

    progression.reset();

    expect(progression.snapshot).toMatchObject({
      phase: 'waiting-for-weapon',
      wave: 0,
      spawned: 0,
      alive: 0,
      total: 0,
      countdownSeconds: 0,
    });
    expect(
      progression.enemyDefeated(staleEnemy.id, staleEnemy.phaseId)
    ).toBe(false);
    progression.update(30);
    expect(scene.victoryCount).toBe(0);
  });
});
