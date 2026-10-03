// B-e12: is update(dt) step-size independent? Same scenario at dt = 1/30, 1/60, 1/120 and with a
// 0.1 s spike every second (what Loop.ts would never pass, but update() accepts).
import { boot, startManual } from './hb.mjs';
const { page, errors, close } = await boot();
let k = 0;
for (const [label, dts] of [['30fps', [1 / 30]], ['60fps', [1 / 60]], ['120fps', [1 / 120]], ['60+spikes', [...Array(59).fill(1 / 60), 0.1]]]) {
  await startManual(page, 6, 2024 + (k++));
  await page.evaluate(() => { const S = globalThis.__ee.scene; for (const g of S.guards) { g.state = 'wander'; g.lastSeen = null; g.lastHeard = null; g.sinceSeen = 999; g.aimTimer = 0; g.fireCooldown = 0; } });
  const r = await page.evaluate(({ dts }) => {
    const E = globalThis.__ee; const S = E.scene; const st = () => E.useStore.getState();
    S.procgen.obstacles().length = 0;
    const g = S.guards[0]; const h0 = st().hearts;
    let t = 0, i = 0, tInv = null, tChase = null, tAim = null, tShot = null; const n0 = E.projectiles.count();
    while (t < 12) {
      const dt = dts[i++ % dts.length];
      for (const o of S.guards.slice(1)) { o.x = 8; o.z = 150; o.stunTimer = 5; }
      E.player.x = 0; E.player.z = 30; g.x = 0; g.z = 24; if (g.aimTimer <= 0) g.facing = Math.PI / 2; E.input.stance = 'crouch';
      const before = E.projectiles.count();
      E.update(dt); t += dt;
      if (tInv === null && g.state === 'investigate') tInv = t;
      if (tChase === null && g.state === 'chase') tChase = t;
      if (tAim === null && g.aimTimer > 0) tAim = t;
      if (tShot === null && E.projectiles.count() > before) tShot = t;
      if (tShot !== null) break;
    }
    const f = (v) => (v === null ? null : +v.toFixed(3));
    return { investigate: f(tInv), chase: f(tChase), aimStart: f(tAim), firstShot: f(tShot) };
  }, { dts });
  console.log(label.padEnd(10), JSON.stringify(r));
}
console.log('errors', errors.filter((e) => !/play\(\)/.test(e))); await close();
