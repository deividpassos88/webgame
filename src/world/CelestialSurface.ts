import * as THREE from 'three';

/** Procedural PBR marble: no external texture requests or image planes. */
function noise(x: number, y: number): number {
  const v = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return v - Math.floor(v);
}

function surfaceTexture(pixels: Uint8Array, size: number, srgb: boolean, repeat = 3): THREE.DataTexture {
  const texture = new THREE.DataTexture(pixels, size, size, THREE.RGBAFormat);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(repeat, repeat);
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.anisotropy = 4;
  if (srgb) texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

/**
 * Fine mineral grain and curved veins, rather than one flat, tiled color.
 * The bump map is deliberately shallow: the floor remains physically smooth.
 * Samples are deterministic so repeated loads render exactly the same surface.
 */
export function createCelestialMarble(): THREE.MeshPhysicalMaterial {
  const size = 512;
  const albedo = new Uint8Array(size * size * 4);
  const heights = new Uint8Array(size * size * 4);
  const roughness = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const u = x / size;
    const v = y / size;
    const warp = Math.sin(v * 10 + Math.sin(u * 15.8) * 1.9) * 0.036
      + Math.sin(v * 34.2 - u * 27.1) * 0.008;
    const flow = u * 17.6 + v * 10.8 + warp * 13;
    const vein = Math.pow(Math.max(0, Math.sin(flow)), 42);
    const crossVein = Math.pow(Math.max(0, Math.sin(flow * 0.51 + Math.sin(v * 33) * 0.32)), 85);
    const fine = noise(x * 0.71 + 8.6, y * 0.71 + 1.2);
    const cloudy = Math.sin(u * 17.2 + Math.sin(v * 14.5) * 1.5)
      * Math.cos(v * 19.2 - u * 2.1);
    const mineral = 2.8 * cloudy - 28 * vein - 16 * crossVein + (fine - 0.5) * 7;
    const base = THREE.MathUtils.clamp(247 + mineral, 205, 255);
    const i = (y * size + x) * 4;
    albedo[i] = Math.round(base);
    albedo[i + 1] = Math.round(Math.max(0, base - 1.2 - vein * 2));
    albedo[i + 2] = Math.round(Math.min(255, base + 1.4 + vein * 3));
    albedo[i + 3] = 255;
    const h = Math.round(THREE.MathUtils.clamp(150 - 33 * vein - 19 * crossVein + cloudy * 6, 0, 255));
    heights[i] = heights[i + 1] = heights[i + 2] = h;
    heights[i + 3] = 255;
    const r = Math.round(THREE.MathUtils.clamp(185 + vein * 22 + (fine - 0.5) * 25, 0, 255));
    roughness[i] = roughness[i + 1] = roughness[i + 2] = r;
    roughness[i + 3] = 255;
  }
  const map = surfaceTexture(albedo, size, true, 3);
  map.name = 'CelestialMarblePBRAlbedo';
  const bumpMap = surfaceTexture(heights, size, false, 3);
  bumpMap.name = 'CelestialMarbleMicroRelief';
  const roughnessMap = surfaceTexture(roughness, size, false, 3);
  roughnessMap.name = 'CelestialMarblePolishedRoughness';
  return new THREE.MeshPhysicalMaterial({
    color: 0xf4f3f2,
    map,
    bumpMap,
    bumpScale: 0.018,
    roughnessMap,
    roughness: 0.35,
    metalness: 0,
    clearcoat: 0.67,
    clearcoatRoughness: 0.22,
    envMapIntensity: 0.8
  });
}

/** Chalk-white sculpted architecture gains fine material grain and warm shade. */
export function createCelestialLimestone(): THREE.MeshStandardMaterial {
  const size = 256;
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const i = (y * size + x) * 4;
    const speckle = noise(x + 11, y + 17);
    const layers = Math.sin(y * 0.17 + Math.sin(x * 0.09) * 2);
    const value = Math.round(THREE.MathUtils.clamp(239 + layers * 3 + (speckle - 0.5) * 12, 215, 255));
    data[i] = value;
    data[i + 1] = value - 1;
    data[i + 2] = Math.min(255, value + 2);
    data[i + 3] = 255;
  }
  const map = surfaceTexture(data, size, true, 2);
  map.name = 'CelestialCarvedLimestone';
  return new THREE.MeshStandardMaterial({ color: 0xf4eee3, map, roughness: 0.61, metalness: 0.025 });
}
