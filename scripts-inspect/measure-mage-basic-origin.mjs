// Mede a origem do ataque básico da Maga no GLB real, sem decodificar Draco:
// mantém nós + animações e remove malhas/skins/imagens.
import fs from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

const GLB = 'public/models/Maga/Maga-optimized.glb';

function readChunks(buffer) {
  const buf = Buffer.from(buffer);
  const chunks = [];
  let off = 12;
  while (off < buf.length) {
    const len = buf.readUInt32LE(off);
    const type = buf.toString('ascii', off + 4, off + 8);
    chunks.push({ type, start: off + 8, len });
    off += 8 + len;
  }
  return chunks;
}

/** GLB só de hierarquia: sem malhas, skins, imagens nem extensões Draco. */
function skeletonOnly(buffer) {
  const buf = Buffer.from(buffer);
  const chunks = readChunks(buf);
  const json = JSON.parse(buf.toString('utf8', chunks[0].start, chunks[0].start + chunks[0].len));
  for (const node of json.nodes ?? []) {
    delete node.mesh;
    delete node.skin;
  }
  delete json.meshes;
  delete json.skins;
  delete json.images;
  delete json.textures;
  delete json.samplers;
  delete json.materials;
  json.extensionsUsed = (json.extensionsUsed ?? []).filter((name) => !/draco/i.test(name));
  json.extensionsRequired = (json.extensionsRequired ?? []).filter((name) => !/draco/i.test(name));
  json.materials = [];

  const jsonBytes = Buffer.from(JSON.stringify(json), 'utf8');
  const jsonPadded = Buffer.concat([jsonBytes, Buffer.alloc((4 - (jsonBytes.length % 4)) % 4, 0x20)]);
  const bin = buf.subarray(chunks[1].start, chunks[1].start + chunks[1].len);
  const binPadded = Buffer.concat([bin, Buffer.alloc((4 - (bin.length % 4)) % 4, 0)]);
  const header = Buffer.alloc(12);
  header.write('glTF', 0, 'ascii');
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(12 + 8 + jsonPadded.length + 8 + binPadded.length, 8);
  const jsonHeader = Buffer.alloc(8);
  jsonHeader.writeUInt32LE(jsonPadded.length, 0);
  jsonHeader.write('JSON', 4, 'ascii');
  const binHeader = Buffer.alloc(8);
  binHeader.writeUInt32LE(binPadded.length, 0);
  binHeader.writeUInt32LE(0x004e4942, 4);
  const out = Buffer.concat([header, jsonHeader, jsonPadded, binHeader, binPadded]);
  return out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength);
}

const gltf = await new Promise((resolve, reject) => {
  new GLTFLoader().parse(skeletonOnly(fs.readFileSync(GLB)), '', resolve, reject);
});

const model = gltf.scene;
const staff = model.getObjectByName('cajado');
const hand = model.getObjectByName('mixamorig:RightHand')
  ?? model.getObjectByName(THREE.PropertyBinding.sanitizeNodeName('mixamorig:RightHand'));
const findNode = (name) => model.getObjectByName(name)
  ?? model.getObjectByName(THREE.PropertyBinding.sanitizeNodeName(name))
  ?? null;
const hips = findNode('mixamorig:Hips');
console.log('cajado?', Boolean(staff), '| mão?', Boolean(hand), '| hips?', Boolean(hips));

// Ponta do cajado no espaço local do nó (accessor POSITION do GLB: z de -0.019 a -97.876).
const gltfJson = JSON.parse(
  Buffer.from(fs.readFileSync(GLB)).toString('utf8', 20, 20 + readChunks(fs.readFileSync(GLB))[0].len)
);
const staffNodeIndex = gltfJson.nodes.findIndex((n) => n.name === 'cajado');
const staffMesh = gltfJson.meshes[gltfJson.nodes[staffNodeIndex].mesh];
const position = gltfJson.accessors[staffMesh.primitives[0].attributes.POSITION];
console.log('POSITION min', position.min.map((v) => v.toFixed(2)), 'max', position.max.map((v) => v.toFixed(2)));

const size = position.max.map((v, i) => v - position.min[i]);
const axisIndex = size.indexOf(Math.max(...size));
const axisName = ['x', 'y', 'z'][axisIndex];
const tipLocal = position.min.map((v, i) => (v + position.max[i]) / 2);
// A ponta é a extremidade mais distante do pivô do nó (empunhadura).
tipLocal[axisIndex] = Math.abs(position.max[axisIndex]) >= Math.abs(position.min[axisIndex])
  ? position.max[axisIndex]
  : position.min[axisIndex];
console.log(`eixo longo do cajado: ${axisName}; ponta local =`, tipLocal.map((v) => v.toFixed(2)));

const clip = THREE.AnimationClip.findByName(gltf.animations, 'ataque basico');
const mixer = new THREE.AnimationMixer(model);
const action = mixer.clipAction(clip);
action.setLoop(THREE.LoopOnce, 1);
action.clampWhenFinished = true;
action.setEffectiveTimeScale(2);
action.play();

const root = new THREE.Group();
model.scale.setScalar(2.25);   // CharacterCatalog: gameScale da Maga
model.position.y = 0.9;        // gameYOffset
root.add(model);
root.updateMatrixWorld(true);

// Escala real: altura do rig já multiplicada pelo gameScale.
const head = findNode('mixamorig:Head');
head.updateWorldMatrix(true, false);
staff.updateWorldMatrix(true, false);
const rigHeight = head.getWorldPosition(new THREE.Vector3()).y;
console.log(`altura do rig (cabeça) em unidades de gameplay: ${rigHeight.toFixed(2)}`);
const shaftLength = (() => {
  const base = new THREE.Vector3();
  staff.localToWorld(base.set(0, 0, 0));
  const tip = new THREE.Vector3();
  staff.localToWorld(tip.set(tipLocal[0], tipLocal[1], tipLocal[2]));
  return base.distanceTo(tip);
})();
console.log(`comprimento do cajado em unidades de gameplay: ${shaftLength.toFixed(2)}`);

const tip = new THREE.Vector3();
const staffWorld = new THREE.Vector3();
const handWorld = new THREE.Vector3();
const hipsWorld = new THREE.Vector3();
const forward = new THREE.Vector3(0, 0, 1);
const duration = clip.duration;
const LAUNCH_FRACTION = 0.36;
const step = 1 / 60;

console.log(`\nclipe "ataque basico": duração ${duration.toFixed(3)}s (x2 => ${(duration / 2).toFixed(3)}s), lançamento em ${(LAUNCH_FRACTION * duration / 2).toFixed(3)}s`);
console.log('  t(s)   ponta(frente,altura)   mão(frente,altura)   cajado(frente,altura)');

for (let frame = 0; frame <= 120; frame++) {
  root.updateMatrixWorld(true);
  staff.localToWorld(staffWorld.set(0, 0, 0));
  staff.localToWorld(tip.set(tipLocal[0], tipLocal[1], tipLocal[2]));
  hand.getWorldPosition(handWorld);
  hips.getWorldPosition(hipsWorld);
  const relative = (point) => {
    const delta = point.clone().sub(hipsWorld);
    return `${delta.dot(forward).toFixed(2)}, ${delta.y.toFixed(2)}`;
  };
  if (frame % 5 === 0) {
    console.log(`  ${(frame * step).toFixed(2)}   [${relative(tip)}]   [${relative(handWorld)}]   [${relative(staffWorld)}]`);
  }
  if (frame === Math.round((LAUNCH_FRACTION * duration / 2) / step)) {
    console.log(`  ^^^ LANÇAMENTO (${(frame * step).toFixed(3)}s)`);
  }
  mixer.update(step);
}

// --- Comparação no quadro do lançamento: soquete atual (mão + clamps) x ponta do cajado ---
{
  const LAUNCH_TIME = LAUNCH_FRACTION * clip.duration / 2;
  const mixer2 = new THREE.AnimationMixer(model);
  const action2 = mixer2.clipAction(clip);
  action2.setLoop(THREE.LoopOnce, 1);
  action2.setEffectiveTimeScale(2);
  action2.play();
  mixer2.update(LAUNCH_TIME);
  root.rotation.y = 0;
  root.updateMatrixWorld(true);

  const caster = root.getWorldPosition(new THREE.Vector3());
  const forward = new THREE.Vector3(0, 0, 1);
  const handAnchor = hand.getWorldPosition(new THREE.Vector3());
  const tipWorld = staff.localToWorld(new THREE.Vector3(tipLocal[0], tipLocal[1], tipLocal[2]));
  const baseWorld = staff.localToWorld(new THREE.Vector3(0, 0, 0));

  // Réplica dos clamps de MageVFX.resolveCastSocketWorldPosition (estilo 'basic').
  const socket = handAnchor.clone();
  const minimumForward = 0.7;
  const relativeForward = socket.clone().sub(caster).dot(forward);
  if (relativeForward < minimumForward) socket.addScaledVector(forward, minimumForward - relativeForward);
  const minimumHeight = caster.y + 1.02;
  if (socket.y < minimumHeight) socket.y = minimumHeight;

  const describe = (label, point) => {
    const delta = point.clone().sub(caster);
    console.log(
      `  ${label.padEnd(22)} frente=${delta.dot(forward).toFixed(2)}m  altura=${delta.y.toFixed(2)}m  lado=${delta.dot(new THREE.Vector3(1, 0, 0)).toFixed(2)}m`
    );
  };
  console.log(`\nno lançamento (t=${LAUNCH_TIME.toFixed(3)}s), em metros de gameplay:`);
  describe('mão (osso)', handAnchor);
  describe('soquete atual (clamps)', socket);
  describe('base do cajado', baseWorld);
  describe('ponta do cajado', tipWorld);
  const casterGround = new THREE.Vector3(caster.x, 0, caster.z);
  console.log(`  distância do soquete ao pé: ${socket.distanceTo(casterGround).toFixed(2)}m`);
  console.log(`  distância da ponta ao pé:   ${tipWorld.distanceTo(casterGround).toFixed(2)}m`);
}

// Mesma medida com a Maga girada (oito direções): a distância não pode mudar.
console.log('\noito direções (frente relativa ao hips em unidades locais do rig):');
for (const degrees of [0, 45, 90, 135, 180, 225, 270, 315]) {
  root.rotation.y = THREE.MathUtils.degToRad(degrees);
  root.updateMatrixWorld(true);
  staff.localToWorld(tip.set(tipLocal[0], tipLocal[1], tipLocal[2]));
  const facing = new THREE.Vector3(0, 0, 1).applyQuaternion(root.quaternion);
  const delta = tip.clone().sub(hipsWorld);
  console.log(`  ${String(degrees).padStart(3)}°  ponta frente=${delta.dot(facing).toFixed(2)}  lado=${delta.dot(new THREE.Vector3(1, 0, 0).applyQuaternion(root.quaternion)).toFixed(2)}  altura=${delta.y.toFixed(2)}`);
}
