import * as THREE from 'three';

export type EnergyShaderMaterial = THREE.ShaderMaterial & {
  uniforms: {
    uTime: { value: number };
    uColorA: { value: THREE.Color };
    uColorB: { value: THREE.Color };
    uOpacity: { value: number };
    uIntensity: { value: number };
    uNoiseScale: { value: number };
    uScrollSpeed: { value: number };
    uThickness: { value: number };
    uDistortion: { value: number };
  };
};

interface EnergyMaterialOptions {
  readonly colorA?: THREE.ColorRepresentation;
  readonly colorB?: THREE.ColorRepresentation;
  readonly opacity?: number;
  readonly intensity?: number;
  readonly noiseScale?: number;
  readonly scrollSpeed?: number;
  readonly thickness?: number;
  readonly distortion?: number;
  readonly depthTest?: boolean;
}

const COMMON_VERTEX = /* glsl */`
  varying vec2 vUv;
  varying vec3 vWorldPosition;
  void main() {
    vUv = uv;
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorldPosition = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const HASH = /* glsl */`
  float hash(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }
  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    float a = hash(i);
    float b = hash(i + vec2(1.0, 0.0));
    float c = hash(i + vec2(0.0, 1.0));
    float d = hash(i + vec2(1.0, 1.0));
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
  }
`;

function baseUniforms(options: EnergyMaterialOptions) {
  return {
    uTime: { value: 0 },
    uColorA: { value: new THREE.Color(options.colorA ?? 0xffffff) },
    uColorB: { value: new THREE.Color(options.colorB ?? 0x66ccff) },
    uOpacity: { value: options.opacity ?? 1 },
    uIntensity: { value: options.intensity ?? 1 },
    uNoiseScale: { value: options.noiseScale ?? 1 },
    uScrollSpeed: { value: options.scrollSpeed ?? 1 },
    uThickness: { value: options.thickness ?? 1 },
    uDistortion: { value: options.distortion ?? 1 },
  };
}

function shaderMaterial(fragmentShader: string, options: EnergyMaterialOptions = {}): EnergyShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: baseUniforms(options),
    vertexShader: COMMON_VERTEX,
    fragmentShader,
    transparent: true,
    depthWrite: false,
    depthTest: options.depthTest ?? true,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    toneMapped: false,
  }) as EnergyShaderMaterial;
}

export function createEnergyTrailMaterial(options: EnergyMaterialOptions = {}): EnergyShaderMaterial {
  return shaderMaterial(/* glsl */`
    uniform float uTime;
    uniform vec3 uColorA;
    uniform vec3 uColorB;
    uniform float uOpacity;
    uniform float uIntensity;
    uniform float uNoiseScale;
    uniform float uScrollSpeed;
    uniform float uThickness;
    uniform float uDistortion;
    varying vec2 vUv;
    ${HASH}
    void main() {
      float along = clamp(vUv.y, 0.0, 1.0);
      float side = abs(vUv.x - 0.5) * 2.0;
      float fadeTail = pow(1.0 - along, 1.55);
      float edge = smoothstep(1.0, 0.08 / max(0.15, uThickness), side);
      float bands = sin((along * 16.0 - uTime * uScrollSpeed * 8.0) + noise(vec2(along * 9.0, uTime * 0.9)) * 4.0);
      float turbulence = noise(vec2(along * 22.0, vUv.x * 5.0 + uTime * 2.0)) * uDistortion;
      float alpha = edge * fadeTail * (0.42 + 0.38 * bands + 0.42 * turbulence) * uOpacity;
      vec3 color = mix(uColorB, uColorA, smoothstep(0.0, 0.88, along) + turbulence * 0.18);
      gl_FragColor = vec4(color * uIntensity, clamp(alpha, 0.0, 1.0));
    }
  `, options);
}

export function createMagicCircleMaterial(options: EnergyMaterialOptions = {}): EnergyShaderMaterial {
  return shaderMaterial(/* glsl */`
    uniform float uTime;
    uniform vec3 uColorA;
    uniform vec3 uColorB;
    uniform float uOpacity;
    uniform float uIntensity;
    uniform float uNoiseScale;
    uniform float uScrollSpeed;
    uniform float uThickness;
    uniform float uDistortion;
    varying vec2 vUv;
    ${HASH}
    void main() {
      vec2 p = vUv * 2.0 - 1.0;
      float r = length(p);
      if (r > 1.0) discard;
      float a = atan(p.y, p.x);
      float ring1 = 1.0 - smoothstep(0.012, 0.055 * uThickness, abs(r - 0.78));
      float ring2 = 1.0 - smoothstep(0.012, 0.045 * uThickness, abs(r - 0.48));
      float ring3 = 1.0 - smoothstep(0.008, 0.03 * uThickness, abs(r - 0.92));
      float spokes = smoothstep(0.86, 1.0, cos(a * 12.0 + uTime * uScrollSpeed * 1.8));
      spokes *= smoothstep(0.22, 0.38, r) * smoothstep(0.98, 0.7, r);
      float runes = step(0.75, noise(vec2(floor((a + 3.14159) * 9.0), floor(r * 7.0)) + uTime * 0.12));
      runes *= smoothstep(0.58, 0.66, r) * smoothstep(0.86, 0.72, r);
      float field = (ring1 + ring2 * 0.74 + ring3 * 0.56 + spokes * 0.32 + runes * 0.5);
      float pulse = 0.82 + 0.18 * sin(uTime * 8.0 + r * 11.0);
      float coreFade = smoothstep(0.92, 0.18, r) * 0.09 * uDistortion;
      float alpha = clamp((field * pulse + coreFade) * uOpacity, 0.0, 1.0);
      vec3 color = mix(uColorB, uColorA, clamp(field, 0.0, 1.0));
      gl_FragColor = vec4(color * uIntensity, alpha);
    }
  `, options);
}

export function createBeamMaterial(options: EnergyMaterialOptions = {}): EnergyShaderMaterial {
  return shaderMaterial(/* glsl */`
    uniform float uTime;
    uniform vec3 uColorA;
    uniform vec3 uColorB;
    uniform float uOpacity;
    uniform float uIntensity;
    uniform float uNoiseScale;
    uniform float uScrollSpeed;
    uniform float uThickness;
    uniform float uDistortion;
    varying vec2 vUv;
    ${HASH}
    void main() {
      float radial = abs(vUv.x - 0.5) * 2.0;
      float core = smoothstep(1.0, 0.08 / max(0.2, uThickness), radial);
      float streams = sin(vUv.y * 32.0 - uTime * uScrollSpeed * 18.0 + noise(vec2(vUv.y * 10.0, uTime)) * 5.0);
      float unstable = noise(vec2(vUv.y * 26.0 + uTime * 3.0, vUv.x * 9.0)) * uDistortion;
      float flicker = 0.76 + 0.24 * sin(uTime * 42.0 + vUv.y * 9.0);
      float alpha = core * (0.55 + streams * 0.2 + unstable * 0.34) * flicker * uOpacity;
      float hot = smoothstep(0.52, 0.0, radial);
      vec3 color = mix(uColorB, uColorA, hot + unstable * 0.18);
      gl_FragColor = vec4(color * uIntensity, clamp(alpha, 0.0, 1.0));
    }
  `, { ...options, depthTest: options.depthTest ?? false });
}

export function configureEnergyMaterial(
  material: EnergyShaderMaterial,
  options: EnergyMaterialOptions
): void {
  if (options.colorA !== undefined) material.uniforms.uColorA.value.set(options.colorA);
  if (options.colorB !== undefined) material.uniforms.uColorB.value.set(options.colorB);
  if (options.opacity !== undefined) material.uniforms.uOpacity.value = options.opacity;
  if (options.intensity !== undefined) material.uniforms.uIntensity.value = options.intensity;
  if (options.noiseScale !== undefined) material.uniforms.uNoiseScale.value = options.noiseScale;
  if (options.scrollSpeed !== undefined) material.uniforms.uScrollSpeed.value = options.scrollSpeed;
  if (options.thickness !== undefined) material.uniforms.uThickness.value = options.thickness;
  if (options.distortion !== undefined) material.uniforms.uDistortion.value = options.distortion;
}

export function setEnergyTime(material: EnergyShaderMaterial, time: number): void {
  material.uniforms.uTime.value = time;
}
