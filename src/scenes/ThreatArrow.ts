import * as THREE from 'three';

// Small flat arrow on the ground, parented to the world root and
// repositioned per frame around the player at the perimeter of the
// radial detection meter, pointing outward toward the source guard.

const ARROW_RADIUS = 2.05; // just outside the 1.6 radial meter
const ARROW_Y = 0.07;

export type ThreatArrow = {
  mesh: THREE.Mesh;
  material: THREE.MeshBasicMaterial;
};

function buildGeometry(): THREE.BufferGeometry {
  // Triangle pointing along its local +X axis. Tip at +0.45, base at
  // -0.18, half-width 0.30.
  const verts = new Float32Array([
    0.45, 0, 0,
    -0.18, 0, 0.30,
    -0.18, 0, -0.30,
  ]);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(verts, 3));
  geo.setIndex([0, 1, 2]);
  geo.computeVertexNormals();
  return geo;
}

const sharedGeo = buildGeometry();

export function createThreatArrow(): ThreatArrow {
  const mat = new THREE.MeshBasicMaterial({
    color: 0xffd14a,
    transparent: true,
    opacity: 0.85,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(sharedGeo, mat);
  mesh.visible = false;
  return { mesh, material: mat };
}

function colorFor(detection: number): number {
  if (detection >= 0.85) return 0xff4444;
  if (detection >= 0.5) return 0xffaa33;
  return 0xffd14a;
}

// Place the arrow on the perimeter of the radial meter, pointing
// outward in the bearing of `from -> to` (player -> guard). Caller
// supplies player.x/z and the threat source x/z plus its detection.
export function updateThreatArrow(
  arrow: ThreatArrow,
  px: number,
  pz: number,
  gx: number,
  gz: number,
  detection: number,
) {
  if (detection < 0.05) {
    arrow.mesh.visible = false;
    return;
  }
  const dx = gx - px;
  const dz = gz - pz;
  const len = Math.hypot(dx, dz) || 1;
  const ux = dx / len;
  const uz = dz / len;
  arrow.mesh.position.set(px + ux * ARROW_RADIUS, ARROW_Y, pz + uz * ARROW_RADIUS);
  // The arrow's +X local axis is the pointing direction. We need to
  // rotate the mesh around Y so its +X aligns with the (ux, uz)
  // vector. Note three's Y rotation: positive angles rotate from +X
  // toward -Z, i.e. y_rot = -atan2(uz, ux).
  arrow.mesh.rotation.y = -Math.atan2(uz, ux);
  arrow.material.color.setHex(colorFor(detection));
  arrow.material.opacity = 0.55 + detection * 0.4;
  arrow.mesh.visible = true;
}
