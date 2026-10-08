import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { Player } from './Player';
import {
  createMageRealAssets,
  hipTiltDegrees,
  loadMageRealRig,
} from './MageRealRig.fixture';

/**
 * O que estes testes protegem: a pose de BIND do GLB da Maga é um corpo
 * DEITADO flutuando a ~1 m (tilt de 90° no quadril). Sempre que o mixer fica
 * sem peso de animação — um fade-in a partir de zero depois de uma action
 * cancelada — o three completa o blend com essa pose, e o resultado é o corpo
 * "deitado e flutuando" relatado na saída/chegada do teletransporte e ao levar
 * dano atacando.
 */
describe('Maga: pose do corpo nas transições', () => {
  it('não mistura a pose de bind (deitada e flutuando) ao ser atingida atacando', async () => {
    // A pose de bind do modelo real é um corpo deitado (90°): ela é o
    // artefato que aparecia "deitado e flutuando" durante as transições.
    const rig = await loadMageRealRig();
    const raw = createMageRealAssets(rig).createModel('mage');
    expect(hipTiltDegrees(raw)).toBeGreaterThan(80);

    const player = new Player('mage', createMageRealAssets(rig));
    await player.load();
    // Já no primeiro quadro depois do load o corpo tem que estar de pé: antes o
    // idle entrava com fade a partir de peso 0 e o corpo nascia deitado.
    expect(hipTiltDegrees(player.root)).toBeLessThan(45);

    const enemy = new THREE.Group();
    enemy.position.set(0, 0, 1.2);
    player.attackEnemy(enemy, () => undefined);
    for (let frame = 0; frame < 10; frame += 1) player.update(1 / 60);
    expect(player.isAttackInSwing()).toBe(true);

    // O dano cancela o combo (cancelCombo para a action) e o estado "hit"
    // entrava com fade a partir de peso 0 — sem contrapeso, o three misturava
    // a pose de bind no meio.
    player.takeDamage(10);
    const samples: number[] = [];
    for (let frame = 0; frame < 24; frame += 1) {
      player.update(1 / 60);
      samples.push(Number(hipTiltDegrees(player.root).toFixed(1)));
    }
    expect(Math.max(...samples)).toBeLessThan(45);
    void samples;
  });

  it('não mistura a pose de bind ao morrer durante o ataque', async () => {
    const rig = await loadMageRealRig();
    const player = new Player('mage', createMageRealAssets(rig));
    await player.load();

    const enemy = new THREE.Group();
    enemy.position.set(0, 0, 1.2);
    player.attackEnemy(enemy, () => undefined);
    for (let frame = 0; frame < 10; frame += 1) player.update(1 / 60);
    expect(player.isAttackInSwing()).toBe(true);

    player.takeDamage(9999);
    const samples: number[] = [];
    for (let frame = 0; frame < 30; frame += 1) {
      player.update(1 / 60);
      samples.push(Number(hipTiltDegrees(player.root).toFixed(1)));
    }
    expect(Math.max(...samples)).toBeLessThan(45);
  });

  it('não mistura a pose de bind ao correr atrás de um alvo que saiu de alcance', async () => {
    const rig = await loadMageRealRig();
    const player = new Player('mage', createMageRealAssets(rig));
    await player.load();
    const enemy = new THREE.Group();
    enemy.position.set(0, 0, 1.2);
    player.attackEnemy(enemy, () => undefined);
    player.setKeyboardMoving(true);
    for (let frame = 0; frame < 10; frame += 1) player.update(1 / 60);
    expect(player.isAttackInSwing()).toBe(true);

    // O alvo sai de alcance: o combo é cancelado e a corrida entra com fade.
    enemy.position.set(0, 0, 40);
    const samples: number[] = [];
    for (let frame = 0; frame < 30; frame += 1) {
      player.moveByDirection(new THREE.Vector3(0, 0, 1), 1 / 60);
      player.update(1 / 60);
      samples.push(Number(hipTiltDegrees(player.root).toFixed(1)));
    }
    expect(Math.max(...samples)).toBeLessThan(45);
  });

  it('mantém o fade quando existe contrapeso (pose nunca salta a zero)', async () => {
    const rig = await loadMageRealRig();
    const player = new Player('mage', createMageRealAssets(rig));
    await player.load();
    player.setKeyboardMoving(true);
    player.moveByDirection(new THREE.Vector3(0, 0, 1), 1 / 60);
    player.update(1 / 60);
    const controls = player as unknown as {
      actions: Partial<Record<string, THREE.AnimationAction>>;
      currentAction: THREE.AnimationAction | null;
    };
    const running = controls.actions.running!;
    expect(controls.currentAction).toBe(running);

    // idle entra com fade porque a corrida continua carregando a pose.
    player.previewAnimation('idle');
    expect(running.getEffectiveWeight()).toBeGreaterThan(0);
  });
});
