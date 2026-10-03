import { boot, startManual } from './hb.mjs';
const { page, close } = await boot();
await startManual(page, 1, 503);
const r = await page.evaluate(() => {
  const E = globalThis.__ee; const S = E.scene; const nav = S.procgen.nav; const log = [];
  let path = null, idx = 0, repath = 0;
  for (let f = 0; f < 60 * 40; f++) {
    for (const g of S.guards) g.stunTimer = 5;
    if (--repath <= 0 || !path) { repath = 15; path = nav.findPath(E.player.x, E.player.z, 0, S.segmentEndZ + 0.5, 30000, 40) || [{ x: E.player.x, z: S.segmentEndZ + 1 }]; path.push({ x: path[path.length - 1].x, z: S.segmentEndZ + 2 }); idx = 0; }
    while (idx < path.length - 1 && Math.hypot(path[idx].x - E.player.x, path[idx].z - E.player.z) < 0.4) idx++;
    const w = path[idx]; const dx = w.x - E.player.x, dz = w.z - E.player.z, d = Math.hypot(dx, dz) || 1;
    E.input.axisX = -dx / d; E.input.axisY = dz / d; E.input.stance = 'crouch';
    E.update(1 / 60);
    if (f % 240 === 0) log.push(`t=${f / 60} p=${E.player.x.toFixed(2)},${E.player.z.toFixed(2)} wp=${w.x.toFixed(2)},${w.z.toFixed(2)} pathLen=${path.length} last=${path[path.length - 2].x.toFixed(1)},${path[path.length - 2].z.toFixed(1)}`);
  }
  const near = S.procgen.obstacles().filter((o) => Math.abs(o.z - E.player.z) < 5).map((o) => `${o.kind}@${o.x.toFixed(2)},${o.z.toFixed(2)} r=${o.r.toFixed(2)} hw=${o.halfW} hl=${o.halfL} rot=${(o.rotY ?? 0).toFixed(2)}`);
  return { log, near };
});
console.log(r.log.join('\n')); console.log(r.near.join('\n')); await close();
