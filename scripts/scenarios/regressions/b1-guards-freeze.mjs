// B-1: floodlight / searchlight / dog-smell feeds used to raise EVERY guard's
// detection meter with no position, so every patrol went `investigate` with no
// target and froze for ~20 s. Fixed behaviour: standing in a beam only
// alerts guards that can actually perceive the player.
const J = JSON.stringify;
export default [{
  id: 'b1-guards-freeze',
  title: 'B-1 standing in a floodlight does not freeze far-away guards',
  tags: ['stealth', 'campaign'],
  async run({ page, check, start }) {
    for (const stage of [3, 8, 14]) {
      await start({ stage, seed: 777 });
      const r = await page.evaluate(() => {
        const E = globalThis.__ee, H = globalThis.__h; const S = E.scene;
        const t = S.lightTowers.reduce((a, b) => (Math.abs(b.z - 1) < Math.abs(a.z - 1) ? b : a));
        const px = t.x > 0 ? t.x - 4.6 : t.x + 4.6, pz = t.z;
        const FAR = 60; // beyond any guard vision cone
        let targetlessInvestigators = 0, farAlerted = 0;
        H.run(60 * 8, () => {
          E.player.x = px; E.player.z = pz; E.input.axisX = 0; E.input.axisY = 0;
          if (t.state === 'scan') t.scanAngle = Math.atan2(px - t.x, pz - t.z); // hold the scanning beam on the player
        }, () => {
          const det = E.useStore.getState().detection;
          for (const g of S.guards) {
            if (g.state === 'investigate' && !g.investigationTarget) targetlessInvestigators++;
            if (Math.hypot(g.x - px, g.z - pz) > FAR && ((det[g.id] ?? 0) > 0 || g.state !== 'wander')) farAlerted++;
          }
        });
        return { towers: S.lightTowers.length, targetlessInvestigators, farAlerted, run: E.useStore.getState().runState };
      });
      check(`B-1 stage ${stage}: no guard investigates without a target, far guards stay unalerted`, r.targetlessInvestigators === 0 && r.farAlerted === 0 && r.towers > 0, J(r));
    }
  },
}];
