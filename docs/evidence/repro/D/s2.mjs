import { openGame, startStage } from '../h.mjs';
const sizes = [[915,412],[851,393],[800,360],[740,360],[640,360],[1280,800]];
const only = process.argv[2];
for (const [w,h] of sizes) {
  if (only && !only.split(',').includes(String(w))) continue;
  const g = await openGame(8804, { width: w, height: h });
  const p = g.page;
  // busy campaign: stage 12 (cameras, stamina), full inventory, alarm, toast
  await startStage(p, 12, 4242);
  await p.evaluate(() => { const st = globalThis.__ee.useStore.getState();
    st.setInventory({crowbar:2, smokebomb:1, rock:3}); st.setAlarmLevel(0.7); st.setStamina(0.4);
    st.grantBossPerk?.(); st.setHearts(3);
    st.showToast('Camera! Get behind cover. A full alarm brings guards.', 'tip'); st.setCrowbarInRange(true); });
  await p.waitForTimeout(700);
  await p.screenshot({ path: `play_busy_${w}x${h}.png` });
  // boss stage 10
  await startStage(p, 10, 777);
  await p.evaluate(() => { const st = globalThis.__ee.useStore.getState(); st.setGameModal(null);
    st.setBossTimeRemaining(8); st.setAlarmLevel(1); st.setInventory({crowbar:1, smokebomb:0, rock:1});
    st.showToast('ALARM! A guard has been dispatched', 'warn'); });
  await p.waitForTimeout(600);
  await p.screenshot({ path: `play_boss_${w}x${h}.png` });
  // endless lvl 12
  await p.evaluate(async () => { const st = globalThis.__ee.useStore.getState(); st.setGameMode('daily','2026-10-02'); st.startRun(); st.resetForSegment(1234); await new Promise(r=>setTimeout(r,400)); const s=globalThis.__ee.useStore.getState(); s.setGameModal(null); s.setPaused(false); s.setDistance(1432, 12); s.setAlarmLevel(0.5); s.showToast('Guards now radio each other when one spots you.', 'tip'); });
  await p.waitForTimeout(600);
  await p.screenshot({ path: `play_daily_${w}x${h}.png` });
  console.log(w, g.errors.slice(0,3));
  await g.close();
}
