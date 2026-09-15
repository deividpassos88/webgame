import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { Enemy } from '../entities/Enemy';
import { CombatEntityRegistry } from './CombatEntityRegistry';

function enemyAt(x: number): Enemy {
  return new Enemy({ position: new THREE.Vector3(x, 0, 0) });
}

describe('CombatEntityRegistry', () => {
  it('forwards the exact elemental tick with its owning combat record', () => {
    const registry = new CombatEntityRegistry();
    const enemy = enemyAt(0);
    registry.register({ id: 'burning', phaseId: 2, role: 'regular', enemy });
    enemy.applyElementalHit('fire', 4);
    const reported: Array<{ id: string; damage: number }> = [];

    registry.update(
      0.25,
      new THREE.Vector3(100, 0, 0),
      () => undefined,
      [],
      (record, damage) => reported.push({ id: record.id, damage })
    );

    expect(reported).toEqual([{ id: 'burning', damage: 1 }]);
  });

  it('registers role-aware enemies once and exposes only living roots', () => {
    const registry = new CombatEntityRegistry();
    const regular = enemyAt(0);
    const miniBoss = enemyAt(2);
    const boss = enemyAt(4);

    expect(registry.register({ id: 'regular-1', phaseId: 7, role: 'regular', enemy: regular })).toBe(true);
    expect(registry.register({ id: 'mini-1', phaseId: 7, role: 'mini-boss', enemy: miniBoss })).toBe(true);
    expect(registry.register({ id: 'boss-1', phaseId: 7, role: 'boss', enemy: boss })).toBe(true);
    expect(registry.register({ id: 'boss-1', phaseId: 7, role: 'boss', enemy: enemyAt(6) })).toBe(false);

    miniBoss.takeDamage(miniBoss.hp);

    expect(registry.findByRoot(boss.root)).toMatchObject({
      id: 'boss-1', phaseId: 7, role: 'boss', enemy: boss, deathReported: false,
    });
    expect(registry.activeRoots()).toEqual([regular.root, boss.root]);
    expect(registry.mainBoss).toBe(boss);
  });

  it('reports a dead enemy metadata only once', () => {
    const registry = new CombatEntityRegistry();
    const enemy = enemyAt(0);
    registry.register({ id: 'regular-1', phaseId: 3, role: 'regular', enemy });

    expect(registry.reportDeath(enemy.root)).toBeNull();
    enemy.takeDamage(enemy.hp);

    expect(registry.reportDeath(enemy.root)).toEqual({
      id: 'regular-1', phaseId: 3, role: 'regular',
    });
    expect(registry.reportDeath(enemy.root)).toBeNull();
  });

  it('exposes newly dead records so timed damage can finish the combat flow', () => {
    const registry = new CombatEntityRegistry();
    const enemy = enemyAt(0);
    registry.register({ id: 'dot-target', phaseId: 4, role: 'regular', enemy });
    enemy.takeDamage(enemy.hp);

    expect(registry.unreportedDeaths().map(({ id }) => id)).toEqual(['dot-target']);
    registry.reportDeath(enemy.root);
    expect(registry.unreportedDeaths()).toEqual([]);
  });

  it('stops exposing the main boss as soon as it dies', () => {
    const registry = new CombatEntityRegistry();
    const boss = new Enemy({ position: new THREE.Vector3(), isBoss: true });
    registry.register({ id: 'boss', phaseId: 1, role: 'boss', enemy: boss });
    expect(registry.mainBoss).toBe(boss);

    boss.takeDamage(boss.hp);

    expect(registry.mainBoss).toBeNull();
  });

  it('reports living, dying and total entity counts for performance diagnostics', () => {
    const registry = new CombatEntityRegistry();
    const living = enemyAt(0);
    const dying = enemyAt(2);
    registry.register({ id: 'living', phaseId: 1, role: 'regular', enemy: living });
    registry.register({ id: 'dying', phaseId: 1, role: 'regular', enemy: dying });
    dying.takeDamage(dying.hp);

    expect(registry.diagnostics).toEqual({
      totalEnemies: 2,
      livingEnemies: 1,
      dyingEnemies: 1,
    });
  });

  it('forwards the attacker role with damage', () => {
    vi.stubGlobal('requestAnimationFrame', () => 0);
    const registry = new CombatEntityRegistry();
    const enemy = new Enemy({
      position: new THREE.Vector3(),
      damage: 4,
      attackRange: 1.7,
    });
    registry.register({ id: 'regular-1', phaseId: 1, role: 'regular', enemy });
    const received: Array<{ damage: number; role: string; distance: number }> = [];

    registry.update(0, new THREE.Vector3(1, 0, 0), (damage, role, distance) => {
      received.push({ damage, role, distance });
    });

    expect(received).toEqual([{ damage: 4, role: 'regular', distance: 1 }]);
    vi.unstubAllGlobals();
  });

  it('lets every in-range monster attack independently while surrounding', () => {
    vi.stubGlobal('requestAnimationFrame', () => 0);
    const registry = new CombatEntityRegistry();
    const playerPosition = new THREE.Vector3(0, 0, 0);
    const positions = [
      new THREE.Vector3(1.2, 0, 0),
      new THREE.Vector3(-1.2, 0, 0),
      new THREE.Vector3(0, 0, 1.2),
    ];
    positions.forEach((position, index) => {
      registry.register({
        id: `regular-${index}`,
        phaseId: 1,
        role: 'regular',
        enemy: new Enemy({ position, damage: 4, attackRange: 1.7 }),
      });
    });
    const received: number[] = [];

    registry.update(0, playerPosition, damage => received.push(damage));

    expect(received).toEqual([4, 4, 4]);
    vi.unstubAllGlobals();
  });

  it('keeps a reported death registered until its staged effect completes', () => {
    const registry = new CombatEntityRegistry();
    const parent = new THREE.Group();
    const enemy = enemyAt(0);
    const material = enemy.root.children[0].children[0] as THREE.Mesh;
    let disposeEvents = 0;
    (Array.isArray(material.material) ? material.material[0] : material.material)
      .addEventListener('dispose', () => disposeEvents++);
    parent.add(enemy.root);
    registry.register({ id: 'regular-1', phaseId: 1, role: 'regular', enemy });

    enemy.takeDamage(enemy.hp);
    expect(registry.reportDeath(enemy.root)).toEqual({
      id: 'regular-1', phaseId: 1, role: 'regular',
    });
    expect(registry.reportDeath(enemy.root)).toBeNull();

    registry.update(1.199, new THREE.Vector3(), () => undefined);

    expect(enemy.root.parent).toBe(parent);
    expect(registry.findByRoot(enemy.root)).not.toBeNull();

    registry.update(0.001, new THREE.Vector3(), () => undefined);

    expect(enemy.root.parent).toBeNull();
    expect(registry.findByRoot(enemy.root)).toBeNull();
    expect(disposeEvents).toBe(1);
  });

  it('clears every remaining root', () => {
    const registry = new CombatEntityRegistry();
    const parent = new THREE.Group();
    const enemy = new Enemy({
      position: new THREE.Vector3(2, 0, 0),
      isBoss: true,
      dropOnDeath: 'speed',
    });
    const geometries = new Set<THREE.BufferGeometry>();
    enemy.root.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (mesh.isMesh) geometries.add(mesh.geometry);
    });
    let disposedGeometries = 0;
    geometries.forEach((geometry) => {
      geometry.addEventListener('dispose', () => disposedGeometries++);
    });
    parent.add(enemy.root);
    registry.register({ id: 'boss-1', phaseId: 1, role: 'boss', enemy });

    registry.clear();

    expect(enemy.root.parent).toBeNull();
    expect(disposedGeometries).toBe(geometries.size);
    expect(registry.activeRoots()).toEqual([]);
    expect(registry.mainBoss).toBeNull();
  });

  it('removes living boss allies without interrupting the defeated boss effect', () => {
    const registry = new CombatEntityRegistry();
    const parent = new THREE.Group();
    const boss = new Enemy({ position: new THREE.Vector3(), isBoss: true, hp: 1 });
    const ally = new Enemy({ position: new THREE.Vector3(2, 0, 0) });
    parent.add(boss.root, ally.root);
    registry.register({ id: 'boss', phaseId: 1, role: 'boss', enemy: boss });
    registry.register({ id: 'ally', phaseId: 1, role: 'regular', enemy: ally });
    boss.takeDamage(1);
    const api = registry as CombatEntityRegistry & {
      clearLivingAllies?: () => void;
    };

    expect(api.clearLivingAllies).toBeTypeOf('function');
    api.clearLivingAllies!();

    expect(ally.root.parent).toBeNull();
    expect(registry.findByRoot(ally.root)).toBeNull();
    expect(boss.root.parent).toBe(parent);
    expect(registry.findByRoot(boss.root)).not.toBeNull();
  });

  it('keeps living enemies physically separated after they move', () => {
    const registry = new CombatEntityRegistry();
    const first = enemyAt(0);
    const second = enemyAt(0.1);
    registry.register({ id: 'regular-1', phaseId: 1, role: 'regular', enemy: first });
    registry.register({ id: 'regular-2', phaseId: 1, role: 'regular', enemy: second });

    registry.update(0, new THREE.Vector3(100, 0, 100), () => undefined);

    const horizontalDistance = Math.hypot(
      second.root.position.x - first.root.position.x,
      second.root.position.z - first.root.position.z
    );
    expect(horizontalDistance).toBeGreaterThanOrEqual(0.92 - 1e-6);
  });

  it('separates enemies that occupy the exact same spawn position', () => {
    const registry = new CombatEntityRegistry();
    const first = enemyAt(0);
    const second = enemyAt(0);
    registry.register({ id: 'regular-1', phaseId: 1, role: 'regular', enemy: first });
    registry.register({ id: 'regular-2', phaseId: 1, role: 'regular', enemy: second });

    registry.update(0, new THREE.Vector3(100, 0, 100), () => undefined);

    const horizontalDistance = Math.hypot(
      second.root.position.x - first.root.position.x,
      second.root.position.z - first.root.position.z
    );
    expect(horizontalDistance).toBeGreaterThanOrEqual(0.92 - 1e-6);
  });

  it('keeps a casting boss anchored while pushing an overlapping ally away', () => {
    const registry = new CombatEntityRegistry();
    const boss = new Enemy({
      position: new THREE.Vector3(),
      isBoss: true,
      speed: 0.8,
      attackRange: -1,
    });
    const ally = new Enemy({ position: new THREE.Vector3(), speed: 0 });
    boss.setBossMovementLocked(true);
    registry.register({ id: 'boss', phaseId: 1, role: 'boss', enemy: boss });
    registry.register({ id: 'ally', phaseId: 1, role: 'mini-boss', enemy: ally });

    registry.update(0, new THREE.Vector3(0, 0, 5), () => undefined);

    expect(boss.root.position.toArray()).toEqual([0, 0, 0]);
    expect(ally.root.position.x).toBeGreaterThan(0);
  });

  it('makes a regular enemy yield all overlap correction to a mini-boss', () => {
    const registry = new CombatEntityRegistry();
    const regular = new Enemy({ position: new THREE.Vector3(), speed: 0 });
    const miniBoss = new Enemy({
      position: new THREE.Vector3(),
      speed: 0,
      scale: 1.4,
      collisionRadius: 1,
    });
    registry.register({ id: 'regular', phaseId: 1, role: 'regular', enemy: regular });
    registry.register({ id: 'mini', phaseId: 1, role: 'mini-boss', enemy: miniBoss });

    registry.update(0, new THREE.Vector3(100, 0, 100), () => undefined);

    expect(miniBoss.root.position.toArray()).toEqual([0, 0, 0]);
    expect(Math.abs(regular.root.position.x)).toBeGreaterThanOrEqual(1.5 - 1e-6);
  });

  it('keeps enemies outside circular scenery obstacles', () => {
    const registry = new CombatEntityRegistry();
    const enemy = new Enemy({ position: new THREE.Vector3(0.5, 0, 0), speed: 0 });
    registry.register({ id: 'regular', phaseId: 1, role: 'regular', enemy });

    registry.update(
      0,
      new THREE.Vector3(100, 0, 100),
      () => undefined,
      [{ x: 0, z: 0, radius: 1 }]
    );

    expect(Math.hypot(enemy.root.position.x, enemy.root.position.z))
      .toBeGreaterThanOrEqual(1.4 - 1e-6);
  });

  it('keeps each enemy assigned to the same surround slot when their angular order crosses', () => {
    const registry = new CombatEntityRegistry();
    const first = enemyAt(2);
    const second = enemyAt(-2);
    const firstTargets: THREE.Vector3[] = [];
    const secondTargets: THREE.Vector3[] = [];
    first.update = ((_delta, _player, _damage, target) => {
      if (target) firstTargets.push(target.clone());
    }) as Enemy['update'];
    second.update = ((_delta, _player, _damage, target) => {
      if (target) secondTargets.push(target.clone());
    }) as Enemy['update'];
    registry.register({ id: 'first', phaseId: 1, role: 'regular', enemy: first });
    registry.register({ id: 'second', phaseId: 1, role: 'regular', enemy: second });

    registry.update(0, new THREE.Vector3(), () => undefined);
    first.root.position.x = -2;
    second.root.position.x = 2;
    registry.update(0, new THREE.Vector3(), () => undefined);

    expect(firstTargets[1]).toEqual(firstTargets[0]);
    expect(secondTargets[1]).toEqual(secondTargets[0]);
  });
});
