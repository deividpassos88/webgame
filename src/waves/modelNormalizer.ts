import * as THREE from 'three';

/**
 * Alguns exports do gerador Tripo deixam uma rotação residual de 90° no eixo X
 * nos nodes raiz (Armature / tripo_node_* desses assets, ex.: monster_arch.glb e
 * monstro_guardiao.glb). A bind pose desses modelos fica "deitada", MAS as
 * animações mixamo embutidas foram exportadas no MESMO espaço rotacionado e
 * colocam o personagem em pé ao rodar (verificado matematicamente nos GLBs:
 * com a rotação mantida, footY≈0 em todas as animações).
 *
 * O problema prático dessa bind pose deitada é a medição de altura/box: em
 * three r161, `Box3.expandByObject` usa `object.boundingBox` em cache de
 * SkinnedMesh (calculado na primeira chamada, bind pose) e nunca reflete a
 * pose animada. Para um modelo deitado, a altura da bind pose é muito menor
 * que a altura real do personagem em pé, e qualquer normalização de escala
 * ancorada nessa box fica errada (modelo gigante/flutuando quando anima).
 *
 * Este módulo deriva a "silhueta real" do personagem a partir da posição
 * mundial dos bones do skeleton — que SEMPRE acompanha a pose animada — para
 * usar como referência de altura e contato com o chão.
 */

export interface AnimatedModelProfile {
  /** Altura visual do personagem na pose atual (em unidades do modelo). */
  height: number;
  /** Menor Y mundial dos bones na pose atual (~contato com o chão). */
  minY: number;
  /** Maior Y mundial dos bones na pose atual. */
  maxY: number;
}

const UP = new THREE.Vector3(0, 1, 0);

function collectSkeletons(model: THREE.Object3D): THREE.Skeleton[] {
  const skeletons: THREE.Skeleton[] = [];
  model.traverse((object) => {
    const skinnedMesh = object as THREE.SkinnedMesh;
    if (skinnedMesh.isSkinnedMesh && skinnedMesh.skeleton) {
      if (!skeletons.includes(skinnedMesh.skeleton)) {
        skeletons.push(skinnedMesh.skeleton);
      }
    }
  });
  return skeletons;
}

/**
 * Mede a silhueta do modelo pela posição mundial dos bones do skeleton.
 * Precisa ser chamada depois de `updateMatrixWorld(true)` e do mixer ter
 * aplicado a pose desejada (`mixer.update(0)` no mínimo).
 */
export function measureAnimatedModelProfile(
  model: THREE.Object3D
): AnimatedModelProfile | null {
  const skeletons = collectSkeletons(model);
  if (skeletons.length === 0) return null;

  let minY = Infinity;
  let maxY = -Infinity;
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  const worldPosition = new THREE.Vector3();
  for (const skeleton of skeletons) {
    for (const bone of skeleton.bones) {
      if (!bone.parent) continue; // bone órfão (não faz parte da hierarquia ativa)
      bone.getWorldPosition(worldPosition);
      minY = Math.min(minY, worldPosition.y);
      maxY = Math.max(maxY, worldPosition.y);
      minX = Math.min(minX, worldPosition.x);
      maxX = Math.max(maxX, worldPosition.x);
      minZ = Math.min(minZ, worldPosition.z);
      maxZ = Math.max(maxZ, worldPosition.z);
    }
  }
  if (!Number.isFinite(minY)) return null;
  const xExtent = maxX - minX;
  const yExtent = maxY - minY;
  const zExtent = maxZ - minZ;
  // Rig em pé: a altura é a extensão vertical. Rig deitado (bind pose X90):
  // a altura real do personagem aparece na extensão horizontal dominante.
  const height = yExtent >= zExtent ? yExtent : Math.max(xExtent, zExtent);
  return { height, minY, maxY };
}

/**
 * Encontra o skeleton do modelo (primeiro SkinnedMesh encontrado).
 */
export function findModelSkeleton(model: THREE.Object3D): THREE.Skeleton | null {
  const skeletons = collectSkeletons(model);
  return skeletons[0] ?? null;
}

/**
 * Menor Y mundial entre os bones do skeleton na pose ATUAL.
 * Retorna null se não houver skeleton. Requer updateMatrixWorld antes.
 */
export function animatedModelGroundY(model: THREE.Object3D): number | null {
  const skeletons = collectSkeletons(model);
  if (skeletons.length === 0) return null;
  let minY = Infinity;
  const worldPosition = new THREE.Vector3();
  for (const skeleton of skeletons) {
    for (const bone of skeleton.bones) {
      if (!bone.parent) continue;
      bone.getWorldPosition(worldPosition);
      minY = Math.min(minY, worldPosition.y);
    }
  }
  return Number.isFinite(minY) ? minY : null;
}

/**
 * Verifica se o modelo é rotacionado residualmente no eixo X (bind pose
 * "deitada") — usado para decidir entre medir por Box3 (bind em pé, ex.:
 * monstro_normal) ou por bones (bind deitada, ex.: archer/guardião).
 */
export function hasLyingBindPose(model: THREE.Object3D): boolean {
  const skeletons = collectSkeletons(model);
  if (skeletons.length === 0) return false;
  // Na bind pose deitada (rot X90 no rig), a extensão dos bones no eixo Z é
  // maior que no eixo Y (personagem de "costas"/"frente" no plano XZ).
  let minY = Infinity;
  let maxY = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  const worldPosition = new THREE.Vector3();
  for (const skeleton of skeletons) {
    for (const bone of skeleton.bones) {
      if (!bone.parent) continue;
      bone.getWorldPosition(worldPosition);
      minY = Math.min(minY, worldPosition.y);
      maxY = Math.max(maxY, worldPosition.y);
      minZ = Math.min(minZ, worldPosition.z);
      maxZ = Math.max(maxZ, worldPosition.z);
    }
  }
  if (!Number.isFinite(minY)) return false;
  const zExtent = maxZ - minZ;
  const yExtent = maxY - minY;
  // monstro_normal em pé: y≈1.4, z≈0.2 → y > z. Deitado: z ≫ y.
  return zExtent > yExtent * 1.35;
}

export const MODEL_UP_AXIS = UP;
