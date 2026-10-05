import * as THREE from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PooledParticleCloud } from './ParticleManager';
import { MageVFX } from './MageVFX';
import { MageVFXResources } from './MageVFXResources';
import { ProjectileManager } from './ProjectileManager';
import { VFXLightPool } from './VFXLightPool';
import { MAGE_SPELL_PRESETS } from './VFXConfig';

function createAction(duration = 2, timeScale = 1): {
  root: THREE.Group;
  mixer: THREE.AnimationMixer;
  action: THREE.AnimationAction;
} {
  const root = new THREE.Group();
  const mixer = new THREE.AnimationMixer(root);
  const clip = new THREE.AnimationClip('mage basic attack test', duration, [
    new THREE.NumberKeyframeTrack('.visible', [0, duration], [1, 1]),
  ]);
  const action = mixer.clipAction(clip);
  action.setLoop(THREE.LoopOnce, 1);
  action.clampWhenFinished = true;
  action.setEffectiveTimeScale(timeScale);
  action.play();
  return { root, mixer, action };
}

function castBasic(vfx: MageVFX, steps = 0): { root: THREE.Group; mixer: THREE.AnimationMixer; action: THREE.AnimationAction } {
  const { root, mixer, action } = createAction(2, 1);
  const rightHand = new THREE.Object3D();
  rightHand.name = 'mixamorig:RightHand';
  root.add(rightHand);
  const target = new THREE.Group();
  target.position.set(0, 0, 6);
  target.userData.enemyBodyScale = 1;
  vfx.cast('basic', {
    caster: root,
    rightHand,
    leftHand: null,
    action,
    target,
    fallbackDirection: new THREE.Vector3(0, 0, 1),
    isTargetAlive: () => true,
  });
  for (let step = 0; step < steps; step += 1) {
    mixer.update(0.05);
    vfx.update(0.05);
  }
  return { root, mixer, action };
}

/** O impacto do alvo fica longe da mão; o flash de saída nasce colado nela. */
function findTargetImpact(scene: THREE.Scene): THREE.Object3D | undefined {
  return scene.children.find(
    (child) => child.name === 'MageImpactVFX' && child.position.z > 3
  );
}

/** Avança a simulação até a carga na mão aparecer (a janela dela é curta). */
function advanceUntilCharge(
  vfx: MageVFX,
  mixer: THREE.AnimationMixer,
  scene: THREE.Scene,
  maxSteps = 40
): THREE.Object3D | undefined {
  for (let step = 0; step < maxSteps; step += 1) {
    mixer.update(0.05);
    vfx.update(0.05);
    const charge = scene.getObjectByName('MageChargeOrbVFX');
    if (charge) return charge;
  }
  return scene.getObjectByName('MageChargeOrbVFX');
}

/** Avança a simulação até o projétil bater, com um teto de passos. */
function advanceUntilTargetImpact(
  vfx: MageVFX,
  mixer: THREE.AnimationMixer,
  scene: THREE.Scene,
  maxSteps = 60
): THREE.Object3D | undefined {
  for (let step = 0; step < maxSteps; step += 1) {
    mixer.update(0.03);
    vfx.update(0.03);
    const impact = findTargetImpact(scene);
    if (impact) return impact;
  }
  return findTargetImpact(scene);
}

describe('Mage basic attack bullet', () => {
  beforeEach(() => {
    vi.spyOn(THREE.TextureLoader.prototype, 'load').mockImplementation(() => new THREE.Texture());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('ships a larger comet with a compact hitbox, blue aura and frost wake', () => {
    const preset = MAGE_SPELL_PRESETS.basic;
    expect(preset.projectile.shape).toBe('bullet');
    // The requested enlargement affects the silhouette, not collision.
    // 4.104 m x 1.368 m is 50% larger than the previous 2.736 m x 0.912 m.
    const cometLength = preset.projectile.radius * (preset.projectile.comet?.lengthScale ?? 0);
    const cometWidth = preset.projectile.radius * (preset.projectile.comet?.widthScale ?? 0);
    expect(preset.projectile.radius).toBeGreaterThanOrEqual(0.3);
    expect(preset.projectile.radius).toBeLessThanOrEqual(0.42);
    expect(cometLength).toBeCloseTo(2.736 * 1.5, 5);
    expect(cometWidth).toBeCloseTo(0.912 * 1.5, 5);
    expect(cometLength).toBeLessThan(4.5);
    expect(cometLength / cometWidth).toBeGreaterThan(2.2);
    expect(cometLength / cometWidth).toBeLessThan(4);
    expect(preset.projectile.trailWidth).toBeLessThanOrEqual(0.06);
    expect(preset.charge.scale).toBeLessThanOrEqual(0.7);
    // Impacto em camadas: bem maior que a bala, mas sem virar tela inteira.
    expect(preset.impact.radius).toBeGreaterThan(0.9);
    expect(preset.impact.radius).toBeLessThanOrEqual(1.2);
    expect(preset.impact.shockwaveRadius).toBeGreaterThan(1.5);
    expect(preset.impact.shockwaveRadius).toBeLessThanOrEqual(2.6);
    expect(preset.impact.duration).toBeGreaterThanOrEqual(0.65);
    expect(preset.impact.particleCount).toBeGreaterThanOrEqual(40);
    expect(preset.impact.debrisCount).toBeGreaterThan(0);
    // Blue aura around a pale core (gelo: azul claro em cima do azul profundo).
    expect(new THREE.Color(preset.colors.glow).getHex()).toBe(0x6fd6ff);
    expect(new THREE.Color(preset.colors.secondary).getHex()).toBe(0x1f6bff);
    // Sprite do cometa: dardo + seda + partículas, sem a fita de energia antiga.
    expect(preset.projectile.comet?.widthScale).toBeGreaterThan(1);
    expect(preset.projectile.comet?.lengthScale).toBeGreaterThan(preset.projectile.comet?.widthScale ?? 0);
    expect(preset.projectile.comet?.trailOpacity).toBe(0);
    expect(preset.projectile.frost?.color).toBe(0xcfeaff);
    expect(preset.projectile.frost?.blending).toBe('additive');
    // Particle sizes are screen-space units (~0.21 m each): anything above ~3
    // turns the frost wake into the huge fog bank the old effect had.
    expect(preset.projectile.frost?.size[1] ?? 0).toBeLessThanOrEqual(3);
  });

  it.each(['low', 'medium', 'high', 'ultra'] as const)(
    'enlarges only the rendered comet, preserving travel and collision in %s quality', (quality) => {
      const scene = new THREE.Scene();
      const resources = new MageVFXResources();
      const lights = new VFXLightPool(scene, 2);
      const projectiles = new ProjectileManager(scene, resources, quality, lights);
      const queryBodyHit = vi.fn((_from: THREE.Vector3, _to: THREE.Vector3, _radius: number) => null);
      const onImpact = vi.fn();
      try {
        projectiles.fire({
          origin: new THREE.Vector3(0, 1, 0),
          direction: new THREE.Vector3(0, 0, 1),
          target: null, preset: MAGE_SPELL_PRESETS.basic, queryBodyHit, onImpact,
        });
        const bolt = scene.getObjectByName('MageProjectileVFX')!;
        const comet = bolt.getObjectByName('MageFrostBulletComet') as THREE.Mesh;
        const material = comet.material as THREE.ShaderMaterial;
        expect(comet.scale.x).toBeCloseTo(4.104);
        expect(comet.scale.y).toBeCloseTo(1.368);
        expect(material.uniforms.uIntensity.value).toBe(1.7);
        expect(material.uniforms.uFilament.value).toBe(1.25);
        expect(bolt.getObjectByName('MageProjectileRibbonTrail')!.visible).toBe(false);
        projectiles.update(0.05);
        expect(bolt.position.z).toBeCloseTo(25 * 0.05);
        expect(queryBodyHit).toHaveBeenCalledTimes(1);
        expect(queryBodyHit.mock.calls[0][2]).toBe(0.38);
        projectiles.update(1);
        projectiles.update(0.5);
        expect(onImpact).not.toHaveBeenCalled();
        expect(projectiles.activeCount).toBe(0);
        expect(lights.availableCount).toBe(lights.size);
      } finally {
        projectiles.dispose(); lights.dispose(); resources.dispose();
      }
    }
  );

  it('does not change the basic launch timing, flight lifetime or disabled impact', () => {
    expect(MAGE_SPELL_PRESETS.basic.timeline).toEqual({
      chargeStart: 0.3, launch: 0.36, chargeEnd: 0.4, recover: 0.72, end: 1,
    });
    expect(MAGE_SPELL_PRESETS.basic.projectile).toMatchObject({ speed: 25, radius: 0.38, lifetime: 1.1 });
    expect(MAGE_SPELL_PRESETS.basic.impact.visual).toBe(false);
    expect(MAGE_SPELL_PRESETS.basic.charge).toEqual({
      scale: 0.5, particleCount: 0, sparkCount: 0, lightIntensity: 0.55, twoHanded: false,
    });
  });

  it('keeps the palm charge of the basic attack under a metre', () => {
    const scene = new THREE.Scene();
    const vfx = new MageVFX(scene, { quality: 'high' });
    const { mixer } = castBasic(vfx);

    const charge = advanceUntilCharge(vfx, mixer, scene);
    const glow = charge?.getObjectByName('MageChargeOrbGlow') as THREE.Sprite | undefined;
    expect(glow).toBeDefined();
    const worldDiameter = (glow?.scale.x ?? 0) * (charge?.scale.x ?? 1);
    expect(worldDiameter).toBeLessThan(1.3);
    vfx.dispose();
  });

  it('acende a conjuração só por um piscar antes do disparo', () => {
    const scene = new THREE.Scene();
    const vfx = new MageVFX(scene, { quality: 'high' });
    // Clip de teste = 1 s; no jogo o "ataque basico" tem 1,8 s, então a janela
    // de 0.30 -> 0.36 do timeline vale ~0,1 s na mão da Maga.
    const preset = MAGE_SPELL_PRESETS.basic;
    expect(preset.timeline.chargeStart).toBeGreaterThanOrEqual(0.25);
    expect(preset.timeline.launch - preset.timeline.chargeStart).toBeLessThan(0.12);

    const { mixer } = castBasic(vfx);
    const charge = advanceUntilCharge(vfx, mixer, scene);
    expect(charge).toBeDefined();

    // O disparo libera a carga: no quadro seguinte ela tem que sair da cena.
    for (let step = 0; step < 6; step += 1) {
      mixer.update(0.05);
      vfx.update(0.05);
    }
    expect(scene.getObjectByName('MageChargeOrbVFX')).toBeUndefined();
    vfx.dispose();
  });

  it('não prende a carga na mão quando o ataque recomeça no meio', () => {
    const scene = new THREE.Scene();
    const vfx = new MageVFX(scene, { quality: 'high' });
    const { root, mixer, action } = createAction(2, 1);
    const rightHand = new THREE.Object3D();
    rightHand.name = 'mixamorig:RightHand';
    root.add(rightHand);
    const target = new THREE.Group();
    target.position.set(0, 0, 10);
    target.userData.enemyBodyScale = 1;
    vfx.cast('basic', {
      caster: root,
      rightHand,
      leftHand: null,
      action,
      target,
      fallbackDirection: new THREE.Vector3(0, 0, 1),
      isTargetAlive: () => true,
    });

    // avança até o disparo (0.36 do clip de 2 s do teste = 0,72 s)
    let bolt: THREE.Object3D | undefined;
    for (let step = 0; step < 40 && !bolt; step += 1) {
      mixer.update(0.05);
      vfx.update(0.05);
      bolt = scene.getObjectByName('MageProjectileVFX');
    }
    expect(bolt).toBeDefined();
    expect(scene.getObjectByName('MageChargeOrbVFX')).toBeUndefined();

    // Atacar de novo reinicia a ação no meio e refaz os eventos da timeline.
    action.reset();
    action.play();
    for (let step = 0; step < 30; step += 1) {
      mixer.update(0.05);
      vfx.update(0.05);
    }
    expect(scene.getObjectByName('MageChargeOrbVFX')).toBeUndefined();
    vfx.dispose();
  });

  it('renders the bolt as the frost comet sprite instead of the old orb', () => {
    const scene = new THREE.Scene();
    const vfx = new MageVFX(scene, { quality: 'high' });
    castBasic(vfx, 16);

    const bolt = scene.getObjectByName('MageProjectileVFX');
    expect(bolt).toBeDefined();
    const comet = bolt?.getObjectByName('MageFrostBulletComet') as THREE.Mesh | undefined;
    expect(comet?.visible).toBe(true);
    expect(comet?.material).toBeInstanceOf(THREE.ShaderMaterial);

    const { radius, comet: config, haloScale } = MAGE_SPELL_PRESETS.basic.projectile;
    // Comprimento no eixo do voo, largura no eixo transversal.
    expect(comet?.scale.x).toBeCloseTo(radius * (config?.lengthScale ?? 0), 3);
    expect(comet?.scale.y).toBeCloseTo(radius * (config?.widthScale ?? 0), 3);
    // A ponta do sprite fica no ponto de colisão: o sprite recua metade dele.
    expect(comet?.position.z).toBeCloseTo(-(comet?.scale.x ?? 0) * 0.5, 5);

    // O orbe branco e a fita de energia antigos saem de cena na bala.
    expect(bolt?.getObjectByName('MageProjectileCore')?.visible).toBe(false);
    expect(bolt?.getObjectByName('MageProjectileRibbonTrail')?.visible).toBe(false);
    expect(bolt?.getObjectByName('MageIceShardProjectile')?.visible).toBe(false);

    // A aura azul é o brilho em volta da bala: acompanha o raio, sem estourar.
    const halo = bolt?.getObjectByName('MageProjectileAuraGlow') as THREE.Sprite;
    expect(halo.scale.x).toBeLessThan(1);
    expect(halo.scale.x).toBeCloseTo(radius * (haloScale ?? 3.4), 1);
    vfx.dispose();
  });

  it('stretches the comet sprite: faces the camera and follows the projected flight path', () => {
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera();
    // Câmera de lado: a projeção do voo aparece inteira na tela.
    camera.position.set(9, 2.5, 0);
    const vfx = new MageVFX(scene, { quality: 'high', getCamera: () => camera });
    const { mixer } = castBasic(vfx, 16);

    const bolt = scene.getObjectByName('MageProjectileVFX')!;
    const comet = bolt.getObjectByName('MageFrostBulletComet') as THREE.Mesh;
    mixer.update(0.01);
    vfx.update(0.01);
    bolt.updateMatrixWorld(true);

    const orientation = comet.getWorldQuaternion(new THREE.Quaternion());
    const axisX = new THREE.Vector3(1, 0, 0).applyQuaternion(orientation).normalize();
    const normal = new THREE.Vector3(0, 0, 1).applyQuaternion(orientation).normalize();
    const toCamera = camera.position.clone().sub(bolt.position).normalize();
    // A face do sprite olha para a câmera...
    expect(Math.abs(normal.dot(toCamera))).toBeGreaterThan(0.9);
    // ...e o eixo do desenho aponta no sentido do voo projetado.
    expect(axisX.dot(new THREE.Vector3(0, 0, 1))).toBeGreaterThan(0.9);

    // Voando direto para dentro da câmera a projeção some: o sprite continua
    // de frente para ela (é o caso normal no jogo, com a câmera atrás da Maga).
    camera.position.set(0, 1.6, -6);
    mixer.update(0.01);
    vfx.update(0.01);
    bolt.updateMatrixWorld(true);
    const spun = comet.getWorldQuaternion(new THREE.Quaternion());
    const spunNormal = new THREE.Vector3(0, 0, 1).applyQuaternion(spun).normalize();
    const toCameraAgain = camera.position.clone().sub(bolt.position).normalize();
    expect(Math.abs(spunNormal.dot(toCameraAgain))).toBeGreaterThan(0.9);
    vfx.dispose();
  });

  it('não desenha NADA no impacto: sem explosão, sem anel, sem partícula', () => {
    const scene = new THREE.Scene();
    const vfx = new MageVFX(scene, { quality: 'high' });
    const { root, mixer, action } = createAction(2, 1);
    const rightHand = new THREE.Object3D();
    rightHand.name = 'mixamorig:RightHand';
    root.add(rightHand);
    const target = new THREE.Group();
    target.position.set(0, 0, 5);
    target.userData.enemyBodyScale = 1;
    const hits: THREE.Object3D[] = [];

    vfx.cast('basic', {
      caster: root,
      rightHand,
      leftHand: null,
      action,
      target,
      fallbackDirection: new THREE.Vector3(0, 0, 1),
      isTargetAlive: () => true,
      onImpact: (hit) => hits.push(hit),
    });

    // Roda bem além do impacto: nenhum efeito de impacto pode nascer.
    for (let step = 0; step < 80; step += 1) {
      mixer.update(0.03);
      vfx.update(0.03);
      expect(scene.getObjectByName('MageImpactVFX')).toBeUndefined();
    }

    // O acerto continua acontecendo: o dano/som dependem do onImpact.
    expect(hits).toHaveLength(1);
    expect(hits[0]).toBe(target);
    expect(MAGE_SPELL_PRESETS.basic.impact.visual).toBe(false);
    vfx.dispose();
  });

  it('não treme a câmera no impacto (o efeito não pode aparecer de jeito nenhum)', () => {
    const scene = new THREE.Scene();
    const vfx = new MageVFX(scene, { quality: 'high' });
    const camera = new THREE.PerspectiveCamera();
    camera.position.set(0, 1, -6);
    const { root, mixer, action } = createAction(2, 1);
    const rightHand = new THREE.Object3D();
    rightHand.name = 'mixamorig:RightHand';
    root.add(rightHand);
    const target = new THREE.Group();
    target.position.set(0, 0, 5);
    target.userData.enemyBodyScale = 1;

    vfx.cast('basic', {
      caster: root,
      rightHand,
      leftHand: null,
      action,
      target,
      fallbackDirection: new THREE.Vector3(0, 0, 1),
      isTargetAlive: () => true,
    });

    for (let step = 0; step < 80; step += 1) {
      mixer.update(0.03);
      vfx.update(0.03);
      vfx.applyCameraShake(camera, 0.03);
      // A câmera fica exatamente onde estava: nenhum tremor de impacto.
      expect(camera.position.x).toBe(0);
      expect(camera.position.y).toBe(1);
      expect(camera.position.z).toBe(-6);
    }
    vfx.dispose();
  });

  it('conjura só com o brilho na mão: sem poeira girando nem faísca', () => {
    const scene = new THREE.Scene();
    const vfx = new MageVFX(scene, { quality: 'high' });
    const { mixer } = castBasic(vfx);

    const charge = advanceUntilCharge(vfx, mixer, scene);
    const glow = charge?.getObjectByName('MageChargeOrbGlow') as THREE.Sprite | undefined;
    expect(glow?.visible).toBe(true);

    const clouds = charge?.children.filter((child) => child instanceof THREE.Points) ?? [];
    expect(clouds.length).toBeGreaterThan(0);
    for (const cloud of clouds) {
      expect((cloud as THREE.Points).visible).toBe(false);
      expect((cloud.geometry as THREE.BufferGeometry).drawRange.count).toBe(0);
    }
    expect(MAGE_SPELL_PRESETS.basic.charge.particleCount).toBe(0);
    expect(MAGE_SPELL_PRESETS.basic.charge.sparkCount).toBe(0);
    vfx.dispose();
  });

  it('some aos poucos quando o tiro não acerta ninguém, sem explosão', () => {
    const scene = new THREE.Scene();
    const vfx = new MageVFX(scene, { quality: 'high' });
    const { root, mixer, action } = createAction(2, 1);
    const rightHand = new THREE.Object3D();
    rightHand.name = 'mixamorig:RightHand';
    root.add(rightHand);
    const onImpact = vi.fn();
    vfx.cast('basic', {
      caster: root,
      rightHand,
      leftHand: null,
      action,
      // Ninguém para acertar: o tiro tem que se dissolver sozinho.
      target: null,
      fallbackDirection: new THREE.Vector3(0, 0, 1),
      onImpact,
    });

    let sawBolt = false;
    let peakOpacity = 0;
    let fadedToNothing = false;
    for (let step = 0; step < 400; step += 1) {
      mixer.update(0.02);
      vfx.update(0.02);
      const bolt = scene.getObjectByName('MageProjectileVFX');
      if (!bolt) continue;
      sawBolt = true;
      const comet = bolt.getObjectByName('MageFrostBulletComet') as THREE.Mesh | undefined;
      const uniforms = (comet?.material as unknown as {
        uniforms: { uOpacity: { value: number } };
      })?.uniforms;
      const opacity = uniforms?.uOpacity.value ?? 0;
      peakOpacity = Math.max(peakOpacity, opacity);
      if (peakOpacity > 0 && opacity <= peakOpacity * 0.35) fadedToNothing = true;
    }

    expect(sawBolt).toBe(true);
    expect(fadedToNothing).toBe(true);
    expect(onImpact).not.toHaveBeenCalled();
    // Nada de explosão no vazio: só o flash da mão na saída do tiro.
    expect(findTargetImpact(scene)).toBeUndefined();
    vfx.dispose();
  });

  it('leaves the frost wake in world space so the trail stays behind the bolt', () => {
    const scene = new THREE.Scene();
    const vfx = new MageVFX(scene, { quality: 'high' });
    castBasic(vfx, 16);

    const bolt = scene.getObjectByName('MageProjectileVFX');
    const wake = scene.children.find(
      (child) => child instanceof THREE.Points && !bolt?.children.includes(child)
    ) as THREE.Points | undefined;
    expect(wake).toBeDefined();
    expect(bolt?.children.includes(wake as THREE.Object3D)).toBe(false);
    const drawn = (wake?.geometry as THREE.BufferGeometry).drawRange.count;
    expect(drawn).toBeGreaterThan(0);

    // The oldest puff was released when the bolt was further back, so the trail
    // is a line of vapor behind the bullet — proof it is not glued to the mesh.
    const attribute = (wake?.geometry as THREE.BufferGeometry).getAttribute('position') as THREE.BufferAttribute;
    const oldest = new THREE.Vector3().fromBufferAttribute(attribute, 0);
    const boltPosition = bolt?.position.clone() ?? new THREE.Vector3();
    // The bolt already crossed the arena while the first puff stayed put.
    expect(boltPosition.length()).toBeGreaterThan(2);
    expect(boltPosition.distanceTo(oldest)).toBeGreaterThan(0.5);
    vfx.dispose();
  });

  it('keeps the frost wake in the scene while the bolt flies and drops it on reset', () => {
    const scene = new THREE.Scene();
    const vfx = new MageVFX(scene, { quality: 'high' });
    const { mixer } = castBasic(vfx, 16);
    const wakeCount = (): number => scene.children.filter((child) => child instanceof THREE.Points).length;
    expect(wakeCount()).toBeGreaterThan(0);

    for (let step = 0; step < 80; step += 1) {
      mixer.update(0.1);
      vfx.update(0.1);
    }
    vfx.clear();
    expect(wakeCount()).toBe(0);
    vfx.dispose();
  });
});

describe('PooledParticleCloud trail mode', () => {
  it('appends puffs with add() and restarts with emit()', () => {
    const cloud = new PooledParticleCloud(16, new THREE.Texture());
    const origin = new THREE.Vector3();
    cloud.add(origin, {
      color: 0xcfeaff,
      count: 3,
      speed: 0.4,
      spread: 0.7,
      lifetime: 0.5,
      size: [7, 16],
      opacity: 0.42,
      growth: 1.1,
    });
    expect(cloud.points.geometry.drawRange.count).toBe(3);
    cloud.add(origin, { color: 0xcfeaff, count: 2, speed: 0.4, spread: 0.7, lifetime: 0.5, size: [7, 16], opacity: 0.42 });
    expect(cloud.points.geometry.drawRange.count).toBe(5);

    cloud.emit(origin, { color: 0xcfeaff, count: 4, speed: 0.4, spread: 0.7, lifetime: 0.5 });
    expect(cloud.points.geometry.drawRange.count).toBe(4);

    // add() never overflows the fixed buffer.
    for (let burst = 0; burst < 10; burst += 1) {
      cloud.add(origin, { color: 0xcfeaff, count: 8, speed: 0.4, spread: 0.7, lifetime: 0.5 });
    }
    expect(cloud.points.geometry.drawRange.count).toBe(16);
    cloud.dispose();
  });

  it('honours an explicit opacity instead of dimming with the fill ratio', () => {
    const cloud = new PooledParticleCloud(64, new THREE.Texture());
    cloud.add(new THREE.Vector3(), {
      color: 0xcfeaff,
      count: 2,
      speed: 0.4,
      spread: 0.7,
      lifetime: 0.5,
      opacity: 0.42,
    });
    cloud.update(0.016);
    const material = cloud.points.material as THREE.ShaderMaterial;
    expect(material.uniforms.uOpacity.value).toBeCloseTo(0.42, 5);
    cloud.dispose();
  });
});
