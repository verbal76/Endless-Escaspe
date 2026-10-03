// Loop liveness, rebuild cost per stage, first-render cost, draw calls.
import { openGame, startStage } from '../h.mjs';
const { page, errors, close } = await openGame(8803);
const out = {};
out.loop = await page.evaluate(async () => {
  const R = globalThis.__ee.renderer.renderer;
  const f0 = R.info.render.frame; await new Promise(r => setTimeout(r, 1000)); return { framesPerSec: R.info.render.frame - f0 };
});
// Stop the real loop: replace rAF with a no-op so we drive frames manually.
await page.evaluate(() => {
  globalThis.__origRAF = window.requestAnimationFrame;
  window.requestAnimationFrame = () => 0;
});
await page.waitForTimeout(300);
out.loopStopped = await page.evaluate(async () => {
  const R = globalThis.__ee.renderer.renderer;
  const f0 = R.info.render.frame; await new Promise(r => setTimeout(r, 300)); return R.info.render.frame - f0;
});
const measure = (stage, mode, seed) => page.evaluate(({ stage, mode, seed }) => {
  const E = globalThis.__ee; const R = E.renderer.renderer; const gl = R.getContext();
  const st = E.useStore.getState();
  st.setShowTutorial?.(false);
  st.setGameMode(mode);
  st.setStage(stage);
  st.startRun();
  st.resetForSegment(seed);
  const progs0 = R.info.programs.length;
  const t0 = performance.now();
  E.update(1 / 60); // detects change -> rebuildScene + resetSegment
  const t1 = performance.now();
  E.render(0); // first draw: uploads + shader compiles
  const t2 = performance.now();
  gl.finish();
  const t3 = performance.now();
  // steady frames
  const st2 = E.useStore.getState(); st2.setGameModal(null); st2.setPaused(false);
  const times = [];
  for (let i = 0; i < 30; i++) { const a = performance.now(); E.update(1/60); E.render(0); times.push(performance.now() - a); }
  gl.finish();
  times.sort((a, b) => a - b);
  let objs = 0, meshes = 0, transparent = 0; const mats = new Set(), geos = new Set();
  E.renderer.scene.traverse((o) => { objs++; if (o.isMesh || o.isPoints || o.isLine) { meshes++; geos.add(o.geometry); const m = Array.isArray(o.material) ? o.material : [o.material]; for (const x of m) { mats.add(x); if (x.transparent) transparent++; } } });
  return {
    stage, mode, rebuildMs: +(t1 - t0).toFixed(1), firstRenderJsMs: +(t2 - t1).toFixed(1), firstRenderFinishMs: +(t3 - t1).toFixed(1),
    steadyMedianMs: +times[15].toFixed(2), newPrograms: R.info.programs.length - progs0, programs: R.info.programs.length,
    calls: R.info.render.calls, tris: R.info.render.triangles, geomMem: R.info.memory.geometries, texMem: R.info.memory.textures,
    objs, drawables: meshes, uniqueMats: mats.size, uniqueGeos: geos.size, transparentDrawables: transparent,
    guards: E.scene.guards.length, dogs: E.scene.dogs.length, towers: E.scene.lightTowers.length, cams: E.scene.cameras.length, weather: E.scene.weatherKind, boss: E.scene.isBossArena,
  };
}, { stage, mode, seed });
out.stages = [];
for (const [s, m] of [[1,'campaign'],[2,'campaign'],[5,'campaign'],[9,'campaign'],[10,'campaign'],[15,'campaign'],[20,'campaign'],[25,'campaign'],[29,'campaign'],[30,'campaign'],[1,'endless'],[1,'daily'],[1,'campaign']]) {
  out.stages.push(await measure(s, m, 4242 + s));
}
// Repeat to see warm (programs compiled) rebuild cost.
out.warm = [];
for (const s of [1, 10, 20, 30]) out.warm.push(await measure(s, 'campaign', 777 + s));
console.log(JSON.stringify(out, null, 1));
console.log('errors', errors);
await close();
