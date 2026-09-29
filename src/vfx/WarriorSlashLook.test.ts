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

  it('o arco ")" de vento espera a lâmina e voa 4 a 7 m na direção do monstro', () => {
    const { scene, vfx } = create();
    const start = new THREE.Vector3(0, 0, 0);
    const forward = new THREE.Vector3(0, 0, 1);

    // monstro colado: mesmo assim o arco precisa dar para ser lido
    vfx.playTravelingSlash({
      start,
      forward,
      target: new THREE.Vector3(0, 0, 2),
      type: 'basic',
    });

    const arc = scene.getObjectByName('WarriorTravelingSlash');
    expect(arc).toBeTruthy();
    // sai depois do rastro da lâmina, não junto
    expect((arc as THREE.Object3D).visible).toBe(false);

    vfx.update(0.06);
    expect((arc as THREE.Object3D).visible).toBe(true);

    for (let i = 0; i < 40 && vfx.activeCount > 0; i++) vfx.update(0.05);
    const end = (arc as THREE.Object3D).position;
    const travelled = new THREE.Vector3(end.x, 0, end.z).distanceTo(new THREE.Vector3(0, 0, 0));
    expect(travelled).toBeGreaterThanOrEqual(3.9);
    expect(travelled).toBeLessThanOrEqual(7.1);
    vfx.dispose();
  });

  it('o arco ")" nunca passa de 7 m mesmo com o monstro longe', () => {
    const { scene, vfx } = create();
    vfx.playTravelingSlash({
      start: new THREE.Vector3(0, 0, 0),
      forward: new THREE.Vector3(0, 0, 1),
      target: new THREE.Vector3(0, 0, 25),
      type: 'basic',
    });
    const arc = scene.getObjectByName('WarriorTravelingSlash') as THREE.Object3D;
    for (let i = 0; i < 40 && vfx.activeCount > 0; i++) vfx.update(0.05);
    expect(arc.position.z).toBeLessThanOrEqual(7.1);
    expect(arc.position.z).toBeGreaterThanOrEqual(3.9);
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

  it('o arco ")" sai em pé, inteiro acima do chão, virando para o monstro', () => {
    const { scene, vfx } = create();
    vfx.playTravelingSlash({
      start: new THREE.Vector3(0, 0, 0),
      forward: new THREE.Vector3(0, 0, 1),
      target: new THREE.Vector3(0, 0, 5),
      type: 'basic',
    });
    vfx.update(0.06);

    const arc = scene.getObjectByName('WarriorTravelingSlash') as THREE.Object3D;
    // A lua é montada no plano XY: alta em pé, com as pontas no chão. Antes
    // ela era um arco deitado com metade enfiada embaixo do piso.
    arc.updateWorldMatrix(true, true);
    const box = new THREE.Box3();
    arc.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) box.expandByObject(child as THREE.Mesh);
    });
    expect(box.max.y - box.min.y).toBeGreaterThan(3.5);
    expect(box.max.x - box.min.x).toBeLessThan(3.3);
    // Aberta de lado (visto por trás é um ")"), não um arco raso no chão.
    expect(box.max.x - box.min.x).toBeLessThan((box.max.y - box.min.y) * 0.9);
    // Nada do arco abaixo do chão.
    expect(box.min.y).toBeGreaterThan(-0.12);
    expect(box.max.y).toBeLessThan(4);
    vfx.dispose();
  });

  it('o arco ")" não tem bola de brilho no centro', () => {
    const { scene, vfx } = create();
    vfx.playTravelingSlash({
      start: new THREE.Vector3(0, 0, 0),
      forward: new THREE.Vector3(0, 0, 1),
      target: new THREE.Vector3(0, 0, 5),
      type: 'basic',
    });
    vfx.update(0.06);

    const arc = scene.getObjectByName('WarriorTravelingSlash') as THREE.Object3D;
    const glow = arc.getObjectByName('TravelGlow') as THREE.Sprite;
    expect(glow).toBeTruthy();
    // Disco pequeno, colado na borda do arco, e com pouca opacidade.
    expect(glow.scale.x).toBeLessThan(1);
    expect((glow.material as THREE.SpriteMaterial).opacity).toBeLessThan(0.5);
    expect(glow.position.x).toBeGreaterThan(0.5);
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
    expect(checked).toBeGreaterThanOrEqual(3);
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
