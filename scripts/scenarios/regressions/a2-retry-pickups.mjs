// A-2: MAIN MENU then CONTINUE on the same stage (the usual retry after a
// death) reused the old scene: collected pickups stayed gone. Fixed: the
// retry builds a fresh world with every pickup available.
const J = JSON.stringify;
export default [{
  id: 'a2-retry-pickups',
  title: 'A-2 a retry via MAIN MENU + CONTINUE respawns the pickups',
  tags: ['campaign', 'economy'],
  save: 3,
  async run({ page, check, start }) {
    await start({ stage: 4, seed: 8100 });
    const r = await page.evaluate(() => {
      const E = globalThis.__ee, H = globalThis.__h; const st = () => E.useStore.getState();
      for (const g of E.scene.guards) g.stunTimer = 99;
      const ps = E.scene.procgen.pickups().filter((p) => !p.collected).slice(0, 3);
      for (const p of ps) { E.player.x = p.x; E.player.z = p.z; H.tick(2); }
      const grabbed = ps.filter((p) => p.collected).length;
      for (const g of E.scene.guards) g.stunTimer = 0;
      st().setHearts(1);
      E.handleCatch('arrested');
      H.tick(24);
      // Banner MAIN MENU, then CONTINUE (beginRunForSave: same stage, same seed).
      st().setRunState('idle'); H.tick(18);
      const seed = st().segmentSeed;
      st().setStage(4); st().startRun(); H.tick(36);
      const pk = E.scene.procgen.pickups();
      return { grabbed, seed, uncollected: pk.filter((p) => !p.collected).length, total: pk.length, inv: st().inventory };
    });
    check('A-2 grabbed pickups before the death', r.grabbed === 3, J(r));
    check('A-2 after MAIN MENU + CONTINUE every pickup is available again', r.seed === 8100 && r.total > 0 && r.uncollected === r.total, J(r));
  },
}];
