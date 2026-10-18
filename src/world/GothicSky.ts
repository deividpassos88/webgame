import * as THREE from 'three';

/**
 * The arena ends in a near-black void. No mountains, distant ruins,
 * floating buildings or visible bright horizon behind the pillars.
 *
 * Darkness belongs to the world backdrop only: combat and hero lighting
 * are handled separately in GameLightingRig.
 */
export function createGothicStormSky(parent: THREE.Object3D): THREE.Mesh {
  const sky=new THREE.Mesh(
    new THREE.SphereGeometry(680,36,18),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      depthTest: true,
      fog: false,
      uniforms: {
        upper: { value: new THREE.Color(0x03050a) },
        lower: { value: new THREE.Color(0x090d16) },
      },
      vertexShader: `
        varying vec3 vDirection;
        void main() {
          vDirection=normalize(position);
          gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);
        }
      `,
      fragmentShader: `
        varying vec3 vDirection;
        uniform vec3 upper;
        uniform vec3 lower;
        void main() {
          float t=smoothstep(-0.22,0.75,normalize(vDirection).y);
          gl_FragColor=vec4(mix(lower,upper,t),1.0);
        }
      `,
    })
  );
  sky.name='GothicMistyRuinsStormSky';
  sky.renderOrder=-12;
  sky.frustumCulled=false;
  parent.add(sky);
  return sky;
}
