import * as THREE from 'three';

/**
 * Raio Prismático - descarga final, baseada na sequência da referência:
 * 0.00-0.20s: anel magenta e descargas ciano;
 * 0.20-0.38s: colapso branco e flash horizontal;
 * 0.30-1.20s: três espirais luminosas girando sobre um núcleo branco;
 * 1.20-1.65s: plasma e faíscas se dissipam.
 *
 * O efeito é planar com espirais a diferentes alturas. Não existe cúpula
 * translúcida grande nem esfera que cresce como escudo.
 */
const QUAD_VERTEX = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const VORTEX_FRAGMENT = /* glsl */ `
  precision highp float;
  uniform float uTime;
  uniform float uOpacity;
  varying vec2 vUv;

  void main() {
    vec2 uv = (vUv - vec2(0.5)) * 2.0;
    float radius = length(uv);
    float angle = atan(uv.y, uv.x);
    float t = max(0.0, uTime);
    float open = smoothstep(0.19, 0.39, t);
    float fade = 1.0 - smoothstep(1.04, 1.48, t);

    // No início só há o aro magenta e um ponto de plasma vibrante.
    float charge = 1.0 - smoothstep(0.18, 0.32, t);
    float edgeWarp = 0.025 * sin(angle * 13.0 + t * 13.0)
      + 0.017 * sin(angle * 29.0 - t * 18.0);
    float chargeRing = exp(-pow((radius - 0.70 - edgeWarp) * 48.0, 2.0));
    float chargeSparks = pow(max(0.0, sin(angle * 24.0 - t * 26.0)), 11.0);
    chargeRing *= 0.54 + 0.35 * chargeSparks;

    // Em vez de uma bolha, são três fitas de plasma espiraladas.
    float age = max(0.0, t - 0.23);
    float expansion = 0.6 + 0.4 * (1.0 - exp(-age * 6.0));
    float ripple = sin(angle * 9.0 - age * 27.0 + sin(angle * 3.0) * 0.9);
    float ribbonA = exp(-pow(
      (radius - (0.29 + 0.044 * sin(angle * 4.0 - age * 13.0)) * expansion
      - 0.032 * ripple) * 30.0, 2.0));
    float ribbonB = exp(-pow(
      (radius - (0.49 + 0.065 * sin(angle * 3.0 + age * 10.0)) * expansion
      - 0.024 * sin(angle * 13.0 - age * 30.0)) * 26.0, 2.0));
    float ribbonC = exp(-pow(
      (radius - (0.71 + 0.054 * sin(angle * 5.0 - age * 9.0)) * expansion
      - 0.017 * sin(angle * 21.0 + age * 18.0)) * 25.0, 2.0));
    float sparkNoise = pow(max(0.0, sin(angle * 37.0 + radius * 45.0 - age * 30.0)), 10.0);
    float crackle = 0.75 + 0.25 * sparkNoise;
    float ribbons = (ribbonA * 1.05 + ribbonB * 0.85 + ribbonC * 0.7) * crackle;

    // Chamas magenta fragmentadas que escapam da espiral externa.
    float flames = exp(-pow((radius - 0.77 - 0.055 * sin(angle * 11.0 - age * 15.0))
      * 17.0, 2.0)) * pow(max(0.0, sin(angle * 23.0 - age * 12.0)), 7.0);
    float whiteCore = exp(-radius * radius * 31.0)
      * (0.64 + 0.36 * sin(age * 26.0));
    float chargeCore = exp(-radius * radius * 66.0) * charge * 0.8;
    float energy = charge * (chargeRing + chargeCore)
      + open * fade * (ribbons + flames * 0.46 + whiteCore * 1.45);

    // Cor branca no centro, magenta no aro externo, lilás-ciano entre eles.
    vec3 violet = vec3(0.55, 0.13, 1.25);
    vec3 lilac = vec3(0.91, 0.49, 1.22);
    vec3 cyan = vec3(0.64, 0.93, 1.35);
    vec3 tint = mix(violet, lilac, clamp(1.0 - radius, 0.0, 1.0));
    tint = mix(tint, cyan, 0.38 * ribbonA + 0.22 * ribbonB);
    tint = mix(tint, vec3(1.5, 1.48, 1.59),
      clamp(whiteCore * open * fade * 1.15, 0.0, 1.0));

    float alpha = min(0.97, max(0.0, energy * uOpacity));
    alpha *= 1.0 - smoothstep(0.90, 1.04, radius);
    if (alpha < 0.009) discard;
    gl_FragColor = vec4(tint, alpha);
  }
`;

const SHOCK_FRAGMENT = /* glsl */ `
  precision highp float;
  uniform float uTime;
  uniform float uOpacity;
  varying vec2 vUv;
  void main() {
    vec2 uv = (vUv - vec2(0.5)) * 2.0;
    float r = length(uv);
    float a = atan(uv.y, uv.x);
    float t = max(0.0, uTime);
    float expand = 0.15 + 0.78 * (1.0 - exp(-max(0.0, t - 0.22) * 13.0));
    float irregular = 0.03 * sin(a * 9.0 + t * 17.0)
      + 0.019 * sin(a * 29.0 - t * 24.0);
    float broken = smoothstep(0.08, 0.8,
      0.4 + 0.35 * sin(a * 17.0) + 0.25 * sin(a * 37.0 + 1.5));
    float wave = exp(-pow((r - expand - irregular) * 45.0, 2.0)) * broken;
    float alpha = wave * uOpacity;
    if (alpha < 0.009) discard;
    gl_FragColor = vec4(mix(vec3(0.35, 0.56, 1.1), vec3(0.8, 0.4, 1.2), broken), alpha);
  }
`;

const SHELL_VERTEX = /* glsl */ `
  varying vec3 vPosition;
  void main() {
    vPosition = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
const SHELL_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform float uOpacity;
  varying vec3 vPosition;
  void main() {
    float breaks = pow(max(0.0, sin(vPosition.x * 19.0 + uTime * 21.0)
      * sin(vPosition.y * 27.0 - uTime * 17.0)), 4.0);
    float opacity = uOpacity * breaks;
    if (opacity < 0.01) discard;
    gl_FragColor = vec4(0.73, 0.81, 1.25, opacity);
  }
`;

type FloatUniforms = Record<string, { value: number }>;
function plasmaShader(uniforms: FloatUniforms, vert: string, frag: string): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms,
    vertexShader: vert,
    fragmentShader: frag,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    toneMapped: false,
  });
}

const ARC_COUNT = 24;
const JET_COUNT = 52;
const UP = new THREE.Vector3(0, 1, 0);

export class PrismaticExplosionField {
  public readonly group = new THREE.Group();
  /** Very brief, broken shockfront - subordinate to the vortex. */
  public readonly ground: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  /** Reference's bright, flat rotating magenta-white plasma vortex. */
  public readonly vortex: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  /** Kept small: never forms a large opaque bubble. */
  public readonly volume: THREE.Mesh<THREE.SphereGeometry, THREE.ShaderMaterial>;
  public readonly corona: THREE.Mesh<THREE.SphereGeometry, THREE.ShaderMaterial>;
  private readonly orbitArcs: THREE.Mesh<THREE.TorusGeometry, THREE.MeshBasicMaterial>[] = [];
  private readonly sparkArc: THREE.LineSegments<THREE.BufferGeometry, THREE.LineBasicMaterial>;
  private readonly sparkPositions = new THREE.Float32BufferAttribute(
    new Float32Array(ARC_COUNT * 2 * 3), 3
  );
  private readonly rupture: THREE.InstancedMesh<THREE.ConeGeometry, THREE.MeshBasicMaterial>;
  private readonly rupturePosition = new THREE.Vector3();
  private readonly ruptureDirection = new THREE.Vector3();
  private readonly ruptureQuaternion = new THREE.Quaternion();
  private readonly ruptureSize = new THREE.Vector3();
  private readonly ruptureMatrix = new THREE.Matrix4();

  public constructor() {
    this.group.name = 'MagePrismaticFinalExplosionField';
    this.group.visible = false;

    this.ground = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), plasmaShader({
      uTime: { value: 0 }, uOpacity: { value: 0 }
    }, QUAD_VERTEX, SHOCK_FRAGMENT));
    this.ground.name = 'MagePrismShockFront';
    this.ground.rotation.x = -Math.PI / 2;
    this.ground.frustumCulled = false;
    this.ground.renderOrder = 8;

    this.vortex = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), plasmaShader({
      uTime: { value: 0 }, uOpacity: { value: 0 }
    }, QUAD_VERTEX, VORTEX_FRAGMENT));
    this.vortex.name = 'MagePrismSpiralVortex';
    this.vortex.rotation.x = -Math.PI / 2;
    this.vortex.frustumCulled = false;
    this.vortex.renderOrder = 9;

    this.volume = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 14),
      plasmaShader({ uTime: { value: 0 }, uOpacity: { value: 0 } }, SHELL_VERTEX, SHELL_FRAGMENT));
    this.volume.name = 'MagePrismVolumetricBlast';
    this.volume.frustumCulled = false;
    this.corona = new THREE.Mesh(new THREE.SphereGeometry(1, 18, 12),
      plasmaShader({ uTime: { value: 0 }, uOpacity: { value: 0 } }, SHELL_VERTEX, SHELL_FRAGMENT));
    this.corona.name = 'MagePrismElectricAftershock';
    this.corona.frustumCulled = false;

    const arcs = new THREE.BufferGeometry();
    arcs.setAttribute('position', this.sparkPositions);
    this.sparkArc = new THREE.LineSegments(arcs, new THREE.LineBasicMaterial({
      color: 0xb5efff,
      transparent: true,
      opacity: 0,
      depthTest: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    }));
    this.sparkArc.name = 'MagePrismBrokenLightningArcs';
    this.sparkArc.frustumCulled = false;
    this.sparkArc.renderOrder = 11;

    // Three staggered, partial 3D orbits add volume while the shader supplies
    // animated, irregular inner plasma (same silhouette as the reference).
    const colors = [0xec8eff, 0xcbd7ff, 0x966aff];
    for (let i = 0; i < 3; i++) {
      const mesh = new THREE.Mesh(
        new THREE.TorusGeometry(0.58 + i * 0.28, 0.022 + i * 0.007, 6, 66,
          Math.PI * (1.35 + i * 0.11)),
        new THREE.MeshBasicMaterial({
          color: colors[i],
          transparent: true,
          opacity: 0,
          depthWrite: false,
          depthTest: true,
          blending: THREE.AdditiveBlending,
          toneMapped: false,
        })
      );
      mesh.name = 'MagePrismSpiralEnergyOrbit';
      mesh.rotation.x = -Math.PI / 2;
      mesh.renderOrder = 10;
      this.orbitArcs.push(mesh);
      this.group.add(mesh);
    }

    this.rupture = new THREE.InstancedMesh(
      new THREE.ConeGeometry(0.065, 1, 5, 1),
      new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0,
        depthTest: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
      }),
      JET_COUNT
    );
    this.rupture.name = 'MagePrismLaserRuptureJets';
    this.rupture.frustumCulled = false;
    for (let i = 0; i < JET_COUNT; i++) {
      this.rupture.setColorAt(i, new THREE.Color(
        i % 7 < 3 ? 0xd7faff : i % 7 < 5 ? 0xf7a8ff : 0x916fff
      ));
    }
    if (this.rupture.instanceColor) this.rupture.instanceColor.needsUpdate = true;
    this.group.add(this.ground, this.vortex, this.volume, this.corona, this.sparkArc, this.rupture);
  }

  public detonate(position: THREE.Vector3): void {
    this.group.visible = true;
    this.group.position.copy(position);
    const groundOffset = -Math.min(1.08, Math.max(0.05, position.y - 0.08));
    this.ground.position.set(0, groundOffset, 0);
    this.vortex.position.set(0, groundOffset + 0.045, 0);
    this.volume.position.set(0, groundOffset + 0.22, 0);
    this.corona.position.copy(this.volume.position);
    this.update(0);
  }

  public update(time: number): void {
    const t = Math.max(0, time);
    const charge = 1 - THREE.MathUtils.smoothstep(t, 0.17, 0.34);
    const flash = Math.exp(-Math.pow((t - 0.30) * 14, 2));
    const vortexIn = THREE.MathUtils.smoothstep(t, 0.23, 0.44);
    const vortexOut = 1 - THREE.MathUtils.smoothstep(t, 1.05, 1.52);
    const swirl = vortexIn * vortexOut;
    const shock = THREE.MathUtils.smoothstep(t, 0.22, 0.31)
      * (1 - THREE.MathUtils.smoothstep(t, 0.33, 0.53));

    this.vortex.material.uniforms.uTime.value = t;
    this.vortex.material.uniforms.uOpacity.value = (0.90 * charge + 1.1 * swirl + 0.2 * flash);
    this.vortex.scale.setScalar(3.4 * (0.72 + 0.28 * Math.min(1, t / 0.5)));

    this.ground.material.uniforms.uTime.value = t;
    this.ground.material.uniforms.uOpacity.value = 0.68 * shock;
    this.ground.scale.setScalar(4.15);

    // Short corona never turns into an inflating shield.
    const blastFade = 1 - THREE.MathUtils.smoothstep(t, 0.34, 0.50);
    this.volume.material.uniforms.uTime.value = t;
    this.volume.material.uniforms.uOpacity.value = 0.22 * flash * blastFade;
    this.volume.scale.set(0.35 + 0.55 * flash, 0.18 + 0.28 * flash, 0.35 + 0.55 * flash);
    this.corona.material.uniforms.uTime.value = t * 1.4;
    this.corona.material.uniforms.uOpacity.value = 0.11 * flash;
    this.corona.scale.set(0.48 + 0.5 * flash, 0.23 + 0.3 * flash, 0.48 + 0.5 * flash);

    for (let i = 0; i < this.orbitArcs.length; i++) {
      const arc = this.orbitArcs[i];
      arc.position.copy(this.vortex.position);
      arc.position.y += 0.075 + i * 0.065;
      arc.rotation.z = t * (i % 2 ? -3.8 : 5.5) + i * 1.7;
      arc.scale.setScalar((0.54 + i * 0.31) * (0.58 + 0.42 * Math.min(1, t / 0.5)));
      arc.material.opacity = (0.36 - i * 0.05) * swirl;
    }

    // Electric lashes begin BEFORE the flash (white/cyan) and then dance along
    // the spiral. Geometry is a handful of short, non-uniform 3D segments.
    for (let i = 0; i < ARC_COUNT; i++) {
      const a = i * 2.399963 + t * (i % 2 ? -8 : 9);
      const initialRadius = 0.38 + (i % 6) * 0.2;
      const laterRadius = 0.72 + (i % 8) * 0.31;
      const radius = THREE.MathUtils.lerp(initialRadius, laterRadius, vortexIn);
      const y = this.vortex.position.y + 0.08 + 0.07 * (i % 4);
      this.sparkPositions.setXYZ(i * 2,
        Math.cos(a) * radius * 0.65,
        y + Math.sin(i * 7 + t * 22) * 0.25,
        Math.sin(a) * radius * 0.65);
      this.sparkPositions.setXYZ(i * 2 + 1,
        Math.cos(a + 0.15) * (radius + 0.65),
        y + 0.28 + Math.sin(i * 11 + t * 24) * 0.62,
        Math.sin(a + 0.15) * (radius + 0.65));
    }
    this.sparkPositions.needsUpdate = true;
    this.sparkArc.material.opacity = (0.75 * charge + 0.55 * swirl) * (1 - THREE.MathUtils.smoothstep(t, 0.9, 1.4));

    // Outward jets peak on the flash then dissipate into violet sparks.
    const jetIn = THREE.MathUtils.smoothstep(t, 0.20, 0.34);
    const jetOut = 1 - THREE.MathUtils.smoothstep(t, 0.57, 0.96);
    const impulse = jetIn * jetOut;
    this.rupture.material.opacity = 0.64 * impulse;
    for (let i = 0; i < JET_COUNT; i++) {
      const a = i * 2.399963 + Math.sin(i * 1.79) * 0.42;
      const elevation = 0.12 + ((i * 7) % 11) * 0.05;
      const travel = (1 - Math.exp(-Math.max(0, t - 0.24) * 7)) * (1.1 + (i % 9) * 0.28);
      this.ruptureDirection.set(Math.cos(a), elevation, Math.sin(a)).normalize();
      this.rupturePosition.copy(this.ruptureDirection).multiplyScalar(travel);
      this.rupturePosition.y += this.vortex.position.y + 0.2;
      this.ruptureQuaternion.setFromUnitVectors(UP, this.ruptureDirection);
      const width = (0.028 + (i % 4) * 0.011) * impulse;
      const length = (0.38 + (i % 8) * 0.14) * (0.3 + travel * 0.35) * impulse;
      this.ruptureSize.set(width, length, width);
      this.ruptureMatrix.compose(this.rupturePosition, this.ruptureQuaternion, this.ruptureSize);
      this.rupture.setMatrixAt(i, this.ruptureMatrix);
    }
    this.rupture.instanceMatrix.needsUpdate = true;
  }

  public reset(): void {
    // Kept in pooled parent's hierarchy: never remove this group from its owner.
    this.group.visible = false;
    this.ground.material.uniforms.uOpacity.value = 0;
    this.vortex.material.uniforms.uOpacity.value = 0;
    this.volume.material.uniforms.uOpacity.value = 0;
    this.corona.material.uniforms.uOpacity.value = 0;
    this.sparkArc.material.opacity = 0;
    this.rupture.material.opacity = 0;
    for (const arc of this.orbitArcs) arc.material.opacity = 0;
  }

  public dispose(): void {
    this.reset();
    this.ground.geometry.dispose();
    this.ground.material.dispose();
    this.vortex.geometry.dispose();
    this.vortex.material.dispose();
    this.volume.geometry.dispose();
    this.volume.material.dispose();
    this.corona.geometry.dispose();
    this.corona.material.dispose();
    this.sparkArc.geometry.dispose();
    this.sparkArc.material.dispose();
    this.rupture.geometry.dispose();
    this.rupture.material.dispose();
    for (const arc of this.orbitArcs) {
      arc.geometry.dispose();
      arc.material.dispose();
    }
  }
}
