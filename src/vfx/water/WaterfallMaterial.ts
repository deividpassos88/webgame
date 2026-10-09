import * as THREE from 'three';
import { createWaterSurfaceMaterial, type WaterSurfaceMaterial } from './WaterDragonMaterials';

/** Dedicated to the sky strike: the charge dragon and ground splash keep their materials. */
export function createWaterfallMaterial(
  kind: 'column' | 'veil',
  layer: boolean | 'glow' = false,
  seed = 4
): WaterSurfaceMaterial {
  const material = createWaterSurfaceMaterial(kind, layer, seed);
  // Foam reflects light instead of adding a second cyan light source over the water.
  material.blending = layer === 'glow' ? THREE.AdditiveBlending : THREE.NormalBlending;
  material.vertexShader = /* glsl */`
    uniform float uTime;
    uniform float uFoamOnly;
    uniform float uSeed;
    varying vec2 vUv;
    varying vec3 vWorldPosition;
    varying vec3 vWaterNormal;
    void main() {
      vUv = uv;
      vec3 p = position;
      vec2 radial = normalize(p.xz + vec2(0.0001));
      float angle = atan(radial.y, radial.x);
      // y + time moves every crest downward. Integer angular frequencies close the seam.
      float fall = p.y * 2.3 + uTime * 13.0;
      float a = fall + angle * 3.0 + uSeed;
      float b = fall * 1.73 - angle * 5.0;
      float wave = sin(a) * 0.060 + sin(b) * 0.028;
      p.xz += radial * wave;
      p.x += sin(p.y * 0.85 + uTime * 4.8) * 0.045;
      p.z += cos(p.y * 1.1 + uTime * 5.7) * 0.035;
      // Derivatives of the radial waves tilt the reflection with the moving surface.
      float slopeY = cos(a) * 0.138 + cos(b) * 0.1114;
      float slopeAngle = cos(a) * 0.18 - cos(b) * 0.14;
      vec3 n = normalize(vec3(radial.x, -slopeY, radial.y)
        - vec3(-radial.y, 0.0, radial.x) * slopeAngle);
      if (uFoamOnly > 1.5) p.xz += radial * 0.018;
      else if (uFoamOnly > 0.5) p.xz += radial * 0.004;
      vec4 view = modelViewMatrix * vec4(p, 1.0);
      vWorldPosition = (modelMatrix * vec4(p, 1.0)).xyz;
      vWaterNormal = normalize(mat3(modelMatrix) * n);
      gl_Position = projectionMatrix * view;
    }
  `;
  material.fragmentShader = /* glsl */`
    uniform float uTime;
    uniform float uOpacity;
    uniform float uTopCut;
    uniform float uFoamOnly;
    uniform float uColumnFill;
    uniform float uSeed;
    uniform float uFlowRate;
    uniform sampler2D uFlowMap;
    uniform float uTextured;
    varying vec2 vUv;
    varying vec3 vWorldPosition;
    varying vec3 vWaterNormal;
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
    void main() {
      float along = vUv.y;
      float across = fract(vUv.x);
      float travel = along * 4.5 + uTime * uFlowRate;
      // Periodic domain keeps the core's UV seam closed; veils get separate seeds.
      float angle = across * 6.2831853;
      vec2 circumference = vec2(cos(angle), sin(angle));
      vec2 stream = circumference * 3.2 + vec2(travel * 0.28, travel);
      float broad = noise(stream + uSeed);
      float fine = noise(circumference * 9.0 + vec2(travel * 0.5, travel * 1.7));
      float water = broad * 0.72 + fine * 0.28;
      // Sparse, broken aerated streaks rather than a fully painted luminous tube.
      float foam = smoothstep(0.66, 0.87, water);
      if (uTextured > 0.5) {
        vec4 painted = texture2D(uFlowMap, vec2(along * 0.65
          + uTime * uFlowRate * 0.12 + uSeed * 0.13, 0.16 + across * 0.68));
        foam = max(foam, smoothstep(0.80, 0.97, painted.r)
          * smoothstep(0.78, 0.98, painted.g) * 0.20);
      }
      float edges = smoothstep(0.0, 0.10, across)
        * (1.0 - smoothstep(0.90, 1.0, across));
      float veil = edges * smoothstep(0.20, 0.47, broad);
      float coverage = mix(veil, 1.0, uColumnFill);
      float ends = smoothstep(0.0, 0.016, along)
        * (1.0 - smoothstep(0.92, 1.0, along))
        * (1.0 - smoothstep(uTopCut - 0.075, uTopCut, along));
      vec3 V = normalize(cameraPosition - vWorldPosition);
      vec3 N = normalize(vWaterNormal);
      if (!gl_FrontFacing) N = -N;
      N = normalize(N + vec3((fine - 0.5) * 0.20, (broad - 0.5) * 0.12, 0.0));
      float facing = clamp(abs(dot(N, V)), 0.0, 1.0);
      // Water IOR ~1.33: small head-on reflectance and bright grazing reflections.
      float fresnel = 0.0204 + 0.9796 * pow(1.0 - facing, 5.0);
      vec3 reflection = reflect(-V, N);
      // Modest local environment approximation: no extra scene render/refraction pass.
      vec3 reflected = mix(vec3(0.035, 0.075, 0.11), vec3(0.49, 0.65, 0.74),
        smoothstep(-0.35, 0.8, reflection.y));
      vec3 lightDir = normalize(vec3(-0.4, 0.8, 0.5));
      float specular = pow(max(dot(N, normalize(V + lightDir)), 0.0), 72.0);
      float thickness = mix(0.15, 1.3, uColumnFill) * (1.0 - facing * 0.45);
      vec3 transmission = exp(-vec3(1.8, 0.48, 0.30) * thickness);
      vec3 color = mix(vec3(0.10, 0.33, 0.40) * transmission,
        reflected, fresnel * 0.82) + vec3(0.90, 0.97, 1.0) * specular * 0.65;
      color = mix(color, vec3(0.69, 0.83, 0.86), foam * 0.55);
      float alpha = mix(0.10, 0.37, uColumnFill) + fresnel * 0.38 + foam * 0.18;
      if (uFoamOnly > 1.5) {
        // A restrained edge glint; never the broad neon halo of the old column.
        color = vec3(0.25, 0.58, 0.65);
        alpha = fresnel * 0.035;
      } else if (uFoamOnly > 0.5) {
        color = vec3(0.78, 0.89, 0.91);
        alpha = foam * 0.32;
      }
      alpha *= coverage * ends * uOpacity;
      if (alpha < 0.005) discard;
      gl_FragColor = vec4(color, alpha);
    }
  `;
  return material;
}
