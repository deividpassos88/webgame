import * as THREE from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MageVFX } from './MageVFX';
import { ImpactVFX } from './ImpactVFX';
import { ProjectileManager } from './ProjectileManager';
import { MageVFXResources } from './MageVFXResources';
import { VFXLightPool } from './VFXLightPool';
import { MAGE_SPELL_PRESETS } from './VFXConfig';
import { configureEnergyMaterial } from './VFXMaterials';

function createAction(): { root: THREE.Group; mixer: THREE.AnimationMixer; action: THREE.AnimationAction } {
  const root = new THREE.Group();
  const mixer = new THREE.AnimationMixer(root);
  const duration = 3;
  const clip = new THREE.AnimationClip('mage basic attack', duration, [
    new THREE.NumberKeyframeTrack('.visible', [0, duration], [1, 1]),
  ]);
  const action = mixer.clipAction(clip);
  action.setLoop(THREE.LoopOnce, 1);
  action.clampWhenFinished = true;
  action.play();
  return { root, mixer, action };
}

/** Dispara um cometa reto para a frente e devolve o grupo do projétil. */
function fireComet(manager: ProjectileManager, preset = MAGE_SPELL_PRESETS.basic): void {
  manager.fire({
    preset,
    origin: new THREE.Vector3(0, 1, 0),
    direction: new THREE.Vector3(0, 0, 1),
    target: null,
    onImpact: () => undefined,
  });
}

function part(scene: THREE.Scene, name: string): THREE.Mesh | THREE.Sprite {
  const found = scene.getObjectByName(name) as THREE.Mesh | THREE.Sprite | undefined;
  expect(found).toBeDefined();
  return found!;
}

/** Roda o clip do conjurador e o VFX juntos até somar `seconds`. */
function advance(vfx: MageVFX, mixer: THREE.AnimationMixer, seconds: number, step = 0.02): void {
  for (let elapsed = 0; elapsed < seconds; elapsed += step) {
    mixer.update(step);
    vfx.update(step);
  }
}

/** Canais em espaço linear (o three.js converte sRGB -> linear em `Color.set`). */
function channels(hex: THREE.ColorRepresentation): { r: number; g: number; b: number } {
  const color = new THREE.Color(hex);
  return { r: color.r, g: color.g, b: color.b };
}

describe('Maga — ataque básico de cometa', () => {
  beforeEach(() => {
    vi.spyOn(THREE.TextureLoader.prototype, 'load').mockImplementation(() => new THREE.Texture());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('burns in the comet palette: white-hot core, orange body, red tail', () => {
    const colors = MAGE_SPELL_PRESETS.basic.colors;

    const glow = channels(colors.glow);
    // Laranja vivo: vermelho alto, verde médio, azul baixo.
    expect(glow.r).toBeGreaterThan(0.85);
    expect(glow.g).toBeGreaterThan(0.15);
    expect(glow.g).toBeLessThan(glow.r);
    expect(glow.b).toBeLessThan(glow.g * 0.5);

    const secondary = channels(colors.secondary);
    // Ponta vermelha do rastro.
    expect(secondary.r).toBeGreaterThan(0.6);
    expect(secondary.b).toBeLessThan(secondary.r * 0.25);

    const core = channels(colors.core);
    // Núcleo branco-quente, com viés amarelo (não branco frio).
    expect(core.r).toBeGreaterThan(0.9);
    expect(core.g).toBeGreaterThan(0.8);
    expect(core.b).toBeLessThan(core.g);

    const spark = channels(colors.spark);
    expect(spark.r).toBeGreaterThan(0.9);
    expect(spark.b).toBeLessThan(spark.g * 0.6);

    // Nada de plasma azul sobrou.
    expect(colors.glow).not.toBe(0x3d9bff);
    expect(channels(colors.glow).b).toBeLessThan(channels(colors.glow).g);
  });

  it('conjures fast: the comet leaves the hand in the first fifth of the cast', () => {
    const basic = MAGE_SPELL_PRESETS.basic;

    expect(basic.timeline.chargeStart).toBeLessThanOrEqual(0.05);
    expect(basic.timeline.launch).toBeLessThanOrEqual(0.2);
    expect(basic.timeline.chargeEnd).toBeLessThanOrEqual(0.25);
    expect(basic.projectile.speed).toBeGreaterThanOrEqual(22);
    expect(basic.impact.duration).toBeLessThanOrEqual(0.65);
    // A carga continua sendo um acender na mão, não um sol.
    expect(basic.charge.scale).toBeLessThanOrEqual(0.8);
    expect(basic.muzzle?.scale).toBeLessThan(0.35);
  });

  it('ships the comet shape: stretched head, long ember tail and smoke ribbon', () => {
    const basic = MAGE_SPELL_PRESETS.basic;
    const comet = basic.projectile.comet;

    expect(comet).toBeDefined();
    // Cabeça bem alongada no sentido do voo (o raio é o diâmetro do cometa).
    expect(comet?.headStretch).toBeGreaterThan(2);
    // Cauda comprida e faixa de fumaça larga.
    expect(comet?.tailLength).toBeGreaterThan(1.2);
    expect(comet?.smokeWidth).toBeGreaterThan(0.3);
    // Brasas soltas no rastro de verdade (não uma ou duas).
    expect(comet?.emberCount).toBeGreaterThanOrEqual(6);
    expect(comet?.emberSize).toBeLessThan(1);
    expect(basic.projectile.trailLength * (comet?.tailLength ?? 1)).toBeGreaterThan(3);

    // O dardo rúnico e o plasma azul saíram de vez.
    expect('arrow' in basic.projectile).toBe(false);
    expect('plasma' in basic.projectile).toBe(false);
  });

  it('keeps the full signature impact and the fire look without area damage', () => {
    const basic = MAGE_SPELL_PRESETS.basic;

    expect(basic.style).toBe('lava');
    expect(basic.impact.runeSigil?.groundStamp).toBe(true);
    expect(basic.impact.pillar?.height).toBeGreaterThan(2);
    expect(basic.impact.spikes?.count).toBeGreaterThanOrEqual(6);
    expect(basic.impact.jets?.count).toBeGreaterThanOrEqual(6);
    expect(basic.impact.lightIntensity).toBeGreaterThan(1.5);
    expect(basic.impact.particleCount).toBeGreaterThan(60);
    // Continua um golpe único, sem AoE.
    expect(basic.delivery).toBe('projectile');
    expect(basic.hand).toBe('right');
  });

  it('draws the stretched head, the hot trail and the smoke ribbon', () => {
    const scene = new THREE.Scene();
    const resources = new MageVFXResources();
    const manager = new ProjectileManager(scene, resources, 'high', new VFXLightPool(scene, 4));

    fireComet(manager);

    const core = part(scene, 'MageProjectileCore');
    const trail = part(scene, 'MageProjectileRibbonTrail');
    const smoke = part(scene, 'MageProjectileSmokeTrail');
    expect(trail.visible).toBe(true);
    expect(smoke.visible).toBe(true);
    // Cabeça esticada no eixo do voo (+Z local).
    expect(core.scale.z).toBeGreaterThan(core.scale.x * 2);
    expect(core.scale.z).toBeGreaterThan(core.scale.y * 2);
    // A fumaça é mais larga que o rastro quente.
    const hotMaterial = trail.material as THREE.ShaderMaterial;
    const smokeMaterial = smoke.material as THREE.ShaderMaterial;
    expect(smokeMaterial.uniforms.uThickness.value)
      .toBeGreaterThan(hotMaterial.uniforms.uThickness.value);
    expect(smokeMaterial.uniforms.uOpacity.value).toBeGreaterThan(0);

    // A fita de fumaça realmente ganha geometria (não fica degenerada em 0).
    manager.update(0.05);
    const positions = smoke.geometry.getAttribute('position') as THREE.BufferAttribute;
    let maxAbs = 0;
    for (let index = 0; index < positions.count; index += 1) {
      maxAbs = Math.max(maxAbs, Math.abs(positions.getZ(index)));
    }
    expect(maxAbs).toBeGreaterThan(1);

    manager.dispose();
    resources.dispose();
  });

  it('streams embers behind the comet', () => {
    const scene = new THREE.Scene();
    const resources = new MageVFXResources();
    const manager = new ProjectileManager(scene, resources, 'high', new VFXLightPool(scene, 4));

    fireComet(manager);
    manager.update(0.05);

    const embers = scene.getObjectByName('MageProjectileSecondaryWake') as THREE.Points | undefined
      ?? (scene.getObjectByName('MageProjectileVFX')?.children.find(
        (child) => child instanceof THREE.Points && child.geometry.getAttribute('aSize')
      ) as THREE.Points | undefined);
    expect(embers).toBeDefined();
    const sizes = embers!.geometry.getAttribute('aSize') as THREE.BufferAttribute;
    const colors = (embers!.material as THREE.ShaderMaterial).uniforms.uColor.value as THREE.Color;
    // Brasas pequenas e douradas.
    expect(sizes.getX(0)).toBeLessThan(26);
    expect(colors.r).toBeGreaterThan(colors.b);
    expect(embers!.visible).toBe(true);

    manager.dispose();
    resources.dispose();
  });

  it('keeps the comet layers off for the other spells', () => {
    const scene = new THREE.Scene();
    const resources = new MageVFXResources();
    const manager = new ProjectileManager(scene, resources, 'high', new VFXLightPool(scene, 4));

    fireComet(manager, MAGE_SPELL_PRESETS.water);

    const smoke = part(scene, 'MageProjectileSmokeTrail');
    expect((smoke.material as THREE.ShaderMaterial).uniforms.uOpacity.value).toBe(0);
    expect((part(scene, 'MageProjectileCore') as THREE.Mesh).scale.z)
      .toBeCloseTo((part(scene, 'MageProjectileCore') as THREE.Mesh).scale.x, 5);

    manager.dispose();
    resources.dispose();
  });

  it('still supports an explicit energy ribbon without the comet extras', () => {
    const scene = new THREE.Scene();
    const resources = new MageVFXResources();
    const manager = new ProjectileManager(scene, resources, 'high', new VFXLightPool(scene, 4));
    const plain = {
      ...MAGE_SPELL_PRESETS.basic,
      projectile: { ...MAGE_SPELL_PRESETS.basic.projectile, comet: undefined },
    };

    fireComet(manager, plain);

    expect((part(scene, 'MageProjectileSmokeTrail').material as THREE.ShaderMaterial)
      .uniforms.uOpacity.value).toBe(0);
    expect((part(scene, 'MageProjectileRibbonTrail') as THREE.Mesh).visible).toBe(true);

    manager.dispose();
    resources.dispose();
  });

  it('stamps the molten sigil on the floor under the target, not at chest height', () => {
    const scene = new THREE.Scene();
    const resources = new MageVFXResources();
    const impacts = new ImpactVFX(scene, resources, 'high', new VFXLightPool(scene, 4));

    // O impacto de um feitiço acontece na altura do peito (~1 m).
    impacts.play({ preset: MAGE_SPELL_PRESETS.basic, position: new THREE.Vector3(0, 1.02, -6) });
    impacts.update(0.04);

    const outer = scene.getObjectByName('MageImpactRuneSigilOuter') as THREE.Mesh | undefined;
    expect(outer?.visible).toBe(true);
    expect(outer?.rotation.x).toBeCloseTo(-Math.PI / 2);
    const worldY = (outer?.position.y ?? 0) + 1.02;
    expect(worldY).toBeGreaterThan(0);
    expect(worldY).toBeLessThan(0.15);

    impacts.dispose();
    resources.dispose();
  });

  it('fires the fire pillar, the star spikes and the plasma jets on impact', () => {
    const scene = new THREE.Scene();
    const resources = new MageVFXResources();
    const impacts = new ImpactVFX(scene, resources, 'high', new VFXLightPool(scene, 4));

    impacts.play({ preset: MAGE_SPELL_PRESETS.basic, position: new THREE.Vector3(0, 1, -6) });
    impacts.update(0.05);

    const group = scene.children[scene.children.length - 1];
    const pillar = scene.getObjectByName('MageImpactLightPillar') as THREE.Mesh | undefined;
    expect(pillar?.visible).toBe(true);
    expect((pillar?.material as THREE.MeshBasicMaterial).opacity).toBeGreaterThan(0);
    // A coluna do impacto usa a cor do corpo do cometa (laranja), não azul.
    const pillarColor = (pillar?.material as THREE.MeshBasicMaterial).color;
    expect(pillarColor.r).toBeGreaterThan(pillarColor.b);
    expect(
      group.children.filter((child) => child.name === 'MageImpactRuneSpike' && child.visible).length
    ).toBe(MAGE_SPELL_PRESETS.basic.impact.spikes?.count);
    const jets = group.children.filter(
      (child) => child.name === 'MageImpactPlasmaJet' && child.visible
    ) as THREE.Sprite[];
    expect(jets.length).toBe(MAGE_SPELL_PRESETS.basic.impact.jets?.count);
    const jetColor = (jets[0].material as THREE.SpriteMaterial).color;
    expect(jetColor.r).toBeGreaterThan(jetColor.b);

    impacts.dispose();
    resources.dispose();
  });

  it('rips the jets outwards and fades them fast', () => {
    const scene = new THREE.Scene();
    const resources = new MageVFXResources();
    const impacts = new ImpactVFX(scene, resources, 'high', new VFXLightPool(scene, 4));

    impacts.play({ preset: MAGE_SPELL_PRESETS.basic, position: new THREE.Vector3(0, 1, -6) });
    impacts.update(0.02);

    const group = scene.children[scene.children.length - 1];
    const jets = group.children.filter(
      (child) => child.name === 'MageImpactPlasmaJet' && child.visible
    ) as THREE.Sprite[];
    const initialDistance = jets[0].position.length();
    const initialOpacity = (jets[0].material as THREE.SpriteMaterial).opacity;

    impacts.update(0.12);
    expect(jets[0].position.length()).toBeGreaterThan(initialDistance);
    expect((jets[0].material as THREE.SpriteMaterial).opacity).toBeLessThan(initialOpacity);

    impacts.update(0.3);
    expect(
      group.children.filter((child) => child.name === 'MageImpactPlasmaJet' && child.visible).length
    ).toBe(0);

    impacts.dispose();
    resources.dispose();
  });

  it('keeps the muzzle flash free of the signature impact layers', () => {
    const scene = new THREE.Scene();
    const resources = new MageVFXResources();
    const impacts = new ImpactVFX(scene, resources, 'high', new VFXLightPool(scene, 4));

    impacts.play({
      preset: MAGE_SPELL_PRESETS.basic,
      position: new THREE.Vector3(0.7, 2, 2.4),
      scale: 0.22,
      muzzleFlash: true,
    });
    impacts.update(0.02);

    const muzzleGroup = scene.children[scene.children.length - 1];
    expect(
      muzzleGroup.children.filter((child) => child.name === 'MageImpactRuneSpike' && child.visible).length
    ).toBe(0);
    expect(
      muzzleGroup.children.filter((child) => child.name === 'MageImpactPlasmaJet' && child.visible).length
    ).toBe(0);
    expect(
      muzzleGroup.children.filter((child) => child.name.startsWith('MageImpactRuneSigil') && child.visible)
        .length
    ).toBe(0);
    expect(
      (muzzleGroup.children.find((child) => child.name === 'MageImpactLightPillar') as THREE.Mesh).visible
    ).toBe(false);

    impacts.dispose();
    resources.dispose();
  });

  it('launches the comet from the Mage hand on the basic cast', () => {
    const { root, mixer, action } = createAction();
    const scene = new THREE.Scene();
    const vfx = new MageVFX(scene, { quality: 'high' });
    const hand = new THREE.Object3D();
    hand.position.set(0.6, 1.4, 0);
    root.add(hand);

    vfx.cast('basic', {
      caster: root,
      action,
      rightHand: hand,
      leftHand: null,
      target: null,
      fallbackDirection: new THREE.Vector3(0, 0, 1),
      isTargetAlive: () => true,
    });

    advance(vfx, mixer, 0.6);
    const smoke = scene.getObjectByName('MageProjectileSmokeTrail') as THREE.Mesh | undefined;
    expect(smoke?.visible).toBe(true);

    vfx.dispose();
  });

  it('exposes fire shader colors on the hot trail material', () => {
    const material = { uniforms: {
      uColorA: { value: new THREE.Color(0x000000) },
      uColorB: { value: new THREE.Color(0x000000) },
    } } as unknown as Parameters<typeof configureEnergyMaterial>[0];
    configureEnergyMaterial(material, { colorA: 0xfff6e2, colorB: 0xe2301a });

    expect(material.uniforms.uColorA.value.r).toBeGreaterThan(material.uniforms.uColorA.value.b);
    expect(material.uniforms.uColorB.value.r).toBeGreaterThan(material.uniforms.uColorB.value.g);
  });
});
