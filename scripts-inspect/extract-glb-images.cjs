const fs = require('fs');

function extract(file, prefix) {
  const buf = fs.readFileSync(file);
  const jsonLen = buf.readUInt32LE(12);
  const json = JSON.parse(buf.slice(20, 20 + jsonLen).toString('utf8'));
  const binStart = 20 + jsonLen + 8;
  (json.images || []).forEach((img, i) => {
    const bv = json.bufferViews[img.bufferView];
    const ext = img.mimeType.includes('png') ? 'png' : 'jpg';
    const out = `/tmp/glb/${prefix}-img${i}.${ext}`;
    fs.writeFileSync(
      out,
      buf.slice(binStart + bv.byteOffset, binStart + bv.byteOffset + bv.byteLength)
    );
    console.log(out, fs.statSync(out).size, 'bytes');
  });
  // Bounds do mesh principal (POSITION accessor min/max)
  (json.meshes || []).forEach((mesh, i) => {
    const prim = mesh.primitives[0];
    const acc = json.accessors[prim.attributes.POSITION];
    console.log(`${file} mesh[${i}] bounds min=`, acc.min, 'max=', acc.max);
  });
}

extract('public/models/Maga/Maga_Lobby.glb', 'lobby');
extract('public/models/Maga/Maga-optimized.glb', 'opt');
