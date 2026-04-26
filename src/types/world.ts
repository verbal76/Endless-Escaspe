import type { Object3D } from 'three';

export type RunState = 'idle' | 'playing' | 'caught' | 'cleared';

export type ObstacleKind = 'crate' | 'lowwall' | 'cover';

export type Obstacle = {
  id: number;
  kind: ObstacleKind;
  // Legacy lane index; unused by the continuous-X procgen but kept
  // optional so older modules and saved data don't break.
  lane?: number;
  x: number;
  z: number;
  r: number;
  isCover: boolean;
  mesh: Object3D | null;
};

export type Projectile = {
  id: number;
  x: number;
  z: number;
  vx: number;
  vz: number;
  // Seconds remaining before despawn even if it never hits anything.
  life: number;
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
  isProne: boolean;
  // Retained so existing references compile; mirrors isProne for now.
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
  // Seconds remaining until the guard can fire its next projectile.
  fireCooldown: number;
  mesh: Object3D | null;
  visionMesh: Object3D | null;
};
