import type { Object3D } from 'three';

export type RunState = 'idle' | 'playing' | 'caught' | 'cleared';

export type ObstacleKind = 'crate' | 'lowwall' | 'cover';

export type Obstacle = {
  id: number;
  kind: ObstacleKind;
  lane: number; // index into LANES
  x: number; // resolved world X from lane
  z: number;
  // Cached collision radius from geometry constants
  r: number;
  // Whether this acts as cover (blocks LOS, hideable)
  isCover: boolean;
  mesh: Object3D | null;
};

export type Chunk = {
  id: number;
  startZ: number;
  endZ: number;
  obstacles: Obstacle[];
};

export type Player = {
  x: number;
  z: number;
  vx: number;
  vz: number;
  isCrouched: boolean;
  isRunning: boolean;
  isHidden: boolean;
};

export type GuardState = 'patrol' | 'suspicious' | 'alert' | 'chase';

export type Guard = {
  id: number;
  x: number;
  z: number;
  // Facing angle in radians (0 = +X). Vision cone centered on this.
  facing: number;
  state: GuardState;
  waypoints: Array<{ x: number; z: number }>;
  waypointIndex: number;
  mesh: Object3D | null;
  visionMesh: Object3D | null;
};
