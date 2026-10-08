// Inspeciona o GLB da Maga: hierarquia do cajado e a caixa local da malha.
import fs from 'node:fs';

function readGlbJson(file) {
  const buf = fs.readFileSync(file);
  let off = 12;
  while (off < buf.length) {
    const len = buf.readUInt32LE(off);
    const type = buf.toString('ascii', off + 4, off + 8);
    if (type === 'JSON') return JSON.parse(buf.toString('utf8', off + 8, off + 8 + len));
    off += 8 + len;
  }
  throw new Error('JSON chunk não encontrado');
}

const file = process.argv[2];
const gltf = readGlbJson(file);
const nodes = gltf.nodes || [];
const parentOf = new Map();
nodes.forEach((node, index) => (node.children || []).forEach((child) => parentOf.set(child, index)));

const matches = [];
nodes.forEach((node, index) => {
  if (/cajado|staff|wand/i.test(node.name || '')) matches.push(index);
});

console.log(`${file}: nodes=${nodes.length}, meshes=${(gltf.meshes || []).length}`);
console.log('matches:', matches.map((i) => `${i}:${nodes[i].name}`).join(', ') || '(nenhum)');

function path(index) {
  const chain = [];
  let current = index;
  while (current !== undefined) {
    chain.unshift(nodes[current].name || `#${current}`);
    current = parentOf.get(current);
  }
  return chain.join(' > ');
}

for (const index of matches) {
  const node = nodes[index];
  console.log(`\n--- node ${index} "${node.name}" ---`);
  console.log('  caminho:', path(index));
  console.log('  filhos:', (node.children || []).map((c) => `${c}:${nodes[c].name}`).join(', ') || '(nenhum)');
  console.log('  mesh:', node.mesh, 'skin:', node.skin, 'translation:', node.translation, 'rotation:', node.rotation, 'scale:', node.scale);

  const stack = [index];
  while (stack.length) {
    const current = stack.pop();
    const child = nodes[current];
    if (child.mesh !== undefined) {
      const mesh = gltf.meshes[child.mesh];
      console.log(`  mesh "${mesh.name}" em ${current}:${child.name} primitivas=${mesh.primitives.length}`);
      for (const primitive of mesh.primitives) {
        const accessor = gltf.accessors[primitive.attributes.POSITION];
        console.log(`    POSITION min=${accessor.min?.map((v) => v.toFixed(3))} max=${accessor.max?.map((v) => v.toFixed(3))} count=${accessor.count}`);
      }
    }
    (child.children || []).forEach((c) => stack.push(c));
  }
}
