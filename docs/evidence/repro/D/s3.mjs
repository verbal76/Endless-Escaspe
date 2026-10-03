import { openGame } from '../h.mjs';
const [w,h] = (process.argv[2]||'915x412').split('x').map(Number);
const tag = `${w}x${h}`;
const g = await openGame(8804, { width: w, height: h });
const p = g.page; const wait = (ms)=>p.waitForTimeout(ms);
const shot = async (n) => { await p.screenshot({ path: `${n}_${tag}.png` }); };
const click = async (t, opts={}) => { try { await p.getByText(t, { exact: true }).first().click({timeout:4000, force:true, ...opts}); } catch(e) { console.log('CLICK FAIL', t); } await wait(350); };
const key = async (c) => { await p.getByText(c,{exact:true}).last().click({timeout:3000, force:true}); };
// tutorial prompt path: new run, name
await click('NEW RUN'); await shot('name_empty');
await click('DONE', {force:true}); await click('START'); await shot('name_error');
for (const c of 'WWWWWWWWWWWWWWWWWWWWWW') await key(c);
await wait(200); await shot('name_long');
// clear and type "Kev"
for (let i=0;i<22;i++) await key('⌫');
for (const c of 'KEV') await key(c);
await click('START'); await shot('tut_prompt');
await click('SHOW ME'); await wait(1200); await shot('tut_beat0');
await wait(14500); await shot('tut_beat4');
await click('SKIP'); await wait(1200); await shot('after_skip');
// back to menu with lots of saves
await p.evaluate(() => { const st = globalThis.__ee.useStore.getState(); st.setRunState('idle');
  const mk = (name, stage, coins, stars) => ({ name, skin: 'beige', stage, bestStars: stars, updatedAt: Date.now()-stage*1000, tipsSeen: [], coins, coinStars: {}, lastRewardedRun: null, outfits: ['classic','grey'], outfit: 'classic', endlessBest: 512, daily: null });
  const bs = {}; for (let i=1;i<34;i++) bs[i] = (i%3)+1;
  st.upsertSave(mk('Maximilian Alexander', 34, 150, bs));
  for (const n of ['Ann','Bob','Cy','Dee','Eve','Flo','Gus']) st.upsertSave(mk(n, 3, 0, {1:2,2:3}));
});
await wait(500); await shot('home_saves');
await click('CONTINUE'); await shot('continue_list');
await click('×'); await wait(400); await shot('delete_confirm');
await click('CANCEL');
await click('Maximilian Alexander'); await shot('profile');
await click('OUTFITS'); await wait(400); await shot('outfits');
await click('Gold Standard'); await shot('outfit_nofunds');
await click('OK');
await click('Hi-Vis Orange'); await shot('outfit_bought');
await click('BACK'); await click('BACK'); await click('BACK');
await click('HOW TO PLAY'); await shot('howto');
await p.mouse.move(w/2, h/2); await p.mouse.wheel(0, 2000); await wait(400); await shot('howto_end');
await click('CLOSE');
// gear on home
await p.mouse.click(34, 42); await wait(600); await shot('pause_from_home');
await g.close();
console.log(tag, g.errors.slice(0,3));
