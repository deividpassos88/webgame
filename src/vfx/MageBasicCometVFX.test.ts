import * as THREE from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MageVFX } from './MageVFX';
import { ImpactVFX } from './ImpactVFX';
import { ProjectileManager } from './ProjectileManager';
import { MageVFXResources } from './MageVFXResources';
import { VFXLightPool } from './VFXLightPool';
import { MAGE_SPELL_PRESETS } from './VFXConfig';
import { MAGE_SPELL_TRAVEL_METERS } from '../combat/MageSpellFlight';

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

/** Dispara a bola de fogo reto para a frente. */
function fireComet(
  manager: ProjectileManager,
  options: { preset?: typeof MAGE_SPELL_PRESETS.basic; target?: THREE.Object3D | null; onImpact?: () => void } = {}
): void {
  manager.fire({
    preset: options.preset ?? MAGE_SPELL_PRESETS.basic,
    origin: new THREE.Vector3(0, 1, 0),
    direction: new THREE.Vector3(0, 0, 1),
    target: options.target ?? null,
    onImpact: options.onImpact ?? (() => undefined),
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

describe('Maga — ataque básico de bola de fogo', () => {
  beforeEach(() => {
    vi.spyOn(THREE.TextureLoader.prototype, 'load').mockImplementation(() => new THREE.Texture());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('burns in the reference palette: yellow-white head, orange body, red tail', () => {
    const colors = MAGE_SPELL_PRESETS.basic.colors;

    // Cabeça amarela: vermelho e verde altos (amarelo) e azul baixo.
    const core = channels(colors.core);
    expect(core.r).toBeGreaterThan(0.9);
    expect(core.g).toBeGreaterThan(0.85);
    expect(core.b).toBeLessThan(core.g * 0.9);

    // Corpo laranja vivo.
    const glow = channels(colors.glow);
    expect(glow.r).toBeGreaterThan(0.9);
    expect(glow.g).toBeGreaterThan(0.25);
    expect(glow.g).toBeLessThan(glow.r * 0.75);
    expect(glow.b).toBeLessThan(glow.g * 0.35);

    // Calda vermelha funda.
    const secondary = channels(colors.secondary);
    expect(secondary.r).toBeGreaterThan(0.5);
    expect(secondary.g).toBeLessThan(secondary.r * 0.3);
    expect(secondary.b).toBeLessThan(secondary.r * 0.2);

    // Brasas douradas.
    const spark = channels(colors.spark);
    expect(spark.r).toBeGreaterThan(0.9);
    expect(spark.g).toBeGreaterThan(0.4);
    expect(spark.b).toBeLessThan(spark.g * 0.5);

    // Nada de azul restou (nem plasma, nem arcano).
    for (const key of ['core', 'glow', 'secondary', 'spark'] as const) {
      const { r, g, b } = channels(colors[key]);
      expect(b).toBeLessThan(g);
      expect(b).toBeLessThan(r);
    }
  });

  it('travels at a warrior-like pace instead of zipping across the screen', () => {
    const basic = MAGE_SPELL_PRESETS.basic;

    // Nada de raio: uma bola de fogo que dá para acompanhar.
    expect(basic.projectile.speed).toBeLessThanOrEqual(16);
    expect(basic.projectile.speed).toBeGreaterThanOrEqual(10);
    // Tempo de viagem até o alcance máximo, perto do compasso do golpe do
    // Guerreiro (o ataque de espada leva ~0,9 s).
    const travelSeconds = MAGE_SPELL_TRAVEL_METERS / basic.projectile.speed;
    expect(travelSeconds).toBeGreaterThan(0.45);
    expect(travelSeconds).toBeLessThan(0.85);
    // E o disparo também não é instantâneo.
    expect(basic.timeline.launch).toBeGreaterThanOrEqual(0.15);
  });

  it('ships the comet shape: stretched head, long ember tail and smoke ribbon', () => {
    const basic = MAGE_SPELL_PRESETS.basic;
    const comet = basic.projectile.comet;

    expect(comet).toBeDefined();
    expect(comet?.headStretch).toBeGreaterThan(2);
    expect(comet?.tailLength).toBeGreaterThan(1.2);
    expect(comet?.smokeWidth).toBeGreaterThan(0.4);
    expect(comet?.emberCount).toBeGreaterThanOrEqual(10);
    expect(comet?.emberSize).toBeLessThan(1);
    expect(basic.projectile.trailLength * (comet?.tailLength ?? 1)).toBeGreaterThan(3.5);
    // Sem dardo, sem plasma: o básico é fogo.
    expect('arrow' in basic.projectile).toBe(false);
    expect('plasma' in basic.projectile).toBe(false);
    expect(basic.style).toBe('lava');
  });

  it('has a fire impact with no circle on the ground', () => {
    const impact = MAGE_SPELL_PRESETS.basic.impact;

    // O selo/círculo no chão foi removido de vez.
    expect('runeSigil' in impact).toBe(false);
    // Mas o impacto continua sendo um impacto de fogo completo.
    expect(impact.pillar?.height).toBeGreaterThan(2);
    expect(impact.spikes?.count).toBeGreaterThanOrEqual(6);
    expect(impact.jets?.count).toBeGreaterThanOrEqual(6);
    expect(impact.debrisCount).toBeGreaterThan(0);
    expect(impact.lightIntensity).toBeGreaterThan(1.5);
    expect(impact.particleCount).toBeGreaterThan(60);
    // Continua golpe único, sem AoE.
    expect(MAGE_SPELL_PRESETS.basic.delivery).toBe('projectile');
    expect(MAGE_SPELL_PRESETS.basic.hand).toBe('right');
  });

  it('draws the stretched head, the hot trail and the smoke ribbon', () => {
    const scene = new THREE.Scene();
    const resources = new MageVFXResources();
    const manager = new ProjectileManager(scene, resources, 'high', new VFXLightPool(scene, 4));

    fireComet(manager);

    const core = part(scene, 'MageProjectileCore') as THREE.Mesh;
    const head = part(scene, 'MageCometHead') as THREE.Mesh;
    const trail = part(scene, 'MageProjectileRibbonTrail');
    const smoke = part(scene, 'MageProjectileSmokeTrail');
    expect(trail.visible).toBe(true);
    expect(smoke.visible).toBe(true);
    // Cabeça esticada no eixo do voo (+Z local) e casca de fogo em volta dela.
    expect(core.scale.z).toBeGreaterThan(core.scale.x * 2);
    expect(head.visible).toBe(true);
    expect(head.scale.z).toBeGreaterThan(head.scale.x);
    expect(head.scale.x).toBeGreaterThan(core.scale.x);
    // A fumaça é mais larga que o rastro quente.
    const hotMaterial = trail.material as THREE.ShaderMaterial;
    const smokeMaterial = smoke.material as THREE.ShaderMaterial;
    expect(smokeMaterial.uniforms.uThickness.value)
      .toBeGreaterThan(hotMaterial.uniforms.uThickness.value);
    expect(smokeMaterial.uniforms.uOpacity.value).toBeGreaterThan(0);
    // Rastro quente: núcleo claro atrás da cabeça e vermelho na ponta.
    expect(hotMaterial.uniforms.uColorB.value.r).toBeGreaterThan(hotMaterial.uniforms.uColorB.value.b);
    expect(hotMaterial.uniforms.uColorA.value.r).toBeGreaterThan(hotMaterial.uniforms.uColorA.value.g);

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

  it('streams embers behind the fireball', () => {
    const scene = new THREE.Scene();
    const resources = new MageVFXResources();
    const manager = new ProjectileManager(scene, resources, 'high', new VFXLightPool(scene, 4));

    fireComet(manager);
    manager.update(0.05);

    const embers = scene.getObjectByName('MageProjectileVFX')?.children.find(
      (child) => child instanceof THREE.Points && child.geometry.getAttribute('aSize')
    ) as THREE.Points | undefined;
    expect(embers).toBeDefined();
    const sizes = embers!.geometry.getAttribute('aSize') as THREE.BufferAttribute;
    const color = (embers!.material as THREE.ShaderMaterial).uniforms.uColor.value as THREE.Color;
    expect(sizes.getX(0)).toBeLessThan(26);
    expect(color.r).toBeGreaterThan(color.b);
    expect(embers!.visible).toBe(true);

    manager.dispose();
    resources.dispose();
  });

  it('only impacts when it hits an enemy: no target means no impact at all', () => {
    const scene = new THREE.Scene();
    const resources = new MageVFXResources();
    const manager = new ProjectileManager(scene, resources, 'high', new VFXLightPool(scene, 4));
    let impacts = 0;

    fireComet(manager, { onImpact: () => { impacts += 1; } });
    // Voa até passar de todo o alcance, sem nenhum inimigo na frente.
    for (let step = 0; step < 200; step += 1) manager.update(0.05);
    expect(impacts).toBe(0);

    // Com um inimigo no caminho, o impacto acontece.
    const target = new THREE.Group();
    target.position.set(0, 1, -3);
    target.userData.enemyBodyScale = 1;
    fireComet(manager, { target, onImpact: () => { impacts += 1; } });
    for (let step = 0; step < 60 && impacts === 0; step += 1) manager.update(0.05);
    expect(impacts).toBe(1);

    manager.dispose();
    resources.dispose();
  });

  it('fizzles the fireball at the end of its range without playing the impact VFX', () => {
    const scene = new THREE.Scene();
    const resources = new MageVFXResources();
    const vfx = new MageVFX(scene, { quality: 'high' });
    const { root, mixer, action } = createAction();
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

    advance(vfx, mixer, 2.2, 0.02);
    // Sem inimigo: nenhum efeito de impacto foi criado na cena.
    const impactGroups = scene.children.filter((child) => child.name === 'MageImpactVFX');
    const visibleImpacts = impactGroups.filter((group) => group.visible);
    expect(visibleImpacts.length).toBe(0);

    vfx.dispose();
  });

  it('keeps the comet layers off for the other spells', () => {
    const scene = new THREE.Scene();
    const resources = new MageVFXResources();
    const manager = new ProjectileManager(scene, resources, 'high', new VFXLightPool(scene, 4));

    fireComet(manager, { preset: MAGE_SPELL_PRESETS.water });

    expect((part(scene, 'MageProjectileSmokeTrail').material as THREE.ShaderMaterial)
      .uniforms.uOpacity.value).toBe(0);
    expect((part(scene, 'MageCometHead') as THREE.Mesh).visible).toBe(false);
    expect((part(scene, 'MageProjectileCore') as THREE.Mesh).scale.z)
      .toBeCloseTo((part(scene, 'MageProjectileCore') as THREE.Mesh).scale.x, 5);

    manager.dispose();
    resources.dispose();
  });

  it('fires the fire pillar, the star spikes and the flame jets on impact', () => {
    const scene = new THREE.Scene();
    const resources = new MageVFXResources();
    const impacts = new ImpactVFX(scene, resources, 'high', new VFXLightPool(scene, 4));

    impacts.play({ preset: MAGE_SPELL_PRESETS.basic, position: new THREE.Vector3(0, 1, -6) });
    impacts.update(0.05);

    const group = scene.children[scene.children.length - 1];
    // Nenhum círculo/selo no chão é criado no impacto.
    expect(group.children.some((child) => child.name.includes('Sigil'))).toBe(false);
    const pillar = scene.getObjectByName('MageImpactLightPillar') as THREE.Mesh | undefined;
    expect(pillar?.visible).toBe(true);
    const pillarColor = (pillar?.material as THREE.MeshBasicMaterial).color;
    expect(pillarColor.r).toBeGreaterThan(pillarColor.b);
    expect(
      group.children.filter((child) => child.name === 'MageImpactRuneSpike' && child.visible).length
    ).toBe(MAGE_SPELL_PRESETS.basic.impact.spikes?.count);
    const jets = group.children.filter(
      (child) => child.name === 'MageImpactFlameJet' && child.visible
    ) as THREE.Sprite[];
    expect(jets.length).toBe(MAGE_SPELL_PRESETS.basic.impact.jets?.count);
    const jetColor = (jets[0].material as THREE.SpriteMaterial).color;
    expect(jetColor.r).toBeGreaterThan(jetColor.b);

    impacts.dispose();
    resources.dispose();
  });

  it('rips the flame jets outwards and fades them fast', () => {
    const scene = new THREE.Scene();
    const resources = new MageVFXResources();
    const impacts = new ImpactVFX(scene, resources, 'high', new VFXLightPool(scene, 4));

    impacts.play({ preset: MAGE_SPELL_PRESETS.basic, position: new THREE.Vector3(0, 1, -6) });
    impacts.update(0.02);

    const group = scene.children[scene.children.length - 1];
    const jets = group.children.filter(
      (child) => child.name === 'MageImpactFlameJet' && child.visible
    ) as THREE.Sprite[];
    const initialDistance = jets[0].position.length();
    const initialOpacity = (jets[0].material as THREE.SpriteMaterial).opacity;

    impacts.update(0.12);
    expect(jets[0].position.length()).toBeGreaterThan(initialDistance);
    expect((jets[0].material as THREE.SpriteMaterial).opacity).toBeLessThan(initialOpacity);

    impacts.update(0.3);
    expect(
      group.children.filter((child) => child.name === 'MageImpactFlameJet' && child.visible).length
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
      scale: 0.24,
      muzzleFlash: true,
    });
    impacts.update(0.02);

    const muzzleGroup = scene.children[scene.children.length - 1];
    expect(
      muzzleGroup.children.filter((child) => child.name === 'MageImpactRuneSpike' && child.visible).length
    ).toBe(0);
    expect(
      muzzleGroup.children.filter((child) => child.name === 'MageImpactFlameJet' && child.visible).length
    ).toBe(0);
    expect(
      (muzzleGroup.children.find((child) => child.name === 'MageImpactLightPillar') as THREE.Mesh).visible
    ).toBe(false);

    impacts.dispose();
    resources.dispose();
  });

  it('launches the fireball from the Mage hand on the basic cast', () => {
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

    advance(vfx, mixer, 0.8);
    const smoke = scene.getObjectByName('MageProjectileSmokeTrail') as THREE.Mesh | undefined;
    expect(smoke?.visible).toBe(true);

    vfx.dispose();
  });
});
