import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGuard, createPlayer } from '../src/scenes/PrisonYard1';
import {
  guardCanSee,
  updateDetection,
  noiseRadius,
  NON_VISUAL_CAP,
  type DetectionTuning,
  type DetectionResult,
} from '../src/systems/DetectionSystem';
import { isNearCover } from '../src/systems/HideSystem';
import { updateGuard, AIM_TIME_S, hearNoiseAt, type GuardSenses } from '../src/systems/GuardAI';
import { ProjectileSystem } from '../src/systems/ProjectileSystem';
import { createDog, updateDog, scareDog, DOG_CHASE_SPEED, DOG_GIVE_UP_DIST } from '../src/scenes/Dog';
import { applyDeadZone, JOYSTICK_DEAD_ZONE } from '../src/systems/InputSystem';
import { buildNavGrid } from '../src/systems/NavGrid';
import { NAV_CELL, NAV_INFLATE } from '../src/systems/ProcgenSystem';
import { moveSpeed } from '../src/systems/PlayerController';
const PLAYER_RUN_SPEED = moveSpeed('walk', true);
import type { Obstacle } from '../src/types/world';
import * as THREE from 'three';

const DT = 1 / 60;
const TUNING: DetectionTuning = { rateScale: 1 / 6, decay: 0.15, noiseRangeWalkSq: 81, noiseRangeCrouchSq: 25 };

function barrier(x: number, z: number, rotY = 0): Obstacle {
  // barrierB "cover" prop: 2.0 x 1.0 footprint, 1.4 m tall.
  return { id: 1, kind: 'cover', x, z, r: 1.17, halfW: 1.0, halfL: 0.5, rotY, height: 1.4, isCover: true, mesh: null };
}

function lookingAt(gx: number, gz: number, tx: number, tz: number) {
  const g = createGuard({ id: 1, homeX: gx, homeZ: gz, homeRadius: 5 });
  g.facing = Math.atan2(tz - gz, tx - gx);
  return g;
}

test('cover is directional: it hides only when between guard and player', () => {
  const p = createPlayer();
  p.x = 0;
  p.z = 10;
  p.stance = 'crouch';
  p.isCrouched = true;
  const cover = [barrier(0, 9)]; // just in front (toward -Z) of the player
  // Guard behind the cover (south): blocked.
  assert.equal(guardCanSee(lookingAt(0, 4, 0, 10), p, cover, 10), false);
  // Guard on the player's side (north): the same prop is behind the
  // player and hides nothing.
  assert.equal(guardCanSee(lookingAt(0, 16, 0, 10), p, cover, 10), true);
  // Guard off to the flank: open line.
  assert.equal(guardCanSee(lookingAt(6, 10, 0, 10), p, cover, 10), true);
});

test('crouching next to cover no longer hides the player on its own', () => {
  const p = createPlayer();
  p.x = 0;
  p.z = 10;
  p.stance = 'crouch';
  p.isCrouched = true;
  const cover = [barrier(1.4, 10, Math.PI / 2)];
  assert.equal(isNearCover(p, cover), true);
  const guard = lookingAt(-5, 10, 0, 10);
  const out: DetectionResult = { visual: false, heard: false };
  const next = updateDetection(guard, p, cover, 0, DT, 10, TUNING, 1, [], 0, out);
  assert.equal(out.visual, true);
  assert.ok(next > 0);
});

test('detection decays whenever sight is lost, even with faint noise nearby', () => {
  const p = createPlayer();
  p.x = 0;
  p.z = 10;
  p.stance = 'crouch';
  p.isCrouched = true;
  p.vz = 1; // creeping
  const guard = lookingAt(0, 7, 0, 0); // facing away, 3 m off
  let d = 0.6;
  for (let i = 0; i < 60; i++) d = updateDetection(guard, p, [], d, DT, 10, TUNING);
  assert.ok(d < 0.6, `meter did not decay: ${d}`);
});

test('noise alone cannot push a guard into chase', () => {
  const p = createPlayer();
  p.x = 0;
  p.z = 10;
  p.isRunning = true;
  p.vz = 7;
  const guard = lookingAt(0, 8, 0, 0); // 2 m away, back turned
  let d = 0;
  for (let i = 0; i < 600; i++) d = updateDetection(guard, p, [], d, DT, 10, TUNING);
  assert.ok(d > 0.4, 'running right behind a guard should alert them');
  assert.ok(d <= NON_VISUAL_CAP + 1e-9, `noise pushed meter to ${d}`);
});

test('noise radius: silent when still, crouch < walk < run', () => {
  const p = createPlayer();
  assert.equal(noiseRadius(p, TUNING), 0);
  p.vz = 1;
  const walk = noiseRadius(p, TUNING);
  p.isRunning = true;
  const run = noiseRadius(p, TUNING);
  p.isRunning = false;
  p.isCrouched = true;
  const crouch = noiseRadius(p, TUNING);
  assert.ok(crouch < walk && walk < run, `${crouch} ${walk} ${run}`);
});

const SEEN: GuardSenses = { visual: true, heard: false, aiTier: 2 };
const BLIND: GuardSenses = { visual: false, heard: false, aiTier: 2 };

test('guards never fire without line of sight', () => {
  const p = createPlayer();
  p.z = 8;
  const g = lookingAt(0, 2, 0, 8);
  let shots = 0;
  for (let i = 0; i < 300; i++) updateGuard(g, p, 1, DT, [], () => shots++, null, BLIND);
  assert.equal(shots, 0);
});

test('guards telegraph (aim) before every shot, and breaking LOS cancels it', () => {
  const p = createPlayer();
  p.z = 8;
  const g = lookingAt(0, 2, 0, 8);
  let shots = 0;
  let sawAim = false;
  let t = 0;
  while (shots === 0 && t < 3) {
    updateGuard(g, p, 1, DT, [], () => shots++, null, SEEN);
    if (g.aimTimer > 0) sawAim = true;
    t += DT;
  }
  assert.equal(shots, 1);
  assert.ok(sawAim, 'no wind-up before the shot');
  assert.ok(t >= AIM_TIME_S - 1e-6, `fired after only ${t}s`);
  // Next wind-up gets cancelled by losing sight half-way.
  g.fireCooldown = 0;
  for (let i = 0; i < Math.floor((AIM_TIME_S * 0.6) / DT); i++) updateGuard(g, p, 1, DT, [], () => shots++, null, SEEN);
  assert.ok(g.aimTimer > 0);
  updateGuard(g, p, 1, DT, [], () => shots++, null, BLIND);
  assert.equal(g.aimTimer, 0);
  assert.equal(shots, 1);
});

test('props stop bullets', () => {
  const root = new THREE.Group();
  const ps = new ProjectileSystem(root);
  const p = createPlayer();
  p.z = 12;
  ps.spawn(0, 2, 0, 12);
  let hit = false;
  for (let i = 0; i < 120; i++) hit = ps.update(DT, p, [barrier(0, 7)]) || hit;
  assert.equal(hit, false);
  assert.equal(ps.count(), 0);
  ps.spawn(0, 2, 0, 12);
  hit = false;
  for (let i = 0; i < 120; i++) hit = ps.update(DT, p, []) || hit;
  assert.equal(hit, true);
});

test('tier 2: a guard that loses sight scans, then searches the last-seen spot - not the live position', () => {
  const p = createPlayer();
  p.x = 0;
  p.z = 10;
  const g = lookingAt(0, 2, 0, 10);
  g.state = 'chase';
  updateGuard(g, p, 1, DT, [], undefined, null, SEEN);
  // Player slips away behind the guard's back.
  p.x = -8;
  p.z = 2;
  updateGuard(g, p, 0.9, DT, [], undefined, null, BLIND);
  assert.ok(g.lookTimer > 0, 'tier 2 guard should stop and scan');
  for (let i = 0; i < 60 * 6; i++) updateGuard(g, p, 0.9, DT, [], undefined, null, BLIND);
  assert.deepEqual(g.lastSeen, { x: 0, z: 10 });
  const toLastSeen = Math.hypot(g.x - 0, g.z - 10);
  const toPlayer = Math.hypot(g.x - p.x, g.z - p.z);
  assert.ok(toLastSeen < toPlayer, 'guard homed in on the player it could not see');
  // Tier 1 guards skip the scan.
  const g1 = lookingAt(0, 2, 0, 10);
  g1.state = 'chase';
  updateGuard(g1, p, 1, DT, [], undefined, null, { visual: true, heard: false, aiTier: 1 });
  updateGuard(g1, p, 0.9, DT, [], undefined, null, { visual: false, heard: false, aiTier: 1 });
  assert.equal(g1.lookTimer, 0);
});

test('distraction-style noise sends a guard to the noise source', () => {
  const g = lookingAt(0, 2, 0, 10);
  hearNoiseAt(g, 5, 20);
  assert.equal(g.state, 'investigate');
  assert.deepEqual(g.investigationTarget, { x: 5, z: 20 });
});

test('dogs: a sprinting player outruns a chasing dog and it gives up', () => {
  assert.ok(DOG_CHASE_SPEED < PLAYER_RUN_SPEED);
  const handler = createGuard({ id: 1, homeX: 0, homeZ: 0, homeRadius: 5 });
  const d = createDog(1, 1, 0, 0);
  const p = createPlayer();
  p.x = 0;
  p.z = 3;
  updateDog(d, handler, p, DT);
  assert.equal(d.state, 'chase');
  let t = 0;
  while (d.state === 'chase' && t < 20) {
    p.z += PLAYER_RUN_SPEED * DT;
    updateDog(d, handler, p, DT);
    t += DT;
  }
  assert.notEqual(d.state, 'chase');
  // Either it fell too far behind or ran out of patience - both with
  // the player well clear.
  assert.ok(t < 20);
  assert.ok(Math.hypot(p.x - d.x, p.z - d.z) > 8);
  assert.ok(DOG_GIVE_UP_DIST > 8);
});

test('dogs: from stage 5, a stamina-limited sprint then walking still escapes', async () => {
  const { updatePlayer } = await import('../src/systems/PlayerController');
  const { input, resetInput } = await import('../src/systems/InputSystem');
  resetInput();
  const handler = createGuard({ id: 1, homeX: 0, homeZ: 0, homeRadius: 5 });
  const d = createDog(1, 1, 0, 0);
  const p = createPlayer();
  p.z = 3.5;
  updateDog(d, handler, p, DT);
  assert.equal(d.state, 'chase');
  input.axisY = 1;
  input.run = true;
  let caught = false;
  for (let i = 0; i < 60 * 12 && !caught; i++) {
    updatePlayer(p, [], DT, 9999, true); // stamina on
    updateDog(d, handler, p, DT);
    caught = d.state === 'chase' && Math.hypot(d.x - p.x, d.z - p.z) < 0.45;
  }
  resetInput();
  assert.equal(caught, false);
  // Walking only: the dog wins.
  const d2 = createDog(2, 1, 0, 0);
  const p2 = createPlayer();
  p2.z = 3.5;
  updateDog(d2, handler, p2, DT);
  let caught2 = false;
  for (let i = 0; i < 60 * 6 && !caught2; i++) {
    p2.z += 3.5 * DT;
    updateDog(d2, handler, p2, DT);
    caught2 = Math.hypot(d2.x - p2.x, d2.z - p2.z) < 0.45;
  }
  assert.equal(caught2, true);
});

test('dogs: smoke makes them lose the scent; a crowbar scares them off', () => {
  const handler = createGuard({ id: 1, homeX: 0, homeZ: 0, homeRadius: 5 });
  const d = createDog(1, 1, 0, 0);
  const p = createPlayer();
  p.z = 3;
  updateDog(d, handler, p, DT);
  assert.equal(d.state, 'chase');
  updateDog(d, handler, p, DT, { grid: null, obstacles: [], smoke: [{ x: 0, z: 3, radius: 3.5 }] });
  assert.equal(d.state, 'confused');
  const d2 = createDog(2, 1, 0, 1);
  updateDog(d2, handler, p, DT);
  assert.equal(scareDog(d2, p.x, p.z, 3.5), true);
  assert.equal(d2.state, 'flee');
  const before = Math.hypot(d2.x - p.x, d2.z - p.z);
  for (let i = 0; i < 60; i++) updateDog(d2, handler, p, DT);
  assert.ok(Math.hypot(d2.x - p.x, d2.z - p.z) > before + 2);
});

test('dogs path around props instead of running into them', () => {
  const wall: Obstacle[] = [-3.9, -1.3, 1.3, 3.9].map((x, i) => ({
    id: i, kind: 'hedgerow' as const, x, z: 6, r: 1.4, halfW: 1.3, halfL: 0.35, rotY: 0, height: 1.1, isCover: false, mesh: null,
  }));
  const grid = buildNavGrid(wall, NAV_CELL, NAV_INFLATE, -2, 30);
  const handler = createGuard({ id: 1, homeX: 0, homeZ: 2, homeRadius: 5 });
  handler.state = 'chase';
  const d = createDog(1, 1, 0, 3);
  const p = createPlayer();
  p.x = 0;
  p.z = 10;
  p.isCrouched = true;
  let caught = false;
  for (let i = 0; i < 60 * 8 && !caught; i++) {
    updateDog(d, handler, p, DT, { grid, obstacles: wall, smoke: [] });
    caught = Math.hypot(d.x - p.x, d.z - p.z) < 0.5;
  }
  assert.ok(caught, `dog stuck at ${d.x.toFixed(2)},${d.z.toFixed(2)}`);
});

test('joystick dead zone: small deflection is ignored, full deflection is preserved', () => {
  assert.deepEqual(applyDeadZone(0.1, 0.05), { x: 0, y: 0 });
  const edge = applyDeadZone(JOYSTICK_DEAD_ZONE + 0.001, 0);
  assert.ok(edge.x > 0 && edge.x < 0.01);
  const full = applyDeadZone(0, 1);
  assert.ok(Math.abs(full.y - 1) < 1e-9);
});
