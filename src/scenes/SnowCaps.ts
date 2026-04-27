import * as THREE from 'three';
import type { Obstacle } from '../types/world';

// Snow weather: dust the top of every obstacle with a thin white
// slab so the world reads as covered in snow. Built procedurally
// from the obstacle's collision radius and reported height; one
// shared material keeps the cap mass cheap to render.

const CAP_MAT = new THREE.MeshStandardMaterial({
  color: 0xeef3fb,
  roughness: 1,
  flatShading: true,
});
const CAP_THICKNESS = 0.06;

// Reusable shared geometries keyed by approximate footprint so
// we don't allocate a fresh BoxGeometry per obstacle.
const geoCache = new Map<string, THREE.BoxGeometry>();
function getCapGeo(w: number, d: number): THREE.BoxGeometry {
  const key = `${w.toFixed(2)}x${d.toFixed(2)}`;
  let g = geoCache.get(key);
  if (!g) {
    g = new THREE.BoxGeometry(w, CAP_THICKNESS, d);
    geoCache.set(key, g);
  }
  return g;
}

export function dustObstaclesWithSnow(obstacles: readonly Obstacle[]) {
  for (const o of obstacles) {
    if (!o.mesh) continue;
    // Treat the obstacle as having a square footprint scaled by its
    // collision radius. Slightly oversize so the cap visibly overhangs.
    const w = o.r * 2 + 0.05;
    const d = o.r * 2 + 0.05;
    const cap = new THREE.Mesh(getCapGeo(w, d), CAP_MAT);

    // Place the cap at the world top of the obstacle. Cars and
    // trees use a Group with their own internal y offsets, so we
    // anchor the cap in WORLD coordinates by attaching to the same
    // parent (worldRoot) at the obstacle's xz position + height.
    const parent = o.mesh.parent;
    if (!parent) continue;
    cap.position.set(o.x, o.height + CAP_THICKNESS / 2, o.z);
    parent.add(cap);
  }
}
