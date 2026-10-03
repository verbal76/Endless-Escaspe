import { openGame } from '../h.mjs';
for (const tag of ['640x360','1280x800']) {
const [w,h] = tag.split('x').map(Number);
const g = await openGame(8804, { width: w, height: h });
const p = g.page;
await p.evaluate(()=>globalThis.__ee.useStore.getState().setShowTutorial(true));
await p.waitForTimeout(19500);
await p.screenshot({path:`tut_beat5_${tag}.png`});
await g.close();
}
