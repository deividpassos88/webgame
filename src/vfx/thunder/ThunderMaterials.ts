import * as THREE from 'three';

/** Shared GLSL noise helpers (value noise, cheap, deterministic). */
const NOISE_GLSL = /* glsl */`
  float thHash(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }
  float thNoise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(thHash(i), thHash(i + vec2(1.0, 0.0)), f.x),
               mix(thHash(i + vec2(0.0, 1.0)), thHash(i + vec2(1.0, 1.0)), f.x), f.y);
  }
`;

/**
 * Thick lightning ribbon: white-hot core, magenta/violet halo, additive.
 * uv.x = across the bolt (0..1), uv.y = along it (0 top → 1 ground).
 */
export function createThunderBoltMaterial(halo = 0xd23cff): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uOpacity: { value: 1 },
      uCore: { value: new THREE.Color(0xffffff) },
      uHalo: { value: new THREE.Color(halo) },
      uSeed: { value: 0 },
    },
    vertexShader: /* glsl */`
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */`
      uniform float uTime;
      uniform float uOpacity;
      uniform vec3 uCore;
      uniform vec3 uHalo;
      uniform float uSeed;
      varying vec2 vUv;
      ${NOISE_GLSL}
      void main() {
        float d = abs(vUv.x * 2.0 - 1.0);
        float flicker = 0.82 + 0.18 * thNoise(vec2(vUv.y * 9.0 + uSeed, uTime * 22.0));
        float core = smoothstep(0.42, 0.0, d);
        float halo = smoothstep(1.0, 0.18, d);
        vec3 color = mix(uHalo, uCore, core);
        float alpha = (core + halo * 0.9) * flicker * uOpacity;
        if (alpha < 0.005) discard;
        gl_FragColor = vec4(color * (0.92 + 0.35 * core), alpha);
      }
    `,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  });
}

/** Translucent violet dome with a bright magenta Fresnel rim (the invocation bubble). */
export function createThunderDomeMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uOpacity: { value: 0 },
      uBody: { value: new THREE.Color(0x4a22a8) },
      uRim: { value: new THREE.Color(0xff5cf2) },
    },
    vertexShader: /* glsl */`
      varying vec3 vNormalView;
      varying vec3 vViewDir;
      varying vec3 vLocal;
      void main() {
        vNormalView = normalize(normalMatrix * normal);
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vViewDir = normalize(-mv.xyz);
        vLocal = position;
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */`
      uniform float uTime;
      uniform float uOpacity;
      uniform vec3 uBody;
      uniform vec3 uRim;
      varying vec3 vNormalView;
      varying vec3 vViewDir;
      varying vec3 vLocal;
      ${NOISE_GLSL}
      void main() {
        float fres = pow(1.0 - abs(dot(normalize(vNormalView), normalize(vViewDir))), 2.2);
        float swirl = thNoise(vec2(atan(vLocal.z, vLocal.x) * 3.0 + uTime * 0.9, vLocal.y * 2.5 - uTime * 0.6));
        vec3 color = mix(uBody, uRim, clamp(pow(fres, 2.6) * 1.1 + swirl * 0.06, 0.0, 1.0));
        float alpha = (0.16 + 0.16 * swirl + 0.62 * pow(fres, 1.6)) * uOpacity;
        if (alpha < 0.005) discard;
        gl_FragColor = vec4(color, alpha);
      }
    `,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  });
}

/** Vertical light column inside the bubble. uv.x across, uv.y up (0 base → 1 top). */
export function createThunderBeamMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uOpacity: { value: 0 },
      uGrow: { value: 1 },
      uSeed: { value: 0 },
    },
    vertexShader: /* glsl */`
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */`
      uniform float uTime;
      uniform float uOpacity;
      uniform float uGrow;
      uniform float uSeed;
      varying vec2 vUv;
      ${NOISE_GLSL}
      void main() {
        float d = abs(vUv.x * 2.0 - 1.0);
        float core = smoothstep(0.30, 0.0, d);
        float halo = smoothstep(1.0, 0.25, d);
        float along = smoothstep(0.0, 0.12, vUv.y) * (1.0 - smoothstep(uGrow - 0.12, uGrow, vUv.y));
        float flick = 0.7 + 0.3 * thNoise(vec2(uSeed * 3.1, uTime * 16.0 + vUv.y * 4.0));
        float alpha = (core * 1.0 + halo * 0.55) * along * flick * uOpacity;
        if (alpha < 0.005) discard;
        vec3 color = mix(vec3(0.85, 0.35, 1.0), vec3(1.0), core);
        gl_FragColor = vec4(color, alpha);
      }
    `,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  });
}

/** Concentric shock ring on a polar disc (uv.x = radius). Magenta crests, soft trough. */
export function createThunderRingMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uOpacity: { value: 0 },
      uSeed: { value: 0 },
      uCrest: { value: new THREE.Color(0xff6cff) },
    },
    vertexShader: /* glsl */`
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */`
      uniform float uTime;
      uniform float uOpacity;
      uniform float uSeed;
      uniform vec3 uCrest;
      varying vec2 vUv;
      void main() {
        float r = vUv.x;
        float th = vUv.y * 6.2831853;
        float wobble = 0.02 * sin(th * 6.0 + uSeed);
        float ring = 1.0 - smoothstep(0.0, 0.05, abs(r + wobble - 0.5 * fract(uTime * 0.3 + uSeed)));
        float fade = (1.0 - smoothstep(0.7, 1.0, r)) * smoothstep(0.0, 0.08, r);
        float alpha = ring * fade * uOpacity;
        if (alpha < 0.005) discard;
        gl_FragColor = vec4(mix(vec3(0.5, 0.1, 0.9), uCrest, ring), alpha);
      }
    `,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  });
}

/**
 * Cartoon smoke puff texture: a union of soft circles in dark violet, a lighter
 * top highlight and a darker outline, like the flat storm clouds of the reference.
 * Generated once, without canvas or network assets.
 */
export function createThunderSmokeTexture(size = 128): THREE.DataTexture {
  const data = new Uint8Array(size * size * 4);
  // Lobos irregulares e achatados, como as nuvens cartunescas da referência.
  const lobes = [
    [0.50, 0.52, 0.27], [0.27, 0.58, 0.20], [0.73, 0.58, 0.20],
    [0.38, 0.38, 0.19], [0.63, 0.36, 0.18], [0.50, 0.70, 0.17],
    [0.14, 0.66, 0.13], [0.86, 0.66, 0.13], [0.22, 0.40, 0.14], [0.79, 0.42, 0.14],
  ] as const;
  const sdf = (x: number, y: number): number => {
    let best = Infinity;
    for (const [cx, cy, r] of lobes) best = Math.min(best, Math.hypot(x - cx, y - cy) - r);
    return best;
  };
  const mix = (a: number[], b: number[], t: number): number[] => a.map((v, i) => v + (b[i] - v) * t);
  // Roxo-escuro cartunesco: corpo escuro, topo levemente iluminado, contorno quase preto.
  const body = [46, 30, 86];
  const highlight = [124, 86, 196];
  const outline = [10, 6, 22];
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const u = (x + 0.5) / size;
      const v = (y + 0.5) / size;
      const d = sdf(u, v);
      const inside = THREE.MathUtils.smoothstep(-d, -0.012, 0.012);
      const edge = THREE.MathUtils.smoothstep(-d, -0.05, -0.02) * (1 - inside);
      const top = THREE.MathUtils.smoothstep(v, 0.30, 0.52) * (1 - THREE.MathUtils.smoothstep(v, 0.52, 0.66));
      let color = mix(body, highlight, top * 0.8);
      color = mix(color, outline, edge * 0.9);
      const i = (y * size + x) * 4;
      data[i] = Math.round(color[0]);
      data[i + 1] = Math.round(color[1]);
      data[i + 2] = Math.round(color[2]);
      data[i + 3] = Math.round(Math.max(inside, edge * 0.9) * 255);
    }
  }
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

/**
 * Radial soft shadow for the ground under the strike: dark centre, fading out
 * to nothing at the rim. Generated in code, no assets.
 */
export function createThunderShadowTexture(size = 128): THREE.DataTexture {
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const u = (x + 0.5) / size * 2 - 1;
      const v = (y + 0.5) / size * 2 - 1;
      const r = Math.min(1, Math.hypot(u, v));
      const alpha = THREE.MathUtils.smoothstep(1 - r, 0, 0.55) * (r < 1 ? 1 : 0);
      const i = (y * size + x) * 4;
      data[i] = 8;
      data[i + 1] = 4;
      data[i + 2] = 14;
      data[i + 3] = Math.round(alpha * 255);
    }
  }
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

/**
 * Estrela de estouro (base do impacto): núcleo branco, bordas magenta e pontas
 * irregulares, como o clarão serrilhado da referência. Gerada em código.
 */
export function createThunderBurstTexture(size = 128): THREE.DataTexture {
  const data = new Uint8Array(size * size * 4);
  const white = [255, 252, 255];
  const magenta = [255, 70, 245];
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const u = (x + 0.5) / size * 2 - 1;
      const v = (y + 0.5) / size * 2 - 1;
      const r = Math.hypot(u, v);
      const a = Math.atan2(v, u);
      const spikes = 0.52 + 0.48 * Math.pow(Math.abs(Math.cos(a * 4 + 0.6 + 0.4 * Math.sin(a * 9))), 2.5);
      const alpha = THREE.MathUtils.smoothstep(spikes - r, -0.02, 0.06);
      const core = THREE.MathUtils.smoothstep(0.55 * spikes - r, -0.05, 0.25);
      const i = (y * size + x) * 4;
      for (let c = 0; c < 3; c += 1) data[i + c] = Math.round(magenta[c] + (white[c] - magenta[c]) * core);
      data[i + 3] = Math.round(alpha * 255);
    }
  }
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

/** Pequeno gerador determinístico para as texturas pintadas (mesmo visual em todo carregamento). */
function paintRandom(seed: number): () => number {
  let state = seed * 9301 + 49297;
  return () => {
    state = (state * 16807) % 2147483647;
    return (state % 100000) / 100000;
  };
}

/**
 * Nuvem de fumaça pintada em canvas, no estilo cartunesco da referência:
 * blobs arredondados com contorno quase preto, corpo roxo-escuro, topo com
 * brilho lilás e luz magenta vazando por baixo. Cada `seed` dá um arranjo
 * diferente. Sem canvas (ambiente de teste), cai na textura procedural.
 */
export function createThunderSmokeCanvasTexture(seed = 1, width = 512, height = 300): THREE.Texture {
  const canvas = typeof document !== 'undefined' ? document.createElement('canvas') : null;
  const ctx = canvas?.getContext?.('2d') ?? null;
  if (!canvas || !ctx) return createThunderSmokeTexture(128);
  canvas.width = width;
  canvas.height = height;
  const rnd = paintRandom(seed);
  const lobes: Array<{ x: number; y: number; r: number }> = [];
  const count = 9;
  for (let i = 0; i < count; i += 1) {
    const t = i / (count - 1);
    const x = 0.1 + 0.8 * t + (rnd() - 0.5) * 0.06;
    const bulge = Math.sin(Math.PI * Math.min(1, Math.max(0, t))) * (0.7 + rnd() * 0.3);
    lobes.push({ x, y: 0.7 - 0.26 * bulge, r: 0.09 + rnd() * 0.07 });
  }
  // Lobos de base, achatados, que assentam a nuvem no chão.
  lobes.push({ x: 0.3, y: 0.82, r: 0.13 }, { x: 0.7, y: 0.82, r: 0.13 }, { x: 0.5, y: 0.86, r: 0.16 });

  const w = width;
  const h = height;
  // 1) contorno escuro (todos juntos, para não aparecer costura entre os lobos)
  ctx.fillStyle = '#0b0616';
  for (const lobe of lobes) {
    ctx.beginPath();
    ctx.ellipse(lobe.x * w, lobe.y * h, (lobe.r + 0.014) * w, (lobe.r + 0.014) * w * 0.92, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  // 2) corpo roxo-escuro com degradê vertical
  const body = ctx.createLinearGradient(0, h * 0.35, 0, h);
  body.addColorStop(0, '#3a2870');
  body.addColorStop(1, '#170d2e');
  ctx.fillStyle = body;
  for (const lobe of lobes) {
    ctx.beginPath();
    ctx.ellipse(lobe.x * w, lobe.y * h, lobe.r * w, lobe.r * w * 0.92, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  // 3) brilho lilás no topo de cada lobo
  ctx.fillStyle = 'rgba(140, 108, 214, 0.45)';
  for (const lobe of lobes) {
    ctx.beginPath();
    ctx.ellipse((lobe.x - lobe.r * 0.22) * w, (lobe.y - lobe.r * 0.35) * h, lobe.r * 0.5 * w, lobe.r * 0.42 * w, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  // 4) luz magenta vazando por baixo da nuvem
  ctx.globalCompositeOperation = 'lighter';
  const glow = ctx.createRadialGradient(w * 0.5, h * 0.92, 0, w * 0.5, h * 0.92, w * 0.3);
  glow.addColorStop(0, 'rgba(255, 60, 240, 0.45)');
  glow.addColorStop(1, 'rgba(255, 60, 240, 0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, w, h);
  ctx.globalCompositeOperation = 'source-over';

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/**
 * Estrela de estouro pintada em canvas: pontas serrilhadas, núcleo branco
 * e borda magenta, como o clarão da base na referência.
 */
export function createThunderBurstCanvasTexture(seed = 3, size = 256): THREE.Texture {
  const canvas = typeof document !== 'undefined' ? document.createElement('canvas') : null;
  const ctx = canvas?.getContext?.('2d') ?? null;
  if (!canvas || !ctx) return createThunderBurstTexture(128);
  canvas.width = size;
  canvas.height = size;
  const rnd = paintRandom(seed);
  const c = size / 2;
  const points = 22;
  ctx.beginPath();
  for (let i = 0; i < points * 2; i += 1) {
    const a = (i / (points * 2)) * Math.PI * 2;
    const outer = i % 2 === 0;
    const radius = outer ? c * (0.62 + 0.36 * rnd()) : c * (0.22 + 0.1 * rnd());
    const x = c + Math.cos(a) * radius;
    const y = c + Math.sin(a) * radius;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.closePath();
  const fill = ctx.createRadialGradient(c, c, 0, c, c, c);
  fill.addColorStop(0, 'rgba(255, 255, 255, 1)');
  fill.addColorStop(0.3, 'rgba(255, 236, 255, 0.95)');
  fill.addColorStop(0.65, 'rgba(255, 70, 245, 0.85)');
  fill.addColorStop(1, 'rgba(255, 40, 220, 0)');
  ctx.fillStyle = fill;
  ctx.fill();
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}
