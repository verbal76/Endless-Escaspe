import * as THREE from 'three';
import { markShared } from '../util/dispose';

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

const SHARED_GEO = markShared(new THREE.CircleGeometry(0.12, 14));
SHARED_GEO.rotateX(-Math.PI / 2);

const SHARED_MAT_TEMPLATE = {
  color: 0x2c3a52,
  transparent: true,
  opacity: 0.55,
  depthWrite: false,
};

// Fixed pool: MAX_FOOTPRINTS mesh+material pairs are created once per
// field and recycled oldest-first, so walking through snow never
// allocates (it used to create - and dispose - a material per print).
export type Footprint = {
  age: number;
  lifetime: number;
  active: boolean;
  mesh: THREE.Mesh;
  material: THREE.MeshBasicMaterial;
};

export type FootprintField = {
  prints: Footprint[];
  next: number;
  nextSide: 1 | -1;
  sinceSpawn: number;
};

export function createFootprintField(): FootprintField {
  return { prints: [], next: 0, nextSide: 1, sinceSpawn: 0 };
}

function slot(field: FootprintField): Footprint {
  if (field.prints.length < MAX_FOOTPRINTS) {
    const material = new THREE.MeshBasicMaterial(SHARED_MAT_TEMPLATE);
    const fp: Footprint = { age: 0, lifetime: FOOTPRINT_LIFETIME, active: false, mesh: new THREE.Mesh(SHARED_GEO, material), material };
    field.prints.push(fp);
    return fp;
  }
  const fp = field.prints[field.next];
  field.next = (field.next + 1) % MAX_FOOTPRINTS;
  return fp;
}

export function spawnFootprint(
  field: FootprintField,
  x: number,
  z: number,
  facing: number,
  parent: THREE.Object3D,
) {
  const fp = slot(field);
  const mesh = fp.mesh;
  const sx = Math.cos(facing + Math.PI / 2) * 0.18 * field.nextSide;
  const sz = Math.sin(facing + Math.PI / 2) * 0.18 * field.nextSide;
  mesh.position.set(x + sx, 0.012, z + sz);
  mesh.rotation.y = facing;
  mesh.scale.set(1, 1, 1.6);
  mesh.visible = true;
  if (mesh.parent !== parent) parent.add(mesh);
  fp.age = 0;
  fp.active = true;
  fp.material.opacity = 0.55;
  field.nextSide = field.nextSide === 1 ? -1 : 1;
}

export function updateFootprintField(field: FootprintField, dt: number) {
  for (const fp of field.prints) {
    if (!fp.active) continue;
    fp.age += dt;
    const t = fp.age / fp.lifetime;
    if (t >= 1) {
      fp.active = false;
      fp.mesh.visible = false;
      continue;
    }
    const eased = 1 - t * t;
    fp.material.opacity = 0.55 * eased;
  }
}

// Hide every print (soft restart). The pool stays allocated.
export function disposeFootprintField(field: FootprintField) {
  for (const fp of field.prints) {
    fp.active = false;
    fp.mesh.visible = false;
  }
}
