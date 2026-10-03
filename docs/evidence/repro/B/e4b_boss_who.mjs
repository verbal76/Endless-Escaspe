// B-e4b: who arrests a motionless player in the boss arena within ~5 s?
import { boot, startManual } from './hb.mjs';
const { page, errors, close } = await boot();
for (const [stage, seed, stance] of [[10, 11, 'crouch'], [10, 12, 'walk'], [20, 12, 'crouch'], [30, 12, 'crouch'], [9, 11, 'crouch']]) {
  const info = await startManual(page, stage, seed);
  const r = await page.evaluate(({ stance }) => {
    const E = globalThis.__ee; const S = E.scene; let last = E.useStore.getState().catchCounter; const log = [];
    const origCatch = E.handleCatch;
    for (let f = 0; f < 60 * 20; f++) {
      E.input.stance = stance; E.input.axisX = 0; E.input.axisY = 0;
      const snap = () => ({ t: (f / 60).toFixed(2), p: [E.player.x.toFixed(2), E.player.z.toFixed(2)], guards: S.guards.map((g) => `g${g.id}${g.state}@${g.x.toFixed(1)},${g.z.toFixed(1)} d=${Math.hypot(g.x - E.player.x, g.z - E.player.z).toFixed(2)} det=${(E.useStore.getState().detection[g.id] ?? 0).toFixed(2)}`), dogs: S.dogs.map((d) => `dog ${d.state}@${d.x.toFixed(1)},${d.z.toFixed(1)} d=${Math.hypot(d.x - E.player.x, d.z - E.player.z).toFixed(2)}`) });
      const pre = snap();
      E.update(1 / 60);
      const st = E.useStore.getState();
      if (f === 60) log.push({ at1s: pre });
      if (st.catchCounter !== last) { last = st.catchCounter; log.push({ caught: st.lastDeathCause, pre }); break; }
    }
    return { isArena: S.isBossArena, nGuards: S.guards.length, nDogs: S.dogs.length, cams: S.cameras.length, log };
  }, { stance });
  console.log(`stage ${stage} seed ${seed} ${stance}`, JSON.stringify(r, null, 1));
}
console.log('errors', errors); await close();
