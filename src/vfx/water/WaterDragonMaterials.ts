import * as THREE from 'three';

export type WaterSurfaceKind = 'ribbon' | 'column' | 'veil' | 'head' | 'splash' | 'ripple';
export type WaterSurfaceMaterial = THREE.ShaderMaterial & {
  uniforms: {
    uTime: { value: number };
    uOpacity: { value: number };
    uReveal: { value: number };
    uKind: { value: number };
    uFoamOnly: { value: number };
    uSeed: { value: number };
    uFlowRate: { value: number };
    uTopCut: { value: number };
    uFlowMap: { value: THREE.Texture | null };
    uTextured: { value: number };
    uColumnFill: { value: number };
  };
};

/** Positive column advection moves features from v=1 (sky) to v=0 (floor). */
export const WATER_COLUMN_FLOW_RATE = 6.4;

/**
 * Broad, connected water masses with long whitecaps — not the old lace/noise mask.
 * The local glow layer expands the same silhouette, without a global bloom pass
 * or changing the appearance/performance of the other Mage skills.
 */
export function createWaterSurfaceMaterial(
  kind: WaterSurfaceKind = 'ribbon',
  foamOnly: boolean | 'glow' = false,
  seed = 0
): WaterSurfaceMaterial {
  const column = kind === 'column' || kind === 'veil';
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uOpacity: { value: 0 },
      uReveal: { value: 1 },
      uKind: { value: column ? 1 : kind === 'head' ? 2 : kind === 'splash' ? 3 : kind === 'ripple' ? 4 : 0 },
      uFoamOnly: { value: foamOnly === 'glow' ? 2 : foamOnly ? 1 : 0 },
      uSeed: { value: seed },
      uFlowRate: { value: column ? WATER_COLUMN_FLOW_RATE : -1.8 },
      uTopCut: { value: 1.05 },
      uFlowMap: { value: null },
      uTextured: { value: 0 },
      uColumnFill: { value: kind === 'column' ? 1 : 0 },
    },
    vertexShader: /* glsl */`
      uniform float uTime;
      uniform float uKind;
      uniform float uFoamOnly;
      uniform float uSeed;
      attribute vec3 aFlowCross;
      varying vec2 vUv;
      varying vec3 vNormal;
      varying vec3 vViewPos;
      void main() {
        vUv = uv;
        vNormal = normalize(normalMatrix * normal);
        vec3 p = position;
        bool column = uKind > 0.5 && uKind < 1.5;
        bool head = uKind > 1.5 && uKind < 2.5;
        bool isRippleVertex = uKind > 3.5;
        if (column) {
          // Both geometry and painted streaks travel DOWN; no counter-scrolling veil.
          float wave = p.y * 2.4 + uTime * 13.0;
          float surge = sin(wave + uv.x * 9.0) * 0.095;
          surge += sin(wave * 2.1 - uv.x * 13.0) * 0.045;
          p.xz *= 1.0 + surge;
          p.x += sin(p.y * 1.5 + uTime * 8.0) * 0.07;
        } else {
          float ripple = sin(uv.x * 26.0 - uTime * 7.0 + uSeed) * 0.023;
          p += normal * ripple * (head ? 0.25 : 1.0);
          if (!head && !isRippleVertex) {
            float fringe = pow(abs(uv.y * 2.0 - 1.0), 5.0);
            float tooth = pow(max(0.0, sin(uv.x * 112.0 - uTime * 9.0 + uSeed)), 5.0);
            float scallop = sin(uv.x * 43.0 - uTime * 5.0 + uSeed) * 0.055;
            // Impact splash (kind 3) keeps a soft, rolling edge: no sawtooth "flame" teeth.
            if (uKind < 2.5) p += aFlowCross * sign(uv.y - 0.5) * fringe * (tooth * 0.055 + scallop * 0.45);
            else p += aFlowCross * sign(uv.y - 0.5) * fringe * sin(uv.x * 9.0 - uTime * 3.2 + uSeed) * 0.05;
          }
        }
        if (uFoamOnly > 1.5) {
          if (column) p.xz *= 1.19;
          else if (head) p += normal * 0.10;
          else p += aFlowCross * (uv.y - 0.5) * 0.12;
        }
        vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
        vViewPos = -mvPosition.xyz;
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: /* glsl */`
      uniform float uTime;
      uniform float uOpacity;
      uniform float uReveal;
      uniform float uKind;
      uniform float uFoamOnly;
      uniform float uSeed;
      uniform float uFlowRate;
      uniform float uTopCut;
      uniform sampler2D uFlowMap;
      uniform float uTextured;
      uniform float uColumnFill;
      varying vec2 vUv;
      varying vec3 vNormal;
      varying vec3 vViewPos;
      float hash(vec2 p) {
        p = fract(p * vec2(123.34, 456.21));
        p += dot(p, p + 45.32);
        return fract(p.x * p.y);
      }
      float noise(vec2 p) {
        vec2 i = floor(p), f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x),
                   mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
      }
      float fbm(vec2 p) {
        return noise(p) * 0.65 + noise(p * 2.03 + 5.2) * 0.25 + noise(p * 4.11) * 0.10;
      }
      void main() {
        bool column = uKind > 0.5 && uKind < 1.5;
        bool head = uKind > 1.5 && uKind < 2.5;
        bool splash = uKind > 2.5 && uKind < 3.5;
        bool ripple = uKind > 3.5;
        float along = column ? vUv.y : vUv.x;
        float across = column ? vUv.x : vUv.y;
        float travel = along * (column ? 4.5 : head ? 3.2 : 9.0) + uTime * uFlowRate;
        vec2 flow = vec2(travel * 0.90 + uSeed * 2.1, across * (column ? 9.0 : 6.0));
        float warp = fbm(flow * vec2(1.1, 0.36)) - 0.5;
        float ends = smoothstep(0.0, 0.02, along) * (1.0 - smoothstep(0.985, 1.0, along));
        float reveal = 1.0 - smoothstep(uReveal - 0.07, uReveal, along);
        if (column) {
          ends = smoothstep(0.0, 0.012, along);
          // The tail drains from SKY to FLOOR; the bottom does not grow upward.
          ends *= 1.0 - smoothstep(uTopCut - 0.075, uTopCut, along);
          reveal = 1.0;
        } else if (head) {
          ends = 1.0;
          reveal = 1.0;
        }

        if (ripple) {
          // Concentric ripples from the impact point: thin bright crests, soft troughs,
          // a little radial wobble so the rings never read as perfect geometric circles.
          float r = vUv.x;
          float th = vUv.y * 6.2831853;
          float wobble = 0.024 * sin(th * 5.0 + uSeed) + 0.011 * sin(th * 11.0 - uTime * 2.1);
          float wave = sin((r + wobble) * 9.5 - uTime * 5.0 + uSeed);
          float crest = smoothstep(0.80, 1.0, wave);
          float trough = smoothstep(-0.25, -1.0, wave);
          float fadeR = (1.0 - smoothstep(0.50, 1.0, r)) * smoothstep(0.0, 0.10, r);
          float a = (crest * 0.62 + trough * 0.20) * fadeR * uOpacity;
          if (a < 0.008) discard;
          vec3 rippleColor = mix(vec3(0.02, 0.26, 0.52), vec3(0.62, 0.95, 1.0), crest);
          gl_FragColor = vec4(rippleColor, a);
          return;
        }

        if (splash) {
          // Ground splash = a thin translucent sheet of water: darker, transparent
          // interior, Fresnel-lit rim, ragged foam patches and small sun glints.
          // It spreads on the floor (XZ) and never reads as a flame or plasma tongue.
          vec3 N = normalize(vNormal);
          vec3 V = normalize(vViewPos);
          float fres = pow(1.0 - abs(dot(N, V)), 2.4);
          float edgeMask = 1.0 - pow(abs(across * 2.0 - 1.0), 2.2);
          float tipMask = 1.0 - smoothstep(0.55, 1.0, along);
          float rootMask = smoothstep(0.0, 0.14, along);
          float roll = sin(along * 11.0 - uTime * 4.2 + uSeed * 1.7 + warp * 3.2) * 0.5 + 0.5;
          float body = edgeMask * tipMask * rootMask * reveal;
          // Irregular foam: noise patches, not stripes. Foam only where the sheet thins out.
          float patchNoise = fbm(vec2(along * 6.5 - uTime * 1.6 + uSeed, across * 4.2 + warp * 1.5));
          float foamMask = smoothstep(0.56, 0.80, patchNoise) * smoothstep(0.35, 0.9, along) * smoothstep(0.15, 0.8, edgeMask);
          float glint = pow(noise(vec2(along * 18.0 - uTime * 2.4, across * 7.0 + uSeed)), 13.0);
          // Lifted blues: deep water still reads as blue on the dark floor, not as black holes.
          vec3 deep = vec3(0.03, 0.27, 0.58);
          vec3 shallow = vec3(0.10, 0.66, 0.96);
          vec3 waterColor = mix(deep, shallow, 0.25 + 0.45 * roll);
          waterColor += vec3(0.42, 0.90, 1.0) * fres * 0.75;
          if (uFoamOnly > 1.5) {
            // Local contour glow: a faint blue halo under the sheet.
            float a = body * 0.10 * uOpacity;
            if (a < 0.008) discard;
            gl_FragColor = vec4(vec3(0.0, 0.50, 1.0), a);
            return;
          }
          if (uFoamOnly > 0.5) {
            // Additive spray: foam patches plus glints, dim enough to stay watery.
            float a = (foamMask * 0.30 + glint * 0.38 * edgeMask) * body * uOpacity;
            if (a < 0.008) discard;
            gl_FragColor = vec4(mix(vec3(0.40, 0.88, 1.0), vec3(0.88, 1.0, 1.0), glint), a);
            return;
          }
          float bodyAlpha = body * mix(0.46, 0.92, fres) * uOpacity;
          bodyAlpha += foamMask * body * 0.12 * uOpacity;
          if (bodyAlpha < 0.008) discard;
          gl_FragColor = vec4(waterColor, bodyAlpha);
          return;
        }

        vec3 color;
        float alpha;
        if (uTextured > 0.5) {
          // Painted, tapering whitecaps replace the uniform procedural stripes.
          // A single shared texture and one distortion field keep overdraw cheap.
          float repeats = column ? 0.65 : head ? 0.78 : splash ? 1.25 : 2.65;
          float scroll = uTime * uFlowRate * (column ? 0.12 : 0.095);
          float transverse = column ? mix(fract(across), 0.16 + fract(across) * 0.68, uColumnFill) : across;
          transverse += warp * (column ? 0.035 : 0.055);
          vec4 water = texture2D(uFlowMap, vec2(along * repeats + scroll + uSeed * 0.13, transverse));
          float paintedFoam = smoothstep(0.16, 0.62, water.r) * smoothstep(0.55, 0.9, water.g);
          // Column water reads as deep, translucent sea-blue; no neon, no light-beam cast.
          color = water.rgb * (column ? vec3(0.74, 1.00, 1.10) : vec3(0.90, 1.14, 1.15));
          // Keep the core connected; only the outer veil has torn alpha edges.
          color = max(color, vec3(0.012, 0.38, 0.76) * uColumnFill);
          if (column) color += vec3(0.0, 0.065, 0.095);
          alpha = mix(water.a, 0.96, uColumnFill) * (column ? 0.95 : 0.96);
          if (uFoamOnly > 1.5) {
            float contour = column || head ? pow(abs(vNormal.z), 1.4) : 1.0;
            alpha = water.a * (0.045 + paintedFoam * 0.14) * contour;
            color = vec3(0.015, 0.7, 1.0);
          } else if (uFoamOnly > 0.5) {
            alpha = paintedFoam * water.a * 0.58;
            color = mix(vec3(0.06, 0.82, 1.0), column ? vec3(0.62, 0.94, 1.0) : vec3(0.82, 1.0, 1.0), paintedFoam);
          }
        } else {
          // Standalone/material-test fallback; not evaluated by the textured path.
          float mass = fbm(flow + vec2(0.0, warp * 2.8));
          float edge = min(across, 1.0 - across);
          float body = column || head ? 1.0 : smoothstep(0.01, 0.12, edge);
          float foam = smoothstep(0.56, 0.73, mass);
          color = mix(vec3(0.005, 0.22, 0.55), vec3(0.02, 0.80, 1.0), mass);
          color = mix(color, vec3(0.76, 1.0, 1.0), foam);
          alpha = body * 0.92;
          if (uFoamOnly > 1.5) {
            alpha *= 0.12;
            color = vec3(0.0, 0.52, 1.0);
          } else if (uFoamOnly > 0.5) {
            alpha *= foam * 0.68;
          }
        }
        if (column && uFoamOnly < 0.5) {
          // Falling water: lit rim, slightly see-through centre, bright streaks sliding DOWN.
          vec3 N = normalize(vNormal);
          vec3 V = normalize(vViewPos);
          float fres = pow(1.0 - abs(dot(N, V)), 2.2);
          float streak = pow(noise(vec2(across * 38.0 + uSeed * 3.1, along * 2.4 + uTime * 2.8)), 6.0);
          float streak2 = pow(noise(vec2(across * 17.0 - uSeed * 1.3, along * 1.3 + uTime * 1.6)), 5.0);
          color += vec3(0.50, 0.90, 1.0) * (fres * 0.50 + streak * 0.65 + streak2 * 0.35) * uColumnFill;
          color *= mix(1.0, 0.82, 1.0 - fres);
          alpha = mix(alpha * 0.80, 1.0, fres);
        }
        alpha *= ends * reveal * uOpacity;
        if (alpha < 0.008) discard;
        gl_FragColor = vec4(color, alpha);
      }
    `,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    side: THREE.DoubleSide,
    forceSinglePass: true,
    blending: foamOnly ? THREE.AdditiveBlending : THREE.NormalBlending,
    toneMapped: false,
  }) as WaterSurfaceMaterial;
}

export function animateWaterMaterial(
  material: WaterSurfaceMaterial,
  time: number,
  opacity: number,
  reveal = 1,
  topCut = 1.05
): void {
  material.uniforms.uTime.value = time;
  material.uniforms.uOpacity.value = opacity;
  material.uniforms.uReveal.value = reveal;
  material.uniforms.uTopCut.value = topCut;
}

/** Texture ownership stays with MageVFXResources, never with a pooled mesh. */
export function bindWaterFlowTexture(material: WaterSurfaceMaterial, texture: THREE.Texture): void {
  material.uniforms.uFlowMap.value = texture;
  material.uniforms.uTextured.value = 1;
}
