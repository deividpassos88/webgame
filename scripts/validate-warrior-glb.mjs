import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const requiredAnimations = [
  'ataque_basico',
  'ataque_giratorio',
  'ataque_giratorio_2',
  'caiu',
  'caminhando',
  'correndo',
  'corte_duplo',
  'morte',
  'pulo_atacando',
  'recebe_dano',
  'triplo_ataque',
  'idle_sword',
  'lobby_dwarf_idle',
];

const filePath = resolve(process.argv[2] ?? 'public/models/Guerreiro/guerreiro_animado.glb');
const bytes = readFileSync(filePath);

if (bytes.toString('ascii', 0, 4) !== 'glTF') {
  throw new Error(`${filePath} is not a binary glTF file.`);
}

const version = bytes.readUInt32LE(4);
const declaredLength = bytes.readUInt32LE(8);
if (version !== 2 || declaredLength !== bytes.length) {
  throw new Error(`Invalid GLB header (version=${version}, declared=${declaredLength}, actual=${bytes.length}).`);
}

let offset = 12;
let json;
while (offset < bytes.length) {
  const chunkLength = bytes.readUInt32LE(offset);
  const chunkType = bytes.readUInt32LE(offset + 4);
  const chunk = bytes.subarray(offset + 8, offset + 8 + chunkLength);
  if (chunkType === 0x4e4f534a) {
    json = JSON.parse(chunk.toString('utf8').trim());
    break;
  }
  offset += 8 + chunkLength;
}

if (!json) throw new Error('GLB has no JSON chunk.');

const animationNames = (json.animations ?? []).map((animation) => animation.name);
const missingAnimations = requiredAnimations.filter((name) => !animationNames.includes(name));
const duplicateAnimations = animationNames.filter((name, index) => animationNames.indexOf(name) !== index);
const nodeNames = (json.nodes ?? []).map((node) => node.name).filter(Boolean);
const nodes = json.nodes ?? [];
const swordIndexes = nodes.flatMap((node, index) =>
  node.name?.toLowerCase() === 'sword' ? [index] : []
);
const parentIndexOf = (childIndex) => nodes.findIndex((node) => node.children?.includes(childIndex));
const externalUris = [
  ...(json.buffers ?? []).map((buffer) => buffer.uri),
  ...(json.images ?? []).map((image) => image.uri),
].filter((uri) => uri && !uri.startsWith('data:'));

const failures = [];
if (missingAnimations.length) failures.push(`missing animations: ${missingAnimations.join(', ')}`);
if (duplicateAnimations.length) failures.push(`duplicate animations: ${duplicateAnimations.join(', ')}`);
if (animationNames.length !== requiredAnimations.length) failures.push(`expected ${requiredAnimations.length} animations, found ${animationNames.length}`);
const forbiddenVfxPattern = /(?:^|[_:.-])(vfx|fx|fire|ice|trail|particle|glow|spark|ribbon|impact)(?:$|[_:.-])/i;
const forbiddenVfxNodes = nodeNames.filter((name) => forbiddenVfxPattern.test(name));
if (forbiddenVfxNodes.length) {
  failures.push(`Warrior VFX nodes must not be exported: ${forbiddenVfxNodes.join(', ')}`);
}
if (!(json.skins?.length > 0)) failures.push('no skin found');
if (!(json.meshes?.length > 0)) failures.push('no mesh found');
if (swordIndexes.length !== 1) failures.push(`expected exactly one sword node, found ${swordIndexes.length}`);
if (swordIndexes.length === 1) {
  const swordParent = nodes[parentIndexOf(swordIndexes[0])]?.name;
  if (swordParent !== 'mixamorig:RightHand') {
    failures.push(`sword must be parented to mixamorig:RightHand, found ${swordParent ?? 'no parent'}`);
  }
}
if (externalUris.length) failures.push(`external resources: ${externalUris.join(', ')}`);
if ((json.animations ?? []).some((animation) => !(animation.channels?.length > 0))) failures.push('an animation has no channels');

const report = {
  file: filePath,
  bytes: bytes.length,
  mebibytes: Number((bytes.length / 1024 / 1024).toFixed(2)),
  animations: animationNames,
  nodes: nodeNames.length,
  meshes: json.meshes?.length ?? 0,
  skins: json.skins?.length ?? 0,
  embeddedImages: (json.images ?? []).filter((image) => image.bufferView !== undefined || image.uri?.startsWith('data:')).length,
  externalUris,
};

if (failures.length) {
  console.error(JSON.stringify({ ok: false, failures, ...report }, null, 2));
  process.exitCode = 1;
} else {
  console.log(JSON.stringify({ ok: true, ...report }, null, 2));
}
