// Review pack: guards for the defects found in the Endless / Daily / boss
// review (respawn placement, Daily restart, busy-section retention, boss
// popup and retry, stale meters). Frame-stepped.
const J = JSON.stringify;

export default [
  {
    id: 'endless-respawn',
    title: 'Endless respawn stays near the catch point on live ground',
    tags: ['endless'],
    save: 22,
    async run({ page, check, start }) {
      await start({ stage: 22, seed: 900001, mode: 'endless' });
      const p1 = await page.evaluate(() => {
        const E = globalThis.__ee, H = globalThis.__h;
        H.tick(22);
        for (let i = 0; i < 10; i++) { H.quiet(); E.player.x = 0; E.player.z += 60; H.tick(9); }
        const before = E.player.z;
        E.handleCatch('arrested');
        H.tick(24);
        const obstaclesNear = E.scene.procgen.obstacles().filter((o) => Math.abs(o.z - E.player.z) < 40).length;
        return { before: Math.round(before), after: Math.round(E.player.z), obstaclesNear, hearts: E.useStore.getState().hearts };
      });
      check('P1 endless respawn stays near the catch point on live ground', p1.after > p1.before - 40 && p1.obstaclesNear > 3, J(p1));
    },
  },
  {
    id: 'endless-ignores-stage',
    title: 'Endless ignores the campaign stage: 3 hearts, no lethal wire at level 1',
    tags: ['endless', 'combat'],
    save: 22,
    async run({ page, check, start }) {
      await start({ stage: 22, seed: 900002, mode: 'endless' });
      const p3 = await page.evaluate(() => {
        const E = globalThis.__ee, H = globalThis.__h;
        H.tick(22);
        const heartsStore = E.useStore.getState().hearts;
        const razor = E.scene.razorWire;
        const h0 = E.useStore.getState().hearts;
        // walk into the side fence at level 1
        H.run(30, () => { E.player.x = 5.9; });
        H.tick(24);
        return { heartsStore, razor, heartsAfterFence: E.useStore.getState().hearts, h0, stage: E.useStore.getState().stage };
      });
      check('P3 endless ignores campaign stage: 3 hearts, no lethal wire at level 1', p3.heartsStore === 3 && !p3.razor && p3.heartsAfterFence === p3.h0, J(p3));
    },
  },
  {
    id: 'daily-restart-fresh',
    title: 'Same-day Daily restart is a fresh run (no stale distance / payout)',
    tags: ['daily', 'endless', 'economy'],
    save: 22,
    async run({ page, check, start }) {
      await start({ stage: 22, seed: 424200, mode: 'daily', day: '2026-09-28' });
      const p2 = await page.evaluate(() => {
        const E = globalThis.__ee, H = globalThis.__h;
        const st = () => E.useStore.getState();
        const day = '2026-09-28';
        // The player's own "start today's daily" action.
        const begin = () => { st().setGameMode('daily', day); st().startRun(); st().resetForSegment(424200); H.tick(27); };
        begin();
        for (let i = 0; i < 8; i++) { H.quiet(); E.player.z += 60; H.tick(9); }
        for (let i = 0; i < 3; i++) { E.handleCatch('arrested'); H.tick(18); }
        const coins1 = st().saves.tester.coins; const dist1 = st().runSummary?.distanceM;
        st().setRunState('idle'); H.tick(12);
        begin();
        const fresh = { maxZ: Math.round(E.scene.maxZ), hearts: st().hearts, pz: Math.round(E.player.z) };
        for (let i = 0; i < 3; i++) { E.handleCatch('arrested'); H.tick(18); }
        return { dist1, coins1, fresh, dist2: st().runSummary?.distanceM, coins2: st().saves.tester.coins };
      });
      check('P2 same-day Daily restart is a fresh run (no stale distance / payout)', p2.fresh.maxZ < 5 && p2.fresh.hearts === 3 && p2.dist2 < 20 && p2.coins2 - p2.coins1 < 3, J(p2));
    },
  },
  {
    id: 'endless-busy-section',
    title: 'A section with a chasing guard is kept, then removed with its guards and meters; backtrack is clamped',
    tags: ['endless'],
    save: 22,
    async run({ page, check, start }) {
      await start({ stage: 22, seed: 900003, mode: 'endless' });
      const p4 = await page.evaluate(() => {
        const E = globalThis.__ee, H = globalThis.__h;
        const st = () => E.useStore.getState();
        H.tick(24);
        const s = E.scene;
        const g0 = s.guardEntries.find((e) => e.section === 0);
        const id = g0.guard.id;
        for (let i = 0; i < 4; i++) {
          for (const e of s.guardEntries) if (e !== g0) e.guard.stunTimer = 5;
          for (const d of s.dogs) { d.state = 'flee'; d.stateTimer = 5; }
          E.player.x = 0; E.player.z += 60; g0.guard.state = 'chase'; g0.guard.stunTimer = 5;
          H.tick(9);
        }
        const keptWhileChasing = s.sections.some((x) => x.index === 0);
        g0.guard.state = 'wander';
        st().setDetection(id, 0.9);
        for (let i = 0; i < 2; i++) { for (const g of s.guards) g.stunTimer = 5; E.player.z += 60; H.tick(9); }
        const removedAfter = !s.sections.some((x) => x.index === 0);
        const orphan = s.guardEntries.filter((e) => e.section !== null && !s.sections.some((x) => x.index === e.section)).length;
        const out4 = { keptWhileChasing, removedAfter, detAfter: st().detection[id] ?? 0, orphan };
        // R6: can't walk back into the stripped stretch.
        const maxZ = E.scene.maxZ; E.player.z = maxZ - 200; H.tick(6);
        const out6 = { maxZ: Math.round(maxZ), pz: Math.round(E.player.z), start: Math.round(E.scene.procgen.startZ()) };
        return { out4, out6 };
      });
      check('P4 busy section kept, then removed with its guards and zeroed meters', p4.out4.keptWhileChasing && p4.out4.removedAfter && p4.out4.detAfter === 0 && p4.out4.orphan === 0, J(p4.out4));
      check('R6 endless backtrack is clamped to live ground', p4.out6.pz >= p4.out6.maxZ - 31 && p4.out6.pz >= p4.out6.start, J(p4.out6));
    },
  },
  {
    id: 'endless-forks',
    title: 'Endless forks alternate sides and begin at level 3+',
    tags: ['endless'],
    save: 22,
    async run({ page, check, start }) {
      await start({ stage: 22, seed: 900004, mode: 'endless' });
      const p7 = await page.evaluate(() => {
        const E = globalThis.__ee, H = globalThis.__h;
        H.tick(24);
        const seen = new Map();
        for (let i = 0; i < 14; i++) {
          H.quiet();
          for (const f of E.scene.procgen.forks()) seen.set(Math.round(f.startZ), Math.sign(f.postX));
          E.player.x = 0; E.player.z += 60;
          H.tick(9);
        }
        return [...seen.entries()].sort((a, b) => a[0] - b[0]);
      });
      const sides = p7.map((x) => x[1]);
      check('P7 endless forks alternate sides and begin at level 3+', p7.length >= 3 && p7[0][0] >= 240 && sides.some((s, i) => i > 0 && s !== sides[i - 1]), J(p7));
    },
  },
  {
    id: 'boss-popup-retry',
    title: 'BOSS ROUND popup appears exactly once; retry keeps the perk heart',
    tags: ['campaign', 'ui'],
    save: 22,
    async run({ page, check, start }) {
      await start({ stage: 9, seed: 700009 });
      const p56 = await page.evaluate(() => {
        const E = globalThis.__ee, H = globalThis.__h;
        const st = () => E.useStore.getState();
        H.tick(22);
        st().grantBossPerk();
        let popups = 0;
        const unsub = E.useStore.subscribe((s, prev) => { if (s.gameModal?.title === 'BOSS ROUND' && prev.gameModal?.title !== 'BOSS ROUND') popups++; });
        E.handleWin(); H.tick(24);
        // banner NEXT SEGMENT
        st().resetForSegment(st().segmentSeed + 1); H.tick(30);
        const arena = E.scene.isBossArena; const heartsFirst = st().hearts;
        st().setGameModal(null); st().setPaused(false);
        for (let i = 0; i < heartsFirst; i++) { E.handleCatch('arrested'); H.tick(21); }
        const heartsRetry = st().hearts;
        unsub();
        return { popups, arena, stage: st().stage, heartsFirst, heartsRetry };
      });
      check('P5 BOSS ROUND popup appears exactly once', p56.popups === 1 && p56.arena, J(p56));
      check('P6 boss retry keeps the same hearts as the first attempt', p56.heartsRetry === p56.heartsFirst && p56.stage === 10, J(p56));
    },
  },
  {
    id: 'restart-clears-meters',
    title: 'Restart clears stale detection meters',
    tags: ['stealth', 'campaign'],
    async run({ page, check, start }) {
      await start({ stage: 3, seed: 700010 });
      const r2 = await page.evaluate(() => {
        const E = globalThis.__ee, H = globalThis.__h;
        const st = () => E.useStore.getState();
        st().setDetection(9999, 1);
        st().requestRestart();
        H.tick(12);
        return { stale: st().detection[9999] ?? 0 };
      });
      check('R2 restart clears stale detection meters', r2.stale === 0, J(r2));
    },
  },
];
