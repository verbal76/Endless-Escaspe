import { openGame } from '../h.mjs';
const g = await openGame(8804, { width: 915, height: 412 });
const p = g.page; const wait = (ms)=>p.waitForTimeout(ms);
const click = async (t) => { try { await p.getByText(t, { exact: true }).first().click({timeout:4000, force:true}); } catch(e) { console.log('CLICK FAIL', t); } await wait(450); };
await p.mouse.click(34, 42); await wait(700);
await click('RESTART'); await wait(1200);
console.log(await p.evaluate(()=>{const s=globalThis.__ee.useStore.getState(); return {rs:s.runState, save:s.activeSaveName, stage:s.stage, name:s.playerName};}));
await p.screenshot({path:'restart_from_home_915x412.png'});
// win -> banner
await p.evaluate(async ()=>{ globalThis.__ee.handleWin(); await new Promise(r=>setTimeout(r,1500)); });
await p.screenshot({path:'anon_cleared_915x412.png'});
console.log(await p.evaluate(()=>{const s=globalThis.__ee.useStore.getState(); return {rs:s.runState, saves:Object.keys(s.saves), sum:s.runSummary};}));
await g.close();
