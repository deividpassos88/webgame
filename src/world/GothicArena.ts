import * as THREE from 'three';
import { createGothicPalette, type GothicPalette } from './GothicMaterials';
import { buildGothicFloorDetail, buildGothicCathedralDetails } from './GothicRefinement';
import { finishGothicBossSanctum } from './GothicBossFinish';
import { createGothicStormSky } from './GothicSky';

/**
 * Ruined Gothic Coliseum / reference 20261018.
 * Real 3D stone masonry and raised engraved floor, not a photographic plane.
 * The combat ground remains a single uninterrupted clickable 162x162 surface.
 */
export const GOTHIC_ARENA_SIZE = 162;
export const GOTHIC_ARENA_HALF = 81;
export const GOTHIC_CENTER_RADIUS = 30.5;
export const GOTHIC_BOSS_DAIS = { x: 51, z: -57, radius: 19, height: 0.68 } as const;

function stone(parent: THREE.Object3D, name: string, mat: THREE.Material,
  x: number, y: number, z: number, width: number, height: number, depth: number): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), mat);
  mesh.name = name;
  mesh.position.set(x, y, z);
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

function radialArc(
  inner: number, outer: number, height: number,
  startAngle = 0, sweep = Math.PI * 2, steps = 128
): THREE.ExtrudeGeometry {
  // Outer ring counterclockwise, inner ring clockwise. Genuine raised bevel/
  // riser geometry, not decal-only texture.
  const shape = new THREE.Shape();
  shape.moveTo(outer * Math.cos(startAngle), outer * Math.sin(startAngle));
  shape.absarc(0, 0, outer, startAngle, startAngle + sweep, false);
  for (let k = steps; k >= 0; k--) {
    const angle = startAngle + sweep * k / steps;
    shape.lineTo(inner * Math.cos(angle), inner * Math.sin(angle));
  }
  shape.closePath();
  return new THREE.ExtrudeGeometry(shape, {
    steps: 1, depth: height, bevelEnabled: false, curveSegments: steps
  });
}

function ring(parent: THREE.Object3D, name: string, mat: THREE.Material,
  x: number, z: number, inner: number, outer: number, top = 0.08,
  start = 0, sweep = Math.PI * 2): THREE.Mesh {
  const mesh = new THREE.Mesh(radialArc(inner, outer, top - 0.013, start, sweep), mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(x, 0.013, z);
  mesh.name = name;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

function circularTrim(parent: THREE.Object3D, name: string, mat: THREE.Material,
  x: number, y: number, z: number, radius: number, tube = 0.09,
  arc = Math.PI * 2, start = 0): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.TorusGeometry(radius, tube, 7, 144, arc), mat);
  mesh.name = name;
  mesh.position.set(x, y, z);
  mesh.rotation.set(-Math.PI / 2, 0, start);
  parent.add(mesh);
  return mesh;
}

function slabLine(parent: THREE.Object3D, name: string, mat: THREE.Material,
  r1: number, r2: number, a: number, centerX = 0, centerZ = 0, thickness = 0.13,
  height = 0.08): THREE.Mesh {
  const mid = (r1 + r2) / 2;
  const mesh = stone(parent, name, mat,
    centerX + Math.sin(a) * mid, height, centerZ + Math.cos(a) * mid,
    thickness, 0.045, r2 - r1);
  mesh.rotation.y = a;
  return mesh;
}

function instanced(
  parent: THREE.Object3D, name: string, geometry: THREE.BufferGeometry,
  material: THREE.Material, matrices: THREE.Matrix4[]
): THREE.InstancedMesh {
  const mesh = new THREE.InstancedMesh(geometry, material, matrices.length);
  mesh.name = name;
  for (let i = 0; i < matrices.length; i++) mesh.setMatrixAt(i, matrices[i]);
  mesh.instanceMatrix.needsUpdate = true;
  mesh.frustumCulled = false;
  parent.add(mesh);
  return mesh;
}
function transform(x: number, y: number, z: number, sx: number, sy: number, sz: number,
  yaw = 0, tilt = 0): THREE.Matrix4 {
  const euler = new THREE.Euler(tilt, yaw, 0);
  return new THREE.Matrix4().compose(new THREE.Vector3(x, y, z),
    new THREE.Quaternion().setFromEuler(euler), new THREE.Vector3(sx, sy, sz));
}
function seeded(i: number): number {
  const n = Math.sin(i * 127.1 + 71.23) * 43758.5453;
  return n - Math.floor(n);
}

export class GothicArena {
  public readonly group = new THREE.Group();
  public readonly groundMeshes: THREE.Object3D[] = [];
  public readonly ambientTorches: THREE.PointLight[] = [];
  public readonly flameVisuals: THREE.Mesh[] = [];
  private readonly p: GothicPalette;

  constructor() {
    this.group.name = 'GothicRuinedColiseum162m';
    this.p = createGothicPalette();
    createGothicStormSky(this.group);
    this.buildFloor();
    this.buildEngravedCombatCircle();
    this.buildRadialSpokes();
    buildGothicFloorDetail(this.group, this.p);
    this.buildBossDais();
    // Sculpted vaulted bays replace the previous primitive rectangular wall.
    buildGothicCathedralDetails(this.group, this.p);
    this.buildDistantRuins();
    this.buildStains();
  }

  private buildFloor(): void {
    const p = this.p;
    stone(this.group, 'GothicUnderstructure', p.slab, 0, -3.5, 0, 163, 7, 163);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(GOTHIC_ARENA_SIZE, GOTHIC_ARENA_SIZE), p.floor);
    floor.name = 'GothicPlayableStoneFloor';
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = 0.012;
    floor.receiveShadow = true;
    floor.userData.isGround = true;
    this.groundMeshes.push(floor);
    this.group.add(floor);

    // Even the ordinary slabs have real raised fine grout grooves and
    // staggered joints, sparsely batched to keep GPU draw calls low.
    const seams: THREE.Matrix4[] = [];
    for (let k = -7; k <= 7; k++) {
      const d = k * 11;
      seams.push(transform(d, 0.031, 0, 0.048, 0.009, 160));
      seams.push(transform(0, 0.029, d, 160, 0.009, 0.043));
    }
    instanced(this.group, 'GothicChiselledFloorJoints',
      new THREE.BoxGeometry(1,1,1), p.relief, seams);
  }

  private buildEngravedCombatCircle(): void {
    const p = this.p;
    const center = new THREE.Mesh(new THREE.CircleGeometry(GOTHIC_CENTER_RADIUS, 160), p.center);
    center.rotation.x = -Math.PI / 2;
    center.position.y = 0.057;
    center.name = 'GothicCentralWornStoneDisc';
    center.receiveShadow = true;
    this.group.add(center);

    // Real stone annuli, with visible stepped edges and metal-hued inlaid
    // grooves. Reference reads: smooth center -> engraved ring -> tiled ring.
    ring(this.group, 'GothicInnerReliefRing', p.border, 0, 0, 30.6, 31.12, 0.125);
    ring(this.group, 'GothicRuneFrieze', p.slab, 0, 0, 31.22, 33.7, 0.115);
    ring(this.group, 'GothicOuterRaisedCircle', p.border, 0, 0, 33.72, 34.12, 0.138);
    ring(this.group, 'GothicRadialBluestoneTiles', p.slab, 0, 0, 34.2, 42.2, 0.065);
    ring(this.group, 'GothicOuterFineBand', p.border, 0, 0, 42.15, 42.48, 0.105);
    for (const [radius, tube] of [[30.48,0.075],[31.15,0.05],[33.69,0.06],[34.22,0.05],[42.38,0.045]] as const)
      circularTrim(this.group, 'GothicInlaidMetalRing', p.darkIron, 0, 0.13, 0, radius, tube);

    const runeMats: THREE.Matrix4[] = [];
    const outerJoints: THREE.Matrix4[] = [];
    const glyphs: THREE.Matrix4[] = [];
    const dummy = new THREE.Object3D();
    for (let i = 0; i < 96; i++) {
      const a = i / 96 * Math.PI * 2;
      // Repeating genuine raised etched bar runes on inner stone frieze.
      const r = 32.37;
      const x = Math.sin(a) * r, z = Math.cos(a) * r;
      runeMats.push(transform(x, 0.125, z, 0.115, 0.015, i % 3 === 0 ? 0.99 : 0.66, a + Math.PI/2));
      if (i % 2 === 0) {
        glyphs.push(transform(Math.sin(a + 0.014) * r, 0.135, Math.cos(a + 0.014) * r,
          0.42, 0.013, 0.09, a + Math.PI / 2 + 0.62));
      }
      const b = 34.31, e = 42.08;
      outerJoints.push(transform(Math.sin(a) * (b + e)/2, 0.079, Math.cos(a) * (b + e)/2,
        0.05, 0.014, e-b, a));
    }
    instanced(this.group, 'GothicChiseledRuneBorder',
      new THREE.BoxGeometry(1,1,1), p.engraving, runeMats);
    instanced(this.group, 'GothicRuneChevronSymbols',
      new THREE.BoxGeometry(1,1,1), p.darkIron, glyphs);
    instanced(this.group, 'GothicConcentricTileJoints',
      new THREE.BoxGeometry(1,1,1), p.border, outerJoints);
    dummy.position.set(0,0,0);
  }

  private buildRadialSpokes(): void {
    const p = this.p;
    const carved: THREE.Matrix4[] = [];
    const knots: THREE.Matrix4[] = [];
    for (let i = 0; i < 8; i++) {
      const a = i / 8 * Math.PI * 2 + Math.PI/8;
      // Eight substantial raised stone ribs radiate from the circular frieze.
      slabLine(this.group, 'GothicRaisedRadialSpoke', p.border, 34.0, 79.3, a, 0, 0, 1.55, 0.16);
      slabLine(this.group, 'GothicSpokeEngravedChannel', p.slab, 34.0, 79.2, a, 0, 0, 0.85, 0.212);
      slabLine(this.group, 'GothicSpokeFineIronInlay', p.darkIron, 34.1, 79.1, a, 0, 0, 0.055, 0.245);
      for (let k = 0; k < 18; k++) {
        const r = 37 + k * 2.35;
        const x = Math.sin(a) * r, z = Math.cos(a) * r;
        carved.push(transform(x,0.239,z,0.38,0.018,0.075,a + Math.PI/2 + (k%2 ? 0.6 : -0.6)));
      }
      for (const rad of [43,65]) {
        knots.push(transform(Math.sin(a)*rad,0.23,Math.cos(a)*rad,0.82,0.09,0.82,a + Math.PI/4));
      }
    }
    instanced(this.group,'GothicSpokeEtchedTriangles',
      new THREE.BoxGeometry(1,1,1),p.engraving,carved);
    instanced(this.group,'GothicSpokeDiamondKnots',
      new THREE.BoxGeometry(1,1,1),p.border,knots);
  }

  private buildBossDais(): void {
    const p=this.p;
    const {x,z,radius,height} = GOTHIC_BOSS_DAIS;
    const area = new THREE.Group();
    area.name = 'GothicRaisedBossSanctum';
    this.group.add(area);
    // Extrusion rotates local Y into negative world Z: orient semicircle toward the player.
    const a = Math.atan2(z, -x);
    const start = a - Math.PI/2;
    // Four physical semi-circular steps, 17cm each, matching the reference.
    // They face the center and never change the flat wave-spawn surfaces.
    for (let i=0;i<4;i++) {
      const inner = radius + i*1.7;
      const outer = inner + 1.78;
      const top = Math.max(0.16,height - i*0.17);
      const stair = ring(area,'GothicBossCurvedStair'+(i+1),
        i%2 ? p.border : p.slab,x,z,inner,outer,top,start,Math.PI);
      stair.userData.stepHeight = top;
      circularTrim(area,'GothicBossStepLip',p.border,x,top+0.015,z,
        outer,0.08,Math.PI,start);
    }
    const cylinder = new THREE.Mesh(
      new THREE.CylinderGeometry(radius,radius,height,128),p.slab
    );
    cylinder.name='GothicBossPlatformRealElevation';
    cylinder.position.set(x,height/2,z);
    cylinder.receiveShadow=true;
    area.add(cylinder);
    const surface = new THREE.Mesh(new THREE.CircleGeometry(radius-0.36,128),p.center);
    surface.name='GothicBossDiscEngravedSurface';
    surface.rotation.x=-Math.PI/2;
    surface.position.set(x,height+0.014,z);
    area.add(surface);
    for (const [inner,outer] of [[radius-2.4,radius-2.0],[radius-1.1,radius-0.92]] as const)
      ring(area,'GothicBossSanctumInlay',p.border,x,z,inner,outer,height+0.082);
    for(const radius2 of [radius-3.0,radius-1.12])
      circularTrim(area,'GothicBossStoneCarving',p.darkIron,x,height+0.1,z,radius2,0.065);

    for (let i=0;i<10;i++) {
      const theta=i/10*Math.PI*2;
      const px=x+Math.sin(theta)*(radius+1.4),pz=z+Math.cos(theta)*(radius+1.4);
      stone(area,'GothicBossPillarPedestal',p.slab,px,0.79,pz,2.3,1.58,2.3);
      const finial = new THREE.Mesh(new THREE.ConeGeometry(0.62,2.6,4),p.border);
      finial.rotation.y=Math.PI/4;
      finial.position.set(px,2.8,pz);
      finial.name='GothicBossPointedStoneFinial';
      area.add(finial);
    }
    // Individual bevelled treads, fine engravings and real joints replace
    // the previously oversized wheel-like spokes on the boss platform.
    finishGothicBossSanctum(this.group,p,x,z,radius,height);
  }

  private buildGothicCathedralWalls(): void {
    const p=this.p;
    const cathedral=new THREE.Group();
    cathedral.name='GothicCathedralPerimeter';
    this.group.add(cathedral);

    // Back vaults are split into readable bays. Dark recesses behind stone
    // arches add perspective; light enters from left ruined openings.
    for(let i=0;i<13;i++){
      const x=(i-6)*12.4;
      const z=-87.5;
      stone(cathedral,'GothicBackWallButtress',p.slab,x,15.5,z-0.6,2.1,31,4.6);
      stone(cathedral,'GothicBackWallMasonry',p.slab,x+6.2,24.0,z-2.2,10.5,14,2.3);
      stone(cathedral,'GothicShadowedArchRecess',p.relief,x+6.2,12,z-0.95,8.7,23.3,0.6);
      // Tall pointed arches are formed from two slanted masonry ribs.
      stone(cathedral,'GothicArcadeJamb',p.border,x+2.45,11.2,z+0.12,0.73,21,0.82);
      stone(cathedral,'GothicArcadeJamb',p.border,x+9.95,11.2,z+0.12,0.73,21,0.82);
      const left=stone(cathedral,'GothicPointedArchVoussoir',p.border,
        x+4.35,24.5,z+0.18,0.78,10.1,0.98);
      left.rotation.z=-0.42;
      const right=stone(cathedral,'GothicPointedArchVoussoir',p.border,
        x+8.05,24.5,z+0.18,0.78,10.1,0.98);
      right.rotation.z=0.42;
      stone(cathedral,'GothicVaultedWallCornice',p.darkIron,x+6.2,31.3,z,12.1,0.45,4.0);
      if(i%2===0) {
        const crest = new THREE.Mesh(new THREE.OctahedronGeometry(1.1,0),p.darkIron);
        crest.name='GothicVaultDiamondSigil';
        crest.scale.set(0.85,1.9,0.25);
        crest.position.set(x+6.2,16.7,z+0.42);
        cathedral.add(crest);
      }
    }
    // Huge side flying-buttresses with a distant open valley toward the left.
    for(const sign of [-1,1]){
      for(let i=0;i<8;i++) {
        const z=-72+i*19;
        const x=sign*84.8;
        stone(cathedral,'GothicOuterWallPier',p.slab,x,12,z,5.8,24,5.5);
        stone(cathedral,'GothicPierBase',p.border,x,1.9,z,6.7,3.9,6.5);
        stone(cathedral,'GothicPierCapital',p.border,x,24.2,z,7.1,1.5,7.1);
        const top=stone(cathedral,'GothicSidePointedButtress',p.slab,x,30.6,z,2.4,11,2.4);
        top.rotation.z=sign*0.17;
        if(i<7 && (sign===1 || i%3!==1)) {
          stone(cathedral,'GothicFlyingButtress',p.slab,x,22.4,z+9.5,2.5,2.2,15.0);
          stone(cathedral,'GothicRaisedGalleryParapet',p.border,x,24.5,z+9.5,1.0,2.3,15.0);
        }
      }
    }
    // Tiered walls visible behind the dais on the back right.
    // Retired: the oversized artificial crescent arcs obscured the reference floor.
  }

  private buildDistantRuins():void {
    const p=this.p;
    const distant=new THREE.Group();
    distant.name='GothicRuinedBridgesInMist';
    this.group.add(distant);
    const backdrop=[
      [-130,-182,45],[-157,-214,65],[-112,-254,49],[-220,-203,83]
    ] as const;
    for(const [x,z,h] of backdrop){
      stone(distant,'GothicDistantBrokenTower',p.slab,x,h/2-8,z,13,h,12);
      stone(distant,'GothicDistantArchWindow',p.relief,x,h/2+4,z+6.2,5.2,h*0.48,0.5);
      const spire = new THREE.Mesh(new THREE.ConeGeometry(7,24,4),p.slab);
      spire.name='GothicDistantRuinedSpire';
      spire.position.set(x,h+3,z);
      distant.add(spire);
    }
    for(let i=0;i<5;i++){
      stone(distant,'GothicDistantArcadeBridge',p.slab,-195+i*19,28,-205,17,3.5,8);
    }
  }

  private buildStains(): void {
    // Meshes are feathered via a radial alpha texture, not opaque red disks.
    const n=128, data=new Uint8Array(n*n*4);
    for(let y=0;y<n;y++)for(let x=0;x<n;x++){
      const u=(x+0.5)/n*2-1,v=(y+0.5)/n*2-1;
      const r=Math.hypot(u,v);
      const t=Math.max(0,1-r/(0.76+0.07*Math.sin(Math.atan2(v,u)*9)));
      const alpha=Math.round(Math.pow(t,1.8)*185);
      const k=(y*n+x)*4;
      data[k]=255;data[k+1]=255;data[k+2]=255;data[k+3]=alpha;
    }
    const map=new THREE.DataTexture(data,n,n,THREE.RGBAFormat);
    map.magFilter=THREE.LinearFilter;
    map.minFilter=THREE.LinearMipmapLinearFilter;
    map.generateMipmaps=true;
    map.needsUpdate=true;
    const material=this.p.blood.clone();
    material.map=map;material.color.setHex(0x8b3034);
    const marks:THREE.Matrix4[]=[];
    for(let i=0;i<22;i++){
      const angle=seeded(i*3+13)*Math.PI*2;
      const radius=28+seeded(i*7+4)*47;
      const px=Math.sin(angle)*radius,pz=Math.cos(angle)*radius;
      const size=2.6+seeded(i*4+61)*7.0;
      marks.push(transform(px,0.074,pz,size,1,size*(0.7+seeded(i+19)*1.9),
        seeded(i*13)*Math.PI*2,-Math.PI/2));
    }
    instanced(this.group,'GothicWeatheredRedStoneStains',
      new THREE.PlaneGeometry(1,1),material,marks);
  }

  /** Decorative fire is absent from reference; gameplay lighting stays external. */
  public update(_time:number):void {}
}
