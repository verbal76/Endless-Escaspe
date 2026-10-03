// B-e7: fence pinch. Collision is tested at the UNCLAMPED x, then x is clamped to the playfield,
// leaving the player overlapping a prop that pokes past the fence. While overlapping, every move is
// rejected and the push-out is undone by the clamp -> is the player pinned for good?
import { boot, startManual } from './hb.mjs';
const { page, errors, close } = await boot();
for (const [stage, seed] of [[13, 1078], [9, 147], [1, 161], [19, 1176]]) {
  await startManual(page, stage, seed);
  const r = await page.evaluate(() => {
    const E = globalThis.__ee; const S = E.scene; const obs = S.procgen.obstacles(); S.razorWire = false;
    const pen = (x, z) => { let worst = 0, who = null; for (const o of obs) { let d; if (o.halfW !== undefined) { const dx = x - o.x, dz = z - o.z, c = Math.cos(-o.rotY), s = Math.sin(-o.rotY); const lx = dx * c - dz * s, lz = dx * s + dz * c; const cx = Math.max(-o.halfW, Math.min(o.halfW, lx)), cz = Math.max(-o.halfL, Math.min(o.halfL, lz)); d = (cx === lx && cz === lz) ? -1 : Math.hypot(lx - cx, lz - cz); } else d = Math.hypot(x - o.x, z - o.z) - o.r; if (0.45 - d > worst) { worst = 0.45 - d; who = o; } } return { worst, who }; };
    const freeze = () => { for (const g of S.guards) g.stunTimer = 10; for (const d of S.dogs) d.state = 'leash'; };
    // candidate props poking past either fence
    const cands = obs.filter((o) => Math.abs(o.x) + o.r > 8.55 + 0.45 && Math.abs(o.x) < 8.55 + 0.45 + o.r);
    const results = [];
    for (const o of cands) {
      const side = Math.sign(o.x) || 1;
      for (const dirZ of [1, -1]) {
        // approach along the fence from 6 m before/after the prop, sprinting diagonally into the fence
        E.player.x = side * 8.0; E.player.z = o.z - dirZ * (o.r + 3);
        if (pen(E.player.x, E.player.z).worst > 0) continue;
        let pinnedAt = null;
        for (let f = 0; f < 180; f++) { freeze(); E.input.stance = 'walk'; E.input.run = true; E.input.axisX = -side * 0.7; E.input.axisY = dirZ * 0.7; E.update(1 / 60); const p = pen(E.player.x, E.player.z); if (p.worst > 0.005) { pinnedAt = { x: E.player.x, z: E.player.z, pen: p.worst }; break; } }
        if (!pinnedAt) continue;
        // now try to walk out in 8 directions, 1.5 s each, from the pinned spot
        const esc = [];
        for (let k = 0; k < 8; k++) {
          E.player.x = pinnedAt.x; E.player.z = pinnedAt.z; const a = k * Math.PI / 4;
          for (let f = 0; f < 90; f++) { freeze(); E.input.run = k % 2 === 0; E.input.axisX = Math.cos(a); E.input.axisY = Math.sin(a); E.update(1 / 60); }
          esc.push(+Math.hypot(E.player.x - pinnedAt.x, E.player.z - pinnedAt.z).toFixed(2));
        }
        results.push({ prop: `${o.kind} @${o.x.toFixed(2)},${o.z.toFixed(2)} rot=${(o.rotY ?? 0).toFixed(2)}`, pinnedAt: `${pinnedAt.x.toFixed(2)},${pinnedAt.z.toFixed(2)} pen=${pinnedAt.pen.toFixed(3)}`, movedPerDirection: esc.join(' '), stuck: esc.every((m) => m < 0.05) });
      }
    }
    return { candidates: cands.length, results };
  });
  console.log(`stage ${stage} seed ${seed}: candidates=${r.candidates}`); for (const x of r.results) console.log('  ' + JSON.stringify(x));
}
console.log('errors', errors.filter((e) => !/play\(\)/.test(e))); await close();
