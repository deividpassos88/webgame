import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { Level } from '../world/Level';
import { selectBatchSpawnPoints } from './WaveSpawnPlanner';

describe('selectBatchSpawnPoints', () => {
  it('returns distinct cloned safe points in cursor-rotated order', () => {
    const player = new THREE.Vector3(0, 12, 0);
    const points = [
      new THREE.Vector3(2, 0, 0),
      new THREE.Vector3(6, 0, 0),
      new THREE.Vector3(-6, 0, 0),
      new THREE.Vector3(0, 0, 6),
      new THREE.Vector3(0, 0, -6),
      new THREE.Vector3(8, 0, 8),
    ];

    const selected = selectBatchSpawnPoints(points, player, 3, 1);

    expect(selected.map((point) => point.toArray())).toEqual([
      [-6, 0, 0],
      [0, 0, 6],
      [0, 0, -6],
    ]);
    expect(new Set(selected.map((point) => `${point.x}:${point.z}`)).size).toBe(3);
    expect(selected.every((point) => Math.hypot(point.x - player.x, point.z - player.z) >= 5)).toBe(true);
    expect(selected[0]).not.toBe(points[2]);
  });

  it('returns no batch when fewer than the requested safe distinct points exist', () => {
    const player = new THREE.Vector3(0, 0, 0);
    const points = [
      new THREE.Vector3(2, 0, 0),
      new THREE.Vector3(6, 0, 0),
      new THREE.Vector3(6, 3, 0),
      new THREE.Vector3(0, 0, 2),
    ];

    expect(selectBatchSpawnPoints(points, player, 2, 0)).toEqual([]);
  });
});

describe('Level wave layouts', () => {
  // Level usa document.createElement('canvas') para a textura do chão;
  // stub mínimo para rodar em ambiente Node.
  const ctxStub = {
    fillRect: () => {},
    beginPath: () => {},
    arc: () => {},
    fill: () => {},
    moveTo: () => {},
    lineTo: () => {},
    stroke: () => {},
    set fillStyle(_: unknown) {},
    set strokeStyle(_: unknown) {},
    set lineWidth(_: unknown) {},
  };
  (globalThis as Record<string, unknown>).document = {
    createElement: () => ({
      width: 0,
      height: 0,
      getContext: () => ctxStub,
    }),
  };

  it('provides the eight perimeter wave points as fresh vectors', () => {
    const level = new Level();

    const points = level.getWaveSpawnPoints();

    // 4 cantos + 4 meios de borda, todos no perímetro de size=50 (~23.5 nos eixos, ~32 nos cantos)
    expect(points).toHaveLength(8);
    for (const point of points) {
      expect(Math.hypot(point.x, point.z)).toBeGreaterThan(20);
      expect(Math.hypot(point.x, point.z)).toBeLessThan(35);
    }
    // vetores frescos: mutar um não afeta os próximos retornos
    points[0].set(99, 99, 99);
    const again = level.getWaveSpawnPoints();
    expect(again[0].x).not.toBe(99);
  });

  it('provides the boss point with four distinct surrounding mini-boss positions', () => {
    const level = new Level();

    const layout = level.getFinalBattleSpawnLayout();
    expect(layout.boss.z).toBe(-18);
    const positions = layout.miniBosses.map((m) => `${m.x}:${m.z}`);
    expect(new Set(positions).size).toBe(4);
    // mini-bosses cercam o boss
    for (const mini of layout.miniBosses) {
      expect(mini.distanceTo(layout.boss)).toBeLessThan(8);
    }
  });

  it('provides 10 distinct minion spawn points for final battle archers and guardians', () => {
    const level = new Level();
    const points = level.getFinalBattleMinionSpawnPoints(10);

    expect(points).toHaveLength(10);
    const stringSet = new Set(points.map((p) => `${p.x}:${p.z}`));
    expect(stringSet.size).toBe(10);
  });
});
