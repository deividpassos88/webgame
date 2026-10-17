import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { PrismaticLaserField } from './PrismaticLaserField';

describe('PrismaticLaserField (Maga skill 4)', () => {
  it('builds a three-dimensional multi-layer beam whose helix evolves in time', () => {
    const field = new PrismaticLaserField();
    const start = new THREE.Vector3(2, 1.4, -2);
    const end = new THREE.Vector3(2, 1.4, 8);
    try {
      field.update(start, end, 0.2, 1, 1);
      expect(field.group.visible).toBe(true);
      expect(field.group.getObjectByName('MagePrismCyanBeam')).toBe(field.body);
      expect(field.group.getObjectByName('MagePrismWhiteCore')).toBe(field.core);
      expect(field.group.getObjectByName('MagePrismSpiralCyan')).toBeDefined();
      expect(field.group.position.distanceTo(new THREE.Vector3(2, 1.4, 3))).toBeLessThan(1e-5);
      expect(field.body.scale.y).toBeCloseTo(10, 4);
      expect(field.outer.material.uniforms.uOpacity.value).toBeGreaterThan(0);
      const strand = field.group.getObjectByName('MagePrismSpiralCyan') as THREE.Mesh;
      const geometry = strand.geometry as THREE.BufferGeometry;
      const positions = geometry.getAttribute('position');
      const before = positions.getX(72);
      field.update(start, end, 0.8, 1, 1);
      expect(positions.getX(72)).not.toBeCloseTo(before, 3);
      expect(positions.count).toBeGreaterThan(250);
      field.reset();
      expect(field.group.visible).toBe(false);
      expect(field.core.material.uniforms.uOpacity.value).toBe(0);
    } finally {
      field.dispose();
    }
  });

  it('handles a near-vertical target with finite 3D strand coordinates', () => {
    const field = new PrismaticLaserField();
    try {
      field.update(new THREE.Vector3(), new THREE.Vector3(0.01, 8, 0.01), 1, 0.65, 0.8);
      const strand = field.group.getObjectByName('MagePrismSpiralBlue') as THREE.Mesh;
      const p = (strand.geometry as THREE.BufferGeometry).getAttribute('position');
      for (let i = 0; i < p.count; i++) {
        expect(Number.isFinite(p.getX(i))).toBe(true);
        expect(Number.isFinite(p.getY(i))).toBe(true);
        expect(Number.isFinite(p.getZ(i))).toBe(true);
      }
    } finally {
      field.dispose();
    }
  });
});
