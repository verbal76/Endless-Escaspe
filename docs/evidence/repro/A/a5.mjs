import { openGame } from '../h.mjs';
const { page, errors, close } = await openGame(8801);
const sleep = (ms) => page.waitForTimeout(ms);
const out = (k, v) => console.log(k, JSON.stringify(v));
const box = async (t) => page.getByText(t, { exact: true }).first().boundingBox();
const tap = async (t, n = 1, gap = 0) => { const b = await box(t); if (!b) return 'missing'; for (let i = 0; i < n; i++) { await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2); if (gap) await sleep(gap); } return 'ok'; };
try {
  await page.evaluate(() => globalThis.__ee.useStore.getState().setTutorialSeen(true));
  out('NEW RUN', await tap('NEW RUN')); await sleep(400);
  for (const k of ['B', 'O', 'B']) await tap(k);
  await sleep(200);
  out('DONE x2 (fast)', await tap('DONE', 2));
  await sleep(600);
  out('state', await page.evaluate(() => { const s = globalThis.__ee.useStore.getState(); return { runState: s.runState, paused: s.paused, modal: s.gameModal?.title ?? null, saves: Object.keys(s.saves), active: s.activeSaveName }; }));
  // Name that collides with Object.prototype
  await page.evaluate(() => { const s = globalThis.__ee.useStore.getState(); s.setGameModal(null); s.setRunState('idle'); });
  await sleep(600);
  out('menu after the run ends (visible text)', await page.evaluate(() => document.body.innerText.replace(/\s+/g, ' ').slice(0, 160)));
  out('DONE again', await tap('DONE')); await sleep(400);
  out('-> modal', await page.evaluate(() => globalThis.__ee.useStore.getState().gameModal?.title ?? null));
  await page.evaluate(() => globalThis.__ee.useStore.getState().setGameModal(null)); await sleep(300);
  for (let i = 0; i < 3; i++) await tap('⌫').catch(() => {});
  await page.evaluate(() => globalThis.__ee.useStore.getState().setPaused(false));
  for (const k of 'CONSTRUCTOR') await tap(k);
  await sleep(200); out('before DONE', await page.evaluate(() => document.body.innerText.replace(/\s+/g, ' ').slice(0, 60)));
  await tap('DONE'); await sleep(500);
  out('name "Constructor"', await page.evaluate(() => { const s = globalThis.__ee.useStore.getState(); return { runState: s.runState, modal: s.gameModal?.title ?? null, saves: Object.keys(s.saves) }; }));
} finally { out('errors', errors); await close(); }
