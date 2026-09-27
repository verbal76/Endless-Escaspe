import * as THREE from 'three';
import type { WeatherKind } from './Weather';
import { PLAYER_X_LIMIT, PLAY_HALF_W } from '../util/geometry';
import { markShared } from '../util/dispose';

// Chain-link fence running the full segment length on both X edges.
// Visualised as a textured, alpha-tested diamond-mesh panel with a
// top rail and instanced posts (it used to be a subdivided wireframe
// box, which read as a debug mesh).
// Collision is handled by clamping the player to PLAY_HALF_W in
// PlayerController, so the fence is purely cosmetic *unless* it's
// razor-wire-tipped (late stages), in which case touching the
// boundary costs a heart - see isTouchingFence below.

const FENCE_HEIGHT = 2.6;
const FENCE_THICKNESS = 0.05;
const FENCE_X_OFFSET = 0.3;
const RAZOR_TOP_HEIGHT = 0.25;

const POST_MAT = markShared(
  new THREE.MeshLambertMaterial({
    color: 0x3a3d44,
  }),
);

const RAZOR_MAT = markShared(
  new THREE.MeshLambertMaterial({
    color: 0xd8dde4,
    emissive: 0xff3030,
    emissiveIntensity: 0.35,
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

// Chain-link texture: a diamond wire lattice generated in code (no
// asset, no canvas - RN has none) as a small tiling RGBA DataTexture.
// Alpha is 0 between the wires so the mesh reads as see-through
// fencing; alphaTest keeps it cheap (no sorting / blending).
const LINK_TEX_SIZE = 32;
// Metres of fence covered by one texture tile (one diamond).
const LINK_TILE_M = 0.42;
let LINK_TEX: THREE.DataTexture | null = null;
function chainLinkTexture(): THREE.DataTexture {
  if (LINK_TEX) return LINK_TEX;
  const n = LINK_TEX_SIZE;
  const data = new Uint8Array(n * n * 4);
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      // Distance to the two diagonal wire families (wrapping).
      const a = Math.abs(((x + y) % n) - n / 2);
      const b = Math.abs(((x - y + n) % n) - n / 2);
      const d = Math.min(n / 2 - a, n / 2 - b);
      const wire = d < 1.6 ? 1 : d < 2.4 ? 0.5 : 0;
      const i = (y * n + x) * 4;
      // Slight sheen along the wire centre.
      const shade = d < 0.8 ? 255 : 205;
      data[i] = shade;
      data[i + 1] = shade;
      data[i + 2] = shade;
      data[i + 3] = Math.round(wire * 255);
    }
  }
  const tex = new THREE.DataTexture(data, n, n, THREE.RGBAFormat);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  markShared(tex);
  LINK_TEX = tex;
  return tex;
}

// Plane geometry whose UVs are pre-scaled so the shared texture tiles
// at LINK_TILE_M regardless of panel size (no per-panel texture copy).
function chainLinkPanel(width: number, height: number): THREE.PlaneGeometry {
  const geo = new THREE.PlaneGeometry(width, height);
  const uv = geo.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) {
    uv.setXY(i, (uv.getX(i) * width) / LINK_TILE_M, (uv.getY(i) * height) / LINK_TILE_M);
  }
  uv.needsUpdate = true;
  return geo;
}

function chainLinkMaterial(color: number): THREE.MeshLambertMaterial {
  return new THREE.MeshLambertMaterial({
    color,
    map: chainLinkTexture(),
    alphaTest: 0.35,
    side: THREE.DoubleSide,
    emissive: color,
    emissiveIntensity: 0.15,
  });
}

const RAIL_MAT = markShared(new THREE.MeshLambertMaterial({ color: 0x55585f }));

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
  // World Z of this run of fence. The first stretch starts a little
  // behind spawn so the camera never sees the fence begin; Endless
  // sections butt up against each other.
  zStart: number | null = null,
) {
  const startZ = zStart ?? -6;
  const len = zStart === null ? visualLen - startZ : visualLen;
  const fenceX = PLAY_HALF_W + FENCE_X_OFFSET;
  const mat = chainLinkMaterial(fenceColorFor(stage, weather));
  const panelGeo = chainLinkPanel(len, FENCE_HEIGHT);
  for (const sx of [-1, 1]) {
    const panel = new THREE.Mesh(panelGeo, mat);
    panel.rotation.y = Math.PI / 2;
    panel.position.set(sx * fenceX, FENCE_HEIGHT / 2, startZ + len / 2);
    worldRoot.add(panel);
  }

  // Top rail along each side.
  const railGeo = new THREE.CylinderGeometry(0.035, 0.035, len, 6);
  railGeo.rotateX(Math.PI / 2);
  for (const sx of [-1, 1]) {
    const rail = new THREE.Mesh(railGeo, RAIL_MAT);
    rail.position.set(sx * fenceX, FENCE_HEIGHT, startZ + len / 2);
    worldRoot.add(rail);
  }

  // Razor wire: a coiled strip along the top of each fence as a
  // visual warning. Hit detection is handled by isTouchingFence + the
  // razor flag in the game loop.
  if (razorWire) {
    const coilGeo = new THREE.TorusGeometry(0.16, 0.018, 4, 10);
    const COIL_STEP = 0.32;
    const coils = Math.floor(len / COIL_STEP);
    const inst = new THREE.InstancedMesh(coilGeo, RAZOR_MAT, coils * 2);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), 0);
    const pos = new THREE.Vector3();
    const one = new THREE.Vector3(1, 1, 1);
    let k = 0;
    for (const sx of [-1, 1]) {
      for (let i = 0; i < coils; i++) {
        pos.set(sx * fenceX, FENCE_HEIGHT + RAZOR_TOP_HEIGHT * 0.6, startZ + i * COIL_STEP);
        q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), 0.35 * (i % 2 === 0 ? 1 : -1));
        inst.setMatrixAt(k++, m.compose(pos, q, one));
      }
    }
    inst.instanceMatrix.needsUpdate = true;
    inst.computeBoundingSphere();
    worldRoot.add(inst);
  }

  // Posts every 3 m on both sides, drawn as one instanced mesh.
  const postGeo = new THREE.CylinderGeometry(0.06, 0.07, FENCE_HEIGHT + 0.1, 6);
  const postSpacing = 3;
  const postCount = Math.floor(len / postSpacing) + 1;
  const posts = new THREE.InstancedMesh(postGeo, POST_MAT, postCount * 2);
  const pm = new THREE.Matrix4();
  let pi = 0;
  for (let i = 0; i < postCount; i++) {
    const z = startZ + i * postSpacing;
    for (const sx of [-1, 1]) {
      pm.makeTranslation(sx * fenceX, (FENCE_HEIGHT + 0.1) / 2, z);
      posts.setMatrixAt(pi++, pm);
    }
  }
  posts.instanceMatrix.needsUpdate = true;
  posts.computeBoundingSphere();
  worldRoot.add(posts);
}

// Chain-link panel for a straight run between two points (used for
// the boss arena back wall).
export function spawnChainLinkWall(
  worldRoot: THREE.Group,
  width: number,
  centerX: number,
  z: number,
  color: number = 0xc8d0d6,
) {
  const wall = new THREE.Mesh(chainLinkPanel(width, FENCE_HEIGHT), chainLinkMaterial(color));
  wall.position.set(centerX, FENCE_HEIGHT / 2, z);
  worldRoot.add(wall);
  const railGeo = new THREE.CylinderGeometry(0.035, 0.035, width, 6);
  railGeo.rotateZ(Math.PI / 2);
  const rail = new THREE.Mesh(railGeo, RAIL_MAT);
  rail.position.set(centerX, FENCE_HEIGHT, z);
  worldRoot.add(rail);
}

// Touch detection for razor wire - the player is considered to be
// in contact with the fence when they're hard up against the
// PlayerController's x-clamp boundary. The clamp limits the player's
// *centre* to PLAYER_X_LIMIT (half-width minus body radius); testing
// against PLAY_HALF_W itself was unreachable, so razor wire never
// fired.
export const FENCE_TOUCH_EPS = 0.04;
export function isTouchingFence(px: number): boolean {
  return Math.abs(px) >= PLAYER_X_LIMIT - FENCE_TOUCH_EPS;
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
