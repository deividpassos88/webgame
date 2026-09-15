import { describe, expect, it, vi } from 'vitest';
import { FramePerformanceMonitor, type FramePerformanceContext } from './FramePerformanceMonitor';
import type { RuntimeWarriorBudgetReport } from '../characters/RuntimeWarriorBudget';

const runtimeWarriorBudget: RuntimeWarriorBudgetReport = {
  triangles: 15_250,
  drawCalls: 7,
  materialRoles: 7,
  maxInfluences: 4,
};

const context: FramePerformanceContext = {
  livingEnemies: 25,
  totalEnemies: 27,
  dyingEnemies: 2,
  healthPlasmas: 3,
  drawCalls: 42,
  triangles: 12000,
  geometries: 18,
  textures: 9,
  heapUsedMB: 64,
  tabVisibility: 'visible',
  playerAnimation: 'running',
  input: {
    activeKeys: ['s'],
    movement: { horizontal: 0, vertical: 1, hasIntent: true },
    clickPending: false,
    resetPending: false,
    movementSource: 'keyboard',
  },
  runtimeWarriorBudget,
};

describe('FramePerformanceMonitor', () => {
  it('reports a long frame immediately with the captured game context', () => {
    const monitor = new FramePerformanceMonitor();

    const reports = monitor.sample(120, 0, context);

    expect(reports).toEqual([
      expect.objectContaining({ kind: 'stall', frameMs: 120, context }),
    ]);
  });

  it('throttles repeated long-frame reports', () => {
    const monitor = new FramePerformanceMonitor();

    monitor.sample(120, 0, context);
    expect(monitor.sample(130, 500, context)).toEqual([]);
    expect(monitor.sample(90, 2500, context)).toEqual([
      expect.objectContaining({ kind: 'stall', frameMs: 90 }),
    ]);
  });

  it('emits a ten-second summary with average FPS and worst frame', () => {
    const monitor = new FramePerformanceMonitor();

    monitor.sample(20, 0, context);
    const reports = monitor.sample(40, 10000, context);
    const summary = reports.find((report) => report.kind === 'summary');

    expect(summary).toMatchObject({
      kind: 'summary',
      averageFps: 33.3,
      worstFrameMs: 40,
      longFrameCount: 0,
      context,
    });
  });

  it('carries the cached runtime-warrior budget into the ten-second summary', () => {
    const monitor = new FramePerformanceMonitor();

    monitor.sample(16, 0, context);
    const reports = monitor.sample(16, 10_000, context);
    const summary = reports.find((report) => report.kind === 'summary');

    expect(summary?.context.runtimeWarriorBudget).toEqual(runtimeWarriorBudget);
  });

  it('reuses one report buffer between frame samples', () => {
    const monitor = new FramePerformanceMonitor();

    const first = monitor.sample(16, 0, context);
    const second = monitor.sample(16, 16, context);

    expect(first).toBe(second);
    expect(second).toEqual([]);
  });

  it('only reads diagnostic context when a stall or summary needs a report', () => {
    const monitor = new FramePerformanceMonitor();
    const readContext = vi.fn(() => context);

    monitor.sample(16, 0, readContext);
    monitor.sample(16, 16, readContext);
    expect(readContext).not.toHaveBeenCalled();

    monitor.sample(16, 10_000, readContext);
    expect(readContext).toHaveBeenCalledTimes(1);
  });
});
