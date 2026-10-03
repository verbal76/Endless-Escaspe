// B-e8: guard-blind scripted bots across the campaign: follow an A* path to the win line.
//  sprint : RUN whenever stamina allows; crouch: crouch-walk the whole way.
// Reports per stage: win / fail, sim time, hearts lost, catch causes, stars.
import { boot, startManual } from './hb.mjs';
const { page, errors, close } = await boot();
const stages = (process.env.STAGES ?? '1,2,3,4,5,6,7,8,9,11,12,13,14,15,16,17,18,19,21,22,23,24,25,26,27,28,29').split(',').map(Number);
const seeds = (process.env.SEEDS ?? '501,502,503').split(',').map(Number);
const strategies = (process.env.STRATS ?? 'sprint,crouch').split(',');
for (const strat of strategies) for (const stage of stages) for (const seed of seeds) {
  await startManual(page, stage, seed);
  const r = await page.evaluate(({ strat }) => {
    const E = globalThis.__ee; const S = E.scene; const nav = S.procgen.nav;
    const st0 = E.useStore.getState(); const h0 = st0.hearts; let lastC = st0.catchCounter; const causes = [];
    let path = null, idx = 0, repath = 0;
    const MAXF = 60 * 300;
    let f = 0;
    for (; f < MAXF; f++) {
      const st = E.useStore.getState();
      if (st.runState !== 'playing') break;
      if (st.catchCounter !== lastC) { lastC = st.catchCounter; causes.push(`${(f / 60).toFixed(0)}s:${st.lastDeathCause}@z${E.player.z.toFixed(0)}`); path = null; }
      if (--repath <= 0 || !path) {
        repath = 15;
        path = nav.findPath(E.player.x, E.player.z, 0, S.segmentEndZ + 0.5, 30000, 40) || [{ x: E.player.x, z: S.segmentEndZ + 1 }];
        path.push({ x: path[path.length - 1].x, z: S.segmentEndZ + 2 }); idx = 0;
      }
      while (idx < path.length - 1 && Math.hypot(path[idx].x - E.player.x, path[idx].z - E.player.z) < 0.4) idx++;
      const w = path[idx]; let dx = w.x - E.player.x, dz = w.z - E.player.z; const d = Math.hypot(dx, dz) || 1;
      E.input.axisX = -dx / d; E.input.axisY = dz / d; // joystick X is mirrored (PlayerController)
      if (strat === 'sprint') { E.input.stance = 'walk'; E.input.run = !E.player.exhausted; }
      else { E.input.stance = 'crouch'; E.input.run = false; }
      E.update(1 / 60);
    }
    const st = E.useStore.getState();
    return { res: st.runState === 'cleared' ? 'WIN' : st.runState === 'caught' ? 'DEAD' : 'TIMEOUT', t: Math.round(f / 60), h0, lost: causes.length, causes: causes.join(' '), stars: st.lastStats?.stars ?? null, seen: st.lastStats?.timesSeen ?? null, det: st.lastStats ? +st.lastStats.timeDetected.toFixed(1) : null, z: +E.player.z.toFixed(0), segEnd: S.segmentEndZ };
  }, { strat });
  console.log(`${strat.padEnd(6)} stage ${String(stage).padStart(2)} seed ${seed}: ${r.res.padEnd(7)} t=${r.t}s hearts=${r.h0} lost=${r.lost} stars=${r.stars} seen=${r.seen} det=${r.det}s z=${r.z}/${r.segEnd} ${r.causes}`);
}
console.log('errors', errors.filter((e) => !/play\(\)/.test(e))); await close();
