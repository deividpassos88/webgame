import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as THREE from 'three';
import { WarriorSlashVFX } from './WarriorSlashVFX';
import { VFXLightPool } from './VFXLightPool';
import type { WarriorSlashMaterial } from './VFXMaterials';

/**
 * Pulo Atacando do guerreiro: SEM rastro de lâmina, SEM linha de fogo no
 * chão e SEM coluna central branca. O efeito é só o IMPACTO no frame em que
 * a espada bate no chão (65% da animação): um TORNADO DE CHAMAS GIGANTE
 * (3 fitas espirais de fogo, 4x maior) nasce de uma vez, gira vivo e apaga,
 * junto com a onda de choque enorme, o clarão, as faíscas e as brasas.
 */
describe('Pulo Atacando (impacto: tornado de chamas gigante)', () => {
  beforeEach(() => {
    vi.spyOn(THREE.TextureLoader.prototype, 'load').mockImplementation(() => new THREE.Texture());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const create = (): { scene: THREE.Scene; vfx: WarriorSlashVFX } => {
    const scene = new THREE.Scene();
    return { scene, vfx: new WarriorSlashVFX(scene, new VFXLightPool(scene, 4)) };
  };

  const playDive = (vfx: WarriorSlashVFX, impactDelay = 0.6): void => {
    vfx.playJumpDive({
      position: new THREE.Vector3(0, 0, 0),
      forward: new THREE.Vector3(0, 0, 1),
      impactDelay,
    });
  };

  const find = <T extends THREE.Object3D>(scene: THREE.Scene, name: string): T => {
    const found = scene.getObjectByName(name);
    expect(found, `objeto ${name} não encontrado`).toBeTruthy();
    return found as T;
  };

  it('não existe rastro, linha no chão nem coluna branca: só o impacto', () => {
    const { scene, vfx } = create();
    playDive(vfx);

    const root = find<THREE.Group>(scene, 'WarriorJumpDiveVFX');
    const tornado = find<THREE.Group>(scene, 'WarriorJumpDiveTornado');

    // Durante o pulo inteiro: efeito escondido.
    vfx.update(0.3);
    expect(root.visible).toBe(false);
    expect(tornado.visible).toBe(false);

    // Nenhum rastro de lâmina, linha de fogo no chão ou coluna central branca.
    expect(scene.getObjectByName('WarriorJumpDiveTrail')).toBeFalsy();
    expect(scene.getObjectByName('WarriorJumpDiveBladeHead')).toBeFalsy();
    expect(scene.getObjectByName('WarriorJumpDiveGroundFire')).toBeFalsy();
    expect(scene.getObjectByName('WarriorJumpDiveCrack')).toBeFalsy();
    expect(scene.getObjectByName('WarriorJumpDiveTornadoCore')).toBeFalsy();
    vfx.dispose();
  });

  it('no impacto o tornado GIGANTE nasce de uma vez, junto da onda de choque', () => {
    const { scene, vfx } = create();
    playDive(vfx);

    const root = find<THREE.Group>(scene, 'WarriorJumpDiveVFX');
    const tornado = find<THREE.Group>(scene, 'WarriorJumpDiveTornado');
    const flare = find<THREE.Sprite>(scene, 'WarriorJumpDiveImpactFlare');
    const shockwave = find<THREE.Mesh>(scene, 'WarriorJumpDiveShockwave');

    vfx.update(0.59);
    expect(root.visible).toBe(false);

    // A espada bateu: tudo acende no MESMO frame.
    vfx.update(0.02);
    expect(root.visible).toBe(true);
    expect(tornado.visible).toBe(true);
    expect(flare.visible).toBe(true);
    expect(shockwave.visible).toBe(true);
    expect((flare.material as THREE.SpriteMaterial).opacity).toBeGreaterThan(0);

    // O tornado já nasce quase no tamanho final (pop-in de 0,12 s).
    vfx.update(0.11);
    const band = find<THREE.Mesh>(scene, 'WarriorJumpDiveTornadoBand0');
    expect(band.scale.x).toBeGreaterThan(0.95);

    // ...e é grande: funil de ~11,5 m de altura com base larga.
    band.geometry.computeBoundingBox();
    const box = band.geometry.boundingBox!;
    expect(box.max.y).toBeGreaterThan(10);
    const band0 = find<THREE.Mesh>(scene, 'WarriorJumpDiveTornadoBand0');
    expect(band0.geometry.boundingBox!.max.z).toBeGreaterThan(3);

    // O tornado nasce BEM À FRENTE do herói, não em cima dele.
    const impact = find<THREE.Group>(scene, 'WarriorJumpDiveImpact');
    expect(impact.getWorldPosition(new THREE.Vector3()).z).toBeGreaterThan(3.5);
    vfx.dispose();
  });

  it('o funil de fogo gira: cada fita em velocidade própria', () => {
    const { scene, vfx } = create();
    playDive(vfx);
    vfx.update(0.61); // impacto

    const band0 = find<THREE.Mesh>(scene, 'WarriorJumpDiveTornadoBand0');
    const band1 = find<THREE.Mesh>(scene, 'WarriorJumpDiveTornadoBand1');

    const start0 = band0.rotation.y;
    const start1 = band1.rotation.y;
    vfx.update(0.1);
    expect(band0.rotation.y).not.toBeCloseTo(start0, 3);
    expect(band1.rotation.y).not.toBeCloseTo(start1, 3);
    // A fita de dentro gira mais rápido que a de fora.
    expect(Math.abs(band1.rotation.y - start1)).toBeGreaterThan(Math.abs(band0.rotation.y - start0));

    // Paleta de fogo realista nas fitas: vermelho fora, mais quente dentro.
    const uniforms0 = (band0.material as WarriorSlashMaterial).uniforms;
    const uniforms2 = (find<THREE.Mesh>(scene, 'WarriorJumpDiveTornadoBand2').material as WarriorSlashMaterial).uniforms;
    expect(uniforms0.uColorB.value.getHex()).toBe(0xff4d12);
    expect(uniforms2.uColorB.value.getHex()).toBe(0xffa53a);
    expect(uniforms2.uIntensity.value).toBeGreaterThan(uniforms0.uIntensity.value);
    vfx.dispose();
  });

  it('chamas lambem a boca do funil ao redor da base gigante', () => {
    const { scene, vfx } = create();
    playDive(vfx);
    vfx.update(0.61); // impacto

    const flame = find<THREE.Sprite>(scene, 'WarriorJumpDiveBaseFlame0');
    let sawFlame = false;
    for (let i = 0; i < 12; i++) {
      vfx.update(1 / 60);
      if (!flame.visible) continue;
      sawFlame = true;
      // A chama orbita a boca larga do funil (raio na casa dos metros).
      const radius = Math.hypot(flame.position.x, flame.position.z);
      expect(radius).toBeGreaterThan(1.8);
      expect(flame.position.y).toBeLessThan(1.5);
    }
    expect(sawFlame).toBe(true);
    vfx.dispose();
  });

  it('a onda de choque abre gigante no chão', () => {
    const { scene, vfx } = create();
    playDive(vfx);
    vfx.update(0.61); // impacto

    const shockwave = find<THREE.Mesh>(scene, 'WarriorJumpDiveShockwave');
    const startScale = shockwave.scale.x;
    vfx.update(0.55);
    expect(shockwave.scale.x).toBeGreaterThan(startScale);
    expect(shockwave.scale.x).toBeGreaterThan(9);
    vfx.dispose();
  });

  it('o impacto treme a câmera forte e o efeito sai da cena sozinho', () => {
    const { scene, vfx } = create();
    playDive(vfx);
    const camera = new THREE.PerspectiveCamera();
    camera.position.set(0, 5, 6);
    const before = camera.position.clone();

    vfx.update(0.3);
    vfx.applyCameraShake(camera, 1 / 60);
    expect(camera.position.equals(before)).toBe(true);

    // No impacto o tremor é pesado (intensidade 0,22).
    vfx.update(0.31);
    vfx.applyCameraShake(camera, 1 / 60);
    expect(camera.position.equals(before)).toBe(false);

    // O efeito termina sozinho e devolve o slot do pool.
    for (let i = 0; i < 120; i++) vfx.update(1 / 30);
    expect(vfx.activeCount).toBe(0);
    expect(scene.getObjectByName('WarriorJumpDiveVFX')).toBeFalsy();
    vfx.dispose();
  });

  it('clear() remove o efeito no meio da queimada', () => {
    const { scene, vfx } = create();
    playDive(vfx);
    vfx.update(0.7); // impacto acontecendo
    expect(scene.getObjectByName('WarriorJumpDiveVFX')).toBeTruthy();

    vfx.clear();
    expect(scene.getObjectByName('WarriorJumpDiveVFX')).toBeFalsy();
    expect(vfx.activeCount).toBe(0);
    vfx.dispose();
  });

  it('respeita a direção do ataque: o tornado nasce à frente do herói', () => {
    const { scene, vfx } = create();
    vfx.playJumpDive({
      position: new THREE.Vector3(2, 0, 3),
      forward: new THREE.Vector3(0, 0, -1),
      impactDelay: 0.4,
    });
    vfx.update(0.45);

    const tornado = find<THREE.Group>(scene, 'WarriorJumpDiveTornado');
    // Olhando para -Z: o tornado fica à frente, atrás da posição inicial em z.
    expect(tornado.getWorldPosition(new THREE.Vector3()).z).toBeLessThan(3);
    vfx.dispose();
  });
});
