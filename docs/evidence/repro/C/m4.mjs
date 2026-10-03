// 20 s of simulated play: per-frame JS time, store notifications, allocation profile.
import { openGame } from '../h.mjs';
import fs from 'node:fs';
const { page, errors, close } = await openGame(8803);
const cdp = await page.context().newCDPSession(page);
await page.evaluate(() => { window.requestAnimationFrame = () => 0; });
await page.waitForTimeout(300);
const STAGE = +(process.argv[2] || 12), MODE = process.argv[3] || 'campaign';
await page.evaluate(({ STAGE, MODE }) => {
  const E = globalThis.__ee; const st = E.useStore.getState();
  st.setShowTutorial?.(false); st.setGameMode(MODE); st.setStage(STAGE); st.startRun(); st.resetForSegment(5150);
  E.update(1/60); E.useStore.getState().setGameModal(null); E.useStore.getState().setPaused(false);
  for (let i = 0; i < 10; i++) { E.update(1/60); E.render(0); }
}, { STAGE, MODE });
await cdp.send('HeapProfiler.enable');
await cdp.send('HeapProfiler.collectGarbage');
const h0 = await cdp.send('Runtime.getHeapUsage');
await cdp.send('HeapProfiler.startSampling', { samplingInterval: 512, includeObjectsCollectedByMajorGC: true, includeObjectsCollectedByMinorGC: true });
const r = await page.evaluate(() => {
  const E = globalThis.__ee; const R = E.renderer.renderer;
  let notifies = 0; const keyCounts = {};
  const unsub = E.useStore.subscribe((s, p) => { notifies++; for (const k in s) if (s[k] !== p[k]) keyCounts[k] = (keyCounts[k] || 0) + 1; });
  const up = [], rd = [], calls = [];
  let catches = 0;
  const F = 1200; // 20 s at 60 Hz
  for (let i = 0; i < F; i++) {
    E.input.axisY = 1; E.input.axisX = Math.sin(i / 50) * 0.6; E.input.run = (i % 400) < 150;
    E.input.stance = (i % 600) > 450 ? 'crouch' : 'walk';
    const s = E.useStore.getState(); if (s.hearts < 3) s.setHearts(9);
    if (s.runState !== 'playing') { catches++; s.setRunState('playing'); }
    if (E.player.z > E.scene.segmentEndZ - 10) E.player.z = 5;
    const a = performance.now(); E.update(1/60); const b = performance.now(); E.render(0); const c = performance.now();
    up.push(b - a); rd.push(c - b); calls.push(R.info.render.calls);
  }
  unsub();
  const q = (arr) => { const s = [...arr].sort((x, y) => x - y); const p = (k) => +s[Math.min(s.length - 1, Math.floor(k * s.length))].toFixed(2); return { p50: p(0.5), p95: p(0.95), p99: p(0.99), max: +s[s.length - 1].toFixed(2) }; };
  const tot = up.map((u, i) => u + rd[i]);
  return { frames: F, update: q(up), render: q(rd), total: q(tot), callsMax: Math.max(...calls), notifiesPerSec: +(notifies / 20).toFixed(1), keyChangesPerSec: Object.fromEntries(Object.entries(keyCounts).map(([k, v]) => [k, +(v / 20).toFixed(1)])), endZ: Math.round(E.player.z), catches, hearts: E.useStore.getState().hearts };
});
const prof = await cdp.send('HeapProfiler.stopSampling');
const h1 = await cdp.send('Runtime.getHeapUsage');
// Aggregate self-size by function (name:line:col).
const agg = {}; let total = 0;
const walk = (n) => { const f = n.callFrame; const k = `${f.functionName || '(anon)'}@${f.lineNumber}:${f.columnNumber}`; const self = n.selfSize; total += self; agg[k] = (agg[k] || 0) + self; for (const c of n.children) walk(c); };
walk(prof.profile.head);
const top = Object.entries(agg).sort((a, b) => b[1] - a[1]).slice(0, 25).map(([k, v]) => [k, +(v / 1024).toFixed(0) + ' KiB']);
r.allocTotalMiB = +(total / 1048576).toFixed(2); r.allocPerFrameKiB = +(total / 1024 / 1200).toFixed(1);
r.heapBefore = +(h0.usedSize / 1048576).toFixed(1); r.heapAfter = +(h1.usedSize / 1048576).toFixed(1);
r.topAlloc = top;
fs.writeFileSync(`C/prof-${STAGE}-${MODE}.json`, JSON.stringify(prof));
console.log(JSON.stringify(r, null, 1)); console.log(errors);
await close();
