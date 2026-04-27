import * as THREE from 'three';
import { CHUNK_LEN, CHUNKS_AHEAD, PLAY_HALF_W } from '../util/geometry';

// Chain-link fence running the full segment length on both X edges.
// Visualised as a wireframe BoxGeometry with high subdivisions so
// the wireframe looks like a wire mesh rather than a flat panel.
// Collision is handled by clamping the player to PLAY_HALF_W in
// PlayerController, so the fence is purely cosmetic.

const FENCE_HEIGHT = 2.6;
const FENCE_THICKNESS = 0.05;
const FENCE_X_OFFSET = 0.3;

const FENCE_MAT = new THREE.MeshBasicMaterial({
  color: 0x9aa3aa,
  wireframe: true,
  transparent: true,
  opacity: 0.55,
});

const POST_MAT = new THREE.MeshStandardMaterial({
  color: 0x3a3d44,
  roughness: 0.7,
});

export function spawnFences(worldRoot: THREE.Group) {
  const segLen = CHUNK_LEN * CHUNKS_AHEAD + 4; // overhang past the win line
  // Many subdivisions on the long axis so the wireframe reads as a
  // grid of squares (chain-link suggestion).
  const segsZ = Math.max(8, Math.round(segLen / 0.6));
  const segsY = 5;
  const fenceGeo = new THREE.BoxGeometry(
    FENCE_THICKNESS,
    FENCE_HEIGHT,
    segLen,
    1,
    segsY,
    segsZ,
  );

  const left = new THREE.Mesh(fenceGeo, FENCE_MAT);
  left.position.set(-(PLAY_HALF_W + FENCE_X_OFFSET), FENCE_HEIGHT / 2, segLen / 2);
  worldRoot.add(left);

  const right = new THREE.Mesh(fenceGeo, FENCE_MAT);
  right.position.set(PLAY_HALF_W + FENCE_X_OFFSET, FENCE_HEIGHT / 2, segLen / 2);
  worldRoot.add(right);

  // Solid posts at intervals to anchor the fence visually.
  const postGeo = new THREE.CylinderGeometry(0.08, 0.08, FENCE_HEIGHT, 6);
  const postSpacing = 6;
  const postCount = Math.floor(segLen / postSpacing) + 1;
  for (let i = 0; i < postCount; i++) {
    const z = i * postSpacing;
    for (const sx of [-1, 1]) {
      const post = new THREE.Mesh(postGeo, POST_MAT);
      post.position.set(sx * (PLAY_HALF_W + FENCE_X_OFFSET), FENCE_HEIGHT / 2, z);
      worldRoot.add(post);
    }
  }
}
