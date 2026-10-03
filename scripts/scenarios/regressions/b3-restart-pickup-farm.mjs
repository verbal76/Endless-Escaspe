// B-3: Endless/Daily restart used to keep the inventory while the rebuilt
// world respawned every pickup, so items could be farmed with restarts.
// Fixed: a restart starts with an empty bag, and every round can collect the
// same items again (no accumulation).
const J = JSON.stringify;
const sum = (i) => (i.crowbar ?? 0) + (i.smokebomb ?? 0) + (i.rock ?? 0);
export default ['daily', 'endless', 'campaign'].map((mode) => ({
  id: `b3-restart-pickup-farm-${mode}`,
  title: `B-3 restart does not let pickups stack (${mode})`,
  tags: ['economy', mode],
  async run({ page, check, start }) {
    await start({ stage: 1, seed: 424242, mode, day: mode === 'daily' ? '2026-10-02' : null });
    const rounds = await page.evaluate(() => {
      const E = globalThis.__ee, H = globalThis.__h; const out = [];
      for (let k = 0; k < 4; k++) {
        const S = E.scene;
        let got = 0, total = 0;
        for (const p of S.procgen.pickups()) {
          if (p.z > 120) continue;
          total++;
          if (p.collected) continue;
          for (const g of S.guards) g.stunTimer = 5;
          E.player.x = p.x; E.player.z = p.z; E.input.axisX = 0; E.input.axisY = 0; H.tick(1);
          if (p.collected) got++;
        }
        const row = { round: k, total, got, inv: { ...E.useStore.getState().inventory } };
        E.useStore.getState().requestRestart();
        H.tick(2);
        row.invAfterRestart = { ...E.useStore.getState().inventory };
        out.push(row);
      }
      return out;
    });
    check(`B-3 ${mode}: bag is empty right after a restart`, rounds.every((r) => sum(r.invAfterRestart) === 0), J(rounds));
    check(`B-3 ${mode}: every round collects the same items (no accumulation)`, rounds.every((r) => J(r.inv) === J(rounds[0].inv)) && sum(rounds[0].inv) > 0, J(rounds));
  },
}));
