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
await page.waitForTimeout(2000);
await startStage(page, 4, 99);
const out = {};
const pin = async (ms) => {
  const t0 = Date.now();
  const samples = [];
  while (Date.now() - t0 < ms) {
    samples.push(await page.evaluate(() => {
      const E = __ee; const g = E.scene.guards.find((g) => g.stunTimer <= 0) || E.scene.guards[0];
      // stand 4 m in front of the guard, facing it
      const st = E.useStore.getState();
      if (st.runState === 'playing' && !st.paused) { E.player.x = g.x + Math.cos(g.facing) * 4; E.player.z = g.z + Math.sin(g.facing) * 4; E.player.isHidden = false; E.player.stance = 'walk'; }
      const sir = __A.created.find((e) => e.__label.startsWith('siren'));
      const det = Math.max(0, ...Object.values(st.detection));
      return { det: +det.toFixed(2), sirenVol: +sir.volume.toFixed(3), sirenPaused: sir.paused, hearts: st.hearts, rs: st.runState, plays: { ...__A.plays } };
    }));
    await page.waitForTimeout(250);
  }
  return samples;
};
out.exposed = await pin(6000);
await page.evaluate(() => __ee.useStore.getState().setPaused(true));
await page.waitForTimeout(800);
out.pausedSiren = await page.evaluate(() => { const s = __A.created.find((e) => e.__label.startsWith('siren')); return { vol: s.volume, paused: s.paused }; });
await page.evaluate(() => { const st = __ee.useStore.getState(); st.setPaused(false); st.setMasterVolume(0); });
out.master0 = await pin(2000);
await page.evaluate(() => { __ee.useStore.getState().setMasterVolume(0.7); });
out.again = await pin(8000);
console.log(JSON.stringify({ exposed: out.exposed.map((s) => [s.det, s.sirenVol, s.sirenPaused, s.hearts, s.rs].join(' ')), pausedSiren: out.pausedSiren, master0: out.master0.map((s) => [s.det, s.sirenVol, s.sirenPaused].join(' ')), again: out.again.map((s) => [s.det, s.sirenVol, s.sirenPaused, s.hearts, s.rs].join(' ')), plays: out.again.at(-1).plays, errors }, null, 0));
await browser.close(); server.kill();
