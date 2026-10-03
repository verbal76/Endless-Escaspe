import { openGame, startStage } from '../h.mjs';
const { page, errors, close } = await openGame(8801);
const sleep = (ms) => page.waitForTimeout(ms);
const out = (k, v) => console.log(k, JSON.stringify(v));
try {
  await page.evaluate(() => {
    const st = globalThis.__ee.useStore.getState();
    const save = { name: 'Tester', skin: 'beige', stage: 3, bestStars: {}, updatedAt: 1, tipsSeen: [], coins: 0, coinStars: {}, lastRewardedRun: null, outfits: ['classic', 'grey'], outfit: 'classic', endlessBest: 0, daily: null };
    st.upsertSave(save); st.setActiveSave('tester');
  });
  await startStage(page, 3, 6001);
  // Collect every pickup by teleporting the player onto it.
  const before = await page.evaluate(async () => {
    const E = globalThis.__ee;
    for (const g of E.scene.guards) g.stunTimer = 99;
    const ps = E.scene.procgen.pickups().filter((p) => !p.collected);
    const n = ps.length;
    for (const p of ps) { E.player.x = p.x; E.player.z = p.z; await new Promise((r) => setTimeout(r, 350)); }
    return { pickups: n, collected: E.scene.procgen.pickups().filter((p) => p.collected).length, inv: E.useStore.getState().inventory };
  });
  out('collected in stage 3', before);
  // Pause -> MAIN MENU, then CONTINUE the same save (same stage)
  await page.evaluate(() => { const st = globalThis.__ee.useStore.getState(); st.setPaused(false); st.setRunState('idle'); });
  await sleep(300);
  await page.evaluate(() => { const st = globalThis.__ee.useStore.getState(); st.setStage(3); st.startRun(); });
  await sleep(400);
  out('after main menu + continue same stage', await page.evaluate(() => { const E = globalThis.__ee; return { remainingPickups: E.scene.procgen.pickups().filter((p) => !p.collected).length, total: E.scene.procgen.pickups().length, inv: E.useStore.getState().inventory, seed: E.useStore.getState().segmentSeed }; }));
  // Same thing via caught banner -> MAIN MENU -> continue
  // Compare: pause RESTART keeps inventory
  await page.evaluate(() => globalThis.__ee.useStore.getState().requestRestart()); await sleep(300);
  out('after RESTART', await page.evaluate(() => { const E = globalThis.__ee; return { remainingPickups: E.scene.procgen.pickups().filter((p) => !p.collected).length, inv: E.useStore.getState().inventory }; }));
} finally { out('errors', errors); await close(); }
