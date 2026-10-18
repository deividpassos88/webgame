import * as THREE from 'three';

const clothCache = new WeakMap<THREE.Material, THREE.Material>();
function doubleSidedCloth(source: THREE.Material): THREE.Material {
  const old = clothCache.get(source);
  if (old) return old;
  const cloth = source.clone();
  cloth.side = THREE.DoubleSide;
  if (cloth instanceof THREE.MeshStandardMaterial) {
    cloth.roughness = 0.88;
    cloth.metalness = 0.01;
  }
  clothCache.set(source, cloth);
  return cloth;
}

/**
 * A fabric pennant with modeled folds, a swallowtail hem and separate gold
 * embroidery. Unlike a rigid BoxGeometry banner, light reacts to the folds.
 * All geometry is decorative, outside the traversable battle platform.
 */
export function createCelestialHangingBanner(
  parent: THREE.Object3D,
  blue: THREE.Material, gold: THREE.Material,
  x: number, y: number, z: number, alongZ: boolean,
  width = 1.9, height = 5.7
): THREE.Group {
  const banner = new THREE.Group();
  banner.position.set(x, y, z);
  banner.rotation.y = alongZ ? Math.PI / 2 : 0;
  banner.name = 'CelestialSculptedFabricBanner';
  parent.add(banner);

  const cols = 12, rows = 20;
  const vertices = new Float32Array((cols + 1) * (rows + 1) * 3);
  const uv = new Float32Array((cols + 1) * (rows + 1) * 2);
  const index:number[] = [];
  const positionAt = (u:number,v:number):[number,number,number] => {
    const tapered = 1 - Math.max(0,v-0.72) * 0.36;
    const horizontal = (u - 0.5) * width * tapered;
    const hem = v > 0.955 ? (1 - Math.abs(2*u-1)) * 0.50 : 0;
    const vertical = height * (0.5 - v) + hem;
    const fold = Math.sin(u*Math.PI*6.3 + v*1.9)*0.085
      + Math.sin(u*Math.PI*2.8 + v*4.1)*0.055;
    return [horizontal,vertical,fold * width];
  };
  for(let r=0;r<=rows;r++)for(let c=0;c<=cols;c++){
    const u=c/cols,v=r/rows;
    const k=r*(cols+1)+c;
    const p=positionAt(u,v);
    vertices.set(p,k*3);
    uv[k*2]=u;uv[k*2+1]=v;
    if(c<cols&&r<rows){
      const a=k,b=k+1,d=k+cols+1,e=d+1;
      index.push(a,d,b,b,d,e);
    }
  }
  const surface=new THREE.BufferGeometry();
  surface.setAttribute('position',new THREE.BufferAttribute(vertices,3));
  surface.setAttribute('uv',new THREE.BufferAttribute(uv,2));
  surface.setIndex(index);
  surface.computeVertexNormals();
  const cloth=new THREE.Mesh(surface,doubleSidedCloth(blue));
  cloth.name='CelestialAzureBanner';
  cloth.receiveShadow=true;
  banner.add(cloth);

  const trimPaths: THREE.Vector3[][] = [[],[]];
  for(let r=0;r<=rows;r++){
    for(const c of [0,cols]){
      const p=positionAt(c/cols,r/rows);
      trimPaths[c===0?0:1].push(new THREE.Vector3(p[0],p[1],p[2]+0.015));
    }
  }
  for(const path of trimPaths){
    const edging = new THREE.Mesh(
      new THREE.TubeGeometry(new THREE.CatmullRomCurve3(path),20,0.035,4,false),
      gold
    );
    edging.name='CelestialBannerEmbroideredGoldEdge';
    banner.add(edging);
  }
  const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.095,0.095,width+0.35,12),gold);
  rod.name='CelestialBannerGoldRail';
  rod.rotation.z=Math.PI/2;
  rod.position.set(0,height*0.5+0.12,0);
  banner.add(rod);

  // Floating relief on the front surface, not a flat paint-only symbol.
  const crest = new THREE.Mesh(new THREE.BoxGeometry(width*0.40,width*0.40,0.085),gold);
  crest.name='CelestialBannerSunCrest';
  crest.position.set(0,height*0.11,0.18);
  crest.rotation.z=Math.PI/4;
  banner.add(crest);
  const gem = new THREE.Mesh(new THREE.OctahedronGeometry(width*0.115),gold);
  gem.position.set(0,height*0.11,0.31);
  banner.add(gem);
  return banner;
}
