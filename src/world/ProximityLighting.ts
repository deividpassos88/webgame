export const TORCH_LIGHT_ENABLE_DISTANCE = 20;
export const TORCH_LIGHT_DISABLE_DISTANCE = 22;

export function shouldTorchLightBeActive(
  distance: number,
  currentlyActive: boolean
): boolean {
  if (!Number.isFinite(distance)) return false;
  return distance <= (
    currentlyActive
      ? TORCH_LIGHT_DISABLE_DISTANCE
      : TORCH_LIGHT_ENABLE_DISTANCE
  );
}

export interface HorizontalPosition {
  x: number;
  z: number;
}

export function selectNearestTorchIndices(
  playerPosition: HorizontalPosition,
  torchPositions: readonly HorizontalPosition[],
  limit: number
): number[] {
  const count = Math.max(0, Math.floor(limit));
  return torchPositions
    .map((position, index) => ({
      index,
      distanceSquared:
        (position.x - playerPosition.x) ** 2 +
        (position.z - playerPosition.z) ** 2,
    }))
    .sort((a, b) => a.distanceSquared - b.distanceSquared || a.index - b.index)
    .slice(0, count)
    .map(({ index }) => index);
}
