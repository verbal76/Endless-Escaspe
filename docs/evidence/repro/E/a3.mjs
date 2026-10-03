import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
const server = spawn('python3', ['-m', 'http.server', '8805', '-d', '/home/user/Endless-Escaspe/assets'], { stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 700));
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const page = await browser.newPage();
await page.goto('http://localhost:8805/LICENSES.md');
const GAIN = { pickup_grab: 0.6, crowbar_swing: 0.55, crowbar_hit: 0.75, smoke_pop: 0.6, gunshot: 0.7, aim_click: 0.5, caught: 0.7, hurt: 0.7, ui_tap: 0.4, throw: 0.45, throw_land: 0.65 };
const res = await page.evaluate(async (GAIN) => {
  const out = [];
  for (const [n, g] of Object.entries(GAIN)) {
    const buf = await (await fetch(`/sfx/${n}.mp3`)).arrayBuffer();
    const ab = await new OfflineAudioContext(1, 44100, 44100).decodeAudioData(buf);
    const d = ab.getChannelData(0); const w = Math.min(d.length, 2205); // 50 ms
    let best = 0;
    for (let s = 0; s + w <= d.length; s += 220) { let a = 0; for (let i = s; i < s + w; i++) a += d[i] * d[i]; best = Math.max(best, Math.sqrt(a / w)); }
    const db = 20 * Math.log10(best);
    out.push({ n, loudest50msDb: +db.toFixed(1), gain: g, effectiveDb: +(db + 20 * Math.log10(g)).toFixed(1) });
  }
  return out;
}, GAIN);
console.table(res);
await browser.close(); server.kill();
