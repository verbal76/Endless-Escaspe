import { boot, startManual } from './hb.mjs';
const { page, errors, close } = await boot();
for (const [stage, seed, pos] of [[10, 97, [8.4, -2]], [20, 970, [-8.4, -2]]]) {
  await startManual(page, stage, seed);
  const r = await page.evaluate(({ pos }) => {
    const E = globalThis.__ee; let last = E.useStore.getState().catchCounter; const log = [];
    E.player.x = pos[0]; E.player.z = pos[1];
    for (let f = 0; f < 60 * 66; f++) {
      E.input.stance = 'crouch'; E.input.axisX = 0; E.input.axisY = 0;
      E.update(1 / 60);
      const st = E.useStore.getState();
      if (f % 300 === 0 || f > 60 * 59) { if (f % 30 === 0) log.push(`t=${(f / 60).toFixed(1)} run=${st.runState} paused=${st.paused} modal=${st.gameModal?.title ?? null} boss=${st.bossTimeRemaining} hearts=${st.hearts} catches=${st.catchCounter - last} p=${E.player.x.toFixed(2)},${E.player.z.toFixed(2)} restart=${st.restartCounter}`); }
      if (st.runState === 'cleared') { log.push('CLEARED at ' + (f / 60).toFixed(2)); break; }
    }
    return log;
  }, { pos });
  console.log(`--- stage ${stage} seed ${seed}`); console.log(r.join('\n'));
}
await close();
