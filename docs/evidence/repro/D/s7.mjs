import { openGame, startStage } from '../h.mjs';
const [w,h] = (process.argv[2]||'915x412').split('x').map(Number);
const tag = `${w}x${h}`;
const g = await openGame(8804, { width: w, height: h });
const p = g.page; const wait = (ms)=>p.waitForTimeout(ms);
const shot = async (n) => { await p.screenshot({ path: `${n}_${tag}.png` }); };
await p.evaluate(() => { const st = globalThis.__ee.useStore.getState();
  st.upsertSave({ name: 'Kev', skin: 'beige', stage: 4, bestStars: {1:3,2:2,3:1}, updatedAt: Date.now(), tipsSeen: ['stage1','crouch','floodlight','fork','crowbar','smokebomb','rock','stage5','stage6','searchlight','dogs','perk','cameras','stage12','razor','hearts1','aimed','endless','daily'], coins: 40, coinStars: {}, lastRewardedRun: null, outfits: ['classic','grey'], outfit: 'classic', endlessBest: 300, daily: null });
  st.setActiveSave('kev'); st.setTutorialSeen(true); });
await startStage(p, 4, 99);
// catch flash mid-run (soft)
await p.evaluate(()=>globalThis.__ee.handleCatch('arrested')); await wait(350); await shot('catchflash');
await wait(1200);
await p.evaluate(()=>globalThis.__ee.handleWin()); await wait(1400); await shot('banner_cleared');
// final death arrested
await startStage(p, 4, 100);
await p.evaluate(async ()=>{ const E=globalThis.__ee; for(let i=0;i<3;i++){ E.handleCatch('arrested'); await new Promise(r=>setTimeout(r,450)); } });
await wait(1400); await shot('banner_arrested');
await startStage(p, 4, 101);
await p.evaluate(async ()=>{ const E=globalThis.__ee; for(let i=0;i<3;i++){ E.handleCatch('killed'); await new Promise(r=>setTimeout(r,450)); } });
await wait(1400); await shot('banner_killed');
// daily over
await p.evaluate(async () => { const st = globalThis.__ee.useStore.getState(); st.setGameMode('daily','2026-10-02'); st.startRun(); st.resetForSegment(1234); await new Promise(r=>setTimeout(r,400)); const s=globalThis.__ee.useStore.getState(); s.setGameModal(null); s.setPaused(false);
  const E=globalThis.__ee; for(let i=0;i<3;i++){ E.handleCatch('arrested'); await new Promise(r=>setTimeout(r,450)); } });
await wait(1400); await shot('banner_daily');
// boss round modal
await p.evaluate(async () => { const st = globalThis.__ee.useStore.getState(); st.setGameMode('campaign'); st.setStage(9); st.startRun(); st.resetForSegment(5); await new Promise(r=>setTimeout(r,400)); globalThis.__ee.useStore.getState().setGameModal(null); globalThis.__ee.handleWin(); await new Promise(r=>setTimeout(r,500)); globalThis.__ee.useStore.getState().resetForSegment(6); });
await wait(1200); await shot('boss_modal');
console.log(tag, g.errors.slice(0,3));
await g.close();
