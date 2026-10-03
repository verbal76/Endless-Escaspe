import * as THREE from 'three';
import { markShared } from '../util/dispose';

// A smoke-bomb cloud: an expanding, fading translucent puff that
// blocks guard vision while it's alive. The DetectionSystem treats
// any guard standing inside `radius` of the cloud's center as having
// no line of sight to the player while the cloud is alive.
//
// The visual is two stacked sphere shells (light core + darker rim)
// scaled up over the first ~25% of life and faded out across the
// remainder. No particle systems - we want this to render cheap on
// mid-tier phones.

export const SMOKE_LIFETIME = 5.0;     // seconds the cloud is active
export const SMOKE_RADIUS = 3.5;       // metres of vision blocking
const SMOKE_BUILD_FRACTION = 0.25;     // first 25% of life ramping up

export type SmokeCloud = {
  x: number;
  z: number;
  radius: number;
  age: number;
  lifetime: number;
  group: THREE.Group;
  core: THREE.Mesh;
  rim: THREE.Mesh;
};

const CORE_GEO = markShared(new THREE.SphereGeometry(1, 14, 10));
const RIM_GEO = markShared(new THREE.SphereGeometry(1.05, 14, 10));

function newCoreMaterial(): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    color: 0xb6bcc6,
    transparent: true,
    opacity: 0.55,
    depthWrite: false,
  });
}

function newRimMaterial(): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    color: 0x6f7682,
    transparent: true,
    opacity: 0.35,
    depthWrite: false,
  });
}

// Recycled clouds: a finished cloud's meshes and materials go back to
// this pool and are reused by the next throw (no per-throw material
// allocation).
const POOL: SmokeCloud[] = [];

export function createSmokeCloud(x: number, z: number): SmokeCloud {
  const reused = POOL.pop();
  if (reused) {
    reused.x = x;
    reused.z = z;
    reused.age = 0;
    reused.group.position.set(x, SMOKE_RADIUS * 0.55, z);
    reused.core.scale.setScalar(0.001);
    reused.rim.scale.setScalar(0.001);
    return reused;
  }
  const group = new THREE.Group();
  group.position.set(x, SMOKE_RADIUS * 0.55, z);

  const core = new THREE.Mesh(CORE_GEO, newCoreMaterial());
  // Start small; the update() ramps the cloud up to full size in
  // the first 25% of its lifetime.
  core.scale.setScalar(0.001);
  group.add(core);

  const rim = new THREE.Mesh(RIM_GEO, newRimMaterial());
  rim.scale.setScalar(0.001);
  group.add(rim);

  return {
    x,
    z,
    radius: SMOKE_RADIUS,
    age: 0,
    lifetime: SMOKE_LIFETIME,
    group,
    core,
    rim,
  };
}

// Advance the cloud. Returns true while still alive; false once the
// lifetime has elapsed and the caller should despawn it.
export function updateSmokeCloud(c: SmokeCloud, dt: number): boolean {
  c.age += dt;
  const t = c.age / c.lifetime;
  if (t >= 1) return false;
  // Ramp scale during the build phase, then hold full size.
  const buildT = Math.min(1, c.age / (c.lifetime * SMOKE_BUILD_FRACTION));
  const scale = c.radius * (0.4 + 0.6 * buildT);
  c.core.scale.setScalar(scale);
  c.rim.scale.setScalar(scale * 1.1);
  // Gentle fade across the second half of life. Cap to avoid going
  // fully transparent before the gameplay effect ends - we want the
  // visual cue to clearly cover the active duration.
  const fade = t < 0.5 ? 1 : 1 - (t - 0.5) * 1.6;
  const fadeC = Math.max(0.05, fade);
  (c.core.material as THREE.MeshBasicMaterial).opacity = 0.55 * fadeC;
  (c.rim.material as THREE.MeshBasicMaterial).opacity = 0.35 * fadeC;
  return true;
}

// Return a finished cloud to the pool (caller has already detached
// its group from the scene).
export function disposeSmokeCloud(c: SmokeCloud) {
  if (POOL.length < 6 && !POOL.includes(c)) POOL.push(c);
}
