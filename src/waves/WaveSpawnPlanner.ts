import * as THREE from 'three';

const MINIMUM_HORIZONTAL_DISTANCE = 5;

export function selectBatchSpawnPoints(
  points: readonly THREE.Vector3[],
  playerPosition: THREE.Vector3,
  count: number,
  cursor: number
): THREE.Vector3[] {
  if (!Number.isInteger(count) || count <= 0) {
    return [];
  }

  const uniqueSafePoints = points.filter((point, index, source) => {
    const horizontalDistance = Math.hypot(
      point.x - playerPosition.x,
      point.z - playerPosition.z
    );
    return horizontalDistance >= MINIMUM_HORIZONTAL_DISTANCE
      && source.findIndex((candidate) => candidate.x === point.x && candidate.z === point.z) === index;
  });

  if (uniqueSafePoints.length < count) {
    return [];
  }

  const start = ((Math.trunc(cursor) % uniqueSafePoints.length) + uniqueSafePoints.length)
    % uniqueSafePoints.length;
  return Array.from(
    { length: count },
    (_, index) => uniqueSafePoints[(start + index) % uniqueSafePoints.length].clone()
  );
}
