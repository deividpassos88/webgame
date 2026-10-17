import * as THREE from 'three';

/** Procedural multi-layer plasma explosion: no full-screen flat disk textures.
 * The shockfront has irregular outward-moving detail, with an inner
 * incandescent core and a fading 3D ionized cloud.
 */
const PLANE_VERTEX = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
const PLANE_FRAGMENT = /* glsl */ `
  precision highp float;
  uniform float uTime;
  uniform float uPhase;
  uniform float uOpacity;
  varying vec2 vUv;

  float hash(float n) { return fract(sin(n * 17.21) * 43758.5453123); }
  float n2(vec2 p) {
    vec2 i = floor(p); vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(hash(i.x + i.y * 73.0), hash(i.x + 1.0 + i.y * 73.0), f.x),
      mix(hash(i.x + (i.y + 1.0) * 73.0), hash(i.x + 1.0 + (i.y + 1.0) * 73.0), f.x),
      f.y
    );
  }
  void main() {
    vec2 d = (vUv - 0.5) * 2.0;
    float r = length(d);
    float a = atan(d.y, d.x);
    float p = clamp(uPhase, 0.0, 1.0);
    float irregular = sin(a * 13.0 + uTime * 8.0) * 0.025
      + sin(a * 31.0 - uTime * 11.0) * 0.014
      + (n2(vec2(a * 11.0, uTime * 3.2)) - 0.5) * 0.036;
    float front = 0.10 + 0.80 * pow(min(1.0, p * 2.6), 0.82);
    float distanceFromFront = abs(r - front - irregular);
    float shock = exp(-pow(distanceFromFront * (31.0 - p * 4.0), 2.0));
    float filaments = pow(max(0.0, sin(a * 48.0 + r * 31.0 - uTime * 12.0)), 8.0);
    float wave = shock * (0.63 + filaments * 0.45);
    float inner = exp(-r * 8.0) * exp(-p * 16.0);
    float cascading = exp(-abs(r - front * 0.73) * 19.0)
      * (0.22 + 0.25 * sin(a * 19.0 + uTime * 21.0))
      * (1.0 - smoothstep(0.1, 0.76, p));
    float edge = 1.0 - smoothstep(0.88, 1.0, r);
    float alpha = (wave + inner * 0.85 + cascading) * uOpacity * edge;
    if (alpha < 0.008) discard;
    vec3 cyan = vec3(0.30, 0.82, 1.0);
    vec3 violet = vec3(0.62, 0.25, 1.0);
    vec3 hot = vec3(1.25, 1.30, 1.38);
    vec3 color = mix(violet, cyan, clamp(filaments * 0.5 + shock * 0.5, 0.0, 1.0));
    color = mix(color, hot, inner * 0.85);
    gl_FragColor = vec4(color, min(0.97, alpha));
  }
`;

const VOLUME_VERTEX = /* glsl */ `
  uniform float uTime;
  varying vec3 vPos;
  varying vec3 vNormalVS;
  varying vec3 vViewDir;
  void main() {
    vec3 p = position;
    float warp = sin(p.x * 17.0 + p.z * 8.0 + uTime * 17.0)
      * sin(p.y * 19.0 - uTime * 12.0)
      + 0.5 * sin(p.z * 31.0 - p.x * 13.0 + uTime * 23.0);
    p += normal * warp * 0.085;
    vec4 viewPos = modelViewMatrix * vec4(p, 1.0);
    vPos = p;
    vNormalVS = normalize(normalMatrix * normal);
    vViewDir = normalize(-viewPos.xyz);
    gl_Position = projectionMatrix * viewPos;
  }
`;
const VOLUME_FRAGMENT = /* glsl */ `
  precision highp float;
  uniform float uTime;
  uniform float uOpacity;
  varying vec3 vPos;
  varying vec3 vNormalVS;
  varying vec3 vViewDir;
  void main() {
    float veining = sin(vPos.x * 26.0 + uTime * 24.0)
      * sin(vPos.y * 19.0 - uTime * 17.0 + vPos.z * 6.0);
    float branches = sin(vPos.z * 41.0 + vPos.x * 22.0 - uTime * 31.0);
    float turbulence = max(0.0, 0.36 + 0.38 * veining + 0.27 * branches);
    float fresnel = pow(1.0 - max(0.0, dot(normalize(vNormalVS), normalize(vViewDir))), 1.7);
    float cores = pow(turbulence, 3.0);
    float alpha = uOpacity * (0.23 + 0.76 * cores + 0.40 * fresnel);
    if (alpha < 0.012) discard;
    vec3 purple = vec3(0.44, 0.16, 1.0);
    vec3 magenta = vec3(1.0, 0.29, 0.82);
    vec3 cyan = vec3(0.56, 0.93, 1.22);
    vec3 color = mix(purple, magenta, 0.38 + veining * 0.25);
    color = mix(color, cyan, max(cores * 0.8, fresnel * 0.52));
    gl_FragColor = vec4(color, min(0.92, alpha));
  }
`;

function material(uniforms: Record<string, { value: number }>, vertex: string, fragment: string): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms, vertexShader: vertex, fragmentShader: fragment,
    transparent: true, depthTest: true, depthWrite: false,
    side: THREE.DoubleSide, blending: THREE.AdditiveBlending, toneMapped: false,
  });
}

/** Compact but visually dense explosion, drawn as one shock sheet and
 * two thin moving 3D plasma skins rather than a flat radial spoke wheel.
 */
export class PrismaticExplosionField {
  public readonly group = new THREE.Group();
  public readonly ground: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  public readonly volume: THREE.Mesh<THREE.SphereGeometry, THREE.ShaderMaterial>;
  public readonly corona: THREE.Mesh<THREE.SphereGeometry, THREE.ShaderMaterial>;
  private readonly sparkArc: THREE.LineSegments<THREE.BufferGeometry, THREE.LineBasicMaterial>;
  private readonly sparkPositions = new THREE.Float32BufferAttribute(new Float32Array(18 * 2 * 3), 3);

  public constructor() {
    this.group.name = 'MagePrismaticFinalExplosionField';
    this.group.visible = false;
    this.ground = new THREE.Mesh(
      new THREE.PlaneGeometry(2, 2),
      material({
        uTime: { value: 0 }, uPhase: { value: 0 }, uOpacity: { value: 0 },
      }, PLANE_VERTEX, PLANE_FRAGMENT)
    );
    this.ground.name = 'MagePrismShockFront';
    this.ground.rotation.x = -Math.PI / 2;
    this.ground.frustumCulled = false;
    this.ground.renderOrder = 8;
    this.volume = new THREE.Mesh(
      new THREE.SphereGeometry(1, 44, 28),
      material({ uTime: { value: 0 }, uOpacity: { value: 0 } }, VOLUME_VERTEX, VOLUME_FRAGMENT)
    );
    this.volume.name = 'MagePrismVolumetricBlast';
    this.volume.frustumCulled = false;
    this.corona = new THREE.Mesh(
      new THREE.SphereGeometry(1, 26, 18),
      material({ uTime: { value: 0 }, uOpacity: { value: 0 } }, VOLUME_VERTEX, VOLUME_FRAGMENT)
    );
    this.corona.name = 'MagePrismElectricAftershock';
    this.corona.frustumCulled = false;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', this.sparkPositions);
    this.sparkArc = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({
      color: 0xbca7ff, transparent: true, opacity: 0, depthTest: true,
      depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false,
    }));
    this.sparkArc.name = 'MagePrismBrokenLightningArcs';
    this.sparkArc.frustumCulled = false;
    this.group.add(this.ground, this.volume, this.corona, this.sparkArc);
  }

  public detonate(position: THREE.Vector3): void {
    this.group.visible = true;
    this.group.position.copy(position);
    this.ground.position.set(0, -Math.min(1.08, Math.max(0.05, position.y - 0.08)), 0);
    this.volume.position.set(0, 0, 0);
    this.corona.position.set(0, 0, 0);
    this.update(0);
  }

  public update(time: number): void {
    const p = THREE.MathUtils.clamp(time / 1.45, 0, 1);
    const impulse = Math.exp(-p * 8.0);
    const wave = 1 - THREE.MathUtils.smoothstep(p, 0.15, 0.83);
    const volumeFade = Math.exp(-p * 5.3);
    this.ground.material.uniforms.uTime.value = time;
    this.ground.material.uniforms.uPhase.value = p;
    this.ground.material.uniforms.uOpacity.value = 1.45 * wave;
    this.ground.scale.setScalar(5.1);
    this.volume.material.uniforms.uTime.value = time;
    this.volume.material.uniforms.uOpacity.value = 1.03 * volumeFade;
    const rad = 0.24 + 2.9 * (1 - Math.exp(-p * 9.5));
    this.volume.scale.set(rad, rad * 0.76, rad);
    this.corona.material.uniforms.uTime.value = time * 1.43 + 0.47;
    this.corona.material.uniforms.uOpacity.value = 0.71 * Math.exp(-p * 3.5);
    this.corona.scale.setScalar(0.35 + 3.8 * (1 - Math.exp(-p * 5.5)));

    // Local lightning cuts across the shockfront rather than rays/spokes.
    const radius = 0.3 + 3.9 * Math.min(1, p * 2.4);
    for (let i = 0; i < 18; i++) {
      const phase = i * 2.399963 + Math.sin(i * 4.1) * 0.12;
      const base = radius * (0.5 + 0.4 * Math.sin(i * 7.1) ** 2);
      const a = phase + time * (i % 2 ? -1.2 : 1.7);
      const b = a + 0.12 + (i % 5) * 0.035;
      this.sparkPositions.setXYZ(i * 2, Math.cos(a) * base, Math.sin(i * 11.0) * 0.3, Math.sin(a) * base);
      this.sparkPositions.setXYZ(i * 2 + 1, Math.cos(b) * (base + 0.32),
        Math.sin(i * 11.0 + time * 7.0) * 0.44, Math.sin(b) * (base + 0.32));
    }
    this.sparkPositions.needsUpdate = true;
    this.sparkArc.material.opacity = 0.86 * wave + 0.18 * impulse;
  }

  public reset(): void {
    this.group.visible = false;
    this.group.removeFromParent();
    this.ground.material.uniforms.uOpacity.value = 0;
    this.volume.material.uniforms.uOpacity.value = 0;
    this.corona.material.uniforms.uOpacity.value = 0;
    this.sparkArc.material.opacity = 0;
  }

  public dispose(): void {
    this.reset();
    this.ground.geometry.dispose();
    this.ground.material.dispose();
    this.volume.geometry.dispose();
    this.volume.material.dispose();
    this.corona.geometry.dispose();
    this.corona.material.dispose();
    this.sparkArc.geometry.dispose();
    this.sparkArc.material.dispose();
  }
}
