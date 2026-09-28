import * as THREE from 'three';

export interface WarriorSlashMaterialUniforms {
  [key: string]: THREE.IUniform;
  uTime: { value: number };
  uTexture: { value: THREE.Texture | null };
  uColorCore: { value: THREE.Color };
  uColorEdge: { value: THREE.Color };
  uColorGlow: { value: THREE.Color };
  uProgress: { value: number };        // 0..1 sweep animation
  uFade: { value: number };            // 1..0 overall opacity fade
  uIntensity: { value: number };       // Bloom / HDR multiplier
  uDistortion: { value: number };      // Turbulence
  uArcSpan: { value: number };         // Fraction of visible arc
  uEdgeGlowBoost: { value: number };   // Rim glow intensity
}

export type WarriorSlashShaderMaterial = THREE.ShaderMaterial & {
  uniforms: WarriorSlashMaterialUniforms;
};

export interface CreateWarriorSlashMaterialOptions {
  texture?: THREE.Texture | null;
  colorCore?: THREE.ColorRepresentation;
  colorEdge?: THREE.ColorRepresentation;
  colorGlow?: THREE.ColorRepresentation;
  intensity?: number;
  distortion?: number;
  edgeGlowBoost?: number;
}

const SLASH_VERTEX_SHADER = /* glsl */`
  varying vec2 vUv;
  varying vec3 vWorldPosition;
  varying vec3 vNormal;

  void main() {
    vUv = uv;
    vNormal = normalize(normalMatrix * normal);
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorldPosition = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const SLASH_FRAGMENT_SHADER = /* glsl */`
  uniform float uTime;
  uniform sampler2D uTexture;
  uniform vec3 uColorCore;
  uniform vec3 uColorEdge;
  uniform vec3 uColorGlow;
  uniform float uProgress;
  uniform float uFade;
  uniform float uIntensity;
  uniform float uDistortion;
  uniform float uArcSpan;
  uniform float uEdgeGlowBoost;

  varying vec2 vUv;
  varying vec3 vWorldPosition;
  varying vec3 vNormal;

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

  void main() {
    // Dynamic natural sweep along the sword swing
    // Lead head sweeps up to 1.15, leaving a long trailing tail
    float leadHead = uProgress * 1.35;
    float tailCutoff = leadHead - uArcSpan;

    if (vUv.x > leadHead || vUv.x < tailCutoff - 0.35) {
      discard;
    }

    float headAlpha = smoothstep(leadHead, leadHead - 0.05, vUv.x);
    // Smooth, elongated tail fade ("rabo bem grande e suave")
    float tailAlpha = smoothstep(tailCutoff - 0.35, tailCutoff + 0.12, vUv.x);
    float sweepWindow = headAlpha * tailAlpha;

    // Organic luminous shimmer along energy streams
    float flowTime = uTime * 6.0;
    float waveDistortX = (noise(vec2(vUv.x * 10.0 - flowTime, vUv.y * 6.0)) - 0.5) * 0.02 * uDistortion;
    float waveDistortY = (noise(vec2(vUv.x * 14.0 + flowTime * 0.4, vUv.y * 8.0)) - 0.5) * 0.035 * uDistortion;
    vec2 distortedUv = clamp(vUv + vec2(waveDistortX, waveDistortY), vec2(0.001), vec2(0.999));

    // Sample the multi-stream neon blade texture directly
    vec4 tex = texture2D(uTexture, distortedUv);

    // Glowing razor edge and multi-concentric streamline highlights
    float razorEdge = smoothstep(0.40, 0.96, vUv.y);
    float hotCore = pow(tex.a, 1.8) * razorEdge;

    // Multi-filament energy lines & dynamic sparkling glints
    // Procedural micro-sparkles dancing along the tail and leading edge
    vec2 sparkleGrid = vec2(vUv.x * 42.0 + uTime * 8.0, vUv.y * 14.0);
    float sparkleNoise = hash(floor(sparkleGrid));
    float sparkleShape = fract(sparkleGrid.x) * (1.0 - fract(sparkleGrid.x)) * fract(sparkleGrid.y) * (1.0 - fract(sparkleGrid.y));
    float dynamicSparkle = step(0.88, sparkleNoise) * pow(sparkleShape * 16.0, 3.0) * smoothstep(0.1, 0.9, vUv.x);

    // Color gradient - pure saturated blue & cyan tone, no washed-out white
    vec3 color = mix(uColorGlow, uColorEdge, vUv.y * 0.75 + 0.25);
    color = mix(color, uColorCore, clamp(hotCore * 0.75, 0.0, 0.75));
    color *= tex.rgb * 1.5;

    // Intense Bloom and Rim Flare with edge color saturation
    color += uColorEdge * (pow(tex.a, 2.5) * 1.8 * uEdgeGlowBoost);

    // Star glint extra flare from texture + dynamic sparkling glints ("uns brilhos") in blue/cyan
    float texGlint = pow(max(0.0, tex.r * tex.g * tex.b), 1.3) * 2.8;
    color += (uColorCore * 1.2 + uColorEdge * 1.5) * (texGlint + dynamicSparkle * 3.5);

    float alpha = (tex.a + dynamicSparkle * 0.6) * sweepWindow * uFade;
    if (alpha < 0.005) discard;

    gl_FragColor = vec4(color * uIntensity, clamp(alpha, 0.0, 1.0));
  }
`;

export function createWarriorSlashMaterial(
  options: CreateWarriorSlashMaterialOptions = {}
): WarriorSlashShaderMaterial {
  const uniforms: WarriorSlashMaterialUniforms = {
    uTime: { value: 0 },
    uTexture: { value: options.texture ?? null },
    uColorCore: { value: new THREE.Color(options.colorCore ?? 0xffffff) },
    uColorEdge: { value: new THREE.Color(options.colorEdge ?? 0x33e5ff) },
    uColorGlow: { value: new THREE.Color(options.colorGlow ?? 0x0044ff) },
    uProgress: { value: 0 },
    uFade: { value: 1 },
    uIntensity: { value: options.intensity ?? 3.0 },
    uDistortion: { value: options.distortion ?? 0.7 },
    uArcSpan: { value: 0.95 },
    uEdgeGlowBoost: { value: options.edgeGlowBoost ?? 1.8 },
  };

  return new THREE.ShaderMaterial({
    uniforms,
    vertexShader: SLASH_VERTEX_SHADER,
    fragmentShader: SLASH_FRAGMENT_SHADER,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    toneMapped: false,
  }) as WarriorSlashShaderMaterial;
}
