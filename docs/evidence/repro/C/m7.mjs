// Depth precision: render the same frame into a 24-bit and a 16-bit depth
// render target (expo-gl Android asks EGL for EGL_DEPTH_SIZE 16) and diff.
import { openGame } from '../h.mjs';
import fs from 'node:fs';
const { page, errors, close } = await openGame(8803);
await page.evaluate(() => { window.requestAnimationFrame = () => 0; });
await page.waitForTimeout(300);
const res = await page.evaluate(() => {
  const E = globalThis.__ee; const T = E.THREE; const R = E.renderer.renderer; const cam = E.renderer.camera;
  const st = E.useStore.getState(); st.setShowTutorial?.(false); st.setGameMode('campaign'); st.setStage(3); st.startRun(); st.resetForSegment(4245);
  E.update(1/60); st.setGameModal(null); st.setPaused(false);
  E.player.z = E.scene.segmentEndZ - 40; // win line ~40 m ahead
  for (let i = 0; i < 90; i++) { for (const g of E.scene.guards) g.stunTimer = 5; E.update(1/60); E.render(0); }
  const W = 915, H = 412;
  const shot = (type, near) => {
    const rt = new T.WebGLRenderTarget(W, H, { depthBuffer: true });
    rt.depthTexture = new T.DepthTexture(W, H, type);
    const n0 = cam.near; cam.near = near; cam.updateProjectionMatrix();
    R.setRenderTarget(rt); R.render(E.renderer.scene, cam); R.setRenderTarget(null);
    cam.near = n0; cam.updateProjectionMatrix();
    const px = new Uint8Array(W * H * 4); R.readRenderTargetPixels(rt, 0, 0, W, H, px); rt.dispose(); rt.depthTexture.dispose();
    return px;
  };
  const d24 = shot(T.UnsignedIntType, 0.1), d16 = shot(T.UnsignedShortType, 0.1), d16n = shot(T.UnsignedShortType, 0.5), d24n = shot(T.UnsignedIntType, 0.5);
  const diff = (a, b) => { let n = 0; for (let i = 0; i < a.length; i += 4) if (Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]) > 24) n++; return n; };
  // Also flicker: 16-bit, two camera positions 1 cm apart
  return { W, H, diff16vs24_near01: diff(d24, d16), diff16vs24_near05: diff(d24n, d16n), diff24_near01_vs_near05: diff(d24, d24n), total: W * H, d24: Array.from(d24), d16: Array.from(d16), d16n: Array.from(d16n) };
});
for (const k of ['d24', 'd16', 'd16n']) { fs.writeFileSync(`C/depth-${k}.raw`, Buffer.from(res[k])); delete res[k]; }
console.log(JSON.stringify(res)); console.log(errors);
await close();
