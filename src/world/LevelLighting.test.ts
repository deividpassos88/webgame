import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { Level } from './Level';
import { GOTHIC_ARENA_SIZE, GOTHIC_CENTER_RADIUS, GOTHIC_BOSS_DAIS } from './GothicArena';

describe('Gothic ruined coliseum reference reconstruction', () => {
  it('uses a real 162m traversable floor while keeping unchanged wave progression', () => {
    const level = new Level();
    const floor = level.groundMeshes[0] as THREE.Mesh;
    expect(level.group.name).toBe('GothicRuinedColiseum162m');
    expect(floor.name).toBe('GothicPlayableStoneFloor');
    expect(floor.geometry).toBeInstanceOf(THREE.PlaneGeometry);
    expect((floor.geometry as THREE.PlaneGeometry).parameters.width).toBe(GOTHIC_ARENA_SIZE);
    expect((floor.geometry as THREE.PlaneGeometry).parameters.height).toBe(GOTHIC_ARENA_SIZE);
    expect(floor.userData.isGround).toBe(true);
    expect(level.groundMeshes).toHaveLength(1);
    expect(level.navigationObstacles).toHaveLength(0);
    expect(level.getWaveSpawnPoints()).toHaveLength(8);
    expect(level.getWaveSpawnPoints().every(p=>Math.abs(p.x)<40 && Math.abs(p.z)<40)).toBe(true);
    expect(level.getBossSpawnPoint().toArray()).toEqual([0,0,-18]);
    expect(level.getFinalBattleSpawnLayout().miniBosses).toHaveLength(4);
  });

  it('renders all the distinctive reference geometry and material layers', () => {
    const level=new Level();
    const get=(name:string)=>level.group.getObjectByName(name);
    expect(get('GothicUnderstructure')).toBeDefined();
    expect(get('GothicCentralWornStoneDisc')).toBeDefined();
    expect((get('GothicCentralWornStoneDisc') as THREE.Mesh).geometry).toBeInstanceOf(THREE.CircleGeometry);
    expect(GOTHIC_CENTER_RADIUS).toBeGreaterThan(25);
    for(const name of [
      'GothicInnerReliefRing', 'GothicRuneFrieze', 'GothicOuterRaisedCircle',
      'GothicRadialBluestoneTiles', 'GothicOuterFineBand',
      'GothicRaisedRadialSpoke','GothicSpokeEngravedChannel','GothicSpokeFineIronInlay',
      'GothicBossCurvedStair1','GothicBossCurvedStair2',
      'GothicBossCurvedStair3','GothicBossCurvedStair4',
      'GothicBossPlatformRealElevation','GothicBossDiscEngravedSurface',
      'GothicOnlyPerimeterPillars','GothicFreestandingPerimeterPillar',
      'GothicPillarTaperedShaft','GothicWeatheredRedStoneStains'
    ]) expect(get(name),name).toBeDefined();
    const ground=(level.groundMeshes[0] as THREE.Mesh).material as THREE.MeshStandardMaterial;
    expect(ground.map?.name).toBe('GothicCrackedBluestoneAlbedo');
    expect(ground.bumpMap?.name).toBe('GothicStoneEngravedMicrorelief');
    expect(ground.roughnessMap?.name).toBe('GothicStoneVariableWetness');
    expect(get('GothicChiseledRuneBorder')).toBeInstanceOf(THREE.InstancedMesh);
    expect(get('GothicConcentricTileJoints')).toBeInstanceOf(THREE.InstancedMesh);
    expect(get('GothicSpokeEtchedTriangles')).toBeInstanceOf(THREE.InstancedMesh);
    expect(get('GothicBossCurvedStair1')).toBeInstanceOf(THREE.Mesh);
    expect((get('GothicBossCurvedStair1') as THREE.Mesh).geometry).toBeInstanceOf(THREE.ExtrudeGeometry);
    expect((get('GothicBossPlatformRealElevation') as THREE.Mesh).position.y * 2)
      .toBeCloseTo(GOTHIC_BOSS_DAIS.height);
  });

  it('surgeon audit: compares physical gothic geometry against the reference components', () => {
    const level=new Level();
    const get=(name:string)=>level.group.getObjectByName(name);
    const findAll=(name:string)=>{
      const matches:THREE.Object3D[]=[];
      level.group.traverse(object=>{ if(object.name===name)matches.push(object); });
      return matches;
    };
    // Three ring courses of independently raised blue-gray flagstones.
    const courses=findAll('GothicRealRadialFlagstoneCourse') as THREE.InstancedMesh[];
    expect(courses).toHaveLength(3);
    expect(courses.every(course=>course.count===96)).toBe(true);
    expect(courses.every(course=>course.geometry.getAttribute('normal')!==undefined)).toBe(true);
    expect(get('GothicReferenceRuneVCarvings')).toBeInstanceOf(THREE.InstancedMesh);
    expect(get('GothicStoneMicroChiselMarks')).toBeInstanceOf(THREE.InstancedMesh);
    // Minimal perimeter: ONLY 17 independent pillars, no joined scenery.
    const pillars=findAll('GothicFreestandingPerimeterPillar');
    expect(pillars).toHaveLength(17);
    expect(pillars.every(p=>p.userData.isPerimeterPillar===true)).toBe(true);
    expect(findAll('GothicPillarFlutedShaft')).toHaveLength(17);
    const shaft=get('GothicPillarTaperedShaft') as THREE.Mesh;
    expect((shaft.material as THREE.MeshStandardMaterial).map?.name)
      .toBe('GothicChippedMasonryAlbedo');
    // Everything enclosing the prior cathedral must be gone, including bridges.
    for(const forbidden of [
      'GothicCathedralPerimeter','GothicRecessedMasonryBay',
      'GothicPointedArchVoussoir','GothicSideFlyingArch',
      'GothicRuinedBridgesInMist','GothicDistantBrokenTower',
      'GothicRearStoneTerrace',
    ]) {
      expect(get(forbidden),forbidden).toBeUndefined();
    }
    expect(get('GothicMistyRuinsStormSky')).toBeInstanceOf(THREE.Mesh);
    // Separate stone wedges, nose mouldings, and incised grooves of the boss.
    const steps=findAll('GothicIndividualBeveledBossStairTreads') as THREE.InstancedMesh[];
    expect(steps).toHaveLength(4);
    expect(steps.every(step=>step.count===34)).toBe(true);
    expect(findAll('GothicBossCarvedConcentricTesserae')).toHaveLength(2);
    expect(get('GothicBossEngravedHairlineSeams')).toBeInstanceOf(THREE.InstancedMesh);
    // No large decorative crescents close off the open perimeter.
    // Combat input must still raycast a SINGLE flat ground mesh.
    expect(level.groundMeshes).toHaveLength(1);
    expect(level.groundMeshes[0].name).toBe('GothicPlayableStoneFloor');
  });

  it('leaves the camera-facing edge open, with only freestanding columns on three sides', () => {
    const level=new Level();
    const pillarRoot=level.group.getObjectByName('GothicOnlyPerimeterPillars');
    expect(pillarRoot).toBeDefined();
    expect(pillarRoot!.children).toHaveLength(17);
    expect(pillarRoot!.children.every(p=>p.type==='Group')).toBe(true);
    expect(pillarRoot!.children.every(p=>
      p.position.z <= 51 && (Math.abs(p.position.x)>=85 || p.position.z===-85)
    )).toBe(true);
    expect(level.group.getObjectByName('GothicCathedralPerimeter')).toBeUndefined();
    expect(level.group.getObjectByName('GothicRuinedBridgesInMist')).toBeUndefined();
    expect(level.group.getObjectByName('GothicRaisedBossSanctum')).toBeDefined();
    expect(level.groundMeshes).toHaveLength(1);
  });

  it('never inserts expensive decorative geometry into the ground raycast', () => {
    const level = new Level();
    const names=level.groundMeshes.map(x=>x.name);
    expect(names).toEqual(['GothicPlayableStoneFloor']);
    const stairs=['GothicBossCurvedStair1','GothicBossCurvedStair2','GothicBossCurvedStair3','GothicBossCurvedStair4'];
    const heights=stairs.map(n=>(level.group.getObjectByName(n) as THREE.Mesh).userData.stepHeight as number);
    expect(heights).toHaveLength(4);
    expect(heights.every(v=>v>0)).toBe(true);
    expect(heights[0]).toBeGreaterThan(heights[1]);
    expect(heights[1]).toBeGreaterThan(heights[2]);
    expect(heights[2]).toBeGreaterThan(heights[3]);
  });
});
