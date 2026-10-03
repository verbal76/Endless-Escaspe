import { boot, startManual } from './hb.mjs';
const { page, errors, close } = await boot();
await startManual(page, 8, 4242);
const r = await page.evaluate(() => {
  const E = globalThis.__ee; const st = E.useStore.getState();
  const z0 = E.player.z; E.input.axisY = 1;
  for (let i = 0; i < 60; i++) E.update(1 / 60);
  return { runState: E.useStore.getState().runState, paused: E.useStore.getState().paused, z0, z1: E.player.z, guards: E.scene.guards.length, towers: E.scene.lightTowers.length, keys: Object.keys(E) };
});
console.log(JSON.stringify(r)); console.log('errors', errors);
await close();
