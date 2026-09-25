import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  LOBBY_BACKDROP_URL,
  LOBBY_LIGHTING,
  LobbyPresentation,
  configureLobbyBackdropTexture,
  fitLobbyBackdropTexture,
  prepareLobbyModel,
} from './LobbyPresentation';

describe('prepareLobbyModel', () => {
  it('hides weapon nodes without hiding the character', () => {
    const model = new THREE.Group();
    for (const name of ['sword', 'Axe', 'weapon_socket', 'espada', 'escudo', 'staff', 'cajado', 'personagem']) {
      const node = new THREE.Object3D();
      node.name = name;
      model.add(node);
    }
    expect(prepareLobbyModel(model)).toEqual({ hiddenWeaponCount: 5 });
    expect(model.getObjectByName('sword')?.visible).toBe(false);
    expect(model.getObjectByName('Axe')?.visible).toBe(false);
    expect(model.getObjectByName('weapon_socket')?.visible).toBe(false);
    // O cajado da Maga NÃO é escondido: é parte da silhueta dela no lobby.
    expect(model.getObjectByName('staff')?.visible).toBe(true);
    expect(model.getObjectByName('cajado')?.visible).toBe(true);
    expect(model.getObjectByName('personagem')?.visible).toBe(true);
  });
});

describe('LobbyPresentation', () => {
  it('uses neutral cinematic exposure and restores exact renderer settings on leave', () => {
    const renderer = {
      toneMapping: THREE.NoToneMapping,
      toneMappingExposure: 0.73,
      outputColorSpace: THREE.LinearSRGBColorSpace,
      shadowMap: { enabled: false, type: THREE.BasicShadowMap },
    } as THREE.WebGLRenderer;
    const presentation = new LobbyPresentation();
    presentation.enter(renderer);
    expect(renderer.toneMapping).toBe(THREE.ACESFilmicToneMapping);
    expect(renderer.toneMappingExposure).toBe(1.06);
    expect(renderer.outputColorSpace).toBe(THREE.SRGBColorSpace);
    expect(renderer.shadowMap.enabled).toBe(true);
    expect(renderer.shadowMap.type).toBe(THREE.PCFSoftShadowMap);
    presentation.leave(renderer);
    expect(renderer.toneMapping).toBe(THREE.NoToneMapping);
    expect(renderer.toneMappingExposure).toBe(0.73);
    expect(renderer.outputColorSpace).toBe(THREE.LinearSRGBColorSpace);
    expect(renderer.shadowMap.enabled).toBe(false);
    expect(renderer.shadowMap.type).toBe(THREE.BasicShadowMap);
  });

  it('configures the generated war backdrop for correct WebGL color', () => {
    const texture = new THREE.Texture();
    configureLobbyBackdropTexture(texture);

    expect(LOBBY_BACKDROP_URL).toBe('/assets/ui/lobby/arena/backdrop-v4.webp');
    expect(texture.colorSpace).toBe(THREE.SRGBColorSpace);
    expect(texture.minFilter).toBe(THREE.LinearMipmapLinearFilter);
    expect(texture.magFilter).toBe(THREE.LinearFilter);
    expect(texture.wrapS).toBe(THREE.ClampToEdgeWrapping);
    expect(texture.wrapT).toBe(THREE.ClampToEdgeWrapping);
  });

  it('center-crops the backdrop instead of stretching it across the stage', () => {
    const landscape = new THREE.Texture();
    fitLobbyBackdropTexture(landscape, 1.5, 1);
    expect(landscape.repeat.x).toBeCloseTo(2 / 3);
    expect(landscape.repeat.y).toBe(1);
    expect(landscape.offset.x).toBeCloseTo(1 / 6);

    const portrait = new THREE.Texture();
    fitLobbyBackdropTexture(portrait, 1, 1.5);
    expect(portrait.repeat.x).toBe(1);
    expect(portrait.repeat.y).toBeCloseTo(2 / 3);
    expect(portrait.offset.y).toBeCloseTo(1 / 6);
  });

  it('keeps the key and fill lights neutral while reserving warmth for a weak bounce', () => {
    expect(LOBBY_LIGHTING.key.color).toBe(0xffffff);
    expect(LOBBY_LIGHTING.fill.color).toBe(0xc9ddff);
    expect(LOBBY_LIGHTING.rim.color).toBe(0x79aefc);
    expect(LOBBY_LIGHTING.bounce.intensity).toBeLessThan(LOBBY_LIGHTING.key.intensity);
  });

  it('can enter and leave repeatedly without throwing', () => {
    const renderer = {
      toneMapping: THREE.NoToneMapping,
      toneMappingExposure: 1,
      outputColorSpace: THREE.LinearSRGBColorSpace,
      shadowMap: { enabled: false, type: THREE.BasicShadowMap },
    } as THREE.WebGLRenderer;
    const presentation = new LobbyPresentation();
    expect(() => {
      presentation.enter(renderer);
      presentation.leave(renderer);
      presentation.leave(renderer);
    }).not.toThrow();
  });
});
