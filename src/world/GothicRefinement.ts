import * as THREE from 'three';
import type { GothicPalette } from './GothicMaterials';

/** Secondary reference reconstruction, with physically raised masonry. */
function masonry(parent: THREE.Object3D, name: string, mat: THREE.Material,
  x: number, y: number, z: number, w: number, h: number, d: number): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat);
  mesh.position.set(x,y,z); mesh.receiveShadow=true; mesh.name=name;
  parent.add(mesh); return mesh;
}
function addInstanced(parent:THREE.Object3D,name:string,geo:THREE.BufferGeometry,
  mat:THREE.Material,matrices:THREE.Matrix4[],variant=false): THREE.InstancedMesh {
  const mesh=new THREE.InstancedMesh(geo,mat,matrices.length); mesh.name=name;
  const tint=new THREE.Color();
  matrices.forEach((matrix,i)=>{
    mesh.setMatrixAt(i,matrix);
    if(variant) {
      const n=0.87+((Math.sin(i*87.43)*712.31)%1+1)%1*0.22;
      tint.setRGB(n,n,n);
      mesh.setColorAt(i,tint);
    }
  });
  mesh.instanceMatrix.needsUpdate=true;
  if(mesh.instanceColor)mesh.instanceColor.needsUpdate=true;
  mesh.receiveShadow=true;
  parent.add(mesh); return mesh;
}
function pose(x:number,y:number,z:number,sx:number,sy:number,sz:number,yaw=0):THREE.Matrix4 {
  return new THREE.Matrix4().compose(new THREE.Vector3(x,y,z),
    new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),yaw),
    new THREE.Vector3(sx,sy,sz));
}
/** A complete stone annular sector: upper face and beveled vertical risers. */
export function gothicSectorGeometry(inner:number,outer:number,angle:number,depth:number):THREE.BufferGeometry {
  const pos:number[]=[],uv:number[]=[],idx:number[]=[];
  const divisions=5;
  const add=(x:number,y:number,z:number)=>{
    pos.push(x,y,z);uv.push(x/8,z/8);return pos.length/3-1;
  };
  for(let k=0;k<divisions;k++){
    const a0=(k/divisions)*angle+0.004;
    const a1=((k+1)/divisions)*angle-0.004;
    const coords=[
      [inner*Math.cos(a0),-inner*Math.sin(a0)],
      [outer*Math.cos(a0),-outer*Math.sin(a0)],
      [outer*Math.cos(a1),-outer*Math.sin(a1)],
      [inner*Math.cos(a1),-inner*Math.sin(a1)]
    ];
    const top=coords.map(([x,z])=>add(x,depth,z));
    idx.push(top[0],top[1],top[2],top[0],top[2],top[3]);
    for(let side=0;side<4;side++){
      const cur=coords[side],next=coords[(side+1)%4];
      const a=add(cur[0],0,cur[1]), b=add(next[0],0,next[1]);
      const c=add(next[0],depth,next[1]),d=add(cur[0],depth,cur[1]);
      idx.push(a,b,c,a,c,d);
    }
  }
  const g=new THREE.BufferGeometry();
  g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));
  g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
  g.setIndex(idx);g.computeVertexNormals();return g;
}

export function buildGothicFloorDetail(root:THREE.Object3D,p:GothicPalette):void {
  const group=new THREE.Group();
  group.name='GothicReferenceStonecarving';
  root.add(group);

  // Independently raised (not coplanar) blue-gray wedge stones.
  // Rows step progressively away from the center, including visible grout.
  const bands:[[number,number,number],...[number,number,number][]]=[
    [42.8,51.4,96], [51.6,63.5,96], [63.7,74.6,96]
  ];
  bands.forEach(([inner,outer,count],row)=>{
    const arc=Math.PI*2/count;
    const geo=gothicSectorGeometry(inner,outer,arc*0.989,0.052+row*0.004);
    const matrices:THREE.Matrix4[]=[];
    for(let i=0;i<count;i++)matrices.push(pose(0,0.018,0,1,1,1,
      i*arc + arc*0.005));
    const tile=addInstanced(group,'GothicRealRadialFlagstoneCourse',geo,
      row===1?p.engraving:p.border,matrices,true);
    tile.userData.course=row;
  });

  // Fine incised rune lines form actual small raised side-lit bevels, rather
  // than repeated flat boxes that looked like a gray dotted texture.
  const runes:THREE.Matrix4[]=[];
  const accents:THREE.Matrix4[]=[];
  for(let i=0;i<96;i++){
    const angle=Math.PI*2*i/96;
    const r=32.50;
    const x=r*Math.sin(angle),z=r*Math.cos(angle);
    for(let j=-1;j<=1;j+=2){
      const local=angle+j*0.010;
      const ax=x+j*Math.cos(angle)*0.32;
      const az=z-j*Math.sin(angle)*0.32;
      runes.push(pose(ax,0.172,az,0.08,0.018,0.60,local+j*0.52));
    }
    if(i%2===0)accents.push(pose(Math.sin(angle)*32.45,0.176,
      Math.cos(angle)*32.45,0.24,0.016,0.13,angle));
  }
  addInstanced(group,'GothicReferenceRuneVCarvings',
    new THREE.BoxGeometry(1,1,1),p.darkIron,runes);
  addInstanced(group,'GothicReferenceRuneLozenges',
    new THREE.BoxGeometry(1,1,1),p.border,accents);

  // Localized patches of chipped flagstone and shallow grout, not straight
  // lines repeated at every x/z across the entire level.
  const chipping:THREE.Matrix4[]=[];
  const cracked:THREE.Matrix4[]=[];
  for(let i=0;i<350;i++){
    const a=i*2.399963229728653;
    const r=37+(i%143)/142*40;
    const x=r*Math.cos(a),z=r*Math.sin(a);
    const len=0.2+(i%11)*0.075;
    chipping.push(pose(x,0.072,z,0.038,0.012,len,a*0.73));
    if(i%5===0)cracked.push(pose(x+0.2,0.074,z-0.15,
      0.028,0.011,len*0.48,a+0.71));
  }
  addInstanced(group,'GothicStoneMicroChiselMarks',
    new THREE.BoxGeometry(1,1,1),p.relief,chipping);
  addInstanced(group,'GothicStoneCrackBranches',
    new THREE.BoxGeometry(1,1,1),p.darkIron,cracked);
}

function gothicArchPoints(cx:number,base:number,width:number,height:number,
  project:(x:number,y:number)=>THREE.Vector3):THREE.Vector3[]{
  const points:THREE.Vector3[]=[];
  points.push(project(cx-width/2,base));
  points.push(project(cx-width/2,base+height*0.73));
  // Steep lancet arches, apex formed by two asymptotic spline half curves.
  const n=10;
  for(let k=0;k<=n;k++){
    const t=k/n;
    const x=cx-width/2+width/2*t;
    const y=base+height*(0.73+0.27*Math.sin(t*Math.PI/2));
    points.push(project(x,y));
  }
  for(let k=1;k<=n;k++){
    const t=k/n;
    const x=cx+width/2*t;
    const y=base+height*(0.73+0.27*Math.cos(t*Math.PI/2));
    points.push(project(x,y));
  }
  points.push(project(cx+width/2,base));
  return points;
}
function rib(parent:THREE.Object3D,name:string,points:THREE.Vector3[],
  material:THREE.Material,radius:number):THREE.Mesh {
  const curve=new THREE.CatmullRomCurve3(points,false,'centripetal',0.2);
  const mesh=new THREE.Mesh(new THREE.TubeGeometry(curve,64,radius,8,false),material);
  mesh.name=name;
  mesh.receiveShadow=true;
  parent.add(mesh);return mesh;
}
function crest(parent:THREE.Object3D,p:GothicPalette,x:number,y:number,z:number,
  rotate=false):void {
  const shape=new THREE.Shape();
  shape.moveTo(0,1.3);shape.lineTo(0.82,0);
  shape.lineTo(0,-1.55);shape.lineTo(-0.82,0);shape.closePath();
  const mesh=new THREE.Mesh(new THREE.ExtrudeGeometry(shape,
    {depth:0.22,bevelEnabled:true,bevelSize:0.13,bevelThickness:0.10,bevelSegments:2}),
    p.border);
  mesh.name='GothicCarvedHeraldicDiamond';
  mesh.position.set(x,y,z);
  if(rotate)mesh.rotation.y=Math.PI/2;
  parent.add(mesh);
  const inlay=new THREE.Mesh(new THREE.OctahedronGeometry(0.49,0),p.darkIron);
  inlay.position.set(x,y,z+0.35); if(rotate)inlay.position.set(x+0.35,y,z);
  inlay.scale.set(0.8,1.5,0.30);parent.add(inlay);
}
function capstone(parent:THREE.Object3D,p:GothicPalette,x:number,z:number,
  height=25):void {
  masonry(parent,'GothicOrnateButtress',p.slab,x,height*0.5,z,2.8,height,3.3);
  masonry(parent,'GothicButtressFoot',p.border,x,2.0,z+0.3,3.9,3.6,4.0);
  masonry(parent,'GothicButtressCollar',p.border,x,8.1,z+0.35,3.3,0.60,3.9);
  masonry(parent,'GothicButtressTopCapital',p.border,x,height-0.5,z,4.1,0.75,4.3);
  const inner=masonry(parent,'GothicButtressRecess',p.relief,x,13,z+1.69,0.74,9.2,0.12);
  inner.receiveShadow=false;
  crest(parent,p,x,16,z+1.8);
  for(const dx of [-0.88,0.88]){
    masonry(parent,'GothicButtressLongFlute',p.border,x+dx,height*0.59,z+1.75,
      0.19,10.5,0.20);
  }
}

/**
 * Cathedral reconstruction: sculpted lancet outlines, recessed stones,
 * cornices and miniature heraldic reliefs. No giant cube wall silhouettes.
 */
export function buildGothicCathedralDetails(root:THREE.Object3D,p:GothicPalette):void {
  const cathedral=new THREE.Group();
  cathedral.name='GothicCathedralPerimeter';
  root.add(cathedral);

  const back=-86.6;
  // Solid wall panels alternate with intricate columned pointed bays.
  for(let i=0;i<12;i++){
    const x=-73+i*13.3;
    const cx=x+6.65;
    const project=(a:number,b:number)=>new THREE.Vector3(a,b,back+1.28);
    // Avoid a perfectly flat black continuous background.
    masonry(cathedral,'GothicRecessedMasonryBay',p.slab,cx,18.2,back-2.5,13.0,36.4,3.2);
    masonry(cathedral,'GothicPointedPortalInterior',p.relief,cx,12.4,back-0.76,9.4,23.4,0.55);
    capstone(cathedral,p,x,back+0.95,31.2);
    // Frontal arch is a full, open 3D tube and rises to a pointed apex.
    const points=gothicArchPoints(cx,0.8,9.1,28.6,project);
    rib(cathedral,'GothicPointedArchVoussoir',points,p.border,0.38);
    rib(cathedral,'GothicOuterArchMoulding',
      gothicArchPoints(cx,0.8,10.6,29.4,(a,b)=>new THREE.Vector3(a,b,back+0.86)),
      p.darkIron,0.13);
    rib(cathedral,'GothicInnerArchFillet',
      gothicArchPoints(cx,1.65,7.4,26.2,(a,b)=>new THREE.Vector3(a,b,back+1.42)),
      p.engraving,0.12);
    // Diamond keystones and inset mouldings.
    crest(cathedral,p,cx,21.2,back+1.95);
    masonry(cathedral,'GothicVaultedWallCornice',p.border,cx,32.5,back,12.7,0.82,5);
    masonry(cathedral,'GothicCorniceIronInlay',p.darkIron,cx,33.14,back+0.5,
      12.7,0.10,0.9);
    for(let k=0;k<4;k++){
      masonry(cathedral,'GothicCathedralMasonryBed',p.engraving,
        cx,7.4+k*5.0,back-1.6,10.2,0.11,0.13);
    }
  }
  // Back/right raised terraces remain behind the boss. The western side
  // retains OPEN arches to the misty ruins, as in the reference photo.
  for(const sign of [-1,1]){
    const x=sign*83.6;
    for(let i=0;i<8;i++){
      const z=-76+i*20.5;
      const pier=new THREE.Group();
      pier.name='GothicSidePierArchitecturalUnit';
      cathedral.add(pier);
      masonry(pier,'GothicOuterWallPier',p.slab,x,12.5,z,5,25,5.6);
      masonry(pier,'GothicOuterPierBase',p.border,x,1.9,z,6.2,3.8,7.2);
      masonry(pier,'GothicOuterPierCapital',p.border,x,24.6,z,6.8,1.15,7.2);
      masonry(pier,'GothicVerticalButtressRecess',p.relief,
        x-sign*2.58,13.3,z,0.14,11.0,1.17);
      for(const shift of [-1.75,1.75])
        masonry(pier,'GothicWallVerticalMoulding',p.border,
          x-sign*2.78,12.7,z+shift,0.22,13,0.19);
      // Recessed pointed arches connect adjacent piers. Western arcade stays
      // mostly open to expose atmospheric distant towers.
      if(i<7){
        const cz=z+10.25;
        const sidePoint=(local:number,y:number)=>
          new THREE.Vector3(x-sign*2.78,y,cz+local);
        rib(cathedral,'GothicSideFlyingArch',
          gothicArchPoints(0,8.9,17,16,sidePoint),p.border,0.38);
        rib(cathedral,'GothicSideArchInnerRib',
          gothicArchPoints(0,9.5,15,15,(local,y)=>
            new THREE.Vector3(x-sign*2.9,y,cz+local)
          ),p.darkIron,0.13);
        if(sign===1) {
          masonry(cathedral,'GothicSideShadowedRecess',p.relief,
            x+1.0,13.7,cz,1,16,14.8);
        }
        masonry(cathedral,'GothicSideArchTracery',p.border,
          x-sign*1.5,25.5,cz,2.3,0.45,17.1);
      }
      const finial=new THREE.Mesh(new THREE.ConeGeometry(1.32,5.1,4),p.border);
      finial.rotation.y=Math.PI/4;
      finial.position.set(x,27.8,z);
      finial.name='GothicCarvedButtressFinial';
      cathedral.add(finial);
    }
  }
}
