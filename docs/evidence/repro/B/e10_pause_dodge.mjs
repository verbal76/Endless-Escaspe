// B-e10: pausing deletes bullets in flight and zeroes every guard's aim wind-up.
// A guard with a clear look at a standing player (meter pinned high) - control vs. "tap pause every 0.5 s".
import { boot, startManual } from './hb.mjs';
const { page, errors, close } = await boot();
for (const variant of ['control', 'pauseTap', 'pauseWhenBulletFlies']) {
  await startManual(page, 3, 101);
  const r = await page.evaluate(({ variant }) => {
    const E = globalThis.__ee; const S = E.scene; const st = () => E.useStore.getState();
    const arr = S.procgen.obstacles(); arr.length = 0; // open ground
    const g = S.guards[0]; const others = S.guards.slice(1);
    const h0 = st().hearts; let shots = 0, bulletsDeleted = 0, pauses = 0; let lastCount = 0;
    for (let f = 0; f < 60 * 20; f++) {
      for (const o of others) { o.x = 8; o.z = 100; o.stunTimer = 5; }
      E.player.x = 0; E.player.z = 30; g.x = 0; g.z = 25; if (g.aimTimer <= 0) g.facing = Math.PI / 2;
      E.input.axisX = 0; E.input.axisY = 0; E.input.stance = 'walk';
      if (variant === 'pauseTap' && f % 30 === 29) { st().setPaused(true); E.update(1 / 60); st().setPaused(false); pauses++; }
      if (variant === 'pauseWhenBulletFlies' && E.projectiles.count() > 0) { const n = E.projectiles.count(); st().setPaused(true); E.update(1 / 60); st().setPaused(false); pauses++; bulletsDeleted += n - E.projectiles.count(); }
      const before = E.projectiles.count();
      E.update(1 / 60);
      if (E.projectiles.count() > before) shots++;
      if (st().hearts < h0 || st().runState !== 'playing') break;
    }
    return { variant, heartsLost: h0 - st().hearts, shotsFired: shots, bulletsDeletedByPause: bulletsDeleted, pauses, simSeconds: 20 };
  }, { variant });
  console.log(JSON.stringify(r));
}
console.log('errors', errors.filter((e) => !/play\(\)/.test(e))); await close();
