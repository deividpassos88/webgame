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

export type WarriorSlashMaterial = THREE.ShaderMaterial & {
  uniforms: {
    uTime: { value: number };
    uColorA: { value: THREE.Color };
    uColorB: { value: THREE.Color };
    uColorC: { value: THREE.Color };
    uOpacity: { value: number };
    uIntensity: { value: number };
    uProgress: { value: number };
    uThickness: { value: number };
    uDistortion: { value: number };
    uBreakup: { value: number };
    uSeed: { value: number };
    uSaturation: { value: number };
  };
};

export interface WarriorSlashMaterialOptions {
  readonly colorA?: THREE.ColorRepresentation; // miolo claro do corte
  readonly colorB?: THREE.ColorRepresentation; // cor saturada do rastro
  readonly colorC?: THREE.ColorRepresentation; // tom de fundo/base
  readonly opacity?: number;
  readonly intensity?: number;
  readonly thickness?: number;
  readonly distortion?: number;
  /** 0 = fita contínua, 1 = rastro com falhas (buracos de vento). */
  readonly breakup?: number;
  /** Varia o padrão de falhas entre golpes. */
  readonly seed?: number;
  /** >1 devolve a cor que o blending aditivo estoura para branco. */
  readonly saturation?: number;
}

export function createWarriorSlashMaterial(
  options: WarriorSlashMaterialOptions = {}
): WarriorSlashMaterial {
  const uniforms = {
    uTime: { value: 0 },
    uColorA: { value: new THREE.Color(options.colorA ?? 0xffffff) },
    uColorB: { value: new THREE.Color(options.colorB ?? 0x5efff5) },
    uColorC: { value: new THREE.Color(options.colorC ?? 0x0a2a2e) },
    uOpacity: { value: options.opacity ?? 1 },
    uIntensity: { value: options.intensity ?? 1.8 },
    uProgress: { value: 0 },
    uThickness: { value: options.thickness ?? 1 },
    uDistortion: { value: options.distortion ?? 1 },
    uBreakup: { value: options.breakup ?? 0 },
    uSeed: { value: options.seed ?? 0 },
    uSaturation: { value: options.saturation ?? 1.15 },
  };

  return new THREE.ShaderMaterial({
    uniforms,
    vertexShader: COMMON_VERTEX,
    fragmentShader: /* glsl */`
      uniform float uTime;
      uniform vec3 uColorA;
      uniform vec3 uColorB;
      uniform vec3 uColorC;
      uniform float uOpacity;
      uniform float uIntensity;
      uniform float uProgress;
      uniform float uThickness;
      uniform float uDistortion;
      uniform float uBreakup;
      uniform float uSeed;
      uniform float uSaturation;
      varying vec2 vUv;
      varying vec3 vWorldPosition;
      ${HASH}
      void main() {
        float angular = clamp(vUv.x, 0.0, 1.0); // 0..1 along arc
        float radial = clamp(vUv.y, 0.0, 1.0); // 0 inner, 1 outer

        // Angular fade: smooth in at start, long tail at end (like sword swipe)
        float angularFadeIn = smoothstep(0.0, 0.14, angular);
        float angularFadeOut = smoothstep(1.0, 0.62, angular);
        float angularFade = angularFadeIn * angularFadeOut;

        // Radial fades for large soft edges
        float innerFade = smoothstep(0.0, 0.18, radial);
        float outerFade = smoothstep(1.0, 0.72, radial);
        float radialFade = innerFade * outerFade;

        // Core band: fio claro perto da borda externa (fio da lâmina)
        float coreCenter = 0.82;
        float coreWidth = 0.12 / max(0.2, uThickness);
        float core = 1.0 - smoothstep(0.0, coreWidth, abs(radial - coreCenter));
        core = pow(core, 1.2);

        float midGlow = smoothstep(0.22, 0.68, radial) * smoothstep(1.0, 0.32, radial);
        midGlow = pow(midGlow, 0.9);

        // Energy noise scrolling along angular direction
        float scroll = uTime * 3.2;
        float n1 = noise(vec2(angular * 18.0 + scroll * 0.6, radial * 9.0 + uTime * 0.8));
        float n2 = noise(vec2(angular * 34.0 - scroll * 0.9, radial * 16.0 + uTime * 1.3));
        float turbulence = (n1 * 0.55 + n2 * 0.45) * uDistortion;

        // Motion streaks along angular
        float streak = sin((angular * 28.0 - uTime * 18.0) + radial * 12.0 + turbulence * 6.0);
        streak = streak * 0.5 + 0.5;
        streak = pow(streak, 2.2);

        // Progress-driven fade and expansion feel
        float prog = clamp(uProgress, 0.0, 1.0);
        float timeFade = 1.0 - prog;
        timeFade = pow(timeFade, 1.25);

        // Brilho extra no começo do corte, sem estourar a borda para branco
        float flash = 1.0 + (1.0 - prog) * 0.42 * smoothstep(0.65, 0.85, radial);

        // --- FALHAS DO RASTRO -------------------------------------------------
        // Ruído em três escalas ao longo do arco abre buracos na fita, para o
        // rastro parecer vento de lâmina em vez de arco sólido de neon. A
        // cauda (angular baixo) se desfaz antes da cabeça.
        float b1 = noise(vec2(angular * 6.5 + uSeed * 4.3, radial * 1.4 + uSeed));
        float b2 = noise(vec2(angular * 21.0 - uSeed * 6.1, radial * 4.5 - uSeed * 2.0));
        float b3 = noise(vec2(angular * 58.0 + uSeed * 9.7, radial * 2.0 + uSeed * 0.5));
        float gaps = b1 * 0.5 + b2 * 0.32 + b3 * 0.18 + turbulence * 0.2;
        float tailWear = smoothstep(0.0, 0.5, angular);
        float holes = smoothstep(0.40, 0.62, gaps) * mix(0.45, 1.0, tailWear);
        float erosion = clamp(uBreakup * (0.78 + 0.32 * prog), 0.0, 1.0);
        float keep = mix(1.0, holes, erosion);

        // --- COR -------------------------------------------------------------
        // Base -> cor saturada, com só um fio claro no miolo do corte.
        vec3 color = mix(uColorC, uColorB, smoothstep(0.05, 0.7, radial + turbulence * 0.1));
        color = mix(color, uColorA, core * 0.5 + midGlow * 0.1);
        color += uColorB * streak * 0.3 * midGlow;

        // O blending aditivo estoura tudo para branco; aqui a cor é devolvida.
        float lum = dot(color, vec3(0.299, 0.587, 0.114));
        color = max(mix(vec3(lum), color, uSaturation), vec3(0.0));

        float energy = midGlow * 0.85 + core * 1.45 + turbulence * 0.18 + streak * 0.18;

        float alpha = radialFade * angularFade * (0.22 + energy * 0.92) * uOpacity * timeFade * flash;
        alpha *= keep;

        // Extra outer glow lift
        alpha *= uIntensity;

        // Discard nearly transparent to save fill
        if (alpha < 0.01) discard;

        gl_FragColor = vec4(color * uIntensity, clamp(alpha, 0.0, 1.0));
      }
    `,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    toneMapped: false,
  }) as WarriorSlashMaterial;
}

export function configureWarriorSlashMaterial(
  material: WarriorSlashMaterial,
  options: WarriorSlashMaterialOptions & { progress?: number }
): void {
  if (options.colorA !== undefined) material.uniforms.uColorA.value.set(options.colorA);
  if (options.colorB !== undefined) material.uniforms.uColorB.value.set(options.colorB);
  if (options.colorC !== undefined) material.uniforms.uColorC.value.set(options.colorC);
  if (options.opacity !== undefined) material.uniforms.uOpacity.value = options.opacity;
  if (options.intensity !== undefined) material.uniforms.uIntensity.value = options.intensity;
  if (options.thickness !== undefined) material.uniforms.uThickness.value = options.thickness;
  if (options.distortion !== undefined) material.uniforms.uDistortion.value = options.distortion;
  if (options.breakup !== undefined) material.uniforms.uBreakup.value = options.breakup;
  if (options.seed !== undefined) material.uniforms.uSeed.value = options.seed;
  if (options.saturation !== undefined) material.uniforms.uSaturation.value = options.saturation;
  if (options.progress !== undefined) material.uniforms.uProgress.value = options.progress;
}

export function setWarriorSlashTime(
  material: WarriorSlashMaterial,
  time: number,
  progress: number
): void {
  material.uniforms.uTime.value = time;
  material.uniforms.uProgress.value = progress;
}

// ---------------------------------------------------------------------------
// Projétil "cometa" do ataque básico da Maga (bala de gelo)
// ---------------------------------------------------------------------------

export type FrostBulletMaterial = THREE.ShaderMaterial & {
  uniforms: {
    uTime: { value: number };
    uCore: { value: THREE.Color };
    uGlow: { value: THREE.Color };
    uDeep: { value: THREE.Color };
    uOpacity: { value: number };
    uIntensity: { value: number };
    uHeadLength: { value: number };
    uWidth: { value: number };
    uWisp: { value: number };
    uFilament: { value: number };
    uSparks: { value: number };
    uHaze: { value: number };
    uSeed: { value: number };
    uScroll: { value: number };
  };
};

export interface FrostBulletMaterialOptions {
  /** Miolo branco do dardo e das partículas de gelo. */
  readonly core?: THREE.ColorRepresentation;
  /** Azul claro predominante (seda, borda e aura). */
  readonly glow?: THREE.ColorRepresentation;
  /** Azul profundo do fundo da cauda. */
  readonly deep?: THREE.ColorRepresentation;
  readonly opacity?: number;
  readonly intensity?: number;
  /** Fração do sprite ocupada pela ponta em dardo (0.3 = 30%). */
  readonly headLength?: number;
  /** Meia-espessura da cauda em UV (0.2 = 20% do sprite). */
  readonly width?: number;
  /** Ondulação da seda (0 = fita reta). */
  readonly wisp?: number;
  /** Brilho dos filamentos internos. */
  readonly filament?: number;
  /** Quantos pontos de gelo nascem dentro do sprite (0..6). */
  readonly sparks?: number;
  /** Aura suave em volta da ponta. */
  readonly haze?: number;
  readonly seed?: number;
  /** Velocidade do fluxo da seda. */
  readonly scroll?: number;
}

/**
 * Sprite do projétil de gelo, todo desenhado em shader: dardo com borda viva e
 * "V" interno na frente, seda translúcida ondulando atrás, partículas de gelo
 * presas ao rastro e uma aura suave. Segue as referências de VFX de cometa.
 *
 * O desenho é espelhado em `tools/preview-frost-bullet.mjs` (mesma matemática
 * em JS, usada para gerar PNG de conferência sem navegador). Mudou aqui, mude
 * lá também.
 */
export function createFrostBulletMaterial(
  options: FrostBulletMaterialOptions = {}
): FrostBulletMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uCore: { value: new THREE.Color(options.core ?? 0xffffff) },
      uGlow: { value: new THREE.Color(options.glow ?? 0x8fe8ff) },
      uDeep: { value: new THREE.Color(options.deep ?? 0x1d6cff) },
      uOpacity: { value: options.opacity ?? 1 },
      uIntensity: { value: options.intensity ?? 1.45 },
      uHeadLength: { value: options.headLength ?? 0.3 },
      uWidth: { value: options.width ?? 0.2 },
      uWisp: { value: options.wisp ?? 1 },
      uFilament: { value: options.filament ?? 1 },
      uSparks: { value: options.sparks ?? 5 },
      uHaze: { value: options.haze ?? 0.35 },
      uSeed: { value: options.seed ?? 0 },
      uScroll: { value: options.scroll ?? 1 },
    },
    vertexShader: COMMON_VERTEX,
    fragmentShader: /* glsl */`
      uniform float uTime;
      uniform vec3 uCore;
      uniform vec3 uGlow;
      uniform vec3 uDeep;
      uniform float uOpacity;
      uniform float uIntensity;
      uniform float uHeadLength;
      uniform float uWidth;
      uniform float uWisp;
      uniform float uFilament;
      uniform float uSparks;
      uniform float uHaze;
      uniform float uSeed;
      uniform float uScroll;
      varying vec2 vUv;
      ${HASH}

      float fbm(vec2 p) {
        float value = 0.0;
        float amplitude = 0.6;
        for (int i = 0; i < 4; i++) {
          value += noise(p) * amplitude;
          p = p * 2.03 + 1.7;
          amplitude *= 0.5;
        }
        return value;
      }

      float seg(vec2 p, vec2 a, vec2 b) {
        vec2 pa = p - a;
        vec2 ba = b - a;
        float h = clamp(dot(pa, ba) / max(1e-5, dot(ba, ba)), 0.0, 1.0);
        return length(pa - ba * h);
      }

      float halfWidthAt(float back) {
        return max(1e-4, uWidth * pow(clamp(back, 0.0, 1.0), 0.78));
      }

      void main() {
        // x: 0 = fim da cauda, 1 = ponta da bala.  y: -1..1 de espessura.
        float x = clamp(vUv.x, 0.0, 1.0);
        float y = (vUv.y - 0.5) * 2.0;
        float t = uTime * uScroll;
        float headStart = clamp(1.0 - uHeadLength, 0.0, 1.0);

        // ---- cauda: seda translúcida, quase toda em vazio -------------------
        // back > 1 é o trecho da fita que corre por baixo do dardo (o dardo
        // cobre), assim o pescoço não termina numa parede reta.
        float back = clamp(x / max(1e-4, headStart), 0.0, 1.18);
        float taper = clamp(back, 0.0, 1.0);
        float halfWidth = halfWidthAt(taper);
        float lengthFade = smoothstep(0.0, 0.2, taper) * pow(taper, 0.42);
        // Dobra da fita: zero no pescoço (para casar com o dardo) e maior na cauda.
        float bend = sin(x * 3.6 - t * 1.5 + uSeed * 6.3) * 0.055 * uWisp * (1.0 - back);
        float tail = y - bend;
        float across = abs(tail) / halfWidth;
        float silkNoise = fbm(vec2(x * 6.0 - t * 0.5, tail * 3.0 + t * 0.1));
        // Tudo que é cauda morre antes do dardo: sem isso os filamentos
        // continuam por dentro da ponta e viram uma faixa reta atravessada.
        float tailMask = 1.0 - smoothstep(0.78, 1.1, back);

        float body = (1.0 - smoothstep(0.35, 1.0, across)) * 0.07
          * (0.45 + 0.55 * silkNoise) * lengthFade * tailMask;
        // Borda da fita: é onde a luz pega, como na referência.
        float ribbonEdge = (1.0 - smoothstep(0.0, 0.1, abs(across - 1.0)))
          * 0.3 * lengthFade * tailMask;

        float streaks = 0.0;
        for (int i = 0; i < 4; i++) {
          float fi = float(i);
          float lane = (fi - 1.5) * 0.44;
          float wave = sin(x * (5.5 + fi * 1.9) - t * 2.1 + fi * 1.7) * 0.5 * uWisp;
          float pos = lane * 1.35 + wave * (0.3 + 0.7 * back);
          float line = 1.0 - smoothstep(0.0, 0.07, abs(across - pos));
          streaks += line * (0.35 + 0.65 * back) * (0.5 + 0.5 * silkNoise);
        }
        streaks *= uFilament * lengthFade * 0.45 * tailMask;

        float centerLine = (1.0 - smoothstep(0.0, 0.05 + 0.03 * (1.0 - back), abs(tail)))
          * pow(back, 1.25) * 0.36 * uFilament * tailMask;

        // ---- dardo (borda viva + "V" interno + ponta) ------------------------
        // O dardo usa 82% do espaço da ponta: o resto fica vazio, senão o
        // perfil cai a zero na borda do sprite e a borda viva vira uma faixa
        // horizontal colada na textura.
        float HEAD_SPAN = 0.82;
        float hxRaw = (x - headStart) / max(1e-4, uHeadLength);
        float hx = clamp(hxRaw / HEAD_SPAN, 0.0, 1.0);
        // Nasce com a largura da fita no pescoço e abre (flare) antes de afinar.
        float flare = mix(1.0, 1.6, smoothstep(0.0, 0.32, hx));
        float hv = (y - bend * 0.15) / max(1e-4, uWidth * flare);
        float profile = pow(clamp(1.0 - hx, 0.0, 1.0), 0.66);
        float inHead = step(0.0, hxRaw) * (1.0 - smoothstep(HEAD_SPAN, HEAD_SPAN + 0.12, hxRaw))
          * smoothstep(0.0, 0.05, x - headStart);

        // As bordas do smoothstep nunca podem se tocar (na ponta o perfil chega
        // a zero, e smoothstep com edge0 == edge1 é indefinido em GLSL).
        float fillInner = profile * 0.92;
        float fillOuter = max(fillInner + 1e-4, profile * 1.02);
        float fill = (1.0 - smoothstep(fillInner, fillOuter, abs(hv)))
          * 0.32 * (0.82 + 0.18 * silkNoise) * smoothstep(0.0, 0.1, hx);
        float rim = (1.0 - smoothstep(0.0, 0.055, abs(abs(hv) - profile))) * 1.0;
        float chevron = 1.0 - smoothstep(
          0.0,
          0.05,
          min(seg(vec2(hx, hv), vec2(0.08, 0.52), vec2(0.58, 0.0)),
              seg(vec2(hx, hv), vec2(0.08, -0.52), vec2(0.58, 0.0)))
        );
        float nose = 1.0 - smoothstep(0.0, 0.3, length(vec2((hx - 0.78) * 1.15, hv * 0.9)));
        float head = (fill + rim + chevron * 0.6 + nose * 0.75) * inHead;

        // ---- aura e gelo solto ----------------------------------------------
        vec2 auraPoint = vec2((x - headStart - 0.04) * 1.25, y * 2.4);
        float aura = exp(-dot(auraPoint, auraPoint) * 3.0) * uHaze;
        // Névoa de volume: leve, senão engorda a cauda e some com a seda.
        vec2 washPoint = vec2((x - 0.45) * 1.6, tail * 2.6);
        float wash = exp(-dot(washPoint, washPoint) * 3.4) * uHaze * 0.22 * lengthFade;

        float sparks = 0.0;
        for (int i = 0; i < 6; i++) {
          if (float(i) < uSparks) {
            float fi = float(i);
            float sx = fract(sin(fi * 12.9898 + uSeed * 7.31) * 43758.5453);
            float sy = fract(sin(fi * 43.123 + uSeed * 3.17) * 24634.6345) * 2.0 - 1.0;
            float side = sy < 0.0 ? -1.0 : 1.0;
            float sparkX = 0.12 + sx * 0.72;
            float localWidth = halfWidthAt(sparkX / max(1e-4, headStart));
            float sparkY = side * (localWidth * (1.35 + 0.75 * abs(sy)) + 0.05);
            float twinkle = 0.55 + 0.45 * sin(uTime * 6.0 + fi * 2.4);
            float size = 0.022 + 0.018 * fract(fi * 5.7 + uSeed);
            float d = length(vec2(x - sparkX, (y - sparkY) * 0.65));
            sparks += (1.0 - smoothstep(0.0, size, d)) * twinkle;
          }
        }

        float sum = body + ribbonEdge + streaks + centerLine + head + aura + wash + sparks;
        if (sum <= 0.004) discard;

        // Branco só no miolo do dardo e no gelo solto; o resto é azul.
        float coreWeight = clamp(chevron * 0.5 + nose * 0.85 + rim * 0.55 + sparks * 1.5, 0.0, 1.0);
        vec3 color = mix(uDeep, uGlow, clamp(sum * 0.95, 0.0, 1.0));
        color = mix(color, uCore, coreWeight);
        gl_FragColor = vec4(color * uIntensity, clamp(sum, 0.0, 1.0) * uOpacity);
      }
    `,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    toneMapped: false,
  }) as FrostBulletMaterial;
}

export function configureFrostBulletMaterial(
  material: FrostBulletMaterial,
  options: FrostBulletMaterialOptions
): void {
  if (options.core !== undefined) material.uniforms.uCore.value.set(options.core);
  if (options.glow !== undefined) material.uniforms.uGlow.value.set(options.glow);
  if (options.deep !== undefined) material.uniforms.uDeep.value.set(options.deep);
  if (options.opacity !== undefined) material.uniforms.uOpacity.value = options.opacity;
  if (options.intensity !== undefined) material.uniforms.uIntensity.value = options.intensity;
  if (options.headLength !== undefined) material.uniforms.uHeadLength.value = options.headLength;
  if (options.width !== undefined) material.uniforms.uWidth.value = options.width;
  if (options.wisp !== undefined) material.uniforms.uWisp.value = options.wisp;
  if (options.filament !== undefined) material.uniforms.uFilament.value = options.filament;
  if (options.sparks !== undefined) material.uniforms.uSparks.value = options.sparks;
  if (options.haze !== undefined) material.uniforms.uHaze.value = options.haze;
  if (options.seed !== undefined) material.uniforms.uSeed.value = options.seed;
  if (options.scroll !== undefined) material.uniforms.uScroll.value = options.scroll;
}

export function setFrostBulletTime(material: FrostBulletMaterial, time: number): void {
  material.uniforms.uTime.value = time;
}
