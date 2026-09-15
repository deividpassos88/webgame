import { describe, expect, it } from 'vitest';
import { getChestPulseFrame, getCollapseFrame } from './ChestStyleEffect';

describe('ChestStyleEffect', () => {
  it('matches the chest opening endpoints', () => {
    expect(getChestPulseFrame(0)).toEqual({
      rotationZ: 0,
      scaleXZ: 1,
      scaleY: 1,
      lift: 0,
      lightIntensity: 4,
    });
    expect(getChestPulseFrame(1)).toEqual({
      rotationZ: 0,
      scaleXZ: 1,
      scaleY: 1,
      lift: 0.45,
      lightIntensity: 28,
    });
  });

  it('collapses opacity and scale without negative values', () => {
    expect(getCollapseFrame(0)).toEqual({
      opacity: 1,
      scale: 1,
      complete: false,
    });
    expect(getCollapseFrame(1)).toEqual({
      opacity: 0,
      scale: 0.01,
      complete: true,
    });
    expect(getCollapseFrame(2)).toEqual({
      opacity: 0,
      scale: 0.01,
      complete: true,
    });
  });

  it('clamps collapse inputs below zero to the fully visible frame', () => {
    expect(getCollapseFrame(-1)).toEqual(getCollapseFrame(0));
  });

  it('clamps pulse inputs to its visible endpoints', () => {
    expect(getChestPulseFrame(-1)).toEqual(getChestPulseFrame(0));
    expect(getChestPulseFrame(2)).toEqual(getChestPulseFrame(1));
  });
});
