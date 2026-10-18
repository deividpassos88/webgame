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
      'GothicCathedralPerimeter','GothicPointedArchVoussoir',
      'GothicRuinedBridgesInMist','GothicDistantBrokenTower',
      'GothicWeatheredRedStoneStains'
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
