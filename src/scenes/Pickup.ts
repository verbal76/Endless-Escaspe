import * as THREE from 'three';
import type { Pickup, PickupKind } from '../types/world';

// Pickup overlap radius (m). Tuned generously so the player can grab
// a pickup while running past it without precision steering.
export const PICKUP_RADIUS = 0.7;

// Shared materials so we don't pay the per-pickup material cost; the
// world builds dozens of these per segment.
const CROWBAR_BAR_MAT = new THREE.MeshStandardMaterial({
  color: 0xb84a2a,
  roughness: 0.5,
  metalness: 0.6,
});
const CROWBAR_TIP_MAT = new THREE.MeshStandardMaterial({
  color: 0x2a2a2e,
  roughness: 0.5,
  metalness: 0.85,
});
const SMOKE_BODY_MAT = new THREE.MeshStandardMaterial({
  color: 0x3a3f48,
  roughness: 0.6,
  metalness: 0.4,
});
const SMOKE_CAP_MAT = new THREE.MeshStandardMaterial({
  color: 0xe8c050,
  roughness: 0.55,
  metalness: 0.3,
});
const HALO_MAT = new THREE.MeshBasicMaterial({
  color: 0xffd96a,
  transparent: true,
  opacity: 0.45,
  depthWrite: false,
  side: THREE.DoubleSide,
});

const CROWBAR_GEO = new THREE.BoxGeometry(0.85, 0.08, 0.08);
const CROWBAR_TIP_GEO = new THREE.BoxGeometry(0.18, 0.08, 0.18);
const SMOKE_BODY_GEO = new THREE.CylinderGeometry(0.18, 0.18, 0.4, 14);
const SMOKE_CAP_GEO = new THREE.CylinderGeometry(0.19, 0.19, 0.06, 14);
const HALO_GEO = new THREE.RingGeometry(0.55, 0.75, 24);

// Shallow "look at me" halo on the ground so the player can spot
// pickups across the yard even when the prop itself is small.
function buildHalo(): THREE.Mesh {
  const m = new THREE.Mesh(HALO_GEO, HALO_MAT);
  m.rotation.x = -Math.PI / 2;
  m.position.y = 0.02;
  return m;
}

function buildCrowbar(): THREE.Group {
  const g = new THREE.Group();
  const bar = new THREE.Mesh(CROWBAR_GEO, CROWBAR_BAR_MAT);
  bar.position.y = 0.16;
  bar.rotation.y = Math.PI / 7;
  g.add(bar);
  // Tip: a small dark block on one end suggesting the claw.
  const tip = new THREE.Mesh(CROWBAR_TIP_GEO, CROWBAR_TIP_MAT);
  tip.position.set(0.4 * Math.cos(Math.PI / 7), 0.16, 0.4 * Math.sin(Math.PI / 7));
  g.add(tip);
  g.add(buildHalo());
  return g;
}

function buildSmokeBomb(): THREE.Group {
  const g = new THREE.Group();
  const body = new THREE.Mesh(SMOKE_BODY_GEO, SMOKE_BODY_MAT);
  body.position.y = 0.2;
  g.add(body);
  const cap = new THREE.Mesh(SMOKE_CAP_GEO, SMOKE_CAP_MAT);
  cap.position.y = 0.43;
  g.add(cap);
  g.add(buildHalo());
  return g;
}

export function buildPickupMesh(kind: PickupKind): THREE.Object3D {
  return kind === 'crowbar' ? buildCrowbar() : buildSmokeBomb();
}

// Idle bob/spin so pickups read as interactive even at a glance.
// `t` is wall-clock seconds since scene init; the per-pickup mesh
// id seeds the phase so a row of pickups doesn't pulse in lockstep.
export function animatePickup(p: Pickup, t: number) {
  if (!p.mesh || p.collected) return;
  const phase = (p.id % 7) * 0.7;
  p.mesh.rotation.y = t * 1.4 + phase;
  p.mesh.position.y = 0.08 + Math.sin(t * 2.4 + phase) * 0.06;
  p.mesh.position.x = p.x;
  p.mesh.position.z = p.z;
}
