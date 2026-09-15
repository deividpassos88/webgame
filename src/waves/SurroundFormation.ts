export interface SurroundSlot {
  angle: number;
  radius: number;
  ring: number;
}

export function planSurroundFormation(
  enemyCountOrCollisionRadii: number | readonly number[],
  innerRadius: number,
  spacingOrGap: number
): SurroundSlot[] {
  const slots: SurroundSlot[] = [];
  const enemyCount = Array.isArray(enemyCountOrCollisionRadii)
    ? enemyCountOrCollisionRadii.length
    : enemyCountOrCollisionRadii as number;
  const spacing = Array.isArray(enemyCountOrCollisionRadii)
    ? Math.max(0, ...enemyCountOrCollisionRadii) * 2 + spacingOrGap
    : spacingOrGap;
  let remaining = Math.max(0, Math.floor(enemyCount));
  let ring = 0;
  let radius = innerRadius;

  while (remaining > 0) {
    const capacity = Math.max(1, Math.floor((Math.PI * 2 * radius) / spacing));
    const count = Math.min(remaining, capacity);
    if (count > 1) {
      radius = Math.max(radius, spacing / (2 * Math.sin(Math.PI / count)));
    }
    const angleOffset = ring % 2 === 0 ? 0 : Math.PI / count;
    for (let index = 0; index < count; index++) {
      slots.push({
        angle: angleOffset + (index / count) * Math.PI * 2,
        radius,
        ring,
      });
    }
    remaining -= count;
    ring++;
    radius += spacing;
  }

  return slots;
}
