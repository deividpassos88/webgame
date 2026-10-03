import * as THREE from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MageVFX } from './MageVFX';
import { ImpactVFX } from './ImpactVFX';
import { ProjectileManager } from './ProjectileManager';
import { MageVFXResources } from './MageVFXResources';
import { VFXLightPool } from './VFXLightPool';
import { MAGE_SPELL_PRESETS } from './VFXConfig';
import type { MageSpellPreset } from './VFXTypes';

function createAction(duration = 3): { root: THREE.Group; mixer: THREE.AnimationMixer; action: THREE.AnimationAction } {
  const root = new THREE.Group();
  const mixer = new THREE.AnimationMixer(root);
  const clip = new THREE.AnimationClip('mage basic attack', duration, [
    new THREE.NumberKeyframeTrack('.visible', [0, duration], [1, 1]),
  ]);
  const action = mixer.clipAction(clip);
  action.setLoop(THREE.LoopOnce, 1);
  action.clampWhenFinished = true;
  action.play();
  return { root, mixer, action };
}

/** Fires one bolt straight ahead and returns the pooled projectile group. */
function fireBasicArrow(manager: ProjectileManager, preset: MageSpellPreset): void {
  manager.fire({
    preset,
    origin: new THREE.Vector3(0, 1, 0),
    direction: new THREE.Vector3(0, 0, 1),
    target: null,
    onImpact: () => undefined,
  });
}

function arrowPart(scene: THREE.Scene, name: string): THREE.Mesh {
  const part = scene.getObjectByName(name) as THREE.Mesh | undefined;
  expect(part).toBeDefined();
  return part!;
}

/** Runs the caster clip and the VFX together until `seconds` have elapsed. */
function advance(
  vfx: MageVFX,
  mixer: THREE.AnimationMixer,
  seconds: number,
  step = 0.02
): void {
  for (let elapsed = 0; elapsed < seconds; elapsed += step) {
    mixer.update(step);
    vfx.update(step);
  }
}

describe('Mage basic attack — rune arrow look', () => {
  beforeEach(() => {
    vi.spyOn(THREE.TextureLoader.prototype, 'load').mockImplementation(() => new THREE.Texture());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('ships a stronger basic preset than the plain arcane orb it replaces', () => {
    const basic = MAGE_SPELL_PRESETS.basic;

    // O básico virou uma "flecha mágica": dardo + aletas rúnicas.
    expect(basic.projectile.arrow).toBeDefined();
    expect(basic.projectile.arrow?.length).toBeGreaterThanOrEqual(2.5);
    expect(basic.projectile.arrow?.finSpin).toBeGreaterThan(0);
    // Rastro mais longo e impacto com assinatura rúnica.
    expect(basic.projectile.trailLength).toBeGreaterThan(1.3);
    expect(basic.impact.runeSigil).toBeDefined();
    expect(basic.impact.runeSigil?.radius).toBeGreaterThan(1.5);
    expect(basic.impact.particleCount).toBeGreaterThan(60);
    expect(basic.impact.shockwaveRadius).toBeGreaterThan(2);
    expect(basic.charge.sparkCount).toBeGreaterThan(10);
    // Camadas de assinatura do impacto.
    expect(basic.impact.runeSigil?.groundStamp).toBe(true);
    expect(basic.impact.pillar?.height).toBeGreaterThan(2);
    expect(basic.impact.spikes?.count).toBeGreaterThanOrEqual(6);
    expect(basic.impact.lightIntensity).toBeGreaterThan(1.5);
  });

  it('keeps the rune arrow layers off for the other spells', () => {
    const scene = new THREE.Scene();
    const resources = new MageVFXResources();
    const manager = new ProjectileManager(scene, resources, 'high', new VFXLightPool(scene, 4));

    fireBasicArrow(manager, MAGE_SPELL_PRESETS.water);

    expect(arrowPart(scene, 'MageBasicArrowSpearhead').visible).toBe(false);
    expect(arrowPart(scene, 'MageBasicArrowRuneFinInner').visible).toBe(false);
    expect(arrowPart(scene, 'MageBasicArrowRuneFinOuter').visible).toBe(false);
    manager.dispose();
    resources.dispose();
  });

  it('shows the dart and the spinning rune fins while the basic bolt flies', () => {
    const scene = new THREE.Scene();
    const resources = new MageVFXResources();
    const manager = new ProjectileManager(scene, resources, 'high', new VFXLightPool(scene, 4));

    fireBasicArrow(manager, MAGE_SPELL_PRESETS.basic);

    const spearhead = arrowPart(scene, 'MageBasicArrowSpearhead');
    const innerFin = arrowPart(scene, 'MageBasicArrowRuneFinInner');
    const outerFin = arrowPart(scene, 'MageBasicArrowRuneFinOuter');

    expect(spearhead.visible).toBe(true);
    expect(innerFin.visible).toBe(true);
    expect(outerFin.visible).toBe(true);
    // O dardo é alongado no sentido do voo (escala maior em Y que em X/Z).
    expect(spearhead.scale.y).toBeGreaterThan(spearhead.scale.x);

    manager.update(0.016);
    const innerRotation = innerFin.rotation.z;
    const outerRotation = outerFin.rotation.z;
    for (let step = 0; step < 5; step += 1) manager.update(0.016);

    // As duas aletas giram em sentidos opostos.
    const innerDelta = innerFin.rotation.z - innerRotation;
    const outerDelta = outerFin.rotation.z - outerRotation;
    expect(Math.abs(innerDelta)).toBeGreaterThan(0);
    expect(Math.abs(outerDelta)).toBeGreaterThan(0);
    expect(Math.sign(innerDelta)).toBe(-Math.sign(outerDelta));
    manager.dispose();
    resources.dispose();
  });

  it('stamps the rune sigil on the ground for the basic impact only', () => {
    const scene = new THREE.Scene();
    const resources = new MageVFXResources();
    const impacts = new ImpactVFX(scene, resources, 'high', new VFXLightPool(scene, 4));
    const position = new THREE.Vector3(0, 0, 0);

    impacts.play({ preset: MAGE_SPELL_PRESETS.basic, position });
    impacts.update(0.06);

    const outer = scene.getObjectByName('MageImpactRuneSigilOuter') as THREE.Mesh | undefined;
    const inner = scene.getObjectByName('MageImpactRuneSigilInner') as THREE.Mesh | undefined;
    expect(outer?.visible).toBe(true);
    expect(inner?.visible).toBe(true);
    // Deitado no chão, logo acima do piso.
    expect(outer?.rotation.x).toBeCloseTo(-Math.PI / 2);
    expect(outer?.position.y).toBeGreaterThan(0);
    expect(outer?.position.y).toBeLessThan(0.2);
    const firstScale = outer!.scale.x;
    impacts.update(0.12);
    expect(outer!.scale.x).toBeGreaterThan(firstScale);

    impacts.play({ preset: MAGE_SPELL_PRESETS.water, position });
    impacts.update(0.02);
    // O impacto da água não traz sigilo: as camadas do NOVO grupo ficam ocultas.
    const waterGroup = scene.children[scene.children.length - 1];
    const waterSigils = waterGroup.children.filter((child) => child.name.startsWith('MageImpactRuneSigil'));
    expect(waterSigils.length).toBe(2);
    expect(waterSigils.every((sigil) => !sigil.visible)).toBe(true);

    impacts.dispose();
    resources.dispose();
  });

  it('stamps the sigil on the floor under the target, not at chest height', () => {
    const scene = new THREE.Scene();
    const resources = new MageVFXResources();
    const impacts = new ImpactVFX(scene, resources, 'high', new VFXLightPool(scene, 4));

    // O impacto de um feitiço acontece na altura do peito (~1 m).
    impacts.play({ preset: MAGE_SPELL_PRESETS.basic, position: new THREE.Vector3(0, 1.02, -6) });
    impacts.update(0.04);

    const outer = scene.getObjectByName('MageImpactRuneSigilOuter') as THREE.Mesh | undefined;
    expect(outer?.visible).toBe(true);
    // Local + posição do grupo = praticamente no chão.
    const worldY = (outer?.position.y ?? 0) + 1.02;
    expect(worldY).toBeGreaterThan(0);
    expect(worldY).toBeLessThan(0.15);

    impacts.dispose();
    resources.dispose();
  });

  it('fires the light pillar and the rune spikes on the target impact', () => {
    const scene = new THREE.Scene();
    const resources = new MageVFXResources();
    const impacts = new ImpactVFX(scene, resources, 'high', new VFXLightPool(scene, 4));

    impacts.play({ preset: MAGE_SPELL_PRESETS.basic, position: new THREE.Vector3(0, 1, -6) });
    impacts.update(0.05);

    const pillar = scene.getObjectByName('MageImpactLightPillar') as THREE.Mesh | undefined;
    expect(pillar?.visible).toBe(true);
    expect((pillar?.material as THREE.MeshBasicMaterial).opacity).toBeGreaterThan(0);
    const spikes = scene.children
      .flatMap((group) => group.children)
      .filter((child) => child.name === 'MageImpactRuneSpike' && child.visible);
    expect(spikes.length).toBe(MAGE_SPELL_PRESETS.basic.impact.spikes?.count);
    expect(spikes.every((spike) => (spike as THREE.Mesh).scale.y > 0)).toBe(true);

    // O clarão de disparo na mão não carimba selo, coluna nem estilhaços.
    impacts.play({
      preset: MAGE_SPELL_PRESETS.basic,
      position: new THREE.Vector3(0.7, 2, 2.4),
      scale: 0.35,
      muzzleFlash: true,
    });
    impacts.update(0.02);
    const muzzleGroup = scene.children[scene.children.length - 1];
    expect(
      muzzleGroup.children.filter((child) => child.name === 'MageImpactRuneSpike' && child.visible).length
    ).toBe(0);
    const muzzleSigils = muzzleGroup.children.filter(
      (child) => child.name.startsWith('MageImpactRuneSigil') && child.visible
    );
    expect(muzzleSigils.length).toBe(0);
    expect((muzzleGroup.children.find((c) => c.name === 'MageImpactLightPillar') as THREE.Mesh).visible).toBe(false);

    impacts.dispose();
    resources.dispose();
  });

  it('keeps the basic spell a single-target bolt: no area damage is added', () => {
    const basic = MAGE_SPELL_PRESETS.basic;
    // Nada no upgrade do básico deve virar AoE: o ganho é visual.
    expect(basic.delivery).toBe('projectile');
    expect(basic.impact.debrisCount).toBe(0);
    expect(basic.hand).toBe('right');
  });
});
