// Simula EXATAMENTE o attachWeaponToSocket e mede onde a ponta da arma fica no mundo
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import fs from 'node:fs';

globalThis.self = globalThis;
globalThis.Blob = class Blob {};
globalThis.Image = class Image {};
globalThis.document = { createElementNS: () => ({}) };
globalThis.ProgressEvent = class ProgressEvent {};
// DRACOLoader precisa de Worker; em Node usamos worker_threads disfarçado
import { Worker as NodeWorker } from 'node:worker_threads';
globalThis.Worker = class extends NodeWorker {
  constructor(url) {
    // converte blob:/data URL em arquivo temporário
    super(url.startsWith('data:') ? undefined : url, { eval: false });
  }
};

function load(file) {
  return new Promise((res, rej) => {
    const buf = fs.readFileSync(file);
    const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
    const loader = new GLTFLoader();
    const draco = new DRACOLoader();
    draco.setDecoderPath('http://localhost:5199/node_modules/three/examples/jsm/libs/draco/');
    draco.setDecoderConfig({ type: 'js' });
    loader.setDRACOLoader(draco);
    loader.parse(ab, '', res, rej);
  });
}

const v3 = (v) => `(${v.x.toFixed(2)}, ${v.y.toFixed(2)}, ${v.z.toFixed(2)})`;

// ---- mede bounds de um modelo de arma ----
function weaponBounds(gltf) {
  gltf.scene.updateMatrixWorld(true);
  return new THREE.Box3().setFromObject(gltf.scene);
}

const swordGltf = await load('public/models/sword.glb');
const bounds = weaponBounds(swordGltf);
const size = bounds.getSize(new THREE.Vector3());
console.log('SWORD bounds size:', v3(size));
const axis = size.x >= size.y && size.x >= size.z ? 'x' : size.y >= size.z ? 'y' : 'z';
console.log('SWORD long axis:', axis);

// ---- personagem novo (cópia na raiz, sem draco) ----
const charGltf = await load('public/models/Guerreiro/guerreiro_animado.glb');
const character = charGltf.scene;

const WEAPON_DEF_SWORD = {
  id: 'sword',
  desiredLength: 1.35,
  gripFraction: 0.12,
  rotation: [Math.PI / 2, 0, 0],
  offset: [0, 0, 0],
};

function simulate(character, clipName, label) {
  // reseta pose
  character.updateMatrixWorld(true);
  const mixer = new THREE.AnimationMixer(character);
  if (clipName) {
    const clip = charGltf.animations.find((c) => c.name === clipName);
    const action = mixer.clipAction(clip);
    action.play();
    action.time = 0;
    mixer.update(0);
  }
  character.updateMatrixWorld(true);

  // referências corporais
  const refs = {};
  character.traverse((o) => {
    if (o.isBone) {
      if (/Spine1$/.test(o.name)) refs.chest = o.getWorldPosition(new THREE.Vector3());
      if (/Head$/.test(o.name)) refs.head = o.getWorldPosition(new THREE.Vector3());
      if (/RightHand$/.test(o.name)) refs.hand = o.getWorldPosition(new THREE.Vector3());
    }
  });
  console.log(`\n=== ${label} (${clipName || 'T-pose'}) ===`);
  console.log('hand:', v3(refs.hand), ' chest:', v3(refs.chest), ' head:', v3(refs.head));

  // réplica de attachWeaponToSocket
  let socket = null;
  character.traverse((o) => { if (!socket && o.isBone && o.name === 'mixamorigRightHand') socket = o; });

  const model = swordGltf.scene.clone(true);
  model.updateMatrixWorld(true);
  const wb = new THREE.Box3().setFromObject(model);
  const wsize = wb.getSize(new THREE.Vector3());
  const longest = Math.max(wsize.x, wsize.y, wsize.z);
  const waxis = wsize.x >= wsize.y && wsize.x >= wsize.z ? 'x' : wsize.y >= wsize.z ? 'y' : 'z';
  const grip = wb.getCenter(new THREE.Vector3());
  grip[waxis] = wb.min[waxis] + wsize[waxis] * WEAPON_DEF_SWORD.gripFraction;
  model.position.sub(grip);

  const socketWorldScale = socket.getWorldScale(new THREE.Vector3());
  const normalizedScale = WEAPON_DEF_SWORD.desiredLength / longest;
  const pivot = new THREE.Group();
  pivot.scale.set(
    normalizedScale / Math.max(Math.abs(socketWorldScale.x), 0.0001),
    normalizedScale / Math.max(Math.abs(socketWorldScale.y), 0.0001),
    normalizedScale / Math.max(Math.abs(socketWorldScale.z), 0.0001)
  );
  pivot.rotation.set(...WEAPON_DEF_SWORD.rotation);
  pivot.position.set(...WEAPON_DEF_SWORD.offset);
  pivot.add(model);
  socket.add(pivot);
  character.updateMatrixWorld(true);

  // ponta da lâmina = extremo oposto ao grip ao longo do eixo longo (em espaço do modelo)
  const tipModel = wb.getCenter(new THREE.Vector3());
  tipModel[waxis] = wb.max[waxis];
  const buttModel = wb.getCenter(new THREE.Vector3());
  buttModel[waxis] = wb.min[waxis];

  const tipPivotLocal = tipModel.clone().sub(grip);
  const buttPivotLocal = buttModel.clone().sub(grip);

  const tipWorld = socket.localToWorld(tipPivotLocal.clone()); // pivot está direto sob socket com offset 0
  // cuidado: pivot tem scale/rot próprios; usar pivot.localToWorld
  pivot.updateMatrixWorld(true);
  const tipW = pivot.localToWorld(tipPivotLocal.clone());
  const buttW = pivot.localToWorld(buttPivotLocal.clone());

  console.log('tip (lâmina):', v3(tipW));
  console.log('butt (cabo): ', v3(buttW));
  const dTipHand = tipW.distanceTo(refs.hand);
  const dTipChest = tipW.distanceTo(refs.chest);
  console.log(`dist tip->hand=${dTipHand.toFixed(2)}  dist tip->chest=${dTipChest.toFixed(2)}`);
}

simulate(character, null, 'NOVO paladin');
simulate(character, 'Idle', 'NOVO paladin');

// ---- modelo antigo para comparação ----
try {
  const oldGltf = await load('public/models/dragonminer-optimized.glb');
  const oldChar = oldGltf.scene;
  simulateOld(oldGltf, oldChar);
} catch (e) {
  console.log('\nmodelo antigo falhou:', e.message);
}

function simulateOld(gltf, character) {
  const label = 'ANTIGO dragon-miner';
  character.updateMatrixWorld(true);
  const mixer = new THREE.AnimationMixer(character);
  const clip = gltf.animations.find((c) => c.name === 'idle');
  if (clip) {
    const action = mixer.clipAction(clip);
    action.play(); action.time = 0; mixer.update(0);
  }
  character.updateMatrixWorld(true);
  const refs = {};
  character.traverse((o) => {
    if (o.isBone) {
      if (/Spine1$/.test(o.name)) refs.chest = o.getWorldPosition(new THREE.Vector3());
      if (/Head$/.test(o.name)) refs.head = o.getWorldPosition(new THREE.Vector3());
      if (/RightHand$/.test(o.name)) refs.hand = o.getWorldPosition(new THREE.Vector3());
    }
  });
  console.log(`\n=== ${label} (${clip ? 'idle' : 'T-pose'}) ===`);
  console.log('hand:', v3(refs.hand), ' chest:', v3(refs.chest), ' head:', v3(refs.head));

  let socket = null;
  character.traverse((o) => { if (!socket && o.isBone && o.name === 'mixamorigRightHand') socket = o; });
  const model = swordGltf.scene.clone(true);
  model.updateMatrixWorld(true);
  const wb = new THREE.Box3().setFromObject(model);
  const wsize = wb.getSize(new THREE.Vector3());
  const longest = Math.max(wsize.x, wsize.y, wsize.z);
  const waxis = wsize.x >= wsize.y && wsize.x >= wsize.z ? 'x' : wsize.y >= wsize.z ? 'y' : 'z';
  const grip = wb.getCenter(new THREE.Vector3());
  grip[waxis] = wb.min[waxis] + wsize[waxis] * WEAPON_DEF_SWORD.gripFraction;
  model.position.sub(grip);
  const socketWorldScale = socket.getWorldScale(new THREE.Vector3());
  const normalizedScale = WEAPON_DEF_SWORD.desiredLength / longest;
  const pivot = new THREE.Group();
  pivot.scale.set(
    normalizedScale / Math.max(Math.abs(socketWorldScale.x), 0.0001),
    normalizedScale / Math.max(Math.abs(socketWorldScale.y), 0.0001),
    normalizedScale / Math.max(Math.abs(socketWorldScale.z), 0.0001)
  );
  pivot.rotation.set(...WEAPON_DEF_SWORD.rotation);
  pivot.position.set(...WEAPON_DEF_SWORD.offset);
  pivot.add(model);
  socket.add(pivot);
  character.updateMatrixWorld(true);

  const tipPivotLocal = (() => { const p = wb.getCenter(new THREE.Vector3()); p[waxis] = wb.max[waxis]; return p.sub(grip); })();
  const buttPivotLocal = (() => { const p = wb.getCenter(new THREE.Vector3()); p[waxis] = wb.min[waxis]; return p.sub(grip); })();
  pivot.updateMatrixWorld(true);
  const tipW = pivot.localToWorld(tipPivotLocal);
  const buttW = pivot.localToWorld(buttPivotLocal);
  console.log('tip (lâmina):', v3(tipW));
  console.log('butt (cabo): ', v3(buttW));
  console.log(`dist tip->hand=${tipW.distanceTo(refs.hand).toFixed(2)}  dist tip->chest=${tipW.distanceTo(refs.chest).toFixed(2)}`);
}
