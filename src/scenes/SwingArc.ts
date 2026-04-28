import * as THREE from 'three';

// Brief ground decal that visualises the crowbar's stun radius when
// the player swings. A flat ring at the player's feet, sized to
// CROWBAR_RANGE, that fades + scales out over ~180ms before being
// removed. Cheap (single mesh, single material) and self-contained.

export const SWING_ARC_LIFETIME = 0.18;

const ARC_MAT_TEMPLATE = {
  color: 0xffd14a,
  transparent: true,
  opacity: 0.9,
  side: THREE.DoubleSide,
  depthWrite: false,
};

export type SwingArc = {
  x: number;
  z: number;
  age: number;
  lifetime: number;
  mesh: THREE.Mesh;
  material: THREE.MeshBasicMaterial;
};

export function createSwingArc(x: number, z: number, radius: number): SwingArc {
  // Annulus that starts thin (just inside the radius) and grows
  // wider as it expands. Renders flat against the ground.
  const geo = new THREE.RingGeometry(radius * 0.72, radius * 0.92, 32);
  const material = new THREE.MeshBasicMaterial(ARC_MAT_TEMPLATE);
  const mesh = new THREE.Mesh(geo, material);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(x, 0.04, z);
  return { x, z, age: 0, lifetime: SWING_ARC_LIFETIME, mesh, material };
}

// Advance the arc; returns false when expired so the caller can
// despawn. Scale ramps up to ~1.3x and opacity fades to 0 across
// the lifetime.
export function updateSwingArc(arc: SwingArc, dt: number): boolean {
  arc.age += dt;
  const t = arc.age / arc.lifetime;
  if (t >= 1) return false;
  const eased = 1 - (1 - t) * (1 - t); // ease-out
  arc.mesh.scale.setScalar(1 + eased * 0.3);
  arc.material.opacity = 0.9 * (1 - eased);
  return true;
}

export function disposeSwingArc(arc: SwingArc) {
  arc.mesh.geometry.dispose();
  arc.material.dispose();
}
