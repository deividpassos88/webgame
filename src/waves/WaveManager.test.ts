import { describe, expect, it } from 'vitest';
import { WaveManager, type WaveSpawnRequest } from './WaveManager';

function acknowledgeRequest(
  manager: WaveManager,
  request: WaveSpawnRequest,
  prefix: string
): string[] {
  const entities = [
    ...Array.from({ length: request.regularCount }, (_, index) => ({
      id: `${prefix}-regular-${index}`,
      role: 'regular' as const,
    })),
    ...Array.from({ length: request.bossCount }, (_, index) => ({
      id: `${prefix}-boss-${index}`,
      role: 'boss' as const,
    })),
    ...Array.from({ length: request.miniBossCount }, (_, index) => ({
      id: `${prefix}-mini-${index}`,
      role: 'mini-boss' as const,
    })),
  ];

  expect(manager.acknowledgeSpawn(request.requestId, entities)).toBe(true);
  return entities.map(({ id }) => id);
}

function completeRegularWave(
  manager: WaveManager,
  prefix: string,
  firstRequest: WaveSpawnRequest
): { roles: string[]; requests: WaveSpawnRequest[] } {
  const active: Array<{ id: string; role: 'regular' | 'mini-boss' }> = [];
  const roles: string[] = [];
  const requests: WaveSpawnRequest[] = [];
  let request: WaveSpawnRequest | undefined = firstRequest;
  let sequence = 0;

  let safety = 0;
  while (manager.snapshot.phase === 'regular-wave' && safety++ < 200) {
    if (request) {
      requests.push(request);
      const requestRoles = [
        ...Array(request.regularCount).fill('regular' as const),
        ...Array(request.miniBossCount).fill('mini-boss' as const),
      ];
      roles.push(...requestRoles);
      const ids = acknowledgeRequest(manager, request, `${prefix}-${sequence++}`);
      ids.forEach((id, index) => active.push({ id, role: requestRoles[index] }));
      request = undefined;
      expect(manager.snapshot.alive).toBeLessThanOrEqual(8);
      continue;
    }
    const miniBossIndex = active.findIndex(({ role }) => role === 'mini-boss');
    const defeatedIndex = miniBossIndex >= 0 ? miniBossIndex : 0;
    const [defeated] = active.splice(defeatedIndex, 1);
    expect(defeated).toBeDefined();
    expect(manager.enemyDefeated(defeated.id, manager.snapshot.phaseId)).toBe(true);
    [request] = manager.update(0);
  }
  expect(safety).toBeLessThan(200);
  return { roles, requests };
}

describe('WaveManager ADM transitions', () => {
  it('starts a chosen regular wave with its configured multipliers', () => {
    const manager = new WaveManager();
    manager.adminStartWave(4);

    expect(manager.snapshot).toMatchObject({ phase: 'regular-wave', wave: 4, spawned: 0, alive: 0 });
    expect(manager.update(0)[0]).toMatchObject({
      wave: 4, hpMultiplier: 1.6, damageMultiplier: 1.4, speedMultiplier: 1.12,
    });
  });

  it('starts the final battle immediately', () => {
    const manager = new WaveManager();
    manager.adminStartBoss();

    expect(manager.snapshot).toMatchObject({ phase: 'final-battle', wave: 6, spawned: 0, alive: 0 });
    expect(manager.update(0)[0]).toMatchObject({
      kind: 'final-battle', regularCount: 4, bossCount: 1, miniBossCount: 0,
    });
  });

  it('invalidates an earlier pending spawn when changing phase', () => {
    const manager = new WaveManager();
    manager.weaponSelected();
    const previous = manager.update(5)[0];
    manager.adminStartWave(2);

    expect(manager.acknowledgeSpawn(previous.requestId, [])).toBe(false);
    expect(manager.update(0)[0].wave).toBe(2);
  });
});

describe('WaveManager regular progression', () => {
  it('emits nothing before weapon selection', () => {
    const manager = new WaveManager();

    expect(manager.update(30)).toEqual([]);
    expect(manager.snapshot.phase).toBe('waiting-for-weapon');
  });

  it('starts wave one after five seconds and fills all eight visible slots', () => {
    const manager = new WaveManager();

    expect(manager.weaponSelected()).toBe(true);
    expect(manager.weaponSelected()).toBe(false);
    expect(manager.update(4.9)).toEqual([]);
    const [request] = manager.update(0.1);
    expect(request).toMatchObject({
      kind: 'regular-batch', wave: 1, regularCount: 8,
      bossCount: 0, miniBossCount: 0,
      hpMultiplier: 1, damageMultiplier: 1, speedMultiplier: 1,
    });
  });

  it('waits for two deaths before immediately replacing two enemies', () => {
    const manager = new WaveManager();
    manager.weaponSelected();
    const [first] = manager.update(5);
    const ids = acknowledgeRequest(manager, first, 'initial');
    const phaseId = manager.snapshot.phaseId;

    expect(manager.snapshot.alive).toBe(8);
    expect(manager.enemyDefeated(ids[0], phaseId)).toBe(true);
    expect(manager.update(100)).toEqual([]);
    expect(manager.enemyDefeated(ids[1], phaseId)).toBe(true);

    const [replacement] = manager.update(0);
    expect(replacement.regularCount + replacement.miniBossCount).toBe(2);
    expect(replacement).toMatchObject({ regularCount: 2, miniBossCount: 0 });
    acknowledgeRequest(manager, replacement, 'replacement');
    expect(manager.snapshot.alive).toBe(8);
  });

  it('adds one mini-boss after the tenth and twentieth regular kills without counting them among 25 normals', () => {
    const manager = new WaveManager();
    manager.weaponSelected();
    const result = completeRegularWave(manager, 'wave', manager.update(5)[0]);

    expect(result.roles).toHaveLength(27);
    expect(result.roles.filter((role) => role === 'regular')).toHaveLength(25);
    expect(result.roles.filter((role) => role === 'mini-boss')).toHaveLength(2);
  });

  it('pauses normal spawns at ten kills, waits for at most two survivors, then resumes only after the mini-boss dies', () => {
    const manager = new WaveManager();
    manager.weaponSelected();
    const [initial] = manager.update(5);
    let active = acknowledgeRequest(manager, initial, 'initial');
    const phaseId = manager.snapshot.phaseId;
    let sequence = 0;

    for (let killed = 1; killed <= 10; killed++) {
      expect(manager.enemyDefeated(active.shift()!, phaseId)).toBe(true);
      const [replacement] = manager.update(0);
      if (killed < 10 && killed % 2 === 0) {
        expect(replacement).toMatchObject({ regularCount: 2, miniBossCount: 0 });
        active.push(...acknowledgeRequest(manager, replacement, `before-${sequence++}`));
      } else {
        expect(replacement).toBeUndefined();
      }
    }

    while (active.length > 3) {
      expect(manager.enemyDefeated(active.shift()!, phaseId)).toBe(true);
      expect(manager.update(0)).toEqual([]);
    }
    expect(manager.enemyDefeated(active.shift()!, phaseId)).toBe(true);
    const [miniRequest] = manager.update(0);
    expect(miniRequest).toMatchObject({
      kind: 'mini-boss', regularCount: 0, miniBossCount: 1,
    });
    const [miniId] = acknowledgeRequest(manager, miniRequest, 'milestone-mini');
    expect(manager.snapshot.alive).toBe(3);
    expect(manager.update(100)).toEqual([]);

    expect(manager.enemyDefeated(miniId, phaseId)).toBe(true);
    const [resumed] = manager.update(0);
    expect(resumed).toMatchObject({ kind: 'regular-batch', regularCount: 2, miniBossCount: 0 });
  });

  it('retries missing members without exceeding the eight-enemy capacity', () => {
    const manager = new WaveManager();
    manager.weaponSelected();
    const [first] = manager.update(5);
    expect(first).toBeDefined();
    manager.acknowledgeSpawn(first.requestId, [
      { id: 'w1-a', role: 'regular' },
      { id: 'w1-b', role: 'regular' },
    ]);
    const [retry] = manager.update(0);
    expect(retry.regularCount).toBe(6);
    acknowledgeRequest(manager, retry, 'retry');
    expect(manager.snapshot).toMatchObject({ spawned: 8, alive: 8, total: 25 });
    expect(manager.update(20)).toEqual([]);
  });

  it('progresses through six increasingly difficult waves before one final battle', () => {
    const manager = new WaveManager();
    const hpMultipliers: number[] = [];
    const damageMultipliers: number[] = [];
    const speedMultipliers: number[] = [];

    manager.weaponSelected();
    for (let wave = 1; wave <= 6; wave++) {
      const [firstRequest] = manager.update(5);
      expect(firstRequest).toMatchObject({ kind: 'regular-batch', wave });
      const result = completeRegularWave(manager, `wave-${wave}`, firstRequest);
      expect(result.requests.every((request) => request.hpMultiplier === firstRequest.hpMultiplier)).toBe(true);
      hpMultipliers.push(firstRequest.hpMultiplier);
      damageMultipliers.push(firstRequest.damageMultiplier);
      speedMultipliers.push(firstRequest.speedMultiplier);
      expect(manager.snapshot.phase).toBe(wave === 6 ? 'final-countdown' : 'intermission');
    }

    expect(hpMultipliers).toEqual([1, 1.12, 1.32, 1.6, 1.95, 2.4]);
    expect(damageMultipliers).toEqual([1, 1.1, 1.24, 1.4, 1.65, 2]);
    expect(speedMultipliers).toEqual([1, 1.03, 1.07, 1.12, 1.2, 1.3]);
    const [finalRequest] = manager.update(5);
    expect(finalRequest).toMatchObject({
      kind: 'final-battle', wave: null, regularCount: 4,
      bossCount: 1, miniBossCount: 0,
    });

    const finalIds = acknowledgeRequest(manager, finalRequest, 'final');
    const phaseId = manager.snapshot.phaseId;
    finalIds.slice(0, 4).forEach((id) => expect(manager.enemyDefeated(id, phaseId)).toBe(true));
    expect(manager.snapshot.phase).toBe('final-battle');
    expect(manager.enemyDefeated(finalIds[4], phaseId)).toBe(true);
    expect(manager.snapshot).toMatchObject({ phase: 'victory', spawned: 5, alive: 0, total: 5 });
    expect(manager.update(10)).toEqual([]);
  });

  it('respawns four normal allies fifteen seconds after all four die while the boss lives', () => {
    const manager = new WaveManager();
    manager.adminStartBoss();
    const [initial] = manager.update(0);
    const ids = acknowledgeRequest(manager, initial, 'final');
    const phaseId = manager.snapshot.phaseId;

    ids.slice(0, 4).forEach((id) => {
      expect(manager.enemyDefeated(id, phaseId)).toBe(true);
    });
    expect(manager.update(14.9)).toEqual([]);
    const [reinforcements] = manager.update(0.1);
    expect(reinforcements).toMatchObject({
      kind: 'final-battle', regularCount: 4, bossCount: 0, miniBossCount: 0,
    });
    acknowledgeRequest(manager, reinforcements, 'reinforcements');
    expect(manager.snapshot.alive).toBe(5);

    expect(manager.enemyDefeated(ids[4], phaseId)).toBe(true);
    expect(manager.snapshot).toMatchObject({ phase: 'victory', alive: 0 });
    expect(manager.update(30)).toEqual([]);
  });

  it('preserves missing final-battle roles across retry requests', () => {
    const manager = new WaveManager({ regularWaves: 1 });
    manager.weaponSelected();

    completeRegularWave(manager, 'regular', manager.update(5)[0]);

    const [finalRequest] = manager.update(5);
    expect(manager.acknowledgeSpawn(finalRequest.requestId, [
      { id: 'boss', role: 'boss' },
      { id: 'regular-1', role: 'regular' },
      { id: 'regular-2', role: 'regular' },
    ])).toBe(true);

    const [retry] = manager.update(0);
    expect(retry).toMatchObject({ bossCount: 0, miniBossCount: 0, regularCount: 2 });
  });

  it('rejects malformed acknowledgements and duplicate or stale deaths without changing counts', () => {
    const manager = new WaveManager();
    manager.weaponSelected();
    const [request] = manager.update(5);

    expect(manager.acknowledgeSpawn(999, [])).toBe(false);
    expect(manager.acknowledgeSpawn(request.requestId, [
      { id: 'duplicate', role: 'regular' },
      { id: 'duplicate', role: 'regular' },
    ])).toBe(false);
    expect(manager.acknowledgeSpawn(request.requestId, [{ id: 'wrong-role', role: 'boss' }])).toBe(false);
    expect(manager.snapshot).toMatchObject({ spawned: 0, alive: 0 });

    expect(manager.acknowledgeSpawn(request.requestId, [{ id: 'regular', role: 'regular' }])).toBe(true);
    expect(manager.acknowledgeSpawn(request.requestId, [{ id: 'second-regular', role: 'regular' }])).toBe(false);
    const [retry] = manager.update(0);
    expect(manager.acknowledgeSpawn(retry.requestId, [{ id: 'regular', role: 'regular' }])).toBe(false);
    expect(manager.acknowledgeSpawn(retry.requestId, [{ id: 'second-regular', role: 'regular' }])).toBe(true);
    const phaseId = manager.snapshot.phaseId;
    expect(manager.enemyDefeated('regular', phaseId)).toBe(true);
    expect(manager.enemyDefeated('regular', phaseId)).toBe(false);
    expect(manager.enemyDefeated('missing', phaseId)).toBe(false);
    expect(manager.enemyDefeated('regular', phaseId + 1)).toBe(false);
  });

  it('rejects unknown runtime roles atomically while retaining the pending request', () => {
    const manager = new WaveManager();
    manager.weaponSelected();
    const [request] = manager.update(5);
    const before = manager.snapshot;

    expect(manager.acknowledgeSpawn(request.requestId, [
      { id: 'alien', role: 'dragon' as unknown as 'regular' },
    ])).toBe(false);
    expect(manager.snapshot).toEqual(before);
    expect(manager.update(0)).toEqual([]);
    expect(manager.acknowledgeSpawn(request.requestId, [
      { id: 'regular', role: 'regular' },
    ])).toBe(true);
  });

  it('keeps an emitted request immutable and preserves the next-batch cadence', () => {
    const manager = new WaveManager();
    manager.weaponSelected();
    const [request] = manager.update(5);
    const mutableRequest = request as unknown as {
      requestId: number;
      kind: 'regular-batch' | 'final-battle';
      regularCount: number;
    };

    expect(Object.isFrozen(request)).toBe(true);
    expect(() => {
      mutableRequest.requestId = 999;
      mutableRequest.kind = 'final-battle';
      mutableRequest.regularCount = 99;
    }).toThrow(TypeError);
    expect(manager.acknowledgeSpawn(request.requestId, [
      { id: 'first-a', role: 'regular' },
      { id: 'first-b', role: 'regular' },
      { id: 'first-c', role: 'regular' },
      { id: 'first-d', role: 'regular' },
      { id: 'first-e', role: 'regular' },
    ])).toBe(true);
    expect(manager.update(0)).toMatchObject([{
      requestId: request.requestId + 1,
      kind: 'regular-batch',
      regularCount: 3,
      miniBossCount: 0,
    }]);
  });

  it('clamps negative delta, validates configuration, and invalidates old reports after reset', () => {
    expect(() => new WaveManager({ batchSize: 0 })).toThrow();
    expect(() => new WaveManager({ enemiesPerWave: 14, batchSize: 3 })).toThrow();
    expect(() => new WaveManager({ enemiesPerWave: 6, batchSize: 3 })).toThrow();
    expect(() => new WaveManager({ regularWaves: 0 })).toThrow();

    const manager = new WaveManager();
    manager.weaponSelected();
    expect(manager.update(-10)).toEqual([]);
    const [request] = manager.update(5);
    const [id] = acknowledgeRequest(manager, request, 'reset');
    const oldPhaseId = manager.snapshot.phaseId;

    manager.reset();
    manager.reset();
    expect(manager.snapshot).toEqual({
      phase: 'waiting-for-weapon', phaseId: oldPhaseId + 2, wave: 0,
      spawned: 0, alive: 0, total: 0, countdownSeconds: 0,
    });
    expect(manager.enemyDefeated(id, oldPhaseId)).toBe(false);
  });
});
