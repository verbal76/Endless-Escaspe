// Render-audit cost, draw-call breakdown, first-use shader compiles.
import { openGame } from '../h.mjs';
const { page, errors, logs, close } = await openGame(8803);
await page.evaluate(() => { window.requestAnimationFrame = () => 0; });
await page.waitForTimeout(300);
const out = {};
// (a) audit cost: frames after a rebuild, with readPixels counted.
out.audit = await page.evaluate(() => {
  const E = globalThis.__ee; const R = E.renderer.renderer; const gl = R.getContext();
  let rp = 0, fbo = 0; const orp = gl.readPixels.bind(gl); gl.readPixels = (...a) => { rp++; return orp(...a); };
  const ocf = gl.createFramebuffer.bind(gl); gl.createFramebuffer = () => { fbo++; return ocf(); };
  const st = E.useStore.getState(); st.setShowTutorial?.(false); st.setGameMode('campaign'); st.setStage(7); st.startRun(); st.resetForSegment(99);
  const frames = [];
  for (let i = 0; i < 8; i++) { const rp0 = rp; const a = performance.now(); E.update(1/60); E.render(0); gl.finish(); frames.push({ i, ms: +(performance.now() - a).toFixed(1), readPixels: rp - rp0 }); }
  return { frames, totalReadPixels: rp, fbos: fbo };
});
// (b) draw-call breakdown by category for a heavy stage.
out.breakdown = await page.evaluate(() => {
  const E = globalThis.__ee; const T = E.THREE; const R = E.renderer.renderer;
  const st = E.useStore.getState(); st.setStage(29); st.resetForSegment(4271);
  E.update(1/60); st.setGameModal(null); st.setPaused(false); E.update(1/60); E.render(0);
  const cam = E.renderer.camera; cam.updateMatrixWorld(); const fr = new T.Frustum().setFromProjectionMatrix(new T.Matrix4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse));
  const cat = {}; let total = 0;
  const sphere = new T.Sphere();
  const key = (o) => {
    // nearest named ancestor or geometry type / material type
    let p = o, path = [];
    while (p && p !== E.renderer.scene) { if (p.name) path.push(p.name); p = p.parent; }
    const m = Array.isArray(o.material) ? o.material[0] : o.material;
    const tag = m?.userData?.audit?.group;
    return (path[0] || tag || '') + '|' + o.type + '|' + o.geometry.type + '|' + m.type + (m.transparent ? '(T)' : '');
  };
  E.renderer.scene.traverseVisible((o) => {
    if (!(o.isMesh || o.isPoints || o.isLine)) return;
    let vis = true;
    if (o.frustumCulled && !o.isInstancedMesh) { if (!o.geometry.boundingSphere) o.geometry.computeBoundingSphere(); sphere.copy(o.geometry.boundingSphere).applyMatrix4(o.matrixWorld); vis = fr.intersectsSphere(sphere); }
    if (!vis) return;
    const k = key(o); cat[k] = (cat[k] || 0) + 1; total++;
  });
  const top = Object.entries(cat).sort((a, b) => b[1] - a[1]).slice(0, 25);
  return { calls: R.info.render.calls, tris: R.info.render.triangles, visibleDrawables: total, top };
});
// (c) first-use program compiles mid-game.
out.firstUse = await page.evaluate(() => {
  const E = globalThis.__ee; const R = E.renderer.renderer; const gl = R.getContext();
  const st = E.useStore.getState(); st.setStage(3); st.resetForSegment(31); E.update(1/60); st.setGameModal(null); st.setPaused(false);
  for (let i = 0; i < 5; i++) { E.update(1/60); E.render(0); }
  const res = [];
  const step = (label, fn) => { fn(); const p0 = R.info.programs.length; const a = performance.now(); E.update(1/60); E.render(0); gl.finish(); res.push({ label, frameMs: +(performance.now() - a).toFixed(1), newPrograms: R.info.programs.length - p0 }); for (let i = 0; i < 3; i++) { E.update(1/60); E.render(0); } };
  const inv = (k) => { const s = E.useStore.getState(); s.addPickup(k); };
  step('baseline', () => {});
  step('smoke bomb', () => { inv('smokebomb'); E.input.useSmokeBomb = true; });
  step('crowbar swing', () => { inv('crowbar'); E.input.useCrowbar = true; });
  step('rock throw', () => { inv('rock'); E.input.throwRock = true; });
  step('catch', () => { E.handleCatch('arrested'); });
  for (let i = 0; i < 20; i++) { E.update(1/60); E.render(0); }
  return { res, programs: R.info.programs.length };
});
console.log(JSON.stringify(out, null, 1));
console.log('errors', errors, logs.filter(l => /audit|Driver/.test(l)).slice(0, 6));
await close();
