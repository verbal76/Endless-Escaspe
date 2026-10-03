// Pack 5: campaign forks, coin payout, boss retry, Endless streaming and
// payout, Daily determinism, rock distraction, outfits. Frame-stepped.
const J = JSON.stringify;

export default [
  {
    id: 'forks',
    title: 'Campaign stage 3+ has one risk/reward fork with a guard post; stage 1 has none',
    tags: ['campaign'],
    async run({ page, check, start }) {
      await start({ stage: 3, seed: 5001 });
      const f = await page.evaluate(() => {
        const E = globalThis.__ee;
        const forks = E.scene.procgen.forks();
        const post = forks[0] ? E.scene.guards.find((g) => Math.abs(g.homeX - forks[0].postX) < 1.5 && Math.abs(g.homeZ - forks[0].postZ) < 1.5) : null;
        return { forks: forks.length, post: !!post };
      });
      await start({ stage: 1, seed: 5002 });
      const f1 = await page.evaluate(() => globalThis.__ee.scene.procgen.forks().length);
      check('F1 campaign stage 3+ has one risk/reward fork with a guard post; stage 1 has none', f.forks === 1 && f.post && f1 === 0, J({ ...f, f1 }));
    },
  },
  {
    id: 'coins-on-clear',
    title: 'Clearing a stage pays coins once and records the stars as paid',
    tags: ['campaign', 'economy'],
    save: 12,
    async run({ page, check, start }) {
      await start({ stage: 4, seed: 5003 });
      const cc = await page.evaluate(() => {
        const E = globalThis.__ee;
        E.handleWin();
        globalThis.__h.tick(6);
        const s1 = E.useStore.getState().saves.tester;
        return { coins: s1.coins, ledger: s1.coinStars, summary: E.useStore.getState().runSummary };
      });
      check('C1 clearing a stage pays coins and records the stars as paid', cc.coins > 0 && Object.keys(cc.ledger).length === 1 && cc.summary.coinsEarned === cc.coins, J(cc));
    },
  },
  {
    id: 'boss-retry',
    title: 'Losing a boss round retries it (no stage advance, fresh hearts, timer re-armed)',
    tags: ['campaign', 'combat'],
    save: 12,
    async run({ page, check, start }) {
      await start({ stage: 10, seed: 5004 });
      const b = await page.evaluate(() => {
        const E = globalThis.__ee;
        for (let i = 0; i < 4; i++) { E.handleCatch('arrested'); globalThis.__h.tick(21); }
        const st = E.useStore.getState();
        return { stage: st.stage, runState: st.runState, hearts: st.hearts, timer: +st.bossTimeRemaining.toFixed(3), arena: E.scene.isBossArena };
      });
      check('B1 losing a boss round retries it (no stage advance, fresh hearts, timer re-armed)', b.stage === 10 && b.runState === 'playing' && b.hearts >= 2 && b.timer >= 58 && b.arena, J(b));
    },
  },
  {
    id: 'endless-stream',
    title: 'Endless streaming window, difficulty ramp and run-end payout',
    tags: ['endless', 'economy'],
    save: 12,
    async run({ page, check, start }) {
      await start({ stage: 10, seed: 777001, mode: 'endless' });
      const e = await page.evaluate(() => {
        const E = globalThis.__ee, H = globalThis.__h;
        H.tick(30);
        const samples = [];
        for (let i = 0; i < 16; i++) {
          H.quiet();
          E.player.x = 0;
          E.player.z += 60;
          H.tick(15);
          // Retention: the held gameplay chunks (horizon chunks excluded).
          const ch = E.scene.procgen.chunks.filter((c) => !c.isHorizon);
          samples.push({ z: Math.round(E.player.z), sections: E.scene.sections.length, guards: E.scene.guards.length, obstacles: E.scene.procgen.obstacles().length, chunks: ch.length, behind: Math.round(E.player.z - ch[0].startZ), ahead: Math.round(ch[ch.length - 1].endZ - E.player.z), end: Math.round(E.scene.segmentEndZ), level: E.useStore.getState().endlessLevel, dist: E.useStore.getState().distanceM });
        }
        const winLine = !!E.scene.winLineMat;
        const hearts = E.useStore.getState().hearts;
        for (let i = 0; i < 3; i++) { E.handleCatch('arrested'); H.tick(21); }
        const after = E.useStore.getState();
        const half = samples.length / 2;
        return {
          samples: [samples[0], samples[8], samples[15]],
          maxSections: Math.max(...samples.map((s) => s.sections)), maxObstacles: Math.max(...samples.map((s) => s.obstacles)),
          maxChunks: Math.max(...samples.map((s) => s.chunks)), maxBehind: Math.max(...samples.map((s) => s.behind)), maxAhead: Math.max(...samples.map((s) => s.ahead)),
          chunksFirstHalf: Math.max(...samples.slice(0, half).map((s) => s.chunks)), chunksSecondHalf: Math.max(...samples.slice(half).map((s) => s.chunks)),
          winLine, hearts, runState: after.runState, summary: after.runSummary, save: { coins: after.saves.tester.coins, best: after.saves.tester.endlessBest },
        };
      });
      const last = e.samples[2];
      // Bounded memory = a bounded retention window, derived from Game.tsx
      // streamEndless (ENDLESS_SECTION_LEN 120 m, CHUNK_LEN 24 m):
      //   ahead:  sections are populated while nextSection*120 < z + 240, and
      //           prefetch builds one more section (+120) plus one chunk (+24)
      //           -> at most 240 + 120 + 120 + 24 = 504 m ahead.
      //   behind: a section is kept until it is 45 m behind (160 m if a chase
      //           is still in it), plus its 120 m length and the 24 m chunk the
      //           trim keeps -> at most 160 + 120 + 24 = 304 m behind.
      //   chunks: (504 + 304) / 24 -> at most 34 gameplay chunks held.
      // The raw obstacle count is NOT a memory invariant: obstacles per chunk
      // rise with the Endless difficulty level by design (7.6 at level 1 to
      // 11.8 at level 21 over a 2.4 km probe), so it is reported, not gated.
      // No-growth: the held window must not grow along the run.
      check('E1 endless streams sections ahead and drops them behind (bounded memory)',
        e.maxSections <= 4 && e.maxAhead <= 504 && e.maxBehind <= 304 && e.maxChunks <= 34 &&
          e.chunksSecondHalf <= e.chunksFirstHalf && last.end > last.z + 100 && !e.winLine,
        J({ samples: e.samples, maxSections: e.maxSections, maxChunks: e.maxChunks, maxAhead: e.maxAhead, maxBehind: e.maxBehind, chunksFirstHalf: e.chunksFirstHalf, chunksSecondHalf: e.chunksSecondHalf, maxObstacles: e.maxObstacles }));
      check('E2 difficulty level rises with distance', last.level > e.samples[0].level && last.level >= 8, `levels ${e.samples.map((s) => s.level)}`);
      check('E3 endless run end pays distance coins and records the best', e.runState === 'caught' && e.summary.mode === 'endless' && e.summary.distanceM > 900 && e.save.best === e.summary.distanceM && e.summary.coinsEarned === Math.floor(e.summary.distanceM / 25), J({ summary: e.summary, save: e.save, hearts: e.hearts }));
    },
  },
  {
    id: 'daily-same-layout',
    title: 'Daily run: restarting regenerates the identical layout',
    tags: ['daily'],
    async run({ page, check, start }) {
      await start({ stage: 10, seed: 123456789, mode: 'daily', day: '2026-09-27' });
      const d = await page.evaluate(() => {
        const E = globalThis.__ee, H = globalThis.__h;
        const sig = () => E.scene.procgen.obstacles().slice(0, 40).map((o) => `${o.kind}${o.x.toFixed(3)}${o.z.toFixed(3)}`).join('|');
        const a = sig();
        E.useStore.getState().requestRestart();
        H.tick(24);
        const b = sig();
        return { same: a === b && a.length > 0, mode: E.scene.mode };
      });
      check('D1 daily run: restarting regenerates the identical layout', d.same && d.mode === 'daily', J(d));
    },
  },
  {
    id: 'rock-distraction',
    title: 'A thrown rock sends a nearby guard to investigate the landing spot',
    tags: ['stealth', 'combat'],
    async run({ page, check, start }) {
      await start({ stage: 2, seed: 5005 });
      const rk = await page.evaluate(() => {
        const E = globalThis.__ee, H = globalThis.__h;
        E.scene.procgen.obstacles().length = 0;
        const g = E.scene.guards[0];
        g.x = 3; g.z = 22; g.state = 'wander'; g.facing = -Math.PI / 2;
        for (const o of E.scene.guards.slice(1)) { o.stunTimer = 99; o.x = -8; o.z = -1.5; }
        E.player.x = 0; E.player.z = 10;
        E.useStore.getState().addPickup('rock');
        E.input.axisY = 1;
        H.tick(7);
        E.input.axisY = 0;
        E.input.throwRock = true;
        H.tick(66);
        const t = g.investigationTarget;
        return { state: g.state, target: t ? { x: +t.x.toFixed(2), z: +t.z.toFixed(2) } : null, rocks: E.useStore.getState().inventory.rock, playerZ: +E.player.z.toFixed(2) };
      });
      check('R1 a thrown rock sends a nearby guard to investigate the landing spot', rk.state === 'investigate' && rk.target && rk.target.z > rk.playerZ + 5 && rk.rocks === 0, J(rk));
    },
  },
  {
    id: 'outfit-figure',
    title: 'Equipping an outfit re-dresses the player figure',
    tags: ['economy', 'ui'],
    async run({ page, check, start }) {
      await start({ stage: 2, seed: 5006 });
      const o = await page.evaluate(() => {
        const E = globalThis.__ee;
        E.useStore.getState().setPlayerOutfit('gold');
        globalThis.__h.tick(12, true);
        let tinted = false;
        E.renderer.worldRoot.traverse((n) => { if (n.material && n.material.color && n.material.color.getHex() === 0xffe07a) tinted = true; });
        return { tinted };
      });
      check('O1 equipping an outfit re-dresses the player figure', o.tinted, J(o));
      // Leave the store as other scenarios expect it.
      await page.evaluate(() => globalThis.__ee.useStore.getState().setPlayerOutfit('classic'));
    },
  },
];
