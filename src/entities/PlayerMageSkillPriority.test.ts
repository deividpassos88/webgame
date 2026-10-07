import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import type { CharacterAssetStore } from '../characters/CharacterAssetStore';
import { createRuntimeWarriorSword } from '../characters/RuntimeWarriorWeapon';
import { getWeaponDefinition } from '../equipment/EquipmentCatalog';
import { Player, type MageSpellCastEvent } from './Player';

/**
 * Item 3: na Maga, o comando de skill tem PRIORIDADE sobre o ataque básico —
 * inclusive no ataque automático. O básico é cortado, a skill entra se cumprir
 * as condições dela (recarga, MP, fadiga, parada) e o automático volta ao
 * normal depois. O Guerreiro mantém a regra histórica de "ocupado".
 */
function clip(name: string, duration = 1): THREE.AnimationClip {
  return new THREE.AnimationClip(name, duration, []);
}

function mageModel(): THREE.Group {
  const model = new THREE.Group();
  const hips = new THREE.Bone();
  hips.name = 'mixamorig:Hips';
  const rightHand = new THREE.Bone();
  rightHand.name = 'mixamorig:RightHand';
  const leftHand = new THREE.Bone();
  leftHand.name = 'mixamorig:LeftHand';
  hips.add(rightHand, leftHand);
  model.add(hips);
  return model;
}

function mageAssets(): CharacterAssetStore {
  const animations = [
    clip('idle'),
    clip('correr rapido2', 0.62),
    clip('ataque basico', 1.8),
    clip('ataque agua'),
    clip('ataque gelo'),
    clip('ataque choque'),
    clip('ataque laser'),
    clip('ataque de larva'),
    clip('hit'),
    clip('morrendo'),
  ];
  return {
    createModel: mageModel,
    getAnimations: () => animations,
    getBoneNames: () => new Set<string>(['mixamorig:Hips']),
    getBoneRestRotations: () => new Map<string, THREE.Quaternion>(),
    getBoneRestTranslations: () => new Map<string, THREE.Vector3>(),
  } as unknown as CharacterAssetStore;
}

function paladinModel(): THREE.Group {
  const model = new THREE.Group();
  const hand = new THREE.Bone();
  hand.name = 'mixamorigRightHand';
  model.add(hand);
  return model;
}

function paladinAssets(): CharacterAssetStore {
  const animations = [
    clip('idle_sword'),
    clip('correndo'),
    clip('ataque_basico'),
    clip('ataque_giratorio'),
    clip('ataque_giratorio_2'),
    clip('pulo_atacando'),
    clip('triplo_ataque'),
    clip('corte_duplo'),
    clip('recebe_dano'),
    clip('morte'),
  ];
  return {
    createModel: paladinModel,
    getAnimations: () => animations,
    getBoneNames: () => new Set<string>(),
    getBoneRestRotations: () => new Map<string, THREE.Quaternion>(),
    getBoneRestTranslations: () => new Map<string, THREE.Vector3>(),
  } as unknown as CharacterAssetStore;
}

function targetInRange(distance = 1.5): THREE.Group {
  const enemy = new THREE.Group();
  enemy.position.set(0, 0, distance);
  return enemy;
}

describe('Maga: prioridade da skill sobre o ataque básico', () => {
  it('corta o ataque básico automático e lança a skill na hora', async () => {
    const player = new Player('mage', mageAssets());
    await player.load();
    const casts: MageSpellCastEvent[] = [];
    player.onMageSpellCast((event) => { casts.push(event); });

    // Ataque básico em andamento (o fluxo do modo automático).
    player.attackEnemy(targetInRange(), () => undefined);
    player.update(0.05);
    expect(player.isAttackInSwing()).toBe(true);
    expect(player.canInterruptBasicWithSkill).toBe(true);
    expect(player.isCastingSkill).toBe(false);

    // Skill 1 da Maga (feitiço de água) durante o básico: entra.
    expect(player.tryStartSkillAttack('ataque_giratorio')).toBe(true);
    expect(player.isCastingSkill).toBe(true);
    expect(player.canInterruptBasicWithSkill).toBe(false);
    // O básico foi cortado: o único feitiço novo é o da skill.
    expect(casts.map((event) => event.spellId)).toEqual(['basic', 'water']);
  });

  it('depois da skill o automático volta a poder atacar', async () => {
    const player = new Player('mage', mageAssets());
    await player.load();
    player.attackEnemy(targetInRange(), () => undefined);
    player.update(0.05);
    expect(player.tryStartSkillAttack('ataque_giratorio')).toBe(true);

    // Roda a skill inteira (1 s de clipe no modelo de teste).
    for (let frame = 0; frame < 80; frame += 1) player.update(1 / 60);
    expect(player.isCastingSkill).toBe(false);
    expect(player.isAttackInSwing()).toBe(false);

    // O ataque básico pode voltar (é o que o Game faz a cada quadro).
    player.update(0.6);
    player.attackEnemy(targetInRange(), () => undefined);
    expect(player.isAttackInSwing()).toBe(true);
  });

  it('não deixa a skill interromper outra skill (só o combo link encadeia)', async () => {
    const player = new Player('mage', mageAssets());
    await player.load();
    player.attackEnemy(targetInRange(), () => undefined);
    player.update(0.05);
    expect(player.tryStartSkillAttack('ataque_giratorio')).toBe(true);

    // Sem combo link, uma segunda skill durante a primeira continua recusada.
    expect(player.tryStartSkillAttack('ataque_giratorio_2')).toBe(false);
    expect(player.canInterruptBasicWithSkill).toBe(false);
  });

  it('mantém o Guerreiro sem interromper o golpe (diferença de classe)', async () => {
    const player = new Player('paladin', paladinAssets());
    await player.load();
    const weapon = getWeaponDefinition('sword');
    expect(weapon).toBeTruthy();
    player.equipWeapon(weapon!, createRuntimeWarriorSword());

    player.attackEnemy(targetInRange(), () => undefined);
    player.update(0.05);
    expect(player.isAttackInSwing()).toBe(true);
    expect(player.canInterruptBasicWithSkill).toBe(false);
    expect(player.tryStartSkillAttack('ataque_giratorio')).toBe(false);
    expect(player.isCastingSkill).toBe(false);
  });
});
