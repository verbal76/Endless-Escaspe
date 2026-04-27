// Shared geometry constants: world is on the XZ plane, +Z is forward (away from camera).
// Lanes are evenly spaced on X.

// Legacy 3-lane layout. Procgen has moved to continuous-X scatter
// inside [-PLAY_HALF_W, +PLAY_HALF_W]; LANES is kept only so older
// modules that referenced it still compile.
export const LANES = [-2, 0, 2];
export const LANE_WIDTH = 2;

export const PLAY_HALF_W = 9;
export const CHUNK_LEN = 24; // world units along Z per chunk
export const CHUNKS_AHEAD = 5;
export const PLAYER_RADIUS = 0.45;
export const OBSTACLE_RADIUS = 0.6;
export const COVER_RADIUS = 0.9;

// Walk is the baseline. Run doubles it. Crouch and prone are slower.
export const PLAYER_WALK_SPEED = 3.5;
export const PLAYER_RUN_SPEED = PLAYER_WALK_SPEED * 2;
export const PLAYER_CROUCH_SPEED = PLAYER_WALK_SPEED * 0.65;
export const PLAYER_PRONE_SPEED = PLAYER_WALK_SPEED * 0.4;
// Legacy export kept so older modules that imported it still compile.
export const PLAYER_LATERAL_SPEED = PLAYER_WALK_SPEED;

export const GUARD_PATROL_SPEED = 2.0;
export const GUARD_CHASE_SPEED = 6.5;

// Detection model
export const VISION_CONE_DEG = 60;
// Base vision range in meters. Each stage above 1 adds
// VISION_RANGE_PER_STAGE meters, so guards see incrementally further
// as the player progresses. Vision is strictly cone-bound (cone width
// = VISION_CONE_DEG, length = computed range); guards are blind
// outside the visible footprint and crates / cover block line of sight.
export const VISION_RANGE_BASE = 6;
export const VISION_RANGE_PER_STAGE = 0.5;

// Legacy constant kept for any older imports; equivalent to stage 1.
export const VISION_RANGE = VISION_RANGE_BASE;

export function getVisionRange(stage: number): number {
  const s = Math.max(1, stage | 0);
  return VISION_RANGE_BASE + (s - 1) * VISION_RANGE_PER_STAGE;
}

// While the player is standing in a floodlight footprint, every
// guard's effective vision range is multiplied by (1 + this). Starts
// low so lit areas raise the stakes without instantly dooming the
// player; tunable upward as later stages get harder.
export const LIGHT_VISION_BONUS = 0.10;
export const NOISE_RANGE_RUN = 7;
export const NOISE_RANGE_WALK = 3;
export const DETECTION_DECAY = 0.15; // per second when no contribution
