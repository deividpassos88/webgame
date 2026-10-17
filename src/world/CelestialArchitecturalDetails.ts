import * as THREE from 'three';

export interface CelestialArtMaterials {
  ivory: THREE.Material;
  gold: THREE.Material;
  goldSoft: THREE.Material;
  goldBright: THREE.Material;
  stone: THREE.Material;
  royalBlue: THREE.Material;
}

/** Shared, instanced reliefs: dense architectural detail without hundreds of draw calls. */
function instances(
  parent: THREE.Object3D, name: string, geometry: THREE.BufferGeometry,
  material: THREE.Material, transforms: Array<{ position: [number, number, number], rotation?: number, scale?: [number, number, number] }>
): THREE.InstancedMesh {
  const mesh = new THREE.InstancedMesh(geometry, material, transforms.length);
  mesh.name = name;
  const dummy = new THREE.Object3D();
  transforms.forEach(({ position, rotation = 0, scale = [1, 1, 1] }, i) => {
    dummy.position.set(...position);
    dummy.rotation.set(0, rotation, 0);
    dummy.scale.set(...scale);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
  });
  mesh.instanceMatrix.needsUpdate = true;
  parent.add(mesh);
  return mesh;
}

export function buildCelestialArchitectureDetails(root: THREE.Object3D, p: CelestialArtMaterials): void {
  const facade = new THREE.Group();
  facade.name = 'CelestialSculptedPlatformFacade';
  root.add(facade);
  const arches: Array<{ position: [number, number, number], rotation: number }> = [];
  const innerArches: Array<{ position: [number, number, number], rotation: number }> = [];
  const pilasters: Array<{ position: [number, number, number], rotation: number, scale: [number, number, number] }> = [];
  const jewels: Array<{ position: [number, number, number], rotation: number }> = [];
  for (let side = 0; side < 4; side++) {
    const sign = side % 2 === 0 ? -1 : 1;
    const alongX = side < 2;
    const angle = alongX ? 0 : Math.PI / 2;
    for (let k = 0; k < 15; k++) {
      const along = -22.4 + 3.2 * k;
      const center: [number, number, number] = alongX
        ? [along, -3.31, sign * 25.31] : [sign * 25.31, -3.31, along];
      arches.push({ position: center, rotation: angle });
      const secondary: [number, number, number] = alongX
        ? [along, -3.47, sign * 25.39] : [sign * 25.39, -3.47, along];
      innerArches.push({ position: secondary, rotation: angle });
      const support: [number, number, number] = alongX
        ? [along + 1.6, -2.8, sign * 25.35] : [sign * 25.35, -2.8, along + 1.6];
      pilasters.push({ position: support, rotation: angle, scale: [0.18, 2.8, 0.22] });
      jewels.push({ position: [center[0], -1.31, center[2]], rotation: angle });
    }
  }
  const light = instances(facade, 'CelestialPlatformArcades',
    new THREE.TorusGeometry(1.33, 0.125, 8, 24, Math.PI), p.ivory, arches);
  light.frustumCulled = false;
  instances(facade, 'CelestialArcadeInnerGoldInlay',
    new THREE.TorusGeometry(1.07, 0.048, 5, 20, Math.PI), p.goldSoft, innerArches);
  instances(facade, 'CelestialFacadeCarvedPilasters',
    new THREE.BoxGeometry(1, 1, 1), p.ivory, pilasters);
  instances(facade, 'CelestialFacadeGoldRosettes',
    new THREE.OctahedronGeometry(0.17, 0), p.goldBright, jewels);

  // A continuous cornice and several thinner ledges create realistic depth
  // in the floating slab. All decorative geometry is BELOW the ground.
  for (const sign of [-1, 1]) {
    const front = new THREE.Mesh(new THREE.BoxGeometry(51.5, 0.16, 0.22), p.goldSoft);
    front.position.set(0, -1.17, sign * 25.51);
    facade.add(front);
    const left = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.16, 51.5), p.goldSoft);
    left.position.set(sign * 25.51, -1.17, 0);
    facade.add(left);
  }

  // Delicate arcade rails and balusters along the inner edges of the two
  // lateral spectator galleries; remain at least 5 m beyond combat bounds.
  const rails = new THREE.Group();
  rails.name = 'CelestialGrandstandBalustrades';
  root.add(rails);
  const posts: Array<{ position: [number, number, number], rotation: number, scale: [number, number, number] }> = [];
  const collars: Array<{ position: [number, number, number], rotation: number, scale: [number, number, number] }> = [];
  for (const sign of [-1, 1]) {
    const x = sign * 30.45;
    const cap = new THREE.Mesh(new THREE.BoxGeometry(0.33, 0.22, 53.5), p.ivory);
    cap.position.set(x, 6.07, -6);
    rails.add(cap);
    const rim = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.09, 53.5), p.gold);
    rim.position.set(x, 6.24, -6);
    rails.add(rim);
    for (let n = 0; n < 54; n++) {
      const z = -32 + n * 0.96;
      posts.push({ position: [x, 5.42, z], rotation: 0, scale: [0.15, 1.22, 0.15] });
      collars.push({ position: [x, 5.95, z], rotation: 0, scale: [0.29, 0.10, 0.29] });
    }
  }
  instances(rails, 'CelestialGalleryStoneBalusters', new THREE.BoxGeometry(1, 1, 1), p.ivory, posts);
  instances(rails, 'CelestialGalleryGoldCapitals', new THREE.BoxGeometry(1, 1, 1), p.gold, collars);

  // Repeating gold accents on the grandstand terraces avoid the appearance
  // of one solid monochrome block when seen from the normal gameplay camera.
  const friezes: Array<{position: [number, number, number], rotation: number, scale: [number, number, number]}> = [];
  for (const sign of [-1, 1]) for (let row = 0; row < 9; row++) {
    friezes.push({
      position: [sign * (31.8 + row * 1.99), 4.69 + row * 0.61, -6],
      rotation: 0, scale: [0.13, 0.16, 51.0]
    });
  }
  instances(rails, 'CelestialTerraceGildedRisers',
    new THREE.BoxGeometry(1, 1, 1), p.goldSoft, friezes);
}

/**
 * Uneven tapered rock underside, instead of a perfectly smooth single cone.
 * Vertex perturbation is deterministic and performed only during loading.
 */
export function createFloatingRock(radius: number, seed: number): THREE.BufferGeometry {
  const geometry = new THREE.ConeGeometry(radius * 0.93, radius * 2.65, 24, 10);
  const positions = geometry.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i);
    const y = positions.getY(i);
    const z = positions.getZ(i);
    const angular = Math.atan2(z, x);
    const noise = Math.sin(angular * 7 + seed * 4) * 0.08
      + Math.sin(angular * 13 - y * 1.8 + seed * 11) * 0.065
      + Math.cos(angular * 17 + y * 0.72) * 0.045;
    const factor = 1 + noise;
    positions.setXYZ(i, x * factor, y + Math.sin(angular * 8 + y + seed) * 0.22, z * factor);
  }
  positions.needsUpdate = true;
  geometry.computeVertexNormals();
  return geometry;
}

export function addIslandVegetation(root: THREE.Object3D, radius: number, seed: number): void {
  const shrubs = 24;
  const mesh = new THREE.InstancedMesh(
    new THREE.IcosahedronGeometry(1, 1),
    new THREE.MeshStandardMaterial({ color: 0x69845c, roughness: 0.91 }),
    shrubs
  );
  mesh.name = 'CelestialFloatingIslandVegetation';
  const dummy = new THREE.Object3D();
  for (let i = 0; i < shrubs; i++) {
    const angle = i / shrubs * Math.PI * 2 + seed * 0.13;
    const distance = radius * (0.72 + (Math.sin(i * 18.4 + seed) + 1) * 0.067);
    const scale = radius * (0.062 + (Math.sin(i * 5.8 + seed) + 1) * 0.023);
    dummy.position.set(Math.cos(angle) * distance, 0.46, Math.sin(angle) * distance);
    dummy.scale.set(scale, scale * 0.65, scale);
    dummy.rotation.y = angle;
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
  }
  mesh.instanceMatrix.needsUpdate = true;
  root.add(mesh);
}

/** RGBA foam streaks; moving the UV offset produces water flowing downward. */
export function createCelestialWaterfallTexture(): THREE.DataTexture {
  const width = 128;
  const height = 256;
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const u = x / (width - 1);
    const v = y / height;
    const rib = Math.sin(u * 65 + Math.sin(v * 22) * 1.5) * 0.5 + 0.5;
    const streams = Math.sin(u * 111 - Math.sin(v * 18 + u * 21) * 1.9);
    const foam = Math.sin(v * 54 + u * 35);
    const edge = Math.pow(Math.max(0, Math.sin(Math.PI * u)), 0.55);
    const alpha = Math.round(THREE.MathUtils.clamp(
      (0.18 + rib * 0.43 + streams * 0.13 + foam * 0.07) * edge * 255, 0, 210));
    const i = (y * width + x) * 4;
    data[i] = 203;
    data[i + 1] = 240;
    data[i + 2] = 255;
    data[i + 3] = alpha;
  }
  const map = new THREE.DataTexture(data, width, height, THREE.RGBAFormat);
  map.name = 'CelestialStreamingWaterfalls';
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  map.repeat.set(1, 2.5);
  map.minFilter = THREE.LinearMipmapLinearFilter;
  map.magFilter = THREE.LinearFilter;
  map.generateMipmaps = true;
  map.colorSpace = THREE.SRGBColorSpace;
  map.needsUpdate = true;
  return map;
}

export function addIslandWaterfalls(
  root: THREE.Object3D, radius: number, seed: number, material: THREE.Material
): void {
  for (let i = 0; i < 2; i++) {
    const a = seed + i * Math.PI;
    const stream = new THREE.Mesh(new THREE.PlaneGeometry(radius * 0.32, radius * 3.7), material);
    stream.name = 'CelestialIslandAnimatedWaterfall';
    stream.position.set(
      Math.sin(a) * radius * 0.76, -radius * 1.85,
      Math.cos(a) * radius * 0.76
    );
    stream.rotation.y = a;
    root.add(stream);
  }
}

/** Layered inner fire makes the braziers less like solid orange game cones. */
export function enhanceCelestialFlame(flame: THREE.Mesh): void {
  const aura = new THREE.Mesh(
    new THREE.ConeGeometry(0.63, 2.2, 16),
    new THREE.MeshBasicMaterial({
      color: 0xff8736, transparent: true, opacity: 0.22,
      depthWrite: false, blending: THREE.AdditiveBlending
    })
  );
  aura.position.y = 0.15;
  aura.name = 'CelestialFlameSoftGlow';
  const core = new THREE.Mesh(
    new THREE.ConeGeometry(0.23, 1.38, 16),
    new THREE.MeshBasicMaterial({
      color: 0xfff4c2, transparent: true, opacity: 0.86,
      depthWrite: false, blending: THREE.AdditiveBlending
    })
  );
  core.position.y = -0.07;
  core.name = 'CelestialFlameLuminousCore';
  flame.add(aura, core);
}
