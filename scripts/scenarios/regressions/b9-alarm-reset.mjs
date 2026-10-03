// B-9: the camera yard alarm survived a soft respawn although the guards were
// wiped, so the next glimpse re-filled it at once. Fixed: a catch resets it.
const J = JSON.stringify;
export default [{
  id: 'b9-alarm-reset',
  title: 'B-9 the yard alarm does not survive a soft respawn',
  tags: ['stealth', 'campaign'],
  async run({ page, check, start }) {
    await start({ stage: 16, seed: 4242 });
    const r = await page.evaluate(() => {
      const E = globalThis.__ee, H = globalThis.__h; const S = E.scene; const st = () => E.useStore.getState();
      const cam = S.cameras[0];
      const px = cam.x + Math.sin(cam.facing) * 3, pz = cam.z + Math.cos(cam.facing) * 3;
      const f = H.run(60 * 40, () => { for (const g of S.guards) g.stunTimer = 50; E.player.x = px; E.player.z = pz; }, () => st().alarmLevel >= 0.99);
      for (const g of S.guards) g.stunTimer = 0;
      const before = st().alarmLevel;
      E.handleCatch('arrested');
      H.tick(20); // hit-stop resolves -> soft respawn
      return { alarmBefore: +before.toFixed(3), secsToFill: +(f / 60).toFixed(2), hearts: st().hearts, alarmAfter: +st().alarmLevel.toFixed(3), run: st().runState };
    });
    check('B-9 alarm was full before the catch', r.alarmBefore >= 0.99, J(r));
    check('B-9 alarm is reset after the soft respawn', r.run === 'playing' && r.alarmAfter < 0.5, J(r));
  },
}];
