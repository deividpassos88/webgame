import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { createCrackedGroundTexture, createFrozenGroundTexture } from './GroundDecalTextures';

interface PixelStats {
  readonly opaque: number;
  readonly dark: number;
  readonly light: number;
  readonly warm: number;
  readonly blue: number;
  readonly transparentCorners: boolean;
  readonly opaqueCenter: boolean;
}

function sample(texture: THREE.DataTexture): PixelStats {
  const data = texture.image.data as Uint8Array;
  const size = texture.image.width;
  let opaque = 0;
  let dark = 0;
  let light = 0;
  let warm = 0;
  let blue = 0;
  for (let index = 0; index < size * size; index += 1) {
    const offset = index * 4;
    const r = data[offset];
    const g = data[offset + 1];
    const b = data[offset + 2];
    const alpha = data[offset + 3];
    if (alpha < 128) continue;
    opaque += 1;
    if (r + g + b < 240) dark += 1;
    if (r + g + b > 520) light += 1;
    if (r > b + 12) warm += 1;
    if (b > r + 12) blue += 1;
  }
  const corner = (x: number, y: number): number => data[(y * size + x) * 4 + 3];
  const center = (size * (size / 2) + size / 2) * 4 + 3;
  return {
    opaque,
    dark,
    light,
    warm,
    blue,
    transparentCorners: corner(1, 1) === 0 && corner(size - 2, size - 2) === 0,
    opaqueCenter: data[center] > 128,
  };
}

describe('desenhos de impacto de chão das skills 1 e 2', () => {
  it('o chão rachado tem fissuras escuras, pó claro e miolo opaco', () => {
    const texture = createCrackedGroundTexture(160);
    const stats = sample(texture);
    expect(texture.image.width).toBe(160);
    // Fissura = pixels escuros de verdade (o chão não muda de cor sozinho).
    expect(stats.dark).toBeGreaterThan(300);
    // Terra levantada em volta das fissuras.
    expect(stats.light).toBeGreaterThan(100);
    expect(stats.opaqueCenter).toBe(true);
    // O decalque não invade o quad inteiro: o desenho é circular.
    expect(stats.transparentCorners).toBe(true);
  });

  it('o gelo é claro e frio — nada de chão preto/rachado', () => {
    const texture = createFrozenGroundTexture(160);
    const stats = sample(texture);
    expect(stats.opaque).toBeGreaterThan(200);
    // Sem fissura: nenhum pixel escuro, e o azul domina o vermelho.
    expect(stats.dark).toBe(0);
    expect(stats.blue).toBeGreaterThan(stats.opaque * 0.5);
    expect(stats.warm).toBe(0);
    expect(stats.opaqueCenter).toBe(true);
    expect(stats.transparentCorners).toBe(true);
  });

  it('os dois desenhos são diferentes e o gelo é visivelmente mais claro', () => {
    const cracked = createCrackedGroundTexture(128);
    const frozen = createFrozenGroundTexture(128);
    const crackedData = cracked.image.data as Uint8Array;
    const frozenData = frozen.image.data as Uint8Array;
    expect(crackedData.length).toBe(frozenData.length);
    let differences = 0;
    let frozenBrighter = 0;
    for (let index = 0; index < crackedData.length; index += 4) {
      if (crackedData[index] !== frozenData[index]) differences += 1;
      if (frozenData[index] + frozenData[index + 1] > crackedData[index] + crackedData[index + 1]) {
        frozenBrighter += 1;
      }
    }
    expect(differences).toBeGreaterThan(crackedData.length / 8);
    expect(frozenBrighter).toBeGreaterThan(crackedData.length / 16);
  });

  it('a geração é determinística (mesmo desenho a cada chamada)', () => {
    const first = createCrackedGroundTexture(96);
    const second = createCrackedGroundTexture(96);
    expect(Array.from(first.image.data as Uint8Array))
      .toEqual(Array.from(second.image.data as Uint8Array));
    const firstIce = createFrozenGroundTexture(96);
    const secondIce = createFrozenGroundTexture(96);
    expect(Array.from(firstIce.image.data as Uint8Array))
      .toEqual(Array.from(secondIce.image.data as Uint8Array));
  });
});
