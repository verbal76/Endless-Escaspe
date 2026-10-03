import { openGame, startStage } from '../h.mjs';
const { page, errors, close } = await openGame(8801);
await startStage(page, 3, 6001);
console.log(JSON.stringify(await page.evaluate(async () => {
  const E = globalThis.__ee; const st = E.useStore.getState();
  const p = E.scene.procgen.pickups()[0];
  const r = { runState: st.runState, paused: st.paused, modal: !!st.gameModal, p: p && { x: p.x, z: p.z, c: p.collected }, keys: Object.keys(E) };
  E.player.x = p.x; E.player.z = p.z;
  await new Promise((res) => setTimeout(res, 300));
  r.after = { px: E.player.x, pz: E.player.z, c: p.collected, inv: E.useStore.getState().inventory, hearts: E.useStore.getState().hearts };
  return r;
})));
await close();
