import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as THREE from 'three';
import { WarriorSlashVFX } from './WarriorSlashVFX';
import { VFXLightPool } from './VFXLightPool';

/**
 * O Game usa duas famílias de efeito do guerreiro na mesma fachada: o arco
 * clássico em pool (play/playImpact/playTravelingSlash/playSpin) e o traço
 * modular novo, que precisa de `group`, `triggerSlash`, `reportEnemyHit` e
 * `triggerMiniBossHeal`. Estes testes travam esse contrato de composição.
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

  it('expõe o group do traço modular para ser adicionado na cena uma única vez', () => {
    const { vfx } = create();
    expect(vfx.group.name).toBe('WarriorSlashVFXRoot');
    // group do flash de impacto + group do pilar de cura
    expect(vfx.group.children.length).toBe(2);
    vfx.dispose();
  });

  it('lança o traço, dissolve no primeiro acerto e limpa tudo no clear()', () => {
    const { vfx } = create();
    const base = vfx.group.children.length;

    const id = vfx.triggerSlash(
      'ataque_basico',
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0, 0, 1),
      0,
      null
    );
    expect(id).toBeGreaterThan(0);
    expect(vfx.group.children.length).toBe(base + 1);

    // O primeiro corpo atingido consome o traço e acende o flash de impacto.
    vfx.reportEnemyHit(new THREE.Vector3(0, 0, 2));
    vfx.update(0.05);
    expect(vfx.group.children.length).toBe(base);

    // Um novo corte entra e some no clear() usado na troca de lobby/reset.
    vfx.triggerSlash('triplo_ataque', new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, 1));
    expect(vfx.group.children.length).toBe(base + 1);
    vfx.clear();
    expect(vfx.group.children.length).toBe(base);

    vfx.dispose();
  });

  it('anima o pilar de cura do mini-boss dentro do mesmo group', () => {
    const { vfx } = create();
    const healPillarGroup = vfx.group.children[1];
    expect(healPillarGroup.children.length).toBe(0);

    vfx.triggerMiniBossHeal(new THREE.Object3D());
    expect(healPillarGroup.children.length).toBe(1);
    vfx.update(0.1);
    expect(healPillarGroup.children.length).toBe(1);

    vfx.update(2.5);
    expect(healPillarGroup.children.length).toBe(0);
    vfx.dispose();
  });
});
