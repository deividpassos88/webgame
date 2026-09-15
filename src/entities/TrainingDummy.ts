import * as THREE from 'three';

export interface TrainingDummyOptions {
  position: THREE.Vector3;
}

/**
 * Boneco de treino para testar golpes e alcance das armas.
 * - Fica parado no lugar
 * - Vida infinita (nunca morre)
 * - Pisca quando é atingido
 * - Mostra o anel do alcance efetivo da arma equipada
 */
export class TrainingDummy {
  public root = new THREE.Group();
  public isDead = false; // nunca morre
  public markedForRemoval = false;

  private hitFlashTime = 0;
  private materials: THREE.MeshStandardMaterial[] = [];
  private meshGroup!: THREE.Group;
  private rangeRing: THREE.Mesh;
  private totalHits = 0;
  private totalDamage = 0;
  private labelCanvas: HTMLCanvasElement;
  private labelTexture: THREE.CanvasTexture;
  private labelSprite: THREE.Sprite;

  constructor(options: TrainingDummyOptions) {
    this.root.position.copy(options.position);
    this.root.userData.isEnemyRoot = true;
    this.root.userData.isTrainingDummy = true;

    this.buildMesh();

    // anel que mostra o alcance atual
    const ringGeo = new THREE.RingGeometry(0.95, 1.05, 48);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0x44ff88,
      transparent: true,
      opacity: 0.45,
      side: THREE.DoubleSide,
    });
    this.rangeRing = new THREE.Mesh(ringGeo, ringMat);
    this.rangeRing.rotation.x = -Math.PI / 2;
    this.rangeRing.position.y = 0.03;
    this.root.add(this.rangeRing);

    // etiqueta com contagem de hits/dano acumulado
    this.labelCanvas = document.createElement('canvas');
    this.labelCanvas.width = 256;
    this.labelCanvas.height = 64;
    this.labelTexture = new THREE.CanvasTexture(this.labelCanvas);
    const labelMat = new THREE.SpriteMaterial({
      map: this.labelTexture,
      transparent: true,
    });
    this.labelSprite = new THREE.Sprite(labelMat);
    this.labelSprite.position.y = 2.6;
    this.labelSprite.scale.set(2.4, 0.6, 1);
    this.root.add(this.labelSprite);
    this.updateLabel();
  }

  private buildMesh() {
    const group = new THREE.Group();
    const bodyMat = new THREE.MeshStandardMaterial({
      color: 0x3a7a5a,
      roughness: 0.7,
      metalness: 0.1,
      emissive: new THREE.Color(0x224433),
    });
    this.materials.push(bodyMat);

    // poste central
    const post = new THREE.Mesh(
      new THREE.CylinderGeometry(0.12, 0.16, 1.8, 10),
      bodyMat
    );
    post.position.y = 0.9;
    post.castShadow = true;
    group.add(post);

    // corpo (barril alvo)
    const body = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.42, 0.7, 4, 12),
      bodyMat.clone()
    );
    body.position.y = 1.25;
    body.castShadow = true;
    group.add(body);
    this.materials.push(body.material as THREE.MeshStandardMaterial);

    // cabeça (saco de areia)
    const head = new THREE.Mesh(
      new THREE.SphereGeometry(0.3, 12, 12),
      bodyMat.clone()
    );
    head.position.y = 2.05;
    head.castShadow = true;
    group.add(head);
    this.materials.push(head.material as THREE.MeshStandardMaterial);

    // faixas vermelhas de "alvo" no peito
    const bandMat = new THREE.MeshStandardMaterial({ color: 0xaa2222 });
    for (const y of [1.15, 1.55]) {
      const band = new THREE.Mesh(
        new THREE.TorusGeometry(0.43, 0.03, 8, 24),
        bandMat
      );
      band.rotation.x = Math.PI / 2;
      band.position.y = y;
      group.add(band);
    }

    // base
    const base = new THREE.Mesh(
      new THREE.CylinderGeometry(0.55, 0.65, 0.18, 12),
      new THREE.MeshStandardMaterial({ color: 0x2a2a2a })
    );
    base.position.y = 0.09;
    base.receiveShadow = true;
    group.add(base);

    this.root.add(group);
    this.meshGroup = group;
  }

  /** Atualiza o anel para mostrar o alcance da arma equipada */
  public setWeaponRange(range: number): void {
    this.rangeRing.scale.set(range, range, 1);
  }

  public setRangeColor(hex: number): void {
    (this.rangeRing.material as THREE.MeshBasicMaterial).color.setHex(hex);
  }

  /** Registra um golpe recebido (vida infinita — só contabiliza) */
  public takeDamage(amount: number): void {
    this.totalHits += 1;
    this.totalDamage += amount;
    this.hitFlashTime = 0.15;
    this.updateLabel();
  }

  public update(delta: number): void {
    if (this.hitFlashTime > 0) {
      this.hitFlashTime -= delta;
      const flash = this.hitFlashTime > 0 ? 1 : 0;
      this.materials.forEach((m) => (m.emissiveIntensity = 0.3 + flash * 2.5));
    }
    // leve balanço ao ser atingido
    if (this.hitFlashTime > 0) {
      this.meshGroup.rotation.z =
        Math.sin(performance.now() * 0.04) * 0.06 * this.hitFlashTime;
    } else {
      this.meshGroup.rotation.z *= 0.9;
    }
    this.rangeRing.rotation.z += delta * 0.4;
  }

  private updateLabel(): void {
    const ctx = this.labelCanvas.getContext('2d')!;
    ctx.clearRect(0, 0, 256, 64);
    ctx.fillStyle = 'rgba(0,0,0,0.65)';
    ctx.roundRect(4, 4, 248, 56, 10);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 22px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(`${this.totalHits} golpes`, 128, 30);
    ctx.fillStyle = '#ffd97a';
    ctx.font = 'bold 20px monospace';
    ctx.fillText(`-${this.totalDamage} dano total`, 128, 54);
    this.labelTexture.needsUpdate = true;
  }
}
