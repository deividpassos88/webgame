import * as THREE from 'three';

/**
 * The Mage's skill-4 finisher, modelled after the reference rather than a
 * collection of flat concentric outlines. All times are relative to detonate().
 *
 * Charge: for the full duration of the laser, cyan ground halo and elevated
 * magenta-white nucleus crackle. The final beam hit triggers the rupture.
 * Rupture 0-.22s: broad branching white/cyan lightning and white flash.
 * Vortex .22-.98s: an intensely white plasma pool wrapped in 3D magenta fire.
 * Fade .98-1.30s: residual white core and particles dissipate.
 *
 * The charge during the laser is deliberately separate from the final-damage
 * callback: changing this animation NEVER changes gameplay damage timing.
 *
 * This class owns VISUALS ONLY. Damage, knockdown and the invisible skill-4
 * collision field are handled elsewhere and remain unchanged.
 */
export const PRISM_EXPLOSION_TIMING = {
  charge: 2.0,
  rupture: 0.22,
  vortexEnd: 0.98,
  fadeEnd: 1.30,
} as const;

const TWO_PI = Math.PI * 2;
const UP = new THREE.Vector3(0, 1, 0);
const QUAD_VERTEX = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const GROUND_FRAGMENT = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  uniform float uTime;
  uniform float uOpacity;
  void main() {
    vec2 p = (vUv - 0.5) * 2.0;
    float r = length(p);
    float a = atan(p.y, p.x);
    float irregular = 0.025*sin(a*13.0+uTime*17.0)
      + 0.015*sin(a*37.0-uTime*22.0);
    float disc = (1.0-smoothstep(0.70,0.99,r+irregular))*0.14;
    float rim = exp(-pow((r-0.76-irregular)*27.0,2.0))*0.74;
    float runes = pow(max(0.0,sin(a*42.0+uTime*11.0)),12.0)*rim*0.32;
    float alpha = (disc+rim+runes)*uOpacity;
    if(alpha<0.01)discard;
    vec3 color = mix(vec3(0.20,0.72,1.25),vec3(0.72,1.04,1.30),rim);
    gl_FragColor = vec4(color,min(0.62,alpha));
  }
`;

/** The reference is dominated by an overexposed WHITE pool, not outlines. */
const VORTEX_FRAGMENT = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  uniform float uTime;
  uniform float uOpacity;
  void main() {
    vec2 p=(vUv-0.5)*2.0;
    float r=length(p);
    float a=atan(p.y,p.x);
    float t=uTime;
    float distortion=0.055*sin(a*6.0-t*18.0)
      +0.025*sin(a*19.0+t*37.0);
    float molten=0.57+distortion;
    float whitePool=(1.0-smoothstep(0.23,molten,r));
    float rim=exp(-pow((r-molten)*13.0,2.0));
    float turns=exp(-pow((r-0.69-0.07*sin(a*4.0-t*15.0))*10.0,2.0));
    float radialLicks=pow(max(0.0,sin(a*17.0-t*20.0)),9.0)
      *exp(-pow((r-0.78)*9.0,2.0));
    float alpha=uOpacity*(whitePool*0.90+rim*0.44+turns*0.25+radialLicks*0.32);
    alpha*=1.0-smoothstep(0.91,1.02,r);
    if(alpha<0.008)discard;
    vec3 white=vec3(1.47,1.43,1.55);
    vec3 violet=vec3(0.66,0.21,1.25);
    vec3 pink=vec3(1.16,0.5,1.24);
    vec3 color=mix(violet,pink,clamp(r*1.3,0.0,1.0));
    color=mix(color,white,whitePool*0.95+rim*0.31);
    gl_FragColor=vec4(color,min(0.99,alpha));
  }
`;

const BAND_VERTEX = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv=uv;
    gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);
  }
`;
const BAND_FRAGMENT = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  uniform float uTime;
  uniform float uOpacity;
  uniform vec3 uColor;
  void main() {
    float core = pow(max(0.0,1.0-abs(vUv.x*2.0-1.0)),1.2);
    float cuts = sin(vUv.y*40.4+uTime*13.0)
      + 0.35*sin(vUv.y*113.2-uTime*23.0);
    float gaps = smoothstep(-1.00,-0.36,cuts);
    float hot = pow(core,3.4);
    float flicker = 0.83+0.17*sin(vUv.y*85.0-uTime*25.0);
    float alpha = (core*0.35+hot*0.65)*gaps*flicker*uOpacity;
    if(alpha<0.01)discard;
    vec3 color=mix(uColor,vec3(1.28,1.2,1.38),hot*0.84);
    gl_FragColor=vec4(color,min(0.95,alpha));
  }
`;

const LIGHTNING_FRAGMENT = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  uniform float uOpacity;
  void main() {
    float d=abs(vUv.x*2.0-1.0);
    float white=pow(max(0.0,1.0-d),7.0);
    float blue=pow(max(0.0,1.0-d),1.1);
    float longitudinal = 1.0-smoothstep(0.73,1.0,vUv.y);
    float alpha=(blue*0.47+white*0.84)*longitudinal*uOpacity;
    if(alpha<0.01)discard;
    gl_FragColor=vec4(mix(vec3(0.18,0.74,1.25),vec3(1.38,1.45,1.54),white),min(0.98,alpha));
  }
`;

const SHELL_VERTEX = /* glsl */ `
  varying vec3 vPosition;
  void main(){
    vPosition=position;
    gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);
  }
`;
const SHELL_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform float uOpacity;
  varying vec3 vPosition;
  void main(){
    float veins=pow(max(0.0,sin(vPosition.x*23.0+uTime*19.0)
      *sin(vPosition.z*21.0-uTime*16.0)),5.0);
    float alpha=uOpacity*veins;
    if(alpha<0.01)discard;
    gl_FragColor=vec4(0.84,0.87,1.25,alpha);
  }
`;

function material(
  uniforms: Record<string, { value: number | THREE.Color }>,
  fragmentShader: string,
  vertexShader = QUAD_VERTEX
): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms,
    vertexShader,
    fragmentShader,
    transparent: true,
    depthTest: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  });
}

/** Gaussian RGBA blob, used for bright white/cyan cores without browser canvas. */
function glowTexture(): THREE.DataTexture {
  const size = 64;
  const data = new Uint8Array(size * size * 4);
  for(let y=0;y<size;y++){
    for(let x=0;x<size;x++){
      const dx=(x+0.5-size/2)/(size/2);
      const dy=(y+0.5-size/2)/(size/2);
      const radius=Math.sqrt(dx*dx+dy*dy);
      const alpha=Math.exp(-radius*radius*5.2)*Math.max(0,1-THREE.MathUtils.smoothstep(radius,0.72,1));
      const index=(y*size+x)*4;
      data[index]=255;
      data[index+1]=255;
      data[index+2]=255;
      data[index+3]=Math.round(alpha*255);
    }
  }
  const texture=new THREE.DataTexture(data,size,size,THREE.RGBAFormat);
  texture.needsUpdate=true;
  texture.magFilter=THREE.LinearFilter;
  texture.minFilter=THREE.LinearFilter;
  texture.generateMipmaps=false;
  return texture;
}

interface Ribbon {
  readonly mesh: THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>;
  readonly points: THREE.BufferAttribute;
  readonly radius: number;
  readonly width: number;
}
const BAND_SEGMENTS=120;
function ribbon(name: string, color: number, radius: number, width: number): Ribbon {
  const positions=new THREE.BufferAttribute(new Float32Array((BAND_SEGMENTS+1)*6),3);
  positions.setUsage(THREE.DynamicDrawUsage);
  const uv=new Float32Array((BAND_SEGMENTS+1)*4);
  const idx: number[]=[];
  for(let i=0;i<=BAND_SEGMENTS;i++){
    uv[i*4]=0;uv[i*4+1]=i/BAND_SEGMENTS;
    uv[i*4+2]=1;uv[i*4+3]=i/BAND_SEGMENTS;
    if(i<BAND_SEGMENTS){
      const k=i*2;
      idx.push(k,k+1,k+2,k+1,k+3,k+2);
    }
  }
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',positions);
  geometry.setAttribute('uv',new THREE.BufferAttribute(uv,2));
  geometry.setIndex(idx);
  const mesh=new THREE.Mesh(geometry,material({
    uTime:{value:0},uOpacity:{value:0},uColor:{value:new THREE.Color(color)}
  },BAND_FRAGMENT,BAND_VERTEX));
  mesh.name=name;
  mesh.frustumCulled=false;
  mesh.renderOrder=12;
  return {mesh,points:positions,radius,width};
}

const BOLT_COUNT=7;
const BOLT_STEPS=7;
interface Lightning {
  readonly mesh: THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>;
  readonly positions: THREE.BufferAttribute;
}
function lightningGeometry(): Lightning {
  const positions=new THREE.BufferAttribute(new Float32Array((BOLT_STEPS+1)*6),3);
  positions.setUsage(THREE.DynamicDrawUsage);
  const uv=new Float32Array((BOLT_STEPS+1)*4);
  const idx:number[]=[];
  for(let i=0;i<=BOLT_STEPS;i++){
    uv[4*i]=0;uv[4*i+1]=i/BOLT_STEPS;
    uv[4*i+2]=1;uv[4*i+3]=i/BOLT_STEPS;
    if(i<BOLT_STEPS){const k=i*2;idx.push(k,k+1,k+2,k+1,k+3,k+2);}
  }
  const geo=new THREE.BufferGeometry();
  geo.setAttribute('position',positions);
  geo.setAttribute('uv',new THREE.BufferAttribute(uv,2));
  geo.setIndex(idx);
  const mesh=new THREE.Mesh(geo,material({uOpacity:{value:0}},LIGHTNING_FRAGMENT,BAND_VERTEX));
  mesh.frustumCulled=false;
  mesh.renderOrder=14;
  return {mesh,positions};
}

const FRAGMENTS=52;
const TEMP_QUAT=new THREE.Quaternion();
const TEMP_MATRIX=new THREE.Matrix4();
const TEMP_POS=new THREE.Vector3();
const TEMP_SIZE=new THREE.Vector3();
const TEMP_DIR=new THREE.Vector3();

export class PrismaticExplosionField {
  public readonly group=new THREE.Group();
  public readonly core: THREE.Sprite;
  public readonly groundDisc: THREE.Mesh<THREE.PlaneGeometry,THREE.ShaderMaterial>;
  public readonly outerHalo: THREE.Mesh<THREE.BufferGeometry,THREE.ShaderMaterial>;
  public readonly lightningBurst=new THREE.Group();
  public readonly orbitA: THREE.Mesh<THREE.BufferGeometry,THREE.ShaderMaterial>;
  public readonly orbitB: THREE.Mesh<THREE.BufferGeometry,THREE.ShaderMaterial>;
  public readonly orbitC: THREE.Mesh<THREE.BufferGeometry,THREE.ShaderMaterial>;
  public readonly fragments: THREE.InstancedMesh<THREE.TetrahedronGeometry,THREE.MeshBasicMaterial>;
  /** Compatibility with existing VFX diagnostics. */
  public readonly ground: THREE.Mesh<THREE.PlaneGeometry,THREE.ShaderMaterial>;
  public readonly vortex: THREE.Mesh<THREE.PlaneGeometry,THREE.ShaderMaterial>;
  public readonly volume: THREE.Mesh<THREE.SphereGeometry,THREE.ShaderMaterial>;
  public readonly corona: THREE.Mesh<THREE.SphereGeometry,THREE.ShaderMaterial>;
  private readonly glow=glowTexture();
  private readonly outerGlow: THREE.Sprite;
  // Broad additive companion strips imitate soft bloom without changing the renderer.
  private readonly haloBand=ribbon('MagePrismExplosionOuterHalo',0xe765ff,3.04,0.37);
  private readonly orbitBands=[
    ribbon('MagePrismExplosionOrbitA',0xfbe7ff,1.27,0.35),
    ribbon('MagePrismExplosionOrbitB',0xe39aff,2.15,0.40),
    ribbon('MagePrismExplosionOrbitC',0xc96aff,2.79,0.50),
  ];
  private readonly haloBloom=ribbon('MagePrismExplosionOuterHaloBloom',0xcd61ff,3.04,0.95);
  private readonly orbitBlooms=[
    ribbon('MagePrismExplosionOrbitABloom',0xe6bcff,1.27,0.85),
    ribbon('MagePrismExplosionOrbitBBloom',0xa66aff,2.15,1.00),
    ribbon('MagePrismExplosionOrbitCBloom',0xa454ff,2.79,1.2),
  ];
  private readonly flameTongues: THREE.Sprite[]=[];
  private readonly boltBranches: Lightning[]=[];
  private charging=false;
  private readonly bolts: Lightning[]=[];
  private readonly shockArcs: THREE.Mesh<THREE.TorusGeometry,THREE.MeshBasicMaterial>[]=[];
  private localGroundY=0;
  private readonly fragmentColor=new THREE.Color();

  public constructor(){
    this.group.name='MagePrismaticFinalExplosionField';
    this.group.visible=false;
    this.core=new THREE.Sprite(new THREE.SpriteMaterial({
      map:this.glow,color:0xfaffff,opacity:0,transparent:true,
      depthWrite:false,depthTest:true,blending:THREE.AdditiveBlending,toneMapped:false
    }));
    this.core.name='MagePrismExplosionCore';
    this.outerGlow=new THREE.Sprite(new THREE.SpriteMaterial({
      map:this.glow,color:0xb659ff,opacity:0,transparent:true,
      depthWrite:false,depthTest:true,blending:THREE.AdditiveBlending,toneMapped:false
    }));
    this.outerGlow.name='MagePrismExplosionCoreHalo';

    this.groundDisc=new THREE.Mesh(new THREE.PlaneGeometry(2,2),material({
      uTime:{value:0},uOpacity:{value:0}
    },GROUND_FRAGMENT));
    this.groundDisc.name='MagePrismExplosionGroundDisc';
    this.groundDisc.rotation.x=-Math.PI/2;
    this.groundDisc.frustumCulled=false;
    this.groundDisc.renderOrder=7;
    // A separate, short broken shockfront; ground disc must remain cyan.
    this.ground=new THREE.Mesh(new THREE.PlaneGeometry(2,2),material({
      uTime:{value:0},uOpacity:{value:0}
    },GROUND_FRAGMENT));
    this.ground.name='MagePrismShockFront';
    this.ground.rotation.x=-Math.PI/2;
    this.ground.frustumCulled=false;
    this.ground.renderOrder=8;

    this.vortex=new THREE.Mesh(new THREE.PlaneGeometry(2,2),material({
      uTime:{value:0},uOpacity:{value:0}
    },VORTEX_FRAGMENT));
    this.vortex.name='MagePrismSpiralVortex';
    this.vortex.rotation.x=-Math.PI/2;
    this.vortex.frustumCulled=false;
    this.vortex.renderOrder=9;
    this.volume=new THREE.Mesh(new THREE.SphereGeometry(1,24,14),material({
      uTime:{value:0},uOpacity:{value:0}
    },SHELL_FRAGMENT,SHELL_VERTEX));
    this.volume.name='MagePrismVolumetricBlast';
    this.volume.frustumCulled=false;
    this.corona=new THREE.Mesh(new THREE.SphereGeometry(1,20,12),material({
      uTime:{value:0},uOpacity:{value:0}
    },SHELL_FRAGMENT,SHELL_VERTEX));
    this.corona.name='MagePrismElectricAftershock';
    this.corona.frustumCulled=false;

    this.outerHalo=this.haloBand.mesh;
    this.orbitA=this.orbitBands[0].mesh;
    this.orbitB=this.orbitBands[1].mesh;
    this.orbitC=this.orbitBands[2].mesh;
    this.lightningBurst.name='MagePrismExplosionLightningBurst';
    for(let i=0;i<BOLT_COUNT;i++){
      const bolt=lightningGeometry();
      bolt.mesh.name='MagePrismExplosionLightningBolt';
      this.bolts.push(bolt);
      this.lightningBurst.add(bolt.mesh);
      const branch=lightningGeometry();
      branch.mesh.name='MagePrismExplosionLightningBranch';
      this.boltBranches.push(branch);
      this.lightningBurst.add(branch.mesh);
    }
    for(let i=0;i<14;i++){
      const flame=new THREE.Sprite(new THREE.SpriteMaterial({
        map:this.glow,color:i%3===0?0xf3a1ff:i%2?0xd86aff:0x986bff,
        opacity:0,transparent:true,depthWrite:false,depthTest:true,
        blending:THREE.AdditiveBlending,toneMapped:false,
      }));
      flame.name='MagePrismExplosionFlameTongue';
      flame.renderOrder=15;
      this.flameTongues.push(flame);
      this.group.add(flame);
    }

    const colors=[0xe1a6ff,0xc7ebff,0xb662ff];
    for(let i=0;i<3;i++){
      const m=new THREE.Mesh(
        new THREE.TorusGeometry(1,0.025+i*0.008,6,96,Math.PI*(1.23+i*0.1)),
        new THREE.MeshBasicMaterial({
          color:colors[i],opacity:0,transparent:true,depthWrite:false,
          depthTest:true,blending:THREE.AdditiveBlending,toneMapped:false
        })
      );
      m.name='MagePrismSpiralEnergyOrbit';
      m.rotation.x=-Math.PI/2;
      m.renderOrder=11;
      this.shockArcs.push(m);
      this.group.add(m);
    }

    this.fragments=new THREE.InstancedMesh(
      new THREE.TetrahedronGeometry(1,0),
      new THREE.MeshBasicMaterial({
        color:0xffffff,opacity:0,transparent:true,
        depthWrite:false,depthTest:true,blending:THREE.AdditiveBlending,toneMapped:false
      }),FRAGMENTS
    );
    this.fragments.name='MagePrismExplosionFragmentsAscending';
    this.fragments.frustumCulled=false;
    for(let i=0;i<FRAGMENTS;i++){
      this.fragmentColor.setHex(i%5===0?0xf5edff:i%3===0?0x90eaff:0xb868ff);
      this.fragments.setColorAt(i,this.fragmentColor);
      // Initialize matrices before first render so they never display giant shards.
      this.fragments.setMatrixAt(i,TEMP_MATRIX.makeScale(0,0,0));
    }
    this.fragments.instanceMatrix.needsUpdate=true;
    if(this.fragments.instanceColor)this.fragments.instanceColor.needsUpdate=true;

    this.group.add(this.groundDisc,this.ground,this.vortex,
      this.haloBloom.mesh,...this.orbitBlooms.map(b=>b.mesh),
      this.outerHalo,...this.orbitBands.map(b=>b.mesh),
      this.volume,this.corona,this.outerGlow,this.core,
      this.lightningBurst,this.fragments);
  }

  public detonate(position: THREE.Vector3):void{
    this.group.visible=true;
    this.group.position.copy(position);
    this.localGroundY=-Math.min(1.08,Math.max(0.05,position.y-0.08));
    this.groundDisc.position.y=this.localGroundY+0.04;
    this.ground.position.y=this.localGroundY+0.027;
    this.vortex.position.y=this.localGroundY+0.10;
    this.core.position.set(0,this.localGroundY+0.52,0);
    this.outerGlow.position.copy(this.core.position);
    this.volume.position.copy(this.core.position);
    this.corona.position.copy(this.core.position);
    this.update(0);
  }

  private writeBand(band:Ribbon, time:number, index:number, strength:number):void{
    const count=BAND_SEGMENTS;
    const outer=index===3;
    const rot=outer?time*1.1:time*(index===1?-4.2:index===0?6.6:3.2);
    const scale=outer?1:0.66+0.34*THREE.MathUtils.smoothstep(time,0.24,0.49);
    const height=this.localGroundY+(outer?0.22:0.34+index*0.15);
    const tilt=outer?0.02:(index===0?0.19:index===1?-0.14:0.26);
    const pos=band.points;
    for(let i=0;i<=count;i++){
      const u=i/count;
      const a=u*TWO_PI+rot;
      const warp=Math.sin(a*(outer?17:7+index*2)-time*20+index*0.9)*0.08+
        Math.sin(a*(outer?33:13)+time*14)*0.037;
      const radius=(band.radius+warp)*(outer?1:scale);
      const y=height+Math.sin(a*2+time*11+index)*0.12+
        Math.cos(a*3-index)*tilt;
      const taper=0.68+0.32*Math.sin(u*TWO_PI*3-time*16);
      const half=band.width*taper*Math.max(0.01,strength);
      pos.setXYZ(i*2,Math.cos(a)*(radius-half),y-0.03,Math.sin(a)*(radius-half));
      pos.setXYZ(i*2+1,Math.cos(a)*(radius+half),y+0.03,Math.sin(a)*(radius+half));
    }
    pos.needsUpdate=true;
    band.mesh.material.uniforms.uTime.value=time;
  }

  private updateBolts(t:number,opacity:number):void{
    this.lightningBurst.visible=opacity>0.002;
    for(let i=0;i<this.bolts.length;i++){
      const bolt=this.bolts[i];
      const a=(i/BOLT_COUNT)*TWO_PI+0.34;
      const dist=2.2+(i%3)*0.58;
      const sideX=-Math.sin(a),sideZ=Math.cos(a);
      for(let j=0;j<=BOLT_STEPS;j++){
        const u=j/BOLT_STEPS;
        const phase=t*67+i*3.43+j*2.7;
        const jag=(j===0?0:Math.sin(phase)*0.22+Math.sin(phase*1.73)*0.10);
        const radius=0.17+dist*u;
        const x=Math.cos(a)*radius+sideX*jag*u;
        const z=Math.sin(a)*radius+sideZ*jag*u;
        const y=this.localGroundY+0.54+u*(0.31+(i%3)*0.22)+Math.sin(phase)*u*0.12;
        const width=(0.17+(i%2)*0.045)*(1-0.62*u);
        bolt.positions.setXYZ(2*j,x-sideX*width,y-0.025,z-sideZ*width);
        bolt.positions.setXYZ(2*j+1,x+sideX*width,y+0.025,z+sideZ*width);
      }
      bolt.positions.needsUpdate=true;
      bolt.mesh.material.uniforms.uOpacity.value=opacity*(0.75+0.25*Math.sin(t*43+i));
    }
  }

  private updateFragments(t:number,opacity:number):void{
    this.fragments.material.opacity=opacity*0.76;
    const progress=THREE.MathUtils.clamp((t-0.22)/0.93,0,1);
    for(let i=0;i<FRAGMENTS;i++){
      const a=i*2.399963;
      const seed=0.32+(i%11)*0.057;
      const radius=seed+progress*(0.5+(i%9)*0.16);
      TEMP_POS.set(
        Math.cos(a)*radius,
        this.localGroundY+0.18+progress*(0.62+(i%8)*0.22),
        Math.sin(a)*radius
      );
      TEMP_DIR.set(Math.cos(a),0.35+progress,Math.sin(a)).normalize();
      TEMP_QUAT.setFromUnitVectors(UP,TEMP_DIR);
      const width=(0.025+(i%5)*0.009)*Math.max(0,opacity);
      TEMP_SIZE.set(width,width*(2.0+(i%3)),width);
      TEMP_MATRIX.compose(TEMP_POS,TEMP_QUAT,TEMP_SIZE);
      this.fragments.setMatrixAt(i,TEMP_MATRIX);
    }
    this.fragments.instanceMatrix.needsUpdate=true;
  }

  public update(time:number):void{
    const t=Math.max(0,time);
    const charge=1-THREE.MathUtils.smoothstep(t,0.11,0.25);
    const flash=Math.exp(-Math.pow((t-0.20)*14,2));
    const vortexIn=THREE.MathUtils.smoothstep(t,0.21,0.34);
    const vortexOut=1-THREE.MathUtils.smoothstep(t,0.89,1.25);
    const swirl=vortexIn*vortexOut;
    const fade=1-THREE.MathUtils.smoothstep(t,0.97,1.25);
    const boltOpacity=THREE.MathUtils.smoothstep(t,0.045,0.13)*
      (1-THREE.MathUtils.smoothstep(t,0.25,0.43));
    const fragmentOpacity=THREE.MathUtils.smoothstep(t,0.19,0.32)*
      (1-THREE.MathUtils.smoothstep(t,0.85,1.23));

    this.core.material.opacity=Math.min(1,0.35*charge+0.96*flash+0.77*swirl)*fade;
    this.core.scale.setScalar(0.55*charge+1.92*flash+1.65*swirl+0.03);
    this.outerGlow.material.opacity=(0.36*charge+0.49*flash+0.32*swirl)*fade;
    this.outerGlow.scale.setScalar(1.28+2.8*flash+2.65*swirl);

    this.groundDisc.material.uniforms.uTime.value=t;
    this.groundDisc.material.uniforms.uOpacity.value=0.52*
      (1-THREE.MathUtils.smoothstep(t,0.14,0.43));
    this.groundDisc.scale.setScalar(3.35);
    this.ground.material.uniforms.uTime.value=t;
    this.ground.material.uniforms.uOpacity.value=0.54*
      THREE.MathUtils.smoothstep(t,0.14,0.20)*
      (1-THREE.MathUtils.smoothstep(t,0.28,0.43));
    this.ground.scale.setScalar(4.15);
    this.vortex.material.uniforms.uTime.value=t;
    this.vortex.material.uniforms.uOpacity.value=0.24*swirl;
    this.vortex.scale.setScalar(3.0);

    this.outerHalo.material.uniforms.uOpacity.value=(0.75*charge+0.85*swirl)*fade;
    this.writeBand(this.haloBand,t,3,Math.max(charge,swirl));
    for(let i=0;i<this.orbitBands.length;i++){
      const band=this.orbitBands[i];
      band.mesh.material.uniforms.uOpacity.value=(0.86-i*0.06)*swirl;
      this.writeBand(band,t,i,swirl);
      const arc=this.shockArcs[i];
      arc.position.set(0,this.localGroundY+0.32+i*0.15,0);
      arc.rotation.z=t*(i===1?-4.2:i===0?6.6:3.2)+i*1.8;
      arc.scale.setScalar(0.83+i*0.43);
      arc.material.opacity=(0.25-i*0.03)*swirl;
    }
    this.updateBolts(t,boltOpacity);
    this.updateFragments(t,fragmentOpacity);

    // The two tiny plasma skins only accompany the flash, never expand as a bubble.
    this.volume.material.uniforms.uTime.value=t;
    this.volume.material.uniforms.uOpacity.value=0.15*flash;
    this.volume.scale.set(0.65,0.36,0.65);
    this.corona.material.uniforms.uTime.value=t*1.3;
    this.corona.material.uniforms.uOpacity.value=0.09*flash;
    this.corona.scale.set(0.95,0.43,0.95);
  }

  public reset():void{
    this.group.visible=false;
    this.core.material.opacity=0;
    this.outerGlow.material.opacity=0;
    this.groundDisc.material.uniforms.uOpacity.value=0;
    this.ground.material.uniforms.uOpacity.value=0;
    this.vortex.material.uniforms.uOpacity.value=0;
    this.outerHalo.material.uniforms.uOpacity.value=0;
    for(const band of this.orbitBands)band.mesh.material.uniforms.uOpacity.value=0;
    for(const bolt of this.bolts)bolt.mesh.material.uniforms.uOpacity.value=0;
    this.lightningBurst.visible=false;
    this.volume.material.uniforms.uOpacity.value=0;
    this.corona.material.uniforms.uOpacity.value=0;
    this.fragments.material.opacity=0;
    for(const arc of this.shockArcs)arc.material.opacity=0;
  }

  public dispose():void{
    this.reset();
    this.glow.dispose();
    this.core.material.dispose();
    this.outerGlow.material.dispose();
    this.groundDisc.geometry.dispose();
    this.groundDisc.material.dispose();
    this.ground.geometry.dispose();
    this.ground.material.dispose();
    this.vortex.geometry.dispose();
    this.vortex.material.dispose();
    this.volume.geometry.dispose();
    this.volume.material.dispose();
    this.corona.geometry.dispose();
    this.corona.material.dispose();
    this.haloBand.mesh.geometry.dispose();
    this.haloBand.mesh.material.dispose();
    for(const band of this.orbitBands){band.mesh.geometry.dispose();band.mesh.material.dispose();}
    for(const bolt of this.bolts){bolt.mesh.geometry.dispose();bolt.mesh.material.dispose();}
    for(const arc of this.shockArcs){arc.geometry.dispose();arc.material.dispose();}
    this.fragments.geometry.dispose();
    this.fragments.material.dispose();
  }
}
