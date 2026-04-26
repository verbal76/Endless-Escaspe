// Shared geometry constants: world is on the XZ plane, +Z is forward (away from camera).
// Lanes are evenly spaced on X.

// Legacy 3-lane layout. Procgen has moved to continuous-X scatter
// inside [-PLAY_HALF_W, +PLAY_HALF_W]; LANES is kept only so older
// modules that referenced it still compile.
export const LANES = [-2, 0, 2];
export const LANE_WIDTH = 2;

export const PLAY_HALF_W = 7;
export const CHUNK_LEN = 24; // world units along Z per chunk
export const CHUNKS_AHEAD = 5;
export const PLAYER_RADIUS = 0.45;
export const OBSTACLE_RADIUS = 0.6;
export const COVER_RADIUS = 0.9;

export const PLAYER_RUN_SPEED = 7.5; // m/s baseline
export const PLAYER_WALK_SPEED = 3.5;
export const PLAYER_LATERAL_SPEED = 6;

export const GUARD_PATROL_SPEED = 2.0;
export const GUARD_CHASE_SPEED = 6.5;

// Detection model
export const VISION_CONE_DEG = 60;
export const VISION_RANGE = 14;
export const NOISE_RANGE_RUN = 7;
export const NOISE_RANGE_WALK = 3;
export const DETECTION_DECAY = 0.15; // per second when no contribution
