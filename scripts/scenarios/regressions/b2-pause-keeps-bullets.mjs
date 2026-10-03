// B-2: pausing used to delete bullets in flight and cancel every guard's aim
// wind-up, so tapping pause made the player immune to gunfire. Fixed: pause
// leaves the simulation untouched.
const J = JSON.stringify;
export default [{
  id: 'b2-pause-keeps-bullets',
  title: 'B-2 pause keeps bullets in flight and the aim wind-up',
  tags: ['combat', 'ui'],
  async run({ page, check, start }) {
    await start({ stage: 3, seed: 101 });
    const r = await page.evaluate(() => {
      const E = globalThis.__ee, H = globalThis.__h; const S = E.scene; const st = () => E.useStore.getState();
      S.procgen.obstacles().length = 0; // open ground
      const g = S.guards[0];
      const pin = H.hold({ player: [0, 30], guard: [0, 25], parkOthers: true });
      const pauseOnce = () => { st().setPaused(true); E.update(1 / 60); st().setPaused(false); };
      // (a) pause during the aim wind-up
      H.run(60 * 20, pin, () => g.aimTimer > 0.2);
      const aimBefore = g.aimTimer;
      pauseOnce();
      const aimAfter = g.aimTimer;
      const aimKept = aimBefore > 0.2 && aimAfter >= aimBefore;
      // (b) pause while a bullet is in flight
      let inFlight = 0;
      H.run(60 * 20, pin, () => { inFlight = E.projectiles.count(); return inFlight > 0; });
      pauseOnce(); pauseOnce();
      const afterPause = E.projectiles.count();
      // (c) tapping pause every 0.5 s must not make the player immune
      const h0 = st().hearts;
      let pauses = 0;
      H.run(60 * 25, (f) => { pin(); if (f % 30 === 29) { pauseOnce(); pauses++; } }, () => st().hearts < h0 || st().runState !== 'playing');
      return { aimKept, aimBefore: +aimBefore.toFixed(3), aimAfter: +aimAfter.toFixed(3), inFlight, afterPause, pauses, heartsLost: h0 - st().hearts };
    });
    check('B-2 pause does not cancel the aim wind-up', r.aimKept, J(r));
    check('B-2 pause does not delete bullets in flight', r.inFlight > 0 && r.afterPause === r.inFlight, J(r));
    check('B-2 pause-tapping does not make the player immune to gunfire', r.heartsLost >= 1, J(r));
  },
}];
