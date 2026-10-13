import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as THREE from 'three';
import { WarriorSlashVFX } from './WarriorSlashVFX';
import { VFXLightPool } from './VFXLightPool';
import { WATER_VORTEX_TOTAL_SECONDS } from './warrior/WaterVortexVFX';

/**
 * Golpe Flamejante — VÓRTICE DE ÁGUA.
 *
 * A skill deixou de ser o leque de fogo + clarão de fogo: agora ela abre UM
 * funil de água (fitas em espiral, anéis empilhados, espelho d'água no topo,
 * detritos escuros e coroa de gotas) que nasce no ponto do golpe, gira e apaga.
 * Este arquivo trava as peças do efeito, o ciclo de vida e a devolução da luz
 * ao pool — o visual em si segue a imagem de referência enviada pelo usuário.
 */
describe('Golpe Flamejante (vórtice de água)', () => {
  beforeEach(() => {
    vi.spyOn(THREE.TextureLoader.prototype, 'load').mockImplementation(() => new THREE.Texture());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const create = (): { scene: THREE.Scene; vfx: WarriorSlashVFX; lights: VFXLightPool } => {
    const scene = new THREE.Scene();
    const lights = new VFXLightPool(scene, 4);
    return { scene, vfx: new WarriorSlashVFX(scene, lights), lights };
  };

  const playVortex = (vfx: WarriorSlashVFX, position = new THREE.Vector3(7, 0, -4)): void => {
    vfx.playWaterVortex({
      position,
      forward: new THREE.Vector3(1, 0, 0),
      scale: 1,
    });
  };

  const find = <T extends THREE.Object3D>(scene: THREE.Scene, name: string): T => {
    const found = scene.getObjectByName(name);
    expect(found, `objeto ${name} não encontrado`).toBeTruthy();
    return found as T;
  };

  const bandOpacity = (band: THREE.Mesh): number =>
    (band.material as THREE.ShaderMaterial).uniforms.uOpacity.value as number;

  it('monta o funil completo: fitas, anéis empilhados, espelho d\'água, detritos e gotas', () => {
    const { scene, vfx } = create();
    playVortex(vfx);

    const root = find<THREE.Group>(scene, 'WarriorWaterVortexVFX');
    const body = find<THREE.Group>(scene, 'WarriorWaterVortexBody');
    const bands = [0, 1, 2].map((i) => find<THREE.Mesh>(scene, `WarriorWaterVortexBand${i}`));
    const rings = [0, 1, 2, 3, 4].map((i) => find<THREE.Mesh>(scene, `WarriorWaterVortexRing${i}`));
    const debris = Array.from({ length: 10 }, (_, i) =>
      find<THREE.Mesh>(scene, `WarriorWaterVortexDebris${i}`)
    );
    const drops = Array.from({ length: 14 }, (_, i) =>
      find<THREE.Sprite>(scene, `WarriorWaterVortexDrop${i}`)
    );

    expect(root.visible).toBe(true);
    // O funil é largo na boca e fino no chão: a fita de fora é a mais aberta.
    const topBand = bands[0].geometry.getAttribute('position');
    expect(topBand.count).toBeGreaterThan(0);
    expect(bands.length).toBe(3);
    expect(rings.length).toBe(5);
    expect(body.getObjectByName('WarriorWaterVortexSurface')).toBeTruthy();
    expect(body.getObjectByName('WarriorWaterVortexSurfaceOuter')).toBeTruthy();
    expect(debris.length).toBe(10);
    expect(drops.length).toBe(14);
    expect(body.getObjectByName('WarriorWaterVortexHeart')).toBeTruthy();
    expect(find<THREE.Mesh>(scene, 'WarriorWaterVortexPool')).toBeTruthy();
    expect(find<THREE.Mesh>(scene, 'WarriorWaterVortexShockwave')).toBeTruthy();

    // A base do efeito fica no ponto do golpe, virada para o "forward" recebido.
    expect(root.position.x).toBeCloseTo(7);
    expect(root.position.z).toBeCloseTo(-4);
    expect(root.rotation.y).toBeCloseTo(Math.PI / 2);
    vfx.dispose();
  });

  it('gira, abre e apaga: nada fica aceso depois do fim da skill', () => {
    const { scene, vfx } = create();
    playVortex(vfx);

    const band = find<THREE.Mesh>(scene, 'WarriorWaterVortexBand0');
    const ring = find<THREE.Mesh>(scene, 'WarriorWaterVortexRing2');
    const debris = find<THREE.Mesh>(scene, 'WarriorWaterVortexDebris3');

    // Nasce apagado e acende no primeiro quadro.
    vfx.update(0.04);
    const bandRotation = band.rotation.y;
    const ringRotation = ring.rotation.y;
    const debrisStart = debris.position.clone();
    expect(bandOpacity(band)).toBeGreaterThan(0);
    expect(ring.rotation.y).not.toBe(0);

    // Gira: nada fica parado no vórtice.
    vfx.update(0.25);
    expect(band.rotation.y).toBeGreaterThan(bandRotation);
    expect(ring.rotation.y).not.toBe(ringRotation);
    expect(debris.position.distanceTo(debrisStart)).toBeGreaterThan(0.05);

    // Cheio no meio da vida e apagado no fim.
    vfx.update(0.6);
    expect(bandOpacity(band)).toBeGreaterThan(0.5);
    // Passado o tempo total, o próprio facade devolve o efeito ao pool.
    vfx.update(WATER_VORTEX_TOTAL_SECONDS);
    expect(bandOpacity(band)).toBe(0);
    expect(vfx.activeCount).toBe(0);
    vfx.dispose();
  });

  it('empresta uma luz do pool enquanto vive e devolve no fim', () => {
    const { scene, vfx, lights } = create();
    const before = lights.availableCount;
    playVortex(vfx);
    expect(lights.availableCount).toBe(before - 1);
    vfx.update(0.08);

    const light = scene.children.find(
      (child): child is THREE.PointLight => child instanceof THREE.PointLight && child.intensity > 0
    );
    expect(light, 'nenhuma luz azul acesa para o vórtice').toBeTruthy();
    expect(light!.intensity).toBeGreaterThan(0);

    vfx.update(WATER_VORTEX_TOTAL_SECONDS + 2);
    expect(lights.availableCount).toBe(before);
    vfx.dispose();
  });

  it('clear() devolve o vórtice ao pool (troca de fase sem sobra acesa)', () => {
    const { scene, vfx, lights } = create();
    const before = lights.availableCount;
    playVortex(vfx);
    expect(vfx.activeCount).toBeGreaterThan(0);
    const root = find<THREE.Group>(scene, 'WarriorWaterVortexVFX');

    vfx.clear();
    expect(vfx.activeCount).toBe(0);
    expect(lights.availableCount).toBe(before);
    expect(root.parent).toBeNull();
    vfx.dispose();
  });
});
