import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { IceCrystalWaveVFX, ICE_CRYSTAL_WAVE_TUNING } from './IceCrystalWaveVFX';
import { VFXLightPool } from '../VFXLightPool';

/**
 * Skill 2 da Maga — a onda de cristais da referência:
 * - linha de cristais do pé da Maga até o ponto de impacto, crescendo em
 *   tamanho até o cristal-herói na ponta, todos inclinados para longe dela;
 * - erupção em sequência na velocidade do projétil (sincronia com o impacto);
 * - permanece formada, estilhaça e termina devolvendo a luz ao pool;
 * - funciona em qualquer orientação (só o yaw da direção entra no group).
 */
describe('IceCrystalWaveVFX (onda de cristais da Maga)', () => {
  const create = () => {
    const scene = new THREE.Scene();
    const lightPool = new VFXLightPool(scene, 2);
    const vfx = new IceCrystalWaveVFX(scene, new THREE.Texture(), lightPool);
    return { scene, lightPool, vfx };
  };

  const findWave = (scene: THREE.Scene): THREE.Group => {
    const group = scene.getObjectByName('MageIceCrystalWave');
    expect(group, 'onda de cristais não encontrada na cena').toBeTruthy();
    return group as THREE.Group;
  };

  it('forma a linha do pé da Maga ao impacto, crescendo até o cristal-herói', () => {
    const { scene, vfx } = create();
    const start = new THREE.Vector3(5, 1.2, -4);
    vfx.play({
      start,
      direction: new THREE.Vector3(1, 0, 0),
      length: 14,
      travelSpeed: 24,
    });

    const wave = findWave(scene);
    // Centro explícito: o pé da Maga, inclusive a altura do terreno (Y).
    expect(wave.position.distanceTo(start)).toBeLessThan(1e-6);
    // Orientação: só o yaw da direção planar (funciona olhando para qualquer lado).
    expect(wave.rotation.x).toBe(0);
    expect(wave.rotation.z).toBe(0);
    expect(wave.rotation.y).toBeCloseTo(Math.PI / 2);

    const big = wave.getObjectByName('IceWaveBigShards') as THREE.InstancedMesh;
    const small = wave.getObjectByName('IceWaveSmallShards') as THREE.InstancedMesh;
    expect(big.count).toBeGreaterThanOrEqual(14); // 2 cristais grandes por aglomerado
    expect(small.count).toBeGreaterThan(0);

    const matrix = new THREE.Matrix4();
    const pos = new THREE.Vector3();
    const quat = new THREE.Quaternion();
    const scl = new THREE.Vector3();
    const up = new THREE.Vector3();
    let maxHeight = 0;
    let heroZ = 0;
    for (let i = 0; i < big.count; i += 2) {
      // Instâncias pares = cristal principal de cada aglomerado.
      big.getMatrixAt(i, matrix);
      matrix.decompose(pos, quat, scl);
      // Base plantada no chão local e dentro da linha.
      expect(pos.y).toBeCloseTo(0, 5);
      expect(pos.z).toBeGreaterThan(0.3);
      expect(pos.z).toBeLessThan(14);
      // Ponta fina: altura domina a largura da base.
      expect(scl.y).toBeGreaterThan(scl.x);
      // Inclinado para LONGE da Maga (+Z local), como na referência.
      up.set(0, 1, 0).applyQuaternion(quat);
      expect(up.z).toBeGreaterThan(0);
      if (scl.y > maxHeight) {
        maxHeight = scl.y;
        heroZ = pos.z;
      }
    }
    // O cristal-herói é o mais alto e mora no fim da linha (ponto de impacto).
    expect(maxHeight).toBeGreaterThan(ICE_CRYSTAL_WAVE_TUNING.heightRange[1] * 0.85);
    expect(heroZ).toBeGreaterThan(14 * 0.75);

    vfx.dispose();
  });

  it('irrompe em sequência na velocidade do projétil (sincronia com o impacto)', () => {
    const { scene, vfx } = create();
    vfx.play({
      start: new THREE.Vector3(),
      direction: new THREE.Vector3(0, 0, 1),
      length: 12,
      travelSpeed: 24,
    });

    const wave = findWave(scene);
    const big = wave.getObjectByName('IceWaveBigShards') as THREE.InstancedMesh;
    const delays = big.geometry.getAttribute('aDelay') as THREE.InstancedBufferAttribute;
    const matrix = new THREE.Matrix4();
    const pos = new THREE.Vector3();
    for (let i = 0; i < big.count; i += 2) {
      big.getMatrixAt(i, matrix);
      pos.setFromMatrixPosition(matrix);
      // Cada cristal nasce quando a frente (24 m/s) passa pela sua posição.
      expect(delays.getX(i)).toBeCloseTo(pos.z / 24, 1);
    }

    // As rachaduras do chão acompanham a frente da onda.
    const cracks = wave.getObjectByName('IceWaveGroundCracks') as THREE.Mesh;
    const crackMat = cracks.material as THREE.ShaderMaterial;
    vfx.update(0.1);
    expect(crackMat.uniforms.uFront.value).toBeCloseTo(2.4, 3);
    vfx.update(0.15);
    expect(crackMat.uniforms.uFront.value).toBeCloseTo(6.0, 3);

    vfx.dispose();
  });

  it('permanece, estilhaça e termina devolvendo a luz ao pool', () => {
    const { scene, lightPool, vfx } = create();
    const before = lightPool.availableCount;
    vfx.play({
      start: new THREE.Vector3(),
      direction: new THREE.Vector3(0, 0, 1),
      length: 10,
      travelSpeed: 24,
    });
    expect(lightPool.availableCount).toBe(before - 1);

    const wave = findWave(scene);
    const big = wave.getObjectByName('IceWaveBigShards') as THREE.InstancedMesh;
    const mat = big.material as THREE.ShaderMaterial;

    // Linha completa (10m / 24m/s ≈ 0.42s) + permanência: gelo inteiro.
    vfx.update(0.6);
    expect(mat.uniforms.uBreak.value).toBe(0);

    // Depois da permanência, estilhaça.
    vfx.update(ICE_CRYSTAL_WAVE_TUNING.holdSeconds + 0.3);
    expect(mat.uniforms.uBreak.value).toBeGreaterThan(0);

    // Roda até o fim: efeito devolvido ao pool, luz liberada, cena limpa.
    for (let i = 0; i < 200 && vfx.activeCount > 0; i++) vfx.update(0.05);
    expect(vfx.activeCount).toBe(0);
    expect(lightPool.availableCount).toBe(before);
    expect(scene.getObjectByName('MageIceCrystalWave')).toBeFalsy();

    vfx.dispose();
  });
});
