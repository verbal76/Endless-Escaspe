import * as THREE from 'three';
import { CHUNK_LEN, CHUNKS_AHEAD, PLAY_HALF_W } from '../util/geometry';
import { buildTreeGroup } from './Obstacles';

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
const TREE_COUNT_PER_SIDE = 28;

// Sky props
const CLOUD_COUNT = 6;
const CLOUD_Y = 36;
const CLOUD_DRIFT_SPEED = 0.6; // m/s; very slow drift

const BIRD_COUNT = 7;
const BIRD_Y = 22;
const BIRD_SPEED_MIN = 5;
const BIRD_SPEED_MAX = 9;

// Materials are shared so we make one of each.
const MOUNTAIN_BASE_MAT = new THREE.MeshStandardMaterial({
  color: 0x2c3a4f,
  roughness: 1,
  flatShading: true,
});
const MOUNTAIN_SNOW_MAT = new THREE.MeshStandardMaterial({
  color: 0xeef3fb,
  roughness: 1,
  flatShading: true,
});
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

function buildTreeMesh(rng: () => number): { group: THREE.Group } {
  // Backdrop trees outside the fence share the same buildTreeGroup
  // helper as the procgen-spawned trees - the alpha-cut Kenney pine
  // billboard plus a procedural trunk cylinder so the tree reads as
  // a tree (not floating foliage). Larger uniform scale + taller
  // trunk than the procgen variants so the row reads at distance
  // against the 70-160 m mountain range.
  const variant: 'treeA' | 'treeB' = rng() < 0.5 ? 'treeB' : 'treeA';
  const treeScale = new THREE.Vector3(4.5, 9.0, 4.5);
  const group = buildTreeGroup(variant, treeScale, 1.8);
  return { group };
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
  for (let i = 0; i < TREE_COUNT_PER_SIDE; i++) {
    const z = (i / (TREE_COUNT_PER_SIDE - 1)) * (segLen + 40) + (rng() - 0.5) * 4;
    for (const sign of [-1, 1]) {
      const xJitter = rng() * (TREE_LINE_FAR - TREE_LINE_OUTER);
      const built = buildTreeMesh(rng);
      built.group.position.set(sign * (TREE_LINE_OUTER + xJitter), 0, z);
      built.group.scale.multiplyScalar(0.85 + rng() * 0.5);
      built.group.rotation.y = rng() * Math.PI * 2;
      root.add(built.group);
    }
  }

  // Clouds drifting from -X to +X.
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
