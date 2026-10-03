import * as THREE from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MageVFX } from './MageVFX';
import { ImpactVFX } from './ImpactVFX';
import { ProjectileManager } from './ProjectileManager';
import { MageVFXResources } from './MageVFXResources';
import { VFXLightPool } from './VFXLightPool';
import { MAGE_SPELL_PRESETS } from './VFXConfig';
import type { MageSpellPreset } from './VFXTypes';

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

/** Dispara um orbe reto para a frente e devolve o grupo do projétil. */
function fireBolt(manager: ProjectileManager, preset: MageSpellPreset): void {
  manager.fire({
    preset,
    origin: new THREE.Vector3(0, 1, 0),
    direction: new THREE.Vector3(0, 0, 1),
    target: null,
    onImpact: () => undefined,
  });
}

function part(scene: THREE.Scene, name: string): THREE.Mesh {
  const found = scene.getObjectByName(name) as THREE.Mesh | undefined;
  expect(found).toBeDefined();
  return found!;
}

/** Roda o clip do conjurador e o VFX juntos até somar `seconds`. */
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

/** Canais em espaço linear (o three.js converte sRGB -> linear em `Color.set`). */
function channels(hex: THREE.ColorRepresentation): { r: number; g: number; b: number } {
  const color = new THREE.Color(hex);
  return { r: color.r, g: color.g, b: color.b };
}

describe('Maga — ataque básico de plasma', () => {
  beforeEach(() => {
    vi.spyOn(THREE.TextureLoader.prototype, 'load').mockImplementation(() => new THREE.Texture());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('uses a bright blue plasma palette instead of the old arcane purple', () => {
    const colors = MAGE_SPELL_PRESETS.basic.colors;

    for (const key of ['glow', 'secondary'] as const) {
      const { r, g, b } = channels(colors[key]);
      // Azul domina e é saturado/brilhante: é o que lê como "plasma azul".
      expect(b).toBeGreaterThan(g);
      expect(b).toBeGreaterThan(r);
      expect(b).toBeGreaterThan(0.85);
    }
    const core = channels(colors.core);
    // Núcleo quase branco, com leve viés azul (ponto quente do plasma).
    expect(core.r).toBeGreaterThan(0.85);
    expect(core.b).toBeGreaterThanOrEqual(core.g);
    expect(core.g).toBeGreaterThanOrEqual(core.r);
  });

  it('conjures fast: the bolt leaves the hand in the first fifth of the cast', () => {
    const basic = MAGE_SPELL_PRESETS.basic;

    expect(basic.timeline.chargeStart).toBeLessThanOrEqual(0.05);
    expect(basic.timeline.launch).toBeLessThanOrEqual(0.2);
    expect(basic.timeline.chargeEnd).toBeLessThanOrEqual(0.25);
    // Rápido também no voo: um ataque básico não pode "flutuar" até o alvo.
    expect(basic.projectile.speed).toBeGreaterThanOrEqual(24);
    expect(basic.impact.duration).toBeLessThanOrEqual(0.6);
    // A carga continua enxuta (nada de orbe gigante antes do disparo).
    expect(basic.charge.scale).toBeLessThanOrEqual(0.8);
    expect(basic.muzzle?.scale).toBeLessThan(0.35);
  });

  it('ships the plasma orb, the signature impact layers and no area damage', () => {
    const basic = MAGE_SPELL_PRESETS.basic;

    // O projétil agora é um orbe de plasma, não mais o dardo rúnico.
    expect(basic.projectile.plasma).toBeDefined();
    expect(basic.projectile.plasma?.shellScale).toBeGreaterThan(1);
    expect(basic.projectile.plasma?.spin).toBeGreaterThan(0);
    expect(basic.projectile.arrow).toBeUndefined();

    // Impacto completo: selo no chão, coluna de luz, estilhaços e jatos.
    expect(basic.impact.runeSigil?.groundStamp).toBe(true);
    expect(basic.impact.runeSigil?.radius).toBeGreaterThan(1.5);
    expect(basic.impact.pillar?.height).toBeGreaterThan(2);
    expect(basic.impact.spikes?.count).toBeGreaterThanOrEqual(6);
    expect(basic.impact.jets?.count).toBeGreaterThanOrEqual(6);
    expect(basic.impact.jets?.length).toBeGreaterThan(1);
    expect(basic.impact.lightIntensity).toBeGreaterThan(1.5);

    // O ganho é visual: continua um golpe único, sem AoE.
    expect(basic.delivery).toBe('projectile');
    expect(basic.impact.debrisCount).toBe(0);
    expect(basic.hand).toBe('right');
  });

  it('shows the crackling plasma shell and the containment rings around the orb', () => {
    const scene = new THREE.Scene();
    const resources = new MageVFXResources();
    const manager = new ProjectileManager(scene, resources, 'high', new VFXLightPool(scene, 4));

    fireBolt(manager, MAGE_SPELL_PRESETS.basic);

    const shell = part(scene, 'MagePlasmaShell');
    const innerRing = part(scene, 'MageBasicArrowRuneFinInner');
    const outerRing = part(scene, 'MageBasicArrowRuneFinOuter');
    expect(shell.visible).toBe(true);
    expect(innerRing.visible).toBe(true);
    expect(outerRing.visible).toBe(true);
    // O orbe: sem dardo, o cone fica escondido.
    expect(part(scene, 'MageBasicArrowSpearhead').visible).toBe(false);
    const shellMaterial = shell.material as THREE.MeshBasicMaterial;
    expect(shellMaterial.wireframe).toBe(true);
    expect(shellMaterial.opacity).toBeGreaterThan(0.5);
    expect(shell.scale.x).toBeGreaterThan(0);

    manager.update(0.05);
    const shellRotation = shell.rotation.y;
    const shellScale = shell.scale.x;
    const innerRotation = innerRing.rotation.z;
    const outerRotation = outerRing.rotation.z;
    for (let step = 0; step < 4; step += 1) manager.update(0.05);

    // O casco crepita (gira e pulsa) e as coroas giram em sentidos opostos.
    expect(shell.rotation.y).toBeGreaterThan(shellRotation);
    expect(shell.scale.x).not.toBeCloseTo(shellScale, 5);
    const innerDelta = innerRing.rotation.z - innerRotation;
    const outerDelta = outerRing.rotation.z - outerRotation;
    expect(Math.abs(innerDelta)).toBeGreaterThan(0);
    expect(Math.abs(outerDelta)).toBeGreaterThan(0);
    expect(Math.sign(innerDelta)).toBe(-Math.sign(outerDelta));

    manager.dispose();
    resources.dispose();
  });

  it('keeps the plasma orb layers off for the other spells', () => {
    const scene = new THREE.Scene();
    const resources = new MageVFXResources();
    const manager = new ProjectileManager(scene, resources, 'high', new VFXLightPool(scene, 4));

    fireBolt(manager, MAGE_SPELL_PRESETS.water);

    expect(part(scene, 'MagePlasmaShell').visible).toBe(false);
    expect(part(scene, 'MageBasicArrowRuneFinInner').visible).toBe(false);
    expect(part(scene, 'MageBasicArrowSpearhead').visible).toBe(false);
    manager.dispose();
    resources.dispose();
  });

  it('still supports the rune dart shape for presets that ask for it', () => {
    const scene = new THREE.Scene();
    const resources = new MageVFXResources();
    const manager = new ProjectileManager(scene, resources, 'high', new VFXLightPool(scene, 4));
    const dartPreset: MageSpellPreset = {
      ...MAGE_SPELL_PRESETS.basic,
      projectile: {
        ...MAGE_SPELL_PRESETS.basic.projectile,
        plasma: undefined,
        arrow: { length: 3, finSpin: 8 },
      },
    };

    fireBolt(manager, dartPreset);

    const spearhead = part(scene, 'MageBasicArrowSpearhead');
    expect(spearhead.visible).toBe(true);
    expect(part(scene, 'MagePlasmaShell').visible).toBe(false);
    // O dardo é alongado no sentido do voo (escala maior em Y que em X/Z).
    expect(spearhead.scale.y).toBeGreaterThan(spearhead.scale.x);

    manager.dispose();
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
    expect(outer?.rotation.x).toBeCloseTo(-Math.PI / 2);
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

    impacts.dispose();
    resources.dispose();
  });

  it('rips plasma jets out of the impact and fades them fast', () => {
    const scene = new THREE.Scene();
    const resources = new MageVFXResources();
    const impacts = new ImpactVFX(scene, resources, 'high', new VFXLightPool(scene, 4));

    impacts.play({ preset: MAGE_SPELL_PRESETS.basic, position: new THREE.Vector3(0, 1, -6) });
    impacts.update(0.02);

    const group = scene.children[scene.children.length - 1];
    const jets = group.children.filter(
      (child) => child.name === 'MageImpactPlasmaJet' && child.visible
    ) as THREE.Sprite[];
    expect(jets.length).toBe(MAGE_SPELL_PRESETS.basic.impact.jets?.count);
    const initialDistance = jets[0].position.length();
    const initialOpacity = (jets[0].material as THREE.SpriteMaterial).opacity;
    expect(initialOpacity).toBeGreaterThan(0.5);

    impacts.update(0.12);
    // Os riscos voam para fora e alongam no caminho.
    expect(jets[0].position.length()).toBeGreaterThan(initialDistance);
    expect((jets[0].material as THREE.SpriteMaterial).opacity).toBeLessThan(initialOpacity);

    // Somem antes do resto do impacto: são a parte rápida da leitura.
    impacts.update(0.3);
    const stillVisible = group.children.filter(
      (child) => child.name === 'MageImpactPlasmaJet' && child.visible
    );
    expect(stillVisible.length).toBe(0);

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
      scale: 0.2,
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

  it('launches the plasma orb from the Mage hand on the basic cast', () => {
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
    const shell = scene.getObjectByName('MagePlasmaShell') as THREE.Mesh | undefined;
    expect(shell?.visible).toBe(true);

    vfx.dispose();
  });
});
