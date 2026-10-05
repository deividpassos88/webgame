import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { createWaterColumnBody, createWaterColumnVeil, WATER_DRAGON_SHAPE } from './WaterDragonGeometry';
import { createWaterSurfaceMaterial, WATER_COLUMN_FLOW_RATE } from './WaterDragonMaterials';
import { sampleWaterDragonStrike, WATER_DRAGON_FALL_SECONDS, WATER_DRAGON_IMPACT_SECONDS } from './WaterDragonMotion';

const FALL = WATER_DRAGON_FALL_SECONDS;

describe('Dragão das Marés: downward impact contract', () => {
  it('descends monotonically from the sky and reaches the floor at contact, never rising from it', () => {
    let previous: number = WATER_DRAGON_SHAPE.columnHeight;
    for (let step = 0; step <= 100; step += 1) {
      const age = step / 100 * FALL;
      const frame = sampleWaterDragonStrike(age);
      expect(frame.columnY).toBeLessThanOrEqual(previous);
      expect(frame.columnY).toBeGreaterThanOrEqual(0);
      expect(frame.landed).toBe(step === 100);
      previous = frame.columnY;
    }
    expect(previous).toBe(0);
    expect(sampleWaterDragonStrike(FALL + 0.5).columnY).toBe(0);
  });

  it('spreads horizontally while vertical splash height only decreases after contact', () => {
    let previous = sampleWaterDragonStrike(FALL);
    for (let step = 1; step <= 85; step += 1) {
      const frame = sampleWaterDragonStrike(FALL + step / 100);
      expect(frame.crownRadius).toBeGreaterThanOrEqual(previous.crownRadius);
      expect(frame.ringRadius).toBeGreaterThanOrEqual(previous.ringRadius);
      expect(frame.crownHeight).toBeLessThanOrEqual(previous.crownHeight);
      expect(frame.crownHeight).toBeGreaterThan(0);
      previous = frame;
    }
    expect(previous.crownHeight).toBeCloseTo(0.14);
    expect(previous.crownRadius).toBeCloseTo(1.2);
  });

  it('keeps the falling column dominant instead of fading it before the expanding splash', () => {
    for (const impactAge of [0, 0.1, 0.3, 0.5, 0.7]) {
      const frame = sampleWaterDragonStrike(FALL + impactAge);
      expect(frame.columnOpacity).toBe(1);
      expect(frame.landed).toBe(true);
      expect(frame.alive).toBe(true);
    }
    expect(sampleWaterDragonStrike(FALL + 0.5).topCut).toBe(1.05);
  });

  it('drains the tail from the top down, then releases both column and splash', () => {
    let previous = sampleWaterDragonStrike(FALL + 0.55);
    for (let step = 1; step <= 30; step += 1) {
      const frame = sampleWaterDragonStrike(FALL + 0.55 + step / 100);
      expect(frame.topCut).toBeLessThanOrEqual(previous.topCut);
      expect(frame.columnOpacity).toBeLessThanOrEqual(previous.columnOpacity);
      previous = frame;
    }
    const end = sampleWaterDragonStrike(FALL + WATER_DRAGON_IMPACT_SECONDS + 0.001);
    expect(end.topCut).toBe(0);
    expect(end.columnOpacity).toBe(0);
    expect(end.splashOpacity).toBe(0);
    expect(end.alive).toBe(false);
  });

  it.each([-1, NaN, Infinity, -Infinity])('sanitizes invalid age %s', (age) => {
    expect(sampleWaterDragonStrike(age)).toEqual(sampleWaterDragonStrike(0));
  });

  it('uses the same floor-to-sky UV convention for the core and every falling veil', () => {
    const geometries = [createWaterColumnBody(24), ...Array.from({ length: 6 }, (_, index) => createWaterColumnVeil(index / 6 * Math.PI * 2))];
    try {
      for (const geometry of geometries) {
        const position = geometry.getAttribute('position');
        const uv = geometry.getAttribute('uv');
        for (let index = 0; index < position.count; index += 1) {
          expect(uv.getY(index)).toBeCloseTo(position.getY(index) / WATER_DRAGON_SHAPE.columnHeight, 5);
        }
      }
    } finally {
      geometries.forEach((geometry) => geometry.dispose());
    }
  });

  it('advects all column layers in the same downward direction, including the foam and veil', () => {
    const materials = [
      createWaterSurfaceMaterial('column'),
      createWaterSurfaceMaterial('column', true),
      createWaterSurfaceMaterial('column', 'glow'),
      createWaterSurfaceMaterial('veil'),
    ];
    try {
      expect(WATER_COLUMN_FLOW_RATE).toBeGreaterThan(0);
      for (const material of materials) {
        expect(material.uniforms.uKind.value).toBe(1);
        expect(material.uniforms.uFlowRate.value).toBe(WATER_COLUMN_FLOW_RATE);
        expect(material.depthWrite).toBe(false);
        expect(material.depthTest).toBe(true);
        expect(material.side).toBe(THREE.DoubleSide);
      }
      // The core is connected; only the thin outer sheets may have torn edges.
      expect(materials[0].uniforms.uColumnFill.value).toBe(1);
      expect(materials[3].uniforms.uColumnFill.value).toBe(0);
    } finally {
      materials.forEach((material) => material.dispose());
    }
  });
});
