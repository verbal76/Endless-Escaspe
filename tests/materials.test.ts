import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createAimLaser, createNoiseRing, createTargetMarker } from '../src/scenes/StealthCues';
import { createThreatArrow } from '../src/scenes/ThreatArrow';
import { createSwingArc } from '../src/scenes/SwingArc';
import { createGuardStateMarker } from '../src/scenes/GuardStateMarker';
import { buildPickupMesh } from '../src/scenes/Pickup';
import { spawnCameras } from '../src/scenes/Camera';
import { spawnLightTowers } from '../src/scenes/LightTower';
import { createWeather } from '../src/scenes/Weather';
import { createBurstPool } from '../src/scenes/Juice';
import { createFacingMarker } from '../src/scenes/PrisonYard1';
import { createBackdrop } from '../src/scenes/Backdrop';
import { createBlobShadow, createPropShadows } from '../src/scenes/BlobShadows';
import { buildObstacleMesh } from '../src/scenes/Obstacles';
import { createTreeLine } from '../src/scenes/Backdrop';
import type { Obstacle } from '../src/types/world';

// C-3: three r166 draws `transparent && DoubleSide && !forceSinglePass`
// materials twice per frame and marks them dirty before each pass,
// forcing a full shader-program lookup both times. Every such material
// in the game must opt out (flat decals: one pass is the same picture)
// or be split into BackSide + FrontSide meshes (closed beams).
function twoPass(root: THREE.Object3D): string[] {
  const bad: string[] = [];
  root.traverse((o) => {
    const m = (o as THREE.Mesh).material;
    if (!m) return;
    for (const mat of Array.isArray(m) ? m : [m]) {
      if (mat.transparent && mat.side === THREE.DoubleSide && !mat.forceSinglePass) bad.push(`${o.type}:${mat.type}:${o.name}`);
    }
  });
  return bad;
}

test('no transparent double-sided material is drawn in two passes', () => {
  const root = new THREE.Group();
  root.add(createNoiseRing().mesh, createTargetMarker().mesh, createAimLaser().mesh);
  root.add(createThreatArrow().mesh, createSwingArc(0, 0, 2).mesh, createGuardStateMarker().group);
  for (const k of ['crowbar', 'smokebomb', 'rock'] as const) root.add(buildPickupMesh(k));
  spawnCameras(root, 120, 4);
  spawnLightTowers(root, 120, 2, 1, true);
  for (const w of ['rain', 'snow', 'clear'] as const) root.add(createWeather(w, 0, 0).group);
  root.add(createBurstPool(2).root, createFacingMarker(8), createBackdrop().group);
  assert.deepEqual(twoPass(root), []);
});

test('beam cones keep back-then-front drawing as two single-sided meshes', () => {
  const root = new THREE.Group();
  spawnLightTowers(root, 120, 1, 1, false);
  const cones: THREE.Mesh[] = [];
  root.traverse((o) => {
    if ((o as THREE.Mesh).isMesh && (o as THREE.Mesh).geometry.type === 'ConeGeometry') cones.push(o as THREE.Mesh);
  });
  assert.ok(cones.length >= 2);
  const back = cones.find((c) => (c.material as THREE.Material).side === THREE.BackSide) as THREE.Mesh;
  const front = cones.find((c) => (c.material as THREE.Material).side === THREE.FrontSide) as THREE.Mesh;
  assert.ok(back && front);
  assert.equal(front.parent, back, 'front faces ride on the back-face mesh');
  assert.equal(front.geometry, back.geometry);
  assert.ok(front.id > back.id, 'same depth: the lower id (back faces) sorts first');
});

test('materials drawn instanced are never also drawn by plain meshes', () => {
  const ob = (kind: Obstacle['kind'], x: number, z: number): Obstacle =>
    ({ id: 1, kind, x, z, r: 1, height: 1, isCover: false, mesh: null }) as Obstacle;
  const obstacles = [ob('crate', 0, 0), ob('tree', 3, 3), ob('boulder', -3, 5), ob('lowwall', 2, 8)];
  const root = new THREE.Group();
  for (const o of obstacles) root.add(buildObstacleMesh(o));
  root.add(createBlobShadow(1), createPropShadows(obstacles) as THREE.Object3D, createTreeLine(0, 120, 3));
  const plain = new Set<THREE.Material>();
  const inst = new Set<THREE.Material>();
  root.traverse((o) => {
    const m = (o as THREE.Mesh).material;
    if (!m) return;
    for (const mat of Array.isArray(m) ? m : [m]) ((o as THREE.InstancedMesh).isInstancedMesh ? inst : plain).add(mat);
  });
  for (const m of inst) assert.ok(!plain.has(m), `${m.type} ${m.name} shared by Mesh and InstancedMesh`);
});
