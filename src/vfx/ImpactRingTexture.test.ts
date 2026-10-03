import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { createImpactRingTexture } from './ImpactRingTexture';

/** Lê um pixel da textura (mesma convenção do gerador: y para cima). */
function pixelAt(texture: THREE.DataTexture, x: number, y: number): [number, number, number, number] {
  const size = texture.image.width;
  const px = Math.round(((x + 1) / 2) * size - 0.5);
  const py = Math.round((1 - (y + 1) / 2) * size - 0.5);
  const data = texture.image.data as unknown as Uint8Array;
  const offset = (py * size + px) * 4;
  return [data[offset], data[offset + 1], data[offset + 2], data[offset + 3]];
}

function alpha(texture: THREE.DataTexture, x: number, y: number): number {
  return pixelAt(texture, x, y)[3];
}

describe('ImpactRingTexture', () => {
  it('gera uma textura RGBA quadrada com mipmaps', () => {
    const texture = createImpactRingTexture(128);
    expect(texture.image.width).toBe(128);
    expect(texture.image.height).toBe(128);
    const bytes = texture.image.data as Uint8Array | null;
    expect(bytes?.length).toBe(128 * 128 * 4);
    expect(texture.generateMipmaps).toBe(true);
    expect(texture.colorSpace).toBe(THREE.SRGBColorSpace);
    texture.dispose();
  });

  it('deixa o miolo vazio e acende o anel fino em volta', () => {
    const texture = createImpactRingTexture(256);
    // Miolo: buraco escuro, como na referência.
    expect(alpha(texture, 0.02, 0)).toBe(0);
    expect(alpha(texture, 0.1, 0)).toBe(0);
    expect(alpha(texture, 0, -0.15)).toBe(0);
    // Sobre o anel (raio 0,58): branco quase puro e opaco.
    const [red, green, blue, ringAlpha] = pixelAt(texture, 0.58, 0);
    expect(ringAlpha).toBeGreaterThan(200);
    expect(red).toBeGreaterThan(200);
    expect(blue).toBeGreaterThan(200);
    expect(green).toBeGreaterThanOrEqual(red);
    texture.dispose();
  });

  it('joga raios para fora do anel, com pontas azuladas', () => {
    const texture = createImpactRingTexture(256);
    // Os raios vivem logo depois do anel (não chegam colados na borda).
    let outside = 0;
    let deepest = 0;
    for (let step = 0; step < 48; step += 1) {
      const angle = (step / 48) * Math.PI * 2;
      const r = 0.58 + 0.2;
      const [red, green, blue, value] = pixelAt(texture, Math.cos(angle) * r, Math.sin(angle) * r);
      if (value > 8) outside += 1;
      if (value > 8 && blue > red && blue > 0) deepest += 1;
      expect(green).toBeLessThanOrEqual(255);
    }
    expect(outside).toBeGreaterThan(18);
    expect(deepest).toBeGreaterThan(14);
    // Borda do sprite: sem raio comprido atravessando até o fim.
    expect(alpha(texture, 0.99, 0)).toBeLessThan(200);
    texture.dispose();
  });

  it('é determinística (mesma semente, mesmo desenho)', () => {
    const first = createImpactRingTexture(64);
    const second = createImpactRingTexture(64);
    expect(Array.from(first.image.data as Uint8Array)).toEqual(
      Array.from(second.image.data as Uint8Array)
    );
    first.dispose();
    second.dispose();
  });
});
