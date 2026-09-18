import * as THREE from 'three';
import { Enemy } from './Enemy';
import type { RegularEnemyVisual } from '../waves/EnemyAssetStore';
import { BossAnimationController } from './BossAnimationController';
import { finalBossTotalHp } from '../waves/WaveDifficultyScaling';

/**
 * Factory do boss final (placeholder).
 * Quando o .glb do boss estiver pronto, você pode criar uma classe
 * BossModel similar ao Player.ts (com GLTFLoader) e usá-la no lugar
 * deste Enemy configurado. A interface (update/takeDamage/hp) é a mesma.
 */
export function createBoss(
  position: THREE.Vector3,
  visual?: RegularEnemyVisual
): Enemy {
  // Boss final: 5 barras de vida (base 1400 aumentada em 4x = 7000).
  // As cores das 5 barras (verde, verde claro, roxo, vermelho escuro e
  // vermelho claro) sao resolvidas em ui/BossHealthView.
  return new Enemy({
    position,
    color: 0x5a0a5a,
    scale: 2.5,
    hp: finalBossTotalHp(),
    damage: 11,
    detectionRange: 45,
    attackRange: 1.9,
    speed: 0.8,
    temperament: 'neutral',
    isBoss: true,
  }, visual, visual
    ? (model, clips) => new BossAnimationController(model, clips)
    : undefined);
}
