import * as THREE from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MageVFX } from './MageVFX';
import type { MageSpellId } from './VFXTypes';

function createAction(duration = 2, timeScale = 1): { root: THREE.Group; mixer: THREE.AnimationMixer; action: THREE.AnimationAction } {
  const root = new THREE.Group();
  const mixer = new THREE.AnimationMixer(root);
  const clip = new THREE.AnimationClip('mage attack test', duration, [
    new THREE.NumberKeyframeTrack('.visible', [0, duration], [1, 1]),
  ]);
  const action = mixer.clipAction(clip);
  action.setLoop(THREE.LoopOnce, 1);
  action.clampWhenFinished = true;
  action.setEffectiveTimeScale(timeScale);
  action.play();
  return { root, mixer, action };
}

describe('MageVFX full spell architecture', () => {
  beforeEach(() => {
    vi.spyOn(THREE.TextureLoader.prototype, 'load').mockImplementation(() => new THREE.Texture());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('loads the generated PNG spell and soap-bubble textures for Mage VFX', () => {
    const scene = new THREE.Scene();
    const vfx = new MageVFX(scene, { quality: 'low' });
    const loadMock = vi.mocked(THREE.TextureLoader.prototype.load);
    const urls = loadMock.mock.calls.map(([url]) => String(url));

    expect(urls).toContain('/vfx/mage/arcane-charge.png');
    expect(urls).toContain('/vfx/mage/water-impact.png');
    expect(urls).toContain('/vfx/mage/lightning-charge.png');
    expect(urls).toContain('/vfx/mage/lava-impact.png');
    expect(urls).toContain('/vfx/mage/ice-impact.png');
    expect(urls).toContain('/vfx/mage/laser-charge.png');
    expect(urls).toContain('/vfx/mage/barrier-aura.png');
    expect(urls).toContain('/vfx/mage/barrier-film.png');
    expect(urls.some((url) => url.startsWith('/vfx/mage/') && url.endsWith('.svg'))).toBe(false);
    vfx.dispose();
  });

  it('keeps the Mage barrier transparent without enabling the expensive transmission pass', () => {
    const scene = new THREE.Scene();
    const vfx = new MageVFX(scene, { quality: 'low' });
    const { root, action } = createAction(0.4, 1);

    vfx.cast('ice', {
      caster: root,
      rightHand: null,
      leftHand: null,
      action,
      target: null,
      fallbackDirection: new THREE.Vector3(0, 0, 1),
    });

    const shell = scene.getObjectByName('MageSkillThinSoapBubbleFilm') as THREE.Mesh | undefined;
    expect(shell).toBeDefined();
    const material = shell?.material as THREE.MeshPhysicalMaterial;
    expect(material.transmission).toBe(0);
    expect(material.opacity).toBeLessThanOrEqual(0.12);
    vfx.dispose();
  });

  it('prewarms Mage VFX pools and compiles materials without leaving active effects', () => {
    const scene = new THREE.Scene();
    const vfx = new MageVFX(scene, { quality: 'low' });
    const renderer = {
      initTexture: vi.fn(),
      compile: vi.fn(),
    } as unknown as THREE.WebGLRenderer;

    vfx.warmUp(renderer, new THREE.PerspectiveCamera());

    const diagnostics = vfx.diagnostics();
    expect(renderer.initTexture).toHaveBeenCalled();
    expect(renderer.compile).toHaveBeenCalled();
    expect(diagnostics.activeCasts).toBe(0);
    expect(diagnostics.activeCharges).toBe(0);
    expect(diagnostics.activeProjectiles).toBe(0);
    expect(diagnostics.activeImpacts).toBe(0);
    expect(diagnostics.activeMagicCircles).toBe(0);
    expect(diagnostics.activeLasers).toBe(0);
    expect(diagnostics.activeBarriers).toBe(0);
    expect(diagnostics.activeWaterCharges).toBe(0);
    expect(diagnostics.activeWaterStrikes).toBe(0);
    expect(diagnostics.pooledCharges).toBeGreaterThan(0);
    expect(diagnostics.pooledProjectiles).toBeGreaterThan(0);
    expect(diagnostics.pooledImpacts).toBeGreaterThan(0);
    expect(diagnostics.pooledMagicCircles).toBeGreaterThan(0);
    expect(diagnostics.pooledLasers).toBeGreaterThan(0);
    expect(diagnostics.pooledBarriers).toBeGreaterThan(0);
    expect(diagnostics.pooledWaterCharges).toBeGreaterThan(0);
    expect(diagnostics.pooledWaterStrikes).toBeGreaterThan(0);
    // O impacto de chão das skills 1 (chão rachado) e 2 (gelo) também fica
    // pronto no carregamento: um decalque de cada estilo passa pelo forno e
    // nenhum sobra na cena.
    // Os dois desenhos de chão vão para a GPU no carregamento.
    const initializedTextures = (renderer.initTexture as unknown as {
      mock: { calls: Array<[THREE.Texture | undefined]> };
    }).mock.calls.map(([texture]) => texture?.name);
    expect(initializedTextures).toContain('MageGroundDecalCracked');
    expect(initializedTextures).toContain('MageGroundDecalFrozen');
    expect(diagnostics.activeGroundDecals).toBe(0);
    expect(diagnostics.pooledGroundDecals).toBeGreaterThanOrEqual(2);
    expect(scene.getObjectByName('MageGroundImpactDecal')).toBeUndefined();
    vfx.dispose();
  });

  it('keeps the Mage soap-bubble barrier alive for the one-second post-skill protection before it breaks', () => {
    const scene = new THREE.Scene();
    const vfx = new MageVFX(scene, { quality: 'low' });
    const { root, mixer, action } = createAction(0.4, 1);

    vfx.cast('ice', {
      caster: root,
      rightHand: null,
      leftHand: null,
      action,
      target: null,
      fallbackDirection: new THREE.Vector3(0, 0, 1),
    });
    expect(vfx.diagnostics().activeBarriers).toBe(1);

    for (let step = 0; step < 4; step += 1) {
      mixer.update(0.1);
      vfx.update(0.1);
    }
    expect(vfx.diagnostics().activeBarriers).toBe(1);

    vfx.update(0.8);
    expect(vfx.diagnostics().activeBarriers).toBe(1);

    vfx.update(0.35);
    expect(vfx.diagnostics().activeBarriers).toBe(1);

    vfx.update(0.35);
    expect(vfx.diagnostics().activeBarriers).toBe(0);
    vfx.dispose();
  });

  it('ergue a onda de cristais de gelo no disparo da skill 2 (e só nela)', () => {
    const scene = new THREE.Scene();
    const vfx = new MageVFX(scene, { quality: 'low' });
    const { root, mixer, action } = createAction(0.4, 1);
    const target = new THREE.Group();
    target.position.set(0, 0, 10);
    target.userData.enemyBodyScale = 1;

    vfx.cast('ice', {
      caster: root,
      rightHand: null,
      leftHand: null,
      action,
      target,
      fallbackDirection: new THREE.Vector3(0, 0, 1),
      isTargetAlive: () => true,
    });

    // Antes do launch nada de cristais (sincronia com a animação do cast).
    mixer.update(0.1);
    vfx.update(0.1);
    expect(scene.getObjectByName('MageIceCrystalWave')).toBeFalsy();

    // Depois do launch a onda existe, com cristais e rachaduras no chão.
    for (let step = 0; step < 3; step += 1) {
      mixer.update(0.1);
      vfx.update(0.1);
    }
    const wave = scene.getObjectByName('MageIceCrystalWave') as THREE.Group;
    expect(wave).toBeTruthy();
    const big = wave.getObjectByName('IceWaveBigShards') as THREE.InstancedMesh;
    expect(big.count).toBeGreaterThan(0);
    expect(wave.getObjectByName('IceWaveGroundFrost')).toBeTruthy();
    const fog = wave.getObjectByName('IceWaveFog') as THREE.InstancedMesh;
    expect(fog.count).toBeGreaterThan(0);
    // A linha nasce no pé da Maga, nunca na mão.
    expect(wave.position.y).toBeCloseTo(root.position.y, 5);

    // O efeito antigo saiu: o projétil voa invisível (só física) e o acerto
    // não desenha a explosão antiga — o cristal-herói da onda é o impacto.
    expect(vfx.diagnostics().activeProjectiles).toBe(1);
    const bolt = scene.getObjectByName('MageProjectileVFX');
    expect(bolt).toBeTruthy();
    expect(bolt?.visible).toBe(false);
    for (let step = 0; step < 5; step += 1) {
      mixer.update(0.1);
      vfx.update(0.1);
    }
    expect(vfx.diagnostics().activeProjectiles).toBe(0);
    expect(vfx.diagnostics().activeImpacts).toBe(0);
    expect(scene.getObjectByName('MageImpactVFX')).toBeFalsy();

    // clear() (fim de partida/troca de cena) remove a onda imediatamente.
    vfx.clear();
    expect(scene.getObjectByName('MageIceCrystalWave')).toBeFalsy();

    // Nenhuma outra skill ergue cristais de gelo.
    const lava = createAction(0.4, 1);
    vfx.cast('lava', {
      caster: lava.root,
      rightHand: null,
      leftHand: null,
      action: lava.action,
      target: null,
      fallbackDirection: new THREE.Vector3(0, 0, 1),
    });
    for (let step = 0; step < 4; step += 1) {
      lava.mixer.update(0.1);
      vfx.update(0.1);
    }
    expect(scene.getObjectByName('MageIceCrystalWave')).toBeFalsy();
    vfx.dispose();
  });

  it('launches every Mage spell preset through the AnimationAction timeline and pooled managers', () => {
    const spells: readonly MageSpellId[] = ['basic', 'water', 'lightning', 'lava', 'ice', 'laser'];
    for (const spellId of spells) {
      const scene = new THREE.Scene();
      const vfx = new MageVFX(scene, { quality: 'low' });
      const { root, mixer, action } = createAction(2, 1.5);
      const rightHand = new THREE.Object3D();
      const leftHand = new THREE.Object3D();
      rightHand.name = 'mixamorig:RightHand';
      leftHand.name = 'mixamorig:LeftHand';
      root.add(rightHand, leftHand);
      const target = new THREE.Group();
      target.position.set(0, 0, 5);
      target.userData.enemyBodyScale = 1;

      let impacts = 0;
      vfx.cast(spellId, {
        caster: root,
        rightHand,
        leftHand,
        action,
        target,
        fallbackDirection: new THREE.Vector3(0, 0, 1),
        isTargetAlive: () => true,
        onImpact: () => { impacts += 1; },
      });

      for (let step = 0; step < 20; step += 1) {
        mixer.update(0.08);
        vfx.update(0.08);
      }

      const diagnostics = vfx.diagnostics();
      if (spellId === 'lightning') {
        expect(impacts).toBeGreaterThan(0);
      } else if (spellId === 'water') {
        expect(diagnostics.activeWaterCharges + diagnostics.pooledWaterCharges).toBeGreaterThan(0);
        expect(diagnostics.activeWaterStrikes + diagnostics.pooledWaterStrikes).toBeGreaterThan(0);
        expect(diagnostics.activeProjectiles + diagnostics.pooledProjectiles).toBe(0);
        expect(diagnostics.activeBarriers + diagnostics.pooledBarriers).toBe(0);
        expect(impacts).toBe(1);
      } else if (spellId === 'laser') {
        expect(diagnostics.activeLasers + diagnostics.pooledLasers).toBeGreaterThan(0);
        expect(impacts).toBeGreaterThan(0);
      } else {
        expect(diagnostics.activeProjectiles + diagnostics.pooledProjectiles).toBeGreaterThan(0);
      }
      if (spellId !== 'basic' && spellId !== 'water') {
        expect(diagnostics.activeBarriers + diagnostics.pooledBarriers).toBeGreaterThan(0);
      }
      expect(diagnostics.activeCharges).toBeLessThanOrEqual(1);
      vfx.dispose();
    }
  });

  it('clears pooled spell objects and leaves no active effects after repeated casts', () => {
    const scene = new THREE.Scene();
    const vfx = new MageVFX(scene, { quality: 'low' });
    const target = new THREE.Group();
    target.position.set(0, 0, 4);
    target.userData.enemyBodyScale = 1;

    for (const spellId of ['basic', 'water', 'lightning', 'lava', 'ice', 'laser'] as const) {
      const { root, mixer, action } = createAction(2, 0.7);
      const rightHand = new THREE.Object3D();
      const leftHand = new THREE.Object3D();
      root.add(rightHand, leftHand);
      vfx.cast(spellId, {
        caster: root,
        rightHand,
        leftHand,
        action,
        target,
        fallbackDirection: new THREE.Vector3(0, 0, 1),
        isTargetAlive: () => true,
      });
      for (let step = 0; step < 50; step += 1) {
        mixer.update(0.1);
        vfx.update(0.1);
      }
    }

    vfx.clear();
    const diagnostics = vfx.diagnostics();
    expect(diagnostics.activeCasts).toBe(0);
    expect(diagnostics.activeCharges).toBe(0);
    expect(diagnostics.activeProjectiles).toBe(0);
    expect(diagnostics.activeImpacts).toBe(0);
    expect(diagnostics.activeMagicCircles).toBe(0);
    expect(diagnostics.activeLasers).toBe(0);
    expect(diagnostics.activeBarriers).toBe(0);
    expect(diagnostics.activeWaterCharges).toBe(0);
    expect(diagnostics.activeWaterStrikes).toBe(0);
    vfx.dispose();
  });

  it('fires onLaunch once when the spell leaves the hand, before any impact', () => {
    const scene = new THREE.Scene();
    const vfx = new MageVFX(scene, { quality: 'low' });
    const { root, mixer, action } = createAction(2, 1);
    const target = new THREE.Group();
    target.position.set(0, 0, 5);
    target.userData.enemyBodyScale = 1;

    let launches = 0;
    let impacts = 0;
    vfx.cast('lightning', {
      caster: root,
      rightHand: null,
      leftHand: null,
      action,
      target,
      fallbackDirection: new THREE.Vector3(0, 0, 1),
      isTargetAlive: () => true,
      onLaunch: () => {
        launches += 1;
        expect(impacts).toBe(0);
      },
      onImpact: () => { impacts += 1; },
    });

    for (let step = 0; step < 30; step += 1) {
      mixer.update(0.08);
      vfx.update(0.08);
    }

    expect(launches).toBe(1);
    expect(impacts).toBeGreaterThan(0);
    vfx.dispose();
  });
});
