import type { AdminWave } from '../admin/AdminCommandGate';

export type WavePhase =
  | 'waiting-for-weapon'
  | 'countdown'
  | 'regular-wave'
  | 'intermission'
  | 'final-countdown'
  | 'final-battle'
  | 'victory';

export type WaveEntityRole = 'regular' | 'mini-boss' | 'boss';

export interface WaveManagerConfig {
  regularWaves: number;
  enemiesPerWave: number;
  batchSize: number;
  batchInterval: number;
  countdown: number;
}

export interface WaveSpawnRequest {
  readonly requestId: number;
  readonly phaseId: number;
  readonly kind: 'regular-batch' | 'mini-boss' | 'final-battle';
  readonly wave: number | null;
  readonly regularCount: number;
  readonly bossCount: number;
  readonly miniBossCount: number;
  readonly hpMultiplier: number;
  readonly damageMultiplier: number;
  readonly speedMultiplier: number;
}

export interface WaveSnapshot {
  phase: WavePhase;
  phaseId: number;
  wave: number;
  spawned: number;
  alive: number;
  total: number;
  countdownSeconds: number;
}

export const REGULAR_WAVE_TOTAL = 6;

type SpawnCounts = Pick<WaveSpawnRequest, 'regularCount' | 'bossCount' | 'miniBossCount'>;

const DEFAULT_CONFIG: WaveManagerConfig = {
  regularWaves: REGULAR_WAVE_TOTAL,
  enemiesPerWave: 25,
  batchSize: 8,
  batchInterval: 4,
  countdown: 5,
};

const REGULAR_WAVE_MULTIPLIERS = [
  { hp: 1, damage: 1, speed: 1 },
  { hp: 1.12, damage: 1.1, speed: 1.03 },
  { hp: 1.32, damage: 1.24, speed: 1.07 },
  { hp: 1.6, damage: 1.4, speed: 1.12 },
  { hp: 1.95, damage: 1.65, speed: 1.2 },
  { hp: 2.4, damage: 2, speed: 1.3 },
] as const;

const FINAL_ALLY_COUNT = 4;
const FINAL_ALLY_RESPAWN_DELAY = 15;

export class WaveManager {
  private readonly config: WaveManagerConfig;
  private currentPhase: WavePhase = 'waiting-for-weapon';
  private currentPhaseId = 0;
  private currentWave = 0;
  private currentSpawned = 0;
  private countdownRemaining = 0;
  private batchDelayRemaining = 0;
  private nextRequestId = 1;
  private pendingRequest: WaveSpawnRequest | undefined;
  private retryCounts: SpawnCounts | undefined;
  private readonly activeEntities = new Map<string, WaveEntityRole>();
  private readonly knownEntityIds = new Set<string>();
  private regularDefeatedInWave = 0;
  private miniBossInterruption: 'none' | 'draining' | 'spawning' | 'active' = 'none';
  private finalAllyRespawnRemaining: number | null = null;

  public constructor(config: Partial<WaveManagerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.validateConfig();
  }

  public weaponSelected(): boolean {
    if (this.currentPhase !== 'waiting-for-weapon') {
      return false;
    }

    this.currentPhase = 'countdown';
    this.currentPhaseId += 1;
    this.currentWave = 1;
    this.countdownRemaining = this.config.countdown;
    return true;
  }

  public update(delta: number): readonly WaveSpawnRequest[] {
    if (this.pendingRequest) {
      return [];
    }

    if (this.retryCounts) {
      return [this.createRequest(this.retryCounts)];
    }

    const elapsed = Math.max(0, delta);
    if (this.currentPhase === 'countdown' || this.currentPhase === 'intermission' || this.currentPhase === 'final-countdown') {
      this.countdownRemaining = Math.max(0, this.countdownRemaining - elapsed);
      if (this.countdownRemaining > 0) {
        return [];
      }

      if (this.currentPhase === 'final-countdown') {
        this.startFinalBattle();
      } else {
        this.startRegularWave();
      }
    } else if (this.currentPhase === 'regular-wave') {
      this.batchDelayRemaining = Math.max(0, this.batchDelayRemaining - elapsed);
    } else if (this.currentPhase === 'final-battle' && this.finalAllyRespawnRemaining !== null) {
      this.finalAllyRespawnRemaining = Math.max(
        0,
        this.finalAllyRespawnRemaining - elapsed
      );
      if (this.finalAllyRespawnRemaining > 0) return [];
      this.finalAllyRespawnRemaining = null;
      if (this.countActiveRole('boss') > 0 && this.countActiveRole('regular') === 0) {
        return [this.createRequest({
          regularCount: FINAL_ALLY_COUNT,
          bossCount: 0,
          miniBossCount: 0,
        })];
      }
    }

    if (this.currentPhase === 'regular-wave' && this.miniBossInterruption === 'draining') {
      if (this.countActiveRole('regular') <= 2 && this.countActiveRole('mini-boss') === 0) {
        this.miniBossInterruption = 'spawning';
        return [this.createRequest({ regularCount: 0, bossCount: 0, miniBossCount: 1 })];
      }
      return [];
    }

    if (
      this.currentPhase === 'regular-wave'
      && (this.miniBossInterruption === 'spawning' || this.miniBossInterruption === 'active')
    ) {
      return [];
    }

    if (this.currentPhase === 'regular-wave' && this.currentSpawned < this.config.enemiesPerWave && this.batchDelayRemaining === 0) {
      const counts = this.nextRegularBatchCounts();
      if (counts.regularCount + counts.miniBossCount > 0) {
        return [this.createRequest(counts)];
      }
    }

    if (this.currentPhase === 'final-battle' && this.currentSpawned === 0 && this.activeEntities.size === 0) {
      return [this.createRequest({
        regularCount: FINAL_ALLY_COUNT,
        bossCount: 1,
        miniBossCount: 0,
      })];
    }

    return [];
  }

  public acknowledgeSpawn(
    requestId: number,
    entities: readonly { id: string; role: WaveEntityRole }[]
  ): boolean {
    const request = this.pendingRequest;
    if (!request || request.requestId !== requestId || !this.isValidAcknowledgement(request, entities)) {
      return false;
    }

    for (const entity of entities) {
      this.activeEntities.set(entity.id, entity.role);
      this.knownEntityIds.add(entity.id);
    }
    this.currentSpawned += this.currentPhase === 'regular-wave'
      ? this.countRole(entities, 'regular')
      : entities.length;
    this.pendingRequest = undefined;

    const missing: SpawnCounts = {
      regularCount: request.regularCount - this.countRole(entities, 'regular'),
      bossCount: request.bossCount - this.countRole(entities, 'boss'),
      miniBossCount: request.miniBossCount - this.countRole(entities, 'mini-boss'),
    };
    if (request.kind === 'mini-boss' && this.countRole(entities, 'mini-boss') > 0) {
      this.miniBossInterruption = 'active';
    }
    if (missing.regularCount + missing.bossCount + missing.miniBossCount > 0) {
      this.retryCounts = missing;
    } else if (request.kind === 'regular-batch') {
      this.batchDelayRemaining = 0;
    }

    this.advanceIfComplete();
    return true;
  }

  public enemyDefeated(entityId: string, phaseId: number): boolean {
    if (phaseId !== this.currentPhaseId) {
      return false;
    }
    const role = this.activeEntities.get(entityId);
    if (!role || !this.activeEntities.delete(entityId)) return false;

    if (this.currentPhase === 'final-battle') {
      if (role === 'boss') {
        this.activeEntities.clear();
        this.finalAllyRespawnRemaining = null;
        this.currentPhase = 'victory';
        this.currentPhaseId += 1;
      } else if (
        role === 'regular'
        && this.countActiveRole('regular') === 0
        && this.countActiveRole('boss') > 0
      ) {
        this.finalAllyRespawnRemaining = FINAL_ALLY_RESPAWN_DELAY;
      }
      return true;
    }

    if (this.currentPhase === 'regular-wave' && role === 'regular') {
      this.regularDefeatedInWave += 1;
      if (
        this.miniBossInterruption === 'none'
        && (this.regularDefeatedInWave === 10 || this.regularDefeatedInWave === 20)
      ) {
        this.miniBossInterruption = 'draining';
      }
    } else if (
      this.currentPhase === 'regular-wave'
      && role === 'mini-boss'
      && this.miniBossInterruption === 'active'
    ) {
      this.miniBossInterruption = 'none';
      this.batchDelayRemaining = 0;
    }

    this.advanceIfComplete();
    return true;
  }

  public reset(): void {
    this.currentPhase = 'waiting-for-weapon';
    this.currentPhaseId += 1;
    this.currentWave = 0;
    this.currentSpawned = 0;
    this.countdownRemaining = 0;
    this.batchDelayRemaining = 0;
    this.pendingRequest = undefined;
    this.retryCounts = undefined;
    this.activeEntities.clear();
    this.knownEntityIds.clear();
    this.regularDefeatedInWave = 0;
    this.miniBossInterruption = 'none';
    this.finalAllyRespawnRemaining = null;
  }

  public adminStartWave(wave: AdminWave): void {
    this.clearPhaseRuntime();
    this.currentPhase = 'regular-wave';
    this.currentWave = wave;
    this.currentPhaseId += 1;
  }

  public adminStartBoss(): void {
    this.clearPhaseRuntime();
    this.currentPhase = 'final-battle';
    this.currentWave = this.config.regularWaves;
    this.currentPhaseId += 1;
  }

  public get snapshot(): WaveSnapshot {
    return {
      phase: this.currentPhase,
      phaseId: this.currentPhaseId,
      wave: this.currentWave,
      spawned: this.currentSpawned,
      alive: this.activeEntities.size,
      total: this.totalForCurrentPhase(),
      countdownSeconds: Math.ceil(this.countdownRemaining),
    };
  }

  private validateConfig(): void {
    const { regularWaves, enemiesPerWave, batchSize, batchInterval, countdown } = this.config;
    if (!Number.isInteger(regularWaves) || regularWaves <= 0 || regularWaves > REGULAR_WAVE_TOTAL
      || !Number.isInteger(enemiesPerWave) || enemiesPerWave !== DEFAULT_CONFIG.enemiesPerWave
      || !Number.isInteger(batchSize) || batchSize <= 0
      || !Number.isFinite(batchInterval) || batchInterval <= 0
      || !Number.isFinite(countdown) || countdown <= 0) {
      throw new Error('WaveManager configuration must use positive compatible values.');
    }
  }

  private clearPhaseRuntime(): void {
    this.currentSpawned = 0;
    this.countdownRemaining = 0;
    this.batchDelayRemaining = 0;
    this.pendingRequest = undefined;
    this.retryCounts = undefined;
    this.activeEntities.clear();
    this.knownEntityIds.clear();
    this.regularDefeatedInWave = 0;
    this.miniBossInterruption = 'none';
    this.finalAllyRespawnRemaining = null;
  }

  private createRequest(counts: SpawnCounts): WaveSpawnRequest {
    const waveMultipliers = this.currentPhase === 'regular-wave'
      ? REGULAR_WAVE_MULTIPLIERS[this.currentWave - 1]
      : undefined;
    const request: WaveSpawnRequest = {
      requestId: this.nextRequestId++,
      phaseId: this.currentPhaseId,
      kind: this.currentPhase === 'final-battle'
        ? 'final-battle'
        : counts.miniBossCount > 0 && counts.regularCount === 0
          ? 'mini-boss'
          : 'regular-batch',
      wave: this.currentPhase === 'regular-wave' ? this.currentWave : null,
      ...counts,
      hpMultiplier: waveMultipliers?.hp ?? 1,
      damageMultiplier: waveMultipliers?.damage ?? 1,
      speedMultiplier: waveMultipliers?.speed ?? 1,
    };
    this.pendingRequest = request;
    this.retryCounts = undefined;
    return Object.freeze({ ...request });
  }

  private nextRegularBatchCounts(): SpawnCounts {
    const remaining = this.config.enemiesPerWave - this.currentSpawned;
    const vacancies = Math.max(0, 8 - this.activeEntities.size);
    const total = this.currentSpawned === 0
      ? Math.min(8, remaining)
      : remaining === 1 && vacancies >= 1
        ? 1
        : vacancies >= 2
          ? Math.min(2, vacancies, remaining)
          : 0;
    return {
      regularCount: total,
      bossCount: 0,
      miniBossCount: 0,
    };
  }

  private isValidAcknowledgement(
    request: WaveSpawnRequest,
    entities: readonly { id: string; role: WaveEntityRole }[]
  ): boolean {
    const ids = new Set<string>();
    for (const entity of entities) {
      if (!this.isWaveEntityRole(entity.role) || !entity.id || ids.has(entity.id) || this.knownEntityIds.has(entity.id)) {
        return false;
      }
      ids.add(entity.id);
    }

    return this.countRole(entities, 'regular') <= request.regularCount
      && this.countRole(entities, 'boss') <= request.bossCount
      && this.countRole(entities, 'mini-boss') <= request.miniBossCount;
  }

  private countRole(entities: readonly { id: string; role: WaveEntityRole }[], role: WaveEntityRole): number {
    return entities.filter((entity) => entity.role === role).length;
  }

  private countActiveRole(role: WaveEntityRole): number {
    let count = 0;
    for (const activeRole of this.activeEntities.values()) {
      if (activeRole === role) count++;
    }
    return count;
  }

  private isWaveEntityRole(role: unknown): role is WaveEntityRole {
    return role === 'regular' || role === 'mini-boss' || role === 'boss';
  }

  private startRegularWave(): void {
    this.currentPhase = 'regular-wave';
    this.currentPhaseId += 1;
    this.currentSpawned = 0;
    this.batchDelayRemaining = 0;
    this.regularDefeatedInWave = 0;
    this.miniBossInterruption = 'none';
  }

  private startFinalBattle(): void {
    this.currentPhase = 'final-battle';
    this.currentPhaseId += 1;
    this.currentSpawned = 0;
    this.finalAllyRespawnRemaining = null;
  }

  private advanceIfComplete(): void {
    if (this.pendingRequest || this.retryCounts) {
      return;
    }

    if (this.currentPhase === 'regular-wave'
      && this.currentSpawned === this.config.enemiesPerWave
      && this.activeEntities.size === 0) {
      this.currentPhaseId += 1;
      this.countdownRemaining = this.config.countdown;
      if (this.currentWave === this.config.regularWaves) {
        this.currentPhase = 'final-countdown';
      } else {
        this.currentPhase = 'intermission';
        this.currentWave += 1;
      }
      return;
    }

  }

  private totalForCurrentPhase(): number {
    if (this.currentPhase === 'waiting-for-weapon') {
      return 0;
    }
    if (this.currentPhase === 'final-countdown' || this.currentPhase === 'final-battle' || this.currentPhase === 'victory') {
      return 5;
    }
    return this.config.enemiesPerWave;
  }
}
