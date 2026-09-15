/** Every new profile begins with the compact 20-slot backpack. */
export const BACKPACK_INITIAL_CAPACITY = 20;
export const BACKPACK_CAPACITY_INCREMENT = 5;
export const BACKPACK_MAX_CAPACITY = 60;

/** Compatibility alias for callers that still need the initial capacity. */
export const BACKPACK_CAPACITY = BACKPACK_INITIAL_CAPACITY;

export function isBackpackCapacity(value: unknown): value is number {
  return (
    Number.isInteger(value)
    && (value as number) >= BACKPACK_INITIAL_CAPACITY
    && (value as number) <= BACKPACK_MAX_CAPACITY
    && ((value as number) - BACKPACK_INITIAL_CAPACITY) % BACKPACK_CAPACITY_INCREMENT === 0
  );
}

/** Repairs legacy capacity values without creating an invalid persisted profile. */
export function normalizeBackpackCapacity(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return BACKPACK_INITIAL_CAPACITY;
  }
  const clamped = Math.min(BACKPACK_MAX_CAPACITY, Math.max(BACKPACK_INITIAL_CAPACITY, value));
  const steps = Math.round((clamped - BACKPACK_INITIAL_CAPACITY) / BACKPACK_CAPACITY_INCREMENT);
  return BACKPACK_INITIAL_CAPACITY + steps * BACKPACK_CAPACITY_INCREMENT;
}
