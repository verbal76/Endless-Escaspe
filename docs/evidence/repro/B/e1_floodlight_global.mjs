// B-e1: a floodlight / searchlight on the player feeds EVERY guard's meter (no distance or
// sight gate). Guards that never perceived the player go 'investigate' with no target.
import { boot, startManual } from './hb.mjs';
const { page, errors, close } = await boot();
for (const stage of [3, 8, 14]) {
  console.log(JSON.stringify(await startManual(page, stage, 777)));
  const r = await page.evaluate(() => {
    const E = globalThis.__ee; const S = E.scene;
    const t = S.lightTowers.reduce((a, b) => (Math.abs(b.z - 1) < Math.abs(a.z - 1) ? b : a));
    const px = t.x > 0 ? t.x - 4.6 : t.x + 4.6, pz = t.z;
    const start = S.guards.map((g) => ({ x: g.x, z: g.z }));
    const log = [];
    for (let f = 1; f <= 60 * 8; f++) {
      E.player.x = px; E.player.z = pz; E.input.axisX = 0; E.input.axisY = 0;
      if (t.state === 'scan') t.scanAngle = Math.atan2(px - t.x, pz - t.z); // hold the scanning beam on the player
      E.update(1 / 60);
      if (f % 120 === 0) {
        const det = E.useStore.getState().detection;
        log.push(`t=${f / 60}s tower=${t.state} ` + S.guards.map((g) => `[g${g.id} ${g.state} det=${(det[g.id] ?? 0).toFixed(2)} dist=${Math.hypot(g.x - px, g.z - pz).toFixed(0)}m target=${g.investigationTarget ? 'set' : 'null'} everSeen=${g.lastSeen ? 'y' : 'n'}]`).join(' '));
      }
    }
    const moved = S.guards.map((g, i) => +Math.hypot(g.x - start[i].x, g.z - start[i].z).toFixed(1));
    return { log, movedDuring8sLit: moved, run: E.useStore.getState().runState };
  });
  console.log(r.log.join('\n')); console.log('moved during 8 s:', JSON.stringify(r.movedDuring8sLit), r.run);
}
console.log('errors', errors);
await close();
