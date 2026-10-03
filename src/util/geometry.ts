// Shared geometry constants: world is on the XZ plane, +Z is forward (away from camera).

export const PLAY_HALF_W = 9;
export const CHUNK_LEN = 24; // world units along Z per chunk
export const CHUNKS_AHEAD = 5;
export const PLAYER_RADIUS = 0.45;
// Furthest |x| the player's centre can reach: PlayerController clamps
// the player's body (not its centre) to the playfield edge. Anything
// that asks "is the player against the fence" must use this, not
// PLAY_HALF_W.
export const PLAYER_X_LIMIT = PLAY_HALF_W - PLAYER_RADIUS;
export const COVER_RADIUS = 0.9;

// Walk is the baseline. Run doubles it. Crouch is slower.
export const PLAYER_WALK_SPEED = 3.5;
export const PLAYER_RUN_SPEED = PLAYER_WALK_SPEED * 2;
export const PLAYER_CROUCH_SPEED = PLAYER_WALK_SPEED * 0.65;

// Detection model
export const VISION_CONE_DEG = 60;
// Base vision range in meters. Each stage above 1 adds
// VISION_RANGE_PER_STAGE meters, so guards see incrementally further
// as the player progresses. Vision is strictly cone-bound (cone width
// = VISION_CONE_DEG, length = computed range); guards are blind
// outside the visible footprint and crates / cover block line of sight.
export const VISION_RANGE_BASE = 6;
export const VISION_RANGE_PER_STAGE = 0.5;
