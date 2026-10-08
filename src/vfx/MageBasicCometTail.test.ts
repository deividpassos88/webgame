import * as THREE from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CameraController } from '../core/CameraController';
import { MageVFX } from './MageVFX';
import { MAGE_SPELL_PRESETS } from './VFXConfig';

/**
 * Ataque básico da Maga: a seda do cometa não pode ser desenhada atrás de quem
 * atirou.
 *
 * Antes desta correção o sprite do cometa nascia com os 4,1 m cheios no instante
 * do disparo e a cauda ficava atrás da Maga. Na câmera isométrica do jogo (a
 * mesma do `CameraController`: fov 35°, offset (0,16,11) × zoom 1,2) essa cauda
 * subia por cima da cabeça dela e chegava embaixo dos pés — era isso que fazia
 * o tiro do ataque automático parecer sair das costas. Agora o desenho nasce
 * com 0,6 m e estica conforme o tiro caminha (a ponta avança na frente da
 * cauda), chegando ao desenho cheio da referência em ~3,5 m de voo (0,14 s).
 *
 * As medidas da ponta do cajado usadas aqui vêm do rig real do GLB durante o
 * clip `ataque_basico` (parada e correndo), com a Maga olhando para -Z.
 */

const PRESET = MAGE_SPELL_PRESETS.basic;
const COMET_FULL_LENGTH = PRESET.projectile.radius * (PRESET.projectile.comet?.lengthScale ?? 0);
const COMET_WIDTH = PRESET.projectile.radius * (PRESET.projectile.comet?.widthScale ?? 0);
/** Ponta do cajado medida no 1º quadro do clip, parada (altura na altura da cabeça). */
const STANDING_MUZZLE = new THREE.Vector3(0.5, 3.34, -1.3);
/** Pior quadro medido com a Maga correndo: ponta mais baixa e menos à frente. */
const RUNNING_MUZZLE = new THREE.Vector3(0.5, 2.36, -0.85);
const AIM = new THREE.Vector3(0, 0, -1);
const CASTER = new THREE.Vector3(0, 0, 0);
const HEAD = new THREE.Vector3(0, 2.9, 0);
const CHEST = new THREE.Vector3(0, 1.7, 0);
const WAIST = new THREE.Vector3(0, 1.1, 0);
const STEP = 1 / 60;

interface Frame {
  readonly step: number;
  readonly drawnLength: number;
  readonly head: THREE.Vector3;
  readonly tail: THREE.Vector3;
  readonly tip: THREE.Vector3;
  readonly screenCorners: number[];
}

function buildWorld(): { scene: THREE.Scene; camera: CameraController; vfx: MageVFX } {
  vi.spyOn(THREE.TextureLoader.prototype, 'load').mockImplementation(() => new THREE.Texture());
  const scene = new THREE.Scene();
  const camera = new CameraController(16 / 9);
  // Mesmo enquadramento do jogo: offset (0,16,11) × zoom 1,2 = (0;19,2;13,2).
  camera.snapTo(CASTER.clone());
  camera.update(CASTER.clone(), 1);
  camera.camera.updateMatrixWorld(true);
  const vfx = new MageVFX(scene, { quality: 'high', getCamera: () => camera.camera });
  return { scene, camera, vfx };
}

function createAction(duration = 1.8): { root: THREE.Group; mixer: THREE.AnimationMixer; action: THREE.AnimationAction } {
  const root = new THREE.Group();
  const mixer = new THREE.AnimationMixer(root);
  const clip = new THREE.AnimationClip('mage basic comet test', duration, [
    new THREE.NumberKeyframeTrack('.visible', [0, duration], [1, 1]),
  ]);
  const action = mixer.clipAction(clip);
  action.setLoop(THREE.LoopOnce, 1);
  action.clampWhenFinished = true;
  action.play();
  return { root, mixer, action };
}

/** Dispara o básico a partir da ponta do cajado informada, mirando -Z. */
function fireBasic(scene: THREE.Scene, vfx: MageVFX, muzzle: THREE.Vector3) {
  const { root, mixer, action } = createAction();
  const rightHand = new THREE.Object3D();
  rightHand.name = 'mixamorig:RightHand';
  root.add(rightHand);
  const target = new THREE.Group();
  target.position.set(0, 0, -8);
  target.userData.enemyBodyScale = 1;
  vfx.cast('basic', {
    caster: root,
    rightHand,
    leftHand: null,
    action,
    target,
    fallbackDirection: AIM.clone(),
    isTargetAlive: () => true,
    resolveWeaponSocket: (output: THREE.Vector3) => {
      output.copy(muzzle);
      return true;
    },
  });
  void scene;
  return { root, mixer, action };
}

function screenY(point: THREE.Vector3, camera: CameraController): number {
  return point.clone().project(camera.camera).y;
}

/**
 * Roda o voo e mede, a cada quadro em que o cometa existe, o desenho dele.
 * O clip da Maga tem 1,8 s e o disparo sai em 36% dele (0,65 s); o tiro bate no
 * alvo de 8 m em ~0,32 s, então sobra voo suficiente para medir tudo.
 */
function fly(scene: THREE.Scene, camera: CameraController, vfx: MageVFX, mixer: THREE.AnimationMixer): Frame[] {
  const frames: Frame[] = [];
  for (let step = 0; step < 130; step += 1) {
    mixer.update(STEP);
    vfx.update(STEP);
    // No jogo quem atualiza as matrizes é o renderer; aqui fazemos na mão para
    // medir a mesma posição de mundo que o jogador vê.
    scene.updateMatrixWorld(true);
    const comet = scene.getObjectByName('MageFrostBulletComet') as THREE.Mesh | undefined;
    if (!comet || !comet.visible || !comet.parent || !comet.parent.visible) continue;
    const drawnLength = Math.abs(comet.scale.x);
    const corners: THREE.Vector3[] = [];
    for (const x of [-0.5, 0.5]) {
      for (const y of [-0.5, 0.5]) {
        corners.push(comet.localToWorld(new THREE.Vector3(x, y, 0)));
      }
    }
    const group = scene.getObjectByName('MageProjectileVFX');
    frames.push({
      step,
      drawnLength,
      head: comet.localToWorld(new THREE.Vector3(0.5, 0, 0)),
      tail: comet.localToWorld(new THREE.Vector3(-0.5, 0, 0)),
      tip: group ? group.getWorldPosition(new THREE.Vector3()) : new THREE.Vector3(NaN, NaN, NaN),
      screenCorners: corners.map((corner) => screenY(corner, camera)),
    });
  }
  return frames;
}

describe('seda do cometa do ataque básico', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('nasce curta e estica até o desenho cheio de 4,1 m em menos de 0,2 s', () => {
    const { scene, camera, vfx } = buildWorld();
    const { mixer } = fireBasic(scene, vfx, STANDING_MUZZLE.clone());
    const frames = fly(scene, camera, vfx, mixer);
    expect(frames.length).toBeGreaterThan(5);

    // No 1º quadro desenhado a seda tem ~1 m (0,6 m de partida + 0,42 m que o
    // passo de 1/60 já voou); antes desta correção vinha com os 4,1 m inteiros.
    expect(frames[0].drawnLength).toBeGreaterThan(0.6);
    expect(frames[0].drawnLength).toBeLessThan(1.1);
    expect(frames[0].drawnLength).toBeLessThan(COMET_FULL_LENGTH * 0.3);

    const full = frames.find((frame) => frame.drawnLength >= COMET_FULL_LENGTH - 1e-3);
    expect(full).toBeDefined();
    // O desenho cheio chega depois de ~3,5 m de voo (0,14 s), não no disparo.
    expect((full!.step - frames[0].step) * STEP).toBeGreaterThan(0.04);
    expect((full!.step - frames[0].step) * STEP).toBeLessThan(0.2);

    // A largura do sprite não muda: continua o dardo 3:1 da referência.
    expect(COMET_WIDTH).toBeCloseTo(1.368, 3);
    expect(COMET_FULL_LENGTH / COMET_WIDTH).toBeGreaterThan(2.9);
    vfx.dispose();
  });

  it('a cauda nunca é desenhada atrás da Maga', () => {
    for (const muzzle of [STANDING_MUZZLE, RUNNING_MUZZLE]) {
      const { scene, camera, vfx } = buildWorld();
      const { mixer } = fireBasic(scene, vfx, muzzle.clone());
      const frames = fly(scene, camera, vfx, mixer);
      expect(frames.length).toBeGreaterThan(5);
      for (const frame of frames) {
        // Posição da cauda no sentido do tiro, medida a partir da Maga:
        // positivo = à frente dela. Medido nesta correção: +0,85 m (parada) e
        // +0,38 m (correndo) no 1º quadro; com os 4,1 m nascendo prontos no
        // disparo a cauda ia para -2,8 m e -3,25 m, ou seja, atrás das costas.
        const tailForward = frame.tail.clone().sub(CASTER).dot(AIM);
        expect(tailForward).toBeGreaterThan(0.15);
        // Nem a ponta desenhada do dardo fica atrás do soquete que atirou.
        expect(frame.head.clone().sub(muzzle).dot(AIM)).toBeGreaterThan(0.1);
      }
      vfx.dispose();
    }
  });

  it('na pose parada o cometa inteiro é desenhado acima da cabeça da Maga', () => {
    const { scene, camera, vfx } = buildWorld();
    const { mixer } = fireBasic(scene, vfx, STANDING_MUZZLE.clone());
    const frames = fly(scene, camera, vfx, mixer);
    expect(frames.length).toBeGreaterThan(5);
    const headScreenY = screenY(HEAD.clone(), camera);
    const chestScreenY = screenY(CHEST.clone(), camera);
    // No 1º quadro ele já nasce acima da cabeça (medido: 0,26 contra 0,17 dela).
    for (const cornerY of frames[0].screenCorners) {
      expect(cornerY).toBeGreaterThan(headScreenY);
    }
    // E em nenhum quadro do voo a seda chega a descer até o peito (medido: 0,16
    // no pior quadro contra 0,06 do peito; com os 4,1 m prontos no disparo a
    // cauda ia para -0,15, abaixo dos pés, que ficam em -0,07).
    for (const frame of frames) {
      for (const cornerY of frame.screenCorners) {
        expect(cornerY).toBeGreaterThan(chestScreenY);
      }
    }
    vfx.dispose();
  });

  it('correndo (ponta na altura do ombro) a seda não desce até o quadril', () => {
    const { scene, camera, vfx } = buildWorld();
    const { mixer } = fireBasic(scene, vfx, RUNNING_MUZZLE.clone());
    const frames = fly(scene, camera, vfx, mixer);
    expect(frames.length).toBeGreaterThan(5);
    const waistScreenY = screenY(WAIST.clone(), camera);
    // Correndo a Maga atira com a ponta do cajado na altura do ombro, então a
    // seda passa perto do peito por construção (medido: 0,05 contra 0,06 do
    // peito e 0,01 do quadril). Com os 4,1 m prontos no disparo a cauda ia para
    // -0,30, no meio do corpo.
    for (const frame of frames) {
      for (const cornerY of frame.screenCorners) {
        expect(cornerY).toBeGreaterThan(waistScreenY);
      }
    }
    vfx.dispose();
  });

  it('a correção não mexeu no ponto de colisão nem na velocidade do tiro', () => {
    const { scene, camera, vfx } = buildWorld();
    const muzzle = STANDING_MUZZLE.clone();
    const { mixer } = fireBasic(scene, vfx, muzzle.clone());
    const frames = fly(scene, camera, vfx, mixer);
    expect(frames.length).toBeGreaterThan(5);
    let previous: number | null = null;
    for (const frame of frames) {
      expect(frame.tip.x).not.toBeNaN();
      const forward = frame.tip.clone().sub(muzzle).dot(AIM);
      // O ponto de colisão continua saindo do soquete e andando para a frente.
      expect(forward).toBeGreaterThan(-0.001);
      if (previous !== null) {
        // 25 m/s a 60 fps = 0,42 m por quadro: a correção é só do desenho.
        expect(forward - previous).toBeGreaterThan(0.3);
        expect(forward - previous).toBeLessThan(0.55);
      }
      previous = forward;
    }
    vfx.dispose();
  });
});
