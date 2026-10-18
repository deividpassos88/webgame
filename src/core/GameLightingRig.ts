import * as THREE from 'three';
import {
  CELESTIAL_ENVIRONMENT,
  createCelestialLighting,
  type CelestialLighting,
} from '../world/celestial/CelestialLighting';

export type LightingStyle = 'dungeon' | 'celestial';

export class GameLightingRig {
  public readonly playerLight = new THREE.PointLight(0xffe0b8, 30, 18, 2);
  public readonly bossLight = new THREE.PointLight(0xffb06a, 0, 18, 2);
  private readonly celestial: CelestialLighting | null;

  /**
   * `dungeon` mantém a masmorra noturna original; `celestial` usa o dia claro
   * da Arena Celeste (sol quente, céu azul e sombras suaves). O estilo antigo é
   * o padrão para preservar o comportamento coberto pelos testes existentes.
   */
  public constructor(scene: THREE.Scene, style: LightingStyle = 'dungeon') {
    if (style === 'celestial') {
      this.celestial = createCelestialLighting('high');
      scene.add(this.celestial.group);
      scene.background = new THREE.Color(CELESTIAL_ENVIRONMENT.background);
      scene.fog = new THREE.Fog(
        CELESTIAL_ENVIRONMENT.fog,
        CELESTIAL_ENVIRONMENT.fogNear,
        CELESTIAL_ENVIRONMENT.fogFar
      );
      return;
    }
    this.celestial = null;

    const darkness = new THREE.Color(0x060912);
    scene.background = darkness.clone();
    // Fog é calculada a partir da câmera elevada; esta faixa mantém o jogador
    // visível enquanto a luz radial permanece forte perto do jogador e
    // desaparece gradualmente ao se aproximar do alcance máximo de 18 m.
    scene.fog = new THREE.Fog(darkness, 30, 50);
    scene.add(new THREE.AmbientLight(0x66708a, 0.4));

    const moon = new THREE.DirectionalLight(0x9fb3df, 0.55);
    moon.position.set(-10, 20, -5);
    moon.castShadow = true;
    moon.shadow.mapSize.set(1024, 1024);
    moon.shadow.camera.left = -25;
    moon.shadow.camera.right = 25;
    moon.shadow.camera.top = 25;
    moon.shadow.camera.bottom = -25;
    moon.shadow.camera.far = 60;
    moon.shadow.bias = -0.001;
    scene.add(moon);

    scene.add(new THREE.HemisphereLight(0x8294bd, 0x17130f, 0.3));
    scene.add(this.playerLight, this.bossLight);
  }

  public update(
    playerPosition: THREE.Vector3,
    bossPosition: THREE.Vector3 | null,
    time = 0
  ): void {
    if (this.celestial) {
      this.celestial.update(time);
      return;
    }
    this.playerLight.position.set(
      playerPosition.x,
      playerPosition.y + 5,
      playerPosition.z
    );
    this.bossLight.intensity = bossPosition ? 28 : 0;
    if (bossPosition) {
      this.bossLight.position.set(
        bossPosition.x,
        bossPosition.y + 6,
        bossPosition.z + 1
      );
    }
  }
}
