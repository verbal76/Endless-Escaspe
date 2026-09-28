import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGuard, createPlayer } from '../src/scenes/PrisonYard1';
import { belief, hearNoiseAt, updateGuard, type GuardSenses } from '../src/systems/GuardAI';
import { selectRuleLevel } from '../src/state/store';

const DT = 1 / 60;
const BLIND: GuardSenses = { visual: false, heard: false, aiTier: 1 };

test('a rock heard after an old sighting wins: the guard investigates the rock, not the old spot', () => {
  const g = createGuard({ id: 1, homeX: 0, homeZ: 10, homeRadius: 6 });
  const p = createPlayer();
  p.x = 30; p.z = 80; // far away, unseen
  g.lastSeen = { x: -6, z: 30 };
  g.sinceSeen = 20; // seen long ago
  hearNoiseAt(g, 6, 5);
  for (let i = 0; i < 30; i++) updateGuard(g, p, 0.45, DT, [], undefined, null, BLIND);
  assert.deepEqual(g.investigationTarget, { x: 6, z: 5 });
  assert.deepEqual(belief(g), { x: 6, z: 5 });
});

test('a fresh sighting still beats an older noise fix', () => {
  const g = createGuard({ id: 2, homeX: 0, homeZ: 10, homeRadius: 6 });
  g.lastHeard = { x: 5, z: 5 };
  g.sinceHeard = 3;
  g.lastSeen = { x: -2, z: 12 };
  g.sinceSeen = 0.5;
  assert.deepEqual(belief(g), { x: -2, z: 12 });
});

test('HUD rule level: campaign stage in campaign, distance level in Endless / Daily', () => {
  assert.equal(selectRuleLevel({ gameMode: 'campaign', stage: 22, endlessLevel: 3 }), 22);
  assert.equal(selectRuleLevel({ gameMode: 'endless', stage: 22, endlessLevel: 3 }), 3);
  assert.equal(selectRuleLevel({ gameMode: 'daily', stage: 22, endlessLevel: 1 }), 1);
});

test('RUN toggled on while standing still does not drain stamina; sprinting does', async () => {
  const { updatePlayer } = await import('../src/systems/PlayerController');
  const { input } = await import('../src/systems/InputSystem');
  const p = createPlayer();
  input.run = true;
  input.axisX = 0;
  input.axisY = 0;
  for (let i = 0; i < 300; i++) updatePlayer(p, [], DT, 500, true);
  assert.equal(p.stamina, 1);
  assert.equal(input.run, true);
  input.axisY = 1;
  for (let i = 0; i < 60; i++) updatePlayer(p, [], DT, 500, true);
  assert.ok(p.stamina < 1);
  input.run = false;
  input.axisY = 0;
});

test('crouching beside a low wall (0.6 m) counts as near cover, like the sight check', async () => {
  const { isNearCover } = await import('../src/systems/HideSystem');
  const p = createPlayer();
  p.stance = 'crouch';
  p.isCrouched = true;
  p.x = 0; p.z = 10;
  const lowWall = { kind: 'lowWall', x: 1.2, z: 10, r: 0.6, height: 0.6 } as unknown as Parameters<typeof isNearCover>[1][number];
  assert.equal(isNearCover(p, [lowWall]), true);
});
