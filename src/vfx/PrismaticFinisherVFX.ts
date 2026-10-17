import * as THREE from 'three';
import { PooledParticleCloud, qualityCount } from './ParticleManager';
import { VFXLightPool, type VFXLightHandle } from './VFXLightPool';
import type { PoolableVFX } from './VFXPool';
import type { MageVFXQuality } from './VFXTypes';
import { MageVFXResources } from './MageVFXResources';
import { PrismaticExplosionField } from './PrismaticExplosionField';

/**
 * Raio Prismático, fase final.
 * Não há projéteis sólidos: os seis caçadores são segmentos de LASER que
 * serpenteiam em curvas de Bézier até o corpo dos alvos. A explosão não usa
 * um círculo opaco: plasma semitransparente, arcos irregulares, ondas de
 * choque quebradas e três sistemas de partículas independentes.
 */
export const PRISM_FINISHER = {
  missileCount: 24,
  missileInterval: 0.064,
  flightTime: 0.87,
  explosionSeconds: 1.65,
  explosionRadius: 4.15,
} as const;

const ARC_STEPS = 28;
const UP = new THREE.Vector3(0, 1, 0);
const TMP_A = new THREE.Vector3();
const TMP_B = new THREE.Vector3();
const TMP_C = new THREE.Vector3();
const TMP_SIDE = new THREE.Vector3();

const ARC_VERTEX = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
const ARC_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform float uOpacity;
  uniform vec3 uColor;
  varying vec2 vUv;
  void main() {
    float across = 1.0 - abs(vUv.x * 2.0 - 1.0);
    float core = pow(max(0.0, across), 1.5);
    float surge = 0.76 + 0.24 * sin(vUv.y * 36.0 - uTime * 39.0);
    float alpha = core * surge * uOpacity;
    if (alpha < 0.012) discard;
    gl_FragColor = vec4(uColor * (1.0 + core * 0.28), min(0.97, alpha));
  }
`;
const PLASMA_VERTEX = /* glsl */ `
  varying vec3 vPosition;
  varying vec3 vNormal;
  void main() {
    vPosition = position;
    vNormal = normal;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
const PLASMA_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform float uAlpha;
  varying vec3 vPosition;
  varying vec3 vNormal;
  void main() {
    float veins = sin(vPosition.x * 18.0 + uTime * 16.0 + sin(vPosition.z * 11.0) * 2.4);
    veins *= sin(vPosition.y * 24.0 - uTime * 13.0 + vPosition.x * 7.0);
    float turbulence = sin(vPosition.z * 37.0 + uTime * 19.0);
    float fractures = max(0.0, veins * 0.5 + turbulence * 0.25 + 0.22);
    fractures = pow(fractures, 2.5);
    float rim = pow(1.0 - abs(dot(normalize(vNormal), normalize(-vPosition + vec3(0.01, 0.08, 0.2)))), 1.9);
    float alpha = uAlpha * (fractures * 0.46 + rim * 0.18);
    if (alpha < 0.015) discard;
    vec3 purple = vec3(0.37, 0.12, 1.0);
    vec3 cyan = vec3(0.44, 0.86, 1.0);
    gl_FragColor = vec4(mix(purple, cyan, fractures * 0.7), min(0.65, alpha));
  }
`;

interface ArcLayer {
  readonly mesh: THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>;
  readonly buffer: THREE.BufferAttribute;
  readonly width: number;
}
interface Missile {
  readonly node: THREE.Group;
  readonly layers: ArcLayer[];
  readonly start: THREE.Vector3;
  readonly control: THREE.Vector3;
  readonly impact: THREE.Vector3;
  target: THREE.Object3D | null;
  readonly launchAt: number;
  readonly flightTime: number;
  arrived: boolean;
}

export interface PrismFinisherOptions {
  readonly start: THREE.Vector3;
  readonly endpoint: THREE.Vector3;
  readonly targets: readonly THREE.Object3D[];
  readonly isTargetAlive?: (target: THREE.Object3D) => boolean;
}

function makeArcGeometry(): { geometry: THREE.BufferGeometry; buffer: THREE.BufferAttribute } {
  const geometry = new THREE.BufferGeometry();
  const buffer = new THREE.BufferAttribute(new Float32Array((ARC_STEPS + 1) * 2 * 3), 3);
  geometry.setAttribute('position', buffer);
  const uv = new Float32Array((ARC_STEPS + 1) * 4);
  for (let i = 0; i <= ARC_STEPS; i++) {
    uv[i * 4] = 0;
    uv[i * 4 + 1] = i / ARC_STEPS;
    uv[i * 4 + 2] = 1;
    uv[i * 4 + 3] = i / ARC_STEPS;
  }
  geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  const indices: number[] = [];
  for (let i = 0; i < ARC_STEPS; i++) {
    const k = i * 2;
    indices.push(k, k + 1, k + 2, k + 1, k + 3, k + 2);
  }
  geometry.setIndex(indices);
  return { geometry, buffer };
}

function laserLayer(width: number, color: number, opacity: number): ArcLayer {
  const { geometry, buffer } = makeArcGeometry();
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uOpacity: { value: opacity },
      uColor: { value: new THREE.Color(color) },
    },
    vertexShader: ARC_VERTEX,
    fragmentShader: ARC_FRAGMENT,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    depthTest: true,
    side: THREE.DoubleSide,
    toneMapped: false,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;
  mesh.renderOrder = 10;
  return { mesh, buffer, width };
}

function bezier(m: Missile, t: number, out: THREE.Vector3): THREE.Vector3 {
  const inv = 1 - t;
  return out.copy(m.start).multiplyScalar(inv * inv)
    .addScaledVector(m.control, inv * t * 2)
    .addScaledVector(m.impact, t * t);
}

const FRAGMENT_COUNT = 56;
const ARC_RAY_COUNT = 36;

/** One effect object owns the whole finisher and is safely recycled by VFXPool. */
export class PrismaticFinisherEffect implements PoolableVFX {
  public active = false;
  public readonly group = new THREE.Group();
  private readonly missiles: Missile[] = [];
  private readonly trails: PooledParticleCloud;
  private readonly impactParticles: PooledParticleCloud;
  private readonly afterglow: PooledParticleCloud;
  private readonly explosiveField = new PrismaticExplosionField();
  private readonly activeMissileCount: number;
  private tertiaryBurst = false;
  private readonly burst: THREE.Sprite;
  private readonly corona: THREE.Sprite;
  private readonly horizontalFlash: THREE.Sprite;
  private readonly plasma: THREE.Mesh<THREE.SphereGeometry, THREE.ShaderMaterial>;
  private readonly shockwave: THREE.Mesh<THREE.TorusGeometry, THREE.MeshBasicMaterial>;
  private readonly shockFragments: Array<THREE.Mesh<THREE.TorusGeometry, THREE.MeshBasicMaterial>> = [];
  private readonly rays: THREE.LineSegments<THREE.BufferGeometry, THREE.LineBasicMaterial>;
  private readonly rayPositions = new THREE.Float32BufferAttribute(new Float32Array(ARC_RAY_COUNT * 6), 3);
  private readonly fragments: THREE.InstancedMesh<THREE.TetrahedronGeometry, THREE.MeshBasicMaterial>;
  private readonly fragmentMatrix = new THREE.Matrix4();
  private readonly fragmentPosition = new THREE.Vector3();
  private readonly fragmentQuat = new THREE.Quaternion();
  private readonly fragmentSize = new THREE.Vector3();
  private readonly source = new THREE.Vector3();
  private readonly ending = new THREE.Vector3();
  private readonly tmp = new THREE.Vector3();
  private aliveCheck: PrismFinisherOptions['isTargetAlive'];
  private age = 0;
  private explosionAge = -1;
  private light: VFXLightHandle | null = null;
  private trailClock = 0;
  private secondaryBurst = false;

  public constructor(
    resources: MageVFXResources,
    private readonly quality: MageVFXQuality,
    private readonly lights: VFXLightPool
  ) {
    this.group.name = 'MagePrismHomingFinisherVFX';
    this.group.visible = false;
    this.activeMissileCount = quality === 'low' ? 12 : quality === 'medium' ? 18 : PRISM_FINISHER.missileCount;
    const spriteMat = (color: number) => new THREE.SpriteMaterial({
      map: resources.softGlow,
      color,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      depthTest: true,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    });
    for (let i = 0; i < PRISM_FINISHER.missileCount; i++) {
      const node = new THREE.Group();
      node.name = 'MagePrismHomingMissile';
      const layers = [
        laserLayer(0.38, i % 2 ? 0x743aff : 0xc420fe, 0.48),
        laserLayer(0.17, i % 2 ? 0xc46cff : 0xff48e3, 0.85),
        laserLayer(0.05, 0xffe9ff, 0.98),
      ];
      for (let k = 0; k < layers.length; k++) {
        layers[k].mesh.name = k === 2 ? 'MagePrismHomingLaserCore' : 'MagePrismHomingLaserGlow';
        node.add(layers[k].mesh);
      }
      node.visible = false;
      this.group.add(node);
      this.missiles.push({
        node, layers,
        start: new THREE.Vector3(),
        control: new THREE.Vector3(),
        impact: new THREE.Vector3(),
        target: null,
        launchAt: 0.13 + i * PRISM_FINISHER.missileInterval,
        flightTime: PRISM_FINISHER.flightTime + (i % 3) * 0.065,
        arrived: false,
      });
    }

    // Sem esfera roxa opaca. Somente nervuras de plasma transparente por ~0,4s.
    this.plasma = new THREE.Mesh(new THREE.SphereGeometry(1, 38, 26), new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uAlpha: { value: 0 } },
      vertexShader: PLASMA_VERTEX,
      fragmentShader: PLASMA_FRAGMENT,
      transparent: true,
      depthWrite: false,
      depthTest: true,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      toneMapped: false,
    }));
    this.plasma.name = 'MagePrismExplosionPlasma';
    this.plasma.frustumCulled = false;
    this.burst = new THREE.Sprite(spriteMat(0xf4faff));
    this.burst.name = 'MagePrismExplosionWhiteCore';
    this.corona = new THREE.Sprite(spriteMat(0x7143ef));
    this.corona.name = 'MagePrismExplosionVioletBloom';
    this.horizontalFlash = new THREE.Sprite(spriteMat(0xffd5ff));
    this.horizontalFlash.name = 'MagePrismExplosionHorizontalFlash';

    // A onda de choque é fragmentada: arcos interrompidos em vez de um anel perfeito.
    this.shockwave = new THREE.Mesh(
      new THREE.TorusGeometry(1, 0.027, 5, 36, Math.PI * 0.65),
      new THREE.MeshBasicMaterial({
        color: 0x8bdcff, transparent: true, opacity: 0, side: THREE.DoubleSide,
        depthWrite: false, depthTest: true, blending: THREE.AdditiveBlending, toneMapped: false,
      })
    );
    this.shockwave.name = 'MagePrismExplosionShockwave';
    this.shockwave.rotation.x = -Math.PI / 2;
    this.shockwave.renderOrder = 7;
    for (let i = 0; i < 18; i++) {
      const arc = new THREE.Mesh(
        new THREE.TorusGeometry(1, 0.012 + (i % 4) * 0.007, 5, 18, 0.17 + (i % 5) * 0.063),
        new THREE.MeshBasicMaterial({
          color: i % 3 ? 0x8f6dff : 0x75eaff,
          transparent: true, opacity: 0,
          depthWrite: false, depthTest: true, blending: THREE.AdditiveBlending, toneMapped: false,
        })
      );
      arc.name = 'MagePrismExplosionBrokenShockwave';
      arc.rotation.x = -Math.PI / 2;
      arc.rotation.z = i * 2.39996;
      arc.renderOrder = 7;
      this.shockFragments.push(arc);
      this.group.add(arc);
    }

    const rayGeometry = new THREE.BufferGeometry();
    rayGeometry.setAttribute('position', this.rayPositions);
    this.rays = new THREE.LineSegments(rayGeometry, new THREE.LineBasicMaterial({
      color: 0xd0a8ff, transparent: true, opacity: 0,
      depthWrite: false, depthTest: true, blending: THREE.AdditiveBlending, toneMapped: false,
    }));
    this.rays.name = 'MagePrismExplosionRadialLightning';
    this.rays.frustumCulled = false;

    this.fragments = new THREE.InstancedMesh(
      new THREE.TetrahedronGeometry(1, 0),
      new THREE.MeshBasicMaterial({
        color: 0xe0b0ff, transparent: true, opacity: 0,
        depthWrite: false, depthTest: true, blending: THREE.AdditiveBlending, toneMapped: false,
      }),
      FRAGMENT_COUNT
    );
    this.fragments.name = 'MagePrismExplosionFragments';
    this.fragments.frustumCulled = false;
    this.trails = new PooledParticleCloud(640, resources.softGlow);
    this.trails.points.name = 'MagePrismLaserTrailParticles';
    this.impactParticles = new PooledParticleCloud(880, resources.impactFlare);
    this.impactParticles.points.name = 'MagePrismExplosionSparks';
    this.afterglow = new PooledParticleCloud(300, resources.softGlow, { blending: 'normal' });
    this.afterglow.points.name = 'MagePrismExplosionSmoke';

    this.group.add(
      this.plasma, this.corona, this.burst, this.horizontalFlash, this.shockwave, this.rays, this.fragments,
      this.explosiveField.group,
      this.trails.points, this.impactParticles.points, this.afterglow.points
    );
    // The old radial spokes and thin circles looked like UI graphics, not force.
    // The new procedural shock sheet and volumetric field replace them.
    this.plasma.visible = false;
    this.shockwave.visible = false;
    this.rays.visible = false;
    for (const arc of this.shockFragments) arc.visible = false;
  }

  public play(options: PrismFinisherOptions): void {
    this.reset();
    this.group.visible = true;
    this.source.copy(options.start);
    this.ending.copy(options.endpoint);
    this.aliveCheck = options.isTargetAlive;
    const targets = options.targets;
    const axis = this.tmp.subVectors(this.ending, this.source);
    const side = new THREE.Vector3(-axis.z, 0, axis.x);
    if (side.lengthSq() < 1e-5) side.set(1, 0, 0);
    side.normalize();
    for (let i = 0; i < this.missiles.length; i++) {
      const missile = this.missiles[i];
      missile.target = targets.length ? targets[i % targets.length] : null;
      missile.arrived = false;
      missile.node.visible = false;
      missile.start.copy(this.source);
      missile.start.y += 0.08 + (i % 2) * 0.1;
      const direction = i % 2 === 0 ? 1 : -1;
      missile.control.copy(this.source).lerp(this.ending, 0.42)
        .addScaledVector(side, direction * (1.35 + (i % 7) * 0.42));
      missile.control.y += 0.35 + (i % 6) * 0.26;
      missile.impact.copy(this.ending);
      if (missile.target) this.aimTarget(missile.target, missile.impact);
      for (const layer of missile.layers) layer.mesh.material.uniforms.uOpacity.value = 0;
    }
  }

  private aimTarget(target: THREE.Object3D, out: THREE.Vector3): void {
    target.getWorldPosition(out);
    out.y += 0.95 * (Number(target.userData.enemyBodyScale) || 1);
  }

  /** Curved laser section whose glowing tail follows its travelling tip. */
  private renderLaser(missile: Missile, index: number, u: number): void {
    const lead = THREE.MathUtils.clamp(u, 0, 1);
    // Long-lived curved energy ribbon, not a tiny flying dot.
    const tail = Math.max(0, lead - 0.72);
    bezier(missile, lead, TMP_A);
    missile.node.position.copy(TMP_A);
    for (let k = 0; k < missile.layers.length; k++) {
      const layer = missile.layers[k];
      const positions = layer.buffer;
      const amplitude = k === 0 ? 0.085 : (k === 1 ? 0.055 : 0.015);
      for (let step = 0; step <= ARC_STEPS; step++) {
        const fraction = step / ARC_STEPS;
        const t = tail + (lead - tail) * fraction;
        bezier(missile, t, TMP_B);
        const ta = Math.max(0, t - 0.015);
        const tb = Math.min(1, t + 0.015);
        bezier(missile, ta, TMP_C);
        TMP_SIDE.subVectors(TMP_B, TMP_C).cross(UP);
        if (TMP_SIDE.lengthSq() < 1e-6) TMP_SIDE.set(1, 0, 0);
        TMP_SIDE.normalize();
        const jag = Math.sin(t * 56 - this.age * 29 + index * 2.7 + k * 0.8);
        const envelope = Math.sin(Math.PI * fraction);
        const tipTaper = Math.min(1, fraction * 7, (1 - fraction) * 6);
        const width = layer.width * Math.max(0.012, tipTaper) * (0.78 + 0.22 * jag);
        TMP_B.addScaledVector(TMP_SIDE, jag * amplitude * envelope);
        const localX = TMP_B.x - missile.node.position.x;
        const localY = TMP_B.y - missile.node.position.y
          + Math.cos(t * 38 + this.age * 21 + index) * amplitude * 0.35 * envelope;
        const localZ = TMP_B.z - missile.node.position.z;
        positions.setXYZ(step * 2,
          localX - TMP_SIDE.x * width, localY - TMP_SIDE.y * width, localZ - TMP_SIDE.z * width);
        positions.setXYZ(step * 2 + 1,
          localX + TMP_SIDE.x * width, localY + TMP_SIDE.y * width, localZ + TMP_SIDE.z * width);
      }
      positions.needsUpdate = true;
      layer.mesh.material.uniforms.uTime.value = this.age + index * 0.18;
      layer.mesh.material.uniforms.uOpacity.value =
        (k === 0 ? 0.55 : k === 1 ? 0.98 : 1.0) * Math.min(1, u * 9);
    }
  }

  public detonate(position: THREE.Vector3): void {
    if (this.explosionAge >= 0) return;
    this.ending.copy(position);
    this.explosionAge = 0;
    this.secondaryBurst = false;
    this.tertiaryBurst = false;
    this.explosiveField.detonate(position);
    for (const missile of this.missiles) missile.node.visible = false;
    this.burst.position.copy(position);
    this.corona.position.copy(position);
    this.horizontalFlash.position.copy(position);
    this.plasma.position.copy(position);
    this.shockwave.position.copy(position).addScaledVector(UP, -0.82);
    for (const arc of this.shockFragments) arc.position.copy(this.shockwave.position);
    this.light = this.lights.acquire();
    if (this.light) {
      this.light.light.position.copy(position);
      // A primeira fração de segundo é branco-azulada; violeta entra no residual.
      this.light.light.color.set(0xd7eeff);
      this.light.light.distance = 12;
      this.light.light.intensity = 0;
    }
    // A referência abre com faíscas pequenas no anel, antes da ruptura.
    this.impactParticles.add(position, {
      color: 0xd486ff, count: qualityCount(25, this.quality, {
        low: 0.4, medium: 0.7, high: 1, ultra: 1.15,
      }),
      speed: 1.3, spread: 0.42, lifetime: 0.3,
      upwardBias: 0.3, opacity: 0.58, size: [0.4, 1.4],
    });
  }

  public update(delta: number): boolean {
    const elapsed = Math.max(0, delta);
    this.age += elapsed;
    this.trailClock += elapsed;
    this.trails.update(elapsed);
    this.impactParticles.update(elapsed);
    this.afterglow.update(elapsed);
    if (this.explosionAge < 0) {
      const emitTrail = this.trailClock >= 0.07;
      if (emitTrail) this.trailClock = 0;
      for (let i = 0; i < this.missiles.length; i++) {
        const missile = this.missiles[i];
        if (i >= this.activeMissileCount) continue;
        const t = (this.age - missile.launchAt) / missile.flightTime;
        if (t < 0 || missile.arrived) continue;
        if (t >= 1) {
          missile.node.visible = false;
          missile.arrived = true;
          if (missile.target && (!this.aliveCheck || this.aliveCheck(missile.target))) {
            this.aimTarget(missile.target, missile.impact);
          }
          this.impactParticles.add(missile.impact, {
            color: 0xb56aff, count: 12, speed: 2.1, spread: 0.65,
            lifetime: 0.24, size: [0.65, 1.6], opacity: 0.65,
          });
          continue;
        }
        if (missile.target && (!this.aliveCheck || this.aliveCheck(missile.target))) {
          this.aimTarget(missile.target, missile.impact);
        }
        missile.node.visible = true;
        this.renderLaser(missile, i, THREE.MathUtils.smoothstep(t, 0, 1));
        if (emitTrail) this.trails.add(missile.node.position, {
          color: i % 2 ? 0xad73ff : 0xf477db,
          count: qualityCount(4, this.quality, { low: 0.4, medium: 0.66, high: 1, ultra: 1.12 }),
          speed: 0.65, spread: 0.34, lifetime: 0.43,
          opacity: 0.78, size: [0.5, 1.5], growth: -0.67,
        });
      }
      return this.age < 4;
    }

    this.explosionAge += elapsed;
    this.explosiveField.update(this.explosionAge);
    const t = this.explosionAge;
    const p = THREE.MathUtils.clamp(t / PRISM_FINISHER.explosionSeconds, 0, 1);
    // A sequência replica o vídeo: carga rosa -> flash branco -> vórtice -> resíduo.
    const flash = Math.exp(-Math.pow((t - 0.31) * 16, 2));
    const charge = 1 - THREE.MathUtils.smoothstep(t, 0.19, 0.37);
    const vortex = THREE.MathUtils.smoothstep(t, 0.24, 0.42)
      * (1 - THREE.MathUtils.smoothstep(t, 1.0, 1.52));
    const shock = THREE.MathUtils.smoothstep(t, 0.23, 0.35)
      * (1 - THREE.MathUtils.smoothstep(t, 0.39, 0.68));
    const after = (1 - THREE.MathUtils.smoothstep(t, 0.92, 1.52))
      * THREE.MathUtils.smoothstep(t, 0.29, 0.49);
    (this.burst.material as THREE.SpriteMaterial).opacity = 0.47 * charge + 0.96 * flash + 0.55 * vortex;
    (this.corona.material as THREE.SpriteMaterial).opacity = 0.37 * charge + 0.48 * vortex;
    (this.horizontalFlash.material as THREE.SpriteMaterial).opacity = 0.93 * flash;
    this.burst.scale.setScalar(0.55 * charge + 1.45 * flash + 1.95 * vortex);
    this.corona.scale.setScalar(1.0 + 2.35 * vortex);
    this.horizontalFlash.scale.set(5.2 + flash * 2.3, 0.22 + 0.15 * flash, 1);
    this.plasma.scale.setScalar(0.35 + p * 2.9);
    this.plasma.material.uniforms.uTime.value = this.age;
    this.plasma.material.uniforms.uAlpha.value = 0;
    this.shockwave.material.opacity = 0;
    const shockRadius = 0.24 + PRISM_FINISHER.explosionRadius * Math.pow(Math.min(1, p * 3.1), 0.82);
    this.shockwave.scale.setScalar(shockRadius);
    for (let i = 0; i < this.shockFragments.length; i++) {
      const arc = this.shockFragments[i];
      arc.scale.setScalar(shockRadius * (0.76 + 0.045 * (i % 6)));
      arc.rotation.z = i * 2.39996 + p * 0.22 * (i % 2 ? 1 : -1);
      arc.material.opacity = 0;
    }
    this.rays.material.opacity = 0;
    const rayRadius = 0.1 + 4.6 * Math.min(1, p * 3.0);
    for (let i = 0; i < ARC_RAY_COUNT; i++) {
      const angle = i * 2.399963 + Math.sin(i * 7.2) * 0.33;
      const radius = rayRadius * (0.57 + (i % 9) * 0.052);
      const at = i * 6;
      const tilt = Math.sin(i * 3.6) * 0.3;
      this.rayPositions.setXYZ(i * 2,
        this.ending.x + Math.cos(angle) * radius * 0.34,
        this.ending.y + tilt * radius * 0.34,
        this.ending.z + Math.sin(angle) * radius * 0.34);
      this.rayPositions.setXYZ(i * 2 + 1,
        this.ending.x + Math.cos(angle + 0.12) * radius,
        this.ending.y + tilt * radius,
        this.ending.z + Math.sin(angle + 0.12) * radius);
      void at;
    }
    this.rayPositions.needsUpdate = true;
    this.fragments.material.opacity = 0.85 * after;
    for (let i = 0; i < FRAGMENT_COUNT; i++) {
      const angle = i * 2.399963;
      // Fragmentos saem rápido, com assimetria e sem formar outra esfera.
      const radius = (0.12 + (1 - Math.exp(-t * 8.5)) * 4.5)
        * (0.42 + (i % 9) * 0.082);
      this.fragmentPosition.set(
        this.ending.x + Math.cos(angle) * radius,
        this.ending.y + Math.sin(angle * 2.3) * radius * 0.33,
        this.ending.z + Math.sin(angle) * radius
      );
      this.fragmentQuat.setFromAxisAngle(UP, angle + p * 11);
      const size = (0.018 + (i % 5) * 0.011) * after;
      this.fragmentSize.set(size * 0.7, size * 2.5, size * 0.68);
      this.fragmentMatrix.compose(this.fragmentPosition, this.fragmentQuat, this.fragmentSize);
      this.fragments.setMatrixAt(i, this.fragmentMatrix);
    }
    this.fragments.instanceMatrix.needsUpdate = true;
    if (!this.secondaryBurst && t > 0.30) {
      this.secondaryBurst = true;
      // Descarga branca comprimida seguida do giro violeta da referência.
      this.impactParticles.add(this.ending, {
        color: 0xf9edff, count: qualityCount(170, this.quality, {
          low: 0.35, medium: 0.63, high: 1, ultra: 1.12,
        }),
        speed: 6.8, spread: 0.87, lifetime: 0.72,
        upwardBias: 0.2, opacity: 0.88, size: [0.65, 2.4], growth: -0.7,
      });
    }
    if (!this.tertiaryBurst && t > 0.76) {
      this.tertiaryBurst = true;
      this.impactParticles.add(this.ending, {
        color: 0xae7dff, count: qualityCount(95, this.quality, {
          low: 0.3, medium: 0.62, high: 1, ultra: 1.12,
        }),
        speed: 3.3, spread: 0.83, lifetime: 0.68,
        opacity: 0.62, size: [0.55, 1.9], growth: -0.65,
      });
      this.afterglow.add(this.ending, {
        color: 0x4d397b, count: qualityCount(42, this.quality, {
          low: 0.3, medium: 0.6, high: 1, ultra: 1.12,
        }),
        speed: 0.9, spread: 0.8, lifetime: 0.66,
        upwardBias: 0.2, growth: 0.45, opacity: 0.06, size: [1.0, 2.4],
      });
    }
    if (this.light) {
      this.light.light.color.set(t < 0.38 ? 0xf1d7ff : 0x9f63ee);
      this.light.light.intensity = 7.2 * flash + 0.6 * charge + 1.5 * vortex + 1.0 * shock;
    }
    return this.explosionAge < PRISM_FINISHER.explosionSeconds;
  }

  public reset(): void {
    this.group.visible = false;
    this.group.removeFromParent();
    this.age = 0;
    this.trailClock = 0;
    this.explosionAge = -1;
    this.secondaryBurst = false;
    this.tertiaryBurst = false;
    this.explosiveField.reset();
    this.aliveCheck = undefined;
    for (const missile of this.missiles) {
      missile.node.visible = false;
      for (const layer of missile.layers) layer.mesh.material.uniforms.uOpacity.value = 0;
    }
    this.trails.reset();
    this.impactParticles.reset();
    this.afterglow.reset();
    (this.burst.material as THREE.SpriteMaterial).opacity = 0;
    (this.corona.material as THREE.SpriteMaterial).opacity = 0;
    (this.horizontalFlash.material as THREE.SpriteMaterial).opacity = 0;
    this.plasma.material.uniforms.uAlpha.value = 0;
    this.shockwave.material.opacity = 0;
    for (const arc of this.shockFragments) arc.material.opacity = 0;
    this.rays.material.opacity = 0;
    this.fragments.material.opacity = 0;
    this.light?.release();
    this.light = null;
  }

  public dispose(): void {
    this.reset();
    for (const missile of this.missiles) {
      for (const layer of missile.layers) {
        layer.mesh.geometry.dispose();
        layer.mesh.material.dispose();
      }
    }
    this.plasma.geometry.dispose();
    this.plasma.material.dispose();
    this.shockwave.geometry.dispose();
    this.shockwave.material.dispose();
    for (const arc of this.shockFragments) {
      arc.geometry.dispose();
      arc.material.dispose();
    }
    this.rays.geometry.dispose();
    this.rays.material.dispose();
    this.fragments.geometry.dispose();
    this.fragments.material.dispose();
    (this.burst.material as THREE.Material).dispose();
    (this.corona.material as THREE.Material).dispose();
    (this.horizontalFlash.material as THREE.Material).dispose();
    this.trails.dispose();
    this.impactParticles.dispose();
    this.afterglow.dispose();
    this.explosiveField.dispose();
  }
}
