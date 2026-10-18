import * as THREE from 'three';
import type { GothicPalette } from './GothicMaterials';

/**
 * Only freestanding perimeter pillars. No enclosed wall, arches, bridges,
 * distant towers, railing or masonry joining columns together.
 *
 * The open camera-facing side is intentionally empty.
 */
export const GOTHIC_PERIMETER_PILLAR_POSITIONS: ReadonlyArray<readonly [number, number]> = [
  [-72,-85],[-48,-85],[-24,-85],[0,-85],[24,-85],[48,-85],[72,-85],
  [-85,-65],[-85,-36],[-85,-7],[-85,22],[-85,51],
  [85,-65],[85,-36],[85,-7],[85,22],[85,51],
];

function piece(group: THREE.Group, name: string, material: THREE.Material,
  x: number,y: number,z: number,width:number,height:number,depth:number): THREE.Mesh {
  const mesh=new THREE.Mesh(new THREE.BoxGeometry(width,height,depth),material);
  mesh.name=name;mesh.position.set(x,y,z);mesh.receiveShadow=true;
  group.add(mesh);return mesh;
}

function meshPiece(group: THREE.Group, name: string, geometry: THREE.BufferGeometry,
  material:THREE.Material,x:number,y:number,z:number):THREE.Mesh {
  const mesh=new THREE.Mesh(geometry,material);
  mesh.name=name;mesh.position.set(x,y,z);mesh.receiveShadow=true;
  group.add(mesh);return mesh;
}

function standingPillar(parent: THREE.Object3D, p: GothicPalette,
  x: number, z: number, index: number): void {
  const pillar=new THREE.Group();
  pillar.name='GothicFreestandingPerimeterPillar';
  pillar.position.set(x,0,z);
  pillar.userData.isPerimeterPillar=true;
  pillar.userData.pillarIndex=index;
  parent.add(pillar);

  // Carved ashlar foot, tapered shaft and multiple independently bevelled
  // capitals. Subtle profile variation keeps the pillars from looking like
  // copies of a stretched primitive.
  piece(pillar,'GothicPillarSquareFoot',p.slab,0,0.80,0,4.35,1.6,4.35);
  piece(pillar,'GothicPillarBeveledFoot',p.border,0,1.72,0,4.05,0.27,4.05);
  piece(pillar,'GothicPillarLowRecess',p.relief,0,3.0,0,3.50,2.35,3.50);
  piece(pillar,'GothicPillarShaftBase',p.border,0,4.25,0,3.68,0.48,3.68);
  const shaft=meshPiece(pillar,'GothicPillarTaperedShaft',
    new THREE.CylinderGeometry(1.28,1.63,18,8,1),p.slab,0,13.25,0);
  shaft.rotation.y=Math.PI/8;
  for(const y of [5.7,20.35]) {
    meshPiece(pillar,'GothicPillarStoneCollar',
      new THREE.CylinderGeometry(1.73,1.70,0.38,8),p.border,0,y,0).rotation.y=Math.PI/8;
  }

  // Eight fine longitudinal carved grooves, attached to the column itself.
  const flutes = new THREE.InstancedMesh(
    new THREE.BoxGeometry(0.17,1,0.14),p.engraving,8
  );
  flutes.name='GothicPillarFlutedShaft';
  const dummy=new THREE.Object3D();
  for(let i=0;i<8;i++){
    const a=i/8*Math.PI*2;
    dummy.position.set(Math.cos(a)*1.43,13.2,Math.sin(a)*1.43);
    dummy.rotation.y=-a;
    dummy.scale.set(1,14.2,1);
    dummy.updateMatrix();
    flutes.setMatrixAt(i,dummy.matrix);
  }
  flutes.instanceMatrix.needsUpdate=true;
  pillar.add(flutes);

  piece(pillar,'GothicPillarCapitalPlinth',p.border,0,22.35,0,4.2,0.7,4.2);
  piece(pillar,'GothicPillarUpperAbacus',p.slab,0,23.0,0,4.7,0.48,4.7);
  piece(pillar,'GothicPillarCarvedCrown',p.border,0,23.55,0,4.15,0.35,4.15);

  const roof=meshPiece(pillar,'GothicPillarPointedFinial',
    new THREE.ConeGeometry(2.25,4.8,4),p.slab,0,26.1,0);
  roof.rotation.y=Math.PI/4;
  // Small heraldic reliefs on all four faces.
  const reliefGeo=new THREE.OctahedronGeometry(0.72,0);
  for(const axis of [-1,1]){
    for(const onX of [false,true]){
      const sigil=meshPiece(pillar,'GothicPillarStoneSigil',reliefGeo,p.border,
        onX?axis*1.90:0,18.2,onX?0:axis*1.90);
      sigil.scale.set(onX?0.23:0.72,1.6,onX?0.72:0.23);
    }
  }
}

export function buildGothicFreestandingPillars(
  parent: THREE.Object3D, palette: GothicPalette
): THREE.Group {
  const group=new THREE.Group();
  group.name='GothicOnlyPerimeterPillars';
  parent.add(group);
  GOTHIC_PERIMETER_PILLAR_POSITIONS.forEach(([x,z],index)=>
    standingPillar(group,palette,x,z,index));
  return group;
}
