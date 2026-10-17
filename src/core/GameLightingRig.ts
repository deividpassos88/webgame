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
    scene.add(new THREE.AmbientLight(0xdfe7f9, 0.44));

    const sunlight = new THREE.DirectionalLight(0xffeddb, 1.52);
    sunlight.name = 'CelestialSunLight';
    sunlight.position.set(33, 48, -36);
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

    scene.add(new THREE.HemisphereLight(0xb8d6ff, 0x8193bc, 0.58));
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
