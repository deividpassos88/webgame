#!/usr/bin/env node
/**
 * Câmera da ref 1: ajusta os quatro cantos do piso (medidos em
 * `docs/arena-celeste/ESPECIFICACAO-CIRURGICA.md`) E a linha do horizonte,
 * que na referência fica a ~8% do topo. Sem a restrição do horizonte a câmera
 * "correta" para o piso olha tão para baixo que o céu desaparece.
 */
import * as THREE from 'three';

const N = 1254;
const T = {
  nl: [48 / N, 852 / N], nr: [1205 / N, 852 / N],
  fl: [250 / N, 420 / N], fr: [1005 / N, 420 / N],
  horizon: 0.085,
};
const HALF = 25;

function evaluate({ h, d, ty, tz, fov }) {
  const camera = new THREE.PerspectiveCamera(fov, 1, 0.4, 4000);
  camera.position.set(0, h, d);
  camera.lookAt(0, ty, tz);
  camera.updateMatrixWorld();
  const proj = (x, y, z) => {
    const v = new THREE.Vector3(x, y, z).project(camera);
    return [(v.x + 1) / 2, (1 - v.y) / 2];
  };
  const p = {
    nl: proj(-HALF, 0, HALF), nr: proj(HALF, 0, HALF),
    fl: proj(-HALF, 0, -HALF), fr: proj(HALF, 0, -HALF),
  };
  // linha do horizonte: projeta um ponto muito distante na horizontal
  const farPoint = proj(0, h, -1e6);
  const horizon = farPoint[1];
  let err = 0;
  for (const k of ['nl', 'nr', 'fl', 'fr']) {
    err += (p[k][0] - T[k][0]) ** 2 + (p[k][1] - T[k][1]) ** 2;
  }
  err += ((horizon - T.horizon) * 1.6) ** 2;
  return { err: Math.sqrt(err), p, horizon };
}

let best = null;
for (let h = 10; h <= 60; h += 1) for (let d = 60; d <= 180; d += 2) for (let ty = -6; ty <= 14; ty += 2) for (const tz of [0, 8, 16]) for (let fov = 34; fov <= 80; fov += 1) {
  const r = evaluate({ h, d, ty, tz, fov });
  if (!best || r.err < best.err) best = { h, d, ty, tz, fov, ...r };
}
let step = { h: 1, d: 2, ty: 1, tz: 2, fov: 1 };
for (let it = 0; it < 9; it++) {
  const c = { ...best };
  for (let i = 0; i < 3; i++) for (const k of ['h', 'd', 'ty', 'tz', 'fov']) for (const s of [-1, 1]) {
    const cand = { ...c, [k]: c[k] + s * step[k] };
    if (cand.h <= 2 || cand.d <= 30) continue;
    const r = evaluate(cand);
    if (r.err < best.err) best = { ...cand, ...r };
  }
  step = Object.fromEntries(Object.entries(step).map(([k, v]) => [k, v / 2]));
}
console.log(JSON.stringify({
  camera: { position: [0, +best.h.toFixed(2), +best.d.toFixed(2)], target: [0, +best.ty.toFixed(2), +best.tz.toFixed(2)], fov: +best.fov.toFixed(2) },
  err: +best.err.toFixed(5),
  horizon: +best.horizon.toFixed(4),
  corners: Object.fromEntries(Object.entries(best.p).map(([k, v]) => [k, [(v[0] * N).toFixed(1), (v[1] * N).toFixed(1)]])),
}, null, 2));
