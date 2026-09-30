import * as THREE from 'three';
import { CHUNK_LEN, CHUNKS_AHEAD, PLAY_HALF_W } from '../util/geometry';
import { createKitPropInstances } from './KitProps';
import type { StageLighting } from './Lighting';

// Layered backdrop: snow-capped mountains far back, a tree line in
// the midground, drifting clouds, and birds crossing the sky. None
// of this is interactive; everything sits outside the playfield and
// gets natural perspective parallax from the camera follow rig
// (distant things barely move on screen as the camera tracks the
// player; closer things move more).
//
// Performance: the entire backdrop is built up once at scene setup.
// Birds and clouds animate by integrating x positions; nothing
// allocates per frame.

const segLen = CHUNK_LEN * CHUNKS_AHEAD;

// Far scenery: a gradient sky dome and two mountain ridges, all kept
// centred on the player (every mode) so they never drift or "develop"
// as the player walks. Ridges are arcs at a fixed distance, so looking
// left / right never reaches an end. They are unlit and fog-free, with
// the haze painted into their vertex colours: the old 14 flat-shaded
// pyramids at ~720 m sat 85-96% inside the fog (lighter than the sky),
// were backlit, and their snow caps were buried and z-fought.
//
// The camera tilts ~25 deg down, so the sky band above the horizon is
// only ~5 deg tall: peaks are sized to ~2-3.5 deg of elevation so they
// sit inside it rather than being cut off by the top of the screen.
const DOME_R = 1400;
const RIDGE_FAR = { dist: 900, base: 18, amp: 40, peaks: 16, snowLine: 42, seed: 7 };
const RIDGE_NEAR = { dist: 640, base: 8, amp: 22, peaks: 14, snowLine: 999, seed: 13 };
const RIDGE_ARC = (125 * Math.PI) / 180; // +-125 deg around the view axis
const RIDGE_COLUMNS = 110;
const RIDGE_HAZE = 0.55; // base colour mixed this far toward the horizon

// Mid-ground tree line flanks the playfield.
const TREE_LINE_OUTER = PLAY_HALF_W + 8;
const TREE_LINE_FAR = PLAY_HALF_W + 24;
// 28 -> 168 (6x) so the outside-fence tree line reads as a real
// pine forest pressing in on the yard rather than a sparse picket
// of distant landmarks. Spread is the same z-range; the per-side
// trees just pack tighter and the random x-jitter inside the
// TREE_LINE_OUTER..TREE_LINE_FAR band gives them depth.
const TREE_COUNT_PER_SIDE = 168;

// Sky props
const CLOUD_COUNT = 6;
const CLOUD_Y = 36;
const CLOUD_DRIFT_SPEED = 0.6; // m/s; very slow drift

const BIRD_COUNT = 7;
const BIRD_Y = 22;
const BIRD_SPEED_MIN = 5;
const BIRD_SPEED_MAX = 9;

const FAR_MAT = new THREE.MeshBasicMaterial({ vertexColors: true, fog: false, side: THREE.DoubleSide });
const DOME_MAT = new THREE.MeshBasicMaterial({
  vertexColors: true,
  fog: false,
  side: THREE.BackSide,
  depthWrite: false,
});
// Clouds and birds are tinted per stage mood (applyBackdropMood) so
// they don't glow white against a night sky.
const CLOUD_DAY = new THREE.Color(0xf2f2f7);
const CLOUD_MAT = new THREE.MeshBasicMaterial({
  color: 0xf2f2f7,
  transparent: true,
  opacity: 0.55,
  depthWrite: false,
  fog: false,
});
const BIRD_MAT = new THREE.MeshBasicMaterial({
  color: 0x111114,
  transparent: true,
  opacity: 0.85,
  side: THREE.DoubleSide,
  depthWrite: false,
});

// Pre-built shared geos. Trunk segs 8 -> 14 and leaves bumped one
// icosahedron-detail tier so the distant tree silhouettes don't
// read as obvious low-poly cylinders + spiky icosahedra against
// the sky.
// Backdrop trees are Kenney pine OBJ models now (see buildTreeMesh
// below); the procedural trunk/leaves geos and snow-cap dome are
// retired with the swap.

type RidgeSpec = typeof RIDGE_FAR;

// Height profile: max of seeded triangular peaks over a base, plus a
// small wobble. `t` runs 0..1 across the arc.
function ridgeHeights(spec: RidgeSpec): number[] {
  const rng = mulberry(spec.seed * 7919);
  const peaks: { t: number; h: number; w: number }[] = [];
  for (let i = 0; i < spec.peaks; i++) {
    peaks.push({ t: rng(), h: spec.amp * (0.45 + rng() * 0.55), w: 0.025 + rng() * 0.05 });
  }
  const out: number[] = [];
  for (let c = 0; c <= RIDGE_COLUMNS; c++) {
    const t = c / RIDGE_COLUMNS;
    let h = spec.base;
    for (const p of peaks) h = Math.max(h, spec.base + p.h * Math.pow(Math.max(0, 1 - Math.abs(t - p.t) / p.w), 1.15));
    out.push(h + Math.sin(t * 40 + spec.seed) * 1.2);
  }
  return out;
}

// One ridge = a strip of quads along an arc around the origin (the
// player), from just below the ground plane up to the height profile.
// Painting (paintFar) colours by vertex height: below ground = hazed
// base, mid = layer colour, above the snow line = snow.
function buildRidge(spec: RidgeSpec): THREE.Mesh {
  const hs = ridgeHeights(spec);
  const pos: number[] = [];
  for (let c = 0; c < RIDGE_COLUMNS; c++) {
    const a0 = -RIDGE_ARC + (c / RIDGE_COLUMNS) * 2 * RIDGE_ARC;
    const a1 = -RIDGE_ARC + ((c + 1) / RIDGE_COLUMNS) * 2 * RIDGE_ARC;
    const x0 = Math.sin(a0) * spec.dist, z0 = Math.cos(a0) * spec.dist;
    const x1 = Math.sin(a1) * spec.dist, z1 = Math.cos(a1) * spec.dist;
    const h0 = hs[c], h1 = hs[c + 1];
    // Two bands per column: ground..snow-start, then snow-start..peak,
    // so the snow colour stays a cap on the upper slope instead of
    // fading all the way down the mountain.
    const m0 = Math.min(h0, spec.snowLine - 8), m1 = Math.min(h1, spec.snowLine - 8);
    pos.push(x0, -6, z0, x1, -6, z1, x1, m1, z1, x0, -6, z0, x1, m1, z1, x0, m0, z0);
    pos.push(x0, m0, z0, x1, m1, z1, x1, h1, z1, x0, m0, z0, x1, h1, z1, x0, h0, z0);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(pos.length), 3));
  g.userData.spec = spec;
  const m = new THREE.Mesh(g, FAR_MAT);
  m.frustumCulled = false;
  return m;
}

function buildDome(): THREE.Mesh {
  const g = new THREE.SphereGeometry(DOME_R, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2 + 0.2);
  g.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 3), 3));
  const m = new THREE.Mesh(g, DOME_MAT);
  m.renderOrder = -10;
  m.frustumCulled = false;
  return m;
}

const _c0 = new THREE.Color();
const _c1 = new THREE.Color();
const _c2 = new THREE.Color();

// Paint the mood into the far scenery's vertex colours.
function paintFar(b: Backdrop, light: StageLighting) {
  const horizon = _c0.setHex(light.horizon);
  const zenith = _c1.setHex(light.zenith);
  const dome = b.dome.geometry;
  const dp = dome.attributes.position;
  const dc = dome.attributes.color as THREE.BufferAttribute;
  for (let i = 0; i < dp.count; i++) {
    const t = Math.pow(Math.max(0, dp.getY(i) / DOME_R), 0.55);
    _c2.copy(horizon).lerp(zenith, t);
    dc.setXYZ(i, _c2.r, _c2.g, _c2.b);
  }
  dc.needsUpdate = true;
  for (const ridge of b.ridges) {
    const spec = ridge.geometry.userData.spec as RidgeSpec;
    const layer = new THREE.Color(spec === RIDGE_FAR ? light.ridgeFar : light.ridgeNear);
    const snow = new THREE.Color(light.snow);
    const base = layer.clone().lerp(horizon, RIDGE_HAZE);
    const p = ridge.geometry.attributes.position;
    const col = ridge.geometry.attributes.color as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i);
      const c = y < 0 ? base : y > spec.snowLine ? snow : layer;
      col.setXYZ(i, c.r, c.g, c.b);
    }
    col.needsUpdate = true;
  }
}

function buildCloudMesh(rng: () => number): THREE.Mesh {
  const w = 18 + rng() * 22;
  const h = 6 + rng() * 5;
  const geo = new THREE.PlaneGeometry(w, h);
  const m = new THREE.Mesh(geo, CLOUD_MAT);
  // Face the camera roughly (we're looking forward and down).
  m.rotation.x = -Math.PI / 6;
  return m;
}

function buildBirdMesh(): THREE.Mesh {
  // Tiny V shape from two triangles.
  const verts = new Float32Array([
    -0.6, 0, 0,
    0, 0.18, 0.05,
    0, 0, -0.05,

    0, 0.18, 0.05,
    0.6, 0, 0,
    0, 0, -0.05,
  ]);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(verts, 3));
  geo.computeVertexNormals();
  return new THREE.Mesh(geo, BIRD_MAT);
}

// Tiny seeded RNG so the scenery is consistent run-to-run.
function mulberry(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Bird = {
  mesh: THREE.Mesh;
  vx: number;
  baseY: number;
  flapPhase: number;
};

type Cloud = {
  mesh: THREE.Mesh;
};

export type Backdrop = {
  group: THREE.Group;
  // Sky dome + ridges; kept centred on the player (updateBackdropFar).
  far: THREE.Group;
  dome: THREE.Mesh;
  ridges: THREE.Mesh[];
  birds: Bird[];
  clouds: Cloud[];
  bounds: { left: number; right: number };
};

const BACKDROP_BOUNDS = { left: -120, right: 120 };

export function createBackdrop(): Backdrop {
  const root = new THREE.Group();
  const rng = mulberry(0x9e3779b9);

  const far = new THREE.Group();
  const dome = buildDome();
  const ridges = [buildRidge(RIDGE_FAR), buildRidge(RIDGE_NEAR)];
  far.add(dome, ...ridges);
  root.add(far);

  // Tree line on each side of the playfield.
  const clouds: Cloud[] = [];
  for (let i = 0; i < CLOUD_COUNT; i++) {
    const c = buildCloudMesh(rng);
    const x = BACKDROP_BOUNDS.left + rng() * (BACKDROP_BOUNDS.right - BACKDROP_BOUNDS.left);
    const z = segLen * 0.3 + rng() * (segLen * 1.4);
    c.position.set(x, CLOUD_Y + (rng() - 0.5) * 6, z);
    root.add(c);
    clouds.push({ mesh: c });
  }

  // Birds crossing horizontally with slight up-down flap.
  const birds: Bird[] = [];
  for (let i = 0; i < BIRD_COUNT; i++) {
    const b = buildBirdMesh();
    const x = BACKDROP_BOUNDS.left + rng() * (BACKDROP_BOUNDS.right - BACKDROP_BOUNDS.left);
    const z = 30 + rng() * (segLen + 30);
    b.position.set(x, BIRD_Y + rng() * 8, z);
    b.scale.setScalar(0.9 + rng() * 0.6);
    root.add(b);
    birds.push({
      mesh: b,
      vx: BIRD_SPEED_MIN + rng() * (BIRD_SPEED_MAX - BIRD_SPEED_MIN),
      baseY: b.position.y,
      flapPhase: rng() * Math.PI * 2,
    });
  }

  const b: Backdrop = { group: root, far, dome, ridges, birds, clouds, bounds: BACKDROP_BOUNDS };
  return b;
}

// Toggle snow caps on every backdrop tree. Called by Game.tsx after
// each scene rebuild so the distant trees match the just-picked
// weather without us having to rebuild the backdrop itself.
// No-op kept for the existing call-site in Game.tsx. Backdrop trees
// no longer carry snow caps (the sphere drape didn't fit the conical
// pine silhouette and read as a giant white dome covering the tree),
// so toggling weather on the backdrop is a visual no-op now.
// Tint clouds and birds for the stage mood: at night clouds sink
// toward the sky colour (faintly lighter so they still read as
// shapes) and birds fade toward silhouettes that barely separate from
// the sky.
export function applyBackdropMood(b: Backdrop, light: StageLighting) {
  paintFar(b, light);
  const sky = new THREE.Color(light.sky);
  const k = light.darkness;
  CLOUD_MAT.color.copy(CLOUD_DAY).lerp(sky.clone().offsetHSL(0, 0, 0.08), k * 0.85);
  CLOUD_MAT.opacity = 0.55 - 0.25 * k;
  BIRD_MAT.color.setHex(0x111114).lerp(sky, k * 0.5);
  BIRD_MAT.opacity = 0.85 - 0.35 * k;
}

// Tree lines along both fences for one stretch of yard, drawn as
// instances (one InstancedMesh per pine variant / material group).
// Built per campaign segment or per Endless section, so the forest
// always reaches as far as the yard does.
const TREES_PER_METRE = TREE_COUNT_PER_SIDE / (segLen + 40);

export function createTreeLine(zStart: number, length: number, seed: number): THREE.Group {
  const rng = mulberry(seed ^ 0x51f15e);
  const count = Math.max(2, Math.round(length * TREES_PER_METRE));
  const mats: Record<'treePineTallA' | 'treePineTallADetailed', THREE.Matrix4[]> = {
    treePineTallA: [],
    treePineTallADetailed: [],
  };
  const tints: Record<'treePineTallA' | 'treePineTallADetailed', THREE.Color[]> = {
    treePineTallA: [],
    treePineTallADetailed: [],
  };
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const pos = new THREE.Vector3();
  const scl = new THREE.Vector3();
  for (let i = 0; i < count; i++) {
    const z = zStart + (i / (count - 1)) * length + (rng() - 0.5) * 4;
    for (const sign of [-1, 1]) {
      const xJitter = rng() * (TREE_LINE_FAR - TREE_LINE_OUTER);
      const variant = rng() < 0.5 ? 'treePineTallA' : 'treePineTallADetailed';
      // Varied sizes, and about half the trees sunk a little so fewer
      // bare trunks show: the band reads as a forest, not a row of
      // identical copies.
      const sc = 3.5 * (0.7 + rng() * 0.8);
      const sink = rng() < 0.5 ? rng() * 0.35 * sc : 0;
      pos.set(sign * (TREE_LINE_OUTER + xJitter), -sink, z);
      q.setFromAxisAngle(up, rng() * Math.PI * 2);
      scl.set(sc, sc, sc);
      mats[variant].push(new THREE.Matrix4().compose(pos, q, scl));
      // Instance tint: +-10% lightness with a slight green/blue drift.
      const l = 0.9 + rng() * 0.2;
      tints[variant].push(new THREE.Color(l * (0.94 + rng() * 0.06), l, l * (0.94 + rng() * 0.1)));
    }
  }
  const g = new THREE.Group();
  g.add(createKitPropInstances('treePineTallA', mats.treePineTallA, tints.treePineTallA));
  g.add(createKitPropInstances('treePineTallADetailed', mats.treePineTallADetailed, tints.treePineTallADetailed));
  return g;
}

// Endless: keep the far scenery (mountains, clouds, birds) at a fixed
// distance ahead as the player travels.
export function followBackdrop(b: Backdrop, playerZ: number) {
  b.group.position.z = playerZ;
}

// Every mode: keep the sky dome and ridges centred on the player, so
// their distance (and look) never changes during a stage.
export function updateBackdropFar(b: Backdrop, playerX: number, playerZ: number) {
  b.far.position.set(playerX, 0, playerZ - b.group.position.z);
}

export function setBackdropSnow(_b: Backdrop, _on: boolean) {
  // intentionally empty
}

// Animate clouds and birds. Both wrap around horizontally so the
// scene looks alive without ever depleting.
export function updateBackdrop(b: Backdrop, dt: number) {
  const span = b.bounds.right - b.bounds.left;

  for (const c of b.clouds) {
    c.mesh.position.x += CLOUD_DRIFT_SPEED * dt;
    if (c.mesh.position.x > b.bounds.right) {
      c.mesh.position.x -= span;
    }
  }

  for (const bird of b.birds) {
    bird.mesh.position.x += bird.vx * dt;
    bird.flapPhase += dt * 9;
    bird.mesh.position.y = bird.baseY + Math.sin(bird.flapPhase) * 0.35;
    bird.mesh.rotation.z = Math.sin(bird.flapPhase) * 0.18;
    if (bird.mesh.position.x > b.bounds.right) {
      bird.mesh.position.x -= span;
    }
  }
}
