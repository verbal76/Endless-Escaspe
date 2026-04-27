import * as THREE from 'three';
import type { WeatherKind } from './Weather';
import { CHUNK_LEN, CHUNKS_AHEAD, PLAY_HALF_W } from '../util/geometry';

// Chain-link fence running the full segment length on both X edges.
// Visualised as a wireframe BoxGeometry with high subdivisions so
// the wireframe looks like a wire mesh rather than a flat panel.
// Collision is handled by clamping the player to PLAY_HALF_W in
// PlayerController, so the fence is purely cosmetic.
//
// Colour adapts to backdrop brightness so the wire is always
// readable: bright scenes (daylight or snow) get a black fence;
// dim scenes (night or rain) get a light grey fence. The decision
// is made at scene init from the current stage + weather.

const FENCE_HEIGHT = 2.6;
const FENCE_THICKNESS = 0.05;
const FENCE_X_OFFSET = 0.3;

const POST_MAT = new THREE.MeshStandardMaterial({
  color: 0x3a3d44,
  roughness: 0.7,
});

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
) {
  const segLen = CHUNK_LEN * CHUNKS_AHEAD + 4;
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

  const fenceMat = new THREE.MeshBasicMaterial({
    color: fenceColorFor(stage, weather),
    wireframe: true,
    transparent: true,
    opacity: 0.65,
  });

  const left = new THREE.Mesh(fenceGeo, fenceMat);
  left.position.set(-(PLAY_HALF_W + FENCE_X_OFFSET), FENCE_HEIGHT / 2, segLen / 2);
  worldRoot.add(left);

  const right = new THREE.Mesh(fenceGeo, fenceMat);
  right.position.set(PLAY_HALF_W + FENCE_X_OFFSET, FENCE_HEIGHT / 2, segLen / 2);
  worldRoot.add(right);

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
