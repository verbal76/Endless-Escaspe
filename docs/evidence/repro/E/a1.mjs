// Audio instrumentation probe (port 8805).
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startStage } from '../h.mjs';
const here = path.dirname(fileURLToPath(import.meta.url));
const port = 8805;
const server = spawn('python3', ['-m', 'http.server', String(port), '-d', path.join(here, '..', 'dist')], { stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 700));
const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'],
});
const page = await browser.newPage({ viewport: { width: 915, height: 412 } });
const errors = [];
const logs = [];
page.on('console', (m) => logs.push(`${m.type()}: ${m.text()}`));
page.on('pageerror', (e) => errors.push(e.message));
await page.addInitScript(() => {
  const A = (globalThis.__A = { created: [], plays: {}, failed: [] });
  const label = (src) => {
    if (!src) return '(none)';
    if (src.startsWith('data:')) return 'siren(data-wav)';
    const m = src.match(/([A-Za-z_]+)\.[0-9a-f]*\.?mp3|([A-Za-z_]+)\.mp3|([A-Za-z_]+)\.[a-f0-9]+\.mp3/);
    const f = src.split('/').pop().split('?')[0];
    return f.replace(/\.[0-9a-f]{16,}/, '');
  };
  const Orig = window.Audio;
  window.Audio = function (src) {
    const el = new Orig(src);
    el.__label = label(src);
    el.__t = performance.now();
    A.created.push(el);
    el.addEventListener('error', () => A.failed.push(el.__label));
    return el;
  };
  window.Audio.prototype = Orig.prototype;
  const P = HTMLMediaElement.prototype;
  const op = P.play;
  P.play = function () {
    const l = this.__label || '?';
    A.plays[l] = (A.plays[l] || 0) + 1;
    const r = op.call(this);
    if (r && r.catch) r.catch((e) => A.failed.push('play-reject:' + l + ':' + e.name));
    return r;
  };
  globalThis.__snap = () =>
    A.created.map((e) => ({ l: e.__label, vol: +e.volume.toFixed(4), paused: e.paused, loop: e.loop, rate: e.playbackRate, t: +e.currentTime.toFixed(2), src: !!e.getAttribute('src') }));
});
await page.goto(`http://localhost:${port}/`);
await page.waitForFunction(() => !!globalThis.__ee, null, { timeout: 60000 });
await page.waitForTimeout(2500);
const out = {};
out.boot = await page.evaluate(() => ({ n: __A.created.length, snap: __snap(), plays: { ...__A.plays }, store: (({ masterVolume, musicVolume }) => ({ masterVolume, musicVolume }))(__ee.useStore.getState()) }));

// ---- 60 s scripted play with item use, catches and stage rebuilds.
await startStage(page, 3, 777);
const t0 = Date.now();
let k = 0;
while (Date.now() - t0 < 60000) {
  k++;
  await page.evaluate((k) => {
    const E = __ee;
    const st = E.useStore.getState();
    if (st.runState !== 'playing') {
      st.setStage(3);
      st.startRun();
      st.resetForSegment(1000 + k);
      st.setGameModal(null);
      st.setPaused(false);
      return;
    }
    E.input.axisY = 1;
    E.input.axisX = Math.sin(k) * 0.8;
    E.input.run = k % 3 === 0;
    if (k % 4 === 0) { st.addPickup('crowbar'); E.input.useCrowbar = true; }
    if (k % 4 === 1) { st.addPickup('rock'); E.input.throwRock = true; }
    if (k % 4 === 2) { st.addPickup('smokebomb'); E.input.useSmokeBomb = true; }
    if (k % 15 === 0) E.handleCatch();
    if (k % 25 === 0) E.handleWin?.();
  }, k);
  await page.waitForTimeout(1000);
}
out.after60 = await page.evaluate(() => ({ n: __A.created.length, plays: { ...__A.plays }, failed: __A.failed.slice(0, 20), byLabel: __A.created.reduce((m, e) => ((m[e.__label] = (m[e.__label] || 0) + 1), m), {}) }));

// ---- Volume: drag master slider from 0.7 down to 0 in typical steps.
await page.evaluate(() => { const st = __ee.useStore.getState(); st.setStage(3); st.startRun(); st.resetForSegment(55); st.setGameModal(null); st.setPaused(false); });
await page.waitForTimeout(3000);
out.slider = await page.evaluate(async () => {
  const st = __ee.useStore.getState;
  const res = [];
  for (const step of [0.013, 0.0071, 0.0193]) {
    st().setMasterVolume(0.7);
    st().setMusicVolume(0.5);
    await new Promise((r) => setTimeout(r, 300));
    for (let v = 0.7; v > 0; v -= step) { st().setMasterVolume(v); await new Promise((r) => setTimeout(r, 16)); }
    st().setMasterVolume(0);
    await new Promise((r) => setTimeout(r, 400));
    const music = __snap().filter((e) => /pocket|voxel|polysneak/i.test(e.l));
    res.push({ step, storeMaster: st().masterVolume, music });
  }
  return res;
});
// ---- Pause behaviour
await page.evaluate(() => { const st = __ee.useStore.getState(); st.setMasterVolume(0.7); st.setPaused(true); });
await page.waitForTimeout(2000);
out.paused = await page.evaluate(() => __snap().filter((e) => !e.paused || /siren|pocket|voxel|polysneak/i.test(e.l)));
await page.evaluate(() => { const st = __ee.useStore.getState(); st.setPaused(false); st.setRunState('idle'); });
await page.waitForTimeout(1500);
out.menu = await page.evaluate(() => __snap().filter((e) => !e.paused));
out.errors = errors;
out.audioLogs = logs.filter((l) => /audio|sfx|siren|music|mp3|media/i.test(l)).slice(0, 20);
console.log(JSON.stringify(out, null, 1));
await browser.close();
server.kill();
