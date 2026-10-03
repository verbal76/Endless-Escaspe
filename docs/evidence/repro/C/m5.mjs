// Resource lifecycle: 30 stage rebuilds + 30 restarts, then a 3 km endless run.
import { openGame } from '../h.mjs';
const { page, errors, close } = await openGame(8803);
const cdp = await page.context().newCDPSession(page);
await page.evaluate(() => { window.requestAnimationFrame = () => 0; });
await page.waitForTimeout(300);
const heap = async () => { await cdp.send('HeapProfiler.collectGarbage'); const h = await cdp.send('Runtime.getHeapUsage'); return +(h.usedSize / 1048576).toFixed(1); };
const snap = (label) => page.evaluate((label) => {
  const E = globalThis.__ee; const R = E.renderer.renderer; let objs = 0; E.renderer.scene.traverse(() => objs++);
  return { label, geo: R.info.memory.geometries, tex: R.info.memory.textures, progs: R.info.programs.length, objs, worldChildren: E.renderer.worldRoot.children.length, calls: R.info.render.calls };
}, label);
const out = [];
await page.evaluate(() => { const st = globalThis.__ee.useStore.getState(); st.setShowTutorial?.(false); st.setGameMode('campaign'); st.setStage(5); st.startRun(); st.resetForSegment(1); globalThis.__ee.update(1/60); globalThis.__ee.render(0); });
out.push({ ...(await snap('stage5 first')), heap: await heap() });
const rebuildTimes = [];
for (let k = 0; k < 30; k++) {
  const t = await page.evaluate((k) => {
    const E = globalThis.__ee; const st = E.useStore.getState();
    st.setStage(1 + (k % 30)); st.resetForSegment(1000 + k);
    const a = performance.now(); E.update(1/60); const b = performance.now();
    st.setGameModal(null); st.setPaused(false);
    // a few frames incl. smoke + swing so pooled effects get exercised
    st.addPickup('smokebomb'); E.input.useSmokeBomb = true; st.addPickup('crowbar'); E.input.useCrowbar = true;
    for (let i = 0; i < 6; i++) { E.update(1/60); E.render(0); }
    return b - a;
  }, k);
  rebuildTimes.push(+t.toFixed(1));
}
await page.evaluate(() => { const E = globalThis.__ee; const st = E.useStore.getState(); st.setStage(5); st.resetForSegment(1); E.update(1/60); E.render(0); });
out.push({ ...(await snap('stage5 after 30 rebuilds')), heap: await heap() });
for (let k = 0; k < 30; k++) await page.evaluate(() => { const E = globalThis.__ee; const st = E.useStore.getState(); st.requestRestart(); E.update(1/60); st.setGameModal(null); st.setPaused(false); for (let i = 0; i < 3; i++) { E.update(1/60); E.render(0); } });
out.push({ ...(await snap('stage5 after +30 restarts')), heap: await heap() });
// Endless: 3 km, guards stunned, player teleported forward 2 m per frame.
await page.evaluate(() => { const E = globalThis.__ee; const st = E.useStore.getState(); st.setGameMode('endless'); st.startRun(); st.resetForSegment(777); E.update(1/60); st.setGameModal(null); st.setPaused(false); E.update(1/60); E.render(0); });
out.push({ ...(await snap('endless start')), heap: await heap() });
console.log(JSON.stringify({ out, rebuildTimes }));
const endless = [];
for (let km = 0; km < 6; km++) {
  const r = await page.evaluate(() => {
    const E = globalThis.__ee; const st = E.useStore.getState(); const ft = [];
    const target = E.player.z + 500; let n = 0;
    while (E.player.z < target) {
      for (const g of E.scene.guards) { g.stunTimer = 5; g.state = 'wander'; }
      for (const d of E.scene.dogs) { d.state = 'flee'; d.stateTimer = 5; }
      for (const c of E.scene.cameras) { }
      if (st.hearts < 3) st.setHearts(9);
      if (E.useStore.getState().runState !== 'playing') E.useStore.getState().setRunState('playing');
      E.player.x = 0; E.player.z += 1.0; n++;
      const a = performance.now(); E.update(1/60); const b = performance.now(); if (n % 6 === 0) E.render(0); ft.push({ u: b - a, r: performance.now() - b });
    }
    ft.sort((x, y) => (y.u + y.r) - (x.u + x.r));
    return { z: Math.round(E.player.z), sections: E.scene.sections.length, guards: E.scene.guards.length, dogs: E.scene.dogs.length, towers: E.scene.lightTowers.length, obstacles: E.scene.procgen.obstacles().length, worst3: ft.slice(0, 3).map(f => [+f.u.toFixed(1), +f.r.toFixed(1)]) };
  });
  endless.push({ ...r, ...(await snap('endless')), heap: await heap() }); console.log(JSON.stringify(endless[endless.length-1]));
}
console.log(JSON.stringify({ out, rebuildTimes, endless }, null, 1)); console.log(errors);
await close();
