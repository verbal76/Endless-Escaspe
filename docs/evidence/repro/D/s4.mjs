import { openGame } from '../h.mjs';
const g = await openGame(8804, { width: 915, height: 412 });
const p = g.page; const wait = (ms)=>p.waitForTimeout(ms);
const shot = async (n) => { await p.screenshot({ path: `${n}.png` }); };
const click = async (t) => { try { await p.getByText(t, { exact: true }).first().click({timeout:4000, force:true}); } catch(e) { console.log('CLICK FAIL', t); } await wait(450); };
const key = async (c) => { await p.getByText(c,{exact:true}).last().click({timeout:3000, force:true}); };
await click('NEW RUN');
for (const c of 'KEV') await key(c);
await click('START');
await click('SKIP');
await wait(800);
console.log(await p.evaluate(()=>globalThis.__ee.useStore.getState().runState));
await p.mouse.click(34, 42); await wait(700); await shot('flow_pause_ingame_915x412');
await click('MAIN MENU'); await wait(600); await shot('flow_mainmenu_after_firstrun_915x412');
console.log(await p.evaluate(()=>globalThis.__ee.useStore.getState().runState));
// Now press SKIP on the stale prompt
await click('SKIP'); await wait(600);
console.log('after stale SKIP', await p.evaluate(()=>{const s=globalThis.__ee.useStore.getState(); return [s.runState, s.stage, s.activeSaveName];}));
await p.mouse.click(34, 42); await wait(700); await click('MAIN MENU'); await wait(600);
await shot('flow_mainmenu_again_915x412');
// second new run when tutorialSeen: name -> START -> run -> main menu
await p.evaluate(()=>{ const st=globalThis.__ee.useStore.getState(); st.setPendingStartMode('home'); });
await wait(400);
await click('NEW RUN'); for (const c of 'ZED') await key(c); await click('START'); await wait(600);
console.log('2nd', await p.evaluate(()=>globalThis.__ee.useStore.getState().runState));
await p.mouse.click(34, 42); await wait(700); await click('MAIN MENU'); await wait(600);
await shot('flow_mainmenu_after_namestart_915x412');
await g.close();
