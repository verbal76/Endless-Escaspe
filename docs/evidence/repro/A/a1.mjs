import { openGame, startStage } from '../h.mjs';
const { page, errors, close } = await openGame(8801);
const sleep = (ms) => page.waitForTimeout(ms);
const out = (k, v) => console.log(k, JSON.stringify(v));
try {
  // What is clickable on the main menu?
  const gear = await page.$('[aria-label="Settings"]');
  out('gear present at idle', !!gear);
  out('state0', await page.evaluate(() => { const s = globalThis.__ee.useStore.getState(); return { runState: s.runState, active: s.activeSaveName, saves: Object.keys(s.saves), showTutorial: s.showTutorial }; }));
  if (gear) {
    await gear.click(); await sleep(500);
    const txt = await page.evaluate(() => document.body.innerText.includes('RESTART'));
    out('pause panel at idle shows RESTART', txt);
    await page.getByText('RESTART', { exact: true }).click(); await sleep(800);
    out('after RESTART from menu', await page.evaluate(() => { const s = globalThis.__ee.useStore.getState(); return { runState: s.runState, paused: s.paused, active: s.activeSaveName, stage: s.stage, hearts: s.hearts, gameMode: s.gameMode }; }));
    // Win it: progress has nowhere to go
    await page.evaluate(() => globalThis.__ee.handleWin()); await sleep(300);
    out('after win with no save', await page.evaluate(() => { const s = globalThis.__ee.useStore.getState(); return { runState: s.runState, stage: s.stage, summary: s.runSummary, saves: Object.keys(s.saves), ls: Object.keys(localStorage) }; }));
  }
} finally { out('errors', errors); await close(); }
