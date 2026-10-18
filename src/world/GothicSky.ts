import * as THREE from 'three';

/** Atmospheric background from the gothic reference; only environment changes. */
export function createGothicStormSky(parent:THREE.Object3D):THREE.Mesh {
  const sky=new THREE.Mesh(
    new THREE.SphereGeometry(680,48,24),
    new THREE.ShaderMaterial({
      side:THREE.BackSide,depthWrite:false,depthTest:true,fog:false,
      uniforms:{
        zenith:{value:new THREE.Color(0x243a54)},
        horizon:{value:new THREE.Color(0x8094ac)},
        distant:{value:new THREE.Color(0x455c77)}
      },
      vertexShader:`
        varying vec3 vSkyDirection;
        void main() {
          vSkyDirection=normalize(position);
          gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);
        }
      `,
      fragmentShader:`
        varying vec3 vSkyDirection;
        uniform vec3 zenith;
        uniform vec3 horizon;
        uniform vec3 distant;
        float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
        float noise(vec2 p){
          vec2 i=floor(p),f=fract(p);
          f=f*f*(3.0-2.0*f);
          return mix(mix(hash(i),hash(i+vec2(1.0,0.0)),f.x),
                     mix(hash(i+vec2(0.0,1.0)),hash(i+1.0),f.x),f.y);
        }
        void main(){
          vec3 dir=normalize(vSkyDirection);
          float h=clamp(dir.y*0.98+0.26,0.0,1.0);
          vec3 sky=mix(horizon,distant,smoothstep(0.02,0.58,h));
          sky=mix(sky,zenith,smoothstep(0.48,1.0,h));
          vec2 uv=vec2(atan(dir.z,dir.x)*2.8,dir.y*8.8);
          float clouds=noise(uv*1.45)*0.6+noise(uv*3.1)*0.32+
            noise(uv*6.2)*0.08;
          float band=smoothstep(0.37,0.64,clouds)*
            (1.0-smoothstep(0.44,0.85,h));
          sky+=vec3(0.19,0.21,0.24)*band;
          sky-=vec3(0.065,0.058,0.055)*smoothstep(0.52,0.75,clouds);
          gl_FragColor=vec4(clamp(sky,0.0,1.0),1.0);
        }
      `
    })
  );
  sky.name='GothicMistyRuinsStormSky';
  sky.renderOrder=-12;
  sky.frustumCulled=false;
  parent.add(sky);
  return sky;
}
