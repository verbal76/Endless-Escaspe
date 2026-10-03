import * as THREE from 'three';
import type { Obstacle } from '../types/world';
import { markShared } from '../util/dispose';

// Soft contact ("blob") shadows. The game has no real-time shadow
// maps (too expensive on mid-range phones); a dark radial smudge under
// every character and prop is enough to seat them on the ground.

let BLOB_TEX: THREE.DataTexture | null = null;
function blobTexture(): THREE.DataTexture {
  if (BLOB_TEX) return BLOB_TEX;
  const n = 64;
  const data = new Uint8Array(n * n * 4);
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const dx = (x + 0.5) / n - 0.5;
      const dy = (y + 0.5) / n - 0.5;
      const d = Math.min(1, Math.sqrt(dx * dx + dy * dy) * 2);
      // Smooth falloff: solid-ish core, feathered rim.
      const a = Math.pow(1 - d, 1.6);
      const i = (y * n + x) * 4;
      data[i] = 0;
      data[i + 1] = 0;
      data[i + 2] = 0;
      data[i + 3] = Math.round(a * 255);
    }
  }
  const tex = new THREE.DataTexture(data, n, n, THREE.RGBAFormat);
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  BLOB_TEX = markShared(tex);
  return tex;
}

const BLOB_GEO = markShared(new THREE.PlaneGeometry(1, 1));
BLOB_GEO.rotateX(-Math.PI / 2);

// One material for single (moving) shadows and one for the instanced
// prop shadows: sharing one between Mesh and InstancedMesh made three
// re-resolve its program on every switch between the two, every frame.
const BLOB_MATS: { plain: THREE.MeshBasicMaterial | null; instanced: THREE.MeshBasicMaterial | null } = {
  plain: null,
  instanced: null,
};
function blobMaterial(kind: 'plain' | 'instanced'): THREE.MeshBasicMaterial {
  const cached = BLOB_MATS[kind];
  if (cached) return cached;
  const mat = markShared(
    new THREE.MeshBasicMaterial({
      map: blobTexture(),
      transparent: true,
      // A little stronger now textures decode as sRGB (the ground is
      // darker than it used to render).
      opacity: 0.58,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    }),
  );
  BLOB_MATS[kind] = mat;
  return mat;
}

const SHADOW_Y = 0.015;

// A single moving shadow (player, guard, dog). Caller positions it.
export function createBlobShadow(diameter: number): THREE.Mesh {
  const m = new THREE.Mesh(BLOB_GEO, blobMaterial('plain'));
  m.scale.set(diameter, 1, diameter);
  m.position.y = SHADOW_Y;
  m.renderOrder = -1;
  return m;
}

export function placeBlobShadow(m: THREE.Mesh, x: number, z: number) {
  m.position.x = x;
  m.position.z = z;
}

// Static shadows for a batch of props, one draw call. Elongated props
// (OBB) get an oriented ellipse; round ones a circle slightly wider
// than their footprint.
export function createPropShadows(obstacles: readonly Obstacle[]): THREE.InstancedMesh | null {
  if (obstacles.length === 0) return null;
  const inst = new THREE.InstancedMesh(BLOB_GEO, blobMaterial('instanced'), obstacles.length);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const pos = new THREE.Vector3();
  const scl = new THREE.Vector3();
  obstacles.forEach((o, i) => {
    pos.set(o.x, SHADOW_Y, o.z);
    if (o.halfW !== undefined && o.halfL !== undefined && o.rotY !== undefined) {
      q.setFromAxisAngle(up, -o.rotY);
      scl.set(o.halfW * 2 + 1.1, 1, o.halfL * 2 + 1.1);
    } else {
      q.identity();
      const d = o.r * 2 + (o.kind === 'tree' ? 1.4 : 0.9);
      scl.set(d, 1, d);
    }
    inst.setMatrixAt(i, m.compose(pos, q, scl));
  });
  inst.instanceMatrix.needsUpdate = true;
  inst.computeBoundingSphere();
  inst.renderOrder = -1;
  return inst;
}
