import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  ARENA,
  ARENA_CAMERAS,
  arenaBannerPlacements,
  brazierPositions,
  cornerGemPositions,
  createSeededRandom,
  enemySpawnPoints,
  pillarBannerPlacements,
  plinthPositions,
  standBannerPlacements,
  standPoint,
  tileSeamOffsets,
} from './CelestialConfig';
import {
  createBannerGeometry,
  createRockGeometry,
  diamondShape,
  horizontalPlate,
} from './CelestialGeometry';

/**
 * Contratos da Arena Celeste extraídos das referências
 * (docs/arena-celeste/ESPECIFICACAO-CIRURGICA.md): medidas, simetria das
 * bandeiras, gemas nos cantos e presença de todas as peças exigidas pelo
 * checklist do orquestrador.
 */
describe('Arena Celeste · medidas', () => {
  it('usa 50 m de lado com 4 x 4 lajotas, como o Level antigo', () => {
    expect(ARENA.size).toBe(50);
    expect(ARENA.tileCount).toBe(4);
    expect(ARENA.tileSize).toBe(12.5);
    expect(tileSeamOffsets()).toEqual([-25, -12.5, 0, 12.5, 25]);
  });

  it('mantém o medalhão concêntrico e os braços dentro da moldura', () => {
    expect(ARENA.medallionOuterRadius).toBeLessThan(ARENA.half);
    expect(ARENA.medallionInnerRadius).toBeLessThan(ARENA.medallionOuterRadius);
    expect(ARENA.medallionAccentRadius).toBeLessThan(ARENA.medallionInnerRadius);
    expect(ARENA.medallionOuterRadius * 2).toBeLessThan(ARENA.tileSize * 2);
    const borderOffset = ARENA.half - ARENA.borderInset;
    expect(ARENA.armInnerRadius).toBeLessThan(borderOffset);
  });

  it('preserva a área jogável do Level: spawns longe dos plintos', () => {
    const plinths = plinthPositions();
    const spawns = enemySpawnPoints();
    expect(spawns).toHaveLength(8);
    for (const spawn of spawns) {
      const inside =
        Math.abs(spawn.x) <= ARENA.half - ARENA.curbWidth &&
        Math.abs(spawn.z) <= ARENA.half - ARENA.curbWidth;
      expect(inside).toBe(true);
      for (const plinth of plinths) {
        expect(Math.hypot(spawn.x - plinth.x, spawn.z - plinth.z)).toBeGreaterThan(ARENA.plinthWidth * 0.9);
      }
    }
  });
});

describe('Arena Celeste · marchetaria', () => {
  it('coloca uma gema azul em cada canto interno da moldura', () => {
    const gems = cornerGemPositions();
    expect(gems).toHaveLength(4);
    const xs = new Set(gems.map((gem) => Math.sign(gem.x)));
    const zs = new Set(gems.map((gem) => Math.sign(gem.z)));
    expect(xs.size).toBe(2);
    expect(zs.size).toBe(2);
    for (const gem of gems) {
      expect(Math.abs(gem.x)).toBeCloseTo(Math.abs(gem.z), 6);
      expect(Math.abs(gem.x)).toBeLessThan(ARENA.half);
    }
  });

  it('mantém os quatro plintos simétricos e dentro da laje', () => {
    const plinths = plinthPositions();
    expect(plinths).toHaveLength(4);
    for (const plinth of plinths) {
      expect(Math.abs(plinth.x) + ARENA.plinthWidth / 2).toBeLessThanOrEqual(ARENA.half);
      expect(Math.abs(plinth.z) + ARENA.plinthWidth / 2).toBeLessThanOrEqual(ARENA.half);
    }
  });
});

describe('Arena Celeste · bandeiras', () => {
  it('distribui 4 na frente, 3 no fundo e 3 em cada lateral', () => {
    const banners = arenaBannerPlacements();
    const front = banners.filter((banner) => banner.z > 0 && banner.rotationY === 0);
    const back = banners.filter((banner) => banner.z < 0 && banner.rotationY === Math.PI);
    const sides = banners.filter((banner) => Math.abs(banner.rotationY) === Math.PI / 2);
    expect(front).toHaveLength(4);
    expect(back).toHaveLength(3);
    expect(sides).toHaveLength(6);
  });

  it('pendura uma bandeira em cada brasseiro interno, virada para a arena', () => {
    const banners = pillarBannerPlacements();
    const inner = brazierPositions().filter((position) => Math.abs(position.x) < ARENA.half);
    expect(banners).toHaveLength(inner.length);
    expect(inner.length).toBeGreaterThanOrEqual(4);
    for (const banner of banners) {
      expect(Math.abs(banner.rotationY)).toBeCloseTo(Math.PI / 2, 6);
      expect(banner.y).toBeGreaterThan(ARENA.standColumnHeight);
    }
  });

  it('espelha as bandeiras das tribunas sem invadir a área jogável', () => {
    const banners = standBannerPlacements();
    expect(banners.length).toBeGreaterThanOrEqual(10);
    for (const banner of banners) {
      // Simetria de 180°: para cada bandeira existe a oposta em (-x, -z).
      const mirrored = banners.find(
        (other) =>
          other !== banner &&
          Math.abs(other.x + banner.x) < 1e-6 &&
          Math.abs(other.z + banner.z) < 1e-6
      );
      expect(mirrored).toBeDefined();
      // A ponta frontal da tribuna converge e encosta na borda, nunca na área central.
      expect(Math.abs(banner.x)).toBeGreaterThan(ARENA.half);
    }
  });
});

describe('Arena Celeste · tribunas', () => {
  it('espelha exatamente as coordenadas locais das tribunas', () => {
    for (const localZ of [-18, -9, 0, 9, 18]) {
      const right = standPoint(1, 26.35, localZ);
      const left = standPoint(-1, 26.35, localZ);
      // O lado esquerdo é o direito rodado 180° no plano: (x, z) → (-x, -z).
      expect(left.x).toBeCloseTo(-right.x, 6);
      expect(left.z).toBeCloseTo(-right.z, 6);
      expect(left.rotationY).toBeCloseTo(right.rotationY + Math.PI, 6);
    }
  });

  it('mantém as tribunas fora da área de combate (|x| > 23,5)', () => {
    for (const side of [-1, 1] as const) {
      for (const localZ of [-20, 0, 20]) {
        const promenade = standPoint(side, 24.3, localZ);
        const balustrade = standPoint(side, 26.6, localZ);
        const crowd = standPoint(side, 27.9, localZ);
        // A promenade pode encostar na borda, mas nunca sobre a moldura dourada.
        // Nada da tribuna pisa na área jogável: a promenade é o limite interno.
        expect(Math.abs(promenade.x)).toBeGreaterThan(ARENA.half - 1.5);
        expect(Math.abs(balustrade.x)).toBeGreaterThan(ARENA.half);
        expect(Math.abs(crowd.x)).toBeGreaterThan(ARENA.half + 1);
      }
    }
  });
});

describe('Arena Celeste · câmeras de QA', () => {
  it('tem as duas câmeras calibradas para as referências e a do jogo', () => {
    expect(Object.keys(ARENA_CAMERAS)).toEqual(['ref1', 'ref2', 'overview', 'boss']);
    for (const preset of Object.values(ARENA_CAMERAS)) {
      expect(preset.position).toHaveLength(3);
      expect(preset.target).toHaveLength(3);
      expect(preset.fov).toBeGreaterThan(20);
      expect(preset.fov).toBeLessThan(90);
    }
    expect(ARENA_CAMERAS.ref1.position[2]).toBeGreaterThan(ARENA.half);
  });
});

describe('Arena Celeste · geometria procedural', () => {
  it('gera rocha determinística com a mesma semente', () => {
    const first = createRockGeometry(7, 1);
    const second = createRockGeometry(7, 1);
    expect(Array.from(first.getAttribute('position').array.slice(0, 12))).toEqual(
      Array.from(second.getAttribute('position').array.slice(0, 12))
    );
    const other = createRockGeometry(8, 1);
    expect(Array.from(other.getAttribute('position').array.slice(0, 12))).not.toEqual(
      Array.from(first.getAttribute('position').array.slice(0, 12))
    );
  });

  it('recorta a ponta da bandeira e mantém UV dentro de 0..1', () => {
    const geometry = createBannerGeometry(1.7, 3.9, 0.55, 3);
    const position = geometry.getAttribute('position');
    const uv = geometry.getAttribute('uv');
    let minY = Infinity;
    let maxY = -Infinity;
    for (let i = 0; i < position.count; i++) {
      minY = Math.min(minY, position.getY(i));
      maxY = Math.max(maxY, position.getY(i));
      expect(uv.getX(i)).toBeGreaterThanOrEqual(0);
      expect(uv.getX(i)).toBeLessThanOrEqual(1);
    }
    expect(maxY).toBeCloseTo(0, 5);
    expect(minY).toBeLessThan(-(3.9 + 0.4));
    expect(geometry.index?.count ?? 0).toBeGreaterThan(0);
  });

  it('gera o losango de incrustação e a placa deitada com espessura', () => {
    const plate = horizontalPlate(diamondShape(2), 0.03, 0.02, 0.01);
    plate.computeBoundingBox();
    const box = plate.boundingBox!;
    expect(box.max.y).toBeGreaterThan(0.01);
    expect(box.min.x).toBeLessThan(-0.9);
    expect(box.max.x).toBeGreaterThan(0.9);
  });

  it('é determinístico: a mesma semente repete a mesma sequência', () => {
    const a = createSeededRandom(42);
    const b = createSeededRandom(42);
    const sequenceA = Array.from({ length: 5 }, () => a());
    const sequenceB = Array.from({ length: 5 }, () => b());
    expect(sequenceA).toEqual(sequenceB);
    expect(new Set(sequenceA).size).toBeGreaterThan(1);
  });
});
