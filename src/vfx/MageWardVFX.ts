import * as THREE from 'three';
import {
  MAGE_WARD_DURATION_SECONDS,
  MAGE_WARD_RADIUS_METERS,
} from '../combat/MageWardBarrier';

/**
 * A field of thin, refracted energy along a 4-metre boundary around the Mage.
 * The wall deliberately stays transparent: it indicates collision without
 * covering the monsters, skills or the camera with a solid shield.
 */
const WALL_VERTEX = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
const WALL_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform float uOpacity;
  varying vec2 vUv;
  void main() {
    float h = vUv.y;
    float bands = pow(max(0.0, sin(vUv.x * 91.0 - uTime * 8.0 + h * 13.0)), 10.0);
    float ripple = sin(vUv.x * 154.0 + h * 31.0 - uTime * 23.0);
    float edge = pow(1.0 - h, 2.0) * 0.6 + 0.06;
    float alpha = uOpacity * (edge + bands * 0.23 + ripple * ripple * 0.035)
      * smoothstep(0.0, 0.07, h) * (1.0 - smoothstep(0.79, 1.0, h));
    if (alpha < 0.008) discard;
    vec3 color = mix(vec3(0.17, 0.64, 1.0), vec3(0.58, 0.96, 1.0), bands);
    gl_FragColor = vec4(color, min(alpha, 0.23));
  }
`;

export class MageWardVFX {
  public readonly group = new THREE.Group();
  private readonly wall: THREE.Mesh<THREE.CylinderGeometry, THREE.ShaderMaterial>;
  private readonly perimeter: THREE.Mesh<THREE.TorusGeometry, THREE.MeshBasicMaterial>;
  private remaining = 0;
  private elapsed = 0;
  public get active(): boolean { return this.remaining > 0; }
  public get timeRemaining(): number { return this.remaining; }

  public constructor() {
    this.group.name = 'MageTemporaryFourMeterWard';
    this.group.visible = false;
    this.wall = new THREE.Mesh(
      new THREE.CylinderGeometry(MAGE_WARD_RADIUS_METERS, MAGE_WARD_RADIUS_METERS, 1.35, 90, 1, true),
      new THREE.ShaderMaterial({
        uniforms: { uTime: { value: 0 }, uOpacity: { value: 0 } },
        vertexShader: WALL_VERTEX,
        fragmentShader: WALL_FRAGMENT,
        blending: THREE.AdditiveBlending,
        transparent: true,
        depthWrite: false,
        depthTest: true,
        side: THREE.DoubleSide,
        toneMapped: false,
      })
    );
    this.wall.name = 'MageTemporaryWardMembrane';
    this.wall.position.y = 0.65;
    this.wall.frustumCulled = false;
    this.perimeter = new THREE.Mesh(
      new THREE.TorusGeometry(MAGE_WARD_RADIUS_METERS, 0.028, 6, 100),
      new THREE.MeshBasicMaterial({
        color: 0x8bddff, transparent: true, opacity: 0,
        depthWrite: false, depthTest: true,
        blending: THREE.AdditiveBlending, toneMapped: false,
      })
    );
    this.perimeter.rotation.x = -Math.PI / 2;
    this.perimeter.position.y = 0.05;
    this.perimeter.name = 'MageTemporaryWardBoundary';
    this.group.add(this.wall, this.perimeter);
  }

  /** Each successful Mage cast renews the 3-second protection. */
  public activate(position: THREE.Vector3): void {
    this.remaining = MAGE_WARD_DURATION_SECONDS;
    this.elapsed = 0;
    this.group.position.set(position.x, position.y, position.z);
    this.group.visible = true;
    this.draw();
  }

  /** Follow the Mage while active; expire exactly after 3 seconds. */
  public update(delta: number, position: THREE.Vector3): void {
    if (!this.active) return;
    const dt = Math.max(0, delta);
    this.remaining = Math.max(0, this.remaining - dt);
    this.elapsed += dt;
    this.group.position.set(position.x, position.y, position.z);
    if (!this.active) {
      this.reset();
      return;
    }
    this.draw();
  }

  private draw(): void {
    const inOpacity = THREE.MathUtils.smoothstep(this.elapsed, 0, 0.16);
    const outOpacity = THREE.MathUtils.smoothstep(this.remaining, 0, 0.34);
    const opacity = inOpacity * outOpacity;
    this.wall.material.uniforms.uTime.value = this.elapsed;
    this.wall.material.uniforms.uOpacity.value = opacity;
    this.perimeter.material.opacity = (0.3 + 0.09 * Math.sin(this.elapsed * 17)) * opacity;
  }

  public reset(): void {
    this.remaining = 0;
    this.elapsed = 0;
    this.group.visible = false;
    this.wall.material.uniforms.uOpacity.value = 0;
    this.perimeter.material.opacity = 0;
  }

  public dispose(): void {
    this.reset();
    this.group.removeFromParent();
    this.wall.geometry.dispose();
    this.wall.material.dispose();
    this.perimeter.geometry.dispose();
    this.perimeter.material.dispose();
  }
}
