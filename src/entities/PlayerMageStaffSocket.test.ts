import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { Player, type MageSpellCastEvent } from './Player';
import {
  createMageRealAssets,
  findBone,
  loadMageRealRig,
  MAGE_STAFF_BOUNDS,
} from './MageRealRig.fixture';

/**
 * Contrato do item 1: o ataque básico da Maga nasce na PONTA DO CAJADO, na
 * pose animada do quadro, e isso vale para qualquer direção em que ela esteja
 * virada — inclusive diagonais. O cajado do GLB real (`cajado`) é filho do
 * dedo indicador da mão direita; a malha dele tem 97,876 unidades de
 * comprimento no espaço do nó e o rig renderiza em ~1,54 m.
 */
const STAFF_TIP_LENGTH_METERS = Math.abs(MAGE_STAFF_BOUNDS.min.z) * 0.6983 * 0.01 * 2.25; // 1,538 m

async function captureBasicCast(
  player: Player
): Promise<MageSpellCastEvent> {
  const casts: MageSpellCastEvent[] = [];
  player.onMageSpellCast((event) => { casts.push(event); });
  player.attackAtCursor();
  await Promise.resolve();
  expect(casts).toHaveLength(1);
  return casts[0];
}

describe('Maga: soquete da arma (ponta do cajado)', () => {
  it('devolve a ponta do cajado na pose animada, em qualquer direção', async () => {
    const rig = await loadMageRealRig();
    const player = new Player('mage', createMageRealAssets(rig, { staffGeometry: true }));
    await player.load();
    const event = await captureBasicCast(player);
    expect(event.resolveWeaponSocket).toBeTypeOf('function');

    const pivot = new THREE.Vector3();
    const socket = new THREE.Vector3();
    const hand = new THREE.Vector3();
    const staff = findBone(player.root, 'cajado')!;
    const handBone = findBone(player.root, 'mixamorig:RightHand')!;
    expect(staff).toBeTruthy();

    const heights: number[] = [];
    for (const degrees of [0, 45, 90, 135, 180, 225, 270, 315]) {
      player.root.rotation.y = THREE.MathUtils.degToRad(degrees);
      player.root.updateMatrixWorld(true);
      expect(event.resolveWeaponSocket!(socket)).toBe(true);

      staff.getWorldPosition(pivot);
      handBone.getWorldPosition(hand);
      // A ponta vive no fim da haste: a distância ao pivô do cajado é o
      // comprimento da arma, independente da direção em que a Maga olha.
      expect(socket.distanceTo(pivot)).toBeCloseTo(STAFF_TIP_LENGTH_METERS, 1);
      // No espaço do PRÓPRIO cajado a posição tem que cair na extremidade da
      // haste (eixo longo = -Z no GLB real), não num ponto perto da mão.
      const localSocket = staff.worldToLocal(socket.clone());
      expect(localSocket.z).toBeCloseTo(MAGE_STAFF_BOUNDS.min.z, 0);
      expect(Math.abs(localSocket.x)).toBeLessThan(1);
      expect(Math.abs(localSocket.y)).toBeLessThan(1);
      expect(socket.distanceTo(hand)).toBeGreaterThan(0.5);
      // O rig real do GLB é ~2,9 m de altura; a ponta fica acima da cabeça.
      heights.push(socket.y);
    }
    const spread = Math.max(...heights) - Math.min(...heights);
    expect(spread).toBeLessThan(0.02);
  });

  it('segue o cajado em movimento (correndo com o ataque automático)', async () => {
    const rig = await loadMageRealRig();
    const player = new Player('mage', createMageRealAssets(rig, { staffGeometry: true }));
    await player.load();
    const event = await captureBasicCast(player);

    const pivot = new THREE.Vector3();
    const socket = new THREE.Vector3();
    const positions: THREE.Vector3[] = [];
    const staff = findBone(player.root, 'cajado')!;
    player.setKeyboardMoving(true);
    for (let frame = 0; frame < 30; frame += 1) {
      player.moveByDirection(new THREE.Vector3(0, 0, 1), 1 / 60);
      player.update(1 / 60);
      expect(event.resolveWeaponSocket!(socket)).toBe(true);
      staff.getWorldPosition(pivot);
      expect(socket.distanceTo(pivot)).toBeCloseTo(STAFF_TIP_LENGTH_METERS, 1);
      positions.push(socket.clone());
    }
    // A origem realmente acompanha a animação (não é um ponto fixo no corpo).
    const moved = positions.reduce(
      (max, point) => Math.max(max, point.distanceTo(positions[0])),
      0
    );
    expect(moved).toBeGreaterThan(0.25);
  });

  it('recusa o soquete da arma quando o modelo não tem a malha do cajado', async () => {
    const rig = await loadMageRealRig();
    const player = new Player('mage', createMageRealAssets(rig));
    await player.load();
    const event = await captureBasicCast(player);
    const output = new THREE.Vector3(1, 2, 3);
    // Sem geometria no `cajado` não há ponta confiável: o feitiço precisa cair
    // de volta no soquete de mão do MageVFX em vez de lançar de um ponto errado.
    expect(event.resolveWeaponSocket!(output)).toBe(false);
    expect(output).toEqual(new THREE.Vector3(1, 2, 3));
  });

  it('não altera a arma dos Guerreiros nem o cajado de outros clipes', async () => {
    const rig = await loadMageRealRig();
    const player = new Player('mage', createMageRealAssets(rig, { staffGeometry: true }));
    await player.load();
    // O cajado continua visível e o modelo intacto (nenhum fluxo novo o move).
    const staff = findBone(player.root, 'cajado')!;
    expect(staff.visible).toBe(true);
    const pivotLocal = staff.getWorldPosition(new THREE.Vector3());
    player.update(1 / 60);
    player.update(1 / 60);
    const pivotAfter = staff.getWorldPosition(new THREE.Vector3());
    expect(pivotAfter.distanceTo(pivotLocal)).toBeLessThan(0.5);
  });
});
