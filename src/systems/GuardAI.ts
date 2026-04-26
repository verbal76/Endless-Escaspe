import type { Guard, Player } from '../types/world';
import { dist2 } from '../util/math';
import { GUARD_CHASE_SPEED, GUARD_PATROL_SPEED } from '../util/geometry';

const ARRIVE_EPS = 0.5;

export function updateGuard(g: Guard, p: Player, detection: number, dt: number) {
  // FSM: detection drives state transitions.
  if (detection >= 1) g.state = 'chase';
  else if (detection >= 0.6) g.state = 'alert';
  else if (detection >= 0.25) g.state = 'suspicious';
  else g.state = 'patrol';

  let tx: number;
  let tz: number;
  let speed: number;
  if (g.state === 'chase' || g.state === 'alert') {
    tx = p.x;
    tz = p.z;
    speed = GUARD_CHASE_SPEED;
  } else if (g.state === 'suspicious') {
    // Hold position, look toward player.
    tx = g.x;
    tz = g.z;
    speed = 0;
    g.facing = Math.atan2(p.z - g.z, p.x - g.x);
  } else {
    const wp = g.waypoints[g.waypointIndex];
    tx = wp.x;
    tz = wp.z;
    speed = GUARD_PATROL_SPEED;
    if (dist2(g.x, g.z, wp.x, wp.z) < ARRIVE_EPS) {
      g.waypointIndex = (g.waypointIndex + 1) % g.waypoints.length;
    }
  }

  if (speed > 0) {
    const dx = tx - g.x;
    const dz = tz - g.z;
    const len = Math.hypot(dx, dz) || 1;
    g.x += (dx / len) * speed * dt;
    g.z += (dz / len) * speed * dt;
    g.facing = Math.atan2(dz, dx);
  }
}
