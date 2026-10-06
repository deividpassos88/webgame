import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import {
  GlacialCrystalRingEffect,
  createGlacialCrystalResources,
  GLACIAL_CRYSTALS_TUNING,
} from './GlacialCrystalsVFX';
import { VFXLightPool } from '../VFXLightPool';

/**
 * Giro Glacial — o anel de cristais de gelo:
 * - cristais em círculo ao redor do centro (pé do personagem), bases no chão;
 * - surgimento em sequência acompanhando o giro, fechado no frame de impacto;
 * - permanece formado, estilhaça e termina (devolvendo a luz do pool);
 * - funciona em qualquer orientação do personagem (só o yaw entra no group).
 */
describe('GlacialCrystalRingEffect (cristais do Giro Glacial)', () => {
  const create = () => {
    const scene = new THREE.Scene();
    const resources = createGlacialCrystalResources();
    const lightPool = new VFXLightPool(scene, 2);
    const effect = new GlacialCrystalRingEffect(resources, new THREE.Texture(), lightPool);
    scene.add(effect.group);
    return { scene, resources, lightPool, effect };
  };

  it('forma o círculo de cristais com bases no chão e inclinação para fora', () => {
    const { effect, resources } = create();
    const center = new THREE.Vector3(8, 1.5, -3);
    effect.play({ position: center, forward: new THREE.Vector3(1, 0, 0) });

    expect(effect.group.name).toBe('WarriorGlacialCrystals');
    expect(effect.group.visible).toBe(true);
    // Centro explícito do efeito: a posição do personagem, inclusive em Y
    // (altura do terreno) — nada flutuando nem enterrado.
    expect(effect.group.position.distanceTo(center)).toBeLessThan(1e-6);
    // Orientação: só o yaw da frente planar.
    expect(effect.group.rotation.x).toBe(0);
    expect(effect.group.rotation.z).toBe(0);
    expect(effect.group.rotation.y).toBeCloseTo(Math.PI / 2);

    const big = effect.group.getObjectByName('GlacialBigShards') as THREE.InstancedMesh;
    const small = effect.group.getObjectByName('GlacialSmallShards') as THREE.InstancedMesh;
    expect(big.count).toBeGreaterThanOrEqual(GLACIAL_CRYSTALS_TUNING.clusterCount);
    expect(small.count).toBeGreaterThan(0);

    // Cada cristal grande: base plantada em y=0 local (chão) e posição dentro
    // da coroa do anel.
    const matrix = new THREE.Matrix4();
    const pos = new THREE.Vector3();
    const quat = new THREE.Quaternion();
    const scl = new THREE.Vector3();
    for (let i = 0; i < big.count; i++) {
      big.getMatrixAt(i, matrix);
      matrix.decompose(pos, quat, scl);
      expect(pos.y).toBeCloseTo(0, 5);
      const radial = Math.hypot(pos.x, pos.z);
      expect(radial).toBeGreaterThan(1.2);
      expect(radial).toBeLessThan(6);
      // Ponta fina: a altura domina a largura da base.
      expect(scl.y).toBeGreaterThan(scl.x);
    }

    effect.reset();
    effect.dispose();
    resources.dispose();
  });

  it('emerge em sequência e fecha o círculo no momento do impacto', () => {
    const { effect, resources } = create();
    effect.play({
      position: new THREE.Vector3(),
      forward: new THREE.Vector3(0, 0, 1),
      emergeDelaySeconds: 0.1,
      ringCompleteSeconds: 0.6,
    });

    const big = effect.group.getObjectByName('GlacialBigShards') as THREE.InstancedMesh;
    const delays = big.geometry.getAttribute('aDelay') as THREE.InstancedBufferAttribute;
    let min = Infinity;
    let max = -Infinity;
    for (let i = 0; i < big.count; i++) {
      min = Math.min(min, delays.getX(i));
      max = Math.max(max, delays.getX(i));
    }
    // Primeiro cristal junto do início do giro; último fechando no impacto.
    expect(min).toBeGreaterThanOrEqual(0.1);
    expect(min).toBeLessThan(0.25);
    expect(max).toBeGreaterThan(0.45);
    expect(max).toBeLessThanOrEqual(0.75);

    // A revelação das rachaduras acompanha o giro.
    const cracks = effect.group.getObjectByName('GlacialGroundCracks') as THREE.Mesh;
    const crackMat = cracks.material as THREE.ShaderMaterial;
    effect.update(0.1);
    const early = crackMat.uniforms.uReveal.value as number;
    effect.update(0.25);
    const later = crackMat.uniforms.uReveal.value as number;
    expect(later).toBeGreaterThan(early);

    effect.reset();
    effect.dispose();
    resources.dispose();
  });

  it('permanece formado, estilhaça e termina devolvendo a luz do pool', () => {
    const { effect, resources, lightPool } = create();
    const before = lightPool.availableCount;
    effect.play({
      position: new THREE.Vector3(),
      forward: new THREE.Vector3(0, 0, 1),
      emergeDelaySeconds: 0.1,
      ringCompleteSeconds: 0.5,
    });
    expect(lightPool.availableCount).toBe(before - 1);

    const big = effect.group.getObjectByName('GlacialBigShards') as THREE.InstancedMesh;
    const mat = big.material as THREE.ShaderMaterial;

    // Durante a formação + permanência o gelo está inteiro (sem quebra).
    effect.update(0.6);
    expect(mat.uniforms.uBreak.value).toBe(0);

    // Depois da permanência começa o estilhaçamento.
    effect.update(GLACIAL_CRYSTALS_TUNING.holdSeconds + 0.2);
    expect(mat.uniforms.uBreak.value).toBeGreaterThan(0);

    // Roda até o fim: update devolve false e a luz volta ao pool no reset.
    let alive = true;
    for (let i = 0; i < 200 && alive; i++) alive = effect.update(0.05);
    expect(alive).toBe(false);
    effect.reset();
    expect(lightPool.availableCount).toBe(before);
    expect(effect.group.visible).toBe(false);

    effect.dispose();
    resources.dispose();
  });
});
