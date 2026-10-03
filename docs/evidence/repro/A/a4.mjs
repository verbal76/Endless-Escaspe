import { openGame, startStage } from '../h.mjs';
const { page, errors, close } = await openGame(8801);
const sleep = (ms) => page.waitForTimeout(ms);
const out = (k, v) => console.log(k, JSON.stringify(v));
const tap = async (t) => { const b = await page.getByText(t, { exact: true }).first().boundingBox(); if (!b) return 'missing'; await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2); return 'ok'; };
const S = () => page.evaluate(() => { const s = globalThis.__ee.useStore.getState(); return { runState: s.runState, paused: s.paused, stage: s.stage, hearts: s.hearts, perk: s.perkRemainingStages, saveStage: s.saves.tester?.stage }; });
try {
  await page.evaluate(() => {
    const st = globalThis.__ee.useStore.getState();
    const save = { name: 'Tester', skin: 'beige', stage: 10, bestStars: {}, updatedAt: 1, tipsSeen: [], coins: 0, coinStars: {}, lastRewardedRun: null, outfits: ['classic', 'grey'], outfit: 'classic', endlessBest: 0, daily: null };
    st.upsertSave(save); st.setActiveSave('tester');
  });
  // Boss perk
  await startStage(page, 10, 8001);
  await page.evaluate(() => globalThis.__ee.handleWin()); await sleep(500);
  await tap('NEXT STAGE'); await sleep(600);
  out('perk after boss clear, stage 11 start', await S());
  await page.evaluate(() => globalThis.__ee.useStore.getState().setRunState('idle')); await sleep(300); // pause -> MAIN MENU
  await page.evaluate(() => { const st = globalThis.__ee.useStore.getState(); const s = st.saves.tester; st.setStage(s.stage); st.startRun(); }); // CONTINUE (beginRunForSave)
  await sleep(600);
  out('perk after MAIN MENU -> CONTINUE', await S());

  // Death -> banner MAIN MENU -> CONTINUE: same layout, pickups already gone, inventory zeroed
  await startStage(page, 4, 8100);
  const got = await page.evaluate(async () => {
    const E = globalThis.__ee; for (const g of E.scene.guards) g.stunTimer = 99;
    const ps = E.scene.procgen.pickups().filter((p) => !p.collected).slice(0, 3);
    for (const p of ps) { E.player.x = p.x; E.player.z = p.z; await new Promise((r) => setTimeout(r, 350)); }
    return { grabbed: ps.length, inv: E.useStore.getState().inventory };
  });
  out('death-path: grabbed', got);
  await page.evaluate(async () => { const E = globalThis.__ee; for (const g of E.scene.guards) g.stunTimer = 0; E.useStore.getState().setHearts(1); E.handleCatch(); await new Promise((r) => setTimeout(r, 400)); });
  out('death-path: banner', await S());
  out('death-path: tap MAIN MENU', await tap('MAIN MENU')); await sleep(400);
  await page.evaluate(() => { const st = globalThis.__ee.useStore.getState(); st.setStage(4); st.startRun(); }); await sleep(600);
  out('death-path: after CONTINUE stage 4', await page.evaluate(() => { const E = globalThis.__ee; return { seed: E.useStore.getState().segmentSeed, uncollected: E.scene.procgen.pickups().filter((p) => !p.collected).length, total: E.scene.procgen.pickups().length, inv: E.useStore.getState().inventory }; }));

  // One transient exception in update() kills the loop for good
  const loop = await page.evaluate(async () => {
    const E = globalThis.__ee; const pg = E.scene.procgen; const orig = pg.update.bind(pg);
    let calls = 0; pg.update = (...a) => { calls++; if (calls === 1) throw new Error('transient'); return orig(...a); };
    await new Promise((r) => setTimeout(r, 1000));
    const callsAfter = calls;
    const z0 = E.player.z; E.input.axisY = 1; await new Promise((r) => setTimeout(r, 800));
    return { callsAfterThrow: callsAfter, playerMoved: E.player.z !== z0 };
  });
  out('loop after one exception in update', loop);
} finally { out('pageerrors', errors); await close(); }
