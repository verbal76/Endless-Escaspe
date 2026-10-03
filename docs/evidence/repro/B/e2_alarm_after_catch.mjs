// B-e2: the camera yard alarm (and its +25% vision boost) survives a soft respawn after a catch,
// although the guards' meters / memory are wiped.
import { boot, startManual } from './hb.mjs';
const { page, errors, close } = await boot();
console.log(JSON.stringify(await startManual(page, 16, 4242)));
const r = await page.evaluate(() => {
  const E = globalThis.__ee; const S = E.scene;
  const cam = S.cameras[0];
  const px = cam.x + Math.sin(cam.facing) * 3, pz = cam.z + Math.cos(cam.facing) * 3;
  let f = 0;
  for (; f < 60 * 40 && E.useStore.getState().alarmLevel < 1; f++) { for (const g of S.guards) g.stunTimer = 50; E.player.x = px; E.player.z = pz; E.update(1 / 60); }
  for (const g of S.guards) g.stunTimer = 0;
  const before = { alarm: E.useStore.getState().alarmLevel, secs: f / 60, guards: S.guards.length, states: S.guards.map((g) => g.state).join(',') };
  E.handleCatch('arrested');
  for (let i = 0; i < 20; i++) E.update(1 / 60); // hit-stop resolves -> soft respawn
  const after = { hearts: E.useStore.getState().hearts, player: [E.player.x, E.player.z], alarm: E.useStore.getState().alarmLevel, guards: S.guards.length, states: S.guards.map((g) => g.state).join(','), dets: Object.values(E.useStore.getState().detection).map((v) => +v.toFixed(2)).join(',') };
  let t = 0; for (; t < 60 * 60 && E.useStore.getState().alarmLevel >= 1; t++) { E.player.x = 0; E.player.z = 1; E.update(1 / 60); }
  return { before, after, secondsAlarmStillFullAfterRespawn: +(t / 60).toFixed(1) };
});
console.log(JSON.stringify(r, null, 1)); console.log('errors', errors); await close();
