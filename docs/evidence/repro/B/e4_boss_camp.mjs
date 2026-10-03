// B-e4: boss arena (survive 60 s) - does sitting motionless & crouched in a back corner survive?
import { boot, startManual } from './hb.mjs';
const { page, errors, close } = await boot();
const spots = { spawn: [0, 1], backCorner: [-8.4, -2], backCornerR: [8.4, -2] };
const tally = {};
for (const stage of [10, 20, 30]) for (let seed = 1; seed <= 10; seed++) for (const [name, pos] of Object.entries(spots)) {
  await startManual(page, stage, seed * 97);
  const r = await page.evaluate(({ pos }) => {
    const E = globalThis.__ee; let last = E.useStore.getState().catchCounter;
    E.player.x = pos[0]; E.player.z = pos[1];
    for (let f = 0; f < 60 * 61; f++) {
      E.input.stance = 'crouch'; E.input.axisX = 0; E.input.axisY = 0;
      E.update(1 / 60);
      const st = E.useStore.getState();
      if (st.runState === 'cleared') return { ok: true, t: f / 60 };
      if (st.catchCounter !== last) return { ok: false, t: +(f / 60).toFixed(1), cause: st.lastDeathCause };
    }
    return { ok: false, t: 61, cause: 'timeout?' };
  }, { pos });
  const k = `stage ${stage} ${name}`; tally[k] = tally[k] || { survived: 0, n: 0, firstCatch: [] };
  tally[k].n++; if (r.ok) tally[k].survived++; else tally[k].firstCatch.push(r.t);
}
for (const [k, v] of Object.entries(tally)) console.log(`${k.padEnd(24)} survived 60 s motionless: ${v.survived}/${v.n}  first-catch times: ${v.firstCatch.join(',')}`);
console.log('errors', errors.filter((e) => !/play\(\)/.test(e))); await close();
