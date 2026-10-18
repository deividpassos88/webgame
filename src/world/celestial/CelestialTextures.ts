import * as THREE from 'three';
import { PALETTE, createSeededRandom } from './CelestialConfig';

/**
 * Texturas procedurais da Arena Celeste.
 *
 * O cenario nao baixa nenhum asset: tudo e desenhado em canvas na inicializacao
 * (poucos ms) com semente fixa, entao dois builds geram exatamente o mesmo
 * marmore, o mesmo ouro e as mesmas nuvens.
 */

type Ctx = CanvasRenderingContext2D;

function createCanvas(width: number, height = width): { canvas: HTMLCanvasElement; ctx: Ctx } {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D indisponível para as texturas da arena.');
  return { canvas, ctx };
}

function toTexture(canvas: HTMLCanvasElement, srgb = true): THREE.CanvasTexture {
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.needsUpdate = true;
  return texture;
}

function rgba(hex: number, alpha: number): string {
  const r = (hex >> 16) & 255;
  const g = (hex >> 8) & 255;
  const b = hex & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** Veio de marmore: caminhada suave com ramificacoes finas. */
function drawVein(
  ctx: Ctx,
  rand: () => number,
  startX: number,
  startY: number,
  scale: number,
  color: string,
  width: number,
  alpha: number
): void {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.globalAlpha = alpha;
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.beginPath();
  let x = startX;
  let y = startY;
  ctx.moveTo(x, y);
  const steps = 5 + Math.floor(rand() * 4);
  for (let i = 0; i < steps; i++) {
    const nx = x + (rand() - 0.5) * scale * 0.7;
    const ny = y + (rand() - 0.35) * scale * 0.55;
    ctx.quadraticCurveTo(
      x + (rand() - 0.5) * scale * 0.25,
      y + (rand() - 0.5) * scale * 0.25,
      nx,
      ny
    );
    x = nx;
    y = ny;
  }
  ctx.stroke();
  ctx.restore();
}

/**
 * Marmore de lajota: 4 x 4 lajotas, veios em duas escalas, juntas finas.
 * A textura ja contem a grelha, entao o piso nao depende de geometria por lajota.
 */
export function makeMarbleTexture(seed = 0x5eed1): THREE.CanvasTexture {
  const size = 2048;
  const { canvas, ctx } = createCanvas(size);
  const rand = createSeededRandom(seed);
  const tiles = 4;
  const tile = size / tiles;

  ctx.fillStyle = `#${PALETTE.marbleMid.toString(16).padStart(6, '0')}`;
  ctx.fillRect(0, 0, size, size);

  for (let ty = 0; ty < tiles; ty++) {
    for (let tx = 0; tx < tiles; tx++) {
      const x0 = tx * tile;
      const y0 = ty * tile;
      // Base levemente diferente por lajota (evita o efeito "papel de parede").
      const tint = Math.floor(rand() * 14) - 7;
      ctx.fillStyle = `rgb(${219 + tint}, ${215 + tint}, ${224 + tint})`;
      ctx.fillRect(x0, y0, tile, tile);

      // Manchas suaves de profundidade.
      for (let i = 0; i < 9; i++) {
        const cx = x0 + rand() * tile;
        const cy = y0 + rand() * tile;
        const r = tile * (0.06 + rand() * 0.2);
        const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
        const shade = rand() > 0.5 ? 0xffffff : 0xb9b5bd;
        gradient.addColorStop(0, rgba(shade, 0.26));
        gradient.addColorStop(1, rgba(shade, 0));
        ctx.fillStyle = gradient;
        ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
      }

      // Veios largos (nuvem) + veios finos (risco). A textura cobre 2 x 2
      // lajotas, então o comprimento dos veios acompanha a lajota.
      for (let i = 0; i < 6; i++) {
        drawVein(
          ctx,
          rand,
          x0 + rand() * tile,
          y0 + rand() * tile,
          tile * 0.34,
          rgba(PALETTE.marbleVein, 1),
          2.2 + rand() * 4,
          0.1 + rand() * 0.07
        );
      }
      for (let i = 0; i < 12; i++) {
        drawVein(
          ctx,
          rand,
          x0 + rand() * tile,
          y0 + rand() * tile,
          tile * 0.3,
          rgba(0x6f6a76, 1),
          0.7 + rand() * 1.0,
          0.17 + rand() * 0.11
        );
      }
      // Realce branco imediatamente ao lado de alguns veios.
      for (let i = 0; i < 3; i++) {
        drawVein(
          ctx,
          rand,
          x0 + rand() * tile,
          y0 + rand() * tile,
          tile * 0.26,
          'rgba(255,255,255,1)',
          0.9 + rand() * 1.2,
          0.12
        );
      }

      // Micro-speckle de pedra.
      for (let i = 0; i < 900; i++) {
        const sx = x0 + rand() * tile;
        const sy = y0 + rand() * tile;
        ctx.fillStyle = rand() > 0.5 ? 'rgba(120,116,124,0.05)' : 'rgba(255,255,255,0.06)';
        ctx.fillRect(sx, sy, 1.2, 1.2);
      }
    }
  }

  // Juntas: linha escura + fio claro (bisel).
  ctx.strokeStyle = 'rgba(138,133,145,0.6)';
  ctx.lineWidth = 3;
  for (let i = 0; i <= tiles; i++) {
    const p = i * tile;
    ctx.beginPath();
    ctx.moveTo(p, 0);
    ctx.lineTo(p, size);
    ctx.moveTo(0, p);
    ctx.lineTo(size, p);
    ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(255,255,255,0.42)';
  ctx.lineWidth = 1.5;
  for (let i = 0; i <= tiles; i++) {
    const p = i * tile + 4;
    ctx.beginPath();
    ctx.moveTo(p, 0);
    ctx.lineTo(p, size);
    ctx.moveTo(0, p);
    ctx.lineTo(size, p);
    ctx.stroke();
  }

  const texture = toTexture(canvas);
  texture.anisotropy = 8;
  return texture;
}

/** Ouro escovado com patina: base quente + milhares de micro-riscos. */
export function makeGoldTexture(seed = 0x901d): THREE.CanvasTexture {
  const size = 512;
  const { canvas, ctx } = createCanvas(size);
  const rand = createSeededRandom(seed);
  const gradient = ctx.createLinearGradient(0, 0, size, size);
  gradient.addColorStop(0, '#e8c76d');
  gradient.addColorStop(0.45, '#c79a3d');
  gradient.addColorStop(0.72, '#f0d489');
  gradient.addColorStop(1, '#a97c28');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);

  // Microrriscos curtos e aleatórios: dashes longos viravam veios de madeira.
  for (let i = 0; i < 2400; i++) {
    const x = rand() * size;
    const y = rand() * size;
    const length = 4 + rand() * 18;
    ctx.strokeStyle = rand() > 0.45 ? 'rgba(255, 238, 180, 0.12)' : 'rgba(90, 62, 10, 0.09)';
    ctx.lineWidth = 0.5 + rand() * 0.9;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + length, y + (rand() - 0.5) * 1.5);
    ctx.stroke();
  }
  for (let i = 0; i < 120; i++) {
    const cx = rand() * size;
    const cy = rand() * size;
    const r = 2 + rand() * 12;
    const patina = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    patina.addColorStop(0, 'rgba(84, 56, 8, 0.10)');
    patina.addColorStop(1, 'rgba(84, 56, 8, 0)');
    ctx.fillStyle = patina;
    ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
  }
  const texture = toTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  return texture;
}

/** Esmalte azul (lapis) das placas dos plintos e da moldura. */
export function makeEnamelTexture(seed = 0xb1ae): THREE.CanvasTexture {
  const size = 256;
  const { canvas, ctx } = createCanvas(size);
  const rand = createSeededRandom(seed);
  const gradient = ctx.createLinearGradient(0, 0, size, size);
  gradient.addColorStop(0, '#2a5bc8');
  gradient.addColorStop(0.5, '#1b3c96');
  gradient.addColorStop(1, '#122a72');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 70; i++) {
    const cx = rand() * size;
    const cy = rand() * size;
    const r = 4 + rand() * 26;
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    g.addColorStop(0, 'rgba(120, 170, 255, 0.16)');
    g.addColorStop(1, 'rgba(120, 170, 255, 0)');
    ctx.fillStyle = g;
    ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
  }
  return toTexture(canvas);
}

/** Calcario em blocos, para o embasamento das arquibancadas. */
export function makeLimestoneTexture(seed = 0x11e5): THREE.CanvasTexture {
  const size = 1024;
  const { canvas, ctx } = createCanvas(size);
  const rand = createSeededRandom(seed);
  ctx.fillStyle = `#${PALETTE.limestone.toString(16)}`;
  ctx.fillRect(0, 0, size, size);
  const rows = 8;
  const rowH = size / rows;
  for (let row = 0; row < rows; row++) {
    const offset = row % 2 === 0 ? 0 : rowH * 0.9;
    for (let col = -1; col < 6; col++) {
      const x = col * rowH * 1.8 + offset;
      const y = row * rowH;
      const shade = Math.floor(rand() * 9) - 4;
      ctx.fillStyle = `rgb(${219 + shade}, ${212 + shade}, ${200 + shade})`;
      ctx.fillRect(x + 2, y + 2, rowH * 1.8 - 4, rowH - 4);
      for (let i = 0; i < 26; i++) {
        ctx.fillStyle = rand() > 0.5 ? 'rgba(255,255,255,0.10)' : 'rgba(90,84,74,0.07)';
        ctx.fillRect(x + rand() * rowH * 1.8, y + rand() * rowH, 2, 2);
      }
    }
  }
  ctx.strokeStyle = 'rgba(132,124,112,0.22)';
  ctx.lineWidth = 1.5;
  for (let row = 0; row <= rows; row++) {
    ctx.beginPath();
    ctx.moveTo(0, row * rowH);
    ctx.lineTo(size, row * rowH);
    ctx.stroke();
  }
  return toTexture(canvas);
}

/** Rocha das ilhas flutuantes e da base da arena. */
export function makeRockTexture(seed = 0x70c4): THREE.CanvasTexture {
  const size = 512;
  const { canvas, ctx } = createCanvas(size);
  const rand = createSeededRandom(seed);
  ctx.fillStyle = `#${PALETTE.rock.toString(16)}`;
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 2600; i++) {
    const x = rand() * size;
    const y = rand() * size;
    const r = 1 + rand() * 6;
    const light = rand() > 0.5;
    ctx.fillStyle = light ? 'rgba(190, 183, 172, 0.10)' : 'rgba(58, 53, 47, 0.12)';
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  for (let i = 0; i < 90; i++) {
    ctx.strokeStyle = 'rgba(54, 49, 44, 0.18)';
    ctx.lineWidth = 0.8 + rand() * 1.4;
    ctx.beginPath();
    let x = rand() * size;
    let y = rand() * size;
    ctx.moveTo(x, y);
    for (let s = 0; s < 4; s++) {
      x += (rand() - 0.5) * 50;
      y += (rand() - 0.2) * 40;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  return toTexture(canvas);
}

/** Grama/musgo das ilhas. */
export function makeMossTexture(seed = 0x6055): THREE.CanvasTexture {
  const size = 256;
  const { canvas, ctx } = createCanvas(size);
  const rand = createSeededRandom(seed);
  ctx.fillStyle = '#5f7c40';
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 2600; i++) {
    ctx.fillStyle = rand() > 0.5 ? 'rgba(126, 156, 82, 0.35)' : 'rgba(58, 78, 38, 0.35)';
    ctx.fillRect(rand() * size, rand() * size, 2, 2 + rand() * 3);
  }
  return toTexture(canvas);
}

/**
 * Bandeira: pano azul com dobras, borda dourada e emblema de losango.
 * O recorte em ponta e feito na geometria; a textura desenha o pano inteiro.
 */
export function makeBannerTexture(seed = 0xba77e): THREE.CanvasTexture {
  const width = 512;
  const height = 1024;
  const { canvas, ctx } = createCanvas(width, height);
  const rand = createSeededRandom(seed);

  const fabric = ctx.createLinearGradient(0, 0, width, 0);
  fabric.addColorStop(0, '#183c86');
  fabric.addColorStop(0.18, '#2a5cb4');
  fabric.addColorStop(0.42, '#1f4b9c');
  fabric.addColorStop(0.62, '#2c61bd');
  fabric.addColorStop(0.85, '#1b418d');
  fabric.addColorStop(1, '#14336f');
  ctx.fillStyle = fabric;
  ctx.fillRect(0, 0, width, height);

  // Dobras verticais suaves.
  for (let i = 0; i < 22; i++) {
    const x = rand() * width;
    const w = 6 + rand() * 34;
    const g = ctx.createLinearGradient(x, 0, x + w, 0);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(0.5, rand() > 0.5 ? 'rgba(140, 190, 255, 0.10)' : 'rgba(4, 16, 46, 0.18)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x, 0, w, height);
  }
  // Trama do tecido.
  for (let y = 0; y < height; y += 3) {
    ctx.fillStyle = 'rgba(255,255,255,0.025)';
    ctx.fillRect(0, y, width, 1);
  }

  const gold = '#d8b256';
  const goldDark = '#8a6416';
  ctx.strokeStyle = goldDark;
  ctx.lineWidth = 26;
  ctx.strokeRect(13, 13, width - 26, height - 26);
  ctx.strokeStyle = gold;
  ctx.lineWidth = 16;
  ctx.strokeRect(16, 16, width - 32, height - 32);
  ctx.strokeStyle = 'rgba(255, 239, 178, 0.65)';
  ctx.lineWidth = 3;
  ctx.strokeRect(27, 27, width - 54, height - 54);

  // Emblema: losango vazado com losango interno e haste vertical.
  const cx = width / 2;
  const cy = height * 0.3;
  const diamond = (x: number, y: number, half: number, fill: boolean) => {
    ctx.beginPath();
    ctx.moveTo(x, y - half);
    ctx.lineTo(x + half * 0.78, y);
    ctx.lineTo(x, y + half);
    ctx.lineTo(x - half * 0.78, y);
    ctx.closePath();
    if (fill) ctx.fill();
    else ctx.stroke();
  };
  ctx.strokeStyle = gold;
  ctx.lineWidth = 10;
  ctx.shadowColor = 'rgba(0,0,0,0.35)';
  ctx.shadowBlur = 6;
  diamond(cx, cy, 96, false);
  ctx.fillStyle = gold;
  diamond(cx, cy, 46, true);
  ctx.fillStyle = '#1d3f9e';
  diamond(cx, cy, 22, true);
  ctx.shadowBlur = 0;
  ctx.strokeStyle = gold;
  ctx.lineWidth = 9;
  ctx.beginPath();
  ctx.moveTo(cx, cy + 96);
  ctx.lineTo(cx, cy + 150);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cx - 12, cy + 138);
  ctx.lineTo(cx, cy + 122);
  ctx.lineTo(cx + 12, cy + 138);
  ctx.stroke();

  // Barra dourada superior (onde o pano encontra o mastro). Fica entalhada no
  // topo do pano: o mastro de metal é geometria separada em `buildBanners`.
  ctx.fillStyle = goldDark;
  ctx.fillRect(0, 0, width, 66);
  ctx.fillStyle = gold;
  ctx.fillRect(0, 0, width, 54);
  ctx.fillStyle = 'rgba(255, 244, 198, 0.8)';
  ctx.fillRect(0, 6, width, 8);

  const texture = toTexture(canvas);
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  return texture;
}

/**
 * Cúmulo: massas brancas com bordas definidas, topo iluminado e base azulada.
 * A referência tem nuvens de contorno limpo, não névoa — por isso os puffs são
 * desenhados opacos e só as bordas recebem alfa.
 */
export function makeCloudTexture(seed = 0xc10d): THREE.CanvasTexture {
  const size = 512;
  const { canvas, ctx } = createCanvas(size);
  const rand = createSeededRandom(seed);

  const puff = (x: number, y: number, r: number, color: string, alpha: number) => {
    const g = ctx.createRadialGradient(x, y - r * 0.18, r * 0.08, x, y, r);
    g.addColorStop(0, color.replace('ALPHA', String(alpha)));
    g.addColorStop(0.62, color.replace('ALPHA', String(alpha)));
    g.addColorStop(0.82, color.replace('ALPHA', String(alpha * 0.55)));
    g.addColorStop(1, color.replace('ALPHA', '0'));
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  };

  // Base larga (sombra azulada).
  const baseX = size * 0.5;
  const baseY = size * 0.66;
  for (let i = 0; i < 16; i++) {
    const x = baseX + (rand() - 0.5) * size * 0.72;
    const y = baseY + (rand() - 0.5) * size * 0.12;
    puff(x, y, size * (0.1 + rand() * 0.09), 'rgba(176, 198, 220, ALPHA)', 0.9);
  }
  // Corpo branco em três alturas, do fundo para o topo.
  for (let layer = 0; layer < 3; layer++) {
    const count = 10 - layer * 2;
    for (let i = 0; i < count; i++) {
      const spread = size * (0.62 - layer * 0.14);
      const x = baseX + (rand() - 0.5) * spread;
      const y = baseY - layer * size * 0.1 + (rand() - 0.5) * size * 0.07;
      const r = size * (0.09 + rand() * 0.07) * (1 - layer * 0.12);
      puff(x, y, r, 'rgba(250, 252, 255, ALPHA)', 0.96);
    }
  }
  // Topo iluminado pelo sol.
  for (let i = 0; i < 12; i++) {
    const x = baseX + (rand() - 0.5) * size * 0.5;
    const y = baseY - size * 0.26 + (rand() - 0.5) * size * 0.08;
    const r = size * (0.05 + rand() * 0.05);
    puff(x, y, r, 'rgba(255, 253, 246, ALPHA)', 1);
  }

  const texture = toTexture(canvas);
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  return texture;
}

/** Mar de nuvens: manto de cúmulos claro e tileável, visto de longe. */
export function makeCloudSeaTexture(seed = 0x5ea): THREE.CanvasTexture {
  const size = 1024;
  const { canvas, ctx } = createCanvas(size);
  const rand = createSeededRandom(seed);
  ctx.clearRect(0, 0, size, size);

  const puff = (x: number, y: number, r: number, color: string, alpha: number) => {
    for (const ox of [-size, 0, size]) {
      for (const oy of [-size, 0, size]) {
        const g = ctx.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, r);
        g.addColorStop(0, color.replace('ALPHA', String(alpha)));
        g.addColorStop(0.55, color.replace('ALPHA', String(alpha * 0.85)));
        g.addColorStop(0.8, color.replace('ALPHA', String(alpha * 0.4)));
        g.addColorStop(1, color.replace('ALPHA', '0'));
        ctx.fillStyle = g;
        ctx.fillRect(x + ox - r, y + oy - r, r * 2, r * 2);
      }
    }
  };

  // Camada de base: cobre quase tudo, sombra fria.
  for (let i = 0; i < 90; i++) {
    puff(rand() * size, rand() * size, 60 + rand() * 90, 'rgba(188, 205, 224, ALPHA)', 0.55);
  }
  for (let i = 0; i < 110; i++) {
    puff(rand() * size, rand() * size, 34 + rand() * 62, 'rgba(250, 252, 255, ALPHA)', 0.9);
  }
  for (let i = 0; i < 70; i++) {
    puff(rand() * size, rand() * size, 16 + rand() * 30, 'rgba(255, 255, 252, ALPHA)', 0.95);
  }
  return toTexture(canvas);
}

/** Cachoeira: faixas verticais com alfa, repetida no eixo Y. */
export function makeWaterfallTexture(seed = 0xfa11): THREE.CanvasTexture {
  const width = 256;
  const height = 1024;
  const { canvas, ctx } = createCanvas(width, height);
  const rand = createSeededRandom(seed);
  ctx.clearRect(0, 0, width, height);
  for (let i = 0; i < 90; i++) {
    const x = rand() * width;
    const w = 1 + rand() * 7;
    const g = ctx.createLinearGradient(x, 0, x + w, 0);
    g.addColorStop(0, 'rgba(255,255,255,0)');
    g.addColorStop(0.5, `rgba(235, 248, 255, ${0.25 + rand() * 0.55})`);
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x, 0, w, height);
  }
  for (let i = 0; i < 160; i++) {
    ctx.fillStyle = `rgba(255,255,255,${0.2 + rand() * 0.5})`;
    ctx.fillRect(rand() * width, rand() * height, 1.5, 10 + rand() * 40);
  }
  // Base mais densa (espuma).
  const foam = ctx.createLinearGradient(0, height * 0.7, 0, height);
  foam.addColorStop(0, 'rgba(255,255,255,0)');
  foam.addColorStop(1, 'rgba(255,255,255,0.55)');
  ctx.fillStyle = foam;
  ctx.fillRect(0, height * 0.7, width, height * 0.3);
  const texture = toTexture(canvas);
  texture.wrapT = THREE.RepeatWrapping;
  return texture;
}

/**
 * Textura de chama: língua alongada, opaca no núcleo e desfiada nas bordas.
 * Um único sprite já lê como fogo; antes eram três planos cruzados que
 * formavam um "X" brilhante em ângulos rasos.
 */
export function makeFlameTexture(): THREE.CanvasTexture {
  const width = 256;
  const height = 384;
  const { canvas, ctx } = createCanvas(width, height);
  const rand = createSeededRandom(0xf1a3);

  const tongue = (cx: number, baseY: number, halfWidth: number, top: number, color: string) => {
    const gradient = ctx.createLinearGradient(0, baseY, 0, top);
    gradient.addColorStop(0, color);
    gradient.addColorStop(0.55, color);
    gradient.addColorStop(1, 'rgba(255, 180, 60, 0)');
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.moveTo(cx - halfWidth, baseY);
    ctx.quadraticCurveTo(cx - halfWidth * 0.75, baseY - (baseY - top) * 0.45, cx - halfWidth * 0.12, top);
    ctx.quadraticCurveTo(cx + halfWidth * 0.2, baseY - (baseY - top) * 0.5, cx + halfWidth, baseY);
    ctx.quadraticCurveTo(cx, baseY + halfWidth * 0.5, cx - halfWidth, baseY);
    ctx.closePath();
    ctx.fill();
  };

  // Chama externa (laranja), média (âmbar) e núcleo (quase branco).
  tongue(width * 0.5, height * 0.94, width * 0.44, height * 0.06, 'rgba(255, 126, 28, 0.85)');
  tongue(width * 0.52, height * 0.93, width * 0.3, height * 0.2, 'rgba(255, 176, 54, 0.95)');
  tongue(width * 0.5, height * 0.9, width * 0.17, height * 0.38, 'rgba(255, 244, 206, 1)');

  // Faíscas e irregularidades na borda.
  for (let i = 0; i < 70; i++) {
    const x = width * (0.28 + rand() * 0.44);
    const y = height * (0.1 + rand() * 0.55);
    ctx.fillStyle = `rgba(255, ${190 + Math.floor(rand() * 50)}, 120, ${0.12 + rand() * 0.3})`;
    ctx.beginPath();
    ctx.arc(x, y, 1 + rand() * 2.6, 0, Math.PI * 2);
    ctx.fill();
  }
  // Base incandescente.
  const base = ctx.createRadialGradient(width * 0.5, height * 0.92, 2, width * 0.5, height * 0.92, width * 0.5);
  base.addColorStop(0, 'rgba(255, 255, 235, 0.95)');
  base.addColorStop(0.4, 'rgba(255, 196, 96, 0.55)');
  base.addColorStop(1, 'rgba(255, 150, 40, 0)');
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, width, height);

  const texture = toTexture(canvas);
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  return texture;
}

/** Halo do sol e flares. */
export function makeSunGlowTexture(): THREE.CanvasTexture {
  const size = 256;
  const { canvas, ctx } = createCanvas(size);
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255, 255, 250, 1)');
  g.addColorStop(0.12, 'rgba(255, 245, 214, 0.95)');
  g.addColorStop(0.32, 'rgba(255, 228, 176, 0.45)');
  g.addColorStop(0.62, 'rgba(255, 214, 150, 0.14)');
  g.addColorStop(1, 'rgba(255, 200, 120, 0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const texture = toTexture(canvas);
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  return texture;
}

/**
 * Equirect do céu para `scene.environment`: dá reflexo azul/ouro ao mármore e
 * ao metal sem precisar de HDRI externo.
 */
export function makeSkyEnvironmentTexture(seed = 0x5bc1): THREE.CanvasTexture {
  const width = 1024;
  const height = 512;
  const { canvas, ctx } = createCanvas(width, height);
  const rand = createSeededRandom(seed);
  const gradient = ctx.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, '#2f74c0');
  gradient.addColorStop(0.38, '#6fb0e4');
  gradient.addColorStop(0.5, '#e8f4fc');
  gradient.addColorStop(0.55, '#f4e8d8');
  gradient.addColorStop(1, '#c9b99f');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  // Sol quente no equador (u ~ 0.22), logo acima do horizonte.
  const sunX = width * 0.22;
  const sunY = height * 0.42;
  const sun = ctx.createRadialGradient(sunX, sunY, 0, sunX, sunY, 80);
  sun.addColorStop(0, 'rgba(255,255,245,1)');
  sun.addColorStop(0.25, 'rgba(255,232,180,0.75)');
  sun.addColorStop(1, 'rgba(255,220,160,0)');
  ctx.fillStyle = sun;
  ctx.fillRect(0, 0, width, height);

  for (let i = 0; i < 130; i++) {
    const x = rand() * width;
    const y = height * (0.3 + rand() * 0.2);
    const r = 18 + rand() * 60;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, 'rgba(255,255,255,0.75)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }

  const texture = toTexture(canvas);
  texture.mapping = THREE.EquirectangularReflectionMapping;
  return texture;
}
