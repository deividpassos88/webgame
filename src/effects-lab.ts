import * as THREE from 'three';
import { MageVFX } from './vfx/MageVFX';
import { MAGE_SPELL_PRESETS } from './vfx/VFXConfig';
import type { MageSpellId, MageSpellPreset } from './vfx/VFXTypes';

/**
 * Laboratório de efeitos: uma cena mínima que dispara o MESMO VFX do jogo, sem
 * monstros, HUD ou progressão no caminho. Serve para julgar o efeito de perto,
 * comparar camadas (selo, coluna, estilhaços) e ajustar números sem precisar
 * entrar na dungeon.
 */

const canvas = document.getElementById('lab-canvas') as HTMLCanvasElement;
const log = document.querySelector<HTMLElement>('[data-log]')!;

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setClearColor(0x05070a, 1);

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0x05070a, 20, 46);

const camera = new THREE.PerspectiveCamera(42, window.innerWidth / window.innerHeight, 0.1, 200);

// Chão simples: o selo rúnico do impacto precisa de um piso para "carimbar".
const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(60, 60),
  new THREE.MeshStandardMaterial({ color: 0x141a1c, roughness: 0.95, metalness: 0 })
);
ground.rotation.x = -Math.PI / 2;
scene.add(ground);

const grid = new THREE.GridHelper(60, 60, 0x2c3a3c, 0x1a2325);
scene.add(grid);

scene.add(new THREE.HemisphereLight(0x9fc6ff, 0x1a1a12, 0.7));
const keyLight = new THREE.DirectionalLight(0xfff0d0, 1.1);
keyLight.position.set(6, 12, 8);
scene.add(keyLight);

// Alvo: um "monstro" de treino com altura de peito (~1 m) para reproduzir o
// ponto exato onde o feitiço acerta em jogo.
const target = new THREE.Group();
target.position.set(0, 0, -6);
const targetBody = new THREE.Mesh(
  new THREE.CapsuleGeometry(0.55, 1.1, 6, 14),
  new THREE.MeshStandardMaterial({ color: 0x5b3f34, roughness: 0.85 })
);
targetBody.position.y = 1.05;
target.add(targetBody);
const targetBase = new THREE.Mesh(
  new THREE.CylinderGeometry(0.8, 0.9, 0.35, 16),
  new THREE.MeshStandardMaterial({ color: 0x39312c, roughness: 1 })
);
targetBase.position.y = 0.17;
target.add(targetBase);
scene.add(target);

const caster = new THREE.Group();
caster.position.set(0, 0, 2.4);
const staff = new THREE.Mesh(
  new THREE.CylinderGeometry(0.06, 0.06, 2.1, 8),
  new THREE.MeshStandardMaterial({ color: 0x6b5535, roughness: 0.7 })
);
staff.position.set(0.45, 1.05, 0);
staff.rotation.z = -0.18;
caster.add(staff);
const handAnchor = new THREE.Object3D();
handAnchor.position.set(0.72, 2.05, 0.1);
caster.add(handAnchor);
const casterBody = new THREE.Mesh(
  new THREE.CapsuleGeometry(0.34, 1.1, 6, 12),
  new THREE.MeshStandardMaterial({ color: 0x2c3140, roughness: 0.8 })
);
casterBody.position.y = 0.95;
caster.add(casterBody);
scene.add(caster);

// A timeline do VFX é dirigida por um AnimationAction real, então a cena de
// teste cria um clipe sintético com a mesma duração do ataque em jogo.
const mixer = new THREE.AnimationMixer(caster);
const basicClip = new THREE.AnimationClip('lab-basic-attack', 0.9, [
  new THREE.NumberKeyframeTrack('.visible', [0, 0.9], [1, 1]),
]);
const basicAction = mixer.clipAction(basicClip);
basicAction.setLoop(THREE.LoopOnce, 1);
basicAction.clampWhenFinished = true;

const vfx = new MageVFX(scene, { quality: 'high' });

const layerState = {
  runeSigil: true,
  pillar: true,
  spikes: true,
  trail: true,
};

function presetFor(spellId: MageSpellId): MageSpellPreset {
  const preset = MAGE_SPELL_PRESETS[spellId];
  const impact = preset.impact;
  return {
    ...preset,
    impact: {
      ...impact,
      runeSigil: layerState.runeSigil ? impact.runeSigil : undefined,
      pillar: layerState.pillar ? impact.pillar : undefined,
      spikes: layerState.spikes ? impact.spikes : undefined,
    },
    projectile: {
      ...preset.projectile,
      arrow: layerState.trail ? preset.projectile.arrow : undefined,
      trailLength: layerState.trail ? preset.projectile.trailLength : preset.projectile.trailLength * 0.5,
    },
  };
}

function fireBasic(): void {
  const action = basicAction;
  action.reset();
  action.setEffectiveTimeScale(1);
  action.setEffectiveWeight(1);
  action.play();
  vfx.cast(
    'basic',
    {
      caster,
      action,
      rightHand: handAnchor,
      leftHand: null,
      target,
      fallbackDirection: new THREE.Vector3(0, 0, -1),
      isTargetAlive: () => true,
      onImpact: () => {
        hitCount += 1;
        setLog(`Impactos no alvo: ${hitCount}`);
      },
    },
    presetFor('basic')
  );
}

let hitCount = 0;
let firing: number | null = null;
let zoom = 9;
let orbit = 35;

function setLog(message: string): void {
  log.textContent = message;
}

function updateCamera(): void {
  const radians = (orbit * Math.PI) / 180;
  camera.position.set(
    Math.sin(radians) * zoom,
    3.1 + zoom * 0.16,
    2.4 + Math.cos(radians) * zoom
  );
  camera.lookAt(0, 1.2, -2.6);
}

document.querySelectorAll<HTMLButtonElement>('[data-fire]').forEach((button) => {
  button.addEventListener('click', () => {
    fireBasic();
    setLog('Ataque básico disparado.');
  });
});

const burstButton = document.querySelector<HTMLButtonElement>('[data-hold]')!;
burstButton.addEventListener('click', () => {
  if (firing !== null) {
    window.clearInterval(firing);
    firing = null;
    burstButton.classList.remove('is-on');
    setLog('Rajada parada.');
    return;
  }
  fireBasic();
  // Mesmo ritmo do ataque básico em jogo (~2 golpes por segundo).
  firing = window.setInterval(fireBasic, 520);
  burstButton.classList.add('is-on');
  setLog('Rajada ligada: um golpe a cada 0,52 s.');
});

document.querySelectorAll<HTMLButtonElement>('[data-layer]').forEach((button) => {
  const key = button.dataset.layer as keyof typeof layerState;
  button.addEventListener('click', () => {
    layerState[key] = !layerState[key];
    button.setAttribute('aria-pressed', String(layerState[key]));
    button.classList.toggle('is-on', layerState[key]);
    setLog(`Camada "${key}": ${layerState[key] ? 'ligada' : 'desligada'}.`);
  });
  button.classList.add('is-on');
});

const trailButton = document.querySelector<HTMLButtonElement>('[data-toggle-trail]')!;
trailButton.classList.add('is-on');
trailButton.addEventListener('click', () => {
  layerState.trail = !layerState.trail;
  trailButton.setAttribute('aria-pressed', String(layerState.trail));
  trailButton.classList.toggle('is-on', layerState.trail);
  setLog(`Dardo e aletas: ${layerState.trail ? 'ligados' : 'desligados'}.`);
});

const turtleButton = document.querySelector<HTMLButtonElement>('[data-toggle-turtle]')!;
let toughTarget = false;
turtleButton.addEventListener('click', () => {
  toughTarget = !toughTarget;
  targetBody.material.color.set(toughTarget ? 0x35506b : 0x5b3f34);
  turtleButton.classList.toggle('is-on', toughTarget);
  setLog(toughTarget ? 'Alvo reforçado (só para leitura visual).' : 'Alvo normal.');
});

document.querySelector<HTMLInputElement>('[data-zoom]')?.addEventListener('input', (event) => {
  zoom = Number((event.currentTarget as HTMLInputElement).value);
  updateCamera();
});
document.querySelector<HTMLInputElement>('[data-orbit]')?.addEventListener('input', (event) => {
  orbit = Number((event.currentTarget as HTMLInputElement).value);
  updateCamera();
});
document.querySelector<HTMLButtonElement>('[data-reset]')?.addEventListener('click', () => {
  vfx.clear();
  hitCount = 0;
  setLog('Cena limpa.');
});

let dragging = false;
let lastX = 0;
canvas.addEventListener('pointerdown', (event) => {
  dragging = true;
  lastX = event.clientX;
});
window.addEventListener('pointerup', () => { dragging = false; });
window.addEventListener('pointermove', (event) => {
  if (!dragging) return;
  orbit = (orbit + (event.clientX - lastX) * 0.4 + 360) % 360;
  lastX = event.clientX;
  const slider = document.querySelector<HTMLInputElement>('[data-orbit]');
  if (slider) slider.value = String(Math.round(orbit));
  updateCamera();
});

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

updateCamera();

const clock = new THREE.Clock();
function frame(): void {
  const delta = Math.min(0.05, clock.getDelta());
  mixer.update(delta);
  vfx.update(delta);
  vfx.applyCameraShake(camera, delta);
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
frame();
