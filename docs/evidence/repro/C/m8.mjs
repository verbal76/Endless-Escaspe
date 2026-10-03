// Endless run in 100 m steps with crash detection + per-step stats.
import { openGame } from '../h.mjs';
const { page, errors, close } = await openGame(8803);
page.on('crash', () => console.log('PAGE CRASH'));
const cdp = await page.context().newCDPSession(page);
await page.evaluate(() => { window.requestAnimationFrame = () => 0; });
await page.waitForTimeout(300);
await page.evaluate(() => { const E = globalThis.__ee; const st = E.useStore.getState(); st.setShowTutorial?.(false); st.setGameMode('endless'); st.startRun(); st.resetForSegment(777); E.update(1/60); st.setGameModal(null); st.setPaused(false); E.update(1/60); E.render(0); });
const t0 = Date.now();
for (let step = 0; step < 30; step++) {
  let r;
  try {
    r = await page.evaluate(() => {
      const E = globalThis.__ee; const R = E.renderer.renderer; const st = E.useStore.getState(); let worst = 0, worstZ = 0, n = 0, sum = 0;
      const target = E.player.z + 100; let prevZ = E.player.z;
      while (E.player.z < target) {
        for (const g of E.scene.guards) { g.stunTimer = 5; g.state = 'wander'; }
        for (const d of E.scene.dogs) { d.state = 'flee'; d.stateTimer = 5; }
        const s = E.useStore.getState(); if (s.hearts < 3) s.setHearts(9); if (s.runState !== 'playing') s.setRunState('playing');
        const nav = E.scene.procgen.nav; const want = Math.max(E.player.z, prevZ) + 1.0; const c = nav.nearestFree(0, want, 16); prevZ = want; if (c) { E.player.x = nav.colX(c.col); E.player.z = Math.max(nav.rowZ(c.row), want); } else { E.player.x = 0; E.player.z = want; } n++; if (n > 400) break;
        const a = performance.now(); E.update(1/60); const u = performance.now() - a; sum += u; if (u > worst) { worst = u; worstZ = E.player.z; }
      }
      E.render(0);
      let objs = 0; E.renderer.scene.traverse(() => objs++);
      return { z: Math.round(E.player.z), maxZ: Math.round(E.scene.maxZ), sections: E.scene.sections.length, guards: E.scene.guards.length, dogs: E.scene.dogs.length, towers: E.scene.lightTowers.length, obstacles: E.scene.procgen.obstacles().length, worstUpdateMs: +worst.toFixed(1), worstAtZ: Math.round(worstZ), avgUpdateMs: +(sum / n).toFixed(2), iters: n, px: +E.player.x.toFixed(1), geo: R.info.memory.geometries, tex: R.info.memory.textures, calls: R.info.render.calls, objs, runState: E.useStore.getState().runState };
    });
  } catch (e) { console.log('EVAL FAIL', e.message.slice(0, 200)); break; }
  if (step % 5 === 4) { await cdp.send('HeapProfiler.collectGarbage'); r.heapMiB = +((await cdp.send('Runtime.getHeapUsage')).usedSize / 1048576).toFixed(1); }
  r.wallS = Math.round((Date.now() - t0) / 1000);
  console.log(JSON.stringify(r));
}
console.log('errors', errors);
await close();
