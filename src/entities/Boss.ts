import * as THREE from 'three';
import { Enemy } from './Enemy';
import type { RegularEnemyVisual } from '../waves/EnemyAssetStore';
import { BossAnimationController } from './BossAnimationController';
import {
  BASE_BOSS_DAMAGE,
  BASE_BOSS_SCALE,
  BASE_BOSS_SPEED,
  finalBossTotalHp,
} from '../waves/WaveDifficultyScaling';

/**
 * Factory do boss final (Dragonic Overlord).
 */
export function createBoss(
  position: THREE.Vector3,
  visual?: RegularEnemyVisual
): Enemy {
  // Dragonic Overlord: 5 barras de vida (base 1400 aumentada em 4x = 7000).
  // Escala aumentada (3.2) para um porte intimidador e imponente.
  // As cores das 5 barras (verde, verde claro, roxo, vermelho escuro e
  // vermelho claro) sao resolvidas em ui/BossHealthView.
  return new Enemy({
    position,
    color: 0x5a0a5a,
    scale: BASE_BOSS_SCALE,
    hp: finalBossTotalHp(),
    damage: BASE_BOSS_DAMAGE,
    detectionRange: 45,
    attackRange: 2.2,
    speed: BASE_BOSS_SPEED,
    temperament: 'neutral',
    isBoss: true,
  }, visual, visual
    ? (model, clips) => new BossAnimationController(model, clips)
    : undefined);
}

