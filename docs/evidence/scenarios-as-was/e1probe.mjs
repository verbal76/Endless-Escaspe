import { openGame } from './harness.mjs';
const { page, errors, close } = await openGame();
const r = await page.evaluate(async () => {
  const E = globalThis.__ee; const st = E.useStore.getState();
  st.setGameMode('endless'); st.startRun(); st.resetForSegment(777001);
  await new Promise((r) => setTimeout(r, 500));
  const out = [];
  for (let i = 0; i < 40; i++) {
    for (const g of E.scene.guards) g.stunTimer = 5;
    for (const d of E.scene.dogs) { d.state = 'flee'; d.stateTimer = 5; }
    E.player.x = 0; E.player.z += 60;
    for (let k = 0; k < 20; k++) E.update(1 / 60);
    const p = E.scene.procgen; const ch = p.chunks.filter((c) => !c.isHorizon);
    out.push({ z: Math.round(E.player.z), sec: E.scene.sections.length, chunks: ch.length, behind: Math.round(E.player.z - ch[0].startZ), ahead: Math.round(ch[ch.length - 1].endZ - E.player.z), obs: p.obstacles().length, perChunk: +(p.obstacles().length / ch.length).toFixed(1), lvl: E.useStore.getState().endlessLevel });
  }
  return out;
});
for (const s of r) console.log(JSON.stringify(s));
console.log(errors.filter((e) => !e.includes('404')));
await close();
