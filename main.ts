// World News — 20 November 2026.
// A one-page newspaper front page drawn from scratch with Node's standard
// library only. No network, no randomness, no clock: two runs write the
// same bytes to /output/entry.png (1024 x 1024 PNG).
import { mkdirSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { join } from 'node:path';

const W = 1024;
const H = 1024;

type RGB = [number, number, number];

const PAPER: RGB = [248, 244, 233];
const PAPER_DARK: RGB = [238, 232, 214];
const INK: RGB = [22, 22, 22];
const GREY: RGB = [96, 96, 92];
const LIGHT_GREY: RGB = [210, 205, 190];
const RED: RGB = [178, 34, 34];
const DARK_RED: RGB = [122, 20, 20];
const BLUE: RGB = [28, 58, 96];
const LIGHT_BLUE: RGB = [214, 226, 238];
const GOLD: RGB = [196, 148, 44];
const GREEN: RGB = [34, 110, 62];
const ORANGE: RGB = [224, 112, 28];
const SKY: RGB = [52, 68, 96];
const WHITE: RGB = [255, 255, 255];
const BLACK: RGB = [0, 0, 0];

// ---------------------------------------------------------------------------
// Pixel buffer and drawing primitives
// ---------------------------------------------------------------------------

const px = new Uint8Array(W * H * 3);
for (let i = 0; i < W * H; i++) {
  px[i * 3] = PAPER[0];
  px[i * 3 + 1] = PAPER[1];
  px[i * 3 + 2] = PAPER[2];
}

function setPixel(x: number, y: number, c: RGB): void {
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  const i = (y * W + x) * 3;
  px[i] = c[0];
  px[i + 1] = c[1];
  px[i + 2] = c[2];
}

function fillRect(x: number, y: number, w: number, h: number, c: RGB): void {
  const x0 = Math.max(0, Math.floor(x));
  const y0 = Math.max(0, Math.floor(y));
  const x1 = Math.min(W, Math.ceil(x + w));
  const y1 = Math.min(H, Math.ceil(y + h));
  for (let yy = y0; yy < y1; yy++) {
    for (let xx = x0; xx < x1; xx++) {
      const i = (yy * W + xx) * 3;
      px[i] = c[0];
      px[i + 1] = c[1];
      px[i + 2] = c[2];
    }
  }
}

function frame(x: number, y: number, w: number, h: number, c: RGB, t: number): void {
  fillRect(x, y, w, t, c);
  fillRect(x, y + h - t, w, t, c);
  fillRect(x, y, t, h, c);
  fillRect(x + w - t, y, t, h, c);
}

function hline(x: number, y: number, w: number, c: RGB, t: number): void {
  fillRect(x, y, w, t, c);
}

function vline(x: number, y: number, h: number, c: RGB, t: number): void {
  fillRect(x, y, t, h, c);
}

function line(x0: number, y0: number, x1: number, y1: number, c: RGB, t: number): void {
  const dx = Math.abs(x1 - x0);
  const dy = Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx - dy;
  let x = x0;
  let y = y0;
  const half = Math.floor(t / 2);
  for (let steps = 0; steps < 4096; steps++) {
    fillRect(x - half, y - half, t, t, c);
    if (x === x1 && y === y1) break;
    const e2 = 2 * err;
    if (e2 > -dy) {
      err -= dy;
      x += sx;
    }
    if (e2 < dx) {
      err += dx;
      y += sy;
    }
  }
}

function fillCircle(cx: number, cy: number, r: number, c: RGB): void {
  for (let y = cy - r; y <= cy + r; y++) {
    for (let x = cx - r; x <= cx + r; x++) {
      const dx = x - cx;
      const dy = y - cy;
      if (dx * dx + dy * dy <= r * r) setPixel(x, y, c);
    }
  }
}

function ring(cx: number, cy: number, r: number, c: RGB, t: number): void {
  for (let a = 0; a < 360; a += 1) {
    const rad = (a * Math.PI) / 180;
    for (let k = -Math.floor(t / 2); k <= Math.floor(t / 2); k++) {
      setPixel(Math.round(cx + (r + k) * Math.cos(rad)), Math.round(cy + (r + k) * Math.sin(rad)), c);
    }
  }
}

// Even-odd scanline polygon fill.
function fillPoly(points: Array<[number, number]>, c: RGB): void {
  let minY = H;
  let maxY = 0;
  for (const [, y] of points) {
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  for (let y = Math.max(0, minY); y <= Math.min(H - 1, maxY); y++) {
    const xs: number[] = [];
    for (let i = 0; i < points.length; i++) {
      const [x0, y0] = points[i];
      const [x1, y1] = points[(i + 1) % points.length];
      if ((y0 <= y && y1 > y) || (y1 <= y && y0 > y)) {
        xs.push(x0 + ((y - y0) * (x1 - x0)) / (y1 - y0));
      }
    }
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const xa = Math.max(0, Math.ceil(xs[k]));
      const xb = Math.min(W - 1, Math.floor(xs[k + 1]));
      for (let x = xa; x <= xb; x++) setPixel(x, y, c);
    }
  }
}

function star(cx: number, cy: number, rOuter: number, rInner: number, c: RGB): void {
  const pts: Array<[number, number]> = [];
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? rOuter : rInner;
    const a = (Math.PI * i) / 5 - Math.PI / 2;
    pts.push([Math.round(cx + r * Math.cos(a)), Math.round(cy + r * Math.sin(a))]);
  }
  fillPoly(pts, c);
}

// ---------------------------------------------------------------------------
// PNG encoder (zlib from the standard library, CRC32 by hand)
// ---------------------------------------------------------------------------

const CRC_TABLE: Uint32Array = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function encodePNG(): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0);
  ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type RGB
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  const raw = Buffer.alloc(H * (1 + W * 3));
  for (let y = 0; y < H; y++) {
    raw[y * (1 + W * 3)] = 0; // filter: none
    raw.set(px.subarray(y * W * 3, (y + 1) * W * 3), y * (1 + W * 3) + 1);
  }
  const idat = deflateSync(raw, { level: 9 });
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', idat),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---------------------------------------------------------------------------
// 5x7 bitmap font, drawn from these tables (all text is set in capitals).
// Each glyph is 7 rows of 5 cells; '#' is ink, '.' is empty.
// ---------------------------------------------------------------------------

const GLYPHS: Record<string, string[]> = {
  A: ['.###.', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  B: ['####.', '#...#', '#...#', '####.', '#...#', '#...#', '####.'],
  C: ['.####', '#....', '#....', '#....', '#....', '#....', '.####'],
  D: ['####.', '#...#', '#...#', '#...#', '#...#', '#...#', '####.'],
  E: ['#####', '#....', '#....', '####.', '#....', '#....', '#####'],
  F: ['#####', '#....', '#....', '####.', '#....', '#....', '#....'],
  G: ['.####', '#....', '#....', '#.###', '#...#', '#...#', '.###.'],
  H: ['#...#', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  I: ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '#####'],
  J: ['..###', '...#.', '...#.', '...#.', '...#.', '#..#.', '.##..'],
  K: ['#...#', '#..#.', '#.#..', '##...', '#.#..', '#..#.', '#...#'],
  L: ['#....', '#....', '#....', '#....', '#....', '#....', '#####'],
  M: ['#...#', '##.##', '#.#.#', '#.#.#', '#...#', '#...#', '#...#'],
  N: ['#...#', '##..#', '##..#', '#.#.#', '#..##', '#..##', '#...#'],
  O: ['.###.', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  P: ['####.', '#...#', '#...#', '####.', '#....', '#....', '#....'],
  Q: ['.###.', '#...#', '#...#', '#...#', '#.#.#', '#..#.', '.##.#'],
  R: ['####.', '#...#', '#...#', '####.', '#.#..', '#..#.', '#...#'],
  S: ['.####', '#....', '#....', '.###.', '....#', '....#', '####.'],
  T: ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '..#..'],
  U: ['#...#', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  V: ['#...#', '#...#', '#...#', '#...#', '#...#', '.#.#.', '..#..'],
  W: ['#...#', '#...#', '#...#', '#.#.#', '#.#.#', '##.##', '#...#'],
  X: ['#...#', '#...#', '.#.#.', '..#..', '.#.#.', '#...#', '#...#'],
  Y: ['#...#', '#...#', '.#.#.', '..#..', '..#..', '..#..', '..#..'],
  Z: ['#####', '....#', '...#.', '..#..', '.#...', '#....', '#####'],
  '0': ['.###.', '#..##', '#.#.#', '##..#', '#...#', '#...#', '.###.'],
  '1': ['..#..', '.##..', '..#..', '..#..', '..#..', '..#..', '.###.'],
  '2': ['.###.', '#...#', '....#', '...#.', '..#..', '.#...', '#####'],
  '3': ['####.', '....#', '....#', '.###.', '....#', '....#', '####.'],
  '4': ['...#.', '..##.', '.#.#.', '#..#.', '#####', '...#.', '...#.'],
  '5': ['#####', '#....', '####.', '....#', '....#', '#...#', '.###.'],
  '6': ['.###.', '#....', '#....', '####.', '#...#', '#...#', '.###.'],
  '7': ['#####', '....#', '...#.', '...#.', '..#..', '..#..', '..#..'],
  '8': ['.###.', '#...#', '#...#', '.###.', '#...#', '#...#', '.###.'],
  '9': ['.###.', '#...#', '#...#', '.####', '....#', '....#', '.###.'],
  ' ': ['.....', '.....', '.....', '.....', '.....', '.....', '.....'],
  '.': ['.....', '.....', '.....', '.....', '.....', '.##..', '.##..'],
  ',': ['.....', '.....', '.....', '.....', '.##..', '.##..', '.#...'],
  ':': ['.....', '.##..', '.##..', '.....', '.##..', '.##..', '.....'],
  ';': ['.....', '.##..', '.##..', '.....', '.##..', '.##..', '.#...'],
  '!': ['..#..', '..#..', '..#..', '..#..', '..#..', '.....', '..#..'],
  '?': ['.###.', '#...#', '....#', '...#.', '..#..', '.....', '..#..'],
  "'": ['..#..', '..#..', '.#...', '.....', '.....', '.....', '.....'],
  '"': ['.#.#.', '.#.#.', '.....', '.....', '.....', '.....', '.....'],
  '-': ['.....', '.....', '.....', '#####', '.....', '.....', '.....'],
  '–': ['.....', '.....', '.....', '#####', '.....', '.....', '.....'],
  '—': ['.....', '.....', '.....', '#####', '.....', '.....', '.....'],
  '(': ['...##', '..#..', '.#...', '.#...', '.#...', '..#..', '...##'],
  ')': ['##...', '..#..', '...#.', '...#.', '...#.', '..#..', '##...'],
  '/': ['....#', '....#', '...#.', '..#..', '.#...', '#....', '#....'],
  '&': ['.###.', '#...#', '#.#..', '.#...', '#.#.#', '#..#.', '.##.#'],
  '%': ['##..#', '##.#.', '...#.', '..#..', '.#...', '#.##.', '#..##'],
  $: ['..#..', '.####', '#.#..', '.###.', '..#.#', '####.', '..#..'],
  '#': ['.#.#.', '.#.#.', '#####', '.#.#.', '#####', '.#.#.', '.#.#.'],
  '@': ['.###.', '#...#', '#.###', '#.#.#', '#.#..', '#....', '.###.'],
  '+': ['.....', '..#..', '..#..', '#####', '..#..', '..#..', '.....'],
  '=': ['.....', '.....', '#####', '.....', '#####', '.....', '.....'],
  '*': ['.....', '.#.#.', '..#..', '#####', '..#..', '.#.#.', '.....'],
  _: ['.....', '.....', '.....', '.....', '.....', '.....', '#####'],
  '·': ['.....', '.....', '.##..', '.##..', '.....', '.....', '.....'],
};

const BLANK_GLYPH = ['.....', '.....', '.....', '.....', '.....', '.....', '.....'];

function drawGlyph(x: number, y: number, ch: string, s: number, c: RGB): void {
  const g = GLYPHS[ch] ?? BLANK_GLYPH;
  for (let row = 0; row < 7; row++) {
    for (let col = 0; col < 5; col++) {
      if (g[row][col] === '#') fillRect(x + col * s, y + row * s, s, s, c);
    }
  }
}

function drawText(x: number, y: number, text: string, s: number, c: RGB): number {
  const upper = text.toUpperCase();
  let cx = x;
  for (const ch of upper) {
    drawGlyph(cx, y, ch, s, c);
    cx += 6 * s;
  }
  return cx - x;
}

function textWidth(text: string, s: number): number {
  return text.length * 6 * s - s;
}

function drawCentred(x: number, y: number, w: number, text: string, s: number, c: RGB): void {
  const tw = textWidth(text, s);
  drawText(x + Math.max(0, Math.floor((w - tw) / 2)), y, text, s, c);
}

// Wrap text to lines no wider than maxW (in pixels) at scale s.
function wrapText(text: string, maxW: number, s: number): string[] {
  const words = text.split(/\s+/).filter((w) => w.length > 0);
  const lines: string[] = [];
  let cur = '';
  for (const word of words) {
    const trial = cur === '' ? word : cur + ' ' + word;
    if (textWidth(trial, s) <= maxW || cur === '') {
      cur = trial;
    } else {
      lines.push(cur);
      cur = word;
    }
  }
  if (cur !== '') lines.push(cur);
  // Hard-split any single word still wider than the column.
  const out: string[] = [];
  const maxChars = Math.max(1, Math.floor((maxW + s) / (6 * s)));
  for (const ln of lines) {
    if (textWidth(ln, s) <= maxW) {
      out.push(ln);
    } else {
      let rest = ln;
      while (textWidth(rest, s) > maxW) {
        out.push(rest.slice(0, maxChars));
        rest = rest.slice(maxChars);
      }
      if (rest !== '') out.push(rest);
    }
  }
  return out;
}

// Draw wrapped text; returns the y just below the last line.
function drawPara(x: number, y: number, text: string, s: number, c: RGB, maxW: number, gap: number): number {
  const lines = wrapText(text, maxW, s);
  const lh = 7 * s + gap;
  for (let i = 0; i < lines.length; i++) drawText(x, y + i * lh, lines[i], s, c);
  return y + lines.length * lh;
}

// ---------------------------------------------------------------------------
// Illustrations (all drawn with the primitives above)
// ---------------------------------------------------------------------------

// Scales of justice inside a panel.
function drawScales(x: number, y: number, w: number, h: number): void {
  fillRect(x, y, w, h, LIGHT_BLUE);
  frame(x, y, w, h, INK, 3);
  const cx = x + Math.floor(w / 2);
  const top = y + 22;
  const beamY = y + 52;
  // Post and base.
  fillRect(cx - 5, top, 10, h - 70, BLUE);
  fillRect(cx - 46, y + h - 26, 92, 12, BLUE);
  fillRect(cx - 62, y + h - 14, 124, 8, BLUE);
  // Finial.
  fillCircle(cx, top - 6, 8, GOLD);
  // Beam.
  fillRect(x + 34, beamY - 5, w - 68, 10, BLUE);
  fillCircle(x + 34, beamY, 6, BLUE);
  fillCircle(x + w - 34, beamY, 6, BLUE);
  // Hangers and pans.
  for (const side of [-1, 1]) {
    const px0 = cx + side * (Math.floor(w / 2) - 34);
    line(px0, beamY + 4, px0 - 34, beamY + 66, INK, 3);
    line(px0, beamY + 4, px0 + 34, beamY + 66, INK, 3);
    line(px0, beamY + 4, px0, beamY + 66, INK, 3);
    fillPoly(
      [
        [px0 - 38, beamY + 66],
        [px0 + 38, beamY + 66],
        [px0 + 26, beamY + 92],
        [px0 - 26, beamY + 92],
      ],
      GOLD,
    );
    fillRect(px0 - 38, beamY + 62, 76, 6, DARK_RED);
  }
}

// Three flags: United States, China, Russia.
function drawFlags(x: number, y: number, w: number, h: number): void {
  const fw = Math.floor((w - 24) / 3);
  const fh = Math.floor(h * 0.62);
  const labels = ['USA', 'CHINA', 'RUSSIA'];
  for (let i = 0; i < 3; i++) {
    const fx = x + i * (fw + 12);
    if (i === 0) {
      // United States: stripes and blue canton.
      for (let s = 0; s < 7; s++) {
        fillRect(fx, y + Math.floor((s * fh) / 7), fw, Math.ceil(fh / 7), s % 2 === 0 ? DARK_RED : WHITE);
      }
      fillRect(fx, y, Math.floor(fw * 0.45), Math.floor(fh * 0.55), BLUE);
      for (let r = 0; r < 3; r++) {
        for (let c = 0; c < 4; c++) {
          fillCircle(fx + 6 + c * 9, y + 7 + r * 9, 2, WHITE);
        }
      }
    } else if (i === 1) {
      // China: red field, five gold stars.
      fillRect(fx, y, fw, fh, DARK_RED);
      star(fx + 16, y + 16, 10, 4, GOLD);
      star(fx + 40, y + 10, 5, 2, GOLD);
      star(fx + 50, y + 22, 5, 2, GOLD);
      star(fx + 48, y + 38, 5, 2, GOLD);
      star(fx + 36, y + 46, 5, 2, GOLD);
    } else {
      // Russia: white, blue, red bands.
      fillRect(fx, y, fw, Math.floor(fh / 3), WHITE);
      fillRect(fx, y + Math.floor(fh / 3), fw, Math.floor(fh / 3), BLUE);
      fillRect(fx, y + Math.floor((2 * fh) / 3), fw, fh - Math.floor((2 * fh) / 3), DARK_RED);
    }
    frame(fx, y, fw, fh, INK, 2);
    drawCentred(fx, y + fh + 8, fw, labels[i], 2, INK);
  }
}

// Kyiv skyline under attack: dark sky, buildings, blast.
function drawKyiv(x: number, y: number, w: number, h: number): void {
  fillRect(x, y, w, h, SKY);
  frame(x, y, w, h, INK, 3);
  // Stars in the night sky.
  const stars: Array<[number, number]> = [
    [18, 14], [52, 26], [96, 10], [150, 22], [196, 12], [238, 28], [128, 34], [76, 40],
  ];
  for (const [sx, sy] of stars) fillRect(x + sx, y + sy, 3, 3, WHITE);
  // Blast.
  const bx = x + Math.floor(w * 0.68);
  const by = y + 52;
  star(bx, by, 44, 18, ORANGE);
  star(bx, by, 26, 10, GOLD);
  fillCircle(bx, by, 12, WHITE);
  // Smoke.
  fillCircle(bx - 52, by + 8, 14, GREY);
  fillCircle(bx - 34, by - 6, 18, GREY);
  fillCircle(bx + 46, by + 2, 12, GREY);
  // Buildings, scaled to stay inside the panel.
  const base = y + h;
  const fracs = [0.62, 0.85, 0.5, 0.95, 0.7, 0.45, 0.8, 0.58];
  const heights = fracs.map((f) => Math.floor(f * (h - 8)));
  let bx0 = x + 6;
  for (let i = 0; i < heights.length; i++) {
    const bw = Math.floor((w - 12) / heights.length);
    fillRect(bx0, base - heights[i], bw - 3, heights[i], INK);
    for (let wy = base - heights[i] + 10; wy < base - 8; wy += 16) {
      for (let wx = bx0 + 5; wx < bx0 + bw - 8; wx += 12) {
        if ((wx + wy) % 3 === 0) fillRect(wx, wy, 5, 7, GOLD);
      }
    }
    bx0 += bw;
  }
}

// Riyadh tower struck at the top: dusk sky, tapered tower, flame.
function drawRiyadh(x: number, y: number, w: number, h: number): void {
  fillRect(x, y, w, h, [232, 196, 150]);
  frame(x, y, w, h, INK, 3);
  fillCircle(x + 44, y + 30, 18, GOLD);
  const cx = x + Math.floor(w * 0.58);
  const topY = y + 34;
  const botY = y + h - 6;
  // Tapered tower.
  fillPoly(
    [
      [cx - 26, topY],
      [cx + 26, topY],
      [cx + 44, botY],
      [cx - 44, botY],
    ],
    BLUE,
  );
  // Windows.
  for (let wy = topY + 18; wy < botY - 10; wy += 16) {
    const half = 20 + Math.floor(((wy - topY) / (botY - topY)) * 18);
    fillRect(cx - half + 6, wy, 8, 8, GOLD);
    fillRect(cx + half - 14, wy, 8, 8, GOLD);
  }
  // Flame and smoke at the crown.
  fillPoly(
    [
      [cx - 16, topY + 4],
      [cx, topY - 26],
      [cx + 16, topY + 4],
    ],
    ORANGE,
  );
  fillPoly(
    [
      [cx - 8, topY + 2],
      [cx, topY - 14],
      [cx + 8, topY + 2],
    ],
    GOLD,
  );
  fillCircle(cx - 30, topY - 18, 10, GREY);
  fillCircle(cx + 28, topY - 24, 12, GREY);
  // Neighbouring blocks.
  fillRect(x + 8, y + h - 66, 52, 60, INK);
  fillRect(x + w - 66, y + h - 48, 58, 42, INK);
}

// Market chart: falling line with two index labels.
function drawChart(x: number, y: number, w: number, h: number): void {
  fillRect(x, y, w, h, WHITE);
  frame(x, y, w, h, INK, 3);
  const gx = x + 14;
  const gy = y + 12;
  const gw = w - 28;
  const gh = h - 40;
  // Grid.
  for (let i = 1; i < 4; i++) {
    hline(gx, gy + Math.floor((gh * i) / 4), gw, LIGHT_GREY, 1);
  }
  // Axes.
  vline(gx, gy, gh, INK, 2);
  hline(gx, gy + gh, gw, INK, 2);
  // Falling line: five days down.
  const pts: Array<[number, number]> = [
    [gx + 4, gy + 10],
    [gx + Math.floor(gw * 0.25), gy + 26],
    [gx + Math.floor(gw * 0.5), gy + 40],
    [gx + Math.floor(gw * 0.72), gy + 62],
    [gx + gw - 6, gy + gh - 8],
  ];
  for (let i = 0; i + 1 < pts.length; i++) {
    line(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], RED, 4);
  }
  for (const [px0, py0] of pts) fillCircle(px0, py0, 5, DARK_RED);
  // One green uptick for the debut.
  line(gx + Math.floor(gw * 0.5), gy + 40, gx + Math.floor(gw * 0.62), gy + 22, GREEN, 3);
  fillCircle(gx + Math.floor(gw * 0.62), gy + 22, 4, GREEN);
  drawText(x + 14, y + h - 22, 'S&P 500 -2.0%  NIKKEI -4.8%', 2, RED);
}

// ---------------------------------------------------------------------------
// Front page layout (1024 x 1024)
// ---------------------------------------------------------------------------

function drawFrontPage(): void {
  frame(14, 14, 996, 996, INK, 3);
  frame(20, 20, 984, 984, INK, 1);

  // Masthead.
  drawCentred(40, 40, 944, 'THE WORLD TODAY', 8, INK);
  hline(40, 108, 944, INK, 2);
  drawCentred(40, 120, 944, 'FRIDAY, 20 NOVEMBER 2026  -  WORLD NEWS IN ONE PAGE', 2, GREY);
  hline(40, 144, 944, INK, 4);
  hline(40, 152, 944, INK, 1);

  // Lead story: the world court ruling.
  drawText(40, 168, 'THE HAGUE - JUSTICE', 2, RED);
  drawPara(40, 194, 'WORLD COURT RULES MYANMAR COMMITTED GENOCIDE', 4, INK, 560, 4);
  drawPara(
    40,
    300,
    'THE INTERNATIONAL COURT OF JUSTICE FINDS MYANMAR RESPONSIBLE FOR GENOCIDE AGAINST THE ROHINGYA - THE FIRST SUCH RULING AGAINST A STATE.',
    2,
    INK,
    560,
    4,
  );
  drawScales(624, 168, 360, 190);
  drawCentred(624, 366, 360, 'JUSTICE AT THE HAGUE', 2, GREY);

  hline(40, 396, 944, INK, 3);

  // Three stories side by side.
  const colX = [40, 360, 680];
  const colW = 304;
  const stories = [
    {
      kicker: 'SHENZHEN - DIPLOMACY',
      head: 'TRUMP, XI AND PUTIN SIGN JOINT PEACE DECLARATION',
      body: 'THE US, CHINA AND RUSSIA LEADERS MET IN SHENZHEN AND SIGNED A FOUR-POINT JOINT DECLARATION.',
      art: 'flags' as const,
    },
    {
      kicker: 'KYIV - WAR',
      head: 'RUSSIA HITS KYIV IN MASSIVE OVERNIGHT STRIKE',
      body: 'EIGHT KILLED AND 28 INJURED IN THE CAPITAL. UKRAINE ANSWERED WITH DRONE STRIKES INSIDE RUSSIA.',
      art: 'kyiv' as const,
    },
    {
      kicker: 'RIYADH - CONFLICT',
      head: 'HOUTHI MISSILE DAMAGES RIYADH TALLEST TOWER',
      body: 'MISSILES HIT THE FINANCIAL DISTRICT AND DAMAGED THE SOVEREIGN WEALTH FUND TOWER IN RIYADH.',
      art: 'riyadh' as const,
    },
  ];
  for (let i = 0; i < 3; i++) {
    const s = stories[i];
    const x = colX[i];
    drawText(x, 412, s.kicker, 2, RED);
    drawPara(x, 438, s.head, 3, INK, colW, 4);
    if (s.art === 'flags') drawFlags(x, 518, colW, 96);
    else if (s.art === 'kyiv') drawKyiv(x, 518, colW, 96);
    else drawRiyadh(x, 518, colW, 96);
    drawPara(x, 626, s.body, 2, INK, colW, 4);
  }
  vline(352, 412, 288, LIGHT_GREY, 1);
  vline(672, 412, 288, LIGHT_GREY, 1);

  hline(40, 716, 944, INK, 3);

  // Markets band.
  drawText(40, 732, 'NEW YORK - MARKETS', 2, RED);
  drawPara(40, 758, 'STOCKS SLIDE FOR A FIFTH STRAIGHT DAY', 3, INK, 560, 4);
  drawPara(
    40,
    818,
    "THE S&P 500 LOST ABOUT 2% AND JAPAN'S NIKKEI FELL 4.8% AS DOUBTS OVER AI VALUATIONS SPREAD. ANTHROPIC STILL CLOSED 17% ABOVE ITS IPO PRICE ON ITS NASDAQ DEBUT.",
    2,
    INK,
    560,
    4,
  );
  drawChart(624, 732, 360, 140);

  hline(40, 892, 944, INK, 3);

  // Ticker band.
  fillRect(40, 906, 944, 66, INK);
  const ticker =
    "KENYA'S LAST EBOLA PATIENT GOES HOME - 42 DAYS TO EBOLA-FREE · COP31 DRAFT DROPS FOSSIL-FUEL PHASE-OUT · CYCLONE AKVAN HITS ODISHA · GTA 6 TOPS $2.3BN · EU-UK SUMMIT IN BRUSSELS · ITALY FINES META €805M";
  const tickerLines = wrapText(ticker, 920, 2);
  for (let i = 0; i < tickerLines.length; i++) {
    drawCentred(40, 914 + i * 18, 944, tickerLines[i], 2, WHITE);
  }

  // Footer.
  drawCentred(40, 984, 944, 'THE WORLD TODAY - FRIDAY 20 NOVEMBER 2026', 2, GREY);
}

const outDir = process.env.OUTPUT_DIR ?? '/output';
mkdirSync(outDir, { recursive: true });
drawFrontPage();
writeFileSync(join(outDir, 'entry.png'), encodePNG());
