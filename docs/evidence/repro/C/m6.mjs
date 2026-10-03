// Count per-frame program re-resolution (getProgram -> getParameters ->
// getProgramCacheKey -> material.customProgramCacheKey) per material, and
// test the fix of splitting shared materials between Mesh and InstancedMesh.
import { openGame } from '../h.mjs';
const { page, errors, close } = await openGame(8803);
await page.evaluate(() => { window.requestAnimationFrame = () => 0; });
await page.waitForTimeout(300);
const run = (fix) => page.evaluate((fix) => {
  const E = globalThis.__ee; const R = E.renderer.renderer;
  const st = E.useStore.getState(); st.setShowTutorial?.(false); st.setGameMode('campaign'); st.setStage(12); st.startRun(); st.resetForSegment(5150);
  E.update(1/60); st.setGameModal(null); st.setPaused(false);
  for (let i = 0; i < 6; i++) { E.update(1/60); E.render(0); }
  if (fix) {
    // Give every InstancedMesh its own material clone where the material is also used by a plain Mesh.
    const plain = new Set(), inst = [];
    E.renderer.scene.traverse((o) => { if (!o.isMesh) return; const ms = Array.isArray(o.material) ? o.material : [o.material]; if (o.isInstancedMesh) inst.push(o); else ms.forEach((m) => plain.add(m)); });
    const clones = new Map();
    for (const o of inst) { const sw = (m) => plain.has(m) ? (clones.get(m) || (clones.set(m, m.clone()), clones.get(m))) : m; o.material = Array.isArray(o.material) ? o.material.map(sw) : sw(o.material); }
    for (let i = 0; i < 3; i++) { E.update(1/60); E.render(0); }
  }
  globalThis.__cnt = new Map(); const counts = globalThis.__cnt; const label = (m) => `${m.type}${m.map ? '+map' : ''}${m.transparent ? '(T)' : ''}${m.userData?.audit ? ':' + m.userData.audit.label : ''}`;
  E.renderer.scene.traverse((o) => { if (!o.material) return; for (const m of (Array.isArray(o.material) ? o.material : [o.material])) { if (m.__wrapped) continue; m.__wrapped = true; m.customProgramCacheKey = function () { globalThis.__cnt.set(this, (globalThis.__cnt.get(this) || 0) + 1); return ''; }; } });
  let ms = 0; const F = 60;
  for (let i = 0; i < F; i++) { E.update(1/60); const a = performance.now(); E.render(0); ms += performance.now() - a; }
  let total = 0; const per = {};
  for (const [m, c] of counts) { total += c; per[label(m)] = (per[label(m)] || 0) + c / F; }
  // which object kinds use each re-resolved material
  return { fix, programResolvesPerFrame: +(total / F).toFixed(1), renderMsAvg: +(ms / F).toFixed(2), calls: R.info.render.calls, top: Object.entries(per).sort((a, b) => b[1] - a[1]).slice(0, 10) };
}, fix);
const a = await run(false);
const b = await run(true);
console.log(JSON.stringify({ a, b }, null, 1)); console.log(errors);
await close();
