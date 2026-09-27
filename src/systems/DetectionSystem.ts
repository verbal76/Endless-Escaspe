import type { Guard, Obstacle, Player } from '../types/world';
import { clamp, dist2Sq } from '../util/math';
import { clearLine } from '../util/collision';
import { VISION_CONE_DEG } from '../util/geometry';

const VISION_HALF = (VISION_CONE_DEG * Math.PI) / 180 / 2;

// Minimum obstacle height that breaks a guard's sight line, per
// stance. Crouched players are hidden by hip-height props (low walls
// included); standing players need torso-height cover.
export const COVER_HEIGHT_CROUCHED = 0.3;
export const COVER_HEIGHT_STANDING = 1.0;

// Non-visual sources (noise, dog smell, floodlights) can raise a
// guard's meter up to this level - enough to alert and investigate -
// but only actually *seeing* the player pushes past it into chase.
export const NON_VISUAL_CAP = 0.75;

// Scales the floodlight / dog-smell feeds. They now compete with
// decay (which runs whenever the guard can't see the player), so the
// raw rates are lifted to stay meaningful.
export const EXTERNAL_FEED_GAIN = 1.6;

// Per-second meter contribution at zero distance for each stance and
// movement state, falling off linearly to zero at the stance's
// hearing range. Crouching is near-silent: at stage 1 it never beats
// decay, walking does close up, running does from well away.
export function baseNoisePerSecond(p: Player): number {
  if (!p.isCrouched) {
    return p.isRunning ? 0.8 : 0.4; // walk
  }
  return p.isRunning ? 0.3 : 0.15; // crouch
}

export function isMoving(p: Player): boolean {
  return Math.abs(p.vx) > 0.05 || Math.abs(p.vz) > 0.05;
}

// Radius (m) at which the player's current action can be heard. Zero
// when standing still. Drives both the detection model and the noise
// ring the player sees around their feet.
export function noiseRadius(p: Player, tuning: DetectionTuning, noiseScale: number = 1): number {
  if (!isMoving(p)) return 0;
  const rangeSq = p.isCrouched ? tuning.noiseRangeCrouchSq : tuning.noiseRangeWalkSq;
  // Running carries further than walking in the same stance.
  const runMul = p.isRunning ? 1.35 : 1;
  return Math.sqrt(rangeSq) * runMul * Math.min(1.2, Math.max(0.6, noiseScale));
}

function angleDelta(a: number, b: number): number {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return Math.abs(d);
}

// Stage-driven tuning the caller passes in. Letting the loop own
// this means progression.ts is the single dial; DetectionSystem
// just consumes whatever rates it's handed each frame.
export type DetectionTuning = {
  // Multiplier applied to the vision contribution. 1/6 at stage 1,
  // up to 1/3 in late game.
  rateScale: number;
  // Per-second decay while the guard has no visual contact.
  decay: number;
  // Squared noise ranges keyed by stance.
  noiseRangeWalkSq: number;
  noiseRangeCrouchSq: number;
};

// Optional sphere of vision-blocking smoke. The game loop builds the
// list of active clouds and passes it in; DetectionSystem treats any
// sight line that starts in, ends in, or crosses a cloud as blocked
// (noise still counts - smoke covers eyes, not ears).
export type SmokeRegion = { x: number; z: number; radius: number };

function smokeBlocks(
  regions: readonly SmokeRegion[],
  ax: number,
  az: number,
  bx: number,
  bz: number,
): boolean {
  for (const sr of regions) {
    // Distance from the smoke centre to segment AB.
    const dx = bx - ax;
    const dz = bz - az;
    const lenSq = dx * dx + dz * dz || 1;
    const t = Math.max(0, Math.min(1, ((sr.x - ax) * dx + (sr.z - az) * dz) / lenSq));
    const px = ax + dx * t - sr.x;
    const pz = az + dz * t - sr.z;
    if (px * px + pz * pz <= sr.radius * sr.radius) return true;
  }
  return false;
}

// Pure visibility test: is the player inside this guard's vision cone
// and range, with no smoke or tall-enough prop on the sight line?
// Cover is directional by construction - a prop only hides the player
// when it actually sits between the guard and the player.
export function guardCanSee(
  guard: Guard,
  player: Player,
  obstacles: readonly Obstacle[],
  visionRange: number,
  smokeRegions: readonly SmokeRegion[] = [],
): boolean {
  if (guard.stunTimer > 0) return false;
  const dSq = dist2Sq(guard.x, guard.z, player.x, player.z);
  if (dSq > visionRange * visionRange) return false;
  const angleToPlayer = Math.atan2(player.z - guard.z, player.x - guard.x);
  if (angleDelta(guard.facing, angleToPlayer) > VISION_HALF) return false;
  if (smokeBlocks(smokeRegions, guard.x, guard.z, player.x, player.z)) return false;
  const coverHeight = player.isCrouched ? COVER_HEIGHT_CROUCHED : COVER_HEIGHT_STANDING;
  return clearLine(obstacles, guard.x, guard.z, player.x, player.z, coverHeight);
}

export type DetectionResult = {
  // Guard had an unobstructed look at the player this frame.
  visual: boolean;
  // Guard heard the player this frame.
  heard: boolean;
};

export function updateDetection(
  guard: Guard,
  player: Player,
  obstacles: readonly Obstacle[],
  prev: number,
  dt: number,
  visionRange: number,
  tuning: DetectionTuning,
  noiseScale: number = 1,
  smokeRegions: readonly SmokeRegion[] = [],
  // Frame-quantised external feed (floodlight rate * dt + dog smell +
  // searchlight one-shot).
  externalAdd: number = 0,
  out?: DetectionResult,
): number {
  if (out) {
    out.visual = false;
    out.heard = false;
  }
  // Stunned guards stop contributing to detection while frozen by a
  // crowbar hit; their meter decays so a stun is a real reset window.
  if (guard.stunTimer > 0) {
    return clamp(prev - tuning.decay * dt, 0, 1);
  }

  const dSq = dist2Sq(guard.x, guard.z, player.x, player.z);
  const visual = guardCanSee(guard, player, obstacles, visionRange, smokeRegions);
  let visionAdd = 0;
  if (visual) {
    // Stance scales how visible the player is when in the cone.
    const visionScale = player.isCrouched ? 0.45 : 1.0;
    const proximity = 1 - dSq / (visionRange * visionRange);
    visionAdd = (0.5 + 0.6 * proximity) * visionScale * dt * tuning.rateScale;
  }

  // Noise: only while moving, falls off linearly to the hearing
  // radius. Props don't muffle footsteps.
  let noiseAdd = 0;
  const hearR = noiseRadius(player, tuning, noiseScale);
  if (hearR > 0 && dSq <= hearR * hearR) {
    const proximity = 1 - Math.sqrt(dSq) / hearR;
    noiseAdd = baseNoisePerSecond(player) * proximity * dt * noiseScale;
  }
  if (out) {
    out.visual = visual;
    out.heard = noiseAdd > 0;
  }

  if (visual) {
    // Eyes on the player: no decay, everything stacks.
    return clamp(prev + visionAdd + noiseAdd + externalAdd, 0, 1);
  }
  // No line of sight: the meter always decays, and noise / external
  // feeds have to out-pace the decay to raise it - faint sounds no
  // longer freeze the meter in place. Without sight the meter can't
  // be pushed past NON_VISUAL_CAP (but a higher meter isn't clipped
  // down either; it simply decays from where it is).
  const next = prev + noiseAdd + externalAdd - tuning.decay * dt;
  if (next > prev) return clamp(Math.min(next, Math.max(prev, NON_VISUAL_CAP)), 0, 1);
  return clamp(next, 0, 1);
}
