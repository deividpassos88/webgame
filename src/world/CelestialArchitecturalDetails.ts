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

export function buildCelestialArchitectureDetails(
  root: THREE.Object3D, p: CelestialArtMaterials, arenaSize = 162
): void {
  const half = arenaSize / 2;
  const facade = new THREE.Group();
  facade.name = 'CelestialSculptedPlatformFacade';
  root.add(facade);

  const arcades: Array<{position:[number,number,number],rotation:number}> = [];
  const inset: Array<{position:[number,number,number],rotation:number}> = [];
  const pillars: Array<{position:[number,number,number],rotation:number,scale:[number,number,number]}> = [];
  const rosettes: Array<{position:[number,number,number],rotation:number}> = [];
  const spacing = 3.35;
  const count = Math.floor((arenaSize - 8) / spacing);
  for (let side = 0; side < 4; side++) {
    const sign = side % 2 ? 1 : -1;
    const alongX = side < 2;
    const rotation = alongX ? 0 : Math.PI / 2;
    for (let k = 0; k < count; k++) {
      const along = -(count - 1) * spacing / 2 + k * spacing;
      const makePosition = (y:number, distance:number):[number,number,number] =>
        alongX ? [along,y,sign*distance] : [sign*distance,y,along];
      arcades.push({position:makePosition(-3.35,half+0.31), rotation});
      inset.push({position:makePosition(-3.47,half+0.41), rotation});
      pillars.push({position: alongX
        ? [along+spacing/2,-2.8,sign*(half+0.35)]
        : [sign*(half+0.35),-2.8,along+spacing/2],
        rotation,scale:[0.17,3.3,0.22]});
      rosettes.push({position:makePosition(-1.31,half+0.33),rotation});
    }
  }
  const arcs=instances(facade,'CelestialPlatformArcades',
    new THREE.TorusGeometry(1.38,0.14,8,24,Math.PI),p.ivory,arcades);
  arcs.frustumCulled=false;
  instances(facade,'CelestialArcadeInnerGoldInlay',
    new THREE.TorusGeometry(1.12,0.045,6,22,Math.PI),p.goldSoft,inset);
  instances(facade,'CelestialFacadeCarvedPilasters',
    new THREE.BoxGeometry(1,1,1),p.ivory,pillars);
  instances(facade,'CelestialFacadeGoldRosettes',
    new THREE.OctahedronGeometry(0.18,0),p.goldBright,rosettes);

  for(const sign of [-1,1]){
    const edge=new THREE.Mesh(new THREE.BoxGeometry(arenaSize+1.5,0.16,0.22),p.goldSoft);
    edge.position.set(0,-1.17,sign*(half+0.51));facade.add(edge);
    const side=new THREE.Mesh(new THREE.BoxGeometry(0.22,0.16,arenaSize+1.5),p.goldSoft);
    side.position.set(sign*(half+0.51),-1.17,0);facade.add(side);
  }

  // Additional balusters along the open front edge of every gallery.
  const rails = new THREE.Group();
  rails.name = 'CelestialGrandstandBalustrades';
  root.add(rails);
  const balusters:Array<{position:[number,number,number],rotation:number,scale:[number,number,number]}>=[];
  const capitals:Array<{position:[number,number,number],rotation:number,scale:[number,number,number]}>=[];
  for(const sign of [-1,1]){
    for(const side of ['east','west','north','south']){
      for(const halfSector of [-1,1]){
        // 65m per wing, leaving a wide central vista.
        const offset=halfSector*43;
        for(let k=0;k<53;k++){
          const along=offset-31.6+k*1.2;
          const pos:[number,number,number]=side==='east'||side==='west'
            ? [sign*(half+4.1),5.6,along]
            : [along,5.6,sign*(half+4.1)];
          // Each side of the map gets only its relevant signed facade.
          if ((side==='east'&&sign!==1)||(side==='west'&&sign!==-1)
             ||(side==='north'&&sign!==-1)||(side==='south'&&sign!==1))continue;
          balusters.push({position:pos,rotation:0,scale:[0.19,1.3,0.19]});
          capitals.push({position:[pos[0],6.33,pos[2]],rotation:0,scale:[0.32,0.12,0.32]});
        }
      }
    }
  }
  instances(rails,'CelestialGalleryStoneBalusters',
    new THREE.BoxGeometry(1,1,1),p.ivory,balusters);
  instances(rails,'CelestialGalleryGoldCapitals',
    new THREE.BoxGeometry(1,1,1),p.gold,capitals);
  // No solid rail spans the open sections; the eight separate galleries retain
  // the silhouette of two independent stadiums on each side.
  const friezes:Array<{position:[number,number,number],rotation:number,scale:[number,number,number]}>=[];
  for(const sign of [-1,1])for(const wing of [-1,1])for(let row=0;row<10;row++){
    const along=wing*43;
    const distance=84.5+row*2.04;
    friezes.push({position:[sign*distance,4.88+row*0.83,along],
      rotation:0,scale:[0.12,0.16,63.8]});
    friezes.push({position:[along,4.88+row*0.83,sign*distance],
      rotation:0,scale:[63.8,0.16,0.12]});
  }
  instances(rails,'CelestialTerraceGildedRisers',
    new THREE.BoxGeometry(1,1,1),p.goldSoft,friezes);
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
