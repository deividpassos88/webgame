#!/usr/bin/env node
/** Converte linhas da referência (1254²) em alturas de mundo no plano z=+25. */
import * as THREE from 'three';
const cam = new THREE.PerspectiveCamera(58, 1, 0.4, 4000);
cam.position.set(0, 37.86, 63.16);
cam.lookAt(0, -4.09, 0);
cam.updateMatrixWorld();
const rows = [856, 862, 886, 900, 922, 944, 964, 1000, 1060, 1140, 1168, 1213, 1254];
for (const r of rows) {
  let lo = -40, hi = 10;
  const proj = (y) => {
    const v = new THREE.Vector3(0, y, 25).project(cam);
    return (1 - v.y) * 0.5 * 1254;
  };
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (proj(mid) < r) hi = mid; else lo = mid;
  }
  const y = (lo + hi) / 2;
  console.log(`linha ${r} px -> y = ${y.toFixed(2)} m  (dy vs piso: ${(y).toFixed(2)})`);
}
// x nas bordas do plano z=+25 e z=-25
const projX = (x, z) => {
  const v = new THREE.Vector3(x, 0, z).project(cam);
  return (v.x + 1) * 0.5 * 1254;
};
console.log('x=-25 em z=25 ->', projX(-25, 25).toFixed(1), '| x=+25 ->', projX(25, 25).toFixed(1));
console.log('x=-25 em z=-25 ->', projX(-25, -25).toFixed(1), '| x=+25 ->', projX(25, -25).toFixed(1));
