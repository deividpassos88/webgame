import { describe, expect, it } from 'vitest';
import {
  selectNearestTorchIndices,
  shouldTorchLightBeActive,
} from './ProximityLighting';

describe('torch proximity lighting', () => {
  it('activates within 20 metres and keeps the light until 22 metres', () => {
    expect(shouldTorchLightBeActive(19.99, false)).toBe(true);
    expect(shouldTorchLightBeActive(20.01, false)).toBe(false);
    expect(shouldTorchLightBeActive(21.99, true)).toBe(true);
    expect(shouldTorchLightBeActive(22.01, true)).toBe(false);
  });

  it('selects a stable nearest-four pool at a four-torch overlap', () => {
    const torches = [
      { x: -24.3, z: -12 }, { x: -24.3, z: 12 },
      { x: 24.3, z: -12 }, { x: 24.3, z: 12 },
      { x: -12, z: -24.3 }, { x: 12, z: -24.3 },
      { x: -12, z: 24.3 }, { x: 12, z: 24.3 },
      { x: -20.3, z: -4 }, { x: 20.3, z: -4 },
    ];

    expect(selectNearestTorchIndices({ x: -23.4, z: -7.9 }, torches, 4))
      .toEqual([0, 8, 1, 4]);
    expect(selectNearestTorchIndices({ x: 0, z: 0 }, torches, 4))
      .toEqual([8, 9, 0, 1]);
  });
});
