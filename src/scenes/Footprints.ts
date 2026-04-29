import * as THREE from 'three';

// Snow footprints: small dark elliptical patches that drop behind
// the player while they're moving on a snow stage. Each fades out
// over its lifetime and is recycled / pruned to keep the active
// list bounded. Cheap (single shared geometry, single material) so
// dropping ~24 per segment is essentially free.
//
// We place the prints just above the ground (Y = 0.012) and orient
// them around the world Y axis to match the player's heading. The
// shape is a flat disc scaled X/Z so it reads as an oblong boot
// rather than a perfect circle.

export const FOOTPRINT_LIFETIME = 4.0;
export const FOOTPRINT_SPAWN_INTERVAL = 0.34;
const MAX_FOOTPRINTS = 36;

const SHARED_GEO = new THREE.CircleGeometry(0.12, 14);
SHARED_GEO.rotateX(-Math.PI / 2);

const SHARED_MAT_TEMPLATE = {
  color: 0x2c3a52,
  transparent: true,
  opacity: 0.55,
  depthWrite: false,
};

export type Footprint = {
  age: number;
  lifetime: number;
  mesh: THREE.Mesh;
  material: THREE.MeshBasicMaterial;
};

export type FootprintField = {
  prints: Footprint[];
  // Side toggle so successive prints stagger left / right of the
  // player's heading instead of stacking on the same midline.
  nextSide: 1 | -1;
  // Time since the last spawn; the caller increments and resets.
  sinceSpawn: number;
};

export function createFootprintField(): FootprintField {
  return { prints: [], nextSide: 1, sinceSpawn: 0 };
}

// Spawn a single print at (x, z) heading along `facing` (radians).
// A small lateral offset perpendicular to the heading staggers
// successive prints; nextSide flips on each spawn so they alternate.
export function spawnFootprint(
  field: FootprintField,
  x: number,
  z: number,
  facing: number,
  parent: THREE.Object3D,
) {
  const material = new THREE.MeshBasicMaterial(SHARED_MAT_TEMPLATE);
  const mesh = new THREE.Mesh(SHARED_GEO, material);
  // Stagger 0.18m to one side of the player's centre.
  const sx = Math.cos(facing + Math.PI / 2) * 0.18 * field.nextSide;
  const sz = Math.sin(facing + Math.PI / 2) * 0.18 * field.nextSide;
  mesh.position.set(x + sx, 0.012, z + sz);
  mesh.rotation.y = facing;
  mesh.scale.set(1, 1, 1.6);
  parent.add(mesh);
  field.prints.push({ age: 0, lifetime: FOOTPRINT_LIFETIME, mesh, material });
  field.nextSide = field.nextSide === 1 ? -1 : 1;
  // Cap memory: drop the oldest if we're over the limit. Despawning
  // also disposes the per-print material so we don't leak.
  while (field.prints.length > MAX_FOOTPRINTS) {
    const oldest = field.prints.shift();
    if (oldest) {
      if (oldest.mesh.parent) oldest.mesh.parent.remove(oldest.mesh);
      oldest.material.dispose();
    }
  }
}

// Advance every print's age and prune expired ones. Caller passes
// the parent so we can re-anchor the remove() call cleanly even if
// the print's parent has been swapped (e.g. mid-scene-rebuild).
export function updateFootprintField(field: FootprintField, dt: number) {
  for (let i = field.prints.length - 1; i >= 0; i--) {
    const fp = field.prints[i];
    fp.age += dt;
    const t = fp.age / fp.lifetime;
    if (t >= 1) {
      if (fp.mesh.parent) fp.mesh.parent.remove(fp.mesh);
      fp.material.dispose();
      field.prints.splice(i, 1);
      continue;
    }
    // Linear opacity fade with a slight ease-out so the fresh prints
    // sit at near-full opacity for a beat before melting away.
    const eased = 1 - t * t;
    fp.material.opacity = 0.55 * eased;
  }
}

export function disposeFootprintField(field: FootprintField) {
  for (const fp of field.prints) {
    if (fp.mesh.parent) fp.mesh.parent.remove(fp.mesh);
    fp.material.dispose();
  }
  field.prints.length = 0;
}
