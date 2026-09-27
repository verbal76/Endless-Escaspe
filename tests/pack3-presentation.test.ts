import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { meshYaw } from '../src/scenes/Obstacles';
import { createWeather } from '../src/scenes/Weather';
import { createBackdrop, createTreeLine } from '../src/scenes/Backdrop';
import { getStageLighting } from '../src/scenes/Lighting';
import { ProcgenSystem } from '../src/systems/ProcgenSystem';
import { disposeSubtree } from '../src/util/dispose';
import type { Obstacle } from '../src/types/world';

function drawables(root: THREE.Object3D): number {
  let n = 0;
  root.traverse((c) => {
    if ((c as THREE.Mesh).isMesh || (c as THREE.Line).isLine || (c as THREE.Points).isPoints) n++;
  });
  return n;
}

test('prop meshes are rotated the same way as their collision boxes', () => {
  for (const rotY of [0.3, 0.6, 1.1, 2.5, 4.0]) {
    const o = { rotY } as Obstacle;
    const obj = new THREE.Object3D();
    obj.rotation.y = meshYaw(o, () => 0);
    obj.updateMatrixWorld();
    const axis = new THREE.Vector3(1, 0, 0).applyMatrix4(new THREE.Matrix4().extractRotation(obj.matrixWorld));
    // OBB local +X in world (see circleHitObb): (cos rotY, sin rotY).
    assert.ok(Math.abs(axis.x - Math.cos(rotY)) < 1e-9 && Math.abs(axis.z - Math.sin(rotY)) < 1e-9, `rotY ${rotY}`);
  }
});

test('rain and snow render in one draw call each', () => {
  for (const kind of ['rain', 'snow'] as const) {
    const w = createWeather(kind, 0, 0);
    // particles + (rain only) the lightning plane
    assert.ok(drawables(w.group) <= 2, `${kind}: ${drawables(w.group)} drawables`);
    assert.equal(w.particles.length, 280);
  }
});

// Pack 5 moved the tree lines out of the fixed backdrop into
// per-segment / per-Endless-section groups (createTreeLine) so the
// forest spans the whole yard; the instancing contract is unchanged.
test('tree lines are instanced (hundreds of trees, a handful of meshes)', () => {
  const trees = createTreeLine(0, 160, 1);
  let instances = 0;
  trees.traverse((c) => {
    if ((c as THREE.InstancedMesh).isInstancedMesh) instances += (c as THREE.InstancedMesh).count;
  });
  assert.ok(instances >= 336, `only ${instances} instanced trees`);
  assert.ok(drawables(trees) <= 6, `${drawables(trees)} drawables for a tree line`);
  const b = createBackdrop();
  assert.ok(drawables(b.group) < 50, `${drawables(b.group)} drawables in backdrop`);
});

test('each stage has one fixed lighting mood; night moods shorten guard sight', () => {
  const a = getStageLighting(4);
  assert.equal(getStageLighting(4), a);
  const moods = new Set<string>();
  for (let s = 1; s <= 20; s++) moods.add(getStageLighting(s).mood);
  assert.ok(moods.has('day') && moods.has('night'));
  for (let s = 1; s <= 30; s++) {
    const l = getStageLighting(s);
    if (l.mood === 'night' || l.mood === 'deepNight') assert.ok(l.visionMul < 1);
    if (l.mood === 'day') assert.equal(l.visionMul, 1);
  }
});

test('tearing down a segment frees its prop geometry (no leak across rebuilds)', () => {
  const root = new THREE.Group();
  const p = new ProcgenSystem(77, root, 6, 2);
  p.init();
  const before = drawables(root);
  assert.ok(before > 0);
  p.dispose();
  assert.equal(root.children.length, 0);
  disposeSubtree(root);
});
