import { openGame } from '../h.mjs';
for (const tag of process.argv.slice(2)) {
const [w,h] = tag.split('x').map(Number);
const g = await openGame(8804, { width: w, height: h });
const p = g.page; const wait = (ms)=>p.waitForTimeout(ms);
const shot = async (n) => { await wait(300); await p.screenshot({ path: `${n}_${tag}.png` }); };
const click = async (t) => { try { await p.getByText(t, { exact: true }).first().click({timeout:4000, force:true}); } catch(e) { console.log('CLICK FAIL', t); } await wait(450); };
await p.evaluate(() => { const st = globalThis.__ee.useStore.getState();
  const bs = {}; for (let i=1;i<34;i++) bs[i] = (i%3)+1;
  st.upsertSave({ name: 'Maximilian Alexanders', skin: 'beige', stage: 34, bestStars: bs, updatedAt: Date.now(), tipsSeen: [], coins: 150, coinStars: {}, lastRewardedRun: null, outfits: ['classic','grey'], outfit: 'classic', endlessBest: 512, daily: null });
  st.upsertSave({ name: 'Ann', skin: 'beige', stage: 2, bestStars: {1:1}, updatedAt: 5, tipsSeen: [], coins: 0, coinStars: {}, lastRewardedRun: null, outfits: ['classic','grey'], outfit: 'classic', endlessBest: 0, daily: null });
  st.setTutorialSeen(true); });
await click('CONTINUE'); await shot('continue_list');
await click('Maximilian Alexanders'); await shot('profile');
await click('Ann'); 
await p.evaluate(()=>{}); 
await g.close();
}
