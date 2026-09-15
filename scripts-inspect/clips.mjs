// Amostra a pose da mão direita ao longo dos clipes de animação do GLB
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import fs from 'node:fs';

globalThis.self = globalThis;
globalThis.Blob = class Blob {};

const file = process.argv[2];
const buf = fs.readFileSync(file);
const loader = new GLTFLoader();
const arrayBuf = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);

loader.parse(arrayBuf, '', (gltf) => {
  const root = gltf.scene;
  console.log('=== CLIPS ===');
  for (const c of gltf.animations) {
    console.log(`- "${c.name}" duration=${c.duration.toFixed(2)}s tracks=${c.tracks.length}`);
  }
  const mixer = new THREE.AnimationMixer(root);
  const handName = 'mixamorigRightHand';

  for (const clip of gltf.animations) {
    const action = mixer.clipAction(clip);
    action.play();
    console.log(`\n=== CLIP "${clip.name}" ===`);
    for (const frac of [0, 0.25, 0.5, 0.75]) {
      action.time = frac * clip.duration;
      mixer.update(0);
      root.updateMatrixWorld(true);
      let hand = null;
      root.traverse((o) => { if (!hand && o.isBone && o.name === handName) hand = o; });
      if (!hand) { console.log('  mão não encontrada'); break; }
      const wp = hand.getWorldPosition(new THREE.Vector3());
      // eixo X da mão em mundo = direção dos dedos (na T-pose aponta para fora)
      const qx = new THREE.Vector3(1, 0, 0).applyQuaternion(hand.getWorldQuaternion(new THREE.Quaternion()));
      console.log(`  t=${frac}: handPos=(${wp.x.toFixed(3)}, ${wp.y.toFixed(3)}, ${wp.z.toFixed(3)}) handAxisX=(${qx.x.toFixed(2)}, ${qx.y.toFixed(2)}, ${qx.z.toFixed(2)})`);
    }
    action.stop();
    mixer.stopAllAction();
  }
}, (err) => console.error('PARSE ERROR', err));
