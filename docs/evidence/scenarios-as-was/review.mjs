import { openGame, check, startStage } from './harness.mjs';
const { page, errors, close } = await openGame();
const wait = (ms) => page.waitForTimeout(ms);
await page.evaluate(() => {
  const st = globalThis.__ee.useStore.getState();
  st.upsertSave({ name: 'Tester', skin: 'beige', stage: 22, bestStars: {}, updatedAt: 1, tipsSeen: [], coins: 0, coinStars: {}, lastRewardedRun: null, outfits: ['classic', 'grey'], outfit: 'classic', endlessBest: 0, daily: null });
  st.setActiveSave('tester');
});
const advance = (n, stun = true) => page.evaluate(async ({ n, stun }) => {
  const E = globalThis.__ee;
  for (let i = 0; i < n; i++) {
    if (stun) { for (const g of E.scene.guards) g.stunTimer = 5; for (const d of E.scene.dogs) { d.state = 'flee'; d.stateTimer = 5; } }
    E.player.x = 0; E.player.z += 60;
    await new Promise((r) => setTimeout(r, 150));
  }
}, { n, stun });

// ---- P1: endless respawn near the catch, not at z=1 ----
await page.evaluate(async () => { const st = globalThis.__ee.useStore.getState(); st.setStage(22); st.setGameMode('endless'); st.startRun(); st.resetForSegment(900001); await new Promise((r) => setTimeout(r, 400)); });
await advance(10);
const p1 = await page.evaluate(async () => {
  const E = globalThis.__ee; const before = E.player.z;
  E.handleCatch('arrested'); await new Promise((r) => setTimeout(r, 400));
  const obstaclesNear = E.scene.procgen.obstacles().filter((o) => Math.abs(o.z - E.player.z) < 40).length;
  return { before: Math.round(before), after: Math.round(E.player.z), obstaclesNear, hearts: E.useStore.getState().hearts };
});
check('P1 endless respawn stays near the catch point on live ground', p1.after > p1.before - 40 && p1.obstaclesNear > 3, JSON.stringify(p1));

// ---- U1/P3: stage-22 character in endless: 3 hearts, no razor wire at level 1, day mood ----
const p3 = await page.evaluate(async () => {
  const E = globalThis.__ee; const st = E.useStore.getState();
  st.setGameMode('endless'); st.startRun(); st.resetForSegment(900002); await new Promise((r) => setTimeout(r, 400));
  const heartsStore = E.useStore.getState().hearts;
  const slots = [...document.querySelectorAll('div')].filter((d) => /^[♥♡❤]$/.test(d.textContent?.trim() ?? '')).length;
  const razor = E.scene.razorWire;
  // walk into the side fence at level 1
  const h0 = E.useStore.getState().hearts;
  for (let i = 0; i < 30; i++) { E.player.x = 5.9; await new Promise((r) => setTimeout(r, 16)); }
  await new Promise((r) => setTimeout(r, 400));
  return { heartsStore, razor, heartsAfterFence: E.useStore.getState().hearts, h0, stage: E.useStore.getState().stage };
});
check('P3 endless ignores campaign stage: 3 hearts, no lethal wire at level 1', p3.heartsStore === 3 && !p3.razor && p3.heartsAfterFence === p3.h0, JSON.stringify(p3));

// ---- P2: starting today's daily twice rebuilds (fresh distance, 3 hearts, single payout) ----
const p2 = await page.evaluate(async () => {
  const E = globalThis.__ee; const st = () => E.useStore.getState();
  const day = '2026-09-28';
  const start = async () => { st().setGameMode('daily', day); st().startRun(); st().resetForSegment(424200); await new Promise((r) => setTimeout(r, 450)); };
  await start();
  for (let i = 0; i < 8; i++) { for (const g of E.scene.guards) g.stunTimer = 5; for (const d of E.scene.dogs) { d.state = 'flee'; d.stateTimer = 5; } E.player.z += 60; await new Promise((r) => setTimeout(r, 150)); }
  for (let i = 0; i < 3; i++) { E.handleCatch('arrested'); await new Promise((r) => setTimeout(r, 300)); }
  const coins1 = st().saves.tester.coins; const dist1 = st().runSummary?.distanceM;
  st().setRunState('idle'); await new Promise((r) => setTimeout(r, 200));
  await start();
  const fresh = { maxZ: Math.round(E.scene.maxZ), hearts: st().hearts, pz: Math.round(E.player.z) };
  for (let i = 0; i < 3; i++) { E.handleCatch('arrested'); await new Promise((r) => setTimeout(r, 300)); }
  return { dist1, coins1, fresh, dist2: st().runSummary?.distanceM, coins2: st().saves.tester.coins };
});
check('P2 same-day Daily restart is a fresh run (no stale distance / payout)', p2.fresh.maxZ < 5 && p2.fresh.hearts === 3 && p2.dist2 < 20 && p2.coins2 - p2.coins1 < 3, JSON.stringify(p2));

// ---- P4 + R2: section with a chasing guard is kept; removal zeroes detection ----
const p4 = await page.evaluate(async () => {
  const E = globalThis.__ee; const st = () => E.useStore.getState();
  st().setGameMode('endless'); st().startRun(); st().resetForSegment(900003); await new Promise((r) => setTimeout(r, 400));
  const s = E.scene;
  const g0 = s.guardEntries.find((e) => e.section === 0);
  const id = g0.guard.id;
  for (let i = 0; i < 4; i++) { for (const e of s.guardEntries) if (e !== g0) e.guard.stunTimer = 5; for (const d of s.dogs) { d.state = 'flee'; d.stateTimer = 5; } E.player.x = 0; E.player.z += 60; g0.guard.state = 'chase'; g0.guard.stunTimer = 5; await new Promise((r) => setTimeout(r, 150)); }
  const keptWhileChasing = s.sections.some((x) => x.index === 0);
  g0.guard.state = 'wander';
  st().setDetection(id, 0.9);
  for (let i = 0; i < 2; i++) { for (const g of s.guards) g.stunTimer = 5; E.player.z += 60; await new Promise((r) => setTimeout(r, 150)); }
  const removedAfter = !s.sections.some((x) => x.index === 0);
  const orphan = s.guardEntries.filter((e) => e.section !== null && !s.sections.some((x) => x.index === e.section)).length;
  return { keptWhileChasing, removedAfter, detAfter: st().detection[id] ?? 0, orphan };
});
check('P4 busy section kept, then removed with its guards and zeroed meters', p4.keptWhileChasing && p4.removedAfter && p4.detAfter === 0 && p4.orphan === 0, JSON.stringify(p4));

// ---- R6: can't walk back into the stripped stretch ----
const r6 = await page.evaluate(async () => {
  const E = globalThis.__ee;
  const maxZ = E.scene.maxZ; E.player.z = maxZ - 200; await new Promise((r) => setTimeout(r, 100));
  return { maxZ: Math.round(maxZ), pz: Math.round(E.player.z), start: Math.round(E.scene.procgen.startZ()) };
});
check('R6 endless backtrack is clamped to live ground', r6.pz >= r6.maxZ - 31 && r6.pz >= r6.start, JSON.stringify(r6));

// ---- P7: endless forks alternate sides and start at level >= 3 ----
const p7 = await page.evaluate(async () => {
  const E = globalThis.__ee; const st = () => E.useStore.getState();
  st().setGameMode('endless'); st().startRun(); st().resetForSegment(900004); await new Promise((r) => setTimeout(r, 400));
  const seen = new Map();
  for (let i = 0; i < 14; i++) { for (const g of E.scene.guards) g.stunTimer = 5; for (const d of E.scene.dogs) { d.state = 'flee'; d.stateTimer = 5; } for (const f of E.scene.procgen.forks()) seen.set(Math.round(f.startZ), Math.sign(f.postX)); E.player.x = 0; E.player.z += 60; await new Promise((r) => setTimeout(r, 150)); }
  return [...seen.entries()].sort((a, b) => a[0] - b[0]);
});
const sides = p7.map((x) => x[1]);
check('P7 endless forks alternate sides and begin at level 3+', p7.length >= 3 && p7[0][0] >= 240 && sides.some((s, i) => i > 0 && s !== sides[i - 1]), JSON.stringify(p7));

// ---- P5 + P6: boss popup once; retry keeps the perk heart ----
const p56 = await page.evaluate(async () => {
  const E = globalThis.__ee; const st = () => E.useStore.getState();
  st().setGameMode('campaign'); st().setStage(9); st().startRun(); st().resetForSegment(700009); await new Promise((r) => setTimeout(r, 400));
  st().grantBossPerk();
  let popups = 0; const unsub = E.useStore.subscribe((s, prev) => { if (s.gameModal?.title === 'BOSS ROUND' && prev.gameModal?.title !== 'BOSS ROUND') popups++; });
  E.handleWin(); await new Promise((r) => setTimeout(r, 400));
  // banner NEXT SEGMENT
  st().resetForSegment(st().segmentSeed + 1); await new Promise((r) => setTimeout(r, 500));
  const arena = E.scene.isBossArena; const heartsFirst = st().hearts;
  st().setGameModal(null); st().setPaused(false);
  for (let i = 0; i < heartsFirst; i++) { E.handleCatch('arrested'); await new Promise((r) => setTimeout(r, 350)); }
  const heartsRetry = st().hearts;
  unsub();
  return { popups, arena, stage: st().stage, heartsFirst, heartsRetry };
});
check('P5 BOSS ROUND popup appears exactly once', p56.popups === 1 && p56.arena, JSON.stringify(p56));
check('P6 boss retry keeps the same hearts as the first attempt', p56.heartsRetry === p56.heartsFirst && p56.stage === 10, JSON.stringify(p56));

// ---- R2: restart clears stale detection ----
const r2 = await page.evaluate(async () => {
  const E = globalThis.__ee; const st = () => E.useStore.getState();
  st().setGameModal(null); st().setPaused(false);
  st().setDetection(9999, 1); st().requestRestart(); await new Promise((r) => setTimeout(r, 200));
  return { stale: st().detection[9999] ?? 0 };
});
check('R2 restart clears stale detection meters', r2.stale === 0, JSON.stringify(r2));

check('no page errors', errors.filter((e) => !/404/.test(e)).length === 0, errors.slice(0, 3).join(' | '));
await close();
