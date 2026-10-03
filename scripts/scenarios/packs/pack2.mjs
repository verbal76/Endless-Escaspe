// Pack 2: stealth, cover, camera alarm, dogs, razor wire, stamina, boss round.
// Frame-stepped: every wait is a count of E.update(1/60) frames, every "hold
// positions" interval is a per-frame pin, so results do not depend on speed.
const barrier = (x, z, rotY = 0) => ({ kind: 'cover', x, z, r: 1.17, halfW: 1.0, halfL: 0.5, rotY, height: 1.4, isCover: true });
const J = JSON.stringify;

export default [
  {
    id: 'los-shooting',
    title: 'Guard with clear sight telegraphs (aims) then shoots',
    tags: ['stealth', 'combat'],
    async run({ page, check, start }) {
      await start({ stage: 3, seed: 101 });
      await page.evaluate(() => globalThis.__h.setObstacles([]));
      const a1 = await page.evaluate(() => {
        const E = globalThis.__ee, H = globalThis.__h;
        const g = E.scene.guards[0];
        const h0 = E.useStore.getState().hearts;
        let sawAimBeforeHit = false;
        const frames = H.run(60 * 20, H.hold({ player: [0, 30], guard: [0, 23], parkOthers: true }), () => {
          if (g.aimTimer > 0.2) sawAimBeforeHit = true;
          return E.useStore.getState().hearts < h0;
        });
        const hit = E.useStore.getState().hearts < h0;
        return { sawAimBeforeHit, hitAt: hit ? +(frames / 60).toFixed(3) : -1, cause: E.useStore.getState().lastDeathCause };
      });
      check('A1 guard with clear sight aims (telegraph) then shoots', a1.sawAimBeforeHit && a1.hitAt > 0 && a1.cause === 'killed', J(a1));
    },
  },
  {
    id: 'cover-blocks-sight',
    title: 'Cover between guard and standing player blocks sight and shots',
    tags: ['stealth', 'combat'],
    async run({ page, check, start }) {
      await start({ stage: 3, seed: 102 });
      await page.evaluate((b) => globalThis.__h.setObstacles([b]), barrier(0, 27));
      const a2 = await page.evaluate(() => {
        const E = globalThis.__ee, H = globalThis.__h;
        const g = E.scene.guards[0];
        const hold = H.hold({ player: [0, 29], guard: [0, 22], parkOthers: true });
        g.facing = Math.PI / 2;
        const h0 = E.useStore.getState().hearts;
        let maxDet = 0, maxAim = 0;
        H.run(60 * 12, () => { hold(); g.facing = Math.PI / 2; }, () => {
          maxDet = Math.max(maxDet, E.useStore.getState().detection[g.id] ?? 0);
          maxAim = Math.max(maxAim, g.aimTimer);
        });
        return { heartsLost: h0 - E.useStore.getState().hearts, maxDet: +maxDet.toFixed(3), maxAim };
      });
      check('A2 cover between guard and standing player blocks sight and shots', a2.heartsLost === 0 && a2.maxAim === 0 && a2.maxDet < 0.85, J(a2));
    },
  },
  {
    id: 'crouch-needs-cover-side',
    title: "Crouching beside cover on the guard's side does not hide you",
    tags: ['stealth'],
    async run({ page, check, start }) {
      await start({ stage: 3, seed: 103 });
      await page.evaluate((b) => { globalThis.__h.setObstacles([b]); globalThis.__ee.input.stance = 'crouch'; }, barrier(0, 31.2));
      const a3 = await page.evaluate(() => {
        const E = globalThis.__ee, H = globalThis.__h;
        const g = E.scene.guards[0];
        const hold = H.hold({ player: [0, 30], guard: [0, 23], parkOthers: true });
        let maxDet = 0, hidden = false;
        H.run(60 * 6, () => { hold(); g.facing = Math.PI / 2; }, () => {
          maxDet = Math.max(maxDet, E.useStore.getState().detection[g.id] ?? 0);
          if (E.player.isHidden) hidden = true;
        });
        return { maxDet: +maxDet.toFixed(3), everHidden: hidden, crouched: E.player.isCrouched };
      });
      check("A3 crouching beside cover on the guard's side does not hide you", a3.crouched && a3.maxDet > 0.15 && !a3.everHidden, J(a3));
    },
  },
  {
    id: 'decay-and-noise-ring',
    title: 'Detection decays once sight is lost; noise ring follows movement',
    tags: ['stealth'],
    async run({ page, check, start }) {
      await start({ stage: 3, seed: 104 });
      await page.evaluate(() => globalThis.__h.setObstacles([]));
      const b = await page.evaluate(() => {
        const E = globalThis.__ee, H = globalThis.__h;
        const g = E.scene.guards[0];
        E.useStore.getState().setDetection(g.id, 0.7);
        // Guard far away, facing away.
        let first = null, last = null;
        H.run(180, () => { g.x = 6; g.z = 60; g.facing = Math.PI / 2; g.state = 'wander'; E.player.x = -6; E.player.z = 20; }, () => {
          const d = E.useStore.getState().detection[g.id];
          if (first === null) first = d;
          last = d;
        });
        // Noise ring while walking vs still (the ring is animated by render()).
        E.input.axisY = 0.8;
        H.tick(36, true);
        const walkingVisible = E.noiseRing.mesh.visible, walkingR = E.noiseRing.shown;
        E.input.axisY = 0;
        H.tick(54, true);
        const stillVisible = E.noiseRing.mesh.visible;
        return { first: +first.toFixed(4), last: +last.toFixed(4), walkingVisible, walkingR: +walkingR.toFixed(3), stillVisible };
      });
      check('B1 detection decays once sight is lost', b.last < b.first - 0.2, J(b));
      check('B2 noise ring shows while moving and hides when still', b.walkingVisible && b.walkingR > 3 && !b.stillVisible, J(b));
    },
  },
  {
    id: 'camera-alarm',
    title: 'Full camera alarm dispatches a reinforcement guard; restart removes it',
    tags: ['stealth', 'campaign'],
    async run({ page, check, start, tick }) {
      await start({ stage: 16, seed: 222 });
      const c = await page.evaluate(() => {
        const E = globalThis.__ee, H = globalThis.__h;
        const cam = E.scene.cameras[0];
        const before = E.scene.guards.length;
        E.scene.procgen.obstacles().length = 0;
        let toast = null;
        const trace = [];
        const frames = H.run(60 * 40, () => {
          if (trace.length < 400) trace.push(+E.useStore.getState().alarmLevel.toFixed(2));
          E.player.x = cam.x + Math.sin(cam.facing) * 4; E.player.z = cam.z;
          for (const g of E.scene.guards) g.stunTimer = 1;
          for (const dg of E.scene.dogs) { dg.state = 'flee'; dg.stateTimer = 999; dg.x = 8; dg.z = -1.5; }
        }, () => {
          toast = E.useStore.getState().toast?.text ?? toast;
          return E.scene.guards.length !== before;
        });
        const added = E.scene.guards[E.scene.guards.length - 1];
        const st = E.useStore.getState();
        return { before, after: E.scene.guards.length, toast, newState: added.state, target: added.investigationTarget, runState: st.runState, alarm: +st.alarmLevel.toFixed(3), reinf: E.scene.reinforcements, wasFull: E.scene.alarmWasFull, cams: E.scene.cameras.length, stage: st.stage, secs: +(frames / 60).toFixed(3), cam: [cam.x, cam.z, cam.facing] };
      });
      check('C1 full camera alarm dispatches a reinforcement guard toward the sighting', c.after === c.before + 1 && !!c.toast && c.newState === 'investigate', J(c));
      await tick(18);
      const c2 = await page.evaluate(() => {
        const E = globalThis.__ee;
        const n = E.scene.guards.length;
        E.useStore.getState().requestRestart();
        globalThis.__h.tick(18);
        return { before: n, after: E.scene.guards.length };
      });
      check('C2 restart removes alarm reinforcements', c2.after === c2.before - 1, J(c2));
    },
  },
  {
    id: 'dog-chase-escape',
    title: 'Dog engages when stood next to; a sprint-then-walk escapes it',
    tags: ['stealth', 'combat'],
    async run({ page, check, start }) {
      await start({ stage: 8, seed: 333 });
      const d = await page.evaluate(() => {
        const E = globalThis.__ee, H = globalThis.__h;
        E.scene.procgen.obstacles().length = 0;
        const dog = E.scene.dogs[0];
        const handler = E.scene.guards.find((g) => g.id === dog.handlerGuardId);
        for (const g of E.scene.guards) if (g !== handler) { g.x = 8; g.z = -1.5; g.stunTimer = 999; }
        const holdHandler = () => { handler.x = -7; handler.z = 18; handler.facing = -Math.PI / 2; handler.state = 'wander'; };
        dog.x = 0; dog.z = 20;
        E.player.x = 0; E.player.z = 23;
        H.run(9, holdHandler);
        const engaged = dog.state;
        const h0 = E.useStore.getState().hearts;
        E.input.axisY = 1; E.input.run = true;
        const states = new Set();
        // Until the dog gives up (max 40 sim seconds).
        H.run(60 * 40, holdHandler, () => { states.add(dog.state); return states.has('return'); });
        E.input.axisY = 0; E.input.run = false;
        return { engaged, states: [...states], heartsLost: h0 - E.useStore.getState().hearts, dz: +(E.player.z - dog.z).toFixed(2) };
      });
      check('D1 dog engages when stood next to, and a sprint-then-walk escapes it', d.engaged === 'chase' && d.heartsLost === 0 && d.states.includes('return'), J(d));
    },
  },
  {
    id: 'razor-wire',
    title: 'Touching razor wire costs a heart',
    tags: ['combat', 'campaign'],
    async run({ page, check, start }) {
      await start({ stage: 14, seed: 444 });
      const e = await page.evaluate(() => {
        const E = globalThis.__ee, H = globalThis.__h;
        E.scene.procgen.obstacles().length = 0;
        for (const g of E.scene.guards) { g.x = -8; g.z = -1.5; g.stunTimer = 999; }
        for (const dg of E.scene.dogs) { dg.x = -8; dg.z = -1.5; dg.state = 'flee'; dg.stateTimer = 999; }
        const h0 = E.useStore.getState().hearts;
        E.player.z = 20; E.player.x = 5;
        E.input.axisX = -1; // toward the +X fence
        H.run(60 * 6, null, () => E.useStore.getState().hearts !== h0); // contact, max 6 s
        H.tick(18);
        E.input.axisX = 0;
        return { heartsLost: h0 - E.useStore.getState().hearts, cause: E.useStore.getState().lastDeathCause };
      });
      check('E1 touching razor wire costs a heart', e.heartsLost === 1, J(e));
    },
  },
  {
    id: 'stamina-run-toggle',
    title: 'Sprint exhausts stamina; RUN switches off and stays off',
    tags: ['campaign'],
    async run({ page, check, start }) {
      await start({ stage: 6, seed: 555 });
      const f = await page.evaluate(() => {
        const E = globalThis.__ee, H = globalThis.__h;
        E.scene.procgen.obstacles().length = 0;
        for (const g of E.scene.guards) { g.x = -8; g.z = -1.5; g.stunTimer = 999; }
        E.input.axisY = 1; E.input.run = true; E.useStore.getState().setRunning(true);
        let exhaustedAt = -1, ranWhileEmpty = false;
        H.run(60 * 6, () => { if (E.player.z > 100) E.player.z = 5; }, (fr) => {
          if (E.player.exhausted && exhaustedAt < 0) exhaustedAt = +((fr + 1) / 60).toFixed(3);
          if (E.player.exhausted && E.player.isRunning) ranWhileEmpty = true;
        });
        E.input.axisY = 0;
        return { exhaustedAt, ranWhileEmpty, storeRunning: E.useStore.getState().running, inputRun: E.input.run };
      });
      check('F1 sprint exhausts stamina; RUN switches off and stays off', f.exhaustedAt > 2 && !f.ranWhileEmpty && !f.storeRunning && !f.inputRun, J(f));
    },
  },
  {
    id: 'boss-restart-timer',
    title: 'Restarting a boss round resets the countdown',
    tags: ['campaign', 'combat'],
    async run({ page, check, start }) {
      await start({ stage: 10, seed: 666 });
      const g = await page.evaluate(() => {
        const E = globalThis.__ee, H = globalThis.__h;
        for (const gg of E.scene.guards) { gg.stunTimer = 999; gg.x = 8; gg.z = -1.5; }
        for (const dg of E.scene.dogs) { dg.state = 'flee'; dg.stateTimer = 999; dg.x = -8; dg.z = -1.5; }
        H.tick(240);
        const mid = +E.useStore.getState().bossTimeRemaining.toFixed(3);
        E.useStore.getState().requestRestart();
        H.tick(18);
        return { arena: E.scene.isBossArena, mid, after: +E.useStore.getState().bossTimeRemaining.toFixed(3) };
      });
      check('G1 restarting a boss round resets the countdown', g.arena && g.mid <= 57 && g.after >= 59, J(g));
    },
  },
];
