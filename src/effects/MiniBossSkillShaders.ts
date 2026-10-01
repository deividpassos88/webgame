import * as THREE from 'three';

/**
 * GLSL for the mini-boss ground telegraphs and impacts.
 *
 * Conventions shared with MiniBossSkillEffects:
 * - Rectangle planes use `rotation.x = -PI/2`, so uv.y = 1 is the end next to the
 *   boss. Along-length distance is `s = (1 - uv.y) * L` (0 at the boss).
 * - Everything is procedural (no textures) and additive unless noted.
 * - `ss()` is a smoothstep that tolerates reversed or equal edges.
 */

/** Telegraph opacity multiplier: keeps the warning readable without hiding the floor. */
const TELEGRAPH_STRENGTH = '0.62';

export const RECT_WIDTH = 12;
export const RECT_LENGTH = 60;
/** Seconds the rectangle blast front needs to run from the boss to the far end. */
export const RECT_BLAST_SWEEP_SECONDS = 0.12;

const VERTEX = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const NOISE = /* glsl */ `
  float ss(float a, float b, float x) {
    float t = clamp((x - a) / (b - a + 1e-5), 0.0, 1.0);
    return t * t * (3.0 - 2.0 * t);
  }
  float sq(float x) { return x * x; }
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
      mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x),
      f.y
    );
  }
  float fbm(vec2 p) {
    float v = 0.0;
    float a = 0.5;
    for (int i = 0; i < 4; i++) {
      v += a * noise(p);
      p = p * 2.03 + 11.7;
      a *= 0.5;
    }
    return v;
  }
  // ~1 near the zero crossings of a noise field: glowing crack network.
  float cracks(vec2 p) {
    float n = abs(fbm(p) - 0.5);
    return ss(0.05, 0.0, n);
  }
`;

const HEAT = /* glsl */ `
  vec3 heatColor(float h) {
    // dark red -> orange -> yellow -> white-hot
    vec3 c = mix(vec3(0.55, 0.04, 0.02), vec3(1.0, 0.32, 0.05), ss(0.0, 0.45, h));
    c = mix(c, vec3(1.0, 0.78, 0.30), ss(0.4, 0.8, h));
    return mix(c, vec3(1.0, 0.97, 0.88), ss(0.8, 1.3, h));
  }
`;

/* ------------------------------------------------------------------ */
/* Telegraphs                                                          */
/* ------------------------------------------------------------------ */

const RECT_TELEGRAPH_FRAGMENT = /* glsl */ `
  precision highp float;
  uniform float uTime;
  uniform float uProgress;
  uniform float uIntro;
  varying vec2 vUv;
  const float W = ${RECT_WIDTH.toFixed(1)};
  const float L = ${RECT_LENGTH.toFixed(1)};
  ${NOISE}
  void main() {
    float lat = (vUv.x - 0.5) * W;
    float s = (1.0 - vUv.y) * L;
    float half_w = W * 0.5;
    float edge = min(half_w - abs(lat), min(s, L - s));

    float line = ss(0.30, 0.12, edge);
    float glow = exp(-max(edge, 0.0) * 1.35);

    // Forward-travelling hazard chevrons (point towards the far end).
    float ch = fract(s * 0.2 - uTime * 0.7 + abs(lat) * 0.17);
    float chev = ss(0.0, 0.10, ch) * ss(0.55, 0.42, ch);

    // Charge front: the zone heats up from the boss towards the far end.
    float front = uProgress * L;
    float behind = ss(front, front - 7.0, s);
    float frontLine = exp(-abs(s - front) * 1.1) * step(0.001, uProgress) * (1.0 - ss(0.97, 1.0, uProgress));
    float heat = behind * (0.16 + 0.26 * uProgress);

    // Slow embers drifting inside the zone.
    float heatNoise = fbm(vec2(lat * 0.45, s * 0.22 - uTime * 0.8));
    float embers = ss(0.62, 0.9, heatNoise) * (0.18 + behind * 0.4);

    // Dashed centre guide.
    float guide = ss(0.16, 0.05, abs(lat)) * step(0.5, fract(s * 0.25 - uTime * 0.9)) * 0.35;

    float pulse = 0.88 + 0.12 * sin(uTime * 8.0);
    float flash = ss(0.84, 1.0, uProgress) * (0.5 + 0.5 * sin(uTime * 46.0)) * 0.3;

    float a = 0.10 + glow * 0.30 + line * 0.95
            + chev * (0.10 + 0.30 * behind)
            + heat + frontLine * 0.75 + embers + guide + flash;
    a *= pulse * uIntro * ${TELEGRAPH_STRENGTH};

    vec3 col = mix(vec3(0.95, 0.04, 0.02), vec3(1.0, 0.30, 0.08), behind * 0.65 + line * 0.35);
    col = mix(col, vec3(1.0, 0.82, 0.5), clamp(frontLine * 0.8 + line * uProgress * 0.4 + embers * 0.3, 0.0, 1.0));
    gl_FragColor = vec4(col, clamp(a, 0.0, 1.0));
  }
`;

const CIRCLE_TELEGRAPH_FRAGMENT = /* glsl */ `
  precision highp float;
  uniform float uTime;
  uniform float uProgress;
  uniform float uIntro;
  varying vec2 vUv;
  const float PI = 3.14159265;
  ${NOISE}
  void main() {
    vec2 p = (vUv - 0.5) * 2.0;
    float r = length(p);
    if (r > 1.0) discard;
    float turn = atan(p.y, p.x) / (2.0 * PI);

    float rim = ss(0.035, 0.0, abs(r - 0.965));
    float rimGlow = exp(-abs(r - 0.965) * 26.0) * 0.55;
    float edgeGlow = exp(-(1.0 - r) * 6.0) * 0.22;

    // Rotating technical rings.
    float ticks = step(0.5, fract((turn + uTime * 0.04) * 90.0)) * ss(0.05, 0.0, abs(r - 0.895)) * 0.65;
    float runes = step(0.58, fract((turn - uTime * 0.07) * 12.0)) * ss(0.014, 0.0, abs(r - 0.64)) * 0.85;
    float runes2 = step(0.42, fract((turn + uTime * 0.05) * 28.0)) * ss(0.011, 0.0, abs(r - 0.36)) * 0.65;
    float thick = ss(0.02, 0.0, abs(r - 0.78)) * 0.28;

    // Charge disc grows from the centre; its front is the timer.
    float filled = ss(uProgress, uProgress - 0.04, r) * step(0.001, uProgress);
    float front = ss(0.03, 0.0, abs(r - uProgress)) * step(0.001, uProgress) * (1.0 - ss(0.97, 1.0, uProgress));
    float swirl = fbm(vec2(r * 5.0 - uTime * 0.6, turn * 6.0 + uTime * 0.1));
    float lava = ss(0.55, 0.9, swirl) * filled * 0.4;

    // Radar-like sweep.
    float sweep = pow(fract(-turn + uTime * 0.45), 3.0) * 0.20 * ss(0.0, 0.2, r);

    float crossLines = (ss(0.007, 0.0, abs(p.x)) + ss(0.007, 0.0, abs(p.y))) * 0.2 * step(r, 0.9);

    float pulse = 0.9 + 0.1 * sin(uTime * 8.0);
    float flash = ss(0.84, 1.0, uProgress) * (0.5 + 0.5 * sin(uTime * 46.0)) * 0.3;

    float a = 0.07 + edgeGlow + rim * 0.95 + rimGlow + ticks + runes + runes2 + thick
            + filled * (0.12 + 0.22 * uProgress) + front * 0.9 + lava + sweep + crossLines + flash;
    a *= pulse * uIntro * ${TELEGRAPH_STRENGTH};

    vec3 col = mix(vec3(0.95, 0.04, 0.02), vec3(1.0, 0.30, 0.08), filled * 0.6 + rim * 0.3);
    col = mix(col, vec3(1.0, 0.82, 0.5), clamp(front * 0.8 + runes * 0.25 + rim * uProgress * 0.4, 0.0, 1.0));
    gl_FragColor = vec4(col, clamp(a, 0.0, 1.0));
  }
`;

/* ------------------------------------------------------------------ */
/* Impacts                                                             */
/* ------------------------------------------------------------------ */

const CIRCLE_IMPACT_FRAGMENT = /* glsl */ `
  precision highp float;
  uniform float uAge;
  uniform float uRadius;
  uniform float uSeed;
  varying vec2 vUv;
  ${NOISE}
  ${HEAT}
  void main() {
    vec2 p = (vUv - 0.5) * 2.0;
    float rr = length(p);
    if (rr > 1.0) discard;
    float m = rr * uRadius;
    float t = uAge;

    float core = exp(-t * 8.0) * ss(0.9, 0.0, rr * 1.35) * 2.0;

    float w1 = (1.0 - exp(-t * 5.5)) * uRadius * 0.96;
    float ringWidth = 0.5 + t * 1.6;
    float ring1 = exp(-sq((m - w1) / ringWidth)) * exp(-t * 2.4) * 2.0;

    float t2 = max(t - 0.12, 0.0);
    float w2 = (1.0 - exp(-t2 * 4.0)) * uRadius * 0.78;
    float ring2 = exp(-sq((m - w2) / (0.7 + t2 * 1.2))) * exp(-t2 * 3.0) * step(0.12, t);

    float inside = ss(w1, w1 * 0.55, m) * exp(-t * 2.8) * 0.75;

    // Lava cracks radiating from the centre, glowing while they cool down.
    float crack = cracks(p * 5.5 + uSeed) * ss(w1 * 1.02, w1 * 0.3, m);
    float crackGlow = crack * exp(-t * 1.25) * 1.5;

    // The whole zone flashes at the very instant the damage lands.
    float zone = exp(-t * 11.0) * ss(1.0, 0.15, rr) * 0.6;

    float h = core + ring1 + ring2 + inside + crackGlow + zone;
    gl_FragColor = vec4(heatColor(h), clamp(h, 0.0, 1.0));
  }
`;

const CIRCLE_SCORCH_FRAGMENT = /* glsl */ `
  precision highp float;
  uniform float uAge;
  uniform float uDuration;
  uniform float uSeed;
  varying vec2 vUv;
  ${NOISE}
  void main() {
    vec2 p = (vUv - 0.5) * 2.0;
    float rr = length(p);
    if (rr > 1.0) discard;
    float soot = fbm(p * 4.0 + uSeed);
    float mask = ss(1.0, 0.45, rr + (soot - 0.5) * 0.45);
    float scorch = mask * (0.55 + 0.35 * soot);
    float grow = ss(0.0, 0.14, uAge);
    float fade = 1.0 - ss(uDuration * 0.45, uDuration, uAge);
    gl_FragColor = vec4(0.015, 0.008, 0.006, scorch * grow * fade * 0.85);
  }
`;

const FIRE_COLUMN_FRAGMENT = /* glsl */ `
  precision highp float;
  uniform float uAge;
  uniform float uSeed;
  varying vec2 vUv;
  ${NOISE}
  ${HEAT}
  void main() {
    float height = vUv.y;
    float flow = fbm(vec2(vUv.x * 7.0 + uSeed, height * 3.2 - uAge * 3.4));
    float flame = ss(0.18, 0.85, flow);
    float body = pow(max(1.0 - height, 0.0), 1.15);
    float envelope = ss(0.0, 0.07, uAge) * exp(-max(uAge - 0.1, 0.0) * 2.3);
    float h = body * (0.4 + flame * 1.0) * envelope * 1.5;
    h *= ss(0.0, 0.04, height);
    gl_FragColor = vec4(heatColor(h * 0.9 + 0.1 * body), clamp(h, 0.0, 1.0));
  }
`;

const DOME_VERTEX = /* glsl */ `
  varying vec3 vNormalV;
  varying vec3 vViewDir;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vNormalV = normalize(normalMatrix * normal);
    vViewDir = -mv.xyz;
    gl_Position = projectionMatrix * mv;
  }
`;

const DOME_FRAGMENT = /* glsl */ `
  precision highp float;
  uniform float uAge;
  varying vec3 vNormalV;
  varying vec3 vViewDir;
  ${NOISE}
  ${HEAT}
  void main() {
    float fres = pow(1.0 - abs(dot(normalize(vNormalV), normalize(vViewDir))), 2.2);
    float env = exp(-uAge * 4.2) * ss(0.0, 0.03, uAge);
    float h = fres * env * 1.6;
    gl_FragColor = vec4(heatColor(h * 0.8), clamp(h * 0.9, 0.0, 1.0));
  }
`;

const RECT_IMPACT_FRAGMENT = /* glsl */ `
  precision highp float;
  uniform float uAge;
  uniform float uSeed;
  varying vec2 vUv;
  const float W = ${RECT_WIDTH.toFixed(1)};
  const float L = ${RECT_LENGTH.toFixed(1)};
  const float SWEEP = ${RECT_BLAST_SWEEP_SECONDS.toFixed(3)};
  ${NOISE}
  ${HEAT}
  void main() {
    float lat = (vUv.x - 0.5) * W;
    float s = (1.0 - vUv.y) * L;
    float half_w = W * 0.5;
    float edge = min(half_w - abs(lat), min(s, L - s));
    float t = uAge;

    // The blast front races along the zone; tp = seconds since it passed.
    float tp = t - s / (L / SWEEP);
    float lit = step(0.0, tp);
    float tpc = max(tp, 0.0);
    float heat = exp(-tpc * 3.4) * lit;

    float frontGlow = exp(-sq(tp / 0.05)) * 1.6;
    float centre = exp(-sq(lat / 2.4));
    float edgeFlare = ss(0.42, 0.08, edge) * exp(-tpc * 2.2) * lit * 1.4;

    float crack = cracks(vec2(lat * 0.55, s * 0.28) + uSeed) * lit;
    float crackGlow = crack * exp(-tpc * 1.2) * 1.3;

    // The whole zone flashes at the very instant the damage lands.
    float zone = exp(-t * 11.0) * (0.45 + centre * 0.5);

    float h = heat * (0.85 + centre * 0.9) + frontGlow * (0.5 + centre) + edgeFlare + crackGlow + zone;
    float a = clamp(h, 0.0, 1.0) * step(0.0, edge);
    gl_FragColor = vec4(heatColor(h), a);
  }
`;

const RECT_SCORCH_FRAGMENT = /* glsl */ `
  precision highp float;
  uniform float uAge;
  uniform float uDuration;
  uniform float uSeed;
  varying vec2 vUv;
  const float W = ${RECT_WIDTH.toFixed(1)};
  const float L = ${RECT_LENGTH.toFixed(1)};
  const float SWEEP = ${RECT_BLAST_SWEEP_SECONDS.toFixed(3)};
  ${NOISE}
  void main() {
    float lat = (vUv.x - 0.5) * W;
    float s = (1.0 - vUv.y) * L;
    float soot = fbm(vec2(lat * 0.5, s * 0.25) + uSeed);
    float side = 1.0 - ss(W * 0.5 - 2.4, W * 0.5 + (soot - 0.5) * 2.0, abs(lat));
    float tp = uAge - s / (L / SWEEP);
    float grow = ss(0.0, 0.1, tp);
    float fade = 1.0 - ss(uDuration * 0.45, uDuration, uAge);
    float a = side * (0.5 + 0.4 * soot) * grow * fade * 0.85;
    gl_FragColor = vec4(0.015, 0.008, 0.006, a);
  }
`;

const BLAST_WALL_FRAGMENT = /* glsl */ `
  precision highp float;
  uniform float uAge;
  uniform float uSeed;
  varying vec2 vUv;
  const float L = ${RECT_LENGTH.toFixed(1)};
  const float SWEEP = ${RECT_BLAST_SWEEP_SECONDS.toFixed(3)};
  ${NOISE}
  ${HEAT}
  void main() {
    float s = (1.0 - vUv.x) * L;
    float up = vUv.y;
    float tp = uAge - s / (L / SWEEP);
    float lit = step(0.0, tp);
    float tpc = max(tp, 0.0);
    float env = lit * exp(-tpc * 3.0) * ss(0.0, 0.05, tpc);
    float flicker = fbm(vec2(s * 0.5 + uSeed, up * 3.0 - uAge * 4.0));
    float body = pow(max(1.0 - up, 0.0), 1.3) * (0.45 + flicker * 1.1);
    float h = body * env * 1.6;
    gl_FragColor = vec4(heatColor(h), clamp(h, 0.0, 1.0));
  }
`;

const METEOR_TRAIL_FRAGMENT = /* glsl */ `
  precision highp float;
  uniform float uTime;
  varying vec2 vUv;
  ${NOISE}
  ${HEAT}
  void main() {
    // uv.y: 0 at the meteor head, 1 at the end of the tail.
    float along = vUv.y;
    float flicker = fbm(vec2(vUv.x * 9.0, along * 3.5 + uTime * 5.0));
    float body = pow(max(1.0 - along, 0.0), 1.4) * (0.5 + flicker * 1.0);
    float h = body * 1.5;
    gl_FragColor = vec4(heatColor(h), clamp(h, 0.0, 1.0));
  }
`;

function baseMaterial(
  fragmentShader: string,
  uniforms: Record<string, THREE.IUniform>,
  additive: boolean,
  vertexShader = VERTEX
): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms,
    vertexShader,
    fragmentShader,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    side: THREE.DoubleSide,
    blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    toneMapped: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
}

function telegraphUniforms(): Record<string, THREE.IUniform> {
  return {
    uTime: { value: 0 },
    uProgress: { value: 0 },
    uIntro: { value: 0 },
  };
}

export function createRectTelegraphMaterial(): THREE.ShaderMaterial {
  return baseMaterial(RECT_TELEGRAPH_FRAGMENT, telegraphUniforms(), true);
}

export function createCircleTelegraphMaterial(): THREE.ShaderMaterial {
  return baseMaterial(CIRCLE_TELEGRAPH_FRAGMENT, telegraphUniforms(), true);
}

export function createCircleImpactMaterial(radius: number, seed: number): THREE.ShaderMaterial {
  return baseMaterial(
    CIRCLE_IMPACT_FRAGMENT,
    { uAge: { value: 0 }, uRadius: { value: radius }, uSeed: { value: seed } },
    true
  );
}

export function createCircleScorchMaterial(duration: number, seed: number): THREE.ShaderMaterial {
  return baseMaterial(
    CIRCLE_SCORCH_FRAGMENT,
    { uAge: { value: 0 }, uDuration: { value: duration }, uSeed: { value: seed } },
    false
  );
}

export function createFireColumnMaterial(seed: number): THREE.ShaderMaterial {
  return baseMaterial(FIRE_COLUMN_FRAGMENT, { uAge: { value: 0 }, uSeed: { value: seed } }, true);
}

export function createDomeMaterial(): THREE.ShaderMaterial {
  return baseMaterial(DOME_FRAGMENT, { uAge: { value: 0 } }, true, DOME_VERTEX);
}

export function createRectImpactMaterial(seed: number): THREE.ShaderMaterial {
  return baseMaterial(RECT_IMPACT_FRAGMENT, { uAge: { value: 0 }, uSeed: { value: seed } }, true);
}

export function createRectScorchMaterial(duration: number, seed: number): THREE.ShaderMaterial {
  return baseMaterial(
    RECT_SCORCH_FRAGMENT,
    { uAge: { value: 0 }, uDuration: { value: duration }, uSeed: { value: seed } },
    false
  );
}

export function createBlastWallMaterial(seed: number): THREE.ShaderMaterial {
  return baseMaterial(BLAST_WALL_FRAGMENT, { uAge: { value: 0 }, uSeed: { value: seed } }, true);
}

export function createMeteorTrailMaterial(): THREE.ShaderMaterial {
  return baseMaterial(METEOR_TRAIL_FRAGMENT, { uTime: { value: 0 } }, true);
}
