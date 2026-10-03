// B: which player x positions can ANY floodlight ever light (any scan/track angle)?
import * as THREE from 'three';
import { spawnLightTowers, isPlayerLit } from '../../../../../../../home/user/Endless-Escaspe/src/scenes/LightTower';
const towers = spawnLightTowers(new THREE.Group(), 120, 5, 1, true, 0);
let darkMax = 0; const litXs: number[] = [];
for (let x = -8.55; x <= 8.551; x += 0.05) {
  let ever = false;
  for (const t of towers) {
    for (let z = 0; z <= 120 && !ever; z += 0.25) {
      for (let a = 0; a < 360 && !ever; a += 1) { t.scanAngle = a * Math.PI / 180; if (isPlayerLit(t, x, z)) ever = true; }
    }
    if (ever) break;
  }
  if (!ever) litXs.push(+x.toFixed(2));
}
console.log('player x positions NEVER lit by any tower (any angle, any z):', litXs.length ? litXs[0] + ' .. ' + litXs[litXs.length-1] : 'none');
// Tracking: once lit, the beam re-centres on the player every frame; player stays lit while 1 m <= dist(tower) <= 9 m.
const t = towers[0]; t.state='track';
const pts = [[t.x+2, t.z],[t.x+8.9,t.z],[t.x+9.1,t.z],[t.x+5,t.z+7]];
for (const [x,z] of pts) { t.scanAngle = Math.atan2(x-t.x, z-t.z); console.log('tower at', t.x.toFixed(1), 'player', x.toFixed(1), z.toFixed(1), 'dist', Math.hypot(x-t.x,z-t.z).toFixed(2), 'lit-when-tracked', isPlayerLit(t,x,z)); }
