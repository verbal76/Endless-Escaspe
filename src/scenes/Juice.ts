import * as THREE from 'three';
import { markShared } from '../util/dispose';

// Small pooled world effects: running dust and pickup sparkle bursts.
// Everything is allocated once and recycled.

let PUFF_TEX: THREE.DataTexture | null = null;
function puffTexture(): THREE.DataTexture {
  if (PUFF_TEX) return PUFF_TEX;
  const n = 32;
  const data = new Uint8Array(n * n * 4);
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const dx = (x + 0.5) / n - 0.5;
      const dy = (y + 0.5) / n - 0.5;
      const d = Math.min(1, Math.sqrt(dx * dx + dy * dy) * 2);
      const i = (y * n + x) * 4;
      data[i] = 255;
      data[i + 1] = 255;
      data[i + 2] = 255;
      data[i + 3] = Math.round(Math.pow(1 - d, 1.4) * 255);
    }
  }
  const tex = new THREE.DataTexture(data, n, n, THREE.RGBAFormat);
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  PUFF_TEX = markShared(tex);
  return tex;
}

const PUFF_GEO = markShared(new THREE.PlaneGeometry(1, 1));

type Puff = { sprite: THREE.Mesh; mat: THREE.MeshBasicMaterial; age: number; life: number; vx: number; vz: number; active: boolean };

export type DustField = { puffs: Puff[]; next: number; sinceSpawn: number; root: THREE.Group };

const DUST_COUNT = 14;
const DUST_INTERVAL = 0.11;

export function createDustField(): DustField {
  const root = new THREE.Group();
  const puffs: Puff[] = [];
  for (let i = 0; i < DUST_COUNT; i++) {
    const mat = new THREE.MeshBasicMaterial({
      map: puffTexture(),
      color: 0xcbbfa6,
      transparent: true,
      opacity: 0,
      depthWrite: false,
    });
    const sprite = new THREE.Mesh(PUFF_GEO, mat);
    sprite.visible = false;
    root.add(sprite);
    puffs.push({ sprite, mat, age: 0, life: 0.55, vx: 0, vz: 0, active: false });
  }
  return { puffs, next: 0, sinceSpawn: 0, root };
}

// Call every frame. Spawns kicked-up dust behind the player's feet
// while running (not on snow, where footprints do that job).
export function updateDustField(
  f: DustField,
  dt: number,
  running: boolean,
  px: number,
  pz: number,
  vx: number,
  vz: number,
  camera: THREE.Camera,
  tint: number,
) {
  f.sinceSpawn += dt;
  if (running && f.sinceSpawn >= DUST_INTERVAL) {
    f.sinceSpawn = 0;
    const p = f.puffs[f.next];
    f.next = (f.next + 1) % f.puffs.length;
    const speed = Math.hypot(vx, vz) || 1;
    p.active = true;
    p.age = 0;
    p.vx = (-vx / speed) * 0.6 + (Math.random() - 0.5) * 0.5;
    p.vz = (-vz / speed) * 0.6 + (Math.random() - 0.5) * 0.5;
    p.sprite.position.set(px + (Math.random() - 0.5) * 0.3, 0.15, pz + (Math.random() - 0.5) * 0.3);
    p.mat.color.setHex(tint);
    p.sprite.visible = true;
  }
  for (const p of f.puffs) {
    if (!p.active) continue;
    p.age += dt;
    const t = p.age / p.life;
    if (t >= 1) {
      p.active = false;
      p.sprite.visible = false;
      continue;
    }
    p.sprite.position.x += p.vx * dt;
    p.sprite.position.z += p.vz * dt;
    p.sprite.position.y += 0.5 * dt;
    const s = 0.35 + 0.6 * t;
    p.sprite.scale.set(s, s, s);
    p.sprite.quaternion.copy(camera.quaternion);
    p.mat.opacity = 0.45 * (1 - t);
  }
}

export function clearDustField(f: DustField) {
  for (const p of f.puffs) {
    p.active = false;
    p.sprite.visible = false;
  }
}

// Pickup sparkle: an expanding gold ring plus a few rising glints.
const RING_GEO = markShared(new THREE.RingGeometry(0.75, 0.95, 32));
RING_GEO.rotateX(-Math.PI / 2);
const GLINT_GEO = markShared(new THREE.OctahedronGeometry(0.09, 0));
const GLINTS = 6;

type Burst = {
  root: THREE.Group;
  ring: THREE.Mesh;
  ringMat: THREE.MeshBasicMaterial;
  glints: THREE.Mesh[];
  glintMat: THREE.MeshBasicMaterial;
  age: number;
  active: boolean;
};

export type BurstPool = { bursts: Burst[]; next: number; root: THREE.Group };

const BURST_LIFE = 0.5;

export function createBurstPool(size: number = 4): BurstPool {
  const root = new THREE.Group();
  const bursts: Burst[] = [];
  for (let i = 0; i < size; i++) {
    const g = new THREE.Group();
    g.visible = false;
    const ringMat = new THREE.MeshBasicMaterial({ color: 0xffd14a, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide });
    const ring = new THREE.Mesh(RING_GEO, ringMat);
    g.add(ring);
    const glintMat = new THREE.MeshBasicMaterial({ color: 0xfff2b0, transparent: true, opacity: 0, depthWrite: false });
    const glints: THREE.Mesh[] = [];
    for (let k = 0; k < GLINTS; k++) {
      const m = new THREE.Mesh(GLINT_GEO, glintMat);
      g.add(m);
      glints.push(m);
    }
    root.add(g);
    bursts.push({ root: g, ring, ringMat, glints, glintMat, age: 0, active: false });
  }
  return { bursts, next: 0, root };
}

export function spawnBurst(pool: BurstPool, x: number, z: number) {
  const b = pool.bursts[pool.next];
  pool.next = (pool.next + 1) % pool.bursts.length;
  b.active = true;
  b.age = 0;
  b.root.visible = true;
  b.root.position.set(x, 0.06, z);
}

export function updateBursts(pool: BurstPool, dt: number) {
  for (const b of pool.bursts) {
    if (!b.active) continue;
    b.age += dt;
    const t = b.age / BURST_LIFE;
    if (t >= 1) {
      b.active = false;
      b.root.visible = false;
      continue;
    }
    const ease = 1 - (1 - t) * (1 - t);
    const s = 0.4 + 1.1 * ease;
    b.ring.scale.set(s, 1, s);
    b.ringMat.opacity = 0.85 * (1 - t);
    for (let k = 0; k < b.glints.length; k++) {
      const a = (k / b.glints.length) * Math.PI * 2;
      const r = 0.3 + 0.7 * ease;
      b.glints[k].position.set(Math.cos(a) * r, 0.2 + 1.2 * ease, Math.sin(a) * r);
      b.glints[k].rotation.y = b.age * 8;
    }
    b.glintMat.opacity = 1 - t;
  }
}
