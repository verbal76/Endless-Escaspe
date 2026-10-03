import { openGame, startStage } from '../h.mjs';
const { page, errors, close } = await openGame(8801);
const sleep = (ms) => page.waitForTimeout(ms);
const out = (k, v) => console.log(k, JSON.stringify(v));
const S = () => page.evaluate(() => { const s = globalThis.__ee.useStore.getState(); return { runState: s.runState, paused: s.paused, modal: s.gameModal?.title ?? null, stage: s.stage, seed: s.segmentSeed, hearts: s.hearts, howToPlay: s.howToPlay }; });
const tap = async (t, n = 1) => { const b = await page.getByText(t, { exact: true }).first().boundingBox(); if (!b) return 'missing'; for (let i = 0; i < n; i++) await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2, { delay: 10 }); return 'ok'; };
const gearHit = () => page.evaluate(() => { const g = document.querySelector('[aria-label="Settings"]'); if (!g) return 'no gear'; const r = g.getBoundingClientRect(); const el = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); return g.contains(el) ? 'gear on top' : 'covered by ' + (el?.innerText?.slice(0, 30) ?? el?.tagName); });
try {
  await page.evaluate(() => {
    const st = globalThis.__ee.useStore.getState();
    const save = { name: 'Tester', skin: 'beige', stage: 9, bestStars: {}, updatedAt: 1, tipsSeen: [], coins: 0, coinStars: {}, lastRewardedRun: null, outfits: ['classic', 'grey'], outfit: 'classic', endlessBest: 0, daily: null };
    st.upsertSave(save); st.setActiveSave('tester');
  });
  // (a) double-tap NEXT STAGE
  await startStage(page, 8, 7001);
  await page.evaluate(() => globalThis.__ee.handleWin()); await sleep(600);
  out('a cleared', await S());
  await tap('NEXT STAGE', 2);
  await sleep(500);
  out('a after double tap', await S());
  // (c) boss intro: gear reachable?
  await page.evaluate(() => globalThis.__ee.handleWin()); await sleep(600);
  await tap('NEXT STAGE'); await sleep(700);
  out('c boss intro', await S());
  out('c gear hit-test during BOSS ROUND modal', await gearHit());
  out('c START', await tap('START')); await sleep(300);
  // (d) pause during the cleared banner -> RESTART
  await page.evaluate(() => globalThis.__ee.handleWin()); await sleep(600);
  out('d cleared stage 10 ->', await S());
  out('d gear hit-test during cleared banner', await gearHit());
  await page.click('[aria-label="Settings"]'); await sleep(400);
  out('d RESTART', await tap('RESTART')); await sleep(600);
  out('d after pause RESTART on the cleared banner', await S());
  // (e) background during catch hit-stop
  await page.evaluate(() => globalThis.__ee.handleCatch()); 
  await page.evaluate(() => { Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' }); Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); document.dispatchEvent(new Event('visibilitychange')); });
  await sleep(400);
  out('e backgrounded during hit-stop', await S());
  await page.evaluate(() => { Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' }); Object.defineProperty(document, 'hidden', { configurable: true, get: () => false }); document.dispatchEvent(new Event('visibilitychange')); });
  await sleep(300);
  out('e foreground (panel still up?)', { ...(await S()), panel: await page.evaluate(() => document.body.innerText.includes('GAME PAUSED')) });
  out('e RESUME', await tap('RESUME')); await sleep(400);
  out('e after RESUME', await S());
  // (f) last-heart catch then MAIN MENU during hit-stop
  await page.evaluate(() => { const E = globalThis.__ee; E.useStore.getState().setHearts(1); E.handleCatch(); E.useStore.getState().setRunState('idle'); });
  await sleep(400);
  out('f main menu during final hit-stop', await S());
  // (g) Tutorial: is gear covered?
  await page.evaluate(() => globalThis.__ee.useStore.getState().setShowTutorial(true)); await sleep(500);
  out('g gear hit-test during tutorial', await gearHit());
  await page.evaluate(() => globalThis.__ee.useStore.getState().setShowTutorial(false)); await sleep(300);
  // (h) home HowToPlay
  await page.evaluate(() => globalThis.__ee.useStore.getState().setHowToPlay('home')); await sleep(400);
  out('h gear hit-test during home How To Play', await gearHit());
} finally { out('errors', errors); await close(); }
