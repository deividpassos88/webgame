import * as THREE from 'three';

// Alvos medidos na referência (1254x1254, normalizado 0..1 da esquerda/baixo).
// - Borda frontal (z=+25): fica ~22% acima da base do quadro.
// - Borda distante (z=-25): ~47% da base.
// - Medalhão (r=7.4 em z=0): diâmetro ~26% da largura.
// - Tribuna (x=±30, topo y=12): encosta nas bordas laterais (~8% e ~92%).
const targets = {
  frontEdgeY: 0.22,
  farEdgeY: 0.47,
  frontEdgeWidth: 0.80,
  medallionWidth: 0.26,
};

function project(camera, p) {
  const v = p.clone().project(camera);
  return { x: (v.x + 1) / 2, y: (v.y + 1) / 2 };
}

function evaluate({ y, z, targetY, fov }) {
  const camera = new THREE.PerspectiveCamera(fov, 1, 0.4, 3000);
  camera.position.set(0, y, z);
  camera.lookAt(0, targetY, -8);
  camera.updateMatrixWorld();
  const front = project(camera, new THREE.Vector3(0, -1, 25));
  const far = project(camera, new THREE.Vector3(0, 0, -25));
  const left = project(camera, new THREE.Vector3(-30, 6, 0));
  const medL = project(camera, new THREE.Vector3(-7.4, 0, 0));
  const medR = project(camera, new THREE.Vector3(7.4, 0, 0));
  const frontL = project(camera, new THREE.Vector3(-25, 0, 25));
  const frontR = project(camera, new THREE.Vector3(25, 0, 25));
  const medallionWidth = Math.abs(medR.x - medL.x);
  const frontWidth = Math.abs(frontR.x - frontL.x);
  const err =
    Math.abs(front.y - targets.frontEdgeY) * 2.2 +
    Math.abs(medallionWidth - targets.medallionWidth) * 2.6 +
    Math.abs(frontWidth - targets.frontEdgeWidth) * 1.2 +
    Math.abs(far.y - targets.farEdgeY) * 0.8;
  return { err, front, far, left, medallionWidth, frontWidth };
}

const results = [];
for (let y = 2; y <= 30; y += 1) {
  for (let z = 30; z <= 90; z += 2) {
    for (let targetY = -2; targetY <= 10; targetY += 1) {
      for (let fov = 30; fov <= 95; fov += 2) {
        const r = evaluate({ y, z, targetY, fov });
        results.push({ y, z, targetY, fov, err: r.err });
      }
    }
  }
}
results.sort((a, b) => a.err - b.err);
for (const best of results.slice(0, 5)) {
  const detail = evaluate(best);
  console.log(JSON.stringify({ ...best, ...detail }, (k, v) =>
    typeof v === 'number' ? Number(v.toFixed(4)) : v
  ));
}
