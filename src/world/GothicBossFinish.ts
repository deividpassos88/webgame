import * as THREE from 'three';
import type { GothicPalette } from './GothicMaterials';
import { gothicSectorGeometry } from './GothicRefinement';

/**
 * Real stone stair course, marble/iron coping and ornamental masonry
 * around the right-rear throne stage. Kept separately from combat floor.
 */
export function finishGothicBossSanctum(
  root: THREE.Object3D, p: GothicPalette,
  x: number, z: number, radius: number, height: number
): void {
  const group = new THREE.Group();
  group.name='GothicReferenceBossStonework';
  root.add(group);

  // Raised steps face the center of the arena, not the rear wall.
  // Sector geometry x=r*cos(a), z=-r*sin(a).
  const towardCenter = Math.atan2(z, -x);
  const first = towardCenter - Math.PI / 2;
  for(let row=0;row<4;row++){
    const inner=radius+row*1.7+0.10;
    const outer=inner+1.48;
    const top=Math.max(0.16,height-row*0.17);
    const count=34;
    const arc=Math.PI/count;
    const geometry=gothicSectorGeometry(inner,outer,arc*0.982,0.055);
    const mesh=new THREE.InstancedMesh(geometry,row%2===0?p.border:p.slab,count);
    mesh.name='GothicIndividualBeveledBossStairTreads';
    const dummy=new THREE.Object3D();
    const tint=new THREE.Color();
    for(let i=0;i<count;i++){
      dummy.position.set(x,top-0.052,z);
      dummy.rotation.set(0,first+arc*i+arc*0.009,0);
      dummy.updateMatrix();
      mesh.setMatrixAt(i,dummy.matrix);
      const v=0.92+0.10*(Math.sin(i*1.7+row*3.5)*0.5+0.5);
      tint.setRGB(v,v,v);mesh.setColorAt(i,tint);
    }
    mesh.instanceMatrix.needsUpdate=true;
    if(mesh.instanceColor)mesh.instanceColor.needsUpdate=true;
    mesh.receiveShadow=true;group.add(mesh);
    // Delicate lead-metal drip rail emphasizes real tread height.
    const curb=new THREE.Mesh(new THREE.TorusGeometry(outer-0.06,0.045,6,72,Math.PI),p.darkIron);
    curb.name='GothicBossStairMetalNosing';
    curb.rotation.set(-Math.PI/2,0,first);
    curb.position.set(x,top+0.014,z);
    group.add(curb);
  }

  // Stone inlays on the raised dais: two precise annular moldings
  // with tapered masonry divisions instead of a spoked wheel.
  const courses:[[number,number],[number,number]]=[
    [radius-3.2,radius-2.72],
    [radius-1.7,radius-1.35]
  ];
  for(const [inner,outer] of courses){
    const count=80,angle=Math.PI*2/count;
    const geo=gothicSectorGeometry(inner,outer,angle*0.988,0.068);
    const tiles=new THREE.InstancedMesh(geo,p.border,count);
    tiles.name='GothicBossCarvedConcentricTesserae';
    const dummy=new THREE.Object3D();
    for(let i=0;i<count;i++){
      dummy.position.set(x,height+0.01,z);
      dummy.rotation.set(0,i*angle,0);
      dummy.updateMatrix();tiles.setMatrixAt(i,dummy.matrix);
    }
    tiles.instanceMatrix.needsUpdate=true;
    group.add(tiles);
  }

  // Radial insets should be hairline grout at ground level, never tall spokes.
  const fine=new THREE.InstancedMesh(new THREE.BoxGeometry(1,1,1),p.darkIron,32);
  fine.name='GothicBossEngravedHairlineSeams';
  const dummy=new THREE.Object3D();
  for(let i=0;i<32;i++){
    const angle=i/32*Math.PI*2;
    dummy.position.set(x+Math.sin(angle)*(radius-3.4)/2,
      height+0.087,z+Math.cos(angle)*(radius-3.4)/2);
    dummy.rotation.set(0,angle,0);
    dummy.scale.set(0.034,0.008,radius-3.6);
    dummy.updateMatrix();
    fine.setMatrixAt(i,dummy.matrix);
  }
  fine.instanceMatrix.needsUpdate=true;group.add(fine);

  // Raised rear coping made from distinct dressed ashlar blocks.
  for(let i=0;i<13;i++){
    const a=Math.PI*1.1+i*(Math.PI*0.8/12);
    const px=x+Math.cos(a)*(radius+3.5),pz=z+Math.sin(a)*(radius+3.5);
    const block=new THREE.Mesh(new THREE.BoxGeometry(2.8,1.05,1.4),p.border);
    block.position.set(px,0.53,pz);
    block.rotation.y=-a;
    block.name='GothicBossRearCarvedParapet';
    block.receiveShadow=true;
    group.add(block);
    const trim=new THREE.Mesh(new THREE.BoxGeometry(2.9,0.20,1.55),p.darkIron);
    trim.position.set(px,1.14,pz);
    trim.rotation.y=-a;
    group.add(trim);
  }
}
