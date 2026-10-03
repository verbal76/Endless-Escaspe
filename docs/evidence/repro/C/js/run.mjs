import { base64ToBytes, decodePng } from './png.mjs';
import { TEXTURE_PNG_BASE64 } from './textureData.mjs';
let tot = 0, bytes = 0;
for (const [k, b64] of Object.entries(TEXTURE_PNG_BASE64)) {
  const a = performance.now(); const raw = base64ToBytes(b64); const b = performance.now(); const p = decodePng(raw); const c = performance.now();
  tot += c - a; bytes += p.rgba.length;
  console.log(k, p.width + 'x' + p.height, 'b64chars', b64.length, 'b64ms', (b - a).toFixed(1), 'decodeMs', (c - b).toFixed(1));
}
console.log('total ms', tot.toFixed(1), 'rgba MiB', (bytes / 1048576).toFixed(2));
