import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as THREE from 'three';
import { createCurvedSlashGeometry } from './CurvedSlashGeometry';
import { createWarriorSlashMaterial } from './WarriorSlashMaterial';
import { WarriorSlashVFX, getWarriorAttackSlashStyle } from './WarriorSlashVFX';
import { MiniBossHealVFX } from './MiniBossHealVFX';

describe('WarriorSlashVFX', () => {
  beforeEach(() => {
    vi.spyOn(THREE.TextureLoader.prototype, 'load').mockImplementation(() => new THREE.Texture());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('creates a valid 3D curved ribbon geometry with tapered crescent needle ends', () => {
    const geo = createCurvedSlashGeometry({
      outerRadius: 2.8,
      innerRadius: 1.25,
      angleSpan: Math.PI * 0.95,
      radialSegments: 20,
      widthSegments: 2,
    });

    expect(geo.getAttribute('position')).toBeDefined();
    expect(geo.getAttribute('uv')).toBeDefined();
    expect(geo.getAttribute('normal')).toBeDefined();
    expect(geo.index).toBeDefined();

    const positions = geo.getAttribute('position');
    expect(positions.count).toBeGreaterThan(0);
    for (let i = 0; i < positions.count; i++) {
      expect(Number.isFinite(positions.getX(i))).toBe(true);
      expect(Number.isFinite(positions.getY(i))).toBe(true);
      expect(Number.isFinite(positions.getZ(i))).toBe(true);
    }
  });

  it('creates shader material with required uniforms', () => {
    const mat = createWarriorSlashMaterial();
    expect(mat.uniforms.uProgress).toBeDefined();
    expect(mat.uniforms.uFade).toBeDefined();
    expect(mat.uniforms.uIntensity).toBeDefined();
    expect(mat.uniforms.uEdgeGlowBoost).toBeDefined();
    expect(mat.uniforms.uColorCore.value).toBeInstanceOf(THREE.Color);
  });

  it('maps basic attack and skills to appropriate slash styles', () => {
    expect(getWarriorAttackSlashStyle('triplo_ataque')).toBe('fire');
    expect(getWarriorAttackSlashStyle('pulo_atacando')).toBe('fire');
    expect(getWarriorAttackSlashStyle('ataque_giratorio_2')).toBe('glacial-ice');
    expect(getWarriorAttackSlashStyle('ataque_giratorio')).toBe('runic-gold');
    // Basic attack: exactly the glacial-ice style of skill 2
    expect(getWarriorAttackSlashStyle('ataque_basico')).toBe('glacial-ice');
  });

  it('triggers a slash, dissolves and flashes impact when an enemy is hit', () => {
    const vfx = new WarriorSlashVFX();
    const origin = new THREE.Vector3(0, 0, 0);
    const forward = new THREE.Vector3(0, 0, 1);

    // Initial state: impactFlash.group and healPillar.group
    expect(vfx.group.children.length).toBe(2);

    vfx.triggerSlash('ataque_basico', origin, forward, 0);
    expect(vfx.group.children.length).toBe(3);

    // Report hit on enemy
    const enemyPos = new THREE.Vector3(0, 0, 2);
    vfx.reportEnemyHit(enemyPos);

    vfx.update(0.05);
    expect(vfx.group.children.length).toBe(2); // Slash dissolved immediately on impact!

    vfx.dispose();
  });

  it('triggers the mini-boss healing pillar effect (Image 1) and animates smoothly', () => {
    const healVFX = new MiniBossHealVFX();
    const dummy = new THREE.Object3D();
    dummy.position.set(5, 0, 5);
    expect(healVFX.group.children.length).toBe(0);
    healVFX.triggerHeal(dummy);
    expect(healVFX.group.children.length).toBe(1);
    healVFX.update(0.1);
    expect(healVFX.group.children.length).toBe(1);
    // Fast-forward past duration
    healVFX.update(2.5);
    expect(healVFX.group.children.length).toBe(0);
    healVFX.dispose();
  });
});
