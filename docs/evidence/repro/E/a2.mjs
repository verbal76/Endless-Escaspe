import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
const server = spawn('python3', ['-m', 'http.server', '8805', '-d', '/home/user/Endless-Escaspe/assets'], { stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 700));
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const page = await browser.newPage();
await page.goto('http://localhost:8805/LICENSES.md');
const files = ['music/pocketEscapeRemix.mp3','music/voxelSneakParade.mp3','music/polysneakPursuit.mp3', ...['aim_click','caught','crowbar_hit','crowbar_swing','gunshot','hurt','pickup_grab','smoke_pop','throw','throw_land','ui_tap'].map(s=>`sfx/${s}.mp3`)];
const res = await page.evaluate(async (files) => {
  const out = [];
  for (const f of files) {
    const buf = await (await fetch('/' + f)).arrayBuffer();
    const ctx = new OfflineAudioContext(1, 44100, 44100);
    const ab = await ctx.decodeAudioData(buf);
    const d = ab.getChannelData(0); const sr = ab.sampleRate;
    const rms = (a, b) => { let s = 0; for (let i = a; i < b; i++) s += d[i] * d[i]; return Math.sqrt(s / Math.max(1, b - a)); };
    const db = (x) => (20 * Math.log10(x + 1e-9)).toFixed(1);
    const thr = 0.003; let lead = 0; while (lead < d.length && Math.abs(d[lead]) < thr) lead++;
    let tail = d.length - 1; while (tail > 0 && Math.abs(d[tail]) < thr) tail--;
    let peak = 0; for (const x of d) peak = Math.max(peak, Math.abs(x));
    const w = Math.floor(sr * 0.1);
    out.push({ f, dur: +ab.duration.toFixed(3), sr, peakDb: db(peak), fullRmsDb: db(rms(0, d.length)), leadSilMs: Math.round(lead / sr * 1000), trailSilMs: Math.round((d.length - 1 - tail) / sr * 1000), first100msDb: db(rms(0, w)), last100msDb: db(rms(d.length - w, d.length)), seamJump: +(d[0] - d[d.length - 1]).toFixed(4) });
  }
  return out;
}, files);
console.table(res);
await browser.close(); server.kill();
