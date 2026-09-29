import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import type { CharacterAssetStore } from '../characters/CharacterAssetStore';
import { createRuntimeWarriorSword } from '../characters/RuntimeWarriorWeapon';
import { getWeaponDefinition } from '../equipment/EquipmentCatalog';
import { WARRIOR_SKILLS } from '../combat/WarriorSkillCatalog';
import { Player } from './Player';

// Durations copied from the authored guerreiro_animado.glb.
const CLIP_DURATIONS: Record<string, number> = {
  idle_sword: 2.333, caminhando: 1.333, correndo: 0.833, ataque_basico: 1.167,
  ataque_giratorio: 1.375, ataque_giratorio_2: 1.25, pulo_atacando: 1.917,
  triplo_ataque: 2.542, corte_duplo: 2.375, recebe_dano: 1.292, morte: 5.542, caiu: 1.542,
};

function createModel(): THREE.Group {
  const model = new THREE.Group();
  const hand = new THREE.Bone();
  hand.name = 'mixamorigRightHand';
  model.add(hand);
  return model;
}

async function createPlayer(): Promise<Player> {
  const clips = Object.entries(CLIP_DURATIONS).map(
    ([name, duration]) => new THREE.AnimationClip(name, duration, [])
  );
  const assets = {
    createModel: createModel,
    getAnimations: () => clips,
    getBoneNames: () => new Set<string>(),
  } as unknown as CharacterAssetStore;
  const player = new Player('paladin', assets);
  await player.load();
  const definition = getWeaponDefinition('sword');
  if (!definition) throw new Error('sword definition missing');
  player.equipWeapon(definition, createRuntimeWarriorSword());
  return player;
}

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Internals {
  actions: Record<string, THREE.AnimationAction | undefined>;
  currentAction: THREE.AnimationAction | null;
  isSwinging: boolean;
  isHitReacting: boolean;
  state: string;
}

/** What the mixer is really blending right now, weight-wise. */
function visibleWeights(player: Player): Map<THREE.AnimationAction, number> {
  const internals = player as unknown as Internals & { warriorAttackActions: Record<string, THREE.AnimationAction>; comboActions: THREE.AnimationAction[] };
  const all = new Set<THREE.AnimationAction>();
  for (const a of Object.values(internals.actions)) if (a) all.add(a);
  for (const a of Object.values(internals.warriorAttackActions)) all.add(a);
  for (const a of internals.comboActions) all.add(a);
  const result = new Map<THREE.AnimationAction, number>();
  for (const action of all) {
    const w = action.isRunning() ? action.getEffectiveWeight() : 0;
    if (w > 0.001) result.set(action, w);
  }
  return result;
}


/** Simulates the leaks that leave the body in a blended, wrong pose. */
function corruptMixer(player: Player, random: () => number): void {
  const internals = player as unknown as Internals & { warriorAttackActions: Record<string, THREE.AnimationAction> };
  const kind = Math.floor(random() * 4);
  if (kind === 0) {
    // running keeps full weight underneath idle
    const run = internals.actions.running!;
    run.reset(); run.setEffectiveWeight(1); run.play();
  } else if (kind === 1) {
    // a clamped attack clip keeps full weight
    const attack = internals.warriorAttackActions.ataque_basico;
    attack.reset(); attack.setEffectiveWeight(1); attack.play();
  } else if (kind === 2) {
    // idle is stopped while still the "current" action
    internals.actions.idle!.stop();
  } else {
    // idle is faded out to zero but still the "current" action
    const idle = internals.actions.idle!;
    idle.setEffectiveWeight(0.2);
  }
}

describe('Player pose consistency under long random play', () => {
  it.each([1, 2, 3, 4, 5, 6])('always returns to the idle pose after inputs stop (seed %i)', async (seed) => {
    await runFuzz(seed, false);
  });

  it.each([11, 12, 13, 14, 15, 16])('self-heals leaked animation weights (seed %i)', async (seed) => {
    await runFuzz(seed, true);
  });

  async function runFuzz(seed: number, corrupt: boolean): Promise<void> {
    const random = mulberry32(seed);
    const player = await createPlayer();
    const enemy = new THREE.Object3D();
    enemy.userData.isEnemyRoot = true;
    enemy.position.set(0, 0, 1.5);
    const skills = WARRIOR_SKILLS.map((s) => s.id);
    const internals = player as unknown as Internals;
    const dt = 1 / 60;
    const failures: string[] = [];

    for (let round = 0; round < 260; round += 1) {
      // A burst of chaotic input (~ 2.3 simulated seconds), then a quiet period.
      const burstFrames = 140;
      for (let frame = 0; frame < burstFrames; frame += 1) {
        const roll = random();
        if (roll < 0.05) player.attackEnemy(enemy, () => undefined);
        else if (roll < 0.07) player.attackAtCursor();
        else if (roll < 0.085) player.tryStartSkillAttack(skills[Math.floor(random() * skills.length)]);
        else if (roll < 0.093) player.takeDamage(3);
        else if (roll < 0.098) player.takeBossSkillDamage(3);
        else if (roll < 0.105) player.moveTo(new THREE.Vector3(random() * 6 - 3, 0, random() * 6 - 3));
        else if (roll < 0.112) { player.setKeyboardMoving(true); player.moveByDirection(new THREE.Vector3(random() - 0.5, 0, random() - 0.5), dt, random() < 0.5); }
        else if (roll < 0.118) player.setKeyboardMoving(false);
        else if (roll < 0.122) player.tryDash(new THREE.Vector3(random() - 0.5, 0, random() - 0.5));
        else if (roll < 0.125) player.clearAttackTarget();
        else if (roll < 0.127) player.cancelMovement();
        enemy.position.set(random() * 2 - 1, 0, 1 + random() * 2);
        player.update(dt);
      }
      // Quiet period: no input at all.
      player.setKeyboardMoving(false);
      player.cancelMovement();
      player.clearAttackTarget();
      if (corrupt) corruptMixer(player, random);
      for (let frame = 0; frame < 60 * 4; frame += 1) player.update(dt);

      if (player.isDead) { player.respawn(new THREE.Vector3()); for (let f = 0; f < 60; f += 1) player.update(dt); }
      const weights = visibleWeights(player);
      const idle = internals.actions.idle!;
      const only = weights.size === 1 && weights.has(idle) && (weights.get(idle) ?? 0) > 0.95;
      if (!only || internals.currentAction !== idle || internals.state !== 'idle') {
        failures.push(
          `round ${round}: state=${internals.state} swinging=${internals.isSwinging} hit=${internals.isHitReacting} ` +
          `current=${internals.currentAction?.getClip().name} weights=` +
          [...weights].map(([a, w]) => `${a.getClip().name}:${w.toFixed(2)}`).join(',')
        );
        break;
      }
    }
    expect(failures).toEqual([]);
  }
});

describe('Player stuck-state recovery', () => {
  it('recovers from an orphan "swinging" flag that no attack owns', async () => {
    const player = await createPlayer();
    const internals = player as unknown as Internals;
    internals.isSwinging = true; // e.g. lost combo-ended event
    for (let frame = 0; frame < 60; frame += 1) player.update(1 / 60);
    expect(internals.isSwinging).toBe(false);
    expect(internals.state).toBe('idle');
  });

  it('recovers from a hit reaction whose end event never arrives', async () => {
    const player = await createPlayer();
    const internals = player as unknown as Internals;
    player.takeBossSkillDamage(1);
    expect(internals.isHitReacting).toBe(true);
    internals.actions.hit!.stop(); // no "finished" event will ever be dispatched
    for (let frame = 0; frame < 60 * 3; frame += 1) player.update(1 / 60);
    expect(internals.isHitReacting).toBe(false);
    expect(internals.state).toBe('idle');
    const weights = visibleWeights(player);
    expect(weights.size).toBe(1);
    expect(weights.has(internals.actions.idle!)).toBe(true);
  });

  it('shows only the idle pose after a leaked running weight', async () => {
    const player = await createPlayer();
    const internals = player as unknown as Internals;
    const run = internals.actions.running!;
    run.reset(); run.setEffectiveWeight(1); run.play();
    for (let frame = 0; frame < 60; frame += 1) player.update(1 / 60);
    const weights = visibleWeights(player);
    expect([...weights.keys()]).toEqual([internals.actions.idle]);
    expect(weights.get(internals.actions.idle!)).toBeGreaterThan(0.95);
  });

  it('does not touch the pose during a normal idle/run fade', async () => {
    const player = await createPlayer();
    const internals = player as unknown as Internals;
    player.setKeyboardMoving(true);
    player.moveByDirection(new THREE.Vector3(1, 0, 0), 1 / 60);
    // 0.15s fade only: idle is still legitimately visible underneath
    for (let frame = 0; frame < 6; frame += 1) {
      player.moveByDirection(new THREE.Vector3(1, 0, 0), 1 / 60);
      player.update(1 / 60);
    }
    expect(internals.state).toBe('running');
    expect(internals.currentAction).toBe(internals.actions.running);
  });
});
