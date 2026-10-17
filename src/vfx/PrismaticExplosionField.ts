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
// O choque rompe em fragmentos desiguais, não em um aro perfeito de escudo.
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
    return mix(mix(hash(i.x+i.y*73.0),hash(i.x+1.0+i.y*73.0),f.x),
      mix(hash(i.x+(i.y+1.0)*73.0),hash(i.x+1.0+(i.y+1.0)*73.0),f.x),f.y);
  }
  void main() {
    vec2 d = (vUv - 0.5) * 2.0;
    float r = length(d);
    float angle = atan(d.y,d.x);
    float t = max(0.0,uTime);
    float p = clamp(uPhase,0.0,1.0);
    float shape = (n2(vec2(angle*19.0,2.0))-0.5)*0.15
      + sin(angle*11.0+4.0)*0.045
      + sin(angle*37.0-t*23.0)*0.023;
    float edge = 0.07 + 0.75*(1.0-exp(-t*17.0));
    float distanceToEdge = abs(r-edge-shape);
    float shock = exp(-pow(distanceToEdge*34.0,2.0));
    // Grandes rachaduras eliminam a circunferência uniforme.
    float cut = n2(vec2(angle*27.0,t*6.0)) * 0.75 +
      0.25 * sin(angle*47.0+t*18.0);
    float broken = smoothstep(0.2,0.64,cut);
    float sparks = pow(max(0.0,sin(angle*49.0-r*30.0+t*36.0)),10.0);
    float fragments = shock * broken * (0.55+0.75*sparks);
    float splinter = exp(-abs(r-edge*0.72)*28.0)
      * pow(max(0.0,sin(angle*23.0+t*35.0)),8.0)*0.34;
    float core = exp(-r*15.0)*exp(-t*34.0);
    float fade = 1.0-smoothstep(0.16,0.43,t);
    float alpha = (fragments+splinter)*fade*uOpacity + core*exp(-t*15.0);
    alpha *= (1.0-smoothstep(0.91,1.01,r));
    if (alpha<0.009) discard;
    vec3 color = mix(vec3(0.47,0.12,0.9),vec3(0.27,0.85,1.15),
      clamp(sparks*0.6+broken*0.35,0.0,1.0));
    color = mix(color,vec3(1.3,1.35,1.4),core);
    gl_FragColor = vec4(color,min(0.94,alpha));
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
    // Rasga a forma do plasma: nenhuma casca perfeitamente esférica.
    p += normal * warp * 0.23;
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
    float alpha = uOpacity * (0.05 + 0.90 * cores + 0.09 * fresnel);
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
    const t = Math.max(0, time);
    const flash = Math.exp(-t * 31);
    const shock = 1 - THREE.MathUtils.smoothstep(t, 0.13, 0.44);
    // A casca visual existe só por uma fração de segundo; não cresce em bolha.
    const blastFade = 1 - THREE.MathUtils.smoothstep(t, 0.07, 0.27);
    this.ground.material.uniforms.uTime.value = t;
    this.ground.material.uniforms.uPhase.value = Math.min(1, t / 0.38);
    this.ground.material.uniforms.uOpacity.value = 1.05 * shock;
    this.ground.scale.setScalar(4.7);

    this.volume.material.uniforms.uTime.value = t;
    this.volume.material.uniforms.uOpacity.value = 0.43 * blastFade;
    const burstScale = 0.28 + 1.68 * (1 - Math.exp(-t * 25));
    this.volume.scale.set(burstScale * 1.06, burstScale * 0.69, burstScale * 0.91);

    this.corona.material.uniforms.uTime.value = t * 1.7 + 0.47;
    this.corona.material.uniforms.uOpacity.value = 0.15 * flash;
    this.corona.scale.set(0.35 + t * 3.1, 0.3 + t * 1.9, 0.4 + t * 2.2);

    // Fragmentos elétricos curtos arremessados para fora do epicentro.
    const radius = 0.25 + 3.9 * (1 - Math.exp(-t * 11));
    for (let i = 0; i < 18; i++) {
      const phase = i * 2.399963 + Math.sin(i * 4.1) * 0.28;
      const base = radius * (0.48 + 0.43 * Math.sin(i * 7.1) ** 2);
      const a = phase + t * (i % 2 ? -2.2 : 2.8);
      const b = a + 0.09 + (i % 5) * 0.09;
      this.sparkPositions.setXYZ(i * 2,
        Math.cos(a) * base, Math.sin(i * 11) * 0.28, Math.sin(a) * base);
      this.sparkPositions.setXYZ(i * 2 + 1,
        Math.cos(b) * (base + 0.46), Math.sin(i * 11 + t * 12) * 0.5,
        Math.sin(b) * (base + 0.46));
    }
    this.sparkPositions.needsUpdate = true;
    this.sparkArc.material.opacity = 0.89 * shock + 0.1 * flash;
  }

  public reset(): void {
    this.group.visible = false;
    // The explosion is owned by a pooled parent. Preserve that parent across casts.
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
