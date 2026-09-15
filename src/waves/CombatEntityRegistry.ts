import * as THREE from 'three';
import { Enemy } from '../entities/Enemy';
import type { EnemyRangedAttack } from '../entities/Enemy';
import type { WaveEntityRole } from './WaveManager';
import { planSurroundFormation, type SurroundSlot } from './SurroundFormation';
import type { NavigationObstacle } from '../world/NavigationObstacle';

export interface CombatRecord {
  id: string;
  phaseId: number;
  role: WaveEntityRole;
  enemy: Enemy;
  deathReported: boolean;
}

export interface CombatEntityDiagnostics {
  totalEnemies: number;
  livingEnemies: number;
  dyingEnemies: number;
}

export class CombatEntityRegistry {
  private static readonly ENEMY_GAP = 0.12;
  private static readonly SEPARATION_PASSES = 4;
  private static readonly INNER_SURROUND_RADIUS = 1.15;
  private static readonly SURROUND_SPACING = 1;
  private readonly records = new Map<string, CombatRecord>();
  private readonly formationTargets = new Map<string, THREE.Vector3>();
  private formationPlan: SurroundSlot[] = [];
  private formationEnemyCount = -1;
  private formationMaximumRadius = -1;
  private formationAngleOffset = 0;

  public register(record: Omit<CombatRecord, 'deathReported'>): boolean {
    if (this.records.has(record.id)) return false;

    this.records.set(record.id, { ...record, deathReported: false });
    return true;
  }

  public findByRoot(root: THREE.Object3D): CombatRecord | null {
    for (const record of this.records.values()) {
      if (record.enemy.root === root) return record;
    }
    return null;
  }

  public activeRoots(): THREE.Object3D[] {
    return [...this.records.values()]
      .filter(({ enemy }) => !enemy.isDead)
      .map(({ enemy }) => enemy.root);
  }

  public unreportedDeaths(): CombatRecord[] {
    return [...this.records.values()].filter(
      ({ enemy, deathReported }) => enemy.isDead && !deathReported
    );
  }

  public get diagnostics(): CombatEntityDiagnostics {
    let livingEnemies = 0;
    let dyingEnemies = 0;
    for (const { enemy } of this.records.values()) {
      if (enemy.isDead) dyingEnemies++;
      else livingEnemies++;
    }
    return {
      totalEnemies: this.records.size,
      livingEnemies,
      dyingEnemies,
    };
  }

  public reportDeath(
    root: THREE.Object3D
  ): Pick<CombatRecord, 'id' | 'phaseId' | 'role'> | null {
    const record = this.findByRoot(root);
    if (!record || !record.enemy.isDead || record.deathReported) return null;

    record.deathReported = true;
    return {
      id: record.id,
      phaseId: record.phaseId,
      role: record.role,
    };
  }

  public update(
    delta: number,
    playerPosition: THREE.Vector3,
    onDamage: (damage: number, role: WaveEntityRole, distance: number) => void,
    navigationObstacles: readonly NavigationObstacle[] = [],
    onElementalDamage?: (record: CombatRecord, damage: number) => void,
    onRangedAttack?: (record: CombatRecord, attack: EnemyRangedAttack) => void
  ): void {
    const livingRecords = [...this.records.values()]
      .filter(({ enemy }) => !enemy.isDead);
    const maximumRadius = livingRecords.reduce(
      (maximum, record) => Math.max(maximum, record.enemy.collisionRadius),
      0
    );
    if (
      livingRecords.length !== this.formationEnemyCount
      || maximumRadius !== this.formationMaximumRadius
    ) {
      this.formationEnemyCount = livingRecords.length;
      this.formationMaximumRadius = maximumRadius;
      this.formationPlan = planSurroundFormation(
        livingRecords.map((record) => record.enemy.collisionRadius),
        CombatEntityRegistry.INNER_SURROUND_RADIUS,
        CombatEntityRegistry.ENEMY_GAP
      );
      this.formationAngleOffset = livingRecords.length > 0
        ? Math.atan2(
            livingRecords[0].enemy.root.position.z - playerPosition.z,
            livingRecords[0].enemy.root.position.x - playerPosition.x
          )
        : 0;
    }

    livingRecords.forEach((record, index) => {
      const slot = this.formationPlan[index];
      let target = this.formationTargets.get(record.id);
      if (!target) {
        target = new THREE.Vector3();
        this.formationTargets.set(record.id, target);
      }
      const angle = slot.angle + this.formationAngleOffset;
      target.set(
        playerPosition.x + Math.cos(angle) * slot.radius,
        playerPosition.y,
        playerPosition.z + Math.sin(angle) * slot.radius
      );
      record.enemy.update(delta, playerPosition, (damage, distance) => {
        onDamage(damage, record.role, distance);
      }, target, (damage) => onElementalDamage?.(record, damage), (attack) => {
        onRangedAttack?.(record, attack);
      });
    });

    for (const record of this.records.values()) {
      if (record.enemy.isDead) {
        record.enemy.update(delta, playerPosition, () => undefined);
      }
    }

    this.separateLivingEnemies();
    this.separateFromObstacles(navigationObstacles);

    for (const [id, record] of this.records) {
      if (record.enemy.markedForRemoval) {
        record.enemy.dispose();
        this.records.delete(id);
        this.formationTargets.delete(id);
      }
    }
  }

  public clear(): void {
    for (const record of this.records.values()) {
      record.enemy.dispose();
    }
    this.records.clear();
    this.formationTargets.clear();
    this.formationPlan = [];
    this.formationEnemyCount = -1;
    this.formationMaximumRadius = -1;
    this.formationAngleOffset = 0;
  }

  public clearLivingAllies(): void {
    for (const [id, record] of this.records) {
      if (record.role === 'boss' || record.enemy.isDead) continue;
      record.enemy.dispose();
      this.records.delete(id);
      this.formationTargets.delete(id);
    }
    this.formationPlan = [];
    this.formationEnemyCount = -1;
    this.formationMaximumRadius = -1;
    this.formationAngleOffset = 0;
  }

  public get mainBoss(): Enemy | null {
    for (const record of this.records.values()) {
      if (record.role === 'boss' && !record.enemy.isDead) return record.enemy;
    }
    return null;
  }

  private separateLivingEnemies(): void {
    const livingRecords = [...this.records.values()]
      .filter(({ enemy }) => !enemy.isDead);

    for (let pass = 0; pass < CombatEntityRegistry.SEPARATION_PASSES; pass++) {
      for (let firstIndex = 0; firstIndex < livingRecords.length; firstIndex++) {
        for (let secondIndex = firstIndex + 1; secondIndex < livingRecords.length; secondIndex++) {
          const firstRecord = livingRecords[firstIndex];
          const secondRecord = livingRecords[secondIndex];
          const first = firstRecord.enemy;
          const second = secondRecord.enemy;
          let offsetX = second.root.position.x - first.root.position.x;
          let offsetZ = second.root.position.z - first.root.position.z;
          let distanceSquared = offsetX * offsetX + offsetZ * offsetZ;
          const minimumDistance =
            first.collisionRadius +
            second.collisionRadius +
            CombatEntityRegistry.ENEMY_GAP;
          if (distanceSquared >= minimumDistance * minimumDistance) continue;

          const overlapsExactly = distanceSquared < 1e-12;
          const distance = overlapsExactly ? 0 : Math.sqrt(distanceSquared);
          const overlap = minimumDistance - distance;
          const normalX = overlapsExactly ? 1 : offsetX / distance;
          const normalZ = overlapsExactly ? 0 : offsetZ / distance;
          const firstPriority = this.separationPriority(firstRecord.role);
          const secondPriority = this.separationPriority(secondRecord.role);
          if (firstPriority > secondPriority) {
            second.root.position.x += normalX * overlap;
            second.root.position.z += normalZ * overlap;
          } else if (secondPriority > firstPriority) {
            first.root.position.x -= normalX * overlap;
            first.root.position.z -= normalZ * overlap;
          } else {
            const correction = overlap * 0.5;
            first.root.position.x -= normalX * correction;
            first.root.position.z -= normalZ * correction;
            second.root.position.x += normalX * correction;
            second.root.position.z += normalZ * correction;
          }
        }
      }
    }
  }

  private separationPriority(role: WaveEntityRole): number {
    if (role === 'boss') return 2;
    if (role === 'mini-boss') return 1;
    return 0;
  }

  private separateFromObstacles(obstacles: readonly NavigationObstacle[]): void {
    if (obstacles.length === 0) return;
    for (const { enemy } of this.records.values()) {
      if (enemy.isDead) continue;
      for (const obstacle of obstacles) {
        const offsetX = enemy.root.position.x - obstacle.x;
        const offsetZ = enemy.root.position.z - obstacle.z;
        const minimumDistance = enemy.collisionRadius + obstacle.radius;
        const distanceSquared = offsetX * offsetX + offsetZ * offsetZ;
        if (distanceSquared >= minimumDistance * minimumDistance) continue;
        const overlapsExactly = distanceSquared < 1e-12;
        const distance = overlapsExactly ? 0 : Math.sqrt(distanceSquared);
        const normalX = overlapsExactly ? 1 : offsetX / distance;
        const normalZ = overlapsExactly ? 0 : offsetZ / distance;
        enemy.root.position.x = obstacle.x + normalX * minimumDistance;
        enemy.root.position.z = obstacle.z + normalZ * minimumDistance;
      }
    }
  }
}
