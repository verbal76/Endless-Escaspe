import * as THREE from 'three';
import type { Player } from '../types/world';
import { lerp } from '../util/math';

const FOLLOW_BACK = 8;
const FOLLOW_HEIGHT = 7;
const SMOOTH = 6;

// Camera follows the player one-to-one on X so the player can
// actually traverse the full playfield width without bumping into
// invisible camera limits. The previous 0.4x lateral dampening kept
// the player visually pinned to the centre third of the screen.
export function updateCameraRig(camera: THREE.PerspectiveCamera, player: Player, dt: number) {
  const targetX = player.x;
  const targetZ = player.z - FOLLOW_BACK;
  const t = 1 - Math.exp(-SMOOTH * dt);
  camera.position.x = lerp(camera.position.x, targetX, t);
  camera.position.z = lerp(camera.position.z, targetZ, t);
  camera.position.y = FOLLOW_HEIGHT;
  camera.lookAt(player.x, 0.5, player.z + 6);
}
