import * as THREE from 'three';
import type { WeatherKind } from './Weather';
import { CHUNK_LEN, CHUNKS_AHEAD, PLAY_HALF_W } from '../util/geometry';
import { markShared } from '../util/dispose';

// Chain-link fence running the full segment length on both X edges.
// Visualised as a wireframe BoxGeometry with high subdivisions so
// the wireframe looks like a wire mesh rather than a flat panel.
// Collision is handled by clamping the player to PLAY_HALF_W in
// PlayerController, so the fence is purely cosmetic *unless* it's
// razor-wire-tipped (late stages), in which case touching the
// boundary costs a heart - see isTouchingFence below.

const FENCE_HEIGHT = 2.6;
const FENCE_THICKNESS = 0.05;
const FENCE_X_OFFSET = 0.3;
const RAZOR_TOP_HEIGHT = 0.25;

const POST_MAT = markShared(
  new THREE.MeshStandardMaterial({
    color: 0x3a3d44,
    roughness: 0.7,
  }),
);

const RAZOR_MAT = markShared(
  new THREE.MeshBasicMaterial({
    color: 0xff4040,
    transparent: true,
    opacity: 0.9,
  }),
);

// Pick fence wire colour from the current scene mood. Bright snow
// or daylight stages (1-2) get a black wire that pops against the
// pale surroundings. Rain or dim/night stages (3+) get a light grey
// wire that pops against the dark surroundings.
export function fenceColorFor(stage: number, weather: WeatherKind): number {
  if (weather === 'snow') return 0x111114; // black against snow
  if (weather === 'rain') return 0xc8d0d6; // light grey against rain
  // Clear weather: pick by stage darkness. Stages 1-2 = day; 3+ = dim.
  return stage <= 2 ? 0x111114 : 0xc8d0d6;
}

export function spawnFences(
  worldRoot: THREE.Group,
  stage: number,
  weather: WeatherKind,
  segLen: number,
  razorWire: boolean,
  // Visual length the fence should cover. Defaults to segLen + 4
  // (the original behaviour) but the caller can extend it past the
  // gameplay end so the fences continue toward the horizon and the
  // path reads as endless rather than terminating at the win line.
  visualLen: number = segLen + 4,
) {
  const totalLen = visualLen;
  const segsZ = Math.max(8, Math.round(totalLen / 0.6));
  const segsY = 5;
  const fenceGeo = new THREE.BoxGeometry(
    FENCE_THICKNESS,
    FENCE_HEIGHT,
    totalLen,
    1,
    segsY,
    segsZ,
  );

  const fenceMat = new THREE.MeshBasicMaterial({
    color: fenceColorFor(stage, weather),
    wireframe: true,
    transparent: true,
    opacity: 0.65,
  });

  const left = new THREE.Mesh(fenceGeo, fenceMat);
  left.position.set(-(PLAY_HALF_W + FENCE_X_OFFSET), FENCE_HEIGHT / 2, totalLen / 2);
  worldRoot.add(left);

  const right = new THREE.Mesh(fenceGeo, fenceMat);
  right.position.set(PLAY_HALF_W + FENCE_X_OFFSET, FENCE_HEIGHT / 2, totalLen / 2);
  worldRoot.add(right);

  // Razor wire: an additional thin red strip running along the top
  // of each fence as a visual warning. Hit detection is handled by
  // isTouchingFence + the razor flag in the game loop.
  if (razorWire) {
    const razorGeo = new THREE.BoxGeometry(
      FENCE_THICKNESS * 1.4,
      RAZOR_TOP_HEIGHT,
      totalLen,
    );
    for (const sx of [-1, 1]) {
      const wire = new THREE.Mesh(razorGeo, RAZOR_MAT);
      wire.position.set(
        sx * (PLAY_HALF_W + FENCE_X_OFFSET),
        FENCE_HEIGHT + RAZOR_TOP_HEIGHT * 0.5,
        totalLen / 2,
      );
      worldRoot.add(wire);
    }
  }

  const postGeo = new THREE.CylinderGeometry(0.08, 0.08, FENCE_HEIGHT, 6);
  const postSpacing = 6;
  const postCount = Math.floor(totalLen / postSpacing) + 1;
  for (let i = 0; i < postCount; i++) {
    const z = i * postSpacing;
    for (const sx of [-1, 1]) {
      const post = new THREE.Mesh(postGeo, POST_MAT);
      post.position.set(sx * (PLAY_HALF_W + FENCE_X_OFFSET), FENCE_HEIGHT / 2, z);
      worldRoot.add(post);
    }
  }
}

// Touch detection for razor wire - the player is considered to be
// in contact with the fence when they're hard up against the
// PlayerController's x-clamp boundary.
export function isTouchingFence(px: number): boolean {
  return Math.abs(px) >= PLAY_HALF_W - 0.04;
}
