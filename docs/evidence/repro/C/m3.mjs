// Draw calls by distance band from the player + double-sided transparent passes.
import { openGame } from '../h.mjs';
const { page, errors, close } = await openGame(8803);
await page.evaluate(() => { window.requestAnimationFrame = () => 0; });
await page.waitForTimeout(300);
const res = [];
for (const [stage, mode] of [[1,'campaign'],[15,'campaign'],[29,'campaign'],[1,'endless']]) {
res.push(await page.evaluate(({ stage, mode }) => {
  const E = globalThis.__ee; const T = E.THREE; const R = E.renderer.renderer;
  const st = E.useStore.getState(); st.setShowTutorial?.(false); st.setGameMode(mode); st.setStage(stage); st.startRun(); st.resetForSegment(4242 + stage);
  E.update(1/60); st.setGameModal(null); st.setPaused(false);
  // walk the player a bit into the level
  E.player.z = 40; for (let i = 0; i < 60; i++) { for (const g of E.scene.guards) g.stunTimer = 5; E.update(1/60); } E.render(0);
  const calls = R.info.render.calls;
  const cam = E.renderer.camera; cam.updateMatrixWorld();
  const fr = new T.Frustum().setFromProjectionMatrix(new T.Matrix4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse));
  const sphere = new T.Sphere(); const wp = new T.Vector3();
  const bands = { '<30m': 0, '30-60': 0, '60-120': 0, '120-250': 0, '>250': 0 }; let est = 0, dsTransparentExtra = 0, multiMatExtra = 0;
  E.renderer.scene.traverseVisible((o) => {
    if (!(o.isMesh || o.isPoints || o.isLine)) return;
    if (o.frustumCulled) { if (!o.geometry.boundingSphere) o.geometry.computeBoundingSphere(); sphere.copy(o.geometry.boundingSphere).applyMatrix4(o.matrixWorld); if (!fr.intersectsSphere(sphere)) return; }
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    let n = Array.isArray(o.material) ? Math.max(1, o.geometry.groups.length) : 1;
    multiMatExtra += n - 1;
    let c = 0; for (let i = 0; i < n; i++) { const m = mats[Array.isArray(o.material) ? (o.geometry.groups[i]?.materialIndex ?? 0) : 0]; if (!m || !m.visible) continue; const two = m.transparent && m.side === T.DoubleSide && !m.forceSinglePass; c += two ? 2 : 1; if (two) dsTransparentExtra++; }
    est += c;
    o.getWorldPosition(wp); const d = Math.abs(wp.z - E.player.z);
    const b = o.isInstancedMesh || o.frustumCulled === false ? '>250' : d < 30 ? '<30m' : d < 60 ? '30-60' : d < 120 ? '60-120' : d < 250 ? '120-250' : '>250';
    bands[b] += c;
  });
  return { stage, mode, calls, est, multiMatExtra, dsTransparentExtra, bands, tris: R.info.render.triangles, segLen: E.scene.segLen };
}, { stage, mode }));
}
console.log(JSON.stringify(res, null, 1)); console.log(errors);
await close();
