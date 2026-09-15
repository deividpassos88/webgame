import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import type { RuntimeMaterialRole } from './RuntimeWarriorConfig';
import { getRuntimeWarriorMaterials } from './RuntimeWarriorMaterials';

const MATERIAL_ROLES: readonly RuntimeMaterialRole[] = [
  'skin',
  'eye',
  'hair',
  'cloth',
  'leather',
  'steel',
  'darkMetal',
];

describe('getRuntimeWarriorMaterials', () => {
  it('returns seven stable material roles without texture downloads', () => {
    const materials = getRuntimeWarriorMaterials();
    const roleMaterials = MATERIAL_ROLES.map((role) => materials.get(role));

    expect(Object.values(materials).filter((value) => value instanceof THREE.Material)).toHaveLength(7);
    expect(new Set(roleMaterials).size).toBe(7);
    expect(getRuntimeWarriorMaterials()).toBe(materials);
    expect(getRuntimeWarriorMaterials().steel).toBe(materials.steel);

    for (const role of MATERIAL_ROLES) {
      const material = materials.get(role);
      expect(material).toBeInstanceOf(THREE.MeshStandardMaterial);
      expect(material.map).toBeNull();
      expect(material.aoMap).toBeNull();
      expect(material.alphaMap).toBeNull();
      expect(material.bumpMap).toBeNull();
      expect(material.displacementMap).toBeNull();
      expect(material.emissiveMap).toBeNull();
      expect(material.envMap).toBeNull();
      expect(material.lightMap).toBeNull();
      expect(material.metalnessMap).toBeNull();
      expect(material.normalMap).toBeNull();
      expect(material.roughnessMap).toBeNull();
      expect(material.roughness).toBeGreaterThanOrEqual(0);
      expect(material.roughness).toBeLessThanOrEqual(1);
      expect(material.metalness).toBeGreaterThanOrEqual(0);
      expect(material.metalness).toBeLessThanOrEqual(1);
    }
  });

  it('keeps the authored palette and PBR response distinct by role', () => {
    const materials = getRuntimeWarriorMaterials();

    expect(materials.skin.color.getHex()).toBe(0xa65f47);
    expect(materials.skin.metalness).toBe(0);
    expect(materials.skin.roughness).toBe(0.48);

    expect(materials.eye.color.getHex()).toBe(0x111923);
    expect(materials.eye.metalness).toBe(0);
    expect(materials.eye.roughness).toBe(0.3);

    expect(materials.hair.color.getHex()).toBe(0x24160f);
    expect(materials.hair.metalness).toBe(0);
    expect(materials.hair.roughness).toBe(0.56);

    expect(materials.cloth.color.getHex()).toBe(0x202a32);
    expect(materials.cloth.metalness).toBe(0);
    expect(materials.cloth.roughness).toBe(0.76);

    expect(materials.leather.color.getHex()).toBe(0x4b2313);
    expect(materials.leather.metalness).toBe(0);
    expect(materials.leather.roughness).toBe(0.58);

    expect(materials.steel.color.getHex()).toBe(0x657887);
    expect(materials.steel.metalness).toBe(0.92);
    expect(materials.steel.roughness).toBe(0.24);

    expect(materials.darkMetal.color.getHex()).toBe(0x252d36);
    expect(materials.darkMetal.metalness).toBe(0.82);
    expect(materials.darkMetal.roughness).toBe(0.34);

    expect(materials.skin.color.r).toBeGreaterThan(materials.skin.color.b);
    expect(materials.steel.color.b).toBeGreaterThan(materials.steel.color.r);
    expect(materials.eye.roughness).toBeLessThan(materials.cloth.roughness);
    expect(materials.steel.metalness).toBeGreaterThan(materials.leather.metalness);
  });

  it('injects deterministic local shader variation without frame inputs or samplers', () => {
    const material = getRuntimeWarriorMaterials().steel;
    const shader = {
      vertexShader: '#include <common>\n#include <begin_vertex>',
      fragmentShader: '#include <common>\n#include <color_fragment>',
      uniforms: {},
    } as Parameters<THREE.MeshStandardMaterial['onBeforeCompile']>[0];

    material.onBeforeCompile(shader, {} as THREE.WebGLRenderer);

    expect(shader.vertexShader).toContain('varying vec3 vRuntimeWarriorLocalPosition;');
    expect(shader.vertexShader).toContain('vRuntimeWarriorLocalPosition = position;');
    expect(shader.fragmentShader).toContain('dFdx');
    expect(shader.fragmentShader).toContain('dFdy');
    expect(shader.fragmentShader).toContain('smoothstep');
    expect(shader.fragmentShader).not.toMatch(/sampler\s*2D|texture(?:2D)?\s*\(/i);
    expect(shader.fragmentShader).not.toMatch(/uniform\s+.*(?:time|clock|elapsed)/i);
    expect(material).not.toHaveProperty('skinning');
  });

  it('keeps Three.js standard and skinning anchors while filtering the full local phase', () => {
    const material = getRuntimeWarriorMaterials().steel;
    const standardShader = THREE.ShaderLib.standard;
    const shader = {
      vertexShader: standardShader.vertexShader,
      fragmentShader: standardShader.fragmentShader,
      uniforms: standardShader.uniforms,
    } as Parameters<THREE.MeshStandardMaterial['onBeforeCompile']>[0];
    const materialExtensions = material as THREE.MeshStandardMaterial & {
      extensions: { derivatives: boolean };
    };

    material.onBeforeCompile(shader, {} as THREE.WebGLRenderer);

    expect(materialExtensions.extensions.derivatives).toBe(true);
    expect(shader.vertexShader).toContain('#define STANDARD');
    expect(shader.vertexShader).toContain('#include <skinning_pars_vertex>');
    expect(shader.vertexShader).toContain('#include <skinning_vertex>');
    expect(shader.vertexShader).toContain('vRuntimeWarriorLocalPosition = position;');
    expect(shader.fragmentShader).toContain('#define STANDARD');
    expect(shader.fragmentShader).toContain('#include <lights_physical_fragment>');
    expect(shader.fragmentShader).toMatch(/dFdx\(runtimeWarriorLocalPhase\)/);
    expect(shader.fragmentShader).toMatch(/dFdy\(runtimeWarriorLocalPhase\)/);
  });

  it('injects valid standard-shader roughness and normal paths without bare GLSL markers', () => {
    const standardShader = THREE.ShaderLib.standard;
    const leather = getRuntimeWarriorMaterials().leather;
    const steel = getRuntimeWarriorMaterials().steel;
    const createShader = () => ({
      vertexShader: standardShader.vertexShader,
      fragmentShader: standardShader.fragmentShader,
      uniforms: standardShader.uniforms,
    }) as Parameters<THREE.MeshStandardMaterial['onBeforeCompile']>[0];

    const leatherShader = createShader();
    const steelShader = createShader();
    leather.onBeforeCompile(leatherShader, {} as THREE.WebGLRenderer);
    steel.onBeforeCompile(steelShader, {} as THREE.WebGLRenderer);

    for (const shader of [leatherShader, steelShader]) {
      expect(shader.vertexShader).not.toMatch(/^\s*runtime-warrior-local-variation\s*$/m);
      expect(shader.fragmentShader).not.toMatch(/^\s*runtime-warrior-local-variation\s*$/m);
      expect(shader.vertexShader).toContain('// runtime-warrior-local-variation');
      expect(shader.fragmentShader).toContain('// runtime-warrior-local-variation');

      const roughnessChunk = shader.fragmentShader.indexOf('#include <roughnessmap_fragment>');
      const roughnessInjection = shader.fragmentShader.indexOf('runtimeWarriorRoughnessFactor');
      expect(roughnessChunk).toBeGreaterThanOrEqual(0);
      expect(roughnessInjection).toBeGreaterThan(roughnessChunk);
      expect(shader.fragmentShader).toMatch(/roughnessFactor\s*=\s*clamp\(/);

      const normalChunk = shader.fragmentShader.indexOf('#include <normal_fragment_maps>');
      const normalInjection = shader.fragmentShader.indexOf('runtimeWarriorBumpNormal');
      expect(normalChunk).toBeGreaterThanOrEqual(0);
      expect(normalInjection).toBeGreaterThan(normalChunk);
      expect(shader.fragmentShader).toContain('dFdx(vViewPosition)');
      expect(shader.fragmentShader).toContain('dFdy(vViewPosition)');
      expect(shader.fragmentShader).not.toContain('dFdx(vRuntimeWarriorLocalPosition)');
      expect(shader.fragmentShader).not.toContain('dFdy(vRuntimeWarriorLocalPosition)');
      expect(shader.fragmentShader).toContain('dot(runtimeWarriorSurfaceNormal, normal)');
      expect(shader.fragmentShader).toMatch(/normal\s*=\s*normalize\(/);
    }

    expect(leatherShader.fragmentShader).toContain('0.0800');
    expect(steelShader.fragmentShader).toContain('0.0350');
    expect(leatherShader.fragmentShader).not.toMatch(/runtimeWarrior[^\n]*sampler2D/);
    expect(steelShader.fragmentShader).not.toMatch(/runtimeWarrior[^\n]*sampler2D/);
  });
});
