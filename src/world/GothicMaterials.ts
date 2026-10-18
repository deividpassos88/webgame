import * as THREE from 'three';

/**
 * Dark slate/iron PBR, generated offline at level load.
 * All maps are local: no external network textures or canvas dependency.
 * Separately authored albedo, roughness and height convey wet, cracked stone.
 */
function hash(x: number, y: number): number {
  let n = (Math.imul(x, 374761393) + Math.imul(y, 668265263)) | 0;
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
}
function layer(x: number, y: number, scale: number): number {
  const xx = x / scale, yy = y / scale;
  const x0 = Math.floor(xx), y0 = Math.floor(yy), tx = xx - x0, ty = yy - y0;
  const u = tx * tx * (3 - 2 * tx), v = ty * ty * (3 - 2 * ty);
  const a = hash(x0, y0) * (1 - u) + hash(x0 + 1, y0) * u;
  const b = hash(x0, y0 + 1) * (1 - u) + hash(x0 + 1, y0 + 1) * u;
  return a * (1 - v) + b * v;
}
function texture(data: Uint8Array, size: number, repeat: number, color: boolean): THREE.DataTexture {
  const map = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  map.repeat.set(repeat, repeat);
  map.magFilter = THREE.LinearFilter;
  map.minFilter = THREE.LinearMipmapLinearFilter;
  map.generateMipmaps = true;
  map.anisotropy = 8;
  if (color) map.colorSpace = THREE.SRGBColorSpace;
  map.needsUpdate = true;
  return map;
}

export interface GothicPalette {
  floor: THREE.MeshStandardMaterial;
  center: THREE.MeshStandardMaterial;
  slab: THREE.MeshStandardMaterial;
  border: THREE.MeshStandardMaterial;
  engraving: THREE.MeshStandardMaterial;
  darkIron: THREE.MeshStandardMaterial;
  relief: THREE.MeshStandardMaterial;
  blood: THREE.MeshBasicMaterial;
}

/** Repeated material stays small in GPU memory, and microcracks are not geometry. */
export function createGothicPalette(): GothicPalette {
  const size = 512;
  const pixels = new Uint8Array(size * size * 4);
  const heightPixels = new Uint8Array(size * size * 4);
  const roughPixels = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const coarse = layer(x, y, 82);
    const mid = layer(x, y, 17);
    const fine = layer(x, y, 3);
    const grain = hash(x, y);
    const warpedX = x + (coarse - 0.5) * 16;
    const warpedY = y + (mid - 0.5) * 10;
    const crackX = Math.abs(Math.sin(warpedX * 0.115 + Math.sin(y * 0.027) * 1.6));
    const crackY = Math.abs(Math.sin(warpedY * 0.139 + Math.sin(x * 0.037) * 1.4));
    const veins = Math.min(crackX, crackY);
    const crack = veins < 0.044 && coarse < 0.69 ? 1 : 0;
    const edgeDirt = (1 - Math.abs(Math.sin(x / size * Math.PI))) * 3;
    const staining = layer(x + 195, y + 226, 37);
    const red = Math.max(0, (staining - 0.63) * 1.9) * (mid > 0.4 ? 1 : 0);
    const value = 112 + (coarse - 0.5) * 38 + (mid - 0.5) * 24
      + (fine - 0.5) * 12 + (grain - 0.5) * 11 - crack * 43 - edgeDirt;
    const n = (y * size + x) * 4;
    const r = Math.max(0, Math.min(255, value + red * 76));
    const g = Math.max(0, Math.min(255, value + 6 - red * 71));
    const b = Math.max(0, Math.min(255, value + 15 - red * 72));
    pixels[n] = r; pixels[n + 1] = g; pixels[n + 2] = b; pixels[n + 3] = 255;
    const bump = Math.round(Math.max(0, Math.min(255, 116 + coarse * 62 + mid * 20 - crack * 90)));
    heightPixels[n] = heightPixels[n + 1] = heightPixels[n + 2] = bump;
    heightPixels[n + 3] = 255;
    const wet = layer(x + 501, y + 761, 56);
    const rough = Math.round(Math.max(50, Math.min(245, 174 - wet * 56 + crack * 42)));
    roughPixels[n] = roughPixels[n + 1] = roughPixels[n + 2] = rough;
    roughPixels[n + 3] = 255;
  }
  const map = texture(pixels, size, 14, true);
  map.name = 'GothicCrackedBluestoneAlbedo';
  const bumpMap = texture(heightPixels, size, 14, false);
  bumpMap.name = 'GothicStoneEngravedMicrorelief';
  const roughnessMap = texture(roughPixels, size, 14, false);
  roughnessMap.name = 'GothicStoneVariableWetness';
  const floor = new THREE.MeshStandardMaterial({
    color: 0xb8cad5, map, bumpMap, bumpScale: 0.052,
    roughnessMap, roughness: 0.79, metalness: 0.04
  });
  floor.name = 'GothicWeatheredFloorPBR';
  const center = floor.clone();
  center.color.setHex(0x9d9c94);
  center.bumpScale = 0.065;
  center.name = 'GothicCentralWearPBR';
  return {
    floor, center,
    slab: new THREE.MeshStandardMaterial({ color: 0x46566a, roughness: 0.76, metalness: 0.04 }),
    border: new THREE.MeshStandardMaterial({ color: 0x82919b, roughness: 0.52, metalness: 0.25 }),
    engraving: new THREE.MeshStandardMaterial({ color: 0x697481, roughness: 0.58, metalness: 0.16 }),
    darkIron: new THREE.MeshStandardMaterial({ color: 0x41434b, roughness: 0.47, metalness: 0.54 }),
    relief: new THREE.MeshStandardMaterial({ color: 0x34404f, roughness: 0.83, metalness: 0.03 }),
    blood: new THREE.MeshBasicMaterial({ color: 0x62282d, transparent: true,
      opacity: 0.28, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1 })
  };
}
