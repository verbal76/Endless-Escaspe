import * as THREE from 'three';
import { CHUNK_LEN, CHUNKS_AHEAD, PLAY_HALF_W } from '../util/geometry';
import { markShared } from '../util/dispose';

// Weather: rain or snow or clear. Rolled at the start of each
// segment via pickWeather(). Visualised as a column of falling
// particles centred on the player; particles wrap when they hit the
// ground so the column stays full forever.
//
// Gameplay modifiers (applied in DetectionSystem):
//   snow  -> +10% to vision range (player more visible against white)
//           ground tinted brighter
//   rain  -> player noise scaled by 0.5 (rain masks footsteps)
//           periodic lightning flash brightens the ambient
//   clear -> baseline behaviour

export type WeatherKind = 'clear' | 'rain' | 'snow';

const PARTICLE_COUNT = 280;
const COLUMN_RADIUS = 22;
const SPAWN_HEIGHT_MIN = 8;
const SPAWN_HEIGHT_MAX = 22;
const RAIN_FALL_SPEED = 24;
const SNOW_FALL_SPEED = 4.5;
const SNOW_DRIFT_AMP = 0.6; // horizontal sway

const RAIN_MAT = new THREE.LineBasicMaterial({
  color: 0xa8c4d8,
  transparent: true,
  opacity: 0.55,
});
const SNOW_MAT = new THREE.MeshBasicMaterial({
  color: 0xffffff,
  transparent: true,
  opacity: 0.85,
});
const SNOW_GEO = new THREE.SphereGeometry(0.05, 4, 3);
// The weather column follows the player; its lightning plane is
// re-positioned on each strike.

const LIGHTNING_MAT = new THREE.MeshBasicMaterial({
  color: 0xffffff,
  transparent: true,
  opacity: 0,
  side: THREE.DoubleSide,
  fog: false,
});

[RAIN_MAT, SNOW_MAT, LIGHTNING_MAT].forEach((m) => markShared(m));
markShared(SNOW_GEO);

type Particle = {
  x: number;
  y: number;
  z: number;
  driftSeed: number;
};

// All precipitation is drawn in ONE draw call: rain as a single
// LineSegments whose vertex buffer is rewritten each frame, snow as a
// single InstancedMesh. (Previously every drop was its own Line /
// Mesh with its own BufferGeometry: ~280 draw calls.)
export type Weather = {
  kind: WeatherKind;
  group: THREE.Group;
  particles: Particle[];
  rain: THREE.LineSegments | null;
  snow: THREE.InstancedMesh | null;
  lightning: THREE.Mesh | null;
  lightningTimer: number;
  lightningFlash: number; // 0..1, fades out after a strike
};

export function pickWeather(seed: number): WeatherKind {
  const r = ((Math.sin(seed * 9999.7) * 43758.5453) % 1 + 1) % 1;
  if (r < 0.55) return 'clear';
  if (r < 0.78) return 'rain';
  return 'snow';
}

const RAIN_STREAK = 0.45;

function buildLightningMesh(): THREE.Mesh {
  const geo = new THREE.PlaneGeometry(180, 80);
  const m = new THREE.Mesh(geo, LIGHTNING_MAT);
  m.position.set(0, 40, CHUNK_LEN * CHUNKS_AHEAD * 0.55);
  return m;
}

// Re-seed a particle in place (no allocation).
function respawn(p: Particle, centerX: number, centerZ: number) {
  const angle = Math.random() * Math.PI * 2;
  const r = Math.random() * COLUMN_RADIUS;
  p.x = centerX + Math.cos(angle) * r;
  p.z = centerZ + Math.sin(angle) * r;
  p.y = SPAWN_HEIGHT_MIN + Math.random() * (SPAWN_HEIGHT_MAX - SPAWN_HEIGHT_MIN);
  p.driftSeed = Math.random() * Math.PI * 2;
}

export function createWeather(kind: WeatherKind, centerX: number, centerZ: number): Weather {
  const group = new THREE.Group();
  const particles: Particle[] = [];
  let rain: THREE.LineSegments | null = null;
  let snow: THREE.InstancedMesh | null = null;

  if (kind !== 'clear') {
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const p = { x: 0, y: 0, z: 0, driftSeed: 0 };
      respawn(p, centerX, centerZ);
      particles.push(p);
    }
    if (kind === 'rain') {
      const geo = new THREE.BufferGeometry();
      const pos = new Float32Array(PARTICLE_COUNT * 6);
      const attr = new THREE.BufferAttribute(pos, 3);
      attr.setUsage(THREE.DynamicDrawUsage);
      geo.setAttribute('position', attr);
      rain = new THREE.LineSegments(geo, RAIN_MAT);
      // The column follows the player; skip culling rather than
      // recomputing bounds every frame.
      rain.frustumCulled = false;
      group.add(rain);
    } else {
      snow = new THREE.InstancedMesh(SNOW_GEO, SNOW_MAT, PARTICLE_COUNT);
      snow.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      snow.frustumCulled = false;
      group.add(snow);
    }
  }

  const lightning = kind === 'rain' ? buildLightningMesh() : null;
  if (lightning) group.add(lightning);

  const w: Weather = {
    kind,
    group,
    particles,
    rain,
    snow,
    lightning,
    lightningTimer: kind === 'rain' ? 4 + Math.random() * 6 : 0,
    lightningFlash: 0,
  };
  writeBuffers(w);
  return w;
}

const tmpM = new THREE.Matrix4();

function writeBuffers(w: Weather) {
  if (w.rain) {
    const attr = w.rain.geometry.attributes.position as THREE.BufferAttribute;
    const a = attr.array as Float32Array;
    for (let i = 0; i < w.particles.length; i++) {
      const p = w.particles[i];
      const o = i * 6;
      a[o] = p.x;
      a[o + 1] = p.y;
      a[o + 2] = p.z;
      a[o + 3] = p.x;
      a[o + 4] = p.y - RAIN_STREAK;
      a[o + 5] = p.z;
    }
    attr.needsUpdate = true;
  } else if (w.snow) {
    for (let i = 0; i < w.particles.length; i++) {
      const p = w.particles[i];
      tmpM.makeTranslation(p.x, p.y, p.z);
      w.snow.setMatrixAt(i, tmpM);
    }
    w.snow.instanceMatrix.needsUpdate = true;
  }
}

export function updateWeather(w: Weather, dt: number, centerX: number, centerZ: number) {
  if (w.kind === 'clear') return;

  const fallSpeed = w.kind === 'rain' ? RAIN_FALL_SPEED : SNOW_FALL_SPEED;
  for (let i = 0; i < w.particles.length; i++) {
    const p = w.particles[i];
    p.y -= fallSpeed * dt;
    if (w.kind === 'snow') {
      p.driftSeed += dt * 1.4;
      p.x += Math.sin(p.driftSeed) * SNOW_DRIFT_AMP * dt;
    }
    const dx = p.x - centerX;
    const dz = p.z - centerZ;
    const outOfColumn = dx * dx + dz * dz > COLUMN_RADIUS * COLUMN_RADIUS * 1.3;
    if (p.y < 0 || outOfColumn) respawn(p, centerX, centerZ);
  }
  writeBuffers(w);

  if (w.lightning) {
    w.lightningTimer -= dt;
    if (w.lightningTimer <= 0) {
      w.lightningFlash = 1;
      w.lightningTimer = 5 + Math.random() * 8;
      w.lightning.position.x = (Math.random() - 0.5) * 200;
      // Strike somewhere ahead of the player (works for Endless too).
      w.lightning.position.z = centerZ + 40 + Math.random() * 90;
    }
    if (w.lightningFlash > 0) {
      w.lightningFlash = Math.max(0, w.lightningFlash - dt * 2);
    }
    LIGHTNING_MAT.opacity = w.lightningFlash * 0.7;
  }
}

export function visionMultiplier(kind: WeatherKind): number {
  return kind === 'snow' ? 1.10 : 1.0;
}
export function noiseMultiplier(kind: WeatherKind): number {
  return kind === 'rain' ? 0.5 : 1.0;
}
