import * as THREE from 'three';
import type { MageSpellVisualStyle } from './VFXTypes';

const TEXTURE_PATHS = Object.freeze({
  softGlow: '/vfx/warrior/soft-glow.png',
  impactFlare: '/vfx/warrior/impact-flare.png',
  smoke: '/vfx/warrior/smoke.png',
  flame: '/vfx/warrior/flame.png',
  mage: {
    arcane: { charge: '/vfx/mage/arcane-charge.png', impact: '/vfx/mage/arcane-impact.png' },
    water: { charge: '/vfx/mage/water-charge.png', impact: '/vfx/mage/water-impact.png' },
    lightning: { charge: '/vfx/mage/lightning-charge.png', impact: '/vfx/mage/lightning-impact.png' },
    lava: { charge: '/vfx/mage/lava-charge.png', impact: '/vfx/mage/lava-impact.png' },
    ice: { charge: '/vfx/mage/ice-charge.png', impact: '/vfx/mage/ice-impact.png' },
    laser: { charge: '/vfx/mage/laser-charge.png', impact: '/vfx/mage/laser-impact.png' },
    barrierAura: '/vfx/mage/barrier-aura.png',
    barrierFilm: '/vfx/mage/barrier-film.png',
  },
});

function prepareTexture(texture: THREE.Texture): THREE.Texture {
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  // 512px transparent VFX sprites are swapped frequently by pooled materials.
  // Avoid runtime mipmap generation/upload stalls when the first Mage skill uses
  // each texture; linear filtering keeps the look soft without extra GPU work.
  texture.generateMipmaps = false;
  return texture;
}

type MageTexturePhase = 'charge' | 'impact';

/** Shared geometries and texture references for pooled Mage VFX objects. */
export class MageVFXResources {
  public readonly sphere = new THREE.SphereGeometry(0.12, 14, 10);
  public readonly projectileSphere = new THREE.SphereGeometry(0.16, 14, 10);
  public readonly sparkSphere = new THREE.SphereGeometry(0.025, 6, 4);
  public readonly droplet = new THREE.SphereGeometry(0.035, 8, 6);
  public readonly iceShard = new THREE.OctahedronGeometry(0.12, 0);
  public readonly ember = new THREE.IcosahedronGeometry(0.06, 0);
  public readonly coneShard = new THREE.ConeGeometry(0.06, 0.32, 6);
  public readonly shockwave = new THREE.RingGeometry(0.18, 0.24, 36);
  public readonly magicCircle = new THREE.RingGeometry(0.24, 0.28, 48);
  public readonly beamCylinder = new THREE.CylinderGeometry(1, 1, 1, 16, 1, true);
  public readonly barrierSphere = new THREE.SphereGeometry(1, 32, 18);
  public readonly quad = new THREE.PlaneGeometry(1, 1);
  public readonly loader = new THREE.TextureLoader();

  public readonly softGlow = prepareTexture(this.loader.load(TEXTURE_PATHS.softGlow));
  public readonly impactFlare = prepareTexture(this.loader.load(TEXTURE_PATHS.impactFlare));
  public readonly smoke = prepareTexture(this.loader.load(TEXTURE_PATHS.smoke));
  public readonly flame = prepareTexture(this.loader.load(TEXTURE_PATHS.flame));

  private readonly mageTextures = {
    arcane: {
      charge: prepareTexture(this.loader.load(TEXTURE_PATHS.mage.arcane.charge)),
      impact: prepareTexture(this.loader.load(TEXTURE_PATHS.mage.arcane.impact)),
    },
    water: {
      charge: prepareTexture(this.loader.load(TEXTURE_PATHS.mage.water.charge)),
      impact: prepareTexture(this.loader.load(TEXTURE_PATHS.mage.water.impact)),
    },
    lightning: {
      charge: prepareTexture(this.loader.load(TEXTURE_PATHS.mage.lightning.charge)),
      impact: prepareTexture(this.loader.load(TEXTURE_PATHS.mage.lightning.impact)),
    },
    lava: {
      charge: prepareTexture(this.loader.load(TEXTURE_PATHS.mage.lava.charge)),
      impact: prepareTexture(this.loader.load(TEXTURE_PATHS.mage.lava.impact)),
    },
    ice: {
      charge: prepareTexture(this.loader.load(TEXTURE_PATHS.mage.ice.charge)),
      impact: prepareTexture(this.loader.load(TEXTURE_PATHS.mage.ice.impact)),
    },
    laser: {
      charge: prepareTexture(this.loader.load(TEXTURE_PATHS.mage.laser.charge)),
      impact: prepareTexture(this.loader.load(TEXTURE_PATHS.mage.laser.impact)),
    },
  } satisfies Record<MageSpellVisualStyle, Record<MageTexturePhase, THREE.Texture>>;

  public readonly barrierAura = prepareTexture(this.loader.load(TEXTURE_PATHS.mage.barrierAura));
  public readonly barrierFilm = prepareTexture(this.loader.load(TEXTURE_PATHS.mage.barrierFilm));

  public mageTexture(style: MageSpellVisualStyle, phase: MageTexturePhase): THREE.Texture {
    return this.mageTextures[style]?.[phase] ?? this.softGlow;
  }

  public allTextures(): readonly THREE.Texture[] {
    return [
      this.softGlow,
      this.impactFlare,
      this.smoke,
      this.flame,
      ...Object.values(this.mageTextures).flatMap((textures) => [textures.charge, textures.impact]),
      this.barrierAura,
      this.barrierFilm,
    ];
  }

  public dispose(): void {
    this.sphere.dispose();
    this.projectileSphere.dispose();
    this.sparkSphere.dispose();
    this.droplet.dispose();
    this.iceShard.dispose();
    this.ember.dispose();
    this.coneShard.dispose();
    this.shockwave.dispose();
    this.magicCircle.dispose();
    this.beamCylinder.dispose();
    this.barrierSphere.dispose();
    this.quad.dispose();
    this.softGlow.dispose();
    this.impactFlare.dispose();
    this.smoke.dispose();
    this.flame.dispose();
    Object.values(this.mageTextures).forEach((textures) => {
      textures.charge.dispose();
      textures.impact.dispose();
    });
    this.barrierAura.dispose();
    this.barrierFilm.dispose();
  }
}
