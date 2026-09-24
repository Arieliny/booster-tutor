/**
 * Generate the PWA icons: `node scripts/make-icons.mjs`
 *
 * Hand-rolled so the repo doesn't need an image toolchain (sharp/resvg) just to
 * emit three flat PNGs. Draws two offset rounded rectangles — a pack of cards —
 * in the app's accent colour on the app's background, then writes a minimal
 * 8-bit RGBA PNG (IHDR/IDAT/IEND, filter 0 scanlines, zlib-deflated).
 */

import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = path.join(ROOT, "public");

const BG = [11, 13, 18, 255]; // --color-bg   #0b0d12
const ACCENT = [192, 132, 252, 255]; // --color-accent #c084fc
const ACCENT_DIM = [124, 84, 165, 255]; // the card behind, darkened

// ---- PNG encoding ----------------------------------------------------------

const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function encodePng(width, height, rgba) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type: RGBA
  // 10..12 = compression/filter/interlace, all 0

  // Each scanline is prefixed with its filter byte (0 = none).
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0;
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }

  return Buffer.concat([
    sig,
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// ---- drawing ---------------------------------------------------------------

function makeCanvas(size, color) {
  const buf = Buffer.alloc(size * size * 4);
  for (let i = 0; i < size * size; i++) buf.set(color, i * 4);
  return buf;
}

/** Filled rounded rectangle, with a cheap 2x2 supersample for smooth corners. */
function roundedRect(buf, size, x0, y0, w, h, r, color) {
  const inside = (px, py) => {
    if (px < x0 || py < y0 || px > x0 + w || py > y0 + h) return false;
    const cx = Math.min(Math.max(px, x0 + r), x0 + w - r);
    const cy = Math.min(Math.max(py, y0 + r), y0 + h - r);
    const dx = px - cx;
    const dy = py - cy;
    return dx * dx + dy * dy <= r * r;
  };

  for (let y = Math.max(0, Math.floor(y0)); y < Math.min(size, Math.ceil(y0 + h)); y++) {
    for (let x = Math.max(0, Math.floor(x0)); x < Math.min(size, Math.ceil(x0 + w)); x++) {
      let hits = 0;
      for (const oy of [0.25, 0.75]) for (const ox of [0.25, 0.75]) {
        if (inside(x + ox, y + oy)) hits++;
      }
      if (hits === 0) continue;
      const a = hits / 4;
      const i = (y * size + x) * 4;
      for (let c = 0; c < 3; c++) buf[i + c] = Math.round(buf[i + c] * (1 - a) + color[c] * a);
      buf[i + 3] = 255;
    }
  }
}

function drawIcon(size) {
  const buf = makeCanvas(size, BG);
  const u = size / 100;
  // Back card, offset up-left; front card on top. Reads as a pack of cards.
  roundedRect(buf, size, 22 * u, 20 * u, 40 * u, 56 * u, 5 * u, ACCENT_DIM);
  roundedRect(buf, size, 36 * u, 28 * u, 42 * u, 58 * u, 5 * u, ACCENT);
  return encodePng(size, size, buf);
}

fs.mkdirSync(OUT_DIR, { recursive: true });
for (const [name, size] of [
  ["icon-192.png", 192],
  ["icon-512.png", 512],
  ["apple-touch-icon.png", 180],
]) {
  const png = drawIcon(size);
  fs.writeFileSync(path.join(OUT_DIR, name), png);
  console.log(`${name}: ${size}x${size}, ${png.length} bytes`);
}
