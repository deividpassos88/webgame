import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import type { CharacterAssetStore } from '../characters/CharacterAssetStore';
import { WARRIOR_ATTACK_IDS, type WarriorAttackId } from '../characters/CharacterCatalog';
import { createRuntimeWarriorSword } from '../characters/RuntimeWarriorWeapon';
import { getWeaponDefinition } from '../equipment/EquipmentCatalog';
import { Player } from './Player';

function animation(name: string, duration = 1) {
  return new THREE.AnimationClip(name, duration, []);
}

function createModelWithHand(): THREE.Group {
  const model = new THREE.Group();
  const hand = new THREE.Bone();
  hand.name = 'mixamorigRightHand';
  model.add(hand);
  return model;
}

function createModelWithEmbeddedSword(): THREE.Group {
  const model = createModelWithHand();
  const sword = new THREE.Group();
  sword.name = 'sword';
  const blade = new THREE.Mesh(
    new THREE.BoxGeometry(0.08, 1.4, 0.03),
    new THREE.MeshBasicMaterial()
  );
  blade.name = 'embedded-blade';
  const base = new THREE.Object3D();
  base.name = 'VFX_SwordBase';
  const tip = new THREE.Object3D();
  tip.name = 'VFX_SwordTip';
  tip.position.y = 1.4;
  sword.add(blade, base, tip);
  model.children[0].add(sword);
  return model;
}

async function loadedPlayerWithWeapon(id: 'sword' | 'axe') {
  const clips = [
    animation('idle_sword'),
    animation('caminhando'),
    animation('correndo'),
    animation('ataque_basico'),
    animation('ataque_giratorio'),
    animation('ataque_giratorio_2'),
    animation('pulo_atacando'),
    animation('triplo_ataque'),
    animation('corte_duplo'),
    animation('recebe_dano'),
    animation('morte'),
    animation('caiu'),
  ];
  const assets = {
    createModel: createModelWithHand,
    getAnimations: () => clips,
    getBoneNames: () => new Set<string>(),
  } as unknown as CharacterAssetStore;
  const player = new Player('paladin', assets);
  await player.load();
  const definition = getWeaponDefinition(id);
  if (!definition) throw new Error(`${id} definition missing in integration fixture`);
  const weapon = id === 'sword' ? createRuntimeWarriorSword() : new THREE.Group();
  if (id === 'axe') {
    weapon.add(new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.9, 0.12), new THREE.MeshBasicMaterial()));
  }
  expect(player.equipWeapon(definition, weapon)).toBe(true);
  return player;
}

async function loadedPlayerWithSword() {
  return loadedPlayerWithWeapon('sword');
}

async function loadedPlayerWithAuthoredFlameMotion() {
  const model = createModelWithHand();
  const sword = new THREE.Mesh(
    new THREE.BoxGeometry(0.08, 1.4, 0.03),
    new THREE.MeshBasicMaterial()
  );
  sword.name = 'sword';
  model.children[0].add(sword);
  const hitWindowKeys = [0, 0.305, 0.335, 0.535, 0.565, 0.765, 0.795, 1];
  const handPositions = [
    [0, 0, 0], [0, 0, 0], [0.2, 0, 0], [0.2, 0, 0],
    [0.2, 0, 0.2], [0.2, 0, 0.2], [0, 0, 0.2], [0, 0, 0.2],
  ].flat();
  const flameClip = new THREE.AnimationClip('triplo_ataque', 1, [
    new THREE.VectorKeyframeTrack(
      'mixamorigRightHand.position',
      hitWindowKeys,
      handPositions
    ),
  ]);
  const clips = [
    animation('idle_sword'), animation('caminhando'), animation('correndo'),
    animation('ataque_basico'), animation('ataque_giratorio'),
    animation('ataque_giratorio_2'), animation('pulo_atacando'), flameClip,
    animation('corte_duplo'), animation('recebe_dano'), animation('morte'), animation('caiu'),
  ];
  const assets = {
    createModel: () => model,
    getAnimations: () => clips,
    getBoneNames: () => new Set<string>(['mixamorigRightHand']),
  } as unknown as CharacterAssetStore;
  const player = new Player('paladin', assets);
  await player.load();
  const definition = getWeaponDefinition('sword');
  if (!definition) throw new Error('sword definition missing');
  expect(player.equipWeapon(definition, createRuntimeWarriorSword())).toBe(true);
  return player;
}

async function loadedPlayerWithAuthoredDoubleCutMotion() {
  const model = createModelWithHand();
  const sword = new THREE.Mesh(
    new THREE.BoxGeometry(0.08, 1.4, 0.03),
    new THREE.MeshBasicMaterial()
  );
  sword.name = 'sword';
  model.children[0].add(sword);

  // The sampler reads both sides of each authored hit time. These three
  // direction changes stand in for the measured sword-tip sweeps in the GLB.
  const hitWindowKeys = [0, 0.1975, 0.2225, 0.4275, 0.4525, 0.6925, 0.7175, 1];
  const handPositions = [
    [0, 0, 0], [0, 0, 0], [0.2, 0, 0], [0.2, 0, 0],
    [0.2, 0, 0.2], [0.2, 0, 0.2], [0, 0, 0.2], [0, 0, 0.2],
  ].flat();
  const doubleCutClip = new THREE.AnimationClip('corte_duplo', 1, [
    new THREE.VectorKeyframeTrack(
      'mixamorigRightHand.position',
      hitWindowKeys,
      handPositions
    ),
  ]);
  const clips = [
    animation('idle_sword'), animation('caminhando'), animation('correndo'),
    animation('ataque_basico'), animation('ataque_giratorio'),
    animation('ataque_giratorio_2'), animation('pulo_atacando'),
    animation('triplo_ataque'), doubleCutClip,
    animation('recebe_dano'), animation('morte'), animation('caiu'),
  ];
  const assets = {
    createModel: () => model,
    getAnimations: () => clips,
    getBoneNames: () => new Set<string>(['mixamorigRightHand']),
  } as unknown as CharacterAssetStore;
  const player = new Player('paladin', assets);
  await player.load();
  const definition = getWeaponDefinition('sword');
  if (!definition) throw new Error('sword definition missing');
  expect(player.equipWeapon(definition, createRuntimeWarriorSword())).toBe(true);
  return player;
}

async function loadedPlayerWithoutWeapon() {
  const clips = [
    animation('idle_sword'),
    animation('caminhando'),
    animation('correndo'),
    animation('ataque_basico'),
    animation('ataque_giratorio'),
    animation('ataque_giratorio_2'),
    animation('pulo_atacando'),
    animation('triplo_ataque'),
    animation('corte_duplo'),
    animation('recebe_dano'),
    animation('morte'),
    animation('caiu'),
  ];
  const assets = {
    createModel: createModelWithHand,
    getAnimations: () => clips,
    getBoneNames: () => new Set<string>(),
  } as unknown as CharacterAssetStore;
  const player = new Player('paladin', assets);
  await player.load();
  return player;
}

function expectNoRuntimeWarriorVfx(root: THREE.Object3D) {
  expect(root.getObjectByName('RuntimeWarrior_ElementalSword')).toBeUndefined();
  expect(root.getObjectByName('RuntimeWarrior_AttackVfx')).toBeUndefined();
  expect(root.getObjectByName('RuntimeWarrior_SwordTrail')).toBeUndefined();
  expect(root.getObjectByName('RuntimeWarrior_SwordTrailGlow')).toBeUndefined();
}

describe('Player sword combo integration', () => {
  it('configures every warrior attack clip as a clamped, single-play action', async () => {
    const player = await loadedPlayerWithSword();
    const configured = player as unknown as {
      warriorAttackActions: Partial<Record<WarriorAttackId, THREE.AnimationAction>>;
      comboActions: THREE.AnimationAction[];
      actions: Partial<Record<'attacking', THREE.AnimationAction>>;
    };

    // setupComboActions maps each authored skill clip to its own stopped,
    // LoopOnce action, while the ordinary attack action remains the basic cut.
    expect(Object.keys(configured.warriorAttackActions).sort()).toEqual(
      [...WARRIOR_ATTACK_IDS].sort()
    );
    for (const attackId of WARRIOR_ATTACK_IDS) {
      const action = configured.warriorAttackActions[attackId];
      expect(action).toBeDefined();
      expect(action!.getClip().name).toBe(`paladin:attack:${attackId}`);
      expect(action!.loop).toBe(THREE.LoopOnce);
      expect(action!.repetitions).toBe(1);
      expect(action!.clampWhenFinished).toBe(true);
      expect(action!.timeScale).toBeCloseTo(1.45);
      expect(action!.isRunning()).toBe(false);
    }
    expect(configured.comboActions).toHaveLength(3);
    expect(configured.comboActions.map((action) => action.getClip().name)).toEqual([
      'paladin:attacking:combo:0',
      'paladin:attacking:combo:1',
      'paladin:attacking:combo:2',
    ]);
    expect(configured.actions.attacking).toBe(configured.warriorAttackActions.ataque_basico);
  });

  it('keeps the authored attack pose active when the same clip restarts for stage two', async () => {
    const model = createModelWithHand();
    const arm = new THREE.Bone();
    arm.name = 'LeftArm';
    model.add(arm);
    const attackRotation = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.72, 0, 0));
    const attackTrack = new THREE.QuaternionKeyframeTrack(
      'LeftArm.quaternion',
      [0, 1],
      [
        attackRotation.x, attackRotation.y, attackRotation.z, attackRotation.w,
        attackRotation.x, attackRotation.y, attackRotation.z, attackRotation.w,
      ]
    );
    const clips = [
      animation('idle_sword'), animation('caminhando'), animation('correndo'),
      new THREE.AnimationClip('ataque_basico', 1, [attackTrack]),
      animation('ataque_giratorio'), animation('ataque_giratorio_2'),
      animation('pulo_atacando'), animation('triplo_ataque'), animation('corte_duplo'),
      animation('recebe_dano'), animation('morte'), animation('caiu'),
    ];
    const assets = {
      createModel: () => model,
      getAnimations: () => clips,
      getBoneNames: () => new Set<string>(['LeftArm']),
    } as unknown as CharacterAssetStore;
    const player = new Player('paladin', assets);
    await player.load();
    const definition = getWeaponDefinition('sword');
    if (!definition) throw new Error('sword definition missing');
    expect(player.equipWeapon(definition, createRuntimeWarriorSword())).toBe(true);
    const enemy = new THREE.Object3D();
    enemy.position.set(0, 0, 1);
    player.attackEnemy(enemy, () => undefined);

    player.update(0.01);
    player.update(0.18);
    player.update(0.15);
    // The first rendered frame of stage two must already own the authored
    // pose; restarting the same action must not schedule a fresh 0→1 fade.
    player.update(0.001);

    expect(arm.quaternion.angleTo(attackRotation)).toBeLessThan(0.01);
  });

  it('reuses the Blender sword without attaching a duplicate model or Warrior VFX', async () => {
    const clips = [
      animation('idle_sword'), animation('caminhando'), animation('correndo'), animation('ataque_basico'),
      animation('recebe_dano'), animation('morte'),
    ];
    const assets = {
      createModel: createModelWithEmbeddedSword,
      getAnimations: () => clips,
      getBoneNames: () => new Set<string>(),
    } as unknown as CharacterAssetStore;
    const player = new Player('paladin', assets);
    await player.load();
    const embedded = player.root.getObjectByName('sword');
    const fallback = createRuntimeWarriorSword();
    const definition = getWeaponDefinition('sword');
    if (!definition || !embedded) throw new Error('embedded sword fixture missing');

    expect(embedded.visible).toBe(false);
    expect(player.equipWeapon(definition, fallback)).toBe(true);
    expect(embedded.visible).toBe(true);
    expect(fallback.parent).toBeNull();
    expectNoRuntimeWarriorVfx(player.root);
    expectNoRuntimeWarriorVfx(fallback);
  });

  it('keeps ordinary physical clicks free of Warrior VFX', async () => {
    const clips = [
      animation('idle_sword'), animation('caminhando'), animation('correndo'),
      animation('ataque_basico'), animation('ataque_giratorio'),
      animation('ataque_giratorio_2'), animation('pulo_atacando'),
      animation('triplo_ataque'), animation('corte_duplo'),
      animation('recebe_dano'), animation('morte'), animation('caiu'),
    ];
    const assets = {
      createModel: createModelWithHand,
      getAnimations: () => clips,
      getBoneNames: () => new Set<string>(),
    } as unknown as CharacterAssetStore;
    const player = new Player('paladin', assets);
    await player.load();
    const definition = getWeaponDefinition('sword');
    if (!definition) throw new Error('sword definition missing');
    const weapon = createRuntimeWarriorSword();
    expect(player.equipWeapon(definition, weapon)).toBe(true);
    const enemy = new THREE.Object3D();
    enemy.position.set(0, 0, 1);
    player.attackEnemy(enemy, () => undefined);

    for (let frame = 0; frame < 180; frame += 1) {
      player.update(0.02);
      expectNoRuntimeWarriorVfx(player.root);
    }
  });

  it('keeps a basic sword attack active while moving in its input direction', async () => {
    const player = await loadedPlayerWithSword();

    player.attackAtCursor();
    player.moveByDirection(new THREE.Vector3(1, 0, -1), 0.1);

    expect(player.isAttackInSwing()).toBe(true);
    expect(player.activeWarriorAttackId).toBe('ataque_basico');
    expect(player.root.position.x).toBeGreaterThan(0);
    expect(player.root.position.z).toBeLessThan(0);
  });

  it('keeps a skill attack active while moving in its input direction', async () => {
    const player = await loadedPlayerWithSword();

    expect(player.tryStartSkillAttack('triplo_ataque')).toBe(true);
    player.moveByDirection(new THREE.Vector3(-1, 0, 1), 0.1);

    expect(player.isAttackInSwing()).toBe(true);
    expect(player.activeWarriorAttackId).toBe('triplo_ataque');
    expect(player.root.position.x).toBeLessThan(0);
    expect(player.root.position.z).toBeGreaterThan(0);
  });

  it('starts a requested skill directly and emits every authored hit', async () => {
    const player = await loadedPlayerWithSword();
    const hits: Array<{ attackId: string; hitIndex: number }> = [];
    player.onWarriorSkillHit(({ attackId, hitIndex }) => hits.push({ attackId, hitIndex }));

    expect(player.tryStartSkillAttack('triplo_ataque')).toBe(true);
    expect(player.activeWarriorAttackId).toBe('triplo_ataque');
    player.update(0.72);

    expect(hits).toEqual([
      { attackId: 'triplo_ataque', hitIndex: 0 },
      { attackId: 'triplo_ataque', hitIndex: 1 },
      { attackId: 'triplo_ataque', hitIndex: 2 },
    ]);
    expectNoRuntimeWarriorVfx(player.root);
  });

  it('aims the three flame fans along the animated sword-tip sweeps in world space', async () => {
    const player = await loadedPlayerWithAuthoredFlameMotion();
    player.root.position.set(13, 0, -8);
    player.root.rotation.y = Math.PI / 2;
    const windows: Array<{ hitIndex: number; origin: THREE.Vector3; forward: THREE.Vector3 }> = [];
    const skillHits: Array<{ hitIndex: number; forward: THREE.Vector3 }> = [];
    player.onWarriorAttackWindow(({ hitIndex, origin, forward }) => {
      windows.push({ hitIndex, origin: origin.clone(), forward: forward.clone() });
    });
    player.onWarriorSkillHit(({ hitIndex, forward }) => {
      skillHits.push({ hitIndex, forward: forward.clone() });
    });

    expect(player.tryStartSkillAttack('triplo_ataque')).toBe(true);
    player.update(0.72);

    expect(windows.map(({ hitIndex }) => hitIndex)).toEqual([0, 1, 2]);
    expect(windows[0].forward.x).toBeCloseTo(0);
    expect(windows[0].forward.z).toBeCloseTo(-1);
    expect(windows[1].forward.x).toBeCloseTo(1);
    expect(windows[1].forward.z).toBeCloseTo(0);
    expect(windows[2].forward.x).toBeCloseTo(0);
    expect(windows[2].forward.z).toBeCloseTo(1);
    expect(windows.every(({ origin }) => origin.distanceTo(new THREE.Vector3(13, 0, -8)) < 1e-6)).toBe(true);
    expect(skillHits.map(({ hitIndex }) => hitIndex)).toEqual([0, 1, 2]);
    for (let index = 0; index < windows.length; index += 1) {
      expect(skillHits[index].forward.distanceTo(windows[index].forward)).toBeLessThan(1e-6);
    }
  });

  it('drives all three Double Cut effects from separate animated sword sweeps', async () => {
    const player = await loadedPlayerWithAuthoredDoubleCutMotion();
    player.root.position.set(-6, 0, 11);
    player.root.rotation.y = Math.PI / 2;
    const windows: Array<{ hitIndex: number; origin: THREE.Vector3; forward: THREE.Vector3 }> = [];
    const skillHits: Array<{ hitIndex: number; forward: THREE.Vector3 }> = [];
    player.onWarriorAttackWindow(({ hitIndex, origin, forward }) => {
      windows.push({ hitIndex, origin: origin.clone(), forward: forward.clone() });
    });
    player.onWarriorSkillHit(({ hitIndex, forward }) => {
      skillHits.push({ hitIndex, forward: forward.clone() });
    });

    expect(player.tryStartSkillAttack('corte_duplo')).toBe(true);
    player.update(0.72);

    expect(windows.map(({ hitIndex }) => hitIndex)).toEqual([0, 1, 2]);
    expect(windows[0].forward.x).toBeCloseTo(0);
    expect(windows[0].forward.z).toBeCloseTo(-1);
    expect(windows[1].forward.x).toBeCloseTo(1);
    expect(windows[1].forward.z).toBeCloseTo(0);
    expect(windows[2].forward.x).toBeCloseTo(0);
    expect(windows[2].forward.z).toBeCloseTo(1);
    expect(windows.every(({ origin }) => origin.distanceTo(new THREE.Vector3(-6, 0, 11)) < 1e-6)).toBe(true);
    expect(skillHits.map(({ hitIndex }) => hitIndex)).toEqual([0, 1, 2]);
    for (let index = 0; index < windows.length; index += 1) {
      expect(skillHits[index].forward.distanceTo(windows[index].forward)).toBeLessThan(1e-6);
    }
  });

  it('keeps the Warrior VFX clear during the complete physical visual swing', async () => {
    const player = await loadedPlayerWithSword();

    player.attackAtCursor();
    expectNoRuntimeWarriorVfx(player.root);

    // The damage window has closed at this point, but the visual swing is
    // still finishing. The authored animation remains, but no rendered
    // elemental effect, trail, particle, or glow may be mounted on the player.
    player.update(0.23);
    expectNoRuntimeWarriorVfx(player.root);

    player.update(0.12);
    expectNoRuntimeWarriorVfx(player.root);

    player.update(0.41);
    expectNoRuntimeWarriorVfx(player.root);
  });

  it('opens damage only during a window and hits a target once per stage', async () => {
    const player = await loadedPlayerWithSword();
    const enemy = new THREE.Object3D();
    enemy.position.set(0, 0, 1);
    const hits: THREE.Object3D[] = [];

    player.attackEnemy(enemy, (target) => hits.push(target));
    player.update(0.01);
    expect(hits).toEqual([]);

    player.update(0.12);
    expect(hits).toEqual([]);
    player.update(0.05);
    expect(hits).toEqual([enemy]);

    // A stage may only damage a target once, even while its damage window remains open.
    player.update(0.1);
    expect(hits).toEqual([enemy]);

    // A marked target alone never requests another stage.
    player.update(0.35);
    player.update(0.2);
    player.update(0.45);
    expect(hits).toEqual([enemy]);
  });

  it('does not repeat a basic attack after one explicit enemy click', async () => {
    const player = await loadedPlayerWithSword();
    const enemy = new THREE.Object3D();
    enemy.position.set(0, 0, 1);
    const hits: THREE.Object3D[] = [];

    player.attackEnemy(enemy, (target) => hits.push(target));
    for (let frame = 0; frame < 30; frame += 1) player.update(0.1);

    expect(hits).toEqual([enemy]);
  });

  it('accepts an ordinary cursor attack as a buffered continuation', async () => {
    const player = await loadedPlayerWithSword();
    const enemy = new THREE.Object3D();
    enemy.position.set(0, 0, 1);
    const hits: THREE.Object3D[] = [];

    player.attackEnemy(enemy, (target) => hits.push(target));
    player.update(0.01);
    player.update(0.24);
    player.attackAtCursor();
    player.update(0.25);
    player.update(0.18);

    // O clique fica enfileirado, mas o segundo golpe respeita o intervalo
    // mínimo de ataque (cooldown da arma) e ainda não saiu.
    expect(hits).toEqual([enemy]);

    player.update(0.5);
    expect(hits).toEqual([enemy, enemy]);
  });

  it('never attacks faster than the weapon cooldown, however fast the mouse is clicked', async () => {
    const player = await loadedPlayerWithSword();
    const enemy = new THREE.Object3D();
    enemy.position.set(0, 0, 1);
    const windows: number[] = [];
    let clock = 0;
    player.onWarriorAttackWindow(() => windows.push(clock));

    const dt = 1 / 60;
    const seconds = 12;
    for (let frame = 0; frame < seconds * 60; frame += 1) {
      // Clique em todo frame: 60 cliques por segundo.
      player.attackEnemy(enemy, () => undefined);
      player.attackAtCursor();
      player.update(dt);
      clock += dt;
    }

    expect(windows.length).toBeGreaterThan(5);
    const cooldown = player.attackCooldownTime;
    for (let index = 1; index < windows.length; index += 1) {
      expect(windows[index] - windows[index - 1]).toBeGreaterThanOrEqual(cooldown - 0.03);
    }
    expect(windows.length).toBeLessThanOrEqual(Math.ceil(seconds / cooldown) + 1);
  });

  it('matches the automatic attack speed when the mouse is spammed on top of it', async () => {
    const run = async (spam: boolean): Promise<number> => {
      const player = await loadedPlayerWithSword();
      const enemy = new THREE.Object3D();
      enemy.position.set(0, 0, 1);
      let count = 0;
      player.onWarriorAttackWindow(() => { count += 1; });
      const dt = 1 / 60;
      for (let frame = 0; frame < 20 * 60; frame += 1) {
        // Ataque automático: só pede golpe quando está livre.
        if (spam || !player.isAttackInSwing()) player.attackEnemy(enemy, () => undefined);
        player.update(dt);
      }
      return count;
    };
    const automatic = await run(false);
    const spammed = await run(true);
    expect(spammed).toBeLessThanOrEqual(automatic + 1);
  });

  it('does not buffer a continuation merely because the target remains marked', async () => {
    const player = await loadedPlayerWithSword();
    const enemy = new THREE.Object3D();
    enemy.position.set(0, 0, 1);
    const hits: THREE.Object3D[] = [];

    player.attackEnemy(enemy, (target) => hits.push(target));
    player.update(0.01);
    player.update(0.24);
    player.update(0.45);

    expect(hits).toEqual([enemy]);
  });

  it('grants no action invulnerability to an accepted basic attack', async () => {
    const player = await loadedPlayerWithSword();

    player.attackAtCursor();
    // Monstro consegue acertar o guerreiro durante o golpe normal.
    player.takeDamage(23);
    expect(player.hp).toBe(77);

    // Passados os 0,4 s anti-stunlock do hit, o monstro acerta de novo.
    player.update(0.1);
    player.update(0.69);
    player.takeBossSkillDamage(19);
    expect(player.hp).toBe(58);
  });

  it('leaves the basic attack with no invulnerability window at all', async () => {
    const player = await loadedPlayerWithSword();

    player.attackAtCursor();
    player.update(0.1);
    expect(player.actionInvulnerabilityRemaining).toBe(0);

    player.update(0.7);
    player.takeBossSkillDamage(19);
    expect(player.hp).toBe(81);
  });

  it('does not renew basic action invulnerability for a manually buffered stage', async () => {
    const player = await loadedPlayerWithSword();
    const enemy = new THREE.Object3D();
    enemy.position.set(0, 0, 1);

    player.attackEnemy(enemy, () => undefined);
    player.update(0.01);
    player.update(0.16);
    player.attackAtCursor();
    player.update(0.69);
    player.update(0.02);

    player.takeBossSkillDamage(10);
    expect(player.hp).toBe(90);
  });

  it('grants 1.5 seconds of action invulnerability to an accepted skill', async () => {
    const player = await loadedPlayerWithSword();

    expect(player.tryStartSkillAttack('triplo_ataque')).toBe(true);
    player.takeDamage(23);
    player.takeBossSkillDamage(19);
    expect(player.hp).toBe(100);

    player.update(0.1);
    player.update(1.49);
    player.takeBossSkillDamage(19);
    expect(player.hp).toBe(100);

    player.update(0.02);
    player.takeBossSkillDamage(19);
    expect(player.hp).toBe(81);
  });

  it('does not spend skill invulnerability on the frame that accepted the input', async () => {
    const player = await loadedPlayerWithSword();

    expect(player.tryStartSkillAttack('triplo_ataque')).toBe(true);
    player.update(0.1);

    expect(player.actionInvulnerabilityRemaining).toBe(1.5);
  });

  it('blocks repeated ordinary damage for 0.4 second after a successful hit', async () => {
    const player = await loadedPlayerWithSword();

    player.takeDamage(10);
    player.takeDamage(10);
    expect(player.hp).toBe(90);

    player.update(0.39);
    player.takeDamage(10);
    expect(player.hp).toBe(90);

    player.update(0.02);
    player.takeDamage(10);
    expect(player.hp).toBe(80);
  });

  it('does not grant action invulnerability when an attack request is rejected', async () => {
    const player = await loadedPlayerWithoutWeapon();

    expect(player.tryStartSkillAttack('triplo_ataque')).toBe(false);
    player.takeBossSkillDamage(19);

    expect(player.hp).toBe(81);
  });

  it('never starts a damaging combo before a weapon is equipped', async () => {
    const player = await loadedPlayerWithoutWeapon();
    const enemy = new THREE.Object3D();
    enemy.position.set(0, 0, 1);
    const hits: THREE.Object3D[] = [];

    player.attackEnemy(enemy, (target) => hits.push(target));
    player.forceAttackIfReady();
    player.update(0.5);

    expect(hits).toEqual([]);
    expect(player.isAttackInSwing()).toBe(false);
  });

  it('clears a dead marked target rather than restarting its auto-combo', async () => {
    const player = await loadedPlayerWithSword();
    const enemy = new THREE.Object3D();
    enemy.position.set(0, 0, 1);
    enemy.userData.isDead = true;

    player.attackEnemy(enemy, () => undefined);
    player.update(0.01);

    expect(player.attackTargetEnemy).toBeNull();
    expect(player.isAttackInSwing()).toBe(false);
  });

  it('keeps the axe to one timed hit instead of advancing sword combo stages', async () => {
    const player = await loadedPlayerWithWeapon('axe');
    const enemy = new THREE.Object3D();
    enemy.position.set(0, 0, 1);
    const hits: THREE.Object3D[] = [];

    player.attackEnemy(enemy, (target) => hits.push(target));
    player.update(0.01);
    player.update(0.18);
    expect(hits).toEqual([enemy]);

    // Ask after the controller's normal sword-buffer window. The axe must
    // ignore this request instead of starting a second combo stage.
    player.update(0.10);
    player.attackAtCursor();

    // A long update crosses the stage boundary. An axe must end rather than
    // buffer stages 1/2/3 like the sword controller does.
    player.update(0.6);
    expect(hits).toEqual([enemy]);
    expect(player.isAttackInSwing()).toBe(false);
  });

  it('keeps locomotion free while swinging at a marked target', async () => {
    const player = await loadedPlayerWithSword();
    const enemy = new THREE.Object3D();
    enemy.position.set(0, 0, 2);
    player.attackEnemy(enemy, () => {});
    expect(player.isAttackInSwing()).toBe(true);

    const start = player.root.position.clone();
    player.setKeyboardMoving(true);
    const step = new THREE.Vector3(1, 0, 0);
    for (let i = 0; i < 6; i += 1) {
      player.moveByDirection(step, 0.05, true);
      player.update(0.05);
    }

    // Anda de verdade para o lado mesmo com combo ativo no target...
    const midDistance = player.root.position.distanceTo(start);
    expect(midDistance).toBeGreaterThan(0.1);
    // ...o corpo permanece virado para o monstro marcado (strafe / target lock)...
    const targetAngle = Math.atan2(enemy.position.x - player.root.position.x, enemy.position.z - player.root.position.z);
    expect(player.root.rotation.y).toBeLessThan(0);
    expect(Math.abs(player.root.rotation.y - targetAngle)).toBeLessThan(0.1);
    // ...e a corrida continua blendada sob o clip de ataque (sem travar pose).
    expect(player.isLocomotionBlendActive).toBe(true);

    // Mesmo depois do combo acabar, seguir segurando a tecla continua
    // deslocando o guerreiro (nunca volta a travar em pose parada).
    for (let i = 0; i < 10; i += 1) {
      player.moveByDirection(step, 0.05, true);
      player.update(0.05);
    }
    expect(player.root.position.distanceTo(start)).toBeGreaterThan(midDistance);
  });

  it('releases the locomotion blend when the player stops moving', async () => {
    const player = await loadedPlayerWithSword();
    const enemy = new THREE.Object3D();
    enemy.position.set(0, 0, 2);
    player.attackEnemy(enemy, () => {});
    player.setKeyboardMoving(true);
    player.moveByDirection(new THREE.Vector3(1, 0, 0), 0.05, true);
    player.update(0.05);
    expect(player.isLocomotionBlendActive).toBe(true);

    player.setKeyboardMoving(false);
    player.update(0.05);
    expect(player.isLocomotionBlendActive).toBe(false);
  });
});
