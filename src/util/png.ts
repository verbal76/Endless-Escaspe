import { unzlibSync } from 'three/examples/jsm/libs/fflate.module.js';

// Minimal PNG decoder (8-bit, non-interlaced; greyscale, RGB, palette,
// grey+alpha, RGBA) producing top-row-first RGBA8 pixels. Used to turn
// the texture PNGs embedded in the JS bundle (assets/textureData.ts)
// into raw pixel data three.js can upload directly, with no dependency
// on expo-asset or expo-gl's image-file loader.

export type DecodedPng = { width: number; height: number; rgba: Uint8Array<ArrayBuffer> };

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const B64_LOOKUP = (() => {
  const t = new Uint8Array(128);
  for (let i = 0; i < B64.length; i++) t[B64.charCodeAt(i)] = i;
  return t;
})();

export function base64ToBytes(b64: string): Uint8Array {
  const clean = b64.replace(/[^A-Za-z0-9+/]/g, '');
  const out = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let o = 0;
  for (let i = 0; i < clean.length; i += 4) {
    const a = B64_LOOKUP[clean.charCodeAt(i)];
    const b = B64_LOOKUP[clean.charCodeAt(i + 1)];
    const c = i + 2 < clean.length ? B64_LOOKUP[clean.charCodeAt(i + 2)] : 0;
    const d = i + 3 < clean.length ? B64_LOOKUP[clean.charCodeAt(i + 3)] : 0;
    const n = (a << 18) | (b << 12) | (c << 6) | d;
    if (o < out.length) out[o++] = (n >> 16) & 255;
    if (o < out.length) out[o++] = (n >> 8) & 255;
    if (o < out.length) out[o++] = n & 255;
  }
  return out;
}

function u32(b: Uint8Array, off: number): number {
  return ((b[off] << 24) >>> 0) + (b[off + 1] << 16) + (b[off + 2] << 8) + b[off + 3];
}

function concat(parts: Uint8Array[]): Uint8Array {
  let len = 0;
  for (const p of parts) len += p.length;
  const out = new Uint8Array(len);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

function unfilter(raw: Uint8Array, px: Uint8Array, height: number, stride: number, bpp: number) {
  for (let y = 0; y < height; y++) {
    const f = raw[y * (stride + 1)];
    const lo = y * (stride + 1) + 1;
    const out = y * stride;
    const up = out - stride;
    const first = y === 0;
    if (f === 0) {
      px.set(raw.subarray(lo, lo + stride), out);
    } else if (f === 1) {
      for (let x = 0; x < bpp; x++) px[out + x] = raw[lo + x];
      for (let x = bpp; x < stride; x++) px[out + x] = (raw[lo + x] + px[out + x - bpp]) & 255;
    } else if (f === 2) {
      if (first) px.set(raw.subarray(lo, lo + stride), out);
      else for (let x = 0; x < stride; x++) px[out + x] = (raw[lo + x] + px[up + x]) & 255;
    } else if (f === 3) {
      if (first) {
        for (let x = 0; x < bpp; x++) px[out + x] = raw[lo + x];
        for (let x = bpp; x < stride; x++) px[out + x] = (raw[lo + x] + (px[out + x - bpp] >> 1)) & 255;
      } else {
        for (let x = 0; x < bpp; x++) px[out + x] = (raw[lo + x] + (px[up + x] >> 1)) & 255;
        for (let x = bpp; x < stride; x++) px[out + x] = (raw[lo + x] + ((px[out + x - bpp] + px[up + x]) >> 1)) & 255;
      }
    } else if (f === 4) {
      if (first) {
        // Paeth with no row above degenerates to "left".
        for (let x = 0; x < bpp; x++) px[out + x] = raw[lo + x];
        for (let x = bpp; x < stride; x++) px[out + x] = (raw[lo + x] + px[out + x - bpp]) & 255;
      } else {
        // No left neighbour: Paeth picks "up".
        for (let x = 0; x < bpp; x++) px[out + x] = (raw[lo + x] + px[up + x]) & 255;
        for (let x = bpp; x < stride; x++) {
          const a = px[out + x - bpp];
          const b = px[up + x];
          const c = px[up + x - bpp];
          let pa = b - c;
          let pb = a - c;
          let pc = pa + pb;
          if (pa < 0) pa = -pa;
          if (pb < 0) pb = -pb;
          if (pc < 0) pc = -pc;
          px[out + x] = (raw[lo + x] + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c)) & 255;
        }
      }
    } else {
      // Unknown filter type: bytes as stored (what the old decoder did).
      px.set(raw.subarray(lo, lo + stride), out);
    }
  }
}

export function decodePng(buf: Uint8Array): DecodedPng {
  const sig = [137, 80, 78, 71, 13, 10, 26, 10];
  for (let i = 0; i < 8; i++) if (buf[i] !== sig[i]) throw new Error('not a PNG');
  let off = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  let interlace = 0;
  let palette: Uint8Array | null = null;
  let trns: Uint8Array | null = null;
  const idat: Uint8Array[] = [];
  while (off + 8 <= buf.length) {
    const len = u32(buf, off);
    const type = String.fromCharCode(buf[off + 4], buf[off + 5], buf[off + 6], buf[off + 7]);
    const data = buf.subarray(off + 8, off + 8 + len);
    if (type === 'IHDR') {
      width = u32(data, 0);
      height = u32(data, 4);
      bitDepth = data[8];
      colorType = data[9];
      interlace = data[12];
    } else if (type === 'PLTE') palette = data;
    else if (type === 'tRNS') trns = data;
    else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    off += 12 + len;
  }
  if (bitDepth !== 8 || interlace !== 0) throw new Error(`unsupported PNG (depth ${bitDepth}, interlace ${interlace})`);
  const channels = ({ 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 } as Record<number, number>)[colorType];
  if (!channels) throw new Error(`unsupported PNG colour type ${colorType}`);
  if (colorType === 3 && !palette) throw new Error('palette PNG without PLTE');
  const raw = unzlibSync(concat(idat));
  const stride = width * channels;
  const px = new Uint8Array(stride * height);
  // Unfilter. One loop per filter type with the "no left / no up
  // neighbour" edges peeled off, so the per-byte work is a couple of
  // typed-array reads - this runs on the interpreter (Hermes) at boot
  // for ~4 MB of pixels.
  unfilter(raw, px, height, stride, channels);
  const n = width * height;
  const rgba: Uint8Array<ArrayBuffer> = new Uint8Array(n * 4);
  if (colorType === 3) {
    const pal = palette as Uint8Array;
    // Palette -> packed RGBA lookup, then one store per pixel.
    const lut = new Uint32Array(256);
    const lutBytes = new Uint8Array(lut.buffer);
    const entries = Math.min(256, Math.floor(pal.length / 3));
    for (let i = 0; i < 256; i++) {
      const k = i < entries ? i : 0;
      lutBytes[i * 4] = pal[k * 3];
      lutBytes[i * 4 + 1] = pal[k * 3 + 1];
      lutBytes[i * 4 + 2] = pal[k * 3 + 2];
      lutBytes[i * 4 + 3] = trns && i < trns.length ? trns[i] : 255;
      if (i >= entries) lutBytes[i * 4] = lutBytes[i * 4 + 1] = lutBytes[i * 4 + 2] = 0;
    }
    const out32 = new Uint32Array(rgba.buffer);
    for (let i = 0; i < n; i++) out32[i] = lut[px[i]];
  } else if (colorType === 6) {
    rgba.set(px);
  } else if (colorType === 2) {
    for (let i = 0; i < n; i++) {
      rgba[i * 4] = px[i * 3];
      rgba[i * 4 + 1] = px[i * 3 + 1];
      rgba[i * 4 + 2] = px[i * 3 + 2];
      rgba[i * 4 + 3] = 255;
    }
  } else if (colorType === 0) {
    for (let i = 0; i < n; i++) {
      rgba[i * 4] = rgba[i * 4 + 1] = rgba[i * 4 + 2] = px[i];
      rgba[i * 4 + 3] = 255;
    }
  } else {
    for (let i = 0; i < n; i++) {
      rgba[i * 4] = rgba[i * 4 + 1] = rgba[i * 4 + 2] = px[i * 2];
      rgba[i * 4 + 3] = px[i * 2 + 1];
    }
  }
  return { width, height, rgba };
}
