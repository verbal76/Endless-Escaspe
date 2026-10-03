// B-e5: guard navigation robustness. Every 8 s each guard is sent to investigate a random
// point of the yard (as a rock / radio call would). Player parked out of play. We check:
// guard centre ever inside a prop footprint, guard outside the playfield, and guards that make
// no progress (<0.5 m in 8 s while ordered to move).
import { boot, startManual } from './hb.mjs';
const { page, errors, close } = await boot();
const out = [];
for (const stage of [1, 4, 7, 12, 16, 22, 27]) for (const seed of [3, 4, 5]) {
  await startManual(page, stage, seed * 1013);
  const r = await page.evaluate(() => {
    const E = globalThis.__ee; const S = E.scene; const obs = S.procgen.obstacles(); const nav = S.procgen.nav;
    let rs = 12345; const rnd = () => { rs = (rs * 1103515245 + 12345) & 0x7fffffff; return rs / 0x7fffffff; };
    const hits = (o, x, z, r) => {
      if (o.halfW !== undefined) { const dx = x - o.x, dz = z - o.z, c = Math.cos(-o.rotY), s = Math.sin(-o.rotY); const lx = dx * c - dz * s, lz = dx * s + dz * c; const cx = Math.max(-o.halfW, Math.min(o.halfW, lx)), cz = Math.max(-o.halfL, Math.min(o.halfL, lz)); return (lx - cx) ** 2 + (lz - cz) ** 2 < r * r; }
      return (x - o.x) ** 2 + (z - o.z) ** 2 < (o.r + r) ** 2;
    };
    let inside = 0, outside = 0, orders = 0, noProgress = 0, reached = 0; const stuckAt = [];
    const segEnd = S.segmentEndZ;
    for (let round = 0; round < 12; round++) {
      const start = S.guards.map((g) => ({ x: g.x, z: g.z }));
      const goals = S.guards.map((g) => { for (;;) { const x = -8 + rnd() * 16, z = 2 + rnd() * (segEnd - 4); if (Math.hypot(x - g.x, z - g.z) < 30 && nav.isFreeAt(x, z)) return { x, z }; } });
      S.guards.forEach((g, i) => { g.state = 'investigate'; g.behaviorTimer = 0; g.investigationTarget = { ...goals[i] }; g.nav.path = null; });
      let minDist = S.guards.map(() => Infinity);
      for (let f = 0; f < 480; f++) {
        E.player.x = 0; E.player.z = -2; E.input.stance = 'crouch';
        for (const g of S.guards) { g.lastSeen = null; g.lastHeard = null; }
        E.update(1 / 60);
        S.guards.forEach((g, i) => {
          if (Math.abs(g.x) > 9 - 0.5 + 1e-6) outside++;
          for (const o of obs) if (hits(o, g.x, g.z, 0.45)) { inside++; break; }
          minDist[i] = Math.min(minDist[i], Math.hypot(g.x - goals[i].x, g.z - goals[i].z));
        });
        if (E.useStore.getState().runState !== 'playing') break;
      }
      S.guards.forEach((g, i) => { orders++; const moved = Math.hypot(g.x - start[i].x, g.z - start[i].z); if (minDist[i] < 1.5) reached++; else if (moved < 0.5) { noProgress++; stuckAt.push(`g${g.id}@${g.x.toFixed(1)},${g.z.toFixed(1)}->${goals[i].x.toFixed(1)},${goals[i].z.toFixed(1)}`); } });
    }
    return { guards: S.guards.length, orders, reached, noProgress, insidePropFrames: inside, outsideFrames: outside, stuckAt: stuckAt.slice(0, 4), run: E.useStore.getState().runState };
  });
  const line = `stage ${stage} seed ${seed * 1013}: ${JSON.stringify(r)}`; console.log(line); out.push(line);
}
console.log('errors', errors.filter((e) => !/play\(\)/.test(e))); await close();
