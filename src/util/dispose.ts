import * as THREE from 'three';

// Per-instance geometry / material disposal helper used by the
// scene-rebuild teardown path.
//
// Three.js disposes resources only when the consumer asks. Mesh
// nodes ride along with `worldRoot.remove(...)` for free, but the
// underlying GPU buffers (geometry / material textures / shaders)
// stay resident until `geometry.dispose()` / `material.dispose()`
// is called. Without this pass, every stage advance leaks the
// per-instance fence wireframe, ground plane, win line, light
// tower / camera / dog / guard-figure parts, weather sheets, etc.
//
// Module-level shared resources (Obstacles.ts crate / wall / cover
// / barrel / boulder / hedge / car / tree / leaves geos + mats,
// Pickup.ts shared geos / mats, etc.) MUST NOT be disposed - other
// rebuilds reuse them. Mark each shared resource by setting
// `geometry.userData.shared = true` and `material.userData.shared
// = true`. The walker skips anything tagged.

export function markShared<T extends { userData: Record<string, unknown> }>(
  res: T,
): T {
  res.userData.shared = true;
  return res;
}

function isShared(res: { userData?: Record<string, unknown> } | undefined): boolean {
  return !!res?.userData?.shared;
}

// Recursively dispose every per-instance geometry / material under
// `node`. Safe to call on an already-detached node.
export function disposeSubtree(node: THREE.Object3D) {
  node.traverse((child) => {
    const mesh = child as THREE.Mesh;
    // Lines / points (batched rain) carry geometry + material too.
    const drawable =
      mesh.isMesh || (child as THREE.Line).isLine || (child as THREE.Points).isPoints;
    if ((child as THREE.InstancedMesh).isInstancedMesh) {
      // Frees the per-instance matrix buffer; geometry / material are
      // handled below like any mesh.
      (child as THREE.InstancedMesh).dispose();
    }
    if (drawable) {
      const geo = mesh.geometry as THREE.BufferGeometry | undefined;
      if (geo && !isShared(geo)) {
        geo.dispose();
      }
      const mat = mesh.material as
        | THREE.Material
        | THREE.Material[]
        | undefined;
      if (Array.isArray(mat)) {
        for (const m of mat) {
          if (!isShared(m)) m.dispose();
        }
      } else if (mat && !isShared(mat)) {
        mat.dispose();
      }
    }
  });
}
