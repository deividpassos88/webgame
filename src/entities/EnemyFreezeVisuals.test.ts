import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { Enemy } from './Enemy';

const noop = () => undefined;
const far = new THREE.Vector3(100, 0, 0);
const FREEZE_EMISSIVE = 0x2a7fff;

/**
 * Materiais do corpo: os que já existem na criação do inimigo. Os cristais de
 * gelo, a aura de choque e as chamas nascem junto com a skill, então nunca
 * fazem parte do corpo tingido pelo congelamento.
 */
function collectBodyMaterials(enemy: Enemy): THREE.MeshStandardMaterial[] {
  const found: THREE.MeshStandardMaterial[] = [];
  enemy.root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh) return;
    const list = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const material of list) {
      if (material instanceof THREE.MeshStandardMaterial) found.push(material);
    }
  });
  return found;
}

function bodyState(materials: readonly THREE.MeshStandardMaterial[]) {
  return materials.map((material) => ({
    color: material.color.getHex(),
    emissive: material.emissive.getHex(),
    emissiveIntensity: Number(material.emissiveIntensity.toFixed(5)),
  }));
}

function spawnBossLike(): Enemy {
  return new Enemy({
    position: new THREE.Vector3(),
    hp: 5600,
    speed: 4,
    isBoss: true,
  });
}

describe('Enemy freeze visuals', () => {
  it('devolve a aparência original quando o gelo acaba', () => {
    const enemy = spawnBossLike();
    // Somente o corpo, congelado antes de a skill criar qualquer cristal.
    const materials = collectBodyMaterials(enemy);
    const original = bodyState(materials);

    enemy.applyMageFreeze(2);
    enemy.update(0.5, far, noop);
    expect(bodyState(materials)).not.toEqual(original);

    enemy.update(3, far, noop);
    expect(bodyState(materials)).toEqual(original);
  });

  it('não deixa o boss azul quando o flash de dano termina depois do gelo', () => {
    // A regressão relatada: usar a skill de gelo no boss, acertá-lo durante o
    // congelamento, e o azul nunca mais sair. O flash de dano capturava o
    // "emissivo atual" (o azul do gelo) e o devolvia ao terminar, muito depois
    // de o congelamento ter acabado.
    const enemy = spawnBossLike();
    const materials = collectBodyMaterials(enemy);
    const original = bodyState(materials);

    enemy.applyMageFreeze(1);
    enemy.update(0.95, far, noop);
    expect(bodyState(materials)).not.toEqual(original);

    // Dano durante o congelamento: o flash começa e sobrevive ao fim do gelo.
    enemy.takeDamage(1);
    enemy.update(0.06, far, noop);
    enemy.update(0.2, far, noop);

    expect(bodyState(materials)).toEqual(original);
  });

  it('não acumula tinta em vários ciclos de gelo com dano por cima', () => {
    const enemy = spawnBossLike();
    const materials = collectBodyMaterials(enemy);
    const original = bodyState(materials);

    // Sempre com o flash de dano sobrevivendo ao fim do congelamento.
    for (let cycle = 0; cycle < 3; cycle += 1) {
      enemy.applyMageFreeze(0.5);
      enemy.update(0.45, far, noop);
      enemy.takeDamage(1);
      enemy.update(0.06, far, noop);
      enemy.update(0.3, far, noop);
      expect(bodyState(materials), `ciclo ${cycle}`).toEqual(original);
    }
  });

  it('tira o azul do gelo quando o inimigo congelado morre', () => {
    const enemy = spawnBossLike();
    const materials = collectBodyMaterials(enemy);

    enemy.applyMageFreeze(3);
    enemy.update(0.2, far, noop);
    expect(materials.some((material) => material.emissive.getHex() === FREEZE_EMISSIVE)).toBe(true);

    enemy.takeDamage(enemy.hp);
    // A morte tem brilho próprio (laranja da queima), então o que importa aqui
    // é que o azul do congelamento não sobreviva à morte.
    enemy.update(0.5, far, noop);
    enemy.update(2, far, noop);

    expect(materials.some((material) => material.emissive.getHex() === FREEZE_EMISSIVE)).toBe(false);
  });
});
