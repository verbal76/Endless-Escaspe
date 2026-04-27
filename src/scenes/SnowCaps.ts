import * as THREE from 'three';
import type { Obstacle, ObstacleKind } from '../types/world';

// Snow caps are now shape-aware. Each obstacle kind gets a cap that
// matches its top footprint instead of a generic flat square that
// reads as "stuck-on plate". The cap material is a touch off-white
// (rgb 0xeef3fb) and slightly transparent so the layer looks
// settled rather than painted on.

const CAP_MAT = new THREE.MeshStandardMaterial({
  color: 0xeef3fb,
  roughness: 1,
  flatShading: true,
  transparent: true,
  opacity: 0.96,
});

const T = 0.07; // cap thickness

// Shared geos keyed by signature so we don't allocate per obstacle.
type GeoKey = string;
const geoCache = new Map<GeoKey, THREE.BufferGeometry>();
function box(w: number, h: number, d: number): THREE.BufferGeometry {
  const k = `b:${w.toFixed(2)}x${h.toFixed(2)}x${d.toFixed(2)}`;
  let g = geoCache.get(k);
  if (!g) {
    g = new THREE.BoxGeometry(w, h, d);
    geoCache.set(k, g);
  }
  return g;
}
function cyl(rTop: number, rBottom: number, h: number, segs: number): THREE.BufferGeometry {
  const k = `c:${rTop.toFixed(2)}-${rBottom.toFixed(2)}x${h.toFixed(2)}-${segs}`;
  let g = geoCache.get(k);
  if (!g) {
    g = new THREE.CylinderGeometry(rTop, rBottom, h, segs);
    geoCache.set(k, g);
  }
  return g;
}
function sphereCap(r: number): THREE.BufferGeometry {
  // Top half-sphere only - used as a snowy mound on round obstacles.
  const k = `sc:${r.toFixed(2)}`;
  let g = geoCache.get(k);
  if (!g) {
    g = new THREE.SphereGeometry(r, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2);
    geoCache.set(k, g);
  }
  return g;
}

// Build a cap shape matched to the obstacle kind. The returned mesh
// is local; the caller positions it in world space at the top of
// the obstacle.
function buildCap(kind: ObstacleKind): THREE.Mesh | null {
  switch (kind) {
    case 'crate':
      return new THREE.Mesh(box(1.18, T, 1.18), CAP_MAT);
    case 'lowwall':
      return new THREE.Mesh(box(1.68, T, 0.68), CAP_MAT);
    case 'cover':
      return new THREE.Mesh(box(2.08, T, 1.06), CAP_MAT);
    case 'hedgerow':
      return new THREE.Mesh(box(2.66, T, 0.74), CAP_MAT);
    case 'barrel': {
      // Disc on top of the cylinder.
      return new THREE.Mesh(cyl(0.45, 0.45, T, 14), CAP_MAT);
    }
    case 'boulder': {
      // Half-sphere mound that drapes the rocky top, sized just
      // smaller than the boulder so its rim follows the rock edge.
      const m = new THREE.Mesh(sphereCap(0.55), CAP_MAT);
      // Sphere caps are placed at obstacle.height anchored at the
      // dome base. Lift slightly so the rim sits below the cap, not
      // floating above the rock.
      m.position.y = -0.18;
      return m;
    }
    case 'tree': {
      // Snowy crown: a smaller half-sphere over the leaf cluster.
      // Tree height is reported as the trunk height (1.6); the
      // leaves cluster sits ~2.0m above ground in the obstacle
      // mesh. Anchor the snow dome around that height instead of
      // the reported obstacle.height.
      const m = new THREE.Mesh(sphereCap(0.95), CAP_MAT);
      m.position.y = 0.4; // pushes cap up to the leaf crown
      return m;
    }
    case 'car': {
      // Cap on the cabin (the smaller box at the top of the car).
      // Cabin is ~1.6 x 0.6 x 1.1 sitting at y ~ 1.2..1.5 in the
      // car group, so cap world-y matches obstacle.height (1.5).
      return new THREE.Mesh(box(1.66, T, 1.16), CAP_MAT);
    }
  }
}

export function dustObstaclesWithSnow(obstacles: readonly Obstacle[]) {
  for (const o of obstacles) {
    if (!o.mesh) continue;
    const cap = buildCap(o.kind);
    if (!cap) continue;
    const parent = o.mesh.parent;
    if (!parent) continue;
    // World position: anchor at obstacle.x/z, sit on top of the
    // reported obstacle height with a half-thickness offset so the
    // cap is visibly resting on the surface, not embedded in it.
    cap.position.x = o.x;
    cap.position.z = o.z;
    cap.position.y += o.height + T / 2;
    parent.add(cap);
  }
}
