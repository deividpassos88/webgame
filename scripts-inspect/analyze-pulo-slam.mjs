import fs from 'fs';

const path = 'public/models/Guerreiro/guerreiro_animado.glb';
const buf = fs.readFileSync(path);
const jsonLen = buf.readUInt32LE(12);
const json = JSON.parse(buf.slice(20, 20 + jsonLen).toString('utf8'));
const bin = buf.slice(20 + jsonLen + 8);
const views = json.bufferViews;

function accessorData(accIndex) {
  const acc = json.accessors[accIndex];
  const view = views[acc.bufferView];
  const start = (view.byteOffset || 0) + (acc.byteOffset || 0);
  const compSize = { 5126: 4, 5123: 2, 5125: 4, 5121: 1 }[acc.componentType];
  const numComponents = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 }[acc.type];
  const count = acc.count * numComponents * compSize;
  return { acc, bytes: bin.slice(start, start + count) };
}

function readVec(data, i, n) {
  // O GLB tem o último acessor truncado em 4 bytes: clamp na leitura.
  const maxIndex = Math.floor(data.bytes.length / (n * 4)) - 1;
  const safeIndex = Math.max(0, Math.min(i, maxIndex));
  const out = [];
  for (let k = 0; k < n; k++) out.push(data.bytes.readFloatLE(safeIndex * n * 4 + k * 4));
  return Number.isFinite(out[0]) ? out : out.map(() => 0);
}

const nodes = json.nodes;
const parent = new Array(nodes.length).fill(-1);
for (let i = 0; i < nodes.length; i++) {
  for (const c of nodes[i].children || []) parent[c] = i;
}

const anim = json.animations.find(a => a.name === 'pulo_atacando');
console.log('interpolations:', [...new Set(anim.samplers.map(s => s.interpolation || 'LINEAR'))]);

const channels = new Map();
for (const ch of anim.channels) {
  const node = ch.target.node;
  const sampler = anim.samplers[ch.sampler];
  const input = accessorData(sampler.input);
  const output = accessorData(sampler.output);
  const times = [];
  for (let i = 0; i < input.acc.count; i++) times.push(input.bytes.readFloatLE(i * 4));
  if (!channels.has(node)) channels.set(node, {});
  channels.get(node)[ch.target.path] = { times, bytes: output.bytes, count: output.acc.count };
}

function sampleChannel(node, path, t) {
  const ch = channels.get(node)?.[path];
  const rest = nodes[node];
  const n = path === 'rotation' ? 4 : 3;
  if (!ch) {
    if (path === 'translation') return rest.translation || [0, 0, 0];
    if (path === 'rotation') return rest.rotation || [0, 0, 0, 1];
    return rest.scale || [1, 1, 1];
  }
  let i = 0;
  while (i < ch.count - 1 && ch.times[i + 1] < t) i++;
  const t0 = ch.times[i];
  const t1 = ch.times[Math.min(i + 1, ch.count - 1)];
  const a = readVec(ch, i, n);
  const b = readVec(ch, Math.min(i + 1, ch.count - 1), n);
  const alpha = t1 > t0 ? Math.min(1, Math.max(0, (t - t0) / (t1 - t0))) : 0;
  if (path === 'rotation') {
    let [x1, y1, z1, w1] = a;
    let [x2, y2, z2, w2] = b;
    let dot = x1 * x2 + y1 * y2 + z1 * z2 + w1 * w2;
    if (dot < 0) { x2 = -x2; y2 = -y2; z2 = -z2; w2 = -w2; dot = -dot; }
    if (dot > 0.9995) {
      return [x1 + (x2 - x1) * alpha, y1 + (y2 - y1) * alpha, z1 + (z2 - z1) * alpha, w1 + (w2 - w1) * alpha];
    }
    const theta = Math.acos(Math.min(1, dot));
    const s = Math.sin(theta);
    const s1 = Math.sin((1 - alpha) * theta) / s;
    const s2 = Math.sin(alpha * theta) / s;
    return [x1 * s1 + x2 * s2, y1 * s1 + y2 * s2, z1 * s1 + z2 * s2, w1 * s1 + w2 * s2];
  }
  return a.map((v, k) => v + (b[k] - v) * alpha);
}

function quatToMat(q) {
  const [x, y, z, w] = q;
  // column-major 3x3 (igual ao Matrix4 do three.js)
  return [
    1 - 2 * (y * y + z * z), 2 * (x * y + z * w), 2 * (x * z - y * w),
    2 * (x * y - z * w), 1 - 2 * (x * x + z * z), 2 * (y * z + x * w),
    2 * (x * z + y * w), 2 * (y * z - x * w), 1 - 2 * (x * x + y * y),
  ];
}

function compose(parentMat, t, q) {
  const R = quatToMat(q);
  const out = new Array(16);
  // (P·M)[c][r] = Σ_k P[c][k]·M[k][r]; R em column-major: R[k*3+r] = M[k][r].
  for (let c = 0; c < 3; c++) {
    for (let r = 0; r < 3; r++) {
      out[c * 4 + r] =
        parentMat[c * 4] * R[r] +
        parentMat[c * 4 + 1] * R[3 + r] +
        parentMat[c * 4 + 2] * R[6 + r];
    }
    out[c * 4 + 3] = 0;
  }
  out[12] = parentMat[0] * t[0] + parentMat[4] * t[1] + parentMat[8] * t[2] + parentMat[12];
  out[13] = parentMat[1] * t[0] + parentMat[5] * t[1] + parentMat[9] * t[2] + parentMat[13];
  if (!Number.isFinite(out[13])) {
    console.error('NaN EM out[13]: parentMat[1,5,9,13]=', parentMat[1], parentMat[5], parentMat[9], parentMat[13], 't=', t[0], t[1], t[2], 'R=', R.join(','));
  }
  out[14] = parentMat[2] * t[0] + parentMat[6] * t[1] + parentMat[10] * t[2] + parentMat[14];
  out[15] = 1;
  return out;
}

const handIdx = nodes.findIndex(n => n.name === 'mixamorig:RightHand');
const hipsIdx = nodes.findIndex(n => n.name === 'mixamorig:Hips');
const duration = 1.917;

const order = [];
function walk(i) { order.push(i); (nodes[i].children || []).forEach(walk); }
nodes.map((_, i) => i).filter(i => parent[i] === -1).forEach(walk);

const results = [];
const dt = 1 / 60;
for (let f = 0; f <= Math.ceil(duration / dt); f++) {
  const t = Math.min(duration, f * dt);
  const mats = new Map();
  function compute(i) {
    if (mats.has(i)) return mats.get(i);
    const tr = sampleChannel(i, 'translation', t);
    const rot = sampleChannel(i, 'rotation', t);
    const pm = parent[i] >= 0
      ? compute(parent[i])
      : [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
    const m = compose(pm, tr, rot);
    mats.set(i, m);
    return m;
  }
  const hand = compute(handIdx);
  const hips = compute(hipsIdx);
  if (f === 0) {
    // rastreia a cadeia até a mão para achar onde o NaN começa
    let chain = [];
    let cur = handIdx;
    while (cur >= 0) { chain.unshift(cur); cur = parent[cur]; }
    for (const node of chain) {
      const m = mats.get(node);
      const tr = sampleChannel(node, 'translation', t);
      const rot = sampleChannel(node, 'rotation', t);
      const bad = !Number.isFinite(m?.[13]);
      console.error(
        (bad ? '>>> NaN AQUI: ' : '    ok: ') + nodes[node].name,
        '| tr:', tr.map(v => v.toFixed(3)).join(','),
        '| rot:', rot.map(v => v.toFixed(3)).join(','),
        '| worldY:', m ? m[13] : '-'
      );
    }
  }
  results.push({ t, handY: hand[13], hipsY: hips[13] });
}

const base = results[0];
console.log('t      handY(rel)  hipsY(rel)');
for (const r of results) {
  console.log(
    r.t.toFixed(3),
    (r.handY - base.handY).toFixed(4).padStart(9),
    (r.hipsY - base.hipsY).toFixed(4).padStart(10)
  );
}
