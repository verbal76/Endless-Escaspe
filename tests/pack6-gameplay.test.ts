// Regression tests for the gameplay review (B-1 .. B-11, A-2).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createGuard, createPlayer } from '../src/scenes/PrisonYard1';
import {
  EXTERNAL_FEED_GAIN,
  externalFeedFor,
  updateDetection,
  type DetectionTuning,
} from '../src/systems/DetectionSystem';
import { updateGuard, hearNoiseAt, type GuardSenses } from '../src/systems/GuardAI';
import { createDog, updateDog, SMELL_HANDLER_RANGE, leashFollowSpeed } from '../src/scenes/Dog';
import {
  BEAM_FOOTPRINT_OFFSET,
  LIGHT_FOOTPRINT_R,
  TRACK_TURN_RATE,
  isPlayerLit,
  spawnLightTowers,
  updateLightTower,
} from '../src/scenes/LightTower';
import { resolveMove } from '../src/systems/PlayerController';
import { applyCrowbarStun, crowbarTargetGuard } from '../src/systems/Crowbar';
import { clearsCombatState, moodStageFor, weatherRules } from '../src/game/runRules';
import { seedSimRandom } from '../src/util/rng';
import { useStore } from '../src/state/store';
import { obstacleHitsCircle } from '../src/util/collision';
import { PLAYER_RADIUS, PLAYER_X_LIMIT, PLAY_HALF_W } from '../src/util/geometry';
import type { Guard, Obstacle } from '../src/types/world';

const DT = 1 / 60;
const TUNING: DetectionTuning = { rateScale: 1 / 6, decay: 0.15, noiseRangeWalkSq: 81, noiseRangeCrouchSq: 25 };
const BLIND: GuardSenses = { visual: false, heard: false, aiTier: 1, external: false };

function crate(x: number, z: number, height = 1.2): Obstacle {
  return { id: 1, kind: 'crate', x, z, r: 0.75, halfW: 0.5, halfL: 0.5, rotY: 0.6, height, isCover: false, mesh: null } as Obstacle;
}
function tree(x: number, z: number): Obstacle {
  return { id: 2, kind: 'tree', x, z, r: 0.5, height: 4, isCover: false, mesh: null } as Obstacle;
}

// ---- B-1: positionless external feeds -------------------------------

test('B-1: guard never sits in investigate without a goal (invariant)', () => {
  const g = createGuard({ id: 1, homeX: 0, homeZ: 20, homeRadius: 5 });
  const p = createPlayer();
  p.x = 0;
  p.z = 60;
  // Meter pinned above the investigate threshold by a feed that
  // carries no position, empty memory.
  for (let i = 0; i < 60 * 10; i++) {
    updateGuard(g, p, 0.6, DT, [], undefined, null, BLIND);
    assert.ok(g.state !== 'investigate' || g.investigationTarget !== null, `frame ${i}: investigate without target`);
  }
  // Even forced into investigate with no target, it does not freeze.
  g.state = 'investigate';
  g.investigationTarget = null;
  g.behaviorTimer = 0;
  updateGuard(g, p, 0.6, DT, [], undefined, null, BLIND);
  assert.notEqual(g.state, 'investigate');
});

test('B-1: an external feed gives the guard a fix near the player and it moves', () => {
  seedSimRandom(7);
  const g = createGuard({ id: 1, homeX: 0, homeZ: 20, homeRadius: 3 });
  g.x = 0;
  g.z = 20;
  const p = createPlayer();
  p.x = 4;
  p.z = 28;
  const ext: GuardSenses = { ...BLIND, external: true };
  const startX = g.x;
  const startZ = g.z;
  for (let i = 0; i < 60 * 3; i++) updateGuard(g, p, 0.6, DT, [], undefined, null, ext);
  assert.equal(g.state, 'investigate');
  assert.ok(g.investigationTarget, 'has a goal');
  const err = Math.hypot((g.investigationTarget as { x: number }).x - p.x, (g.investigationTarget as { z: number }).z - p.z);
  assert.ok(err < 9, `fix within the search radius of the player (err ${err.toFixed(1)})`);
  assert.ok(Math.hypot(g.x - startX, g.z - startZ) > 3, 'guard actually searches');
});

test('B-1: floodlight / searchlight feeds only reach guards in sight range', () => {
  const p = createPlayer();
  p.x = 0;
  p.z = 40;
  const near = createGuard({ id: 1, homeX: 0, homeZ: 30, homeRadius: 3 });
  const far = createGuard({ id: 2, homeX: 0, homeZ: 90, homeRadius: 3 });
  far.facing = -Math.PI / 2; // looking away; irrelevant
  const light = 0.2 * EXTERNAL_FEED_GAIN + 0.4;
  assert.ok(externalFeedFor(near, p, 14, light, 0) > 0);
  assert.equal(externalFeedFor(far, p, 14, light, 0), 0);
  // Smoke between the guard and the lit player blocks the feed.
  assert.equal(externalFeedFor(near, p, 14, light, 0, [{ x: 0, z: 35, radius: 2 }]), 0);
  // Stunned guards get nothing.
  near.stunTimer = 1;
  assert.equal(externalFeedFor(near, p, 14, light, 0), 0);
  // The far guard's meter does not move while the player stands lit.
  let m = 0;
  for (let i = 0; i < 60 * 5; i++) {
    m = updateDetection(far, p, [], m, DT, 14, TUNING, 1, [], externalFeedFor(far, p, 14, light * DT, 0));
  }
  assert.equal(m, 0);
});

test('B-1: a dog away from its handler does not feed the handler', () => {
  const handler = createGuard({ id: 1, homeX: 0, homeZ: 10, homeRadius: 3 });
  handler.x = 0;
  handler.z = 10;
  const p = createPlayer();
  p.stance = 'crouch';
  p.isCrouched = true;
  const d = createDog(1, 1, 0, 10 + SMELL_HANDLER_RANGE + 5);
  p.x = 3;
  p.z = d.z;
  // Freeze the dog in place for the probe (no grid, no obstacles).
  const smellFar = updateDog(d, handler, p, DT);
  assert.equal(smellFar, 0);
});

// ---- B-2: pause freezes, leaving clears -------------------------------

test('B-2: pausing keeps bullets and aim wind-ups; leaving gameplay clears them', () => {
  assert.equal(clearsCombatState('playing'), false); // paused while playing
  assert.equal(clearsCombatState('idle'), true);
  assert.equal(clearsCombatState('caught'), true);
  assert.equal(clearsCombatState('cleared'), true);
});

// ---- B-3: restart empties the bag ------------------------------------

test('B-3: requestRestart empties the inventory', () => {
  const st = useStore.getState();
  st.addPickup('crowbar');
  st.addPickup('smokebomb');
  st.addPickup('rock');
  assert.ok(useStore.getState().inventory.crowbar > 0);
  useStore.getState().requestRestart();
  assert.deepEqual(useStore.getState().inventory, { crowbar: 0, smokebomb: 0, rock: 0 });
});

// ---- B-4: mood hash --------------------------------------------------

test('B-4: Endless / Daily mood is spread over all four moods for real seeds', () => {
  const counts = [0, 0, 0, 0, 0];
  let s = 0x2545f491;
  for (let i = 0; i < 2000; i++) {
    s = (Math.imul(s, 1103515245) + 12345) & 0x7fffffff; // seeds of real magnitude
    counts[moodStageFor(5, 'endless', s)]++;
  }
  for (let m = 1; m <= 4; m++) assert.ok(counts[m] > 2000 * 0.15, `mood ${m}: ${counts[m]}`);
  assert.equal(moodStageFor(7, 'campaign', 123456789), 7);
  assert.equal(moodStageFor(1, 'daily', 0x7fffffff), moodStageFor(9, 'daily', 0x7fffffff));
});

// ---- B-5: floodlight reach and turn rate ------------------------------

test('B-5: every walkable x can be lit by some tower of a row', () => {
  const towers = spawnLightTowers(new THREE.Group(), 100, 1, 1, true);
  const rz = towers[0].z;
  assert.ok(BEAM_FOOTPRINT_OFFSET + LIGHT_FOOTPRINT_R >= PLAY_HALF_W + 0.6 + 0.5);
  const unlit: number[] = [];
  for (let x = -PLAYER_X_LIMIT; x <= PLAYER_X_LIMIT + 1e-9; x += 0.05) {
    let ok = false;
    for (const t of towers) {
      for (let dz = -6; dz <= 6 && !ok; dz += 0.5) {
        for (let a = 0; a < 360 && !ok; a += 2) {
          t.scanAngle = (a * Math.PI) / 180;
          if (isPlayerLit(t, x, rz + dz)) ok = true;
        }
      }
      if (ok) break;
    }
    if (!ok) unlit.push(+x.toFixed(2));
  }
  assert.deepEqual(unlit, []);
  // The centre line itself is reachable at the tower's own z.
  let centre = false;
  for (const t of towers) {
    for (let a = 0; a < 360 && !centre; a += 1) {
      t.scanAngle = (a * Math.PI) / 180;
      if (isPlayerLit(t, 0, rz)) centre = true;
    }
  }
  assert.ok(centre);
});

test('B-5: a tracking tower turns at a limited rate', () => {
  const [t] = spawnLightTowers(new THREE.Group(), 100, 1, 1, true);
  // Put the player in the footprint so the tower acquires.
  const fx = t.x + Math.sin(t.scanAngle) * BEAM_FOOTPRINT_OFFSET;
  const fz = t.z + Math.cos(t.scanAngle) * BEAM_FOOTPRINT_OFFSET;
  updateLightTower(t, DT, fx, fz);
  assert.equal(t.state, 'track');
  // Player steps to the footprint edge (big bearing change): the
  // beam swings, it does not snap.
  const before = t.scanAngle;
  const px = fx + LIGHT_FOOTPRINT_R * 0.9;
  updateLightTower(t, DT, px, fz);
  const step = Math.abs(Math.atan2(Math.sin(t.scanAngle - before), Math.cos(t.scanAngle - before)));
  assert.ok(step <= TRACK_TURN_RATE * DT + 1e-9, `turned ${step}`);
  assert.ok(step > 0);
});

// ---- B-6: leashed dog keeps up ---------------------------------------

test('B-6: a leashed dog keeps up with an investigating / chasing handler', () => {
  for (const speed of [4.0, 5.0]) {
    const handler = createGuard({ id: 1, homeX: 3, homeZ: 0, homeRadius: 3 });
    handler.x = 3;
    handler.z = 0;
    const d = createDog(1, 1, 2, 0);
    const p = createPlayer();
    p.x = -8;
    p.z = -50; // far away: no smell, no engage
    let worst = 0;
    for (let i = 0; i < 60 * 10; i++) {
      handler.z += speed * DT;
      updateDog(d, handler, p, DT);
      worst = Math.max(worst, Math.hypot(d.x - handler.x, d.z - handler.z));
    }
    assert.equal(d.state, 'leash');
    assert.ok(worst < 4, `speed ${speed}: dog fell ${worst.toFixed(1)} m behind`);
  }
  assert.ok(leashFollowSpeed(0) <= 2.2 + 1e-9);
});

// ---- B-7: player collision ---------------------------------------------

function overlapping(obs: readonly Obstacle[], x: number, z: number): boolean {
  return obs.some((o) => obstacleHitsCircle(o, x, z, PLAYER_RADIUS - 0.002));
}

test('B-7: a prop poking past the fence never traps the player', () => {
  const o = crate(8.2, 20);
  const obs = [o];
  for (const dirZ of [1, -1]) {
    let x = 8.0;
    let z = 20 - dirZ * 4;
    // Sprint diagonally into the fence and the prop.
    for (let i = 0; i < 180; i++) {
      ({ x, z } = resolveMove(x, z, 0.7 * 7 * DT, dirZ * 0.7 * 7 * DT, obs, 400));
      assert.ok(!overlapping(obs, x, z), `overlap at ${x.toFixed(2)},${z.toFixed(2)}`);
      assert.ok(Math.abs(x) <= PLAYER_X_LIMIT + 1e-9);
    }
    // Walking away along the fence, into the yard, or diagonally
    // away all make progress (they froze before).
    const away = Math.sign(z - o.z) || -dirZ;
    for (const [ux, uz] of [[0, away], [-1, 0], [-0.7, 0.7 * away], [-0.7, -0.7 * away]]) {
      let px = x;
      let pz = z;
      for (let i = 0; i < 60; i++) ({ x: px, z: pz } = resolveMove(px, pz, ux * 3.5 * DT, uz * 3.5 * DT, obs, 400));
      assert.ok(Math.hypot(px - x, pz - z) > 0.5, `dir ${ux},${uz} stuck at ${x.toFixed(2)},${z.toFixed(2)}`);
      assert.ok(!overlapping(obs, px, pz));
    }
  }
});

test('B-7: pushing into the flank of a round prop slides around it', () => {
  const obs = [tree(0.3, 5)];
  let x = 0;
  let z = 3;
  for (let i = 0; i < 60 * 4; i++) ({ x, z } = resolveMove(x, z, 0, 3.5 * DT, obs, 400));
  assert.ok(z > 6.5, `stuck at z=${z.toFixed(2)}`);
  assert.ok(!overlapping(obs, x, z));
});

test('B-7: a respawn wedged between a prop and the fence is ejected inside the bounds', () => {
  const obs = [crate(8.4, 10)];
  const out = resolveMove(PLAYER_X_LIMIT, 10, 0, 0, obs, 400);
  assert.ok(!overlapping(obs, out.x, out.z));
  assert.ok(Math.abs(out.x) <= PLAYER_X_LIMIT + 1e-9);
});

// ---- B-8: determinism -----------------------------------------------

function runGuards(seed: number, noise: () => number): string {
  const orig = Math.random;
  Math.random = noise; // any stray Math.random use breaks determinism
  try {
    seedSimRandom(seed);
    const guards: Guard[] = [0, 1, 2].map((i) => createGuard({ id: i + 1, homeX: -4 + i * 4, homeZ: 15 + i * 10, homeRadius: 5 }));
    const p = createPlayer();
    p.x = 0;
    p.z = 22;
    const d = createDog(1, 1, -3, 15);
    for (let f = 0; f < 60 * 20; f++) {
      p.z = 22 + Math.sin(f / 60) * 3;
      for (const g of guards) {
        const heard = f % 90 < 30;
        updateGuard(g, p, f > 300 && f < 900 ? 0.5 : 0.1, DT, [], undefined, null, { visual: false, heard, aiTier: 2, external: false });
      }
      if (f === 400) d.state = 'confused';
      updateDog(d, guards[0], p, DT);
    }
    return guards.map((g) => `${g.x.toFixed(4)},${g.z.toFixed(4)},${g.state}`).join(' ') + ` dog ${d.x.toFixed(4)},${d.z.toFixed(4)}`;
  } finally {
    Math.random = orig;
  }
}

test('B-8: same seed and inputs replay the same guard / dog positions', () => {
  let k = 1;
  const a = runGuards(99, () => 0.123);
  const b = runGuards(99, () => ((k = (k * 16807) % 2147483647) / 2147483647));
  assert.equal(a, b);
  assert.notEqual(runGuards(100, () => 0.5), a);
});

test('B-8: the Daily applies its rolled weather rules whatever the visual toggle', () => {
  assert.deepEqual(weatherRules('daily', false, 'clear', 'rain'), weatherRules('daily', true, 'rain', 'rain'));
  // Campaign / Endless keep the toggle compensation.
  assert.deepEqual(weatherRules('endless', false, 'clear', 'rain'), { vision: 1.1, noise: 1.0 });
});

// ---- B-10: crowbar line of sight --------------------------------------

test('B-10: the crowbar does not reach through a tall prop', () => {
  const g = createGuard({ id: 1, homeX: 0, homeZ: 12.5, homeRadius: 1 });
  g.x = 0;
  g.z = 12.5;
  const wall: Obstacle = { id: 3, kind: 'cover', x: 0, z: 11.25, r: 1.1, halfW: 1.0, halfL: 0.35, rotY: 0, height: 1.5, isCover: true, mesh: null } as Obstacle;
  assert.equal(crowbarTargetGuard(0, 10, [g], [wall]), null);
  assert.equal(applyCrowbarStun(0, 10, [g], [wall]), false);
  assert.equal(g.stunTimer, 0);
  // A low wall you can reach over does not block.
  const low = { ...wall, height: 0.5 } as Obstacle;
  assert.equal(applyCrowbarStun(0, 10, [g], [low]), true);
  assert.ok(g.stunTimer > 0);
});

// ---- B-11: new cue restarts the investigation -------------------------

test('B-11: a rock during an investigation restarts the search clock', () => {
  seedSimRandom(3);
  const g = createGuard({ id: 1, homeX: 0, homeZ: 10, homeRadius: 3 });
  const p = createPlayer();
  p.z = -40;
  hearNoiseAt(g, 2, 14);
  assert.equal(g.state, 'investigate');
  g.behaviorTimer = 20.5; // late in the old investigation
  hearNoiseAt(g, -3, 20);
  assert.equal(g.behaviorTimer, 0);
  assert.deepEqual(g.investigationTarget, { x: -3, z: 20 });
  for (let i = 0; i < 60 * 3; i++) updateGuard(g, p, 0.3, DT, [], undefined, null, BLIND);
  assert.equal(g.state, 'investigate');
});
