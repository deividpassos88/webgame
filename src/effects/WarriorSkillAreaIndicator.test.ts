import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { WarriorSkillAreaIndicator } from './WarriorSkillAreaIndicator';

describe('WarriorSkillAreaIndicator', () => {
  it('uses the combat-policy dimensions and reuses its geometry', () => {
    const indicator = new WarriorSkillAreaIndicator();
    const geometry = indicator.object.geometry;
    indicator.show('ataque_giratorio', new THREE.Vector3(2, 0, 3), new THREE.Vector3(0, 0, 1));
    expect(indicator.object.visible).toBe(true);
    expect(indicator.object.userData.area).toMatchObject({ shape: 'circle', radius: 10 });
    indicator.show('triplo_ataque', new THREE.Vector3(), new THREE.Vector3(1, 0, 0));
    expect(indicator.object.geometry).toBe(geometry);
    expect(indicator.object.userData.area).toMatchObject({ shape: 'arc', radius: 5, angleDegrees: 140 });
    indicator.dispose();
  });

  it('fades and clears without replacing render resources', () => {
    const indicator = new WarriorSkillAreaIndicator();
    const material = indicator.object.material;
    indicator.show('pulo_atacando', new THREE.Vector3(), new THREE.Vector3(0, 0, 1));
    indicator.update(0.35);
    expect(indicator.object.visible).toBe(true);
    expect((indicator.object.material as THREE.MeshBasicMaterial).opacity).toBeLessThan(0.42);
    indicator.update(1);
    expect(indicator.object.visible).toBe(false);
    expect(indicator.object.material).toBe(material);
    indicator.dispose();
  });
});
