/**
 * Medidas e paleta da Arena Celeste.
 *
 * Tudo aqui sai da leitura das duas referências (ver
 * `docs/arena-celeste/ESPECIFICACAO-CIRURGICA.md`, seção 2). As constantes
 * ficam nomeadas para que o desenho do piso, das bandeiras e das câmeras de
 * QA compartilhem a mesma fonte de verdade — nenhum número solto no meio da
 * geometria.
 */

/** Lado da area jogavel. Igual ao `Level` antigo para preservar spawns. */
export const ARENA_SIZE = 50;
export const ARENA_HALF = ARENA_SIZE / 2;

export const ARENA = Object.freeze({
  size: ARENA_SIZE,
  half: ARENA_HALF,
  tileCount: 4,
  tileSize: ARENA_SIZE / 4,
  groundY: 0,
  slabThickness: 1.15,
  /** Distancia da borda ate a moldura dourada (m). */
  borderInset: 4.6,
  borderWidth: 0.55,
  borderHeight: 0.055,
  medallionOuterRadius: 10.0,
  medallionInnerRadius: 7.95,
  medallionAccentRadius: 6.95,
  ringWidth: 0.26,
  armWidth: 1.5,
  armInnerRadius: 5.35,
  armTipOverlap: 0.35,
  centerDiamond: 4.2,
  cornerGemInset: 2.1,
  cornerGemSize: 1.8,
  plinthCenter: ARENA_HALF - 1.9,
  plinthWidth: 2.4,
  plinthHeight: 0.82,
  curbWidth: 0.55,
  curbHeight: 0.28,
  bannerWidth: 7.0,
  bannerHeight: 13.4,
  bannerTip: 2.1,
  pillarBannerWidth: 1.35,
  pillarBannerHeight: 4.6,
  brazierHeight: 8.2,
  brazierBase: 1.25,
  standInnerX: 28,
  standOuterX: 39,
  standFrontZ: 40,
  standDeckY: 2,
  standColumnHeight: 7.8,
  standRoofY: 9.2,
  crowdRows: 5,
  crowdRowSpacing: 1.05,
  crowdSpacing: 1.02,
  skyRadius: 800,
  islandDistance: 150,
  cloudSeaY: -45,
  sunPosition: Object.freeze({ x: 20, y: 86, z: 32 }),
} as const);

/**
 * Fachada da laje (a "parede" sob o piso na ref 1): faixa dourada no topo,
 * faixa de mármore, moldura saliente e parede de pedra muito funda, com
 * bandeiras penduradas. As alturas foram convertidas das linhas da ref 1 com
 * `tools/ref-rows.mjs` para a câmera calibrada.
 */
export const FASCIA = Object.freeze({
  bullnoseHeight: 1.3,
  bullnoseOut: 0.16,
  marbleHeight: 1.75,
  moldingHeight: 0.35,
  moldingOut: 0.3,
  /** Parede de pedra: de −3,5 m até −17,2 m. */
  stoneTop: -3.5,
  stoneBottom: -17.2,
  stoneInset: 0.1,
  bannerTop: -7.9,
  bannerX: 14,
  pendantTop: -1.2,
  pendantHeight: 9.5,
} as const);

/** Posicoes canonicas derivadas da arena (mantidas puras para os testes). */
export function borderOffset(): number {
  return ARENA.half - ARENA.borderInset;
}

export function tileSeamOffsets(): number[] {
  const step = ARENA.tileSize;
  const seams: number[] = [];
  for (let i = 0; i <= ARENA.tileCount; i++) {
    seams.push(-ARENA.half + i * step);
  }
  return seams;
}

/** Losangos de gema nos quatro cantos internos da moldura. */
export function cornerGemPositions(size = ARENA.half): { x: number; z: number }[] {
  const offset = borderOffset() - ARENA.cornerGemInset;
  return [
    { x: -offset, z: -offset },
    { x: offset, z: -offset },
    { x: -offset, z: offset },
    { x: offset, z: offset },
  ].map((p) => ({ x: clampToArena(p.x, size), z: clampToArena(p.z, size) }));
}

/** Plintos de canto (por fora da moldura, sobre a laje). */
export function plinthPositions(): { x: number; z: number }[] {
  const p = ARENA.plinthCenter;
  return [
    { x: -p, z: -p },
    { x: p, z: -p },
    { x: -p, z: p },
    { x: p, z: p },
  ];
}

/**
 * Brasseiros: quatro colunas com chama DENTRO da arena, junto às laterais
 * (como nas refs 1 e 2), mais quatro na promenade da arquibancada. Ficam fora
 * da área de combate central e ganham obstáculo de navegação.
 */
export function brazierPositions(): { x: number; z: number; scale: number }[] {
  const inner = ARENA.half - 2.6; // ±22,4
  return [
    { x: -inner, z: -11.5, scale: 1 },
    { x: inner, z: -11.5, scale: 1 },
    { x: -inner, z: 11.5, scale: 1 },
    { x: inner, z: 11.5, scale: 1 },
  ];
}

export type BannerMount = 'arena' | 'pillar' | 'stand';

export interface BannerPlacement {
  x: number;
  y: number;
  z: number;
  /** Rotacao em Y para a bandeira olhar para fora do elemento. */
  rotationY: number;
  width: number;
  height: number;
  /** Ponta triangular abaixo do pano (m). */
  tip?: number;
  mount: BannerMount;
}

/**
 * Bandeiras da face externa da laje. Frente = +Z (a borda que aparece na
 * ref 1), fundo = -Z, laterais = ±X. A frente leva 4; fundo e laterais, 3.
 */
export function arenaBannerPlacements(): BannerPlacement[] {
  const placements: BannerPlacement[] = [];
  const face = ARENA.half + 0.06;
  const y = FASCIA.bannerTop;
  const x = FASCIA.bannerX;
  for (const side of [-1, 1] as const) {
    placements.push({ x: side * x, y, z: face, rotationY: 0, width: ARENA.bannerWidth, height: ARENA.bannerHeight, mount: 'arena' });
    placements.push({ x: side * x, y, z: -face, rotationY: Math.PI, width: ARENA.bannerWidth, height: ARENA.bannerHeight, mount: 'arena' });
    placements.push({ x: face, y, z: side * x, rotationY: Math.PI / 2, width: ARENA.bannerWidth, height: ARENA.bannerHeight, mount: 'arena' });
    placements.push({ x: -face, y, z: side * x, rotationY: -Math.PI / 2, width: ARENA.bannerWidth, height: ARENA.bannerHeight, mount: 'arena' });
  }
  return placements;
}

/** Bandeiras dos brasseiros (penduradas no fuste, olhando para a arena). */
export function pillarBannerPlacements(): BannerPlacement[] {
  return brazierPositions()
    .filter((position) => Math.abs(position.x) < ARENA.half)
    .map((position) => ({
      x: position.x < 0 ? position.x + 0.55 : position.x - 0.55,
      y: 10.4,
      z: position.z,
      rotationY: position.x < 0 ? Math.PI / 2 : -Math.PI / 2,
      width: ARENA.pillarBannerWidth,
      height: ARENA.pillarBannerHeight,
      mount: 'pillar' as const,
    }));
}

/**
 * Bandeiras penduradas nos pilares com braseiro das tribunas (ref 1): uma por
 * pilar, olhando para dentro da arena.
 */
export function standBannerPlacements(): BannerPlacement[] {
  const placements: BannerPlacement[] = [];
  for (const side of [-1, 1] as const) {
    // Pilares com braseiro, na frente de cada tribuna.
    for (const offset of [-9.5, 9.5]) {
      placements.push({
        x: side * 42 + offset,
        y: 7.3,
        z: -15.0,
        rotationY: 0,
        width: 3.2,
        height: 7.0,
        tip: 0.95,
        mount: 'stand',
      });
    }
    // Bandeiras da fachada, entre os pilares.
    for (const offset of [-15.4, -4.75, 4.75, 15.4]) {
      placements.push({
        x: side * 42 + offset,
        y: 0.9,
        z: -15.6,
        rotationY: 0,
        width: 2.6,
        height: 4.4,
        tip: 0.8,
        mount: 'stand',
      });
    }
  }
  return placements;
}

/**
 * Tribunas: cada lado é construído em coordenadas locais (frente em -X,
 * centro em x = STAND_CENTER_X) e o grupo inteiro gira para convergir no fundo,
 * como nas refs 1 e 2. O pivô fica no centro da tribuna.
 */
export const STAND_CENTER_X = 36;
/**
 * Tribunas paralelas às laterais. A convergência das referências foi testada e
 * descartada: com 50 m de lado, girar a tribuna empurrava a frente dela para
 * dentro da área jogável (|x| < 23,5). O enquadramento em perspectiva já dá a
 * leitura de convergência sem custo de gameplay.
 */
export const STAND_YAW = 0;
export const STAND_LENGTH = 32;

/** Transforma um ponto local da tribuna em coordenada de mundo. */
export function standPoint(
  side: -1 | 1,
  localX: number,
  localZ: number
): { x: number; z: number; rotationY: number } {
  // O lado esquerdo é o direito rodado 180° no plano: simetria exata, com as
  // duas frentes convergindo para o fundo (refs 1 e 2).
  const yaw = side > 0 ? STAND_YAW : STAND_YAW + Math.PI;
  const cos = Math.cos(yaw);
  const sin = Math.sin(yaw);
  const dx = localX - STAND_CENTER_X;
  return {
    x: side * STAND_CENTER_X + dx * cos + localZ * sin,
    z: -dx * sin + localZ * cos,
    rotationY: yaw,
  };
}

export interface ArenaCameraPreset {
  readonly position: readonly [number, number, number];
  readonly target: readonly [number, number, number];
  readonly fov: number;
}

/**
 * Enquadramentos de QA. A camera 1 reproduz a ref frontal e a camera 2 a
 * perspectiva de canto; `overview` e `boss` servem ao jogo.
 */
export const ARENA_CAMERAS: Readonly<Record<string, ArenaCameraPreset>> = Object.freeze({
  // Câmeras baixas como nas refs: o piso domina o quadro e a colunata aparece nas laterais.
  // Câmera obtida por ressecção do quadrilátero do piso medido na ref 1
  // (`tools/fit-camera-quad.mjs`): erra ≤ 5 px nos quatro cantos.
  ref1: { position: [0, 37.86, 63.16], target: [0, -4.09, 0], fov: 58 },
  ref2: { position: [38, 14, 40], target: [-2, 2, -6], fov: 46 },
  overview: { position: [0, 34, 46], target: [0, 0, -2], fov: 45 },
  boss: { position: [0, 15, 8], target: [0, 1, -14], fov: 40 },
});

/** Paleta amostrada das referencias (ESPECIFICACAO, secao 3). */
export const PALETTE = Object.freeze({
  marbleLight: 0xe7e4e2,
  marbleMid: 0xd9d6dc,
  marbleShade: 0xb9b5bd,
  marbleVein: 0x8e8a95,
  ivory: 0xf2efe9,
  goldMid: 0xd2a445,
  goldLight: 0xffe7a3,
  goldDark: 0x7c5714,
  enamelBlue: 0x1d3f9e,
  bannerBlue: 0x22509f,
  sapphire: 0x2f6bff,
  limestone: 0xd6cfc2,
  limestoneShade: 0xa79f92,
  rock: 0x8b8378,
  rockDark: 0x5f5a52,
  moss: 0x6d7f4d,
  foliage: 0x5c7b3f,
  skyTop: 0x3f8fd8,
  skyHorizon: 0xdcecf7,
  cloudLight: 0xfdfeff,
  cloudShade: 0xc9d6e6,
  sun: 0xfff2dd,
  crowd: 0x23252c,
  crowdAccent: 0x39414f,
} as const);

/** RNG deterministico: o cenario tem de ficar identico entre builds. */
export function createSeededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function clampToArena(value: number, size: number): number {
  const limit = size - ARENA.curbWidth - ARENA.cornerGemSize / 2;
  return Math.max(-limit, Math.min(limit, value));
}

/** Posicoes de spawn herdadas do Level: bordas/cantos, fora das estruturas. */
export function enemySpawnPoints(size = ARENA.size): { x: number; z: number }[] {
  const half = size / 2 - 1.5;
  // Cantos ficam 2 m para dentro: os plintos de canto ocupam a quina.
  return [
    { x: -half + 2, z: -half + 2 },
    { x: half - 2, z: -half + 2 },
    { x: -half + 2, z: half - 2 },
    { x: half - 2, z: half - 2 },
    { x: 0, z: half - 1.5 },
    { x: 0, z: -half + 1.5 },
    { x: -half + 1.5, z: 0 },
    { x: half - 1.5, z: 0 },
  ];
}
