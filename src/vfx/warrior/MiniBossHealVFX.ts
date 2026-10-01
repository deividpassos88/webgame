import * as THREE from 'three';

export interface MiniBossHealPillarConfig {
  duration?: number;
  radius?: number;
  height?: number;
}

const DEFAULT_DURATION = 2.2;
const PLUS_COUNT = 26;
const MOTE_COUNT = 70;
const RING_COUNT = 3;

let plusTexture: THREE.Texture | null = null;
let glowTexture: THREE.Texture | null = null;

/** Rounded medical "+" with a green glow, generated from raw bytes (works headless). */
function getPlusTexture(): THREE.Texture {
  if (plusTexture) return plusTexture;
  const size = 96;
  const data = new Uint8Array(size * size * 4);
  const arm = 0.36;
  const thick = 0.115;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const px = (x + 0.5) / size - 0.5;
      const py = (y + 0.5) / size - 0.5;
      const sdBox = (hx: number, hy: number): number => {
        const qx = Math.abs(px) - hx;
        const qy = Math.abs(py) - hy;
        return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - 0.03;
      };
      const d = Math.min(sdBox(arm - 0.03, thick - 0.03), sdBox(thick - 0.03, arm - 0.03));
      const solid = THREE.MathUtils.clamp(0.5 - d / 0.02, 0, 1);
      const glow = d > 0 ? Math.exp(-d * 15) * 0.55 : 0;
      const core = THREE.MathUtils.clamp(-d / 0.07, 0, 1);
      const alpha = Math.min(1, solid + glow * (1 - solid));
      const offset = (y * size + x) * 4;
      // Bright mint centre, saturated green edge, soft green halo.
      data[offset] = Math.round(70 + core * 150);
      data[offset + 1] = 255;
      data[offset + 2] = Math.round(120 + core * 105);
      data[offset + 3] = Math.round(alpha * 255);
    }
  }
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  texture.needsUpdate = true;
  plusTexture = texture;
  return texture;
}

function getGlowTexture(): THREE.Texture {
  if (glowTexture) return glowTexture;
  const size = 64;
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const dx = (x + 0.5) / size - 0.5;
      const dy = (y + 0.5) / size - 0.5;
      const a = THREE.MathUtils.clamp(1 - Math.sqrt(dx * dx + dy * dy) * 2, 0, 1);
      const offset = (y * size + x) * 4;
      data[offset] = 255;
      data[offset + 1] = 255;
      data[offset + 2] = 255;
      data[offset + 3] = Math.round(a * a * 255);
    }
  }
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  texture.needsUpdate = true;
  glowTexture = texture;
  return texture;
}

interface PlusParticle {
  sprite: THREE.Sprite;
  angle: number;
  radius: number;
  delay: number;
  life: number;
  rise: number;
  swirl: number;
  size: number;
  spin: number;
}

interface HealRing {
  mesh: THREE.Mesh;
  material: THREE.MeshBasicMaterial;
  delay: number;
}

/**
 * Mini-boss kill heal effect. All pieces live inside a single container so the
 * group only ever holds one child:
 * - a bright flash + expanding neon-green shockwave rings on the ground
 * - a luminous green column (gradient beam + scrolling cross texture cylinder)
 * - many floating "+" medical symbols spiralling upwards, with varied sizes
 * - rising green sparkles and a warm ground glow
 */
export class MiniBossHealVFX {
  public readonly group = new THREE.Group();
  private readonly container = new THREE.Group();
  private readonly cylinderMesh: THREE.Mesh;
  private readonly beamMesh: THREE.Mesh;
  private readonly beamMaterial: THREE.MeshBasicMaterial;
  private readonly ringMesh: THREE.Mesh;
  private readonly material: THREE.MeshBasicMaterial;
  private readonly ringMaterial: THREE.MeshBasicMaterial;
  private readonly glowMesh: THREE.Mesh;
  private readonly glowMaterial: THREE.MeshBasicMaterial;
  private readonly flashSprite: THREE.Sprite;
  private readonly rings: HealRing[] = [];
  private readonly plusParticles: PlusParticle[] = [];
  private readonly motes: THREE.Points;
  private readonly moteMaterial: THREE.PointsMaterial;
  private readonly moteSeeds: Float32Array;
  private readonly extraGeometries: THREE.BufferGeometry[] = [];
  private active = false;
  private elapsed = 0;
  private duration = DEFAULT_DURATION;
  private targetPlayer: THREE.Object3D | null = null;

  public constructor() {
    this.group.name = 'MiniBossHealVFXGroup';
    this.container.name = 'MiniBossHealContainer';

    // Cylinder geometry surrounding player (open ended)
    const radius = 1.35;
    const height = 2.8;
    const geom = new THREE.CylinderGeometry(radius, radius, height, 32, 1, true);
    geom.translate(0, height / 2, 0);

    const texture = new THREE.TextureLoader().load('/vfx/warrior/heal-cylinder.png', (tex) => {
      tex.wrapS = THREE.RepeatWrapping;
      tex.wrapT = THREE.ClampToEdgeWrapping;
      tex.needsUpdate = true;
    });

    this.material = new THREE.MeshBasicMaterial({
      map: texture,
      color: 0x66ff9a,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    this.cylinderMesh = new THREE.Mesh(geom, this.material);
    this.cylinderMesh.frustumCulled = false;

    // Inner light beam: bright at the feet, fading to nothing at the top (additive).
    const beamHeight = 3.8;
    const beamGeom = new THREE.CylinderGeometry(0.85, 1.05, beamHeight, 32, 8, true);
    beamGeom.translate(0, beamHeight / 2, 0);
    const beamPositions = beamGeom.getAttribute('position');
    const beamColors = new Float32Array(beamPositions.count * 3);
    const low = new THREE.Color(0x35ff7a);
    for (let i = 0; i < beamPositions.count; i += 1) {
      const t = THREE.MathUtils.clamp(beamPositions.getY(i) / beamHeight, 0, 1);
      const fade = Math.pow(1 - t, 1.6);
      beamColors[i * 3] = low.r * fade;
      beamColors[i * 3 + 1] = low.g * fade;
      beamColors[i * 3 + 2] = low.b * fade;
    }
    beamGeom.setAttribute('color', new THREE.BufferAttribute(beamColors, 3));
    this.beamMaterial = new THREE.MeshBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      depthWrite: false,
      toneMapped: false,
    });
    this.beamMesh = new THREE.Mesh(beamGeom, this.beamMaterial);
    this.beamMesh.frustumCulled = false;
    this.extraGeometries.push(beamGeom);

    // Main floor neon ring (stays with the player)
    const ringGeom = new THREE.RingGeometry(radius * 0.88, radius * 1.08, 64);
    ringGeom.rotateX(-Math.PI / 2);
    this.extraGeometries.push(ringGeom);
    this.ringMaterial = new THREE.MeshBasicMaterial({
      color: 0x4dff88,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      depthWrite: false,
      toneMapped: false,
    });
    this.ringMesh = new THREE.Mesh(ringGeom, this.ringMaterial);
    this.ringMesh.position.y = 0.04;
    this.ringMesh.frustumCulled = false;

    // Soft ground glow disc
    const glowGeom = new THREE.CircleGeometry(radius * 1.55, 48);
    glowGeom.rotateX(-Math.PI / 2);
    this.extraGeometries.push(glowGeom);
    this.glowMaterial = new THREE.MeshBasicMaterial({
      map: getGlowTexture(),
      color: 0x3dff80,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    });
    this.glowMesh = new THREE.Mesh(glowGeom, this.glowMaterial);
    this.glowMesh.position.y = 0.03;
    this.glowMesh.frustumCulled = false;

    // Expanding shockwave rings
    const waveGeom = new THREE.RingGeometry(0.92, 1.0, 64);
    waveGeom.rotateX(-Math.PI / 2);
    this.extraGeometries.push(waveGeom);
    for (let i = 0; i < RING_COUNT; i += 1) {
      const material = new THREE.MeshBasicMaterial({
        color: i === 0 ? 0xb8ffd0 : 0x4dff88,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        depthWrite: false,
        toneMapped: false,
      });
      const mesh = new THREE.Mesh(waveGeom, material);
      mesh.position.y = 0.05 + i * 0.01;
      mesh.frustumCulled = false;
      mesh.visible = false;
      this.rings.push({ mesh, material, delay: i * 0.22 });
      this.container.add(mesh);
    }

    // Burst flash at the player's chest
    this.flashSprite = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: getGlowTexture(),
        color: 0xb5ffcc,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
      })
    );
    this.flashSprite.position.y = 1.1;
    this.flashSprite.frustumCulled = false;

    // Floating "+" symbols
    for (let i = 0; i < PLUS_COUNT; i += 1) {
      const sprite = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: getPlusTexture(),
          color: i % 4 === 0 ? 0xd9ffe6 : 0xffffff,
          transparent: true,
          opacity: 0,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          depthTest: false,
          toneMapped: false,
        })
      );
      sprite.frustumCulled = false;
      sprite.visible = false;
      sprite.renderOrder = 20;
      const big = i % 5 === 0;
      this.plusParticles.push({
        sprite,
        angle: (i / PLUS_COUNT) * Math.PI * 2 + Math.random() * 0.6,
        radius: 0.35 + Math.random() * 1.05,
        delay: (i / PLUS_COUNT) * 0.85 + Math.random() * 0.1,
        life: 1.05 + Math.random() * 0.2,
        rise: 1.9 + Math.random() * 1.1,
        swirl: (Math.random() < 0.5 ? -1 : 1) * (0.9 + Math.random() * 0.9),
        size: big ? 0.8 + Math.random() * 0.25 : 0.38 + Math.random() * 0.3,
        spin: (Math.random() - 0.5) * 1.4,
      });
      this.container.add(sprite);
    }

    // Rising green sparkles
    this.moteSeeds = new Float32Array(MOTE_COUNT * 4);
    const motePositions = new Float32Array(MOTE_COUNT * 3);
    for (let i = 0; i < MOTE_COUNT; i += 1) {
      this.moteSeeds[i * 4] = Math.random() * Math.PI * 2; // angle
      this.moteSeeds[i * 4 + 1] = 0.25 + Math.random() * 1.25; // radius
      this.moteSeeds[i * 4 + 2] = Math.random() * 0.9; // delay
      this.moteSeeds[i * 4 + 3] = 1.1 + Math.random() * 1.6; // rise speed
    }
    const moteGeom = new THREE.BufferGeometry();
    moteGeom.setAttribute('position', new THREE.BufferAttribute(motePositions, 3));
    this.extraGeometries.push(moteGeom);
    this.moteMaterial = new THREE.PointsMaterial({
      map: getGlowTexture(),
      color: 0x8dffb0,
      size: 0.2,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    });
    this.motes = new THREE.Points(moteGeom, this.moteMaterial);
    this.motes.frustumCulled = false;

    this.container.add(
      this.glowMesh,
      this.beamMesh,
      this.cylinderMesh,
      this.ringMesh,
      this.motes,
      this.flashSprite
    );
  }

  /**
   * Triggers the healing pillar when a mini-boss dies and restores a large amount of HP.
   */
  public triggerHeal(playerRoot: THREE.Object3D, config: MiniBossHealPillarConfig = {}): void {
    this.targetPlayer = playerRoot;
    this.duration = config.duration ?? DEFAULT_DURATION;
    this.elapsed = 0;
    this.active = true;
    if (!this.group.children.includes(this.container)) {
      this.group.add(this.container);
    }
    this.container.position.copy(playerRoot.position);
    this.material.opacity = 0;
    this.ringMaterial.opacity = 0;
    this.cylinderMesh.rotation.y = 0;
    this.applyFrame(0);
  }

  public update(delta: number): void {
    if (!this.active) return;
    this.elapsed += delta;
    const progress = Math.min(1.0, this.elapsed / this.duration);

    // Follow player if moving
    if (this.targetPlayer) {
      this.container.position.copy(this.targetPlayer.position);
    }

    this.cylinderMesh.rotation.y += delta * 1.1;
    this.applyFrame(progress);

    if (progress >= 1.0) {
      this.finish();
    }
  }

  private applyFrame(progress: number): void {
    const t = this.elapsed;

    // Global envelope: quick rise, long bright hold, soft dissolve.
    let alpha = 1.0;
    if (progress < 0.08) {
      alpha = progress / 0.08;
    } else if (progress > 0.62) {
      alpha = Math.max(0, 1.0 - (progress - 0.62) / 0.38);
    }

    // Cross-texture cylinder scrolls upward so "+" marks climb the column.
    if (this.material.map) {
      this.material.map.offset.y = -progress * 0.6;
    }
    this.material.opacity = alpha * 0.95;
    this.ringMaterial.opacity = alpha;
    const pulse = 1 + Math.sin(t * 14) * 0.06;
    const scale = (1.0 + progress * 0.18) * pulse;
    this.cylinderMesh.scale.set(scale, 1.0 + progress * 0.3, scale);
    this.ringMesh.scale.setScalar(1 + progress * 0.12);

    // Inner beam punches up fast then thins out.
    const beamRise = THREE.MathUtils.smoothstep(progress, 0, 0.14);
    const beamThin = 1 - THREE.MathUtils.smoothstep(progress, 0.5, 1) * 0.55;
    this.beamMaterial.opacity = alpha * 0.9;
    this.beamMesh.scale.set(beamThin * pulse, Math.max(0.001, beamRise), beamThin * pulse);

    // Ground glow breathes.
    this.glowMaterial.opacity = alpha * (0.75 + Math.sin(t * 9) * 0.15);
    this.glowMesh.scale.setScalar(1 + progress * 0.25);

    // Flash at the very beginning.
    const flash = Math.max(0, 1 - progress / 0.14);
    this.flashSprite.material.opacity = flash;
    this.flashSprite.scale.setScalar(2.2 + (1 - flash) * 3.2);

    // Shockwave rings.
    for (const ring of this.rings) {
      const local = (t - ring.delay) / 0.95;
      if (local <= 0 || local >= 1) {
        ring.mesh.visible = false;
        continue;
      }
      ring.mesh.visible = true;
      const eased = 1 - Math.pow(1 - local, 2.2);
      ring.mesh.scale.setScalar(0.7 + eased * 2.6);
      ring.material.opacity = (1 - local) * 0.95;
    }

    // Floating "+" symbols.
    for (const plus of this.plusParticles) {
      const local = (t - plus.delay) / plus.life;
      if (local <= 0 || local >= 1) {
        plus.sprite.visible = false;
        continue;
      }
      plus.sprite.visible = true;
      const angle = plus.angle + local * plus.swirl;
      const r = plus.radius * (1 + local * 0.12);
      plus.sprite.position.set(
        Math.cos(angle) * r,
        0.2 + Math.pow(local, 0.85) * plus.rise,
        Math.sin(angle) * r
      );
      // Pop in, hold, then shrink away.
      const pop = THREE.MathUtils.smoothstep(local, 0, 0.18);
      const out = 1 - THREE.MathUtils.smoothstep(local, 0.65, 1);
      const sizeNow = plus.size * (0.55 + 0.45 * pop) * (0.7 + 0.3 * out);
      plus.sprite.scale.set(sizeNow, sizeNow, 1);
      plus.sprite.material.opacity = Math.min(pop, out) * 1.0;
      plus.sprite.material.rotation = plus.spin * local;
    }

    // Sparkle motes.
    const positions = this.motes.geometry.getAttribute('position') as THREE.BufferAttribute;
    const array = positions.array as Float32Array;
    for (let i = 0; i < MOTE_COUNT; i += 1) {
      const seedAngle = this.moteSeeds[i * 4];
      const seedRadius = this.moteSeeds[i * 4 + 1];
      const delay = this.moteSeeds[i * 4 + 2];
      const speed = this.moteSeeds[i * 4 + 3];
      const age = Math.max(0, t - delay);
      const cycle = (age * speed * 0.55) % 2.4;
      const angle = seedAngle + age * 1.4;
      const radius = seedRadius * (1 - cycle / 3.6);
      array[i * 3] = Math.cos(angle) * radius;
      array[i * 3 + 1] = 0.05 + cycle;
      array[i * 3 + 2] = Math.sin(angle) * radius;
    }
    positions.needsUpdate = true;
    this.moteMaterial.opacity = alpha * (0.8 + Math.sin(t * 18) * 0.2);
  }

  private hideAll(): void {
    this.material.opacity = 0;
    this.ringMaterial.opacity = 0;
    this.beamMaterial.opacity = 0;
    this.glowMaterial.opacity = 0;
    this.moteMaterial.opacity = 0;
    this.flashSprite.material.opacity = 0;
    for (const ring of this.rings) {
      ring.mesh.visible = false;
      ring.material.opacity = 0;
    }
    for (const plus of this.plusParticles) {
      plus.sprite.visible = false;
      plus.sprite.material.opacity = 0;
    }
  }

  private finish(): void {
    this.active = false;
    this.group.remove(this.container);
    this.hideAll();
  }

  public reset(): void {
    this.active = false;
    this.group.remove(this.container);
    this.hideAll();
  }

  public dispose(): void {
    this.reset();
    this.cylinderMesh.geometry.dispose();
    this.ringMesh.geometry.dispose();
    this.extraGeometries.forEach((geometry) => geometry.dispose());
    this.material.map?.dispose();
    this.material.dispose();
    this.ringMaterial.dispose();
    this.beamMaterial.dispose();
    this.glowMaterial.dispose();
    this.moteMaterial.dispose();
    this.flashSprite.material.dispose();
    this.rings.forEach((ring) => ring.material.dispose());
    this.plusParticles.forEach((plus) => plus.sprite.material.dispose());
  }
}
