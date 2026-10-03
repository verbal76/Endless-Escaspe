import { openGame, check, startStage, results } from './harness.mjs';
const { page, errors, close } = await openGame();

// Helper: freeze everything except what we script, by holding
// positions every 4 ms.
async function hold(spec) {
  await page.evaluate((spec) => {
    const E = globalThis.__ee;
    clearInterval(globalThis.__hold);
    globalThis.__hold = setInterval(() => {
      if (spec.player) { E.player.x = spec.player[0]; E.player.z = spec.player[1]; }
      if (spec.guard) {
        const g = E.scene.guards[spec.guardIdx ?? 0];
        g.x = spec.guard[0]; g.z = spec.guard[1];
        if (g.aimTimer <= 0) g.facing = Math.atan2(spec.player[1] - g.z, spec.player[0] - g.x);
      }
      for (let i = 0; i < E.scene.guards.length; i++) {
        if (spec.parkOthers && i !== (spec.guardIdx ?? 0)) {
          const g = E.scene.guards[i]; g.x = 8; g.z = -1.5 + i * 0.01; g.stunTimer = 99;
        }
      }
    }, 4);
  }, spec);
}
async function unhold() { await page.evaluate(() => clearInterval(globalThis.__hold)); }
async function setObstacles(list) {
  await page.evaluate((list) => {
    const E = globalThis.__ee;
    const arr = E.scene.procgen.obstacles();
    for (const o of arr) if (o.mesh) o.mesh.visible = false;
    arr.length = 0;
    for (const o of list) arr.push({ id: 9000 + arr.length, mesh: null, ...o });
  }, list);
}
const barrier = (x, z, rotY = 0) => ({ kind: 'cover', x, z, r: 1.17, halfW: 1.0, halfL: 0.5, rotY, height: 1.4, isCover: true });
const snap = (name) => page.screenshot({ path: `p2-${name}.png` });

// ---- A. Line-of-sight shooting with telegraph ----------------------
await startStage(page, 3, 101);
await setObstacles([]);
await hold({ player: [0, 30], guard: [0, 23], parkOthers: true });
const a1 = await page.evaluate(async () => {
  const E = globalThis.__ee;
  const g = E.scene.guards[0];
  const h0 = E.useStore.getState().hearts;
  let sawAimBeforeHit = false, hitAt = -1, t0 = performance.now();
  while (performance.now() - t0 < 20000) {
    await new Promise((r) => setTimeout(r, 30));
    if (g.aimTimer > 0.2) sawAimBeforeHit = true;
    if (E.useStore.getState().hearts < h0) { hitAt = (performance.now() - t0) / 1000; break; }
  }
  return { sawAimBeforeHit, hitAt, cause: E.useStore.getState().lastDeathCause };
});
check('A1 guard with clear sight aims (telegraph) then shoots', a1.sawAimBeforeHit && a1.hitAt > 0 && a1.cause === 'killed', JSON.stringify(a1));

await unhold();
await startStage(page, 3, 102);
await setObstacles([barrier(0, 27)]);
await hold({ player: [0, 29], guard: [0, 22], parkOthers: true });
const a2 = await page.evaluate(async () => {
  const E = globalThis.__ee;
  const g = E.scene.guards[0];
  g.facing = Math.PI / 2;
  const h0 = E.useStore.getState().hearts;
  let maxDet = 0, maxAim = 0;
  const t0 = performance.now();
  while (performance.now() - t0 < 12000) {
    await new Promise((r) => setTimeout(r, 30));
    g.facing = Math.PI / 2;
    maxDet = Math.max(maxDet, E.useStore.getState().detection[g.id] ?? 0);
    maxAim = Math.max(maxAim, g.aimTimer);
  }
  return { heartsLost: h0 - E.useStore.getState().hearts, maxDet, maxAim };
});
check('A2 cover between guard and standing player blocks sight and shots', a2.heartsLost === 0 && a2.maxAim === 0 && a2.maxDet < 0.85, JSON.stringify(a2));

await unhold();
await startStage(page, 3, 103);
await setObstacles([barrier(0, 31.2)]);
await page.evaluate(() => { globalThis.__ee.input.stance = 'crouch'; });
await hold({ player: [0, 30], guard: [0, 23], parkOthers: true });
const a3 = await page.evaluate(async () => {
  const E = globalThis.__ee;
  const g = E.scene.guards[0];
  let maxDet = 0, hidden = false;
  const t0 = performance.now();
  while (performance.now() - t0 < 6000) {
    await new Promise((r) => setTimeout(r, 30));
    g.facing = Math.PI / 2;
    maxDet = Math.max(maxDet, E.useStore.getState().detection[g.id] ?? 0);
    if (E.player.isHidden) hidden = true;
  }
  return { maxDet, everHidden: hidden, crouched: E.player.isCrouched };
});
check('A3 crouching beside cover on the guard\'s side does not hide you', a3.crouched && a3.maxDet > 0.15 && !a3.everHidden, JSON.stringify(a3));
await snap('A3');

// ---- B. Decay after LOS lost + noise ring ---------------------------
await unhold();
await page.evaluate(() => { globalThis.__ee.input.stance = 'walk'; });
await startStage(page, 3, 104);
await setObstacles([]);
const b = await page.evaluate(async () => {
  const E = globalThis.__ee;
  const g = E.scene.guards[0];
  const st = E.useStore.getState();
  st.setDetection(g.id, 0.7);
  // Put guard far, facing away.
  const t0 = performance.now();
  let first = null, last = null;
  while (performance.now() - t0 < 3000) {
    g.x = 6; g.z = 60; g.facing = Math.PI / 2; g.state = 'wander';
    E.player.x = -6; E.player.z = 20;
    await new Promise((r) => setTimeout(r, 30));
    const d = E.useStore.getState().detection[g.id];
    if (first === null) first = d;
    last = d;
  }
  // Noise ring while walking vs still.
  E.input.axisY = 0.8;
  await new Promise((r) => setTimeout(r, 600));
  const walkingVisible = E.noiseRing.mesh.visible, walkingR = E.noiseRing.shown;
  E.input.axisY = 0;
  await new Promise((r) => setTimeout(r, 900));
  const stillVisible = E.noiseRing.mesh.visible;
  return { first, last, walkingVisible, walkingR, stillVisible };
});
check('B1 detection decays once sight is lost', b.last < b.first - 0.2, JSON.stringify(b));
check('B2 noise ring shows while moving and hides when still', b.walkingVisible && b.walkingR > 3 && !b.stillVisible, JSON.stringify(b));

// ---- C. Camera alarm dispatches a reinforcement guard ---------------
await startStage(page, 16, 222);
const c = await page.evaluate(async () => {
  const E = globalThis.__ee;
  const cam = E.scene.cameras[0];
  const before = E.scene.guards.length;
  const arr = E.scene.procgen.obstacles();
  arr.length = 0;
  const t0 = performance.now();
  let toast = null;
  const trace = [];
  while (performance.now() - t0 < 40000 && E.scene.guards.length === before) {
    if (trace.length < 400) trace.push(+E.useStore.getState().alarmLevel.toFixed(2));
    E.player.x = cam.x + Math.sin(cam.facing) * 4; E.player.z = cam.z;
    for (const g of E.scene.guards) { g.stunTimer = 1; }
    for (const dg of E.scene.dogs) { dg.state = 'flee'; dg.stateTimer = 999; dg.x = 8; dg.z = -1.5; }
    await new Promise((r) => setTimeout(r, 30));
    toast = E.useStore.getState().toast?.text ?? toast;
  }
  const added = E.scene.guards[E.scene.guards.length - 1];
  return { before, after: E.scene.guards.length, toast, newState: added.state, target: added.investigationTarget, runState: E.useStore.getState().runState, alarm: E.useStore.getState().alarmLevel, reinf: E.scene.reinforcements, wasFull: E.scene.alarmWasFull, cams: E.scene.cameras.length, stage: E.useStore.getState().stage, trace: trace.filter((_, i) => i % 40 === 0), px: E.player.x, cam: [cam.x, cam.z, cam.facing] };
});
check('C1 full camera alarm dispatches a reinforcement guard toward the sighting', c.after === c.before + 1 && !!c.toast && c.newState === 'investigate', JSON.stringify(c));
await page.waitForTimeout(300);
await snap('C1');
// Restart removes reinforcements.
const c2 = await page.evaluate(async () => {
  const E = globalThis.__ee;
  const n = E.scene.guards.length;
  E.useStore.getState().requestRestart();
  await new Promise((r) => setTimeout(r, 300));
  return { before: n, after: E.scene.guards.length };
});
check('C2 restart removes alarm reinforcements', c2.after === c2.before - 1, JSON.stringify(c2));

// ---- D. Dogs: engage, then escape by sprinting ----------------------
await startStage(page, 8, 333);
const d = await page.evaluate(async () => {
  const E = globalThis.__ee;
  E.scene.procgen.obstacles().length = 0;
  const dog = E.scene.dogs[0];
  const handler = E.scene.guards.find((g) => g.id === dog.handlerGuardId);
  for (const g of E.scene.guards) if (g !== handler) { g.x = 8; g.z = -1.5; g.stunTimer = 999; }
  const holdHandler = setInterval(() => { handler.x = -7; handler.z = 18; handler.facing = -Math.PI / 2; handler.state = 'wander'; }, 4);
  dog.x = 0; dog.z = 20;
  E.player.x = 0; E.player.z = 23;
  await new Promise((r) => setTimeout(r, 150));
  const engaged = dog.state;
  const h0 = E.useStore.getState().hearts;
  E.input.axisY = 1; E.input.run = true;
  const t0 = performance.now();
  const states = new Set();
  // Until the dog gives up (sim speed varies under software GL) - max 20 s.
  while (performance.now() - t0 < 20000 && !states.has('return')) {
    await new Promise((r) => setTimeout(r, 30));
    states.add(dog.state);
  }
  clearInterval(holdHandler);
  E.input.axisY = 0; E.input.run = false;
  return { engaged, states: [...states], heartsLost: h0 - E.useStore.getState().hearts, dz: E.player.z - dog.z };
});
check('D1 dog engages when stood next to, and a sprint-then-walk escapes it', d.engaged === 'chase' && d.heartsLost === 0 && d.states.includes('return'), JSON.stringify(d));

// ---- E. Razor wire -----------------------------------------------------
await startStage(page, 14, 444);
const e = await page.evaluate(async () => {
  const E = globalThis.__ee;
  E.scene.procgen.obstacles().length = 0;
  for (const g of E.scene.guards) { g.x = -8; g.z = -1.5; g.stunTimer = 999; }
  for (const dg of E.scene.dogs) { dg.x = -8; dg.z = -1.5; dg.state = 'flee'; dg.stateTimer = 999; }
  const h0 = E.useStore.getState().hearts;
  E.player.z = 20; E.player.x = 5;
  E.input.axisX = -1; // toward +X fence
  // Wait for contact (sim speed varies under software GL) - max 6 s.
  const t0 = performance.now();
  while (performance.now() - t0 < 6000 && E.useStore.getState().hearts === h0) await new Promise((r) => setTimeout(r, 50));
  await new Promise((r) => setTimeout(r, 300));
  E.input.axisX = 0;
  return { heartsLost: h0 - E.useStore.getState().hearts, cause: E.useStore.getState().lastDeathCause };
});
check('E1 touching razor wire costs a heart', e.heartsLost === 1, JSON.stringify(e));

// ---- F. Stamina exhaustion + RUN toggle ---------------------------------
await startStage(page, 6, 555);
const f = await page.evaluate(async () => {
  const E = globalThis.__ee;
  E.scene.procgen.obstacles().length = 0;
  for (const g of E.scene.guards) { g.x = -8; g.z = -1.5; g.stunTimer = 999; }
  E.input.axisY = 1; E.input.run = true; E.useStore.getState().setRunning(true);
  let exhaustedAt = -1; const t0 = performance.now(); let ranWhileEmpty = false;
  while (performance.now() - t0 < 6000) {
    await new Promise((r) => setTimeout(r, 20));
    if (E.player.z > 100) E.player.z = 5;
    if (E.player.exhausted && exhaustedAt < 0) exhaustedAt = (performance.now() - t0) / 1000;
    if (E.player.exhausted && E.player.isRunning) ranWhileEmpty = true;
  }
  E.input.axisY = 0;
  return { exhaustedAt, ranWhileEmpty, storeRunning: E.useStore.getState().running, inputRun: E.input.run };
});
check('F1 sprint exhausts stamina; RUN switches off and stays off', f.exhaustedAt > 2 && !f.ranWhileEmpty && !f.storeRunning && !f.inputRun, JSON.stringify(f));

// ---- G. Boss round restart re-arms the timer ----------------------------
await startStage(page, 10, 666);
const g = await page.evaluate(async () => {
  const E = globalThis.__ee;
  for (const gg of E.scene.guards) { gg.stunTimer = 999; gg.x = 8; gg.z = -1.5; }
  for (const dg of E.scene.dogs) { dg.state = 'flee'; dg.stateTimer = 999; dg.x = -8; dg.z = -1.5; }
  await new Promise((r) => setTimeout(r, 4000));
  const mid = E.useStore.getState().bossTimeRemaining;
  E.useStore.getState().requestRestart();
  await new Promise((r) => setTimeout(r, 300));
  return { arena: E.scene.isBossArena, mid, after: E.useStore.getState().bossTimeRemaining };
});
check('G1 restarting a boss round resets the countdown', g.arena && g.mid <= 57 && g.after >= 59, JSON.stringify(g));

check('no page errors', errors.filter((x) => !/play\(\) failed|404/.test(x)).length === 0, errors.slice(0, 5).join(' | '));
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} scenarios passed`);
await close();
process.exit(failed ? 1 : 0);
