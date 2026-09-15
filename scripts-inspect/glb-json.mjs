// Lê o chunk JSON do GLB diretamente (sem decodificar malha) e analisa animações
import fs from 'node:fs';

function readGlbJson(file) {
  const buf = fs.readFileSync(file);
  // header 12 bytes, depois chunks: [len(4), type(4), data]
  let off = 12;
  while (off < buf.length) {
    const len = buf.readUInt32LE(off);
    const type = buf.toString('ascii', off + 4, off + 8);
    if (type === 'JSON') {
      return JSON.parse(buf.toString('utf8', off + 8, off + 8 + len));
    }
    off += 8 + len;
  }
  throw new Error('JSON chunk não encontrado');
}

for (const file of process.argv.slice(2)) {
  const gltf = readGlbJson(file);
  console.log(`\n########## ${file} ##########`);
  const nodes = gltf.nodes || [];
  console.log(`nodes=${nodes.length}, animations=${(gltf.animations||[]).length}, meshes=${(gltf.meshes||[]).length}`);

  // acessors usados por animações de posição do Hips
  for (const [ai, anim] of (gltf.animations || []).entries()) {
    console.log(`\n--- anim[${ai}] "${anim.name}" channels=${anim.channels.length} ---`);
    for (const ch of anim.channels) {
      if (!ch.target.node && ch.target.node !== 0) continue;
      const node = nodes[ch.target.node];
      if (ch.target.path === 'translation' && /hips/i.test(node.name || '')) {
        const samp = anim.samplers[ch.sampler];
        const acc = gltf.accessors[samp.output];
        console.log(`  Hips translation output accessor: count=${acc.count} min=${JSON.stringify(acc.min)} max=${JSON.stringify(acc.max)}`);
        // lê os valores reais do buffer
        const bv = gltf.bufferViews[acc.bufferView];
        const buffers = gltf.buffers[0];
        // assume buffer 0 = o próprio arquivo (bin chunk)
        // precisa ler bin chunk também:
      }
    }
  }

  // hierarquia raiz
  const roots = gltf.scenes[gltf.scene || 0].nodes;
  console.log('\nroot nodes:', roots.map(i => nodes[i].name).join(', '));
  // mão direita: transform local
  const handIdx = nodes.findIndex(n => /RightHand$/.test(n.name || ''));
  if (handIdx >= 0) {
    const h = nodes[handIdx];
    console.log(`\nRightHand local: t=${JSON.stringify(h.translation)} r=${JSON.stringify(h.rotation)} s=${JSON.stringify(h.scale)}`);
  }
}
