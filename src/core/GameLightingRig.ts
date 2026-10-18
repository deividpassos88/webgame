import * as THREE from 'three';

/** Luz solar de Campo dos Deuses. O rig central preserva luz dinâmica do jogador/boss. */
export class GameLightingRig {
  public readonly playerLight = new THREE.PointLight(0xffe7c5, 6, 18, 2);
  public readonly bossLight = new THREE.PointLight(0xffcb92, 0, 18, 2);

  public constructor(scene: THREE.Scene) {
    const sky = new THREE.Color(0xb2d8ff);
    scene.background = sky.clone();
    // The 162-metre square remains clear. Fog blends distant
    // floating temples and cloud banks into the bright sky.
    scene.fog = new THREE.Fog(sky, 235, 790);
    scene.add(new THREE.AmbientLight(0xdfe7f9, 0.66));

    const sunlight = new THREE.DirectionalLight(0xffedd1, 2.15);
    sunlight.name = 'CelestialSunLight';
    sunlight.position.set(96, 156, -115);
    sunlight.target.position.set(0, 0, 0);
    sunlight.castShadow = true;
    sunlight.shadow.mapSize.set(2048, 2048);
    sunlight.shadow.camera.left = -108;
    sunlight.shadow.camera.right = 108;
    sunlight.shadow.camera.top = 108;
    sunlight.shadow.camera.bottom = -108;
    sunlight.shadow.camera.near = 0.5;
    sunlight.shadow.camera.far = 380;
    sunlight.shadow.bias = -0.00075;
    scene.add(sunlight, sunlight.target);

    scene.add(new THREE.HemisphereLight(0xc8e0ff, 0x8595a5, 0.92));
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
