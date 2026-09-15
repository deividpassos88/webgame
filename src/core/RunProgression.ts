import {
  WaveManager,
  type WaveEntityRole,
  type WaveSnapshot,
  type WaveSpawnRequest,
} from '../waves/WaveManager';
import type { AdminWave } from '../admin/AdminCommandGate';

export interface RunProgressionPorts {
  spawn(
    request: WaveSpawnRequest
  ): readonly { id: string; role: WaveEntityRole }[];
  render(snapshot: WaveSnapshot): void;
  victory(): void;
}

export class RunProgression {
  private victoryAnnounced = false;

  public constructor(
    private readonly manager: WaveManager,
    private readonly ports: RunProgressionPorts
  ) {}

  public weaponEquipped(): boolean {
    return this.manager.weaponSelected();
  }

  public update(delta: number): void {
    const requests = this.manager.update(delta);
    for (const request of requests) {
      const spawned = this.ports.spawn(request);
      this.manager.acknowledgeSpawn(request.requestId, spawned);
    }

    const snapshot = this.manager.snapshot;
    this.ports.render(snapshot);
    if (snapshot.phase === 'victory' && !this.victoryAnnounced) {
      this.victoryAnnounced = true;
      this.ports.victory();
    }
  }

  public enemyDefeated(id: string, phaseId: number): boolean {
    return this.manager.enemyDefeated(id, phaseId);
  }

  public reset(): void {
    this.manager.reset();
    this.victoryAnnounced = false;
  }

  public adminStartWave(wave: AdminWave): void {
    this.victoryAnnounced = false;
    this.manager.adminStartWave(wave);
  }

  public adminStartBoss(): void {
    this.victoryAnnounced = false;
    this.manager.adminStartBoss();
  }

  public get snapshot(): WaveSnapshot {
    return this.manager.snapshot;
  }
}
