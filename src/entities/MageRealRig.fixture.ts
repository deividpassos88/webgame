import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { CharacterAssetStore } from '../characters/CharacterAssetStore';

/**
 * Rig real da Maga para testes: o GLB é comprimido com Draco e não tem decoder
 * no Node, mas a pose vive no esqueleto + clipes. Este módulo monta um GLB
 * equivalente sem malhas/skins/imagens (hierarquia e animações idênticas) e
 * devolve um adapter com a mesma superfície do CharacterAssetStore.
 */
function readChunks(buffer: Buffer): { type: string; start: number; len: number }[] {
  const chunks: { type: string; start: number; len: number }[] = [];
  let offset = 12;
  while (offset < buffer.length) {
    const len = buffer.readUInt32LE(offset);
    const type = buffer.toString('ascii', offset + 4, offset + 8);
    chunks.push({ type, start: offset + 8, len });
    offset += 8 + len;
  }
  return chunks;
}

function skeletonOnlyGlb(buffer: Buffer): ArrayBuffer {
  const chunks = readChunks(buffer);
  const json = JSON.parse(
    buffer.toString('utf8', chunks[0].start, chunks[0].start + chunks[0].len)
  ) as Record<string, unknown> & {
    nodes?: { mesh?: unknown; skin?: unknown }[];
    extensionsUsed?: string[];
    extensionsRequired?: string[];
  };
  for (const node of json.nodes ?? []) {
    delete node.mesh;
    delete node.skin;
  }
  delete json.meshes;
  delete json.skins;
  delete json.images;
  delete json.textures;
  delete json.samplers;
  json.materials = [];
  json.extensionsUsed = (json.extensionsUsed ?? []).filter((name: string) => !/draco/i.test(name));
  json.extensionsRequired = (json.extensionsRequired ?? []).filter((name: string) => !/draco/i.test(name));

  const jsonBytes = Buffer.from(JSON.stringify(json), 'utf8');
  const jsonPadded = Buffer.concat([jsonBytes, Buffer.alloc((4 - (jsonBytes.length % 4)) % 4, 0x20)]);
  const binChunk = chunks[1];
  const bin = Buffer.concat([
    buffer.subarray(binChunk.start, binChunk.start + binChunk.len),
    Buffer.alloc((4 - (binChunk.len % 4)) % 4, 0),
  ]);
  const header = Buffer.alloc(12);
  header.write('glTF', 0, 'ascii');
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(12 + 8 + jsonPadded.length + 8 + bin.length, 8);
  const jsonHeader = Buffer.alloc(8);
  jsonHeader.writeUInt32LE(jsonPadded.length, 0);
  jsonHeader.write('JSON', 4, 'ascii');
  const binHeader = Buffer.alloc(8);
  binHeader.writeUInt32LE(bin.length, 0);
  binHeader.writeUInt32LE(0x004e4942, 4);
  const out = Buffer.concat([header, jsonHeader, jsonPadded, binHeader, bin]);
  return out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength);
}

export interface MageRealRig {
  readonly scene: THREE.Group;
  readonly animations: THREE.AnimationClip[];
}

let rigPromise: Promise<MageRealRig> | null = null;

export function loadMageRealRig(): Promise<MageRealRig> {
  rigPromise ??= new Promise<MageRealRig>((resolve, reject) => {
    const glb = readFileSync(new URL('../../public/models/Maga/Maga-optimized.glb', import.meta.url));
    new GLTFLoader().parse(
      skeletonOnlyGlb(glb),
      '',
      (result: unknown) => resolve(result as MageRealRig),
      (error: unknown) => reject(error)
    );
  });
  return rigPromise;
}

/**
 * Caixa da malha do cajado no espaço do próprio nó `cajado`, copiada do GLB
 * real (accessor POSITION min/max). O rig sem malhas do teste recebe esta caixa
 * como geometria porque a ponta do cajado é derivada da caixa da malha.
 */
export const MAGE_STAFF_BOUNDS = Object.freeze({
  min: new THREE.Vector3(-7.996, -7.464, -97.876),
  max: new THREE.Vector3(8.019, 7.501, -0.019),
});

function withStaffGeometry(scene: THREE.Group): THREE.Group {
  const model = scene.clone(true);
  const staff = model.getObjectByName('cajado');
  if (!staff) return model;
  const size = MAGE_STAFF_BOUNDS.max.clone().sub(MAGE_STAFF_BOUNDS.min);
  const center = MAGE_STAFF_BOUNDS.max.clone().add(MAGE_STAFF_BOUNDS.min).multiplyScalar(0.5);
  const box = new THREE.Mesh(
    new THREE.BoxGeometry(size.x, size.y, size.z),
    new THREE.MeshBasicMaterial()
  );
  box.name = 'cajado-malha';
  box.position.copy(center);
  staff.add(box);
  return model;
}

export function createMageRealAssets(
  rig: MageRealRig,
  options: { staffGeometry?: boolean } = {}
): CharacterAssetStore {
  const cloneModel = (): THREE.Group => options.staffGeometry
    ? withStaffGeometry(rig.scene)
    : (rig.scene.clone(true) as THREE.Group);
  return {
    createModel: cloneModel,
    getAnimations: () => rig.animations,
    getBoneNames: () => {
      const names = new Set<string>();
      rig.scene.traverse((object) => {
        if ((object as THREE.Bone).isBone && object.name) names.add(object.name);
      });
      return names;
    },
    getBoneRestRotations: () => {
      const rotations = new Map<string, THREE.Quaternion>();
      rig.scene.traverse((object) => {
        if ((object as THREE.Bone).isBone && object.name) {
          rotations.set(object.name, object.quaternion.clone());
        }
      });
      return rotations;
    },
    getBoneRestTranslations: () => {
      const translations = new Map<string, THREE.Vector3>();
      rig.scene.traverse((object) => {
        if ((object as THREE.Bone).isBone && object.name) {
          translations.set(object.name, object.position.clone());
        }
      });
      return translations;
    },
  } as unknown as CharacterAssetStore;
}

export function findBone(root: THREE.Object3D, name: string): THREE.Object3D | null {
  return root.getObjectByName(name)
    ?? root.getObjectByName(THREE.PropertyBinding.sanitizeNodeName(name))
    ?? null;
}

/** Inclinação do quadril em relação à vertical: 0° em pé, 90° deitada. */
export function hipTiltDegrees(root: THREE.Object3D): number {
  const hips = findBone(root, 'mixamorig:Hips');
  if (!hips) throw new Error('quadril da Maga ausente');
  root.updateMatrixWorld(true);
  const up = new THREE.Vector3(0, 1, 0).applyQuaternion(
    hips.getWorldQuaternion(new THREE.Quaternion())
  );
  return THREE.MathUtils.radToDeg(Math.acos(THREE.MathUtils.clamp(up.y, -1, 1)));
}
