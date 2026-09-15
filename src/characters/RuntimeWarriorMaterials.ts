import * as THREE from 'three';
import type { RuntimeMaterialRole } from './RuntimeWarriorConfig';

export interface RuntimeWarriorMaterialLibrary {
  readonly skin: THREE.MeshStandardMaterial;
  readonly eye: THREE.MeshStandardMaterial;
  readonly hair: THREE.MeshStandardMaterial;
  readonly cloth: THREE.MeshStandardMaterial;
  readonly leather: THREE.MeshStandardMaterial;
  readonly steel: THREE.MeshStandardMaterial;
  readonly darkMetal: THREE.MeshStandardMaterial;
  get(role: RuntimeMaterialRole): THREE.MeshStandardMaterial;
  /** Toggle only the merged runtime-sword vertices in the dark-metal shader. */
  setRuntimeSwordEquipped(equipped: boolean): void;
}

/** Attribute carried by the merged dark-metal geometry; 1 means sword vertex. */
export const RUNTIME_WARRIOR_SWORD_VISIBILITY_ATTRIBUTE = 'runtimeWarriorSwordVisibility';

const MATERIAL_ROLES: readonly RuntimeMaterialRole[] = [
  'skin',
  'eye',
  'hair',
  'cloth',
  'leather',
  'steel',
  'darkMetal',
];

interface RuntimeWarriorMaterialOptions {
  readonly color: number;
  readonly metalness: number;
  readonly roughness: number;
  readonly roughnessVariation: number;
  readonly bumpStrength: number;
}

const MATERIAL_OPTIONS: Readonly<Record<RuntimeMaterialRole, RuntimeWarriorMaterialOptions>> = {
  // The restrained palette keeps the runtime character readable under the
  // game's cool ambient light and warm player key light.
  skin: { color: 0xa65f47, metalness: 0, roughness: 0.48, roughnessVariation: 0.02, bumpStrength: 0.018 },
  eye: { color: 0x111923, metalness: 0, roughness: 0.3, roughnessVariation: 0.015, bumpStrength: 0.008 },
  hair: { color: 0x24160f, metalness: 0, roughness: 0.56, roughnessVariation: 0.045, bumpStrength: 0.022 },
  cloth: { color: 0x202a32, metalness: 0, roughness: 0.76, roughnessVariation: 0.06, bumpStrength: 0.028 },
  leather: { color: 0x4b2313, metalness: 0, roughness: 0.58, roughnessVariation: 0.075, bumpStrength: 0.08 },
  steel: { color: 0x657887, metalness: 0.92, roughness: 0.24, roughnessVariation: 0.035, bumpStrength: 0.035 },
  darkMetal: { color: 0x252d36, metalness: 0.82, roughness: 0.34, roughnessVariation: 0.04, bumpStrength: 0.03 },
};

const LOCAL_POSITION_VARYING = 'vRuntimeWarriorLocalPosition';
const LOCAL_POSITION_DECLARATION = `varying vec3 ${LOCAL_POSITION_VARYING};`;
const LOCAL_POSITION_ASSIGNMENT = `${LOCAL_POSITION_VARYING} = position;`;
const LOCAL_VARIATION_MARKER = 'runtime-warrior-local-variation';
const LOCAL_VARIATION_COMMENT = `// ${LOCAL_VARIATION_MARKER}`;
const SWORD_VISIBILITY_MARKER = 'runtime-warrior-sword-visibility';
const SWORD_VISIBILITY_COMMENT = `// ${SWORD_VISIBILITY_MARKER}`;
const SWORD_VISIBILITY_VARYING = 'vRuntimeWarriorSwordVisibility';
const SWORD_VISIBILITY_UNIFORM = 'runtimeWarriorSwordEquipped';

interface RuntimeWarriorSwordVisibilityUniform {
  value: number;
}

const LOCAL_PHASE_DECLARATION = `
// ${LOCAL_VARIATION_MARKER}: deterministic, texture-free surface breakup
float runtimeWarriorLocalPhase = dot(
  ${LOCAL_POSITION_VARYING},
  vec3(5.0, 11.0, 3.0)
);
float runtimeWarriorLocalPattern = sin(runtimeWarriorLocalPhase);
float runtimeWarriorLocalDerivative = max(
  0.0001,
  length(vec2(dFdx(runtimeWarriorLocalPhase), dFdy(runtimeWarriorLocalPhase)))
);
float runtimeWarriorLocalBand = smoothstep(
  -runtimeWarriorLocalDerivative * 2.0,
  runtimeWarriorLocalDerivative * 2.0,
  runtimeWarriorLocalPattern
);
float runtimeWarriorLocalVariation = mix(0.978, 1.022, runtimeWarriorLocalBand);
diffuseColor.rgb *= runtimeWarriorLocalVariation;
`;

function formatStrength(value: number): string {
  return value.toFixed(4);
}

function createRoughnessVariation(options: RuntimeWarriorMaterialOptions): string {
  const variation = formatStrength(options.roughnessVariation);
  return `
${LOCAL_VARIATION_COMMENT}: bounded deterministic roughness variation
float runtimeWarriorRoughnessSignal = 0.5 + 0.5 * sin(runtimeWarriorLocalPhase);
float runtimeWarriorRoughnessFactor = clamp(
  roughnessFactor * mix(1.0 - ${variation}, 1.0 + ${variation}, runtimeWarriorRoughnessSignal),
  0.045,
  1.0
);
roughnessFactor = clamp(runtimeWarriorRoughnessFactor, 0.045, 1.0);
`;
}

function createNormalPerturbation(options: RuntimeWarriorMaterialOptions): string {
  const strength = formatStrength(options.bumpStrength);
  return `
${LOCAL_VARIATION_COMMENT}: derivative-safe procedural normal perturbation
// vViewPosition and normal are both expressed in view space at this anchor.
vec3 runtimeWarriorDerivativeX = dFdx(vViewPosition);
vec3 runtimeWarriorDerivativeY = dFdy(vViewPosition);
vec3 runtimeWarriorSurfaceNormal = cross(runtimeWarriorDerivativeX, runtimeWarriorDerivativeY);
float runtimeWarriorSurfaceArea = length(runtimeWarriorSurfaceNormal);
if (runtimeWarriorSurfaceArea > 0.0001) {
  runtimeWarriorSurfaceNormal = normalize(runtimeWarriorSurfaceNormal);
  if (dot(runtimeWarriorSurfaceNormal, normal) < 0.0) {
    runtimeWarriorSurfaceNormal = -runtimeWarriorSurfaceNormal;
  }
  vec3 runtimeWarriorBumpNormal = normalize(mix(normal, runtimeWarriorSurfaceNormal, ${strength}));
  normal = normalize(runtimeWarriorBumpNormal);
}
`;
}

/**
 * Three.js derives USE_SKINNING from the object being rendered.  The
 * material deliberately has no skinning flag of its own; generated
 * SkinnedMesh instances select that path when the renderer builds the
 * standard shader.
 */
type MaterialWithDerivativeExtension = THREE.MeshStandardMaterial & {
  extensions?: { derivatives?: boolean };
};

function enableDerivativeExtension(material: THREE.MeshStandardMaterial): void {
  const materialWithExtensions = material as MaterialWithDerivativeExtension;
  materialWithExtensions.extensions = {
    ...(materialWithExtensions.extensions ?? {}),
    derivatives: true,
  };
}

function addAfterInclude(source: string, include: string, addition: string): string {
  if (!source.includes(include)) return source;
  return source.replace(include, `${include}\n${addition}`);
}

function installLocalVariation(
  material: THREE.MeshStandardMaterial,
  options: RuntimeWarriorMaterialOptions,
  swordVisibilityUniform?: RuntimeWarriorSwordVisibilityUniform
): void {
  enableDerivativeExtension(material);
  material.onBeforeCompile = (shader) => {
    if (!shader.vertexShader.includes(LOCAL_VARIATION_COMMENT)) {
      shader.vertexShader = addAfterInclude(
        shader.vertexShader,
        '#include <common>',
        `${LOCAL_VARIATION_COMMENT}\n${LOCAL_POSITION_DECLARATION}`
      );
      shader.vertexShader = addAfterInclude(
        shader.vertexShader,
        '#include <begin_vertex>',
        `${LOCAL_VARIATION_COMMENT}\n${LOCAL_POSITION_ASSIGNMENT}`
      );
    }

    if (!shader.fragmentShader.includes(LOCAL_VARIATION_COMMENT)) {
      shader.fragmentShader = addAfterInclude(
        shader.fragmentShader,
        '#include <common>',
        `${LOCAL_VARIATION_COMMENT}\n${LOCAL_POSITION_DECLARATION}`
      );
      shader.fragmentShader = addAfterInclude(
        shader.fragmentShader,
        '#include <color_fragment>',
        LOCAL_PHASE_DECLARATION
      );
      shader.fragmentShader = addAfterInclude(
        shader.fragmentShader,
        '#include <roughnessmap_fragment>',
        createRoughnessVariation(options)
      );
      shader.fragmentShader = addAfterInclude(
        shader.fragmentShader,
        '#include <normal_fragment_maps>',
        createNormalPerturbation(options)
      );
    }

    if (!swordVisibilityUniform) return;

    shader.uniforms[SWORD_VISIBILITY_UNIFORM] = swordVisibilityUniform;
    if (!shader.vertexShader.includes(SWORD_VISIBILITY_COMMENT)) {
      shader.vertexShader = addAfterInclude(
        shader.vertexShader,
        '#include <common>',
        `${SWORD_VISIBILITY_COMMENT}\n` +
          `attribute float ${RUNTIME_WARRIOR_SWORD_VISIBILITY_ATTRIBUTE};\n` +
          `varying float ${SWORD_VISIBILITY_VARYING};`
      );
      shader.vertexShader = addAfterInclude(
        shader.vertexShader,
        '#include <begin_vertex>',
        `${SWORD_VISIBILITY_COMMENT}\n` +
          `${SWORD_VISIBILITY_VARYING} = ${RUNTIME_WARRIOR_SWORD_VISIBILITY_ATTRIBUTE};`
      );
    }
    if (!shader.fragmentShader.includes(SWORD_VISIBILITY_COMMENT)) {
      shader.fragmentShader = addAfterInclude(
        shader.fragmentShader,
        '#include <common>',
        `${SWORD_VISIBILITY_COMMENT}\n` +
          `uniform float ${SWORD_VISIBILITY_UNIFORM};\n` +
          `varying float ${SWORD_VISIBILITY_VARYING};`
      );
      shader.fragmentShader = addAfterInclude(
        shader.fragmentShader,
        '#include <color_fragment>',
        `${SWORD_VISIBILITY_COMMENT}\n` +
          `if (${SWORD_VISIBILITY_VARYING} > 0.5 && ${SWORD_VISIBILITY_UNIFORM} < 0.5) {\n` +
          `  discard;\n` +
          `}`
      );
    }
  };
}

function createMaterial(
  role: RuntimeMaterialRole,
  swordVisibilityUniform?: RuntimeWarriorSwordVisibilityUniform
): THREE.MeshStandardMaterial {
  const options = MATERIAL_OPTIONS[role];
  const material = new THREE.MeshStandardMaterial({
    color: options.color,
    metalness: options.metalness,
    roughness: options.roughness,
  });
  material.name = `RuntimeWarrior_${role}`;
  installLocalVariation(material, options, swordVisibilityUniform);
  return material;
}

function createMaterialLibrary(): RuntimeWarriorMaterialLibrary {
  const roleMaterials = {} as Record<RuntimeMaterialRole, THREE.MeshStandardMaterial>;
  const swordVisibilityUniform: RuntimeWarriorSwordVisibilityUniform = { value: 0 };
  for (const role of MATERIAL_ROLES) {
    roleMaterials[role] = createMaterial(
      role,
      role === 'darkMetal' ? swordVisibilityUniform : undefined
    );
  }

  const library: RuntimeWarriorMaterialLibrary = {
    skin: roleMaterials.skin,
    eye: roleMaterials.eye,
    hair: roleMaterials.hair,
    cloth: roleMaterials.cloth,
    leather: roleMaterials.leather,
    steel: roleMaterials.steel,
    darkMetal: roleMaterials.darkMetal,
    get(role: RuntimeMaterialRole): THREE.MeshStandardMaterial {
      return roleMaterials[role];
    },
    setRuntimeSwordEquipped(equipped: boolean): void {
      swordVisibilityUniform.value = equipped ? 1 : 0;
    },
  };

  return Object.freeze(library);
}

let runtimeWarriorMaterials: RuntimeWarriorMaterialLibrary | undefined;

export function getRuntimeWarriorMaterials(): RuntimeWarriorMaterialLibrary {
  runtimeWarriorMaterials ??= createMaterialLibrary();
  return runtimeWarriorMaterials;
}
