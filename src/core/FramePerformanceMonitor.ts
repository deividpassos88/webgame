import type { RuntimeWarriorBudgetReport } from '../characters/RuntimeWarriorBudget';
import type { InputSnapshot } from './InputManager';

export interface FramePerformanceContext {
  livingEnemies: number;
  totalEnemies: number;
  dyingEnemies: number;
  healthPlasmas: number;
  drawCalls: number;
  triangles: number;
  geometries: number;
  textures: number;
  heapUsedMB: number | null;
  tabVisibility: DocumentVisibilityState;
  playerAnimation: string;
  input: InputSnapshot & { movementSource: 'keyboard' | 'click' | 'none' };
  /** Cached at player construction; absent in legacy callers and null on GLB fallback. */
  runtimeWarriorBudget?: RuntimeWarriorBudgetReport | null;
}

export interface FramePerformanceReport {
  kind: 'stall' | 'summary';
  frameMs: number;
  averageFps: number;
  worstFrameMs: number;
  longFrameCount: number;
  context: FramePerformanceContext;
}

const LONG_FRAME_MS = 80;
const STALL_REPORT_INTERVAL_MS = 2000;
const SUMMARY_INTERVAL_MS = 10000;

export class FramePerformanceMonitor {
  private windowStartedAt: number | null = null;
  private lastStallReportedAt = Number.NEGATIVE_INFINITY;
  private frameCount = 0;
  private totalFrameMs = 0;
  private worstFrameMs = 0;
  private longFrameCount = 0;
  /** Valid until the next sample; avoids allocating an empty array every frame. */
  private readonly reports: FramePerformanceReport[] = [];

  public sample(
    frameMs: number,
    nowMs: number,
    context: FramePerformanceContext | (() => FramePerformanceContext)
  ): FramePerformanceReport[] {
    if (this.windowStartedAt === null) this.windowStartedAt = nowMs;

    this.frameCount++;
    this.totalFrameMs += frameMs;
    this.worstFrameMs = Math.max(this.worstFrameMs, frameMs);
    if (frameMs >= LONG_FRAME_MS) this.longFrameCount++;

    this.reports.length = 0;
    const shouldReportStall =
      frameMs >= LONG_FRAME_MS &&
      nowMs - this.lastStallReportedAt >= STALL_REPORT_INTERVAL_MS;
    const shouldReportSummary = nowMs - this.windowStartedAt >= SUMMARY_INTERVAL_MS;

    if (shouldReportStall || shouldReportSummary) {
      const reportContext = typeof context === 'function' ? context() : context;
      if (shouldReportStall) {
        this.lastStallReportedAt = nowMs;
        this.reports.push(this.createReport('stall', frameMs, reportContext));
      }

      if (shouldReportSummary) {
        this.reports.push(this.createReport('summary', frameMs, reportContext));
        this.windowStartedAt = nowMs;
        this.frameCount = 0;
        this.totalFrameMs = 0;
        this.worstFrameMs = 0;
        this.longFrameCount = 0;
      }
    }

    return this.reports;
  }

  private createReport(
    kind: FramePerformanceReport['kind'],
    frameMs: number,
    context: FramePerformanceContext
  ): FramePerformanceReport {
    return {
      kind,
      frameMs: Number(frameMs.toFixed(1)),
      averageFps: Number(
        (this.frameCount * 1000 / Math.max(this.totalFrameMs, 0.001)).toFixed(1)
      ),
      worstFrameMs: Number(this.worstFrameMs.toFixed(1)),
      longFrameCount: this.longFrameCount,
      context,
    };
  }
}
