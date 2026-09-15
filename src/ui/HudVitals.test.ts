import { describe, expect, it } from 'vitest';
import { formatResourcePercent, resourcePercent } from './HudVitals';

describe('formatResourcePercent', () => {
  it('shows rounded bounded percentages instead of raw resource numbers', () => {
    expect(formatResourcePercent(73.6, 100)).toBe('74%');
    expect(formatResourcePercent(51, 50)).toBe('100%');
    expect(formatResourcePercent(-4, 50)).toBe('0%');
    expect(formatResourcePercent(10, 0)).toBe('0%');
  });
});

describe('resourcePercent', () => {
  it('is suitable for an independent fatigue meter', () => {
    expect(resourcePercent(250, 500)).toBe(50);
    expect(resourcePercent(0, 100)).toBe(0);
  });
});
