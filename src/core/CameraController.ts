import * as THREE from 'three';

/**
 * Câmera estilo Diablo 3: perspectiva fixa, olhando de cima em ângulo,
 * seguindo suavemente o jogador (personagem fica pequeno na tela).
 */
export class CameraController {
  public camera: THREE.PerspectiveCamera;

  // offset da câmera em relação ao jogador (altura/distância isométrica)
  private offset = new THREE.Vector3(0, 16, 11);
  private lookOffset = new THREE.Vector3(0, 1, 0);
  private currentPosition = new THREE.Vector3();
  private currentLookAt = new THREE.Vector3();
  private followTarget = new THREE.Vector3();
  private deadZone = new THREE.Vector2(3, 3);
  private smoothing = 5;

  public zoom = 1;

  /** Zoom padrão dos jogadores (mais longe = personagem pequeno na tela). */
  private readonly defaultZoom = 1.2;
  /** Limites de zoom para jogadores normais. */
  private readonly playerZoomMin = 0.85;
  private readonly playerZoomMax = 1.6;
  /** Limites de zoom liberados para ADM (qualquer distância). */
  private readonly adminZoomMin = 0.6;
  private readonly adminZoomMax = 2.2;
  private adminMode = false;

  constructor(aspect: number) {
    this.camera = new THREE.PerspectiveCamera(35, aspect, 0.1, 200);
    this.camera.position.set(0, 16, 11);
    this.zoom = this.defaultZoom;
  }

  /** Ativa o modo ADM: libera qualquer zoom. Falso = jogador normal. */
  public setAdminMode(enabled: boolean) {
    this.adminMode = enabled;
    if (!enabled) {
      // volta ao enquadramento padrão do jogador
      this.zoom = this.defaultZoom;
    }
  }

  public isAdminMode() {
    return this.adminMode;
  }

  /** Exposição somente-leitura do followTarget para testes */
  public followTargetX(): number {
    return this.followTarget.x;
  }

  public snapTo(target: THREE.Vector3) {
    this.followTarget.copy(target);
    this.currentPosition.copy(target).add(this.offset);
    this.currentLookAt.copy(target).add(this.lookOffset);
    this.camera.position.copy(this.currentPosition);
    this.camera.lookAt(this.currentLookAt);
  }

  public update(target: THREE.Vector3, delta: number) {
    const distanceX = target.x - this.followTarget.x;
    const distanceZ = target.z - this.followTarget.z;

    if (Math.abs(distanceX) > this.deadZone.x) {
      this.followTarget.x = target.x - Math.sign(distanceX) * this.deadZone.x;
    }
    if (Math.abs(distanceZ) > this.deadZone.y) {
      this.followTarget.z = target.z - Math.sign(distanceZ) * this.deadZone.y;
    }
    this.followTarget.y = target.y;

    const desiredPos = new THREE.Vector3()
      .copy(this.followTarget)
      .add(this.offset.clone().multiplyScalar(this.zoom));
    const desiredLook = new THREE.Vector3()
      .copy(this.followTarget)
      .add(this.lookOffset);

    const t = 1 - Math.pow(0.001, delta * this.smoothing);
    this.currentPosition.lerp(desiredPos, t);
    this.currentLookAt.lerp(desiredLook, t);

    this.camera.position.copy(this.currentPosition);
    this.camera.lookAt(this.currentLookAt);
  }

  public setAspect(aspect: number) {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  public adjustZoom(delta: number) {
    const min = this.adminMode ? this.adminZoomMin : this.playerZoomMin;
    const max = this.adminMode ? this.adminZoomMax : this.playerZoomMax;
    this.zoom = THREE.MathUtils.clamp(this.zoom + delta, min, max);
  }
}
