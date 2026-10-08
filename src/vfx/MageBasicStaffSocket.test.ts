import * as THREE from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MageVFX } from './MageVFX';

/**
 * Contrato do item 1 no lado do VFX: quando o modelo informa o soquete da arma
 * (ponta do cajado), o ataque básico nasce dele — carga e projétil. As OUTRAS
 * magias continuam nos soquetes de mão já refinados, e sem o soquete o básico
 * volta para a mão (modelos sem cajado, lobby, testes).
 */
function createAction(duration = 2, timeScale = 1): {
  root: THREE.Group;
  mixer: THREE.AnimationMixer;
  action: THREE.AnimationAction;
} {
  const root = new THREE.Group();
  const mixer = new THREE.AnimationMixer(root);
  const clip = new THREE.AnimationClip('mage staff socket test', duration, [
    new THREE.NumberKeyframeTrack('.visible', [0, duration], [1, 1]),
  ]);
  const action = mixer.clipAction(clip);
  action.setLoop(THREE.LoopOnce, 1);
  action.clampWhenFinished = true;
  action.setEffectiveTimeScale(timeScale);
  action.play();
  return { root, mixer, action };
}

const HAND_POSITION = new THREE.Vector3(0.2, 0.9, 0.1);
const SOCKET_POSITION = new THREE.Vector3(0.6, 3.2, 1.1);

function castSpell(
  vfx: MageVFX,
  spellId: 'basic' | 'ice',
  options: { weaponSocket?: THREE.Vector3 | null; target?: THREE.Vector3 } = {}
): { root: THREE.Group; mixer: THREE.AnimationMixer; action: THREE.AnimationAction } {
  const { root, mixer, action } = createAction(2, 1);
  const rightHand = new THREE.Object3D();
  rightHand.name = 'mixamorig:RightHand';
  rightHand.position.copy(HAND_POSITION);
  root.add(rightHand);
  const target = new THREE.Group();
  target.position.copy(options.target ?? new THREE.Vector3(0, 0, 6));
  target.userData.enemyBodyScale = 1;
  const weaponSocket = options.weaponSocket === undefined ? SOCKET_POSITION : options.weaponSocket;
  vfx.cast(spellId, {
    caster: root,
    rightHand,
    leftHand: null,
    action,
    target,
    fallbackDirection: new THREE.Vector3(0, 0, 1),
    isTargetAlive: () => true,
    resolveWeaponSocket: weaponSocket
      ? (output: THREE.Vector3) => {
          output.copy(weaponSocket);
          return true;
        }
      : undefined,
  });
  return { root, mixer, action };
}

/** Avança até o objeto aparecer; devolve a posição do PRIMEIRO quadro dele. */
function advanceUntil(
  vfx: MageVFX,
  mixer: THREE.AnimationMixer,
  scene: THREE.Scene,
  name: string,
  maxSteps = 80,
  step = 0.02
): THREE.Vector3 | null {
  for (let index = 0; index < maxSteps; index += 1) {
    mixer.update(step);
    vfx.update(step);
    const object = scene.getObjectByName(name);
    if (object) return object.getWorldPosition(new THREE.Vector3());
  }
  return null;
}

describe('Maga: soquete da arma no ataque básico', () => {
  beforeEach(() => {
    vi.spyOn(THREE.TextureLoader.prototype, 'load').mockImplementation(() => new THREE.Texture());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('faz a carga e o tiro do básico nascerem na ponta do cajado', () => {
    const scene = new THREE.Scene();
    const vfx = new MageVFX(scene, { quality: 'high' });
    const { mixer } = castSpell(vfx, 'basic');

    const chargePosition = advanceUntil(vfx, mixer, scene, 'MageChargeOrbVFX');
    expect(chargePosition).not.toBeNull();
    expect(chargePosition!.distanceTo(SOCKET_POSITION)).toBeLessThan(0.35);
    expect(chargePosition!.distanceTo(HAND_POSITION)).toBeGreaterThan(1);

    const boltPosition = advanceUntil(vfx, mixer, scene, 'MageProjectileVFX');
    expect(boltPosition).not.toBeNull();
    // Um quadro de voo a 25 m/s = 0,5 m: o tiro tem que sair da ponta.
    expect(boltPosition!.distanceTo(SOCKET_POSITION)).toBeLessThan(0.75);
    expect(boltPosition!.distanceTo(HAND_POSITION)).toBeGreaterThan(1.5);

    // E voa na linha ponta -> alvo (origem e mira coerentes).
    const target = new THREE.Vector3(0, 0.95, 6);
    const straight = SOCKET_POSITION.distanceTo(target);
    const travelled = SOCKET_POSITION.distanceTo(boltPosition!) + boltPosition!.distanceTo(target);
    expect(travelled - straight).toBeLessThan(0.2);
    vfx.dispose();
  });

  it('volta para a mão quando o modelo não tem cajado', () => {
    const scene = new THREE.Scene();
    const vfx = new MageVFX(scene, { quality: 'high' });
    const { mixer } = castSpell(vfx, 'basic', { weaponSocket: null });

    const chargePosition = advanceUntil(vfx, mixer, scene, 'MageChargeOrbVFX');
    expect(chargePosition).not.toBeNull();
    // Soquete de mão com os clamps históricos (frente 0,7 m / altura 1,02 m).
    expect(chargePosition!.distanceTo(HAND_POSITION)).toBeLessThan(1);
    expect(chargePosition!.distanceTo(SOCKET_POSITION)).toBeGreaterThan(1.5);
    vfx.dispose();
  });

  it('mantém as outras magias nos soquetes de mão (skill 2 de gelo intacta)', () => {
    const scene = new THREE.Scene();
    const vfx = new MageVFX(scene, { quality: 'high' });
    const { mixer } = castSpell(vfx, 'ice');

    const chargePosition = advanceUntil(vfx, mixer, scene, 'MageChargeOrbVFX');
    expect(chargePosition).not.toBeNull();
    expect(chargePosition!.distanceTo(SOCKET_POSITION)).toBeGreaterThan(1.5);
    expect(chargePosition!.distanceTo(HAND_POSITION)).toBeLessThan(1);
    vfx.dispose();
  });
});
