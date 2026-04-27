import * as THREE from 'three';
import type { Player } from '../types/world';
import { lerp } from '../util/math';
import { input } from '../systems/InputSystem';

const FOLLOW_BACK = 8;
const FOLLOW_HEIGHT = 7;
const SMOOTH = 6;
const YAW_SMOOTH = 8; // how fast the camera snaps back when look button releases

// Persisted yaw across frames; module-level so the rig keeps state.
let currentYaw = 0;

export function updateCameraRig(camera: THREE.PerspectiveCamera, player: Player, dt: number) {
  // Interpolate yaw toward whatever the look buttons currently want.
  const yawT = 1 - Math.exp(-YAW_SMOOTH * dt);
  currentYaw = lerp(currentYaw, input.viewYaw, yawT);
  const yaw = currentYaw;

  // The "look direction" in the XZ plane.
  const lookX = Math.sin(yaw);
  const lookZ = Math.cos(yaw);

  // Camera sits behind the player along the -look direction.
  const targetX = player.x - lookX * FOLLOW_BACK;
  const targetZ = player.z - lookZ * FOLLOW_BACK;
  const t = 1 - Math.exp(-SMOOTH * dt);
  camera.position.x = lerp(camera.position.x, targetX, t);
  camera.position.z = lerp(camera.position.z, targetZ, t);
  camera.position.y = FOLLOW_HEIGHT;
  // Look 6m ahead in the rotated direction.
  camera.lookAt(player.x + lookX * 6, 0.5, player.z + lookZ * 6);
}
