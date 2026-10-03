import { openGame, startStage } from '../h.mjs';
const { page, errors, close } = await openGame(8801);
const sleep = (ms) => page.waitForTimeout(ms);
const out = (k, v) => console.log(k, JSON.stringify(v));
try {
  await startStage(page, 5, 9001);
  const r = await page.evaluate(async () => {
    const E = globalThis.__ee; const w = (ms) => new Promise((r) => setTimeout(r, ms));
    const ids = []; const tag = () => { if (!E.scene.root.userData.tag) E.scene.root.userData.tag = Math.random().toString(36).slice(2, 6); return E.scene.root.userData.tag; };
    ids.push(['playing', tag(), E.player.z.toFixed(1)]);
    E.player.z = 60; await w(200);
    E.handleWin(); await w(400);
    ids.push(['cleared banner up', tag(), E.player.z.toFixed(1), E.useStore.getState().runState]);
    E.useStore.getState().resetForSegment(E.useStore.getState().segmentSeed + 1); await w(400);
    ids.push(['after NEXT STAGE', tag(), E.player.z.toFixed(1)]);
    return ids;
  });
  out('scene root per phase', r);
} finally { out('errors', errors); await close(); }
