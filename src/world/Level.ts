import * as THREE from 'three';
import type { NavigationObstacle } from './NavigationObstacle';
import { CelestialArena } from './CelestialArena';

/**
 * Level's gameplay interface is preserved while the old dungeon visuals are
 * replaced by Campo dos Deuses. Spawn positions stay inside the square and
 * all decorative architecture sits outside the movement limit.
 */
export class Level extends CelestialArena {
  public readonly navigationObstacles: NavigationObstacle[] = [];

  public getBossSpawnPoint(): THREE.Vector3 {
    return new THREE.Vector3(0, 0, -18);
  }

  /** Spawns de inimigos: bordas/cantos do cenário — eles vêm "de fora" para dentro. */
  public getEnemySpawnPoints(): THREE.Vector3[] {
    const half = this.size / 2 - 1.5;
    return [
      // cantos
      new THREE.Vector3(-half + 2, 0, -half + 2),
      new THREE.Vector3(half - 2, 0, -half + 2),
      new THREE.Vector3(-half + 2, 0, half - 2),
      new THREE.Vector3(half - 2, 0, half - 2),
      // meio das bordas
      new THREE.Vector3(0, 0, half - 1.5),
      new THREE.Vector3(0, 0, -half + 1.5),
      new THREE.Vector3(-half + 1.5, 0, 0),
      new THREE.Vector3(half - 1.5, 0, 0),
    ];
  }

  public getWaveSpawnPoints(): THREE.Vector3[] {
    return this.getEnemySpawnPoints();
  }

  public getFinalBattleSpawnLayout(): {
    boss: THREE.Vector3;
    miniBosses: [THREE.Vector3, THREE.Vector3, THREE.Vector3, THREE.Vector3];
  } {
    return {
      boss: this.getBossSpawnPoint(),
      miniBosses: [
        new THREE.Vector3(-5, 0, -15),
        new THREE.Vector3(5, 0, -15),
        new THREE.Vector3(-5, 0, -21),
        new THREE.Vector3(5, 0, -21),
      ],
    };
  }

  /**
   * Posições de spawn dos lacaios/monstros que lutam ao lado do Dragonic Overlord.
   * Suporta até 10 monstros (5 guardiões na linha de frente e 5 arqueiros na retaguarda/flancos).
   */
  public getFinalBattleMinionSpawnPoints(count = 10): THREE.Vector3[] {
    const points: THREE.Vector3[] = [
      // Linha de frente / flanco próximo (guardiões ou monstros normais)
      new THREE.Vector3(-6, 0, -14),
      new THREE.Vector3(-3, 0, -12),
      new THREE.Vector3(0, 0, -11),
      new THREE.Vector3(3, 0, -12),
      new THREE.Vector3(6, 0, -14),
      // Linha de trás / flancos abertos (arqueiros)
      new THREE.Vector3(-9, 0, -18),
      new THREE.Vector3(-5, 0, -8),
      new THREE.Vector3(0, 0, -7),
      new THREE.Vector3(5, 0, -8),
      new THREE.Vector3(9, 0, -18),
    ];
    return points.slice(0, Math.max(0, count));
  }


}
