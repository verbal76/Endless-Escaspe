import { boot, startManual } from './hb.mjs';
const { page, errors, close } = await boot();
for (const [stage, seed, pos] of [[20, 12, [0, -2]], [10, 11, [-8.55, -2]], [20, 12, [-8.55, -2]]]) {
  await startManual(page, stage, seed);
  const r = await page.evaluate(({ pos }) => {
    const E = globalThis.__ee; const S = E.scene; let last = E.useStore.getState().catchCounter; const log = [];
    E.player.x = pos[0]; E.player.z = pos[1];
    for (let f = 0; f < 60 * 20; f++) {
      E.input.stance = 'crouch'; E.input.axisX = 0; E.input.axisY = 0;
      const pre = { t: (f / 60).toFixed(2), paused: E.useStore.getState().paused, modal: !!E.useStore.getState().gameModal, p: [E.player.x.toFixed(2), E.player.z.toFixed(2)], near: S.guards.map((g) => [g.id, g.state, +Math.hypot(g.x - E.player.x, g.z - E.player.z).toFixed(2)]).sort((a, b) => a[2] - b[2]).slice(0, 2), dogs: S.dogs.map((d) => [d.state, +Math.hypot(d.x - E.player.x, d.z - E.player.z).toFixed(2)]) };
      if (f % 60 === 0) log.push(JSON.stringify(pre));
      E.update(1 / 60);
      const st = E.useStore.getState();
      if (st.catchCounter !== last) { log.push('CAUGHT ' + st.lastDeathCause + ' ' + JSON.stringify(pre)); break; }
    }
    return log;
  }, { pos });
  console.log(`--- stage ${stage} seed ${seed} pos ${pos}`); console.log(r.join('\n'));
}
await close();
