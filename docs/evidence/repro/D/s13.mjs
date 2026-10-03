import { openGame, startStage } from '../h.mjs';
const g = await openGame(8804, { width: 915, height: 412 });
const p = g.page;
for (const s of [11, 13, 16, 21, 25]) {
  await startStage(p, s, 300+s);
  await p.evaluate(()=>{ const st=globalThis.__ee.useStore.getState(); st.setGameModal(null); st.setPaused(false); });
  await p.waitForTimeout(500);
  await p.screenshot({ path: `alarm_stage${s}_915x412.png`, clip: { x: 250, y: 0, width: 415, height: 140 } });
}
await g.close();
