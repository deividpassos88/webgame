import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import type { RegularEnemyVisual } from '../waves/EnemyAssetStore';
import { Enemy } from './Enemy';
import { ARCHER_CLIP_NAMES, EnemyAnimationController } from './EnemyAnimationController';

function animation(name: string, duration: number): THREE.AnimationClip {
  return new THREE.AnimationClip(name, duration, [
    new THREE.VectorKeyframeTrack(
      'Hips.position',
      [0, duration],
      [0, 1, 0, 0.5, 1, 0.5]
    ),
  ]);
}

function animatedVisual(): RegularEnemyVisual {
  const model = new THREE.Group();
  const hips = new THREE.Bone();
  hips.name = 'Hips';
  model.add(hips);
  model.add(
    new THREE.Mesh(
      new THREE.BoxGeometry(1, 2, 1),
      new THREE.MeshStandardMaterial()
    )
  );
  return {
    model,
    animations: [
      animation('Character_output.fbx', 0.067),
      animation('Walking', 1.067),
      animation('Running', 0.667),
      animation('Charged_Slash', 2.267),
      animation('Charged_Upward_Slash', 3.233),
      animation('dying_backwards', 2.267),
    ],
  };
}

function animatedEnemy(): Enemy {
  return new Enemy(
    {
      position: new THREE.Vector3(),
      hp: 50,
      damage: 4,
      scale: 0.7,
      detectionRange: 18,
      attackRange: 1.7,
      speed: 2.2,
    },
    animatedVisual()
  );
}

function animatedEnemyWithoutRunning(): Enemy {
  const visual = animatedVisual();
  visual.animations = visual.animations.filter((clip) => clip.name !== 'Running');
  return new Enemy(
    {
      position: new THREE.Vector3(),
      hp: 50,
      damage: 4,
      scale: 0.7,
      detectionRange: 18,
      attackRange: 1.7,
      speed: 2.2,
    },
    visual
  );
}

function animatedArcher(): Enemy {
  const model = new THREE.Group();
  const hips = new THREE.Bone();
  hips.name = 'Hips';
  model.add(hips);
  model.add(new THREE.Mesh(new THREE.BoxGeometry(1, 2, 1), new THREE.MeshStandardMaterial()));
  const options = {
    position: new THREE.Vector3(),
    damage: 7,
    detectionRange: 18,
    attackRange: 10.5,
    attackMode: 'ranged' as const,
  };
  return new Enemy(options, {
    model,
    animations: ['idle', 'correndo', 'atacando', 'morrendo'].map((name) => animation(name, 1)),
  }, (source, clips) => new EnemyAnimationController(source, clips, 1, ARCHER_CLIP_NAMES, 'archer'));
}

describe('animated regular enemy', () => {
  it('grounds and normalizes the GLB while starting in the static pose', () => {
    const enemy = animatedEnemy();
    const bounds = new THREE.Box3().setFromObject(enemy.root);

    expect(bounds.min.y).toBeCloseTo(0, 5);
    expect(bounds.getSize(new THREE.Vector3()).y).toBeCloseTo(1.47, 5);
    expect(enemy.animationState).toBe('idle');
  });

  it('uses Running while pursuing a detected player', () => {
    const enemy = animatedEnemy();

    enemy.update(0.1, new THREE.Vector3(8, 0, 0), () => undefined);

    expect(enemy.animationState).toBe('running');
    expect(enemy.root.position.x).toBeGreaterThan(0);
  });

  it('prioritizes closing on the player before taking a surround position', () => {
    const enemy = animatedEnemy();
    enemy.root.position.set(3, 0, 0);
    const player = new THREE.Vector3(0, 0, 0);
    const surroundPosition = new THREE.Vector3(0, 0, 3);

    enemy.update(0.1, player, () => undefined, surroundPosition);

    expect(enemy.root.position.x).toBeLessThan(3);
    expect(enemy.root.position.z).toBeCloseTo(0, 5);
    expect(enemy.animationState).toBe('running');
  });

  it('never overshoots the player while closing in with a large frame delta', () => {
    const enemy = animatedEnemy();
    enemy.root.position.set(3, 0, 0);
    enemy.update(0.1, new THREE.Vector3(), () => undefined, new THREE.Vector3(3.6, 0, 0));
    const distanceBeforeLargeStep = enemy.root.position.distanceTo(new THREE.Vector3());

    enemy.update(1, new THREE.Vector3(), () => undefined, new THREE.Vector3(3.6, 0, 0));

    expect(enemy.root.position.x).toBeGreaterThanOrEqual(0);
    expect(enemy.root.position.distanceTo(new THREE.Vector3())).toBeLessThan(distanceBeforeLargeStep);
  });

  it('keeps running while it still needs to close on the player', () => {
    const enemy = animatedEnemy();
    enemy.root.position.set(3, 0, 0);
    const player = new THREE.Vector3();

    enemy.update(0.1, player, () => undefined, new THREE.Vector3(3.6, 0, 0));
    expect(enemy.animationState).toBe('running');
    enemy.update(0, player, () => undefined, enemy.root.position.clone().add(new THREE.Vector3(0.1, 0, 0)));
    expect(enemy.animationState).toBe('running');
    enemy.update(0.1, player, () => undefined, enemy.root.position.clone().add(new THREE.Vector3(0.3, 0, 0)));

    expect(enemy.animationState).toBe('running');
  });

  it('attacks an in-range player before moving toward a distant surround slot', () => {
    const enemy = animatedEnemy();
    const damage: number[] = [];
    const player = new THREE.Vector3(1, 0, 0);
    const distantSlot = new THREE.Vector3(0, 0, 5);

    enemy.update(0, player, amount => damage.push(amount), distantSlot);
    expect(enemy.animationState).toBe('attack-primary');
    expect(enemy.root.position.toArray()).toEqual([0, 0, 0]);

    enemy.update(0.78, player, amount => damage.push(amount), distantSlot);
    expect(damage).toEqual([4]);
  });

  it('alternates both slash animations and damages once per completed attack cycle', () => {
    const enemy = animatedEnemy();
    const damage: number[] = [];
    const playerPosition = new THREE.Vector3(1, 0, 0);

    enemy.update(0, playerPosition, (amount) => damage.push(amount));
    expect(enemy.animationState).toBe('attack-primary');
    expect(damage).toEqual([]);

    enemy.update(0.78, playerPosition, (amount) => damage.push(amount));
    enemy.update(0.62, playerPosition, (amount) => damage.push(amount));
    expect(damage).toEqual([4]);
    expect(enemy.animationState).toBe('attack-secondary');

    enemy.update(0.78, playerPosition, (amount) => damage.push(amount));
    enemy.update(0.62, playerPosition, (amount) => damage.push(amount));
    expect(damage).toEqual([4, 4]);
    expect(enemy.animationState).toBe('attack-primary');
  });

  it('cancels an animated strike before it lands when the player leaves attack range', () => {
    const enemy = animatedEnemy();
    const damage: number[] = [];

    enemy.update(0, new THREE.Vector3(1, 0, 0), (amount) => damage.push(amount));
    expect(enemy.animationState).toBe('attack-primary');

    enemy.update(0.8, new THREE.Vector3(1.8, 0, 0), (amount) => damage.push(amount));

    expect(damage).toEqual([]);
    expect(enemy.animationState).toBe('running');
  });

  it('returns to an available locomotion action after leaving range without Running', () => {
    const enemy = animatedEnemyWithoutRunning();
    const damage: number[] = [];

    enemy.update(0, new THREE.Vector3(1, 0, 0), (amount) => damage.push(amount));
    expect(enemy.animationState).toBe('attack-primary');

    enemy.update(0.8, new THREE.Vector3(2, 0, 0), (amount) => damage.push(amount));

    expect(damage).toEqual([]);
    expect(enemy.animationState).toBe('idle');
  });

  it('restores a GLB material emissive intensity after a non-lethal hit flash', () => {
    const sourceMaterial = new THREE.MeshStandardMaterial({
      color: 0x718ca8,
      emissive: 0x14283c,
      emissiveIntensity: 0.73,
    });
    const emissiveMap = new THREE.Texture();
    sourceMaterial.emissiveMap = emissiveMap;
    const model = new THREE.Group();
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), sourceMaterial);
    model.add(mesh);
    const enemy = new Enemy(
      { position: new THREE.Vector3(), hp: 2 },
      { model, animations: [] }
    );
    const material = mesh.material as THREE.MeshStandardMaterial;

    expect(material).not.toBe(sourceMaterial);
    expect(material.emissiveMap).toBe(emissiveMap);
    expect(material.emissiveIntensity).toBe(0.73);

    enemy.takeDamage(1);
    enemy.update(0.01, new THREE.Vector3(100, 0, 0), () => undefined);
    expect(material.emissiveIntensity).toBeCloseTo(2.73);

    enemy.update(0.15, new THREE.Vector3(100, 0, 0), () => undefined);
    expect(material.emissiveIntensity).toBe(0.73);
    expect(sourceMaterial.emissiveIntensity).toBe(0.73);
  });

  it('removes only the full-white export glow while preserving the original texture', () => {
    const texture = new THREE.Texture();
    const sourceMaterial = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      emissive: 0xffffff,
      emissiveIntensity: 1,
    });
    sourceMaterial.map = texture;
    sourceMaterial.emissiveMap = texture;
    const model = new THREE.Group();
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), sourceMaterial);
    model.add(mesh);

    const enemy = new Enemy(
      { position: new THREE.Vector3(), hp: 2 },
      { model, animations: [] }
    );
    const material = mesh.material as THREE.MeshStandardMaterial;

    expect(material).not.toBe(sourceMaterial);
    expect(material.map).toBe(texture);
    expect(material.emissiveMap).toBe(texture);
    expect(material.emissiveIntensity).toBe(0);
    expect(sourceMaterial.emissiveIntensity).toBe(1);

    enemy.takeDamage(1);
    enemy.update(0.01, new THREE.Vector3(100, 0, 0), () => undefined);
    expect(material.emissiveIntensity).toBe(2);
    enemy.update(0.15, new THREE.Vector3(100, 0, 0), () => undefined);
    expect(material.emissiveIntensity).toBe(0);
  });

  it('restores every procedural standard material after a non-lethal hit flash', () => {
    const enemy = new Enemy({ position: new THREE.Vector3(), hp: 2 });
    const materials = new Set<THREE.MeshStandardMaterial>();
    enemy.root.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (!mesh.isMesh) return;
      const meshMaterials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      meshMaterials.forEach((material) => {
        if (material instanceof THREE.MeshStandardMaterial) materials.add(material);
      });
    });
    const originalIntensities = new Map(
      [...materials].map((material) => [material, material.emissiveIntensity])
    );

    enemy.takeDamage(1);
    enemy.update(0.01, new THREE.Vector3(100, 0, 0), () => undefined);
    for (const [material, baseIntensity] of originalIntensities) {
      expect(material.emissiveIntensity).toBeCloseTo(baseIntensity + 2);
    }

    enemy.update(0.15, new THREE.Vector3(100, 0, 0), () => undefined);
    for (const [material, baseIntensity] of originalIntensities) {
      expect(material.emissiveIntensity).toBe(baseIntensity);
    }
  });

  it('waits for dying_backwards, then burns the regular GLB into ash', () => {
    const enemy = animatedEnemy();

    enemy.takeDamage(50);
    enemy.update(2.267, new THREE.Vector3(), () => undefined);
    expect(enemy.animationState).toBe('dead');
    expect(enemy.deathEffectStage).toBe('burn');
    expect(enemy.markedForRemoval).toBe(false);

    enemy.update(0.35, new THREE.Vector3(), () => undefined);
    expect(enemy.root.scale).toEqual(new THREE.Vector3(1, 1, 1));

    enemy.update(0.35, new THREE.Vector3(), () => undefined);
    expect(enemy.deathEffectStage).toBe('ash');

    enemy.update(0.55, new THREE.Vector3(), () => undefined);
    expect(enemy.deathEffectStage).toBe('complete');
    expect(enemy.markedForRemoval).toBe(true);
  });

  it('releases an animated archer shot near the end of atacando', () => {
    const archer = animatedArcher();
    const shots: number[] = [];
    const player = new THREE.Vector3(8, 0, 0);

    archer.update(0, player, () => undefined, undefined, undefined, (attack) => shots.push(attack.damage));
    expect(archer.animationState).toBe('attack-primary');
    archer.update(1.1, player, () => undefined, undefined, undefined, (attack) => shots.push(attack.damage));
    expect(shots).toEqual([]);
    archer.update(0.06, player, () => undefined, undefined, undefined, (attack) => shots.push(attack.damage));
    expect(shots).toHaveLength(1);
  });
});
