import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as THREE from 'three';
import { WarriorSlashVFX } from './WarriorSlashVFX';
import { VFXLightPool } from './VFXLightPool';
import type { WarriorSlashMaterial } from './VFXMaterials';

/**
 * Trava o visual pedido no golpe básico/automático e no giratório:
 * rastro com cor (não branco), com falhas, e o arco ")" de vento que sai da
 * lâmina na direção do monstro com alcance de 4 a 7 metros.
 */
describe('Visual do corte do guerreiro', () => {
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

  const findMesh = (scene: THREE.Scene, name: string): THREE.Mesh => {
    const found = scene.getObjectByName(name);
    expect(found, `mesh ${name} não encontrado`).toBeTruthy();
    return found as THREE.Mesh;
  };

  it('o rastro da lâmina sai com cor saturada e falhas, e muda a cada golpe', () => {
    const { scene, vfx } = create();
    const forward = new THREE.Vector3(0, 0, 1);

    vfx.play({ position: new THREE.Vector3(), forward, type: 'basic' });
    const blade = findMesh(scene, 'WarriorSlashMain');
    const uniforms = (blade.material as WarriorSlashMaterial).uniforms;

    // Cor de verdade no rastro, não branco
    expect(uniforms.uColorB.value.getHex()).toBe(0x2fd4ff);
    expect(uniforms.uColorA.value.getHex()).not.toBe(0xffffff);
    // Falhas no rastro + saturação preservada pelo blending aditivo
    expect(uniforms.uBreakup.value).toBeGreaterThan(0.4);
    expect(uniforms.uSaturation.value).toBeGreaterThan(1);

    const firstSeed = uniforms.uSeed.value;
    for (let i = 0; i < 30; i++) vfx.update(0.05);
    expect(vfx.activeCount).toBe(0);

    vfx.play({ position: new THREE.Vector3(), forward, type: 'basic' });
    const second = (scene.getObjectByName('WarriorSlashMain') as THREE.Mesh)
      .material as WarriorSlashMaterial;
    expect(second.uniforms.uSeed.value).not.toBe(firstSeed);
    vfx.dispose();
  });

  it.each([
    ['auto', 0x25f0b8],
    ['combo2', 0x2f9dff],
    ['combo3', 0xffa53a],
  ] as const)('o golpe %s tem cor própria no rastro', (type, color) => {
    const { scene, vfx } = create();
    vfx.play({ position: new THREE.Vector3(), forward: new THREE.Vector3(0, 0, 1), type });
    const blade = findMesh(scene, 'WarriorSlashMain').material as WarriorSlashMaterial;
    expect(blade.uniforms.uColorB.value.getHex()).toBe(color);
    vfx.dispose();
  });

  it('o leque de vento espera a lâmina e voa para a frente até parar no monstro', () => {
    const { scene, vfx } = create();
    const start = new THREE.Vector3(0, 0, 0);
    const forward = new THREE.Vector3(0, 0, 1);

    vfx.playTravelingSlash({
      start,
      forward,
      target: new THREE.Vector3(0, 0, 5),
      type: 'basic',
    });

    const arc = scene.getObjectByName('WarriorTravelingSlash');
    expect(arc).toBeTruthy();
    // sai depois do rastro da lâmina, não junto
    expect((arc as THREE.Object3D).visible).toBe(false);

    vfx.update(0.06);
    expect((arc as THREE.Object3D).visible).toBe(true);
    // nasce na borda do rastro, à frente do jogador
    expect((arc as THREE.Object3D).position.z).toBeGreaterThan(0.9);
    expect((arc as THREE.Object3D).position.z).toBeLessThan(2.5);

    for (let i = 0; i < 40 && vfx.activeCount > 0; i++) vfx.update(0.05);
    // o arco da frente termina exatamente no monstro
    expect((arc as THREE.Object3D).position.z).toBeCloseTo(5, 1);
    vfx.dispose();
  });

  it('o leque de vento nunca passa de 7 m mesmo com o monstro longe', () => {
    const { scene, vfx } = create();
    vfx.playTravelingSlash({
      start: new THREE.Vector3(0, 0, 0),
      forward: new THREE.Vector3(0, 0, 1),
      target: new THREE.Vector3(0, 0, 25),
      type: 'basic',
    });
    const arc = scene.getObjectByName('WarriorTravelingSlash') as THREE.Object3D;
    for (let i = 0; i < 40 && vfx.activeCount > 0; i++) vfx.update(0.05);
    expect(arc.position.z).toBeLessThanOrEqual(7.01);
    expect(arc.position.z).toBeGreaterThanOrEqual(6.9);
    vfx.dispose();
  });

  it('o arco ")" inclina na direção do monstro quando ele está fora do eixo', () => {
    const { scene, vfx } = create();
    vfx.playTravelingSlash({
      start: new THREE.Vector3(0, 0, 0),
      forward: new THREE.Vector3(0, 0, 1),
      target: new THREE.Vector3(2.4, 0, 4.2),
      type: 'basic',
    });
    const arc = scene.getObjectByName('WarriorTravelingSlash') as THREE.Object3D;
    for (let i = 0; i < 40 && vfx.activeCount > 0; i++) vfx.update(0.05);

    // desviou para o lado do monstro, mas sem virar de lado
    expect(arc.position.x).toBeGreaterThan(0.4);
    expect(arc.position.x).toBeLessThan(3.6);
    expect(arc.position.z).toBeGreaterThan(arc.position.x);
    vfx.dispose();
  });

  it('a onda nasce deitada na altura da lâmina, inteira acima do chão', () => {
    const { scene, vfx } = create();
    vfx.playTravelingSlash({
      start: new THREE.Vector3(0, 0, 0),
      forward: new THREE.Vector3(0, 0, 1),
      target: new THREE.Vector3(0, 0, 5),
      type: 'basic',
    });
    vfx.update(0.06);

    const arc = scene.getObjectByName('WarriorTravelingSlash') as THREE.Object3D;
    arc.updateWorldMatrix(true, true);
    const box = new THREE.Box3();
    arc.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) box.expandByObject(child as THREE.Mesh);
    });
    // deitada como o rastro da lâmina: larga e comprida, baixa, sem enfiar no piso
    expect(box.max.x - box.min.x).toBeGreaterThan(2.5);
    expect(box.max.z - box.min.z).toBeGreaterThan(1.8);
    expect(box.max.y - box.min.y).toBeLessThan(2);
    expect(box.min.y).toBeGreaterThan(0.2);
    vfx.dispose();
  });

  it('sai um único leque grande de vento, com a barriga para o monstro', () => {
    const { scene, vfx } = create();
    vfx.playTravelingSlash({
      start: new THREE.Vector3(0, 0, 0),
      forward: new THREE.Vector3(0, 0, 1),
      target: new THREE.Vector3(0, 0, 5),
      type: 'basic',
    });
    vfx.update(0.06);

    const arc = scene.getObjectByName('WarriorTravelingSlash') as THREE.Object3D;
    const strokes = arc.children.filter((child) => child.name.startsWith('WindWaveStroke'));
    expect(strokes.length).toBe(1);
    // Nenhum sprite radial: o leque não pode virar uma bola de luz.
    expect(arc.children.some((child) => (child as THREE.Sprite).isSprite === true)).toBe(false);

    // A ponta do ")" fica na frente (+Z) e as pontas dos braços recuam.
    const geometry = (strokes[0] as THREE.Mesh).geometry;
    geometry.computeBoundingBox();
    const local = geometry.boundingBox as THREE.Box3;
    expect(Math.abs(local.max.z)).toBeLessThan(0.25);
    expect(local.min.z).toBeLessThan(-0.5);

    // Grande: bem mais largo que o rastro fino de antes.
    const box = new THREE.Box3().setFromObject(strokes[0]);
    expect(box.max.x - box.min.x).toBeGreaterThan(4);
    vfx.dispose();
  });

  it('o leque abre enquanto a onda viaja', () => {
    const { scene, vfx } = create();
    vfx.playTravelingSlash({
      start: new THREE.Vector3(0, 0, 0),
      forward: new THREE.Vector3(0, 0, 1),
      target: new THREE.Vector3(0, 0, 7),
      type: 'basic',
    });
    vfx.update(0.06);

    const arc = scene.getObjectByName('WarriorTravelingSlash') as THREE.Object3D;
    const stroke = arc.children.find((child) => child.name.startsWith('WindWaveStroke')) as THREE.Object3D;
    const widthStart = stroke.scale.x;
    const zStart = arc.position.z;
    vfx.update(0.25);
    expect(stroke.scale.x).toBeGreaterThan(widthStart);
    // e avança para a frente
    expect(arc.position.z).toBeGreaterThan(zStart);
    vfx.dispose();
  });

  it('sem impacto: o rastro não acende o clarão de impacto e o leque termina sozinho', () => {
    const { scene, vfx } = create();
    vfx.play({ position: new THREE.Vector3(), forward: new THREE.Vector3(0, 0, 1), type: 'basic', hasImpact: false });
    vfx.playTravelingSlash({
      start: new THREE.Vector3(),
      forward: new THREE.Vector3(0, 0, 1),
      target: new THREE.Vector3(0, 0, 7),
      type: 'basic',
    });
    const flare = scene.getObjectByName('WarriorImpactFlare') as THREE.Sprite;
    for (let i = 0; i < 4; i++) {
      vfx.update(0.05);
      expect(flare.material.opacity).toBe(0);
    }
    for (let i = 0; i < 40 && vfx.activeCount > 0; i++) vfx.update(0.05);
    expect(vfx.activeCount).toBe(0);
    vfx.dispose();
  });

  it('com impacto: o clarão de impacto acende no fim do rastro', () => {
    const { scene, vfx } = create();
    vfx.play({ position: new THREE.Vector3(), forward: new THREE.Vector3(0, 0, 1), type: 'basic', hasImpact: true });
    const flare = scene.getObjectByName('WarriorImpactFlare') as THREE.Sprite;
    expect(flare.material.opacity).toBeGreaterThan(0.2);
    vfx.dispose();
  });

  it('a luz azul do golpe fica discreta e não incendeia o corpo do personagem', () => {
    const { scene, vfx } = create();
    vfx.play({ position: new THREE.Vector3(), forward: new THREE.Vector3(0, 0, 1), type: 'basic' });
    const glow = scene.getObjectByName('WarriorCenterGlow') as THREE.Sprite;
    expect(glow.material.opacity).toBeLessThanOrEqual(0.15);
    vfx.dispose();
  });

  it('o arco de vento nasce com cor e falhas, não branco', () => {
    const { scene, vfx } = create();
    vfx.playTravelingSlash({
      start: new THREE.Vector3(),
      forward: new THREE.Vector3(0, 0, 1),
      target: new THREE.Vector3(0, 0, 5),
      type: 'auto',
    });
    vfx.update(0.06);

    const arc = scene.getObjectByName('WarriorTravelingSlash') as THREE.Object3D;
    let checked = 0;
    arc.traverse((child) => {
      const mesh = child as THREE.Mesh;
      const material = mesh.material as WarriorSlashMaterial | undefined;
      if (!material?.uniforms?.uBreakup) return;
      checked += 1;
      expect(material.uniforms.uColorA.value.getHex()).not.toBe(0xffffff);
      expect(material.uniforms.uBreakup.value).toBeGreaterThan(0.1);
      expect(material.uniforms.uSaturation.value).toBeGreaterThan(1);
    });
    expect(checked).toBeGreaterThanOrEqual(1);
    vfx.dispose();
  });

  it('o arco de lâmina vertical do Corte Duplo nasce em pé, no lugar, e some', () => {
    const { scene, vfx } = create();
    const position = new THREE.Vector3(2, 0, 1);
    vfx.playVerticalArc({ position, forward: new THREE.Vector3(0, 0, 1), type: 'combo3' });

    const arc = scene.getObjectByName('WarriorVerticalArc') as THREE.Group;
    expect(arc).toBeTruthy();
    // Fica no ponto do golpe: a tempestade abre arcos, não um projétil.
    expect(arc.position.distanceTo(position)).toBeLessThan(1.5);
    arc.updateWorldMatrix(true, true);

    const box = new THREE.Box3();
    arc.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) box.expandByObject(child as THREE.Mesh);
    });
    expect(box.max.y - box.min.y).toBeGreaterThan(1);
    expect(box.min.y).toBeGreaterThan(-0.2);

    expect(vfx.activeCount).toBe(1);
    vfx.update(0.2);
    expect(vfx.activeCount).toBe(1);
    vfx.update(0.2);
    expect(vfx.activeCount).toBe(0);
    vfx.dispose();
  });

  it('cada arco da tempestade aceita um tom próprio', () => {
    const { scene, vfx } = create();
    vfx.playVerticalArc({
      position: new THREE.Vector3(),
      forward: new THREE.Vector3(0, 0, 1),
      type: 'combo3',
      tint: 0xffd76a,
    });
    const arc = scene.getObjectByName('WarriorVerticalArc') as THREE.Group;
    const colors: number[] = [];
    arc.traverse((child) => {
      const material = (child as THREE.Mesh).material as WarriorSlashMaterial | undefined;
      if (material?.uniforms?.uBreakup) colors.push(material.uniforms.uColorB.value.getHex());
    });
    expect(colors.length).toBeGreaterThanOrEqual(2);
    expect(colors.every((color) => color === 0xffd76a)).toBe(true);
    vfx.dispose();
  });

  it('o giratório ganha cor (dourado / gelo) e rastro que varre o corpo', () => {
    const { scene, vfx } = create();

    vfx.playSpin({ position: new THREE.Vector3(), forward: new THREE.Vector3(0, 0, 1), type: 'spin' });
    const blade = findMesh(scene, 'WarriorSlashMain');
    const spinColors = (blade.material as WarriorSlashMaterial).uniforms;
    expect(spinColors.uColorB.value.getHex()).toBe(0xffb43c);
    expect(spinColors.uBreakup.value).toBeGreaterThan(0.4);

    const yaw = (blade.parent as THREE.Object3D).rotation.y;
    vfx.update(0.12);
    expect((blade.parent as THREE.Object3D).rotation.y).toBeGreaterThan(yaw);
    for (let i = 0; i < 30 && vfx.activeCount > 0; i++) vfx.update(0.05);

    vfx.playSpin({ position: new THREE.Vector3(), forward: new THREE.Vector3(0, 0, 1), type: 'spin_frost' });
    const frost = findMesh(scene, 'WarriorSlashMain').material as WarriorSlashMaterial;
    expect(frost.uniforms.uColorB.value.getHex()).toBe(0x7fd4ff);

    const wave = scene.getObjectByName('WarriorSpinWave');
    expect(wave).toBeTruthy();
    vfx.dispose();
  });
});
