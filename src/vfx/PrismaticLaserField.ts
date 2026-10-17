import * as THREE from 'three';

/**
 * Campo energético procedural do Raio Prismático.
 *
 * Tal como a skill de gelo, possui shaders para a matéria e geometria 3D
 * para os movimentos. Três cascas transparentes + quatro filamentos
 * tubulares helicoidais. Sem cilindros opacos, círculos ou assets extras.
 */
export const PRISM_FIELD_TUNING = {
  segments: 64,
  radialSides: 8,
  helixTurns: 4.5,
  driftSpeed: 17,
} as const;

const AXIS = new THREE.Vector3(0, 1, 0);
const CENTER = new THREE.Vector3();
const FORWARD = new THREE.Vector3();

const VERTEX = /* glsl */ `
  uniform float uTime;
  uniform float uLayer;
  varying vec2 vUV;
  varying float vN;
  void main() {
    float t = uv.y;
    float envelope = pow(max(0.0, sin(t * 3.14159265)), 0.42);
    float curl = sin(t * 37.0 - uTime * 12.0 + uLayer * 3.1);
    float curl2 = cos(t * 69.0 + uTime * 17.0 - uLayer * 2.2);
    vec3 p = position;
    // A energia não termina em cilindros retos: nasce fina no cajado,
    // engrossa no trajeto e se comprime ao tocar o corpo do alvo.
    float taperIn = smoothstep(0.0, 0.13, t);
    float taperOut = 1.0 - 0.7 * smoothstep(0.81, 1.0, t);
    p.xz *= taperIn * taperOut * (1.0 + envelope * (0.12 * curl + 0.05 * curl2));
    vN = curl * 0.5 + curl2 * 0.5;
    vUV = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }
`;

const FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform float uOpacity;
  uniform float uLayer;
  uniform vec3 uTint;
  varying vec2 vUV;
  varying float vN;
  void main() {
    float t = vUV.y;
    float a = vUV.x * 6.2831853;
    float cap = smoothstep(0.0, 0.13, t) * (1.0 - smoothstep(0.84, 1.0, t));
    float streak = sin(t * 68.0 - uTime * 19.0 + sin(a * 3.0 + uTime * 3.0) * 2.2);
    float plasma = sin(a * 5.0 + t * 51.0 - uTime * 24.0)
      * sin(a * 3.0 - t * 85.0 + uTime * 13.0);
    float tearing = pow(max(0.0, streak * 0.5 + 0.5), 3.0);
    float cable = pow(max(0.0, sin(a * 3.0 + t * 31.0 - uTime * 11.0)), 8.0);
    float ripple = 0.58 + 0.24 * tearing + 0.28 * cable + 0.16 * plasma;
    float beamPulse = 0.9 + 0.1 * sin(uTime * 34.0 - t * 18.0);
    float opacity = cap * uOpacity * beamPulse * max(0.0, ripple);
    if (uLayer < 0.5) opacity *= 0.52;
    else if (uLayer < 1.5) opacity *= 0.81;
    else opacity *= 0.94 + 0.06 * vN;
    opacity = min(opacity, 0.97);
    if (opacity <= 0.003) discard;
    vec3 tint = uTint * (0.88 + tearing * 0.22 + cable * 0.18);
    gl_FragColor = vec4(tint, opacity);
  }
`;

type PrismMaterial = THREE.ShaderMaterial & {
  uniforms: {
    uTime: { value: number };
    uLayer: { value: number };
    uTint: { value: THREE.Color };
    uOpacity: { value: number };
  };
};

function layerMaterial(layer: number, color: number): PrismMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uLayer: { value: layer },
      uTint: { value: new THREE.Color(color) },
      uOpacity: { value: 0 },
    },
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    toneMapped: false,
  }) as PrismMaterial;
}

interface Strand {
  readonly mesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
  readonly position: THREE.BufferAttribute;
  readonly phase: number;
  readonly radius: number;
}

function makeStrand(color: number, phase: number, radius: number, name: string): Strand {
  const steps = PRISM_FIELD_TUNING.segments;
  const sides = PRISM_FIELD_TUNING.radialSides;
  const geometry = new THREE.BufferGeometry();
  const position = new THREE.BufferAttribute(new Float32Array((steps + 1) * sides * 3), 3);
  geometry.setAttribute('position', position);
  const indices: number[] = [];
  for (let i = 0; i < steps; i++) {
    for (let j = 0; j < sides; j++) {
      const a = i * sides + j;
      const b = i * sides + (j + 1) % sides;
      const c = (i + 1) * sides + j;
      const d = (i + 1) * sides + (j + 1) % sides;
      indices.push(a, c, b, b, c, d);
    }
  }
  geometry.setIndex(indices);
  const material = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    depthTest: true,
    side: THREE.DoubleSide,
    toneMapped: false,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;
  mesh.name = name;
  return { mesh, position, phase, radius };
}

/** Instância destinada a um único beam do pool. */
export class PrismaticLaserField {
  public readonly group = new THREE.Group();
  public readonly outer: THREE.Mesh<THREE.CylinderGeometry, PrismMaterial>;
  public readonly body: THREE.Mesh<THREE.CylinderGeometry, PrismMaterial>;
  public readonly core: THREE.Mesh<THREE.CylinderGeometry, PrismMaterial>;
  private readonly strands: Strand[];
  private readonly sharedCylinder = new THREE.CylinderGeometry(1, 1, 1, 20, 56, true);

  public constructor() {
    this.group.name = 'MagePrismaticEnergyField';
    this.outer = new THREE.Mesh(this.sharedCylinder, layerMaterial(0, 0x1546e9));
    this.body = new THREE.Mesh(this.sharedCylinder, layerMaterial(1, 0x24bcff));
    this.core = new THREE.Mesh(this.sharedCylinder, layerMaterial(2, 0xf4ffff));
    this.outer.name = 'MagePrismBlueHalo';
    this.body.name = 'MagePrismCyanBeam';
    this.core.name = 'MagePrismWhiteCore';
    for (const mesh of [this.outer, this.body, this.core]) {
      mesh.frustumCulled = false;
      mesh.renderOrder = 12;
    }
    this.strands = [
      makeStrand(0x3398ff, 0, 0.12, 'MagePrismSpiralBlue'),
      makeStrand(0x6eeaff, Math.PI, 0.105, 'MagePrismSpiralCyan'),
      makeStrand(0xdbffff, Math.PI / 2, 0.043, 'MagePrismFilamentWhite'),
      makeStrand(0x2a69ff, Math.PI * 1.5, 0.065, 'MagePrismSatelliteArc'),
    ];
    for (const strand of this.strands) {
      strand.mesh.renderOrder = 13;
      this.group.add(strand.mesh);
    }
    this.group.add(this.outer, this.body, this.core);
    this.group.visible = false;
  }

  public update(start: THREE.Vector3, end: THREE.Vector3, time: number, strength: number, qualityScale: number): void {
    CENTER.copy(start).add(end).multiplyScalar(0.5);
    FORWARD.subVectors(end, start);
    const length = Math.max(0.04, FORWARD.length());
    FORWARD.normalize();
    this.group.position.copy(CENTER);
    this.group.quaternion.setFromUnitVectors(AXIS, FORWARD);
    this.group.visible = strength > 0.002;
    const width = qualityScale * (0.94 + 0.045 * Math.sin(time * 28));
    const materials = [this.outer.material, this.body.material, this.core.material];
    const widths = [0.51 * width, 0.245 * width, 0.062];
    const opacity = [0.48, 0.77, 0.91];
    const meshes = [this.outer, this.body, this.core];
    for (let k = 0; k < 3; k++) {
      meshes[k].scale.set(widths[k], length, widths[k]);
      materials[k].uniforms.uTime.value = time;
      materials[k].uniforms.uOpacity.value = opacity[k] * strength;
    }

    const steps = PRISM_FIELD_TUNING.segments;
    const sides = PRISM_FIELD_TUNING.radialSides;
    for (let k = 0; k < this.strands.length; k++) {
      const strand = this.strands[k];
      const tube = strand.position;
      const startAngle = strand.phase;
      const orbit = k === 2 ? 0.085 : (k === 3 ? 0.47 : 0.29);
      const tubeWidth = strand.radius * width;
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const envelope = Math.pow(Math.max(0, Math.sin(Math.PI * t)), 0.42);
        const angle = t * Math.PI * PRISM_FIELD_TUNING.helixTurns * 2
          - time * PRISM_FIELD_TUNING.driftSpeed * (k % 2 === 0 ? 1 : -1)
          + startAngle;
        const noise = Math.sin(t * 54 + time * 21 + startAngle) * 0.05 * envelope;
        const radius = (orbit * (0.65 + 0.45 * Math.sin(t * 22 - time * 11 + startAngle)) + noise) * envelope * width;
        const cx = Math.cos(angle) * radius;
        const cz = Math.sin(angle) * radius;
        const thickness = tubeWidth * (0.65 + 0.35 * Math.sin(t * 29 + time * 14 + startAngle)) * envelope;
        for (let j = 0; j < sides; j++) {
          const spin = j * Math.PI * 2 / sides;
          tube.setXYZ(i * sides + j,
            cx + Math.cos(spin) * thickness,
            (t - 0.5) * length,
            cz + Math.sin(spin) * thickness
          );
        }
      }
      tube.needsUpdate = true;
      strand.mesh.material.opacity = strength * (k === 2 ? 0.87 : 0.61);
    }
  }

  public reset(): void {
    this.group.visible = false;
    for (const mesh of [this.outer, this.body, this.core]) mesh.material.uniforms.uOpacity.value = 0;
    for (const strand of this.strands) strand.mesh.material.opacity = 0;
  }

  public dispose(): void {
    this.sharedCylinder.dispose();
    for (const mesh of [this.outer, this.body, this.core]) mesh.material.dispose();
    for (const strand of this.strands) {
      strand.mesh.geometry.dispose();
      strand.mesh.material.dispose();
    }
  }
}
