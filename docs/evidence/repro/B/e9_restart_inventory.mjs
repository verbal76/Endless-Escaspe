// B-e9: restart (pause-menu RESTART / Daily "RUN AGAIN" both call requestRestart) keeps the
// inventory, but in Endless/Daily it rebuilds the world with fresh pickups -> pickups can be farmed.
import { boot, startManual } from './hb.mjs';
const { page, errors, close } = await boot();
for (const mode of ['daily', 'endless', 'campaign']) {
  await startManual(page, 1, 424242, mode);
  const r = await page.evaluate(() => {
    const E = globalThis.__ee; const rounds = [];
    for (let k = 0; k < 4; k++) {
      // collect every pickup within the first 120 m by stepping onto it (guards parked).
      const S = E.scene; let got = 0;
      for (const p of S.procgen.pickups()) {
        if (p.collected || p.z > 120) continue;
        for (const g of S.guards) g.stunTimer = 5;
        E.player.x = p.x; E.player.z = p.z; E.input.axisX = 0; E.input.axisY = 0; E.update(1 / 60);
        if (p.collected) got++;
      }
      const inv = { ...E.useStore.getState().inventory };
      rounds.push({ round: k, collectedThisRound: got, inventoryAfter: inv, hearts: E.useStore.getState().hearts });
      E.useStore.getState().requestRestart(); // pause-menu RESTART / Daily RUN AGAIN
      E.update(1 / 60); E.update(1 / 60);
    }
    return rounds;
  });
  console.log(mode, JSON.stringify(r));
}
console.log('errors', errors.filter((e) => !/play\(\)/.test(e))); await close();
