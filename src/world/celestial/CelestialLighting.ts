import * as THREE from 'three';
import { ARENA, PALETTE } from './CelestialConfig';

/**
 * Iluminação de dia claro da arena.
 *
 * Sol quente vindo da esquerda/frente (como nas duas referências), luz
 * hemisférica céu/solo para preencher as sombras e uma luz de recorte fria
 * para separar a arquibancada do fundo. A sombra é de 2048 px cobrindo 70 m.
 */
export interface CelestialLighting {
  readonly group: THREE.Group;
  readonly sun: THREE.DirectionalLight;
  readonly hemisphere: THREE.HemisphereLight;
  readonly ambient: THREE.AmbientLight;
  readonly fill: THREE.DirectionalLight;
  update(time: number): void;
  dispose(): void;
}

export function createCelestialLighting(quality: 'high' | 'medium' | 'low' = 'high'): CelestialLighting {
  const group = new THREE.Group();
  group.name = 'celestial-lighting';

  const sun = new THREE.DirectionalLight(0xffe6bd, 2.35);
  sun.position.set(
    ARENA.sunPosition.x,
    ARENA.sunPosition.y,
    ARENA.sunPosition.z
  );
  sun.target.position.set(0, 0, 0);
  sun.castShadow = true;
  sun.shadow.mapSize.set(quality === 'low' ? 1024 : 2048, quality === 'low' ? 1024 : 2048);
  const shadowSpan = 38;
  sun.shadow.camera.left = -shadowSpan;
  sun.shadow.camera.right = shadowSpan;
  sun.shadow.camera.top = shadowSpan;
  sun.shadow.camera.bottom = -shadowSpan;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 190;
  sun.shadow.bias = -0.00025;
  sun.shadow.normalBias = 0.035;
  sun.shadow.radius = 3;
  group.add(sun, sun.target);

  const hemisphere = new THREE.HemisphereLight(0x9cc9f5, 0xdcc9a8, 0.66);
  group.add(hemisphere);

  const ambient = new THREE.AmbientLight(0xcfe0f7, 0.16);
  group.add(ambient);

  const fill = new THREE.DirectionalLight(0xbfd9ff, 0.16);
  fill.position.set(40, 28, -55);
  group.add(fill);

  return {
    group,
    sun,
    hemisphere,
    ambient,
    fill,
    update(time: number) {
      // O sol fica fixo (hora dourada); o brilho varia 1% para o cenário vivo.
      sun.intensity = 2.35 + Math.sin(time * 0.2) * 0.02;
    },
    dispose() {
      sun.shadow.map?.dispose();
      sun.dispose();
      fill.dispose();
      hemisphere.dispose();
      ambient.dispose();
    },
  };
}

/** Cores de ambiente usadas por cena/laboratório. */
export const CELESTIAL_ENVIRONMENT = Object.freeze({
  background: PALETTE.skyHorizon,
  fog: 0xd8e9f7,
  fogNear: 190,
  fogFar: 900,
  exposure: 0.9,
});
