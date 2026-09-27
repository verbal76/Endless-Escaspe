import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { updatePlayer, STAMINA_RECOVER_AT } from '../src/systems/PlayerController';
import { input, resetInput } from '../src/systems/InputSystem';
import { createPlayer, createGuard } from '../src/scenes/PrisonYard1';
import { isTouchingFence } from '../src/scenes/Fence';
import { createDog, updateDogs } from '../src/scenes/Dog';
import { RunTracker } from '../src/util/runStats';
import { scoreStars } from '../src/util/scoring';
import { BossClock } from '../src/util/bossClock';
import { updateGuard } from '../src/systems/GuardAI';
import { buildNavGrid } from '../src/systems/NavGrid';
import { ProcgenSystem, NAV_CELL, NAV_INFLATE } from '../src/systems/ProcgenSystem';
import type { Obstacle } from '../src/types/world';

// These are pathing tests: the chaser is told it can see its target.
const SEEN = { visual: true, heard: false, aiTier: 1 };

const DT = 1 / 60;

test('bug 1: razor wire - a player pressed against the fence counts as touching it', () => {
  resetInput();
  const p = createPlayer();
  input.axisX = -1; // screen-right = world +X
  for (let i = 0; i < 300; i++) updatePlayer(p, [], DT, 999);
  assert.ok(p.x > 8, `player only reached x=${p.x}`);
  assert.equal(isTouchingFence(p.x), true);
  input.axisX = 1;
  for (let i = 0; i < 600; i++) updatePlayer(p, [], DT, 999);
  assert.equal(isTouchingFence(p.x), true, 'left fence');
  assert.equal(isTouchingFence(0), false);
  assert.equal(isTouchingFence(7.5), false);
  resetInput();
});

test('bug 2: a chasing dog moves once per frame (never faster than its chase speed)', () => {
  const guard = createGuard({ id: 1, homeX: 0, homeZ: 20, homeRadius: 5 });
  guard.state = 'chase';
  const dog = createDog(1, 1, 1, 20);
  const p = createPlayer();
  p.z = 1;
  const smell = new Map<number, number>();
  let prevX = dog.x;
  let prevZ = dog.z;
  for (let i = 0; i < 30; i++) {
    updateDogs([dog], [guard], p, DT, smell);
    const moved = Math.hypot(dog.x - prevX, dog.z - prevZ);
    assert.ok(moved <= 7.5 * DT + 1e-6, `dog moved ${moved / DT} m/s`);
    prevX = dog.x;
    prevZ = dog.z;
  }
});

test('bug 3: a flawless run scores 3 stars regardless of the stage heart pool', () => {
  const t = new RunTracker();
  t.tickTime(30);
  t.tickDetection(0.1, 30);
  const s = t.snapshot();
  assert.equal(s.livesUsed, 0);
  assert.equal(scoreStars(s), 3);
  t.onCatch();
  assert.equal(t.snapshot().livesUsed, 1);
  t.reset();
  assert.equal(t.snapshot().livesUsed, 0);
});

test('bug 4: running is refused at zero stamina until recovered and re-engaged', () => {
  resetInput();
  const p = createPlayer();
  input.axisY = 1;
  input.run = true;
  let frames = 0;
  while (!p.exhausted && frames < 2000) {
    updatePlayer(p, [], DT, 9999, true);
    frames++;
  }
  assert.ok(p.exhausted, 'never exhausted');
  assert.equal(input.run, false, 'RUN toggle must be switched off');
  // Holding / re-tapping RUN while exhausted must not run at all.
  let prevStamina = p.stamina;
  for (let i = 0; i < 60; i++) {
    input.run = true;
    updatePlayer(p, [], DT, 9999, true);
    assert.equal(p.isRunning, false, `ran at stamina ${p.stamina}`);
    assert.ok(p.stamina >= prevStamina, 'stamina must only regenerate');
    prevStamina = p.stamina;
  }
  while (p.stamina < STAMINA_RECOVER_AT + 0.01) updatePlayer(p, [], DT, 9999, true);
  input.run = true;
  updatePlayer(p, [], DT, 9999, true);
  assert.equal(p.isRunning, true, 'can run again after recovery');
  resetInput();
});

function hedge(x: number, z: number, rotY: number): Obstacle {
  return { id: Math.random(), kind: 'hedgerow', x, z, r: 1.4, halfW: 1.3, halfL: 0.35, rotY, height: 1.1, isCover: false, mesh: null };
}

test('bug 6: a guard inside a U-shaped pocket paths out instead of freezing', () => {
  // Cup open toward -Z; the player is behind its closed end.
  const obs: Obstacle[] = [
    hedge(-1.3, 12, 0),
    hedge(1.3, 12, 0),
    hedge(-2.6, 10.8, Math.PI / 2),
    hedge(2.6, 10.8, Math.PI / 2),
  ];
  const grid = buildNavGrid(obs, NAV_CELL, NAV_INFLATE, -2, 40);
  const g = createGuard({ id: 1, homeX: 0, homeZ: 10.6, homeRadius: 5 });
  g.state = 'chase';
  const p = createPlayer();
  p.x = 0;
  p.z = 16;
  let reached = false;
  for (let i = 0; i < 60 * 12; i++) {
    updateGuard(g, p, 1, DT, obs, undefined, grid, SEEN);
    if (Math.hypot(g.x - p.x, g.z - p.z) < 1.2) {
      reached = true;
      break;
    }
  }
  assert.ok(reached, `guard stuck at ${g.x.toFixed(2)},${g.z.toFixed(2)}`);
});

test('bug 6: chasing guards reach a stationary player across generated layouts', () => {
  let failures = 0;
  for (let seed = 1; seed <= 25; seed++) {
    const pg = new ProcgenSystem(seed * 101, new THREE.Group(), 5, 0);
    pg.init();
    const nav = pg.nav;
    const goal = nav.nearestFree(seed % 2 ? 4 : -4, 90, 20)!;
    const start = nav.nearestFree(seed % 2 ? -5 : 5, 20, 20)!;
    const p = createPlayer();
    p.x = nav.colX(goal.col);
    p.z = nav.rowZ(goal.row);
    const g = createGuard({ id: 1, homeX: nav.colX(start.col), homeZ: nav.rowZ(start.row), homeRadius: 5 });
    g.state = 'chase';
    let ok = false;
    for (let i = 0; i < 60 * 40; i++) {
      updateGuard(g, p, 1, DT, pg.obstacles(), undefined, nav, SEEN);
      if (Math.hypot(g.x - p.x, g.z - p.z) < 1.3) {
        ok = true;
        break;
      }
    }
    if (!ok) failures++;
  }
  assert.equal(failures, 0);
});

test('bug 7: restarting a boss round re-arms the full countdown; ticks are real-time', () => {
  const c = new BossClock();
  c.arm(60);
  for (let i = 0; i < 60 * 25; i++) c.tick(DT);
  assert.ok(c.remaining < 36);
  c.arm(60); // what resetSegment does on restart
  assert.equal(c.remaining, 60);
  assert.equal(c.displaySeconds(), 60);
  let finished = false;
  for (let i = 0; i < 60 * 61 && !finished; i++) finished = c.tick(DT);
  assert.ok(finished);
  const off = new BossClock();
  off.arm(0);
  assert.equal(off.tick(1), false);
});
