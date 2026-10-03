import * as THREE from 'three';
import { markShared } from '../util/dispose';

// Static prop batching. Every kit prop / vehicle is a Group of meshes
// that share their template geometry and materials, so a chunk of ~8
// props drew ~60-120 times (one draw per sub-mesh per material group).
// batchStaticMeshes moves every such mesh under `root` into one
// InstancedMesh per (geometry, materials) - ~10-15 draws a chunk - and
// leaves the (now empty) prop Groups in place, so code holding them
// (Obstacle.mesh: parent, transform) keeps working.
//
// Only meshes whose geometry AND materials are all marked shared are
// batched (nothing per-instance to lose), and only when at least
// `minCount` of them share a bucket. The picture is the same: same
// geometry, same material settings, same world transforms.

// Instanced draws compile a different program variant; a material
// drawn both plain and instanced would have its program re-resolved on
// every switch. Batched meshes therefore draw with their own clone.
const INSTANCED_VARIANT = new WeakMap<THREE.Material, THREE.Material>();
function instancedVariant(m: THREE.Material): THREE.Material {
  let v = INSTANCED_VARIANT.get(m);
  if (!v) {
    v = m.clone();
    v.name = m.name;
    markShared(v);
    INSTANCED_VARIANT.set(m, v);
  }
  return v;
}

function isShared(o: { userData?: Record<string, unknown> } | undefined | null): boolean {
  return !!o?.userData?.shared;
}

export function isBatchable(mesh: THREE.Object3D): mesh is THREE.Mesh {
  const m = mesh as THREE.Mesh;
  if (!m.isMesh || (m as THREE.InstancedMesh).isInstancedMesh || (m as THREE.SkinnedMesh).isSkinnedMesh) return false;
  if (m.morphTargetInfluences && m.morphTargetInfluences.length > 0) return false;
  if (!isShared(m.geometry as THREE.BufferGeometry)) return false;
  const mats = Array.isArray(m.material) ? m.material : [m.material];
  return mats.length > 0 && mats.every((x) => isShared(x));
}

type Bucket = {
  geometry: THREE.BufferGeometry;
  material: THREE.Material | THREE.Material[];
  matrices: THREE.Matrix4[];
  renderOrder: number;
};

const tmpInv = new THREE.Matrix4();

// Batch the shared-template meshes found under each of `sources`
// (which must already be children / descendants of `root`). Returns the
// InstancedMeshes added to `root`.
export function batchStaticMeshes(root: THREE.Object3D, sources: readonly THREE.Object3D[], minCount = 1): THREE.InstancedMesh[] {
  root.updateWorldMatrix(true, true);
  tmpInv.copy(root.matrixWorld).invert();
  const buckets = new Map<string, Bucket>();
  const found: Array<{ mesh: THREE.Mesh; key: string }> = [];
  for (const src of sources) {
    src.traverse((o) => {
      if (!isBatchable(o) || !o.visible) return;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      const key = `${o.geometry.id}|${mats.map((m) => m.id).join(',')}|${Array.isArray(o.material) ? 'a' : 's'}|${o.renderOrder}`;
      found.push({ mesh: o, key });
    });
  }
  const counts = new Map<string, number>();
  for (const f of found) counts.set(f.key, (counts.get(f.key) ?? 0) + 1);
  for (const { mesh, key } of found) {
    if ((counts.get(key) ?? 0) < minCount) continue;
    // Visible all the way up to `root`? (A hidden ancestor would hide
    // the mesh; keep such meshes as they are.)
    let p: THREE.Object3D | null = mesh.parent;
    let shown = true;
    while (p && p !== root) {
      if (!p.visible) shown = false;
      p = p.parent;
    }
    if (!shown) continue;
    let b = buckets.get(key);
    if (!b) {
      b = {
        geometry: mesh.geometry as THREE.BufferGeometry,
        material: Array.isArray(mesh.material) ? mesh.material.map(instancedVariant) : instancedVariant(mesh.material),
        matrices: [],
        renderOrder: mesh.renderOrder,
      };
      buckets.set(key, b);
    }
    b.matrices.push(new THREE.Matrix4().multiplyMatrices(tmpInv, mesh.matrixWorld));
    mesh.parent?.remove(mesh);
  }
  const out: THREE.InstancedMesh[] = [];
  for (const b of buckets.values()) {
    const inst = new THREE.InstancedMesh(b.geometry, b.material, b.matrices.length);
    for (let i = 0; i < b.matrices.length; i++) inst.setMatrixAt(i, b.matrices[i]);
    inst.instanceMatrix.needsUpdate = true;
    inst.renderOrder = b.renderOrder;
    inst.computeBoundingSphere();
    inst.name = 'staticBatch';
    root.add(inst);
    out.push(inst);
  }
  return out;
}
