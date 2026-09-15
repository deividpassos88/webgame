// Compara eixos da mão direita entre os dois GLBs em T-pose e durante Idle
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import fs from 'node:fs';

globalThis.self = globalThis;
globalThis.Blob = class Blob {};
globalThis.Image = class Image {};
globalThis.document = { createElementNS: () => ({}) };
globalThis.ProgressEvent = class ProgressEvent {};

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

const v = (x) => '(' + x.toArray().map(n => n.toFixed(2)).join(', ') + ')';

for (const file of process.argv.slice(2)) {
  const gltf = await load(file);
  const root = gltf.scene;
  console.log(`\n########## ${file} ##########`);
  let hand = null;
  root.traverse((o) => { if (!hand && o.isBone && /RightHand$/.test(o.name)) hand = o; });
  if (!hand) { console.log('sem mão'); continue; }

  root.updateMatrixWorld(true);
  const q = hand.getWorldQuaternion(new THREE.Quaternion());
  console.log('T-POSE:');
  console.log('  pos ', v(hand.getWorldPosition(new THREE.Vector3())));
  console.log('  axisX', v(new THREE.Vector3(1,0,0).applyQuaternion(q)));
  console.log('  axisY', v(new THREE.Vector3(0,1,0).applyQuaternion(q)));
  console.log('  axisZ', v(new THREE.Vector3(0,0,1).applyQuaternion(q)));

  // aplica clip Idle se existir
  const clip = gltf.animations.find(c => /^idle$/i.test(c.name));
  if (clip) {
    const mixer = new THREE.AnimationMixer(root);
    const action = mixer.clipAction(clip);
    action.play();
    action.time = 0;
    mixer.update(0);
    root.updateMatrixWorld(true);
    const q2 = hand.getWorldQuaternion(new THREE.Quaternion());
    console.log(`IDLE t=0 (${clip.name}):`);
    console.log('  pos ', v(hand.getWorldPosition(new THREE.Vector3())));
    console.log('  axisX', v(new THREE.Vector3(1,0,0).applyQuaternion(q2)));
    console.log('  axisY', v(new THREE.Vector3(0,1,0).applyQuaternion(q2)));
    console.log('  axisZ', v(new THREE.Vector3(0,0,1).applyQuaternion(q2)));

    // simula o anexo: pivot com rot X+90 e arma cuja lâmina aponta +Y local
    const pivotQ = new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI/2, 0, 0));
    const bladeWorld = new THREE.Vector3(0, 1, 0).applyQuaternion(q2.multiply(pivotQ));
    console.log('  bladeDir com rotation=[pi/2,0,0]:', v(bladeWorld));
  } else {
    console.log('(sem clip idle)');
  }
}
