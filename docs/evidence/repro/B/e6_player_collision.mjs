// B-e6: random-walk + wall-hugging bot (guards stunned, razor wire off) - does the player ever end a
// frame overlapping a prop, leave the playfield, or get permanently pinned?
import { boot, startManual } from './hb.mjs';
const { page, errors, close } = await boot();
for (const stage of [1, 9, 13, 19, 26]) for (const seed of [21, 22, 23, 24]) {
  await startManual(page, stage, seed * 7);
  const r = await page.evaluate(() => {
    const E = globalThis.__ee; const S = E.scene; const obs = S.procgen.obstacles(); S.razorWire = false;
    let rs = 99; const rnd = () => { rs = (rs * 1103515245 + 12345) & 0x7fffffff; return rs / 0x7fffffff; };
    const pen = (x, z) => { let worst = 0; for (const o of obs) { let d; if (o.halfW !== undefined) { const dx = x - o.x, dz = z - o.z, c = Math.cos(-o.rotY), s = Math.sin(-o.rotY); const lx = dx * c - dz * s, lz = dx * s + dz * c; const cx = Math.max(-o.halfW, Math.min(o.halfW, lx)), cz = Math.max(-o.halfL, Math.min(o.halfL, lz)); const inside = cx === lx && cz === lz; d = inside ? -Math.min(o.halfW - Math.abs(lx), o.halfL - Math.abs(lz)) : Math.hypot(lx - cx, lz - cz); } else d = Math.hypot(x - o.x, z - o.z) - o.r; worst = Math.max(worst, 0.45 - d); } return worst; };
    let maxPen = 0, penFrames = 0, oob = 0, frames = 0, pinned = 0; let maxZ = 0; const worstAt = [];
    let ax = 0, ay = 1, hold = 0; let lastX = 0, lastZ = 0, still = 0;
    for (let f = 0; f < 60 * 150; f++) {
      for (const g of S.guards) g.stunTimer = 10; for (const d of S.dogs) d.state = 'leash';
      if (--hold <= 0) { hold = 10 + (rnd() * 90) | 0; const m = rnd(); if (m < 0.25) { ax = rnd() < 0.5 ? -1 : 1; ay = 0.2; } else { const a = rnd() * Math.PI * 2; ax = Math.cos(a); ay = Math.sin(a) * 0.8 + 0.3; } E.input.run = rnd() < 0.4; E.input.stance = rnd() < 0.3 ? 'crouch' : 'walk'; }
      E.input.axisX = ax; E.input.axisY = Math.max(-1, Math.min(1, ay));
      E.update(1 / 60); frames++;
      if (E.useStore.getState().runState !== 'playing') { const st = E.useStore.getState(); if (st.runState === 'cleared') { break; } }
      const p = pen(E.player.x, E.player.z); if (p > 0.01) { penFrames++; if (p > maxPen) { maxPen = p; worstAt.push(`${E.player.x.toFixed(2)},${E.player.z.toFixed(2)} pen=${p.toFixed(3)}`); } }
      if (Math.abs(E.player.x) > 8.55 + 1e-6) oob++;
      maxZ = Math.max(maxZ, E.player.z);
    }
    return { frames, penFrames, maxPen: +maxPen.toFixed(3), oob, maxZ: +maxZ.toFixed(1), segEnd: S.segmentEndZ, end: E.useStore.getState().runState, worst: worstAt.slice(-2) };
  });
  console.log(`stage ${stage} seed ${seed * 7}: ${JSON.stringify(r)}`);
}
console.log('errors', errors.filter((e) => !/play\(\)/.test(e))); await close();
