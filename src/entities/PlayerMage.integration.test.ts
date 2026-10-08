import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import type { CharacterAssetStore } from '../characters/CharacterAssetStore';
import { MAGE_BASIC_ATTACK_PLAYBACK_RATE, Player, type MageBasicAttackCastEvent, type MageSpellCastEvent } from './Player';
import { getWeaponDefinition } from '../equipment/EquipmentCatalog';
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

function createMageAssets(basicDuration = 1): CharacterAssetStore {
  const mageAnimations = [
    clip('idle'),
    clip('correr para frente', 0.733),
    clip('correr rapido2', 0.62),
    clip('ataque basico', basicDuration),
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
  it('acelera o ataque básico da Maga em 5%, para um intervalo de cerca de 0,86 s', async () => {
    const player = new Player('mage', createMageAssets(1.8));
    await player.load();
    const casts: MageSpellCastEvent[] = [];
    player.onMageSpellCast((event) => { casts.push(event); });
    player.attackAtCursor();
    const action = casts[0].action;
    expect(action.getEffectiveTimeScale()).toBe(MAGE_BASIC_ATTACK_PLAYBACK_RATE);
    expect(action.getClip().duration).toBeCloseTo(1.8);

    player.update(0.48);
    expect(action.time).toBeCloseTo(0.48 * MAGE_BASIC_ATTACK_PLAYBACK_RATE);
    expect(player.isAttackInSwing()).toBe(true);
    player.update(0.35);
    expect(player.isAttackInSwing()).toBe(true);
    player.update(0.03);
    expect(player.isAttackInSwing()).toBe(false);
    expect(casts).toHaveLength(1);
    // Em 0,86 s outro básico já é aceito (antes o intervalo aguardava 0,9 s).
    player.attackAtCursor();
    expect(casts).toHaveLength(2);
  });

  it('does not inherit a sword chain or spend extra MP when the Mage basic is clicked rapidly', async () => {
    const player = new Player('mage', createMageAssets(1.8));
    await player.load();
    expect(player.equipWeapon(getWeaponDefinition('sword')!, new THREE.Group())).toBe(true);
    const casts: MageSpellCastEvent[] = [];
    player.onMageSpellCast((event) => { casts.push(event); });
    let spent = 0;
    player.basicAttackCost = { canAfford: () => true, spend: () => { spent += 1; } };
    const enemy = new THREE.Group();
    enemy.position.z = 1.7;
    player.attackEnemy(enemy, () => undefined);
    for (let index = 0; index < 8; index += 1) {
      player.update(0.1);
      player.attackAtCursor();
      player.attackEnemy(enemy, () => undefined);
    }
    expect(casts).toHaveLength(1);
    expect(spent).toBe(1);
    player.update(0.25);
    expect(player.isAttackInSwing()).toBe(false);
    expect(casts).toHaveLength(1);
    player.attackAtCursor();
    expect(casts).toHaveLength(2);
    expect(casts[1].action.getEffectiveTimeScale()).toBe(MAGE_BASIC_ATTACK_PLAYBACK_RATE);
    expect(spent).toBe(2);
  });

  it('preserves the normal basic interval across target changes and movement cancellation', async () => {
    const player = new Player('mage', createMageAssets(1.8));
    await player.load();
    const casts: MageSpellCastEvent[] = [];
    player.onMageSpellCast((event) => { casts.push(event); });
    const first = new THREE.Group(); first.position.z = 1;
    const second = new THREE.Group(); second.position.z = 2;
    player.attackEnemy(first, () => undefined);
    player.update(0.7);
    player.attackEnemy(second, () => undefined);
    player.cancelMovement();
    player.attackAtCursor();
    expect(casts).toHaveLength(1);
    player.update(0.15);
    player.attackAtCursor();
    expect(casts).toHaveLength(1);
    player.update(0.1);
    player.attackAtCursor();
    expect(casts).toHaveLength(2);
  });

  it('grounds the body mesh without using the staff bounds as the floor reference', async () => {
    const player = new Player('mage', createMageAssets());

    await player.load();

    const body = player.root.getObjectByName('Maga') as THREE.Mesh;
    body.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(body);
    // A base da malha do corpo (e, portanto, os pés) precisa ficar no plano
    // do chão do jogo: antes um gameYOffset de +0,9 m deixava a Maga suspensa.
    expect(bounds.min.y).toBeCloseTo(player.root.position.y, 3);
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

  it('finds the actual Mage GLB hands after GLTFLoader sanitizes Mixamo names', async () => {
    const assets = createMageAssets();
    assets.createModel = () => {
      const model = createMageModel();
      model.traverse((object) => {
        object.name = THREE.PropertyBinding.sanitizeNodeName(object.name);
      });
      return model;
    };
    const player = new Player('mage', assets);
    await player.load();
    const casts: MageSpellCastEvent[] = [];
    player.onMageSpellCast((event) => { casts.push(event); });

    expect(player.tryStartSkillAttack('pulo_atacando')).toBe(true);
    expect(casts[0].rightHand).toBe(player.root.getObjectByName('mixamorigRightHand'));
    expect(casts[0].leftHand).toBe(player.root.getObjectByName('mixamorigLeftHand'));
    expect(casts[0].rightHand).not.toBeNull();
    expect(casts[0].leftHand).not.toBeNull();
  });

  it('gives Mage skills no damage immunity', async () => {
    const player = new Player('mage', createMageAssets());
    await player.load();

    expect(player.tryStartSkillAttack('ataque_giratorio')).toBe(true);
    expect(player.actionInvulnerabilityRemaining).toBe(0);
    player.takeDamage(40);
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
      expect(player.actionInvulnerabilityRemaining).toBe(0);
      const latestCast = casts[casts.length - 1];
      expect(latestCast?.spellId).toBe(expectedSpellBySkill[skill.id]);
      expect(latestCast?.onImpact).toBeNull();
      for (let step = 0; step < 25; step += 1) player.update(0.1);
      expect(player.isAttackInSwing()).toBe(false);
    }
  });

  it.each([
    ['ataque_giratorio', 1.8],
    ['ataque_giratorio_2', 1.8],
    ['pulo_atacando', 2.1],
    ['triplo_ataque', 1.8],
    ['corte_duplo', 1.9],
  ] as const)('accelerates %s without desynchronizing the clip and action slot', async (id, rate) => {
    const player = new Player('mage', createMageAssets());
    await player.load();
    const casts: MageSpellCastEvent[] = [];
    player.onMageSpellCast((event) => { casts.push(event); });

    expect(player.tryStartSkillAttack(id)).toBe(true);
    const action = casts[0].action;
    const duration = action.getClip().duration / rate;
    expect(action.getEffectiveTimeScale()).toBeCloseTo(rate);
    expect(player.activeSkillRemainingSeconds).toBeCloseTo(duration);
    expect(player.getWarriorSkillComboTiming(id)?.durationSeconds).toBeCloseTo(duration);

    player.update(duration - 0.01);
    expect(player.isCastingSkill).toBe(true);
    player.update(0.02);
    expect(player.isCastingSkill).toBe(false);
  });

  it('scales the faster Mage clip and combo gauge together, without the Warrior landing pause', async () => {
    const player = new Player('mage', createMageAssets());
    await player.load();
    const casts: MageSpellCastEvent[] = [];
    player.onMageSpellCast((event) => { casts.push(event); });
    const normal = player.getWarriorSkillComboTiming('pulo_atacando')!;

    expect(player.tryStartSkillAttack('pulo_atacando', { playbackScale: 1.3 })).toBe(true);
    expect(casts[0].action.getEffectiveTimeScale()).toBeCloseTo(2.1 * 1.3);
    const empowered = player.getWarriorSkillComboTiming('pulo_atacando')!;
    expect(empowered.durationSeconds).toBeCloseTo(normal.durationSeconds / 1.3);
    expect(empowered.lastHitSeconds).toBeCloseTo(normal.lastHitSeconds / 1.3);
    expect(player.activeSkillRemainingSeconds).toBeCloseTo(empowered.durationSeconds);

    player.update(empowered.durationSeconds + 0.01);
    expect(player.isCastingSkill).toBe(false);
    expect(player.activeSkillRemainingSeconds).toBe(0);
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

  it('grants the Mage basic cast no action immunity at all (0 seconds)', async () => {
    const player = new Player('mage', createMageAssets());
    await player.load();

    player.attackAtCursor();
    expect(player.isAttackInSwing()).toBe(true);
    expect(player.actionInvulnerabilityRemaining).toBe(0);
    player.takeDamage(40);
    expect(player.hp).toBe(60);
  });

  it('spends the Mage basic-attack MP cost only when the cast commits', async () => {
    const player = new Player('mage', createMageAssets());
    await player.load();

    let canAfford = false;
    let spent = 0;
    player.basicAttackCost = {
      canAfford: () => canAfford,
      spend: () => { spent += 1; },
    };

    player.attackAtCursor();
    expect(player.isAttackInSwing()).toBe(false);
    expect(spent).toBe(0);

    canAfford = true;
    player.attackAtCursor();
    expect(player.isAttackInSwing()).toBe(true);
    expect(spent).toBe(1);
  });
});
