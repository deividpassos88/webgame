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
    // Rare large stains, never the repeated red freckles of the first build.
    // Most red damage is handled with separate translucent decals in the level.
    const red = Math.max(0, (staining - 0.78) * 0.48) * (mid > 0.64 ? 1 : 0);
    const value = 126 + (coarse - 0.5) * 39 + (mid - 0.5) * 27
      + (fine - 0.5) * 9 + (grain - 0.5) * 10 - crack * 36 - edgeDirt;
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
  const map = texture(pixels, size, 10, true);
  map.name = 'GothicCrackedBluestoneAlbedo';
  const bumpMap = texture(heightPixels, size, 10, false);
  bumpMap.name = 'GothicStoneEngravedMicrorelief';
  const roughnessMap = texture(roughPixels, size, 10, false);
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
  // Reuse one coherent PBR source but give masonry, carved coping and
  // recessed relief distinct local UV scales and reflectance.
  const masonryMap = map.clone(); masonryMap.repeat.set(2, 2);
  masonryMap.name = 'GothicChippedMasonryAlbedo'; masonryMap.needsUpdate = true;
  const masonryBump = bumpMap.clone(); masonryBump.repeat.set(2, 2);
  masonryBump.needsUpdate = true;
  const copingMap = map.clone(); copingMap.repeat.set(1.5, 1.5);
  copingMap.name = 'GothicCarvedCopingAlbedo'; copingMap.needsUpdate = true;
  const carvedBump = bumpMap.clone(); carvedBump.repeat.set(1.5, 1.5);
  carvedBump.needsUpdate = true;
  const wallPbr = {
    map: masonryMap, bumpMap: masonryBump, bumpScale: 0.092,
    roughness: 0.82, metalness: 0.025
  };
  return {
    floor, center,
    slab: new THREE.MeshStandardMaterial({ ...wallPbr, color: 0x8c9aa9 }),
    border: new THREE.MeshStandardMaterial({
      color: 0xaeb8bf, map: copingMap, bumpMap: carvedBump,
      bumpScale: 0.048, roughness: 0.55, metalness: 0.14
    }),
    engraving: new THREE.MeshStandardMaterial({
      color: 0x71808b, map: copingMap, bumpMap: carvedBump,
      bumpScale: 0.03, roughness: 0.65, metalness: 0.04
    }),
    darkIron: new THREE.MeshStandardMaterial({ color: 0x44484e, roughness: 0.47, metalness: 0.49 }),
    relief: new THREE.MeshStandardMaterial({ ...wallPbr, color: 0x536070, roughness: 0.9 }),
    blood: new THREE.MeshBasicMaterial({ color: 0x62282d, transparent: true,
      opacity: 0.28, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1 })
  };
}
