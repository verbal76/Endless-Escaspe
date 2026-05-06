import * as THREE from 'three';
import type { Obstacle, ObstacleKind } from '../types/world';
import { markShared } from '../util/dispose';

// Snow caps that read as a layer of snow on top of each obstacle:
// flush against the surface (no gap), sized to the actual footprint
// of the obstacle's top face (no overhang), thin (a dusting, not a
// slab), and rendered with polygonOffset so it sits visually on the
// obstacle surface without z-fighting.

// Cap material is mostly emissive so warm afternoon / dim night
// lighting can't tint it red-brown. Without this, snow caps under
// stage 2 (warm afternoon) ambient pick up the orange / red light
// and read as a strange "rust" stain on top of every obstacle.
const CAP_MAT = markShared(new THREE.MeshStandardMaterial({
  color: 0xeef3fb,
  emissive: 0xeef3fb,
  emissiveIntensity: 0.85,
  roughness: 1,
  flatShading: true,
  polygonOffset: true,
  polygonOffsetFactor: -1,
  polygonOffsetUnits: -1,
}));

const T = 0.04; // dusting thickness; thinner than the 0.07 plate before

// All cap geos are cached + reused across rebuilds, so they're
// shared (disposal pass must skip them).
const geoCache = new Map<string, THREE.BufferGeometry>();
function box(w: number, h: number, d: number): THREE.BufferGeometry {
  const k = `b:${w.toFixed(2)}x${h.toFixed(2)}x${d.toFixed(2)}`;
  let g = geoCache.get(k);
  if (!g) {
    g = markShared(new THREE.BoxGeometry(w, h, d));
    geoCache.set(k, g);
  }
  return g;
}
function cyl(r: number, h: number, segs: number): THREE.BufferGeometry {
  const k = `c:${r.toFixed(2)}x${h.toFixed(2)}-${segs}`;
  let g = geoCache.get(k);
  if (!g) {
    g = markShared(new THREE.CylinderGeometry(r, r, h, segs));
    geoCache.set(k, g);
  }
  return g;
}
function sphereCap(r: number): THREE.BufferGeometry {
  const k = `sc:${r.toFixed(2)}`;
  let g = geoCache.get(k);
  if (!g) {
    g = markShared(new THREE.SphereGeometry(r, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2));
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

// Snow caps are disabled. Every Kenney prop the procgen now spawns
// has its own non-flat top (sloped jersey-barrier surfaces, conical
// pine tip, dumpster lids with their own roof texture, sphere /
// cylinder mismatches against rectangular bodies, etc.), so a one-
// shape-fits-all cap either floated above the silhouette or clipped
// through it. The ground already gets its snow tint and the falling
// flakes still tell the player it's snowing - that's enough.
function buildCap(_kind: ObstacleKind): CapResult | null {
  return null;
}

export function dustObstaclesWithSnow(obstacles: readonly Obstacle[]) {
  for (const o of obstacles) {
    if (!o.mesh) continue;
    const cap = buildCap(o.kind);
    if (!cap) continue;
    const parent = o.mesh.parent;
    if (!parent) continue;
    cap.mesh.position.set(o.x, o.height + cap.yOffset, o.z);
    // Mirror the obstacle's Y rotation onto the cap so rectangular
    // pieces (hedgerow, car) get a cap aligned with their footprint.
    // Without this the cap stayed axis-aligned while the obstacle
    // was rotated 90deg, producing a cap that ran the wrong way
    // across the top.
    cap.mesh.rotation.y = o.mesh.rotation.y;
    parent.add(cap.mesh);
  }
}
