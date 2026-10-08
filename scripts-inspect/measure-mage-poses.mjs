// Mede orientação/altura do esqueleto da Maga por clipe (bind pose x clipes).
import fs from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

const GLB = 'public/models/Maga/Maga-optimized.glb';

const buf = fs.readFileSync(GLB);
const jsonLen = buf.readUInt32LE(12);
const raw = JSON.parse(buf.toString('utf8', 20, 20 + jsonLen));
for (const node of raw.nodes) {
  delete node.mesh;
  delete node.skin;
}
delete raw.meshes; delete raw.skins; delete raw.images; delete raw.textures;
delete raw.samplers; delete raw.materials;
raw.materials = [];
raw.extensionsUsed = (raw.extensionsUsed ?? []).filter((n) => !/draco/i.test(n));
raw.extensionsRequired = (raw.extensionsRequired ?? []).filter((n) => !/draco/i.test(n));
const jsonBytes = Buffer.from(JSON.stringify(raw), 'utf8');
const jsonPadded = Buffer.concat([jsonBytes, Buffer.alloc((4 - (jsonBytes.length % 4)) % 4, 0x20)]);
const binLen = buf.readUInt32LE(20 + jsonLen);
const bin = Buffer.concat([
  buf.subarray(20 + jsonLen + 8, 20 + jsonLen + 8 + binLen),
  Buffer.alloc((4 - (binLen % 4)) % 4, 0),
]);
const header = Buffer.alloc(12);
header.write('glTF', 0, 'ascii');
header.writeUInt32LE(2, 4);
header.writeUInt32LE(12 + 8 + jsonPadded.length + 8 + bin.length, 8);
const jh = Buffer.alloc(8); jh.writeUInt32LE(jsonPadded.length, 0); jh.write('JSON', 4, 'ascii');
const bh = Buffer.alloc(8); bh.writeUInt32LE(bin.length, 0); bh.writeUInt32LE(0x004e4942, 4);
const out = Buffer.concat([header, jh, jsonPadded, bh, bin]);
const glb = out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength);

const gltf = await new Promise((resolve, reject) => {
  new GLTFLoader().parse(glb, '', resolve, reject);
});
const model = gltf.scene;
const root = new THREE.Group();
model.scale.setScalar(2.25);
model.position.y = 0.9;
root.add(model);
root.updateMatrixWorld(true);

const find = (name) => model.getObjectByName(name)
  ?? model.getObjectByName(THREE.PropertyBinding.sanitizeNodeName(name))
  ?? null;
const hips = find('mixamorig:Hips');
const head = find('mixamorig:Head');
const footL = find('mixamorig:LeftFoot') ?? find('mixamorig:LeftToeBase');
const footR = find('mixamorig:RightFoot') ?? find('mixamorig:RightToeBase');

const up = new THREE.Vector3();
const describe = () => {
  root.updateMatrixWorld(true);
  hips.getWorldPosition(new THREE.Vector3());
  const q = hips.getWorldQuaternion(new THREE.Quaternion());
  up.set(0, 1, 0).applyQuaternion(q);
  const tilt = THREE.MathUtils.radToDeg(Math.acos(THREE.MathUtils.clamp(up.y, -1, 1)));
  return {
    hipsY: hips.getWorldPosition(new THREE.Vector3()).y,
    headY: head.getWorldPosition(new THREE.Vector3()).y,
    footY: Math.min(
      footL.getWorldPosition(new THREE.Vector3()).y,
      footR.getWorldPosition(new THREE.Vector3()).y
    ),
    tilt,
  };
};

const mixer = new THREE.AnimationMixer(model);
console.log('BIND POSE (sem action):', JSON.stringify(describe(), null, 0));

for (const clip of gltf.animations) {
  const before = mixer.time;
  void before;
  for (const action of mixer._actions ?? []) action.stop();
  const action = mixer.clipAction(clip);
  action.reset();
  action.setLoop(THREE.LoopOnce, 1);
  action.clampWhenFinished = true;
  action.setEffectiveWeight(1);
  action.play();
  mixer.setTime(0);
  const samples = [];
  const marks = [0, 0.25, 0.5, 0.75, 0.99];
  let last = 0;
  for (const mark of marks) {
    mixer.setTime(clip.duration * mark);
    samples.push(`${(mark * 100).toFixed(0)}%:${JSON.stringify(describe())}`);
    last = mark;
  }
  void last;
  console.log(`\n"${clip.name}" (${clip.duration.toFixed(2)}s)`);
  for (const sample of samples) console.log('   ', sample);
  action.stop();
}
