import * as THREE from 'three';

// Per-guard "!" marker that pops above the figure's head whenever
// the guard transitions into alert / investigate / chase. Colour
// signals which state triggered it; pop animation is a quick
// scale-overshoot followed by a hold + fade so the cue is brief
// without being missable.

export type GuardStateMarkerKind = 'alert' | 'investigate' | 'chase';

const COLORS: Record<GuardStateMarkerKind, number> = {
  alert: 0xffd14a,         // yellow
  investigate: 0xff9a30,   // orange
  chase: 0xff3838,         // saturated red
};

// Shared geometries: same shape across every marker, so the only
// per-guard allocation is the materials (which we tint per state).
const STEM_GEO = new THREE.CylinderGeometry(0.06, 0.06, 0.42, 10);
const DOT_GEO = new THREE.SphereGeometry(0.085, 10, 8);

const STEM_Y = 0.30;   // local Y of the bar's centre
const DOT_Y = -0.02;   // local Y of the dot
const ABOVE_HEAD = 2.55;

const POP_UP = 0.10;     // seconds to scale 0 -> overshoot
const POP_SETTLE = 0.10; // seconds to settle from overshoot to 1
const HOLD = 0.55;       // hold at full scale
const FADE = 0.30;       // fade out
export const MARKER_LIFETIME = POP_UP + POP_SETTLE + HOLD + FADE;

export type GuardStateMarker = {
  group: THREE.Group;
  stemMat: THREE.MeshBasicMaterial;
  dotMat: THREE.MeshBasicMaterial;
  // -1 means inactive; otherwise it's the elapsed seconds since the
  // last trigger. The update tick advances this and snaps the group
  // visibility off when MARKER_LIFETIME passes.
  age: number;
};

export function createGuardStateMarker(): GuardStateMarker {
  const group = new THREE.Group();
  group.position.y = ABOVE_HEAD;
  group.visible = false;
  group.scale.setScalar(0);

  const stemMat = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 1,
    depthWrite: false,
  });
  const dotMat = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 1,
    depthWrite: false,
  });

  const stem = new THREE.Mesh(STEM_GEO, stemMat);
  stem.position.y = STEM_Y;
  group.add(stem);

  const dot = new THREE.Mesh(DOT_GEO, dotMat);
  dot.position.y = DOT_Y;
  group.add(dot);

  return { group, stemMat, dotMat, age: -1 };
}

// Re-fire the marker with the colour for the supplied kind. Resets
// the age so the pop animation plays from scratch even if a previous
// trigger is still in flight (state churn shouldn't make the marker
// stutter).
export function triggerGuardStateMarker(m: GuardStateMarker, kind: GuardStateMarkerKind) {
  const hex = COLORS[kind];
  m.stemMat.color.setHex(hex);
  m.dotMat.color.setHex(hex);
  m.stemMat.opacity = 1;
  m.dotMat.opacity = 1;
  m.group.visible = true;
  m.group.scale.setScalar(0.001);
  m.age = 0;
}

// Advance the marker's pop / hold / fade timeline. No-op if inactive.
export function updateGuardStateMarker(m: GuardStateMarker, dt: number) {
  if (m.age < 0) return;
  m.age += dt;
  const a = m.age;
  let scale: number;
  let opacity: number;
  if (a < POP_UP) {
    // Scale up to the overshoot peak (1.35) over POP_UP seconds.
    const t = a / POP_UP;
    scale = 1.35 * t;
    opacity = 1;
  } else if (a < POP_UP + POP_SETTLE) {
    // Settle from 1.35 down to 1.0.
    const t = (a - POP_UP) / POP_SETTLE;
    scale = 1.35 - 0.35 * t;
    opacity = 1;
  } else if (a < POP_UP + POP_SETTLE + HOLD) {
    scale = 1;
    opacity = 1;
  } else if (a < MARKER_LIFETIME) {
    const t = (a - POP_UP - POP_SETTLE - HOLD) / FADE;
    scale = 1;
    opacity = 1 - t;
  } else {
    m.group.visible = false;
    m.age = -1;
    return;
  }
  m.group.scale.setScalar(scale);
  m.stemMat.opacity = opacity;
  m.dotMat.opacity = opacity;
}
