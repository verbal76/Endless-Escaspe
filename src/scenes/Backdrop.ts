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

// Mountains live behind the property-line fence. Far enough that they
// barely shift on screen during play.
const MOUNTAIN_Z = segLen + 600;
const MOUNTAIN_SPAN_X = 900;
const MOUNTAIN_COUNT = 14;

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

// Materials are shared so we make one of each.
const MOUNTAIN_BASE_MAT = new THREE.MeshLambertMaterial({
  color: 0x2c3a4f,
  flatShading: true,
});
const MOUNTAIN_SNOW_MAT = new THREE.MeshLambertMaterial({
  color: 0xeef3fb,
  flatShading: true,
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

function buildMountainMesh(rng: () => number): THREE.Group {
  // Triangle peak made from a custom BufferGeometry: base at y=0
  // from -halfW to +halfW, apex at the chosen height.
  const halfW = 30 + rng() * 50;
  const height = 70 + rng() * 90;
  const baseDepth = 26;
  const verts = new Float32Array([
    -halfW, 0, -baseDepth,
    halfW, 0, -baseDepth,
    -halfW, 0, baseDepth,

    halfW, 0, -baseDepth,
    halfW, 0, baseDepth,
    -halfW, 0, baseDepth,

    -halfW, 0, baseDepth,
    halfW, 0, baseDepth,
    0, height, 0,

    halfW, 0, baseDepth,
    halfW, 0, -baseDepth,
    0, height, 0,

    halfW, 0, -baseDepth,
    -halfW, 0, -baseDepth,
    0, height, 0,

    -halfW, 0, -baseDepth,
    -halfW, 0, baseDepth,
    0, height, 0,
  ]);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(verts, 3));
  geo.computeVertexNormals();
  const base = new THREE.Mesh(geo, MOUNTAIN_BASE_MAT);

  // Snow cap: a smaller pyramid sitting on top of the base, positioned
  // to align with the apex. Built the same way at smaller dimensions.
  const snowH = height * 0.32;
  const snowBaseY = height - snowH;
  const snowHalfW = halfW * 0.28;
  const snowDepth = baseDepth * 0.28;
  const snowVerts = new Float32Array([
    -snowHalfW, snowBaseY, -snowDepth,
    snowHalfW, snowBaseY, -snowDepth,
    0, height, 0,

    snowHalfW, snowBaseY, -snowDepth,
    snowHalfW, snowBaseY, snowDepth,
    0, height, 0,

    snowHalfW, snowBaseY, snowDepth,
    -snowHalfW, snowBaseY, snowDepth,
    0, height, 0,

    -snowHalfW, snowBaseY, snowDepth,
    -snowHalfW, snowBaseY, -snowDepth,
    0, height, 0,
  ]);
  const snowGeo = new THREE.BufferGeometry();
  snowGeo.setAttribute('position', new THREE.BufferAttribute(snowVerts, 3));
  snowGeo.computeVertexNormals();
  const snow = new THREE.Mesh(snowGeo, MOUNTAIN_SNOW_MAT);

  const group = new THREE.Group();
  group.add(base);
  group.add(snow);
  return group;
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
  birds: Bird[];
  clouds: Cloud[];
  bounds: { left: number; right: number };
};

const BACKDROP_BOUNDS = { left: -120, right: 120 };

export function createBackdrop(): Backdrop {
  const root = new THREE.Group();
  const rng = mulberry(0x9e3779b9);

  // Mountains: spaced across the back, jittered slightly in z and y
  // so the silhouette has variety.
  for (let i = 0; i < MOUNTAIN_COUNT; i++) {
    const t = i / (MOUNTAIN_COUNT - 1);
    const x = -MOUNTAIN_SPAN_X / 2 + t * MOUNTAIN_SPAN_X + (rng() - 0.5) * 60;
    const zJitter = (rng() - 0.5) * 80;
    const m = buildMountainMesh(rng);
    m.position.set(x, 0, MOUNTAIN_Z + zJitter);
    m.rotation.y = (rng() - 0.5) * 0.3;
    root.add(m);
  }

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

  return { group: root, birds, clouds, bounds: BACKDROP_BOUNDS };
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
export function applyBackdropMood(_b: Backdrop, light: StageLighting) {
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
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const pos = new THREE.Vector3();
  const scl = new THREE.Vector3();
  for (let i = 0; i < count; i++) {
    const z = zStart + (i / (count - 1)) * length + (rng() - 0.5) * 4;
    for (const sign of [-1, 1]) {
      const xJitter = rng() * (TREE_LINE_FAR - TREE_LINE_OUTER);
      const variant = rng() < 0.5 ? 'treePineTallA' : 'treePineTallADetailed';
      const sc = 3.5 * (0.85 + rng() * 0.5);
      pos.set(sign * (TREE_LINE_OUTER + xJitter), 0, z);
      q.setFromAxisAngle(up, rng() * Math.PI * 2);
      scl.set(sc, sc, sc);
      mats[variant].push(new THREE.Matrix4().compose(pos, q, scl));
    }
  }
  const g = new THREE.Group();
  g.add(createKitPropInstances('treePineTallA', mats.treePineTallA));
  g.add(createKitPropInstances('treePineTallADetailed', mats.treePineTallADetailed));
  return g;
}

// Endless: keep the far scenery (mountains, clouds, birds) at a fixed
// distance ahead as the player travels.
export function followBackdrop(b: Backdrop, playerZ: number) {
  b.group.position.z = playerZ;
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
