import * as THREE from 'three';
import { CHUNK_LEN, CHUNKS_AHEAD, PLAY_HALF_W } from '../util/geometry';

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

const LIGHTNING_MAT = new THREE.MeshBasicMaterial({
  color: 0xffffff,
  transparent: true,
  opacity: 0,
  side: THREE.DoubleSide,
  fog: false,
});

type Particle = {
  x: number;
  y: number;
  z: number;
  driftSeed: number;
};

export type Weather = {
  kind: WeatherKind;
  group: THREE.Group;
  particles: Particle[];
  // Per-particle visual handle. For rain we use Line segments
  // (a single Geometry shared by all rain Lines for performance);
  // for snow we use Mesh instances of the small sphere geo.
  visuals: THREE.Object3D[];
  lightning: THREE.Mesh | null;
  lightningTimer: number;
  lightningFlash: number; // 0..1, fades out after a strike
};

export function pickWeather(seed: number): WeatherKind {
  // Seeded coin so the choice is reproducible per segment.
  const r = ((Math.sin(seed * 9999.7) * 43758.5453) % 1 + 1) % 1;
  if (r < 0.55) return 'clear';
  if (r < 0.78) return 'rain';
  return 'snow';
}

function buildRainLine(): THREE.Line {
  const verts = new Float32Array([0, 0, 0, 0, -0.45, 0]);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(verts, 3));
  return new THREE.Line(geo, RAIN_MAT);
}

function buildLightningMesh(): THREE.Mesh {
  // Tall thin plane in the midground used as a flash source.
  const geo = new THREE.PlaneGeometry(180, 80);
  const m = new THREE.Mesh(geo, LIGHTNING_MAT);
  m.position.set(0, 40, CHUNK_LEN * CHUNKS_AHEAD * 0.55);
  return m;
}

function spawnParticle(centerX: number, centerZ: number): Particle {
  const angle = Math.random() * Math.PI * 2;
  const r = Math.random() * COLUMN_RADIUS;
  return {
    x: centerX + Math.cos(angle) * r,
    z: centerZ + Math.sin(angle) * r,
    y: SPAWN_HEIGHT_MIN + Math.random() * (SPAWN_HEIGHT_MAX - SPAWN_HEIGHT_MIN),
    driftSeed: Math.random() * Math.PI * 2,
  };
}

export function createWeather(kind: WeatherKind, centerX: number, centerZ: number): Weather {
  const group = new THREE.Group();
  const particles: Particle[] = [];
  const visuals: THREE.Object3D[] = [];

  if (kind !== 'clear') {
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const p = spawnParticle(centerX, centerZ);
      particles.push(p);
      const visual =
        kind === 'rain' ? buildRainLine() : new THREE.Mesh(SNOW_GEO, SNOW_MAT);
      visual.position.set(p.x, p.y, p.z);
      group.add(visual);
      visuals.push(visual);
    }
  }

  const lightning = kind === 'rain' ? buildLightningMesh() : null;
  if (lightning) group.add(lightning);

  return {
    kind,
    group,
    particles,
    visuals,
    lightning,
    lightningTimer: kind === 'rain' ? 4 + Math.random() * 6 : 0,
    lightningFlash: 0,
  };
}

// Integrate particles + lightning. Keeps the falling column anchored
// to (centerX, centerZ) so it follows the player.
export function updateWeather(w: Weather, dt: number, centerX: number, centerZ: number) {
  if (w.kind === 'clear') return;

  const fallSpeed = w.kind === 'rain' ? RAIN_FALL_SPEED : SNOW_FALL_SPEED;
  for (let i = 0; i < w.particles.length; i++) {
    const p = w.particles[i];
    p.y -= fallSpeed * dt;
    if (w.kind === 'snow') {
      p.driftSeed += dt * 1.4;
      const sway = Math.sin(p.driftSeed) * SNOW_DRIFT_AMP * dt;
      p.x += sway;
    }

    // Out-of-column or hit ground: respawn somewhere fresh in the
    // column above the player.
    const dx = p.x - centerX;
    const dz = p.z - centerZ;
    const outOfColumn = dx * dx + dz * dz > COLUMN_RADIUS * COLUMN_RADIUS * 1.3;
    if (p.y < 0 || outOfColumn) {
      const fresh = spawnParticle(centerX, centerZ);
      p.x = fresh.x;
      p.y = fresh.y;
      p.z = fresh.z;
      p.driftSeed = fresh.driftSeed;
    }

    const v = w.visuals[i];
    v.position.set(p.x, p.y, p.z);
  }

  // Lightning during rain: random strikes every few seconds, with a
  // brief flash that fades over half a second.
  if (w.lightning) {
    w.lightningTimer -= dt;
    if (w.lightningTimer <= 0) {
      w.lightningFlash = 1;
      w.lightningTimer = 5 + Math.random() * 8;
      // Re-position the flash so it appears in different spots in
      // the midground.
      w.lightning.position.x = (Math.random() - 0.5) * 200;
      w.lightning.position.z = CHUNK_LEN * CHUNKS_AHEAD * (0.3 + Math.random() * 0.5);
    }
    if (w.lightningFlash > 0) {
      w.lightningFlash = Math.max(0, w.lightningFlash - dt * 2);
    }
    LIGHTNING_MAT.opacity = w.lightningFlash * 0.7;
  }
}

// Modifier multipliers used by DetectionSystem. Snow boosts vision
// (player more visible against bright background); rain dampens
// noise (footfalls masked by the storm).
export function visionMultiplier(kind: WeatherKind): number {
  return kind === 'snow' ? 1.10 : 1.0;
}
export function noiseMultiplier(kind: WeatherKind): number {
  return kind === 'rain' ? 0.5 : 1.0;
}
