import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import type { CharacterAssetStore } from '../characters/CharacterAssetStore';
import { Player, type MageBasicAttackCastEvent, type MageSpellCastEvent } from './Player';
import { WARRIOR_SKILLS } from '../combat/WarriorSkillCatalog';

function clip(name: string, duration = 1): THREE.AnimationClip {
  return new THREE.AnimationClip(name, duration, []);
}

function createMageModel(): THREE.Group {
  const model = new THREE.Group();
  const hips = new THREE.Bone();
  hips.name = 'mixamorig:Hips';
  const rightHand = new THREE.Bone();
  rightHand.name = 'mixamorig:RightHand';
  rightHand.position.set(0.25, 0.8, 0.1);
  const leftHand = new THREE.Bone();
  leftHand.name = 'mixamorig:LeftHand';
  leftHand.position.set(-0.25, 0.8, 0.1);
  hips.add(rightHand, leftHand);
  model.add(hips);
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(0.4, 1.8, 0.35),
    new THREE.MeshStandardMaterial({ map: new THREE.Texture() })
  );
  body.name = 'Maga';
  body.position.y = -0.35;
  model.add(body);
  const staff = new THREE.Mesh(
    new THREE.BoxGeometry(0.1, 4, 0.1),
    new THREE.MeshBasicMaterial()
  );
  staff.name = 'cajado';
  staff.position.y = -3;
  model.add(staff);
  return model;
}

function createMageAssets(): CharacterAssetStore {
  const mageAnimations = [
    clip('idle'),
    clip('correr para frente', 0.733),
    clip('correr rapido2', 0.62),
    clip('ataque basico'),
    clip('ataque agua'),
    clip('ataque gelo'),
    clip('ataque choque'),
    clip('ataque laser'),
    clip('ataque de larva'),
    clip('hit'),
    clip('morrendo'),
  ];
  return {
    createModel: createMageModel,
    getAnimations: () => mageAnimations,
    getBoneNames: () => new Set<string>(['mixamorig:Hips', 'mixamorig:RightHand', 'mixamorig:LeftHand']),
    getBoneRestRotations: () => new Map<string, THREE.Quaternion>(),
    getBoneRestTranslations: () => new Map<string, THREE.Vector3>([
      ['mixamorig:Hips', new THREE.Vector3(0.045, 54.25, -3.14)],
    ]),
  } as unknown as CharacterAssetStore;
}

describe('Mage gameplay player', () => {
  it('grounds the body mesh without using the staff bounds as the floor reference', async () => {
    const player = new Player('mage', createMageAssets());

    await player.load();

    const body = player.root.getObjectByName('Maga') as THREE.Mesh;
    body.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(body);
    expect(bounds.min.y).toBeGreaterThan(0.6);
  });

  it('adds a texture-preserving emissive lift so the Mage face does not render black in the dungeon', async () => {
    const player = new Player('mage', createMageAssets());

    await player.load();

    const body = player.root.getObjectByName('Maga') as THREE.Mesh;
    const material = body.material as THREE.MeshStandardMaterial;
    expect(material).toBeInstanceOf(THREE.MeshStandardMaterial);
    expect(material.emissiveIntensity).toBeCloseTo(0.38);
  });

  it('plays the Mage fast-run clip with the same base cadence policy as Guerreiro', async () => {
    const player = new Player('mage', createMageAssets());

    await player.load();

    const controls = player as unknown as {
      actions: Partial<Record<string, THREE.AnimationAction>>;
    };
    expect(player.previewAnimation('running')).toBe(true);

    expect(controls.actions.running?.getClip().name).toBe('mage:running');
    expect(controls.actions.running?.getClip().duration).toBeCloseTo(0.62);
    expect(controls.actions.running?.getEffectiveTimeScale()).toBeCloseTo(1);
  });

  it('blinks instead of dashing and keeps the authored run cadence', async () => {
    const player = new Player('mage', createMageAssets());
    await player.load();
    const controls = player as unknown as {
      actions: Partial<Record<string, THREE.AnimationAction>>;
    };

    player.setKeyboardMoving(true);
    player.moveByDirection(new THREE.Vector3(0, 0, 1), 0.05);
    expect(controls.actions.running?.getClip().name).toBe('mage:running');
    expect(controls.actions.running?.getEffectiveTimeScale()).toBeGreaterThan(0.74);
    expect(controls.actions.running?.getEffectiveTimeScale()).toBeLessThan(1.16);

    expect(player.tryDash(new THREE.Vector3(1, 0, 0))).toBe(false);
    expect(player.root.position.x).toBeCloseTo(0);
    expect(player.blinkTo(new THREE.Vector3(7, 0, 1), new THREE.Vector3(1, 0, 0))).toBe(true);
    expect(player.root.position.x).toBeCloseTo(7);
    expect(player.planarForward().x).toBeCloseTo(1);
    expect(player.actionInvulnerabilityRemaining).toBe(1);
    player.takeDamage(40);
    expect(player.hp).toBe(100);
    player.update(0.05);
    player.update(1);
    player.takeDamage(40);
    expect(player.hp).toBe(60);
  });



  it('emits the Mage basic VFX cast from the right hand and defers damage to projectile impact', async () => {
    const player = new Player('mage', createMageAssets());
    await player.load();

    const target = new THREE.Group();
    target.position.set(0, 0, 1.7);
    target.userData.isEnemyRoot = true;
    target.userData.enemyBodyScale = 1;

    let directHits = 0;
    const casts: MageBasicAttackCastEvent[] = [];
    player.onMageBasicAttackCast((event) => { casts.push(event); });

    player.attackEnemy(target, () => { directHits += 1; });

    expect(casts).toHaveLength(1);
    const cast = casts[0];
    expect(cast.rightHand?.name).toBe('mixamorig:RightHand');
    expect(cast.action.getClip().name).toBe('mage:attack:ataque_basico');

    for (let step = 0; step < 8; step += 1) player.update(0.05);
    expect(directHits).toBe(0);

    cast.onImpact?.(target);
    expect(directHits).toBe(1);
  });

  it('keeps Mage skill protection active for the animation plus one extra second', async () => {
    const player = new Player('mage', createMageAssets());
    await player.load();

    expect(player.tryStartSkillAttack('ataque_giratorio')).toBe(true);
    player.takeDamage(40);
    expect(player.hp).toBe(100);

    player.update(0.1);
    player.update(1.84);
    player.takeBossSkillDamage(40);
    expect(player.hp).toBe(100);

    player.update(0.08);
    player.takeBossSkillDamage(40);
    expect(player.hp).toBe(60);
  });

  it('refuses a skill while moving and stays pinned until that skill animation ends', async () => {
    const player = new Player('mage', createMageAssets());
    await player.load();
    player.root.position.set(2, 0, -3);

    player.setKeyboardMoving(true);
    expect(player.blocksSkillsWhileMoving).toBe(true);
    expect(player.tryStartSkillAttack('ataque_giratorio')).toBe(false);

    player.setKeyboardMoving(false);
    expect(player.tryStartSkillAttack('ataque_giratorio')).toBe(true);
    player.moveByDirection(new THREE.Vector3(1, 0, 0), 0.2);
    player.update(0.2);
    player.enforceSkillCastAnchor();

    expect(player.isCastingSkill).toBe(true);
    expect(player.root.position.x).toBeCloseTo(2);
    expect(player.root.position.z).toBeCloseTo(-3);
    expect(player.tryDash(new THREE.Vector3(0, 0, 1))).toBe(false);
    expect(player.root.position.z).toBeCloseTo(-3);

    for (let step = 0; step < 25; step += 1) player.update(0.1);
    expect(player.isCastingSkill).toBe(false);
    player.moveByDirection(new THREE.Vector3(1, 0, 0), 0.1);
    expect(player.root.position.x).toBeGreaterThan(2);
  });

  it('still lets the basic attack move while the swing plays', async () => {
    const player = new Player('mage', createMageAssets());
    await player.load();

    player.attackAtCursor();
    player.moveByDirection(new THREE.Vector3(0, 0, 1), 0.1);

    expect(player.isAttackInSwing()).toBe(true);
    expect(player.activeWarriorAttackId).toBe('ataque_basico');
    expect(player.root.position.z).toBeGreaterThan(0);
  });

  it('can preview every mapped Mage skill animation and emits its spell VFX id without equipping a sword', async () => {
    const player = new Player('mage', createMageAssets());
    await player.load();

    const casts: MageSpellCastEvent[] = [];
    player.onMageSpellCast((event) => { casts.push(event); });
    const expectedSpellBySkill = {
      ataque_giratorio: 'water',
      ataque_giratorio_2: 'ice',
      pulo_atacando: 'lightning',
      triplo_ataque: 'laser',
      corte_duplo: 'lava',
    } as const;

    for (const skill of WARRIOR_SKILLS) {
      expect(player.tryStartSkillAttack(skill.id)).toBe(true);
      expect(player.activeWarriorAttackId).toBe(skill.id);
      if (skill.id === 'ataque_giratorio') {
        expect(player.actionInvulnerabilityRemaining).toBeGreaterThan(1.8);
      }
      const latestCast = casts[casts.length - 1];
      expect(latestCast?.spellId).toBe(expectedSpellBySkill[skill.id]);
      expect(latestCast?.onImpact).toBeNull();
      for (let step = 0; step < 25; step += 1) player.update(0.1);
      expect(player.isAttackInSwing()).toBe(false);
    }
  });

  it('frees Mage movement at spell launch while recovery still owns the action slot', async () => {
    const player = new Player('mage', createMageAssets());
    await player.load();
    player.root.position.set(2, 0, -3);

    expect(player.tryStartSkillAttack('pulo_atacando')).toBe(true);
    player.moveByDirection(new THREE.Vector3(1, 0, 0), 0.1);
    expect(player.root.position.x).toBeCloseTo(2);

    // The VFX bridge calls this when the spell launches.
    player.releaseSkillCastAnchor();
    expect(player.isCastingSkill).toBe(true);

    player.moveByDirection(new THREE.Vector3(1, 0, 0), 0.1);
    expect(player.root.position.x).toBeGreaterThan(2);
    const afterStep = player.root.position.x;
    player.update(0.1);
    // The anchor no longer snaps the Mage back while recovery plays out.
    expect(player.root.position.x).toBeCloseTo(afterStep);

    // The action slot stays owned: clicks cannot queue attacks behind the skill.
    const target = new THREE.Group();
    player.attackEnemy(target, () => undefined);
    expect(player.isCastingSkill).toBe(true);

    player.moveTo(new THREE.Vector3(6, 0, -3));
    for (let step = 0; step < 25; step += 1) player.update(0.1);
    expect(player.isCastingSkill).toBe(false);
    expect(player.root.position.x).toBeGreaterThan(afterStep);
  });
});
