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

// Arena variant: a closed rectangular fence around a small playfield.
// Unlike the standard linear-segment fences (which extend past the
// gameplay end into a horizon), this builds four sides that meet
// cleanly at the corners with explicit corner posts and no overrun.
//
// Returns the shared wireframe material so the render loop can pulse
// its opacity (matches the in-arena "you're being watched" mood).
export type ArenaFence = {
  glowMat: THREE.MeshBasicMaterial;
};

export function spawnArenaFences(
  worldRoot: THREE.Group,
  stage: number,
  weather: WeatherKind,
  segLen: number,
): ArenaFence {
  const widthSpan = (PLAY_HALF_W + FENCE_X_OFFSET) * 2;
  const fenceMat = new THREE.MeshBasicMaterial({
    color: fenceColorFor(stage, weather),
    wireframe: true,
    transparent: true,
    opacity: 0.65,
  });
  const segsLong = Math.max(8, Math.round(segLen / 0.6));
  const segsWide = Math.max(8, Math.round(widthSpan / 0.6));

  // Side fences run along Z. Geo is shortened by FENCE_THICKNESS so
  // the panels sit *inside* the corner-post line - the front / back
  // panels (which run along X) own those endpoints.
  const sideGeo = new THREE.BoxGeometry(
    FENCE_THICKNESS,
    FENCE_HEIGHT,
    Math.max(0.1, segLen - FENCE_THICKNESS),
    1,
    5,
    segsLong,
  );
  for (const sx of [-1, 1]) {
    const panel = new THREE.Mesh(sideGeo, fenceMat);
    panel.position.set(
      sx * (PLAY_HALF_W + FENCE_X_OFFSET),
      FENCE_HEIGHT / 2,
      segLen / 2,
    );
    worldRoot.add(panel);
  }

  // Front + back fences run along X. Width matches the corner-to-
  // corner span so the rectangle closes exactly.
  const endGeo = new THREE.BoxGeometry(
    widthSpan,
    FENCE_HEIGHT,
    FENCE_THICKNESS,
    segsWide,
    5,
    1,
  );
  const front = new THREE.Mesh(endGeo, fenceMat);
  front.position.set(0, FENCE_HEIGHT / 2, 0);
  worldRoot.add(front);
  const back = new THREE.Mesh(endGeo, fenceMat);
  back.position.set(0, FENCE_HEIGHT / 2, segLen);
  worldRoot.add(back);

  // Corner posts: a chunky cylinder at each of the four corners
  // (slightly thicker than the linear-segment posts so the corner
  // reads as a deliberate intersection rather than a wireframe seam).
  const cornerPostGeo = new THREE.CylinderGeometry(0.11, 0.11, FENCE_HEIGHT, 10);
  for (const sx of [-1, 1]) {
    for (const sz of [0, segLen]) {
      const post = new THREE.Mesh(cornerPostGeo, POST_MAT);
      post.position.set(
        sx * (PLAY_HALF_W + FENCE_X_OFFSET),
        FENCE_HEIGHT / 2,
        sz,
      );
      worldRoot.add(post);
    }
  }

  // A few intermediate posts along each side so the arena reads as
  // a real fenced-in lot rather than four floating panels.
  const sidePostGeo = new THREE.CylinderGeometry(0.08, 0.08, FENCE_HEIGHT, 6);
  const SIDE_POST_SPACING = 6;
  const sideCount = Math.max(0, Math.floor(segLen / SIDE_POST_SPACING) - 1);
  for (let i = 1; i <= sideCount; i++) {
    const z = (i * segLen) / (sideCount + 1);
    for (const sx of [-1, 1]) {
      const post = new THREE.Mesh(sidePostGeo, POST_MAT);
      post.position.set(
        sx * (PLAY_HALF_W + FENCE_X_OFFSET),
        FENCE_HEIGHT / 2,
        z,
      );
      worldRoot.add(post);
    }
  }
  const endCount = Math.max(0, Math.floor(widthSpan / SIDE_POST_SPACING) - 1);
  for (let i = 1; i <= endCount; i++) {
    const x = -widthSpan / 2 + (i * widthSpan) / (endCount + 1);
    for (const sz of [0, segLen]) {
      const post = new THREE.Mesh(sidePostGeo, POST_MAT);
      post.position.set(x, FENCE_HEIGHT / 2, sz);
      worldRoot.add(post);
    }
  }

  return { glowMat: fenceMat };
}
