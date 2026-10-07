import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { GroundImpactDecalVFX } from './GroundImpactDecalVFX';
import { VFXLightPool } from './VFXLightPool';

function build(quality: 'low' | 'high' = 'high') {
  const scene = new THREE.Scene();
  const lightPool = new VFXLightPool(scene, 4);
  const decals = new GroundImpactDecalVFX(scene, new THREE.Texture(), lightPool, quality);
  return { scene, lightPool, decals };
}

function findSheet(scene: THREE.Scene): THREE.Mesh {
  const group = scene.getObjectByName('MageGroundImpactDecal');
  expect(group).toBeDefined();
  const sheet = group?.getObjectByName('MageGroundImpactDecalSheet');
  expect(sheet).toBeInstanceOf(THREE.Mesh);
  return sheet as THREE.Mesh;
}

function particleCount(scene: THREE.Scene): number {
  const dust = scene.getObjectByName('MageGroundImpactDust') as THREE.Points | undefined;
  expect(dust).toBeDefined();
  return (dust as THREE.Points).geometry.drawRange.count;
}

const POINT = new THREE.Vector3(4, 0, -2);

describe('impacto de chão das skills 1 e 2 da Maga (VFX)', () => {
  it('o desenho fica deitado no chão, centrado no impacto e cobrindo o raio', () => {
    const { scene, decals } = build();
    decals.play({ position: POINT, radius: 3, style: 'cracked' });
    decals.update(0.2);

    const sheet = findSheet(scene);
    const position = sheet.geometry.getAttribute('position') as THREE.BufferAttribute;
    for (let vertex = 0; vertex < position.count; vertex += 1) {
      // Plano deitado: todos os vértices no mesmo y (o chão do decalque).
      expect(position.getY(vertex)).toBeCloseTo(0, 5);
    }
    const group = sheet.parent as THREE.Group;
    expect(group.position.x).toBeCloseTo(POINT.x, 5);
    expect(group.position.z).toBeCloseTo(POINT.z, 5);
    // Colado no piso, sem afundar (z-fighting fica por conta do polygon offset).
    expect(group.position.y).toBeGreaterThan(0);
    expect(group.position.y).toBeLessThan(0.1);
    // O desenho abre a partir do impacto e termina no raio do dano (2 × 3 m).
    expect(sheet.scale.x).toBeLessThan(6);
    decals.update(0.4);
    expect(sheet.scale.x).toBeCloseTo(6, 1);
    expect(sheet.scale.y).toBeCloseTo(6, 1);
    expect(sheet.material).toBeInstanceOf(THREE.MeshBasicMaterial);
    const material = sheet.material as THREE.MeshBasicMaterial;
    expect(material.map?.name).toBe('MageGroundDecalCracked');
    expect(material.depthWrite).toBe(false);
    expect(material.transparent).toBe(true);
  });

  it('a água racha o chão e o gelo deixa a poça congelada (texturas diferentes)', () => {
    const { scene, decals } = build();
    decals.play({ position: POINT, radius: 3, style: 'cracked' });
    decals.update(0.2);
    const crackedTexture = (findSheet(scene).material as THREE.MeshBasicMaterial).map;

    decals.play({ position: POINT, radius: 3, style: 'frozen' });
    decals.update(0.2);
    const sheets = scene.getObjectsByProperty('name', 'MageGroundImpactDecalSheet') as THREE.Mesh[];
    const frozenTexture = (sheets[1].material as THREE.MeshBasicMaterial).map;

    expect(crackedTexture?.name).toBe('MageGroundDecalCracked');
    expect(frozenTexture?.name).toBe('MageGroundDecalFrozen');
    expect(frozenTexture).not.toBe(crackedTexture);
    expect(decals.activeCount).toBe(2);
  });

  it('aparece no impacto, segura e desaparece sozinho (efeito temporário)', () => {
    const { scene, decals } = build();
    decals.play({ position: POINT, radius: 3, style: 'frozen' });
    const sheet = findSheet(scene);
    const material = sheet.material as THREE.MeshBasicMaterial;

    // Quadro do impacto: ainda não desenha (o intro é rápido).
    decals.update(0);
    expect(material.opacity).toBeLessThan(0.05);

    decals.update(0.12);
    const early = material.opacity;
    expect(early).toBeGreaterThan(0.6);

    decals.update(0.6);
    expect(material.opacity).toBeGreaterThan(0.3);

    // Passado o tempo total, o decalque sai da cena e volta para o pool.
    decals.update(2);
    expect(decals.activeCount).toBe(0);
    expect(scene.getObjectByName('MageGroundImpactDecal')).toBeUndefined();
    expect(material.opacity).toBe(0);
    expect(decals.pooledCount).toBe(1);

    // O mesmo objeto do pool pode tocar de novo (o grupo volta para a cena).
    decals.play({ position: POINT, radius: 3, style: 'cracked' });
    decals.update(0.2);
    expect(decals.activeCount).toBe(1);
    expect(scene.getObjectByName('MageGroundImpactDecal')).toBeDefined();
  });

  it('a qualidade gráfica corta as partículas do impacto', () => {
    const low = build('low');
    low.decals.play({ position: POINT, radius: 3, style: 'cracked' });
    low.decals.update(0.05);
    const high = build('high');
    high.decals.play({ position: POINT, radius: 3, style: 'cracked' });
    high.decals.update(0.05);
    expect(particleCount(low.scene)).toBeLessThan(particleCount(high.scene));
    expect(particleCount(low.scene)).toBeGreaterThan(0);
  });

  it('o pool respeita o limite e o clear/dispose limpam a cena', () => {
    const { scene, lightPool, decals } = build();
    for (let index = 0; index < 10; index += 1) {
      decals.play({ position: new THREE.Vector3(index, 0, 0), radius: 3, style: 'cracked' });
    }
    expect(decals.activeCount).toBeLessThanOrEqual(6);
    decals.clear();
    expect(decals.activeCount).toBe(0);
    expect(scene.getObjectByName('MageGroundImpactDecal')).toBeUndefined();
    decals.dispose();
    expect(() => lightPool.dispose()).not.toThrow();
  });
});
