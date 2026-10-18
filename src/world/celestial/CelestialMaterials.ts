import * as THREE from 'three';
import { PALETTE } from './CelestialConfig';
import {
  makeBannerTexture,
  makeCloudSeaTexture,
  makeCloudTexture,
  makeEnamelTexture,
  makeFlameTexture,
  makeGoldTexture,
  makeLimestoneTexture,
  makeMarbleTexture,
  makeMossTexture,
  makeRockTexture,
  makeSunGlowTexture,
  makeWaterfallTexture,
} from './CelestialTextures';

/**
 * Biblioteca de materiais da arena. Uma instancia e compartilhada por piso,
 * arquibancadas, ilhas e bandeiras; `dispose` libera texturas de uma vez.
 */
export class CelestialMaterials {
  public readonly marbleFloor: THREE.MeshPhysicalMaterial;
  public readonly marblePolished: THREE.MeshStandardMaterial;
  public readonly marbleTrim: THREE.MeshStandardMaterial;
  public readonly ivory: THREE.MeshStandardMaterial;
  public readonly gold: THREE.MeshStandardMaterial;
  /** Ouro das incrustações do piso: menos metálico, para não estourar em branco. */
  public readonly goldInlay: THREE.MeshStandardMaterial;
  /** Ranhura escura sob as incrustações: dá o contraste da referência. */
  public readonly groove: THREE.MeshStandardMaterial;
  public readonly goldLight: THREE.MeshStandardMaterial;
  public readonly goldDark: THREE.MeshStandardMaterial;
  public readonly enamel: THREE.MeshStandardMaterial;
  public readonly sapphire: THREE.MeshStandardMaterial;
  public readonly banner: THREE.MeshStandardMaterial;
  public readonly limestone: THREE.MeshStandardMaterial;
  public readonly limestoneBlock: THREE.MeshStandardMaterial;
  public readonly rock: THREE.MeshStandardMaterial;
  public readonly rockDark: THREE.MeshStandardMaterial;
  public readonly moss: THREE.MeshStandardMaterial;
  public readonly foliage: THREE.MeshStandardMaterial;
  public readonly crowd: THREE.MeshStandardMaterial;
  public readonly flame: THREE.SpriteMaterial;
  public readonly ember: THREE.MeshBasicMaterial;
  public readonly waterfall: THREE.MeshBasicMaterial;
  public readonly cloud: THREE.SpriteMaterial;
  public readonly cloudHaze: THREE.SpriteMaterial;
  public readonly sunGlow: THREE.SpriteMaterial;

  private readonly textures: THREE.Texture[] = [];

  public constructor() {
    const marble = this.track(makeMarbleTexture());
    const gold = this.track(makeGoldTexture());
    const enamel = this.track(makeEnamelTexture());
    const limestone = this.track(makeLimestoneTexture());
    const rock = this.track(makeRockTexture());
    const moss = this.track(makeMossTexture());
    const banner = this.track(makeBannerTexture());
    const cloud = this.track(makeCloudTexture());
    const cloudSea = this.track(makeCloudSeaTexture());
    const waterfall = this.track(makeWaterfallTexture());
    const flame = this.track(makeFlameTexture());
    const glow = this.track(makeSunGlowTexture());
    const limestoneRepeat = limestone.clone();
    limestoneRepeat.needsUpdate = true;
    limestoneRepeat.repeat.set(3, 2);
    this.track(limestoneRepeat);
    const rockRepeat = rock.clone();
    rockRepeat.needsUpdate = true;
    rockRepeat.repeat.set(2, 2);
    this.track(rockRepeat);

    this.marbleFloor = new THREE.MeshPhysicalMaterial({
      map: marble,
      color: 0x9a93a8,
      roughness: 0.36,
      metalness: 0.02,
      envMapIntensity: 0.55,
      clearcoat: 0.9,
      clearcoatRoughness: 0.16,
    });
    this.marblePolished = new THREE.MeshStandardMaterial({
      color: 0xc9c2c1,
      roughness: 0.28,
      metalness: 0.02,
      envMapIntensity: 0.45,
    });
    this.marbleTrim = new THREE.MeshStandardMaterial({
      color: PALETTE.marbleLight,
      roughness: 0.5,
      metalness: 0.01,
      envMapIntensity: 0.3,
    });
    this.ivory = new THREE.MeshStandardMaterial({
      color: 0xdcd4c4,
      roughness: 0.46,
      metalness: 0.02,
      envMapIntensity: 0.3,
    });
    this.gold = new THREE.MeshStandardMaterial({
      map: gold,
      color: 0xc99a3f,
      metalness: 0.88,
      roughness: 0.27,
      envMapIntensity: 1.0,
    });
    // Sem mapa: nas incrustações longas (braços, molduras) o mapa de ouro
    // repetia como listras de madeira. Metal sólido lê como ouro polido.
    this.goldInlay = new THREE.MeshStandardMaterial({
      map: gold,
      color: 0xe8b64a,
      metalness: 0.86,
      roughness: 0.24,
      envMapIntensity: 0.85,
    });
    this.groove = new THREE.MeshStandardMaterial({
      color: 0x6a6158,
      roughness: 0.92,
      metalness: 0.02,
      envMapIntensity: 0.12,
      // As ranhuras ficam sob as incrustações: sem coplanaridade aparente.
      polygonOffset: true,
      polygonOffsetFactor: 1,
      polygonOffsetUnits: 1,
    });
    this.goldLight = new THREE.MeshStandardMaterial({
      color: 0xf2d189,
      metalness: 1,
      roughness: 0.2,
      envMapIntensity: 0.9,
    });
    this.goldDark = new THREE.MeshStandardMaterial({
      color: 0x9c7526,
      metalness: 0.95,
      roughness: 0.42,
      envMapIntensity: 0.6,
    });
    this.enamel = new THREE.MeshStandardMaterial({
      map: enamel,
      color: 0xffffff,
      metalness: 0.35,
      roughness: 0.2,
      envMapIntensity: 0.7,
    });
    this.sapphire = new THREE.MeshStandardMaterial({
      color: PALETTE.sapphire,
      emissive: 0x0c2a86,
      emissiveIntensity: 0.45,
      metalness: 0.35,
      roughness: 0.06,
      envMapIntensity: 1.2,
    });
    this.banner = new THREE.MeshStandardMaterial({
      map: banner,
      color: 0xffffff,
      roughness: 0.85,
      metalness: 0.08,
      side: THREE.DoubleSide,
      envMapIntensity: 0.2,
    });
    this.limestone = new THREE.MeshStandardMaterial({
      color: 0xbfb5a4,
      map: limestoneRepeat,
      roughness: 0.86,
      metalness: 0.02,
      envMapIntensity: 0.2,
    });
    this.limestoneBlock = new THREE.MeshStandardMaterial({
      map: limestone,
      color: 0xcfc7b8,
      roughness: 0.84,
      metalness: 0.02,
      envMapIntensity: 0.22,
    });
    this.rock = new THREE.MeshStandardMaterial({
      map: rockRepeat,
      color: 0xd3c8b6,
      roughness: 0.95,
      metalness: 0.02,
      envMapIntensity: 0.12,
    });
    this.rockDark = new THREE.MeshStandardMaterial({
      map: rockRepeat,
      color: 0x6f6961,
      roughness: 0.98,
      metalness: 0.0,
      envMapIntensity: 0.2,
    });
    this.moss = new THREE.MeshStandardMaterial({
      map: moss,
      color: 0xffffff,
      roughness: 0.95,
      metalness: 0,
      envMapIntensity: 0.25,
    });
    this.foliage = new THREE.MeshStandardMaterial({
      color: PALETTE.foliage,
      roughness: 0.9,
      metalness: 0,
      flatShading: true,
      envMapIntensity: 0.25,
    });
    this.crowd = new THREE.MeshStandardMaterial({
      color: 0x2e323d,
      roughness: 0.88,
      metalness: 0.02,
      envMapIntensity: 0.2,
    });
    this.flame = new THREE.SpriteMaterial({
      map: flame,
      color: 0xffb056,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: true,
    });
    this.ember = new THREE.MeshBasicMaterial({
      color: 0xffa63a,
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    });
    waterfall.repeat.set(1, 5);
    this.waterfall = new THREE.MeshBasicMaterial({
      map: waterfall,
      transparent: true,
      opacity: 0.92,
      depthWrite: false,
      side: THREE.DoubleSide,
      toneMapped: false,
    });
    this.cloud = new THREE.SpriteMaterial({
      map: cloud,
      transparent: true,
      depthWrite: false,
      opacity: 0.92,
      fog: false,
      toneMapped: false,
    });
    this.cloudHaze = new THREE.SpriteMaterial({
      map: cloud,
      transparent: true,
      depthWrite: false,
      opacity: 0.38,
      fog: false,
      toneMapped: false,
    });
    this.sunGlow = new THREE.SpriteMaterial({
      map: glow,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: false,
      toneMapped: false,
    });
    // O mar de nuvens usa textura propria; guarda a referencia no mapa do mar.
    this.cloudSeaTexture = cloudSea;
  }

  public readonly cloudSeaTexture: THREE.Texture;

  private track<T extends THREE.Texture>(texture: T): T {
    this.textures.push(texture);
    return texture;
  }

  public dispose(): void {
    for (const texture of this.textures) texture.dispose();
    this.textures.length = 0;
    const materials: THREE.Material[] = [
      this.marbleFloor, this.marblePolished, this.marbleTrim, this.ivory,
      this.gold, this.goldInlay, this.groove, this.goldLight, this.goldDark,
      this.enamel, this.sapphire, this.banner,
      this.limestone, this.limestoneBlock, this.rock, this.rockDark, this.moss,
      this.foliage, this.crowd, this.flame, this.ember, this.waterfall,
      this.cloud, this.cloudHaze, this.sunGlow,
    ];
    for (const material of materials) material.dispose();
  }
}
