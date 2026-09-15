// Inspeciona o esqueleto dos GLBs do personagem: nomes de ossos, pose de repouso da mão direita
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import fs from 'node:fs';

// polyfill mínimo para GLTFLoader em Node
globalThis.self = globalThis;
globalThis.Blob = class Blob {};

const file = process.argv[2];
const buf = fs.readFileSync(file);
const loader = new GLTFLoader();
const arrayBuf = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);

loader.parse(arrayBuf, '', (gltf) => {
  const root = gltf.scene;
  root.updateMatrixWorld(true);
  const bones = [];
  root.traverse((o) => {
    if (o.isBone) bones.push(o);
  });
  console.log('=== BONES (' + bones.length + ') ===');
  for (const b of bones) {
    const wp = b.getWorldPosition(new THREE.Vector3());
    console.log(`${b.name}  pos=(${wp.x.toFixed(3)}, ${wp.y.toFixed(3)}, ${wp.z.toFixed(3)})`);
  }
  const hand = bones.find((b) => /RightHand$/i.test(b.name)) || null;
  if (hand) {
    console.log('\n=== RIGHT HAND LOCAL TRANSFORM ===');
    console.log(JSON.stringify({
      position: hand.position.toArray(),
      quaternion: hand.quaternion.toArray(),
      scale: hand.scale.toArray(),
    }, null, 2));
    // eixo X local em mundo (direção provável dos dedos)
    const xAxis = new THREE.Vector3(1, 0, 0).applyQuaternion(hand.getWorldQuaternion(new THREE.Quaternion()));
    const yAxis = new THREE.Vector3(0, 1, 0).applyQuaternion(hand.getWorldQuaternion(new THREE.Quaternion()));
    const zAxis = new THREE.Vector3(0, 0, 1).applyQuaternion(hand.getWorldQuaternion(new THREE.Quaternion()));
    console.log('hand world axes: X=' + xAxis.toArray().map(n=>n.toFixed(2)) + ' Y=' + yAxis.toArray().map(n=>n.toFixed(2)) + ' Z=' + zAxis.toArray().map(n=>n.toFixed(2)));
  }
}, (err) => {
  console.error('PARSE ERROR', err);
});
