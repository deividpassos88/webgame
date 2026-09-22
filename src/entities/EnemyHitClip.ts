const HIT_CLIP_PATTERN = /(?:^|[^a-z0-9])(hit|hurt|flinch|stagger|impacto|recebendo|gethit|hitreact|dano)(?:[^a-z0-9]|$)/i;

/** True when a clip name is an authored hit reaction, not an attack or death. */
export function isEnemyHitClipName(name: string): boolean {
  const normalized = name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  return HIT_CLIP_PATTERN.test(normalized);
}
