#!/usr/bin/env node
/**
 * Calibra a câmera da ref 1 por projeção direta.
 *
 * Alvos medidos na imagem 1254×1254 (`tools/analyze-ref.mjs`):
 *   aresta frontal do piso .......... y = 856 px
 *   aresta de fundo do piso ......... y = 410 px
 *   meia-largura na aresta frontal .. 578,5 px
 *   meia-largura na aresta de fundo . 254,5 px
 *   medalhão: meia-largura .......... 155 px, altura 182 px, centro y = 577 px
 *
 * A imagem de referência não é geometricamente perfeita, então os alvos são
 * ponderados em vez de impostos: a câmera escolhida é a que erra menos no
 * conjunto.
 */
import * as THREE from 'three';

const N = 1254;
export const TARGETS = Object.freeze({
  frontY: 856 / N,
  backY: 410 / N,
  frontHalf: 578.5 / N,
  backHalf: 254.5 / N,
  medHalf: 155 / N,
  medCenterY: 577 / N,
  medHeight: 182 / N,
});
const HALF_SIZE = 25;

export function evaluate({ h, d, ty, tz, fov, medR = 10 }) {
  const camera = new THREE.PerspectiveCamera(fov, 1, 0.4, 4000);
  camera.position.set(0, h, d);
  camera.lookAt(0, ty, tz);
  camera.updateMatrixWorld();
  const proj = (x, y, z) => {
    const v = new THREE.Vector3(x, y, z).project(camera);
    return { x: (v.x + 1) / 2, y: (1 - v.y) / 2 };
  };
  const front = proj(0, 0, HALF_SIZE);
  const back = proj(0, 0, -HALF_SIZE);
  const fl = proj(-HALF_SIZE, 0, HALF_SIZE);
  const bl = proj(-HALF_SIZE, 0, -HALF_SIZE);
  let x0 = 1, x1 = 0, y0 = 1, y1 = 0;
  for (let i = 0; i < 72; i++) {
    const a = (i / 72) * Math.PI * 2;
    const p = proj(Math.cos(a) * medR, 0, Math.sin(a) * medR);
    x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x);
    y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y);
  }
  const medHalf = (x1 - x0) / 2;
  const medHeight = y1 - y0;
  const err =
    Math.abs(front.y - TARGETS.frontY) * 3.0 +
    Math.abs(back.y - TARGETS.backY) * 3.0 +
    Math.abs((0.5 - fl.x) - TARGETS.frontHalf) * 2.4 +
    Math.abs((0.5 - bl.x) - TARGETS.backHalf) * 1.6 +
    Math.abs(medHalf - TARGETS.medHalf) * 4.0 +
    Math.abs((y0 + y1) / 2 - TARGETS.medCenterY) * 2.0 +
    Math.abs(medHeight / (medHalf * 2) - TARGETS.medHeight / (TARGETS.medHalf * 2)) * 2.0;
  return { err, front, back, fl, bl, medHalf, medHeight, medCy: (y0 + y1) / 2 };
}

function search() {
  let best = null;
  const consider = (p) => {
    const r = evaluate(p);
    if (!best || r.err < best.err) best = { ...p, ...r };
  };
  for (let h = 10; h <= 70; h += 2) {
    for (let d = 30; d <= 95; d += 2) {
      for (let ty = -8; ty <= 14; ty += 2) {
        for (const tz of [-20, -10, 0, 8]) {
          for (let fov = 28; fov <= 78; fov += 2) {
            // raio do medalhão derivado: escala horizontal no centro
            const base = evaluate({ h, d, ty, tz, fov, medR: 10 });
            const medR = 10 * (TARGETS.medHalf / base.medHalf);
            consider({ h, d, ty, tz, fov, medR: +medR.toFixed(2) });
          }
        }
      }
    }
  }
  // refino fino
  let step = { h: 1, d: 1, ty: 0.5, tz: 2, fov: 1, medR: 0.15 };
  for (let iter = 0; iter < 6; iter++) {
    const center = { ...best };
    for (let i = 0; i < 4; i++) {
      for (const key of ['h', 'd', 'ty', 'tz', 'fov', 'medR']) {
        for (const s of [-1, 1]) {
          const p = { ...center };
          p[key] = +(p[key] + s * step[key]).toFixed(3);
          consider(p);
        }
      }
    }
    step = Object.fromEntries(Object.entries(step).map(([k, v]) => [k, v / 2]));
  }
  return best;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const best = search();
  const out = {
    camera: { position: [0, +best.h.toFixed(2), +best.d.toFixed(2)], target: [0, +best.ty.toFixed(2), +best.tz.toFixed(2)], fov: +best.fov.toFixed(2) },
    medallionRadius: best.medR,
    err: +best.err.toFixed(5),
    measures: {
      frontY: +best.front.y.toFixed(4), backY: +best.back.y.toFixed(4),
      frontHalf: +(best.front.x - 0.5).toFixed(4), backHalf: +(best.back.x - 0.5).toFixed(4),
      medHalf: +best.medHalf.toFixed(4), medHeight: +best.medHeight.toFixed(4), medCy: +best.medCy.toFixed(4),
    },
    targets: TARGETS,
  };
  console.log(JSON.stringify(out, null, 2));
}
