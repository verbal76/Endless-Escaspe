import * as THREE from 'three';
import { CHUNK_LEN, CHUNKS_AHEAD, PLAY_HALF_W } from '../util/geometry';
import { markShared } from '../util/dispose';

// Scanning floodlight tower: vertical pole, head, downward translucent
// cone that rotates around the pole's vertical axis. The cone's
// footprint on the ground is what counts as "lit"; if the player is
// inside the footprint, they're considered illuminated and the game
// loop bumps detection on every guard.

const TOWER_HEIGHT = 4.5;
const POLE_RADIUS = 0.12;
const HEAD_RADIUS = 0.35;
// Bigger lit footprint + matching beam so the floodlight reads as
// an actual flashlight throw, not a small spotlight dot. The lit
// footprint and the visible beam share the same dimensions so the
// gameplay (player illuminated when inside the footprint) matches
// what they see on screen.
const BEAM_BASE_R = 4.0;
const BEAM_FOOTPRINT_OFFSET = 5.0;
export const LIGHT_FOOTPRINT_R = 4.0;
// Quarter-circle sector behind the current scan position showing
// recent sweep history - communicates "this tower scans this region".
const ARC_INNER_R = 0.5;
const ARC_OUTER_R = 7.5;
const ARC_SWEEP_RAD = Math.PI / 3; // 60 deg trailing arc

const POLE_MAT = new THREE.MeshStandardMaterial({ color: 0x4a4a52, roughness: 0.7 });
const HEAD_MAT = new THREE.MeshStandardMaterial({
  color: 0xffe7a3,
  emissive: 0xffce6a,
  emissiveIntensity: 0.6,
  roughness: 0.3,
});
const BEAM_MAT = new THREE.MeshBasicMaterial({
  color: 0xfff0a0,
  transparent: true,
  opacity: 0.18,
  side: THREE.DoubleSide,
  depthWrite: false,
});
const FOOT_MAT = new THREE.MeshBasicMaterial({
  color: 0xfff0a0,
  transparent: true,
  opacity: 0.22,
  side: THREE.DoubleSide,
  depthWrite: false,
});
const ARC_MAT = new THREE.MeshBasicMaterial({
  color: 0xfff0a0,
  transparent: true,
  opacity: 0.08,
  side: THREE.DoubleSide,
  depthWrite: false,
});

// Mark every module-level material as shared so the disposal pass
// on rebuild leaves them alone (each tower mesh holds its own
// per-instance geometry which DOES get disposed).
[POLE_MAT, HEAD_MAT, BEAM_MAT, FOOT_MAT, ARC_MAT].forEach((m) => markShared(m));

// State machine for tower lock-on behavior. Default is 'scan' (the
// classic sweep). When a tracking-capable tower catches the player
// in its beam it flips to 'track' and follows them; on losing them
// it holds 'search' on their last known position before returning
// to 'scan'. Non-tracking towers stay in 'scan' forever.
type TowerState = 'scan' | 'track' | 'search';

export type LightTower = {
  x: number;
  z: number;
  scanAngle: number;
  scanSpeed: number;
  pivot: THREE.Group;
  // True from stage 8+ (the caller controls this). When false the
  // tower never leaves 'scan' even if the player walks through its
  // beam.
  canTrack: boolean;
  state: TowerState;
  // How long the current state has been active, in seconds. Used to
  // age out search/track without stamping timestamps.
  stateTimer: number;
  // Last (x, z) the tower had the player illuminated. Used as the
  // search target after losing them.
  lastSeenX: number;
  lastSeenZ: number;
  // Searchlight one-shot: when true, the tower has held a lock for
  // the trigger duration and the caller should apply a one-time
  // detection jump, then call consumeSearchlightTrigger to clear.
  searchlightTrigger: boolean;
};

// How long a tower will hold search on the last-seen position before
// giving up and returning to its scan pattern.
const SEARCH_HOLD_S = 2.0;

function buildTower(
  x: number,
  z: number,
  scanSpeed: number,
  worldRoot: THREE.Group,
  canTrack: boolean,
): LightTower {
  const pole = new THREE.Mesh(
    new THREE.CylinderGeometry(POLE_RADIUS, POLE_RADIUS, TOWER_HEIGHT, 14),
    POLE_MAT,
  );
  pole.position.set(x, TOWER_HEIGHT / 2, z);
  worldRoot.add(pole);

  const head = new THREE.Mesh(
    new THREE.SphereGeometry(HEAD_RADIUS, 16, 12),
    HEAD_MAT,
  );
  head.position.set(x, TOWER_HEIGHT, z);
  worldRoot.add(head);

  // Pivot rotates around Y; beam + footprint live inside it so they
  // sweep around the pole as scanAngle changes.
  const pivot = new THREE.Group();
  pivot.position.set(x, 0, z);
  worldRoot.add(pivot);

  const beam = new THREE.Mesh(
    new THREE.ConeGeometry(BEAM_BASE_R, TOWER_HEIGHT, 16, 1, true),
    BEAM_MAT,
  );
  beam.position.set(0, TOWER_HEIGHT / 2, BEAM_FOOTPRINT_OFFSET / 2);
  beam.rotation.x = -Math.atan2(BEAM_FOOTPRINT_OFFSET, TOWER_HEIGHT);
  pivot.add(beam);

  const foot = new THREE.Mesh(
    new THREE.CircleGeometry(LIGHT_FOOTPRINT_R, 24),
    FOOT_MAT,
  );
  foot.rotation.x = -Math.PI / 2;
  foot.position.set(0, 0.04, BEAM_FOOTPRINT_OFFSET);
  pivot.add(foot);

  const arc = new THREE.Mesh(
    new THREE.RingGeometry(
      ARC_INNER_R,
      ARC_OUTER_R,
      32,
      1,
      -ARC_SWEEP_RAD,
      ARC_SWEEP_RAD,
    ),
    ARC_MAT,
  );
  arc.rotation.x = -Math.PI / 2;
  arc.position.set(0, 0.03, 0);
  pivot.add(arc);

  return {
    x,
    z,
    scanAngle: 0,
    scanSpeed,
    pivot,
    canTrack,
    state: 'scan',
    stateTimer: 0,
    lastSeenX: x,
    lastSeenZ: z + BEAM_FOOTPRINT_OFFSET,
    searchlightTrigger: false,
  };
}

// Once a tracking tower has held the player in its beam for this
// many seconds it sets searchlightTrigger; the caller applies a
// one-time detection bump and clears the flag. Models the
// "freeze + flag the player" behaviour without needing a separate
// entity type.
const SEARCHLIGHT_LOCK_S = 2.0;

// Configurable per-stage layout. `rows` rows of paired towers along
// the segment, alternating scan directions so they don't all sweep
// in unison. `scanSpeedMul` scales the base sweep rate (faster late
// stages). `canTrack` enables lock-on behaviour from stage 8+.
//
// `segLen` is passed in because segment length is itself stage-
// driven now; the towers must space themselves along the actual
// segment, not the constant baseline.
export function spawnLightTowers(
  worldRoot: THREE.Group,
  segLen: number,
  rows: number,
  scanSpeedMul: number,
  canTrack: boolean,
): LightTower[] {
  const towerX = PLAY_HALF_W + 0.6;
  const towers: LightTower[] = [];
  for (let i = 0; i < rows; i++) {
    // Even spacing along the segment, biased away from the spawn
    // line and the win line so the player has breathing room at the
    // ends of the run.
    const t = (i + 0.5) / rows;
    const rz = segLen * (0.10 + 0.80 * t);
    const dir = i % 2 === 0 ? 1 : -1;
    towers.push(buildTower(-towerX, rz, 0.55 * scanSpeedMul * dir, worldRoot, canTrack));
    towers.push(buildTower(towerX, rz, -0.55 * scanSpeedMul * dir, worldRoot, canTrack));
  }
  return towers;
}

// Update one tower in place. The state machine drives the pivot's
// y-rotation: 'scan' rolls scanAngle forward by scanSpeed; 'track'
// snaps the angle to point at (px, pz); 'search' holds the angle
// from when we lost the player until SEARCH_HOLD_S elapses.
export function updateLightTower(t: LightTower, dt: number, px: number, pz: number) {
  t.stateTimer += dt;

  // First, decide whether the player is currently inside the beam
  // footprint at the *current* scanAngle. Only tracking-capable
  // towers transition to 'track' on entry.
  const lit = isPlayerLit(t, px, pz);

  if (t.canTrack) {
    if (lit && t.state !== 'track') {
      t.state = 'track';
      t.stateTimer = 0;
    } else if (!lit && t.state === 'track') {
      // Player just slipped out: hold the last known footprint
      // centre as the search target.
      t.state = 'search';
      t.stateTimer = 0;
      t.lastSeenX = px;
      t.lastSeenZ = pz;
      // Re-arm the searchlight bump for the next acquisition.
      t.searchlightTrigger = false;
    } else if (t.state === 'search' && t.stateTimer >= SEARCH_HOLD_S) {
      // Search elapsed without re-acquiring; resume the scan
      // pattern from the current angle.
      t.state = 'scan';
      t.stateTimer = 0;
    } else if (t.state === 'search' && lit) {
      t.state = 'track';
      t.stateTimer = 0;
    }
  }

  switch (t.state) {
    case 'track': {
      // Aim the pivot's local +Z axis at the player. We compute the
      // angle whose forward (sin, cos) hits (dx, dz).
      const dx = px - t.x;
      const dz = pz - t.z;
      t.scanAngle = Math.atan2(dx, dz);
      t.lastSeenX = px;
      t.lastSeenZ = pz;
      // After a sustained lock, raise the searchlight flag exactly
      // once per acquisition. Resets when the state leaves 'track'.
      if (!t.searchlightTrigger && t.stateTimer >= SEARCHLIGHT_LOCK_S) {
        t.searchlightTrigger = true;
      }
      break;
    }
    case 'search': {
      const dx = t.lastSeenX - t.x;
      const dz = t.lastSeenZ - t.z;
      t.scanAngle = Math.atan2(dx, dz);
      break;
    }
    case 'scan':
    default: {
      t.scanAngle += t.scanSpeed * dt;
      break;
    }
  }
  t.pivot.rotation.y = t.scanAngle;
}

// Read-and-clear: true the first time after a sustained lock; false
// thereafter until the tower drops the player and re-acquires.
export function consumeSearchlightTrigger(t: LightTower): boolean {
  if (t.searchlightTrigger) {
    t.searchlightTrigger = false;
    return true;
  }
  return false;
}

// True if the player is within the lit footprint of this tower.
export function isPlayerLit(t: LightTower, px: number, pz: number): boolean {
  // Pivot's local +Z rotated by scanAngle around Y in world frame:
  // world.x_offset =  sin(scanAngle) * BEAM_FOOTPRINT_OFFSET
  // world.z_offset =  cos(scanAngle) * BEAM_FOOTPRINT_OFFSET
  const fx = t.x + Math.sin(t.scanAngle) * BEAM_FOOTPRINT_OFFSET;
  const fz = t.z + Math.cos(t.scanAngle) * BEAM_FOOTPRINT_OFFSET;
  const dx = px - fx;
  const dz = pz - fz;
  return dx * dx + dz * dz <= LIGHT_FOOTPRINT_R * LIGHT_FOOTPRINT_R;
}
