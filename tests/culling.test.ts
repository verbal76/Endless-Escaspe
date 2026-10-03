import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { CULL_AHEAD, CULL_BEHIND, ProcgenSystem, chunkVisible } from '../src/systems/ProcgenSystem';
import { batchStaticMeshes, isBatchable } from '../src/scenes/StaticBatch';
import { markShared } from '../src/util/dispose';
import { CHUNK_LEN } from '../src/util/geometry';

test('chunk culling: nothing is hidden before the first visibility update', () => {
  assert.equal(chunkVisible({ startZ: 5000, endZ: 5024 }, null), true);
});

test('chunk culling: visible range around the player', () => {
  const at = (startZ: number, z: number) => chunkVisible({ startZ, endZ: startZ + CHUNK_LEN }, z);
  // The chunk under the player, and every chunk overlapping the range.
  assert.equal(at(96, 100), true);
  assert.equal(at(100 + CULL_AHEAD, 100), true, 'chunk starting at the edge');
  assert.equal(at(100 + CULL_AHEAD + 5, 100), true, 'props spill ~5 m before their chunk');
  assert.equal(at(100 + CULL_AHEAD + 6, 100), false, 'beyond the far edge');
  assert.equal(at(100 - CULL_BEHIND - CHUNK_LEN - 5, 100), true);
  assert.equal(at(100 - CULL_BEHIND - CHUNK_LEN - 6, 100), false, 'well behind the camera');
  // Never hides anything closer than the far edge, whatever the chunk size.
  for (let z = 0; z < 600; z += 7) {
    for (let s = 0; s < 800; s += 24) {
      const near = s - 5 <= z + CULL_AHEAD && s + CHUNK_LEN + 5 >= z - CULL_BEHIND;
      assert.equal(at(s, z), near);
    }
  }
});

test('ProcgenSystem.updateVisibility hides far chunks and shows them again', () => {
  const world = new THREE.Group();
  const p = new ProcgenSystem(321, world, 20, 4);
  p.init();
  const roots = world.children.filter((c) => c.name === 'chunk');
  assert.equal(roots.length, 24, 'one group per chunk (gameplay + horizon)');
  assert.ok(roots.every((r) => r.visible), 'all drawn until culling starts');
  p.updateVisibility(10);
  const shown = roots.filter((r) => r.visible).length;
  assert.ok(shown >= Math.floor(CULL_AHEAD / CHUNK_LEN) && shown < 24, `${shown} chunks drawn`);
  p.updateVisibility(400);
  assert.equal(roots[0].visible, false, 'start chunk is far behind');
  assert.equal(roots[21].visible, true);
  assert.equal(roots[23].visible, false, "beyond the far edge");
  p.updateVisibility(10);
  assert.equal(roots[0].visible, true);
  // Chunks streamed in later respect the current view distance.
  p.dispose();
  assert.equal(world.children.length, 0, 'dispose removes every chunk group');
});

test('static batching: shared-template meshes become one instanced draw per part, same transforms', () => {
  const geo = markShared(new THREE.BoxGeometry(1, 2, 3));
  const matA = markShared(new THREE.MeshLambertMaterial({ color: 0xff0000 }));
  const matB = markShared(new THREE.MeshLambertMaterial({ color: 0x00ff00 }));
  const root = new THREE.Group();
  const props: THREE.Group[] = [];
  const want: THREE.Matrix4[] = [];
  for (let i = 0; i < 5; i++) {
    const g = new THREE.Group();
    g.position.set(i * 3, 0, i * 7);
    g.rotation.y = i;
    g.scale.setScalar(1 + i * 0.1);
    g.add(new THREE.Mesh(geo, matA));
    g.add(new THREE.Mesh(geo, [matA, matB]));
    // Per-instance geometry is left alone.
    g.add(new THREE.Mesh(new THREE.SphereGeometry(), matA));
    root.add(g);
    props.push(g);
    g.updateMatrixWorld(true);
    want.push(g.children[0].matrixWorld.clone());
  }
  const batches = batchStaticMeshes(root, props);
  assert.equal(batches.length, 2, 'single-material part + multi-material part');
  const single = batches.find((b) => !Array.isArray(b.material)) as THREE.InstancedMesh;
  assert.equal(single.count, 5);
  const m = new THREE.Matrix4();
  for (let i = 0; i < 5; i++) {
    single.getMatrixAt(i, m);
    assert.ok(m.equals(want[i]) || m.elements.every((v, k) => Math.abs(v - want[i].elements[k]) < 1e-5), `instance ${i}`);
  }
  // Instanced draws use their own (identical) material, never the plain one.
  assert.notEqual(single.material, matA);
  assert.equal((single.material as THREE.MeshLambertMaterial).color.getHex(), 0xff0000);
  for (const g of props) assert.equal(g.children.length, 1, 'only the per-instance sphere is left');
  assert.equal(isBatchable(props[0].children[0]), false);
});
