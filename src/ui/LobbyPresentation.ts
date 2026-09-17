import * as THREE from 'three';

const WEAPON_NODE = /(sword|axe|weapon|espada|machado|shield|escudo)/i;

export const LOBBY_BACKDROP_URL = '/assets/ui/lobby/arena/backdrop-v4.webp';

export const LOBBY_LIGHTING = {
  key: { color: 0xffffff, intensity: 5.6 },
  fill: { color: 0xc9ddff, intensity: 2.4 },
  rim: { color: 0x79aefc, intensity: 3.6 },
  bounce: { color: 0xffc99c, intensity: 1.15 },
} as const;

export function configureLobbyBackdropTexture(texture: THREE.Texture): void {
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
}

export function fitLobbyBackdropTexture(
  texture: THREE.Texture,
  imageAspect: number,
  viewportAspect: number
): void {
  const sourceAspect = Number.isFinite(imageAspect) && imageAspect > 0 ? imageAspect : 1;
  const targetAspect = Number.isFinite(viewportAspect) && viewportAspect > 0 ? viewportAspect : 1;
  if (sourceAspect > targetAspect) {
    const visibleWidth = targetAspect / sourceAspect;
    texture.repeat.set(visibleWidth, 1);
    texture.offset.set((1 - visibleWidth) / 2, 0);
  } else {
    const visibleHeight = sourceAspect / targetAspect;
    texture.repeat.set(1, visibleHeight);
    texture.offset.set(0, (1 - visibleHeight) / 2);
  }
}

export function prepareLobbyModel(model: THREE.Object3D): { hiddenWeaponCount: number } {
  let hiddenWeaponCount = 0;
  model.traverse((node) => {
    if (!WEAPON_NODE.test(node.name)) return;
    node.visible = false;
    hiddenWeaponCount += 1;
  });
  return { hiddenWeaponCount };
}

/** Owns renderer settings changed only for the lobby preview. */
export class LobbyPresentation {
  private previous: { toneMapping: THREE.ToneMapping; exposure: number } | null = null;

  public enter(renderer: THREE.WebGLRenderer): void {
    if (!this.previous) {
      this.previous = {
        toneMapping: renderer.toneMapping,
        exposure: renderer.toneMappingExposure,
      };
    }
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;
  }

  public leave(renderer: THREE.WebGLRenderer): void {
    if (!this.previous) return;
    renderer.toneMapping = this.previous.toneMapping;
    renderer.toneMappingExposure = this.previous.exposure;
    this.previous = null;
  }
}
