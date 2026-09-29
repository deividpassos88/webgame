import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as THREE from 'three';
import { WarriorSlashVFX } from './WarriorSlashVFX';
import { VFXLightPool } from './VFXLightPool';

/**
 * A fachada do guerreiro serve o Game com o sistema de pool (play, playImpact,
 * playTravelingSlash, playSpin, clear, camera shake) e encaminha para a
 * implementação modular de `vfx/warrior/` o pilar de cura do mini-boss, que
 * vive em um group próprio adicionado uma vez na cena.
 */
describe('WarriorSlashVFX (fachada do guerreiro)', () => {
  beforeEach(() => {
    vi.spyOn(THREE.TextureLoader.prototype, 'load').mockImplementation(() => new THREE.Texture());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const create = (): { scene: THREE.Scene; vfx: WarriorSlashVFX } => {
    const scene = new THREE.Scene();
    return { scene, vfx: new WarriorSlashVFX(scene, new VFXLightPool(scene, 2)) };
  };

  it('expõe o group modular para ser adicionado na cena uma única vez', () => {
    const { scene, vfx } = create();
    expect(vfx.group.name).toBe('WarriorSlashVFXRoot');
    scene.add(vfx.group);
    // flash de impacto + pilar de cura
    expect(vfx.group.children.length).toBe(2);
    vfx.dispose();
  });

  it('mantém só o pilar de cura: o rastro duplicado não é disparado no combate', () => {
    const { vfx } = create();
    const base = vfx.group.children.length;

    // Só o pilar de cura cria algo dentro do group modular; nenhum rastro.
    vfx.update(0.5);
    expect(vfx.group.children.length).toBe(base);

    vfx.triggerMiniBossHeal(new THREE.Object3D());
    const healPillarGroup = vfx.group.children[1];
    expect(healPillarGroup.children.length).toBe(1);

    vfx.update(2.5);
    expect(healPillarGroup.children.length).toBe(0);
    vfx.dispose();
  });

  it('clear() limpa o pilar de cura junto dos efeitos em pool', () => {
    const { vfx } = create();
    const healPillarGroup = vfx.group.children[1];

    vfx.triggerMiniBossHeal(new THREE.Object3D());
    expect(healPillarGroup.children.length).toBe(1);

    vfx.clear();
    expect(healPillarGroup.children.length).toBe(0);
    expect(vfx.activeCount).toBe(0);
    vfx.dispose();
  });
});
