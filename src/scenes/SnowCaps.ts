import * as THREE from 'three';
import type { Obstacle, ObstacleKind } from '../types/world';

// Snow caps that read as a layer of snow on top of each obstacle:
// flush against the surface (no gap), sized to the actual footprint
// of the obstacle's top face (no overhang), thin (a dusting, not a
// slab), and rendered with polygonOffset so it sits visually on the
// obstacle surface without z-fighting.

const CAP_MAT = new THREE.MeshStandardMaterial({
  color: 0xeef3fb,
  roughness: 1,
  flatShading: true,
  polygonOffset: true,
  polygonOffsetFactor: -1,
  polygonOffsetUnits: -1,
});

const T = 0.04; // dusting thickness; thinner than the 0.07 plate before

const geoCache = new Map<string, THREE.BufferGeometry>();
function box(w: number, h: number, d: number): THREE.BufferGeometry {
  const k = `b:${w.toFixed(2)}x${h.toFixed(2)}x${d.toFixed(2)}`;
  let g = geoCache.get(k);
  if (!g) {
    g = new THREE.BoxGeometry(w, h, d);
    geoCache.set(k, g);
  }
  return g;
}
function cyl(r: number, h: number, segs: number): THREE.BufferGeometry {
  const k = `c:${r.toFixed(2)}x${h.toFixed(2)}-${segs}`;
  let g = geoCache.get(k);
  if (!g) {
    g = new THREE.CylinderGeometry(r, r, h, segs);
    geoCache.set(k, g);
  }
  return g;
}
function sphereCap(r: number): THREE.BufferGeometry {
  const k = `sc:${r.toFixed(2)}`;
  let g = geoCache.get(k);
  if (!g) {
    g = new THREE.SphereGeometry(r, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2);
    geoCache.set(k, g);
  }
  return g;
}

type CapResult = {
  mesh: THREE.Mesh;
  // Vertical offset to apply ON TOP of obstacle.height when placing
  // the cap in world space. Box caps sit on the surface so this is
  // T/2 (cap centre is half-thickness above the top). Sphere caps
  // anchor at their dome base so this is 0.
  yOffset: number;
};

function buildCap(kind: ObstacleKind): CapResult | null {
  switch (kind) {
    case 'crate':
      // Crate is exactly 1.10 wide x 1.10 deep on top.
      return { mesh: new THREE.Mesh(box(1.10, T, 1.10), CAP_MAT), yOffset: T / 2 };
    case 'lowwall':
      return { mesh: new THREE.Mesh(box(1.60, T, 0.60), CAP_MAT), yOffset: T / 2 };
    case 'cover':
      return { mesh: new THREE.Mesh(box(2.00, T, 1.00), CAP_MAT), yOffset: T / 2 };
    case 'hedgerow':
      return { mesh: new THREE.Mesh(box(2.60, T, 0.70), CAP_MAT), yOffset: T / 2 };
    case 'barrel':
      // Barrel top is a 0.42-radius circle.
      return { mesh: new THREE.Mesh(cyl(0.42, T, 14), CAP_MAT), yOffset: T / 2 };
    case 'boulder': {
      // Half-sphere cap that drapes the rocky top. Slightly under the
      // boulder's radius (0.7 -> 0.55) so the rim follows the rock
      // edge rather than projecting past it.
      const m = new THREE.Mesh(sphereCap(0.55), CAP_MAT);
      // sphereCap is anchored at its base; sit it so the bottom rim
      // sinks into the rock by 0.18m (no floating above the surface).
      return { mesh: m, yOffset: -0.18 };
    }
    case 'tree': {
      // Snowy crown that drapes the leaves. Leaves are at world y=2.0
      // in the obstacle's mesh; obstacle.height = 1.6 (trunk top).
      // Anchor relative to obstacle.height with extra lift to land on
      // the leaf cluster.
      const m = new THREE.Mesh(sphereCap(0.95), CAP_MAT);
      return { mesh: m, yOffset: 0.4 };
    }
    case 'car':
      // Cabin top only (1.6 x 1.1 inside the car group).
      return { mesh: new THREE.Mesh(box(1.60, T, 1.10), CAP_MAT), yOffset: T / 2 };
  }
}

export function dustObstaclesWithSnow(obstacles: readonly Obstacle[]) {
  for (const o of obstacles) {
    if (!o.mesh) continue;
    const cap = buildCap(o.kind);
    if (!cap) continue;
    const parent = o.mesh.parent;
    if (!parent) continue;
    cap.mesh.position.set(o.x, o.height + cap.yOffset, o.z);
    parent.add(cap.mesh);
  }
}
