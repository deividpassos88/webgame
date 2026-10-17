import * as THREE from 'three';

/** Luz solar de Campo dos Deuses. O rig central preserva luz dinâmica do jogador/boss. */
export class GameLightingRig {
  public readonly playerLight = new THREE.PointLight(0xffe7c5, 6, 18, 2);
  public readonly bossLight = new THREE.PointLight(0xffcb92, 0, 18, 2);

  public constructor(scene: THREE.Scene) {
    const sky = new THREE.Color(0xb2d8ff);
    scene.background = sky.clone();
    // The playable 50-metre square remains clear. Fog blends distant
    // floating temples and cloud banks into the bright sky.
    scene.fog = new THREE.Fog(sky, 105, 205);
    scene.add(new THREE.AmbientLight(0xf5f4fc, 0.77));

    const sunlight = new THREE.DirectionalLight(0xffebcc, 2.0);
    sunlight.name = 'CelestialSunLight';
    sunlight.position.set(-31, 48, -25);
    sunlight.target.position.set(0, 0, 0);
    sunlight.castShadow = true;
    sunlight.shadow.mapSize.set(1024, 1024);
    sunlight.shadow.camera.left = -35;
    sunlight.shadow.camera.right = 35;
    sunlight.shadow.camera.top = 35;
    sunlight.shadow.camera.bottom = -35;
    sunlight.shadow.camera.near = 0.5;
    sunlight.shadow.camera.far = 120;
    sunlight.shadow.bias = -0.00075;
    scene.add(sunlight, sunlight.target);

    scene.add(new THREE.HemisphereLight(0xd9efff, 0x9a9dba, 1.1));
    scene.add(this.playerLight, this.bossLight);
  }

  public update(
    playerPosition: THREE.Vector3,
    bossPosition: THREE.Vector3 | null
  ): void {
    this.playerLight.position.set(
      playerPosition.x,
      playerPosition.y + 5,
      playerPosition.z
    );
    this.bossLight.intensity = bossPosition ? 16 : 0;
    if (bossPosition) {
      this.bossLight.position.set(
        bossPosition.x,
        bossPosition.y + 6,
        bossPosition.z + 1
      );
    }
  }
}
