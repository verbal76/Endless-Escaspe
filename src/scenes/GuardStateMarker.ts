import * as THREE from 'three';
import { markShared } from '../util/dispose';

// Per-guard "!" marker that floats above the figure's head whenever
// the guard is in a notable state. Colour signals which condition
// triggered it:
//   search  - yellow  (alert + investigate state)
//   chase   - red     (active pursuit)
//   stunned - red     (knocked out by crowbar; same colour as chase
//                     but the figure is frozen so the silhouette
//                     reads differently in context)
//   smoke   - orange  (guard is inside a smoke cloud)
//
// The marker is sustained: it stays visible as long as the condition
// holds and hides when the caller passes null. A gentle bob + pulse
// keeps it readable without screaming for attention.

export type GuardStateMarkerKind = 'search' | 'chase' | 'stunned' | 'smoke';

const COLORS: Record<GuardStateMarkerKind, number> = {
  search: 0xffd14a,    // yellow
  chase: 0xff3838,     // saturated red
  stunned: 0xff3838,   // red - same family as chase
  smoke: 0xff9a30,     // orange
};

// Stylised exclamation point built from three meshes: a tapered stem
// (wider at top, narrow at bottom for a chunky comic-book look), a
// dot below it, and a translucent ring halo behind the dot that pulses
// to make the marker pop without animating colour.

// Stem: tapered cylinder. The "!" stroke is fattest at the head and
// narrows toward the dot, giving the silhouette a hand-drawn feel.
const STEM_GEO = markShared(
  new THREE.CylinderGeometry(0.10, 0.045, 0.50, 12),
);
const DOT_GEO = markShared(new THREE.SphereGeometry(0.11, 14, 10));
// Halo ring sitting behind the dot at the same Y. Thin band; alpha
// pulses with the marker's own animation timer.
const HALO_GEO = markShared(new THREE.RingGeometry(0.16, 0.24, 24));

const STEM_Y = 0.34;     // local Y of the stem's centre
const DOT_Y = -0.04;     // local Y of the dot
const HALO_Y = -0.04;    // halo sits coplanar with the dot
const ABOVE_HEAD = 2.55;

const POP_IN = 0.12;     // seconds for the on-set scale-up
const FADE_OUT = 0.18;   // seconds for the on-clear fade

export type GuardStateMarker = {
  group: THREE.Group;
  stemMat: THREE.MeshBasicMaterial;
  dotMat: THREE.MeshBasicMaterial;
  haloMat: THREE.MeshBasicMaterial;
  // Active kind, or null when hidden / fading out.
  kind: GuardStateMarkerKind | null;
  // Visibility 0..1 lerped toward 1 while kind != null and toward 0
  // otherwise. The mesh group is hidden once visibility hits 0 so the
  // renderer can skip it cheaply.
  visibility: number;
  // Per-marker animation clock for the bob + halo pulse. Resets on
  // each on-set so the pulse always opens with full energy.
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
  const haloMat = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.35,
    depthWrite: false,
    side: THREE.DoubleSide,
  });

  const stem = new THREE.Mesh(STEM_GEO, stemMat);
  stem.position.y = STEM_Y;
  group.add(stem);

  const halo = new THREE.Mesh(HALO_GEO, haloMat);
  halo.position.y = HALO_Y;
  // RingGeometry is built in the XY plane; tilt it to face up the
  // camera so it reads as a halo behind the dot rather than a coin
  // edge-on.
  halo.rotation.x = 0;
  group.add(halo);

  const dot = new THREE.Mesh(DOT_GEO, dotMat);
  dot.position.y = DOT_Y;
  group.add(dot);

  return {
    group,
    stemMat,
    dotMat,
    haloMat,
    kind: null,
    visibility: 0,
    age: 0,
  };
}

// Switch the marker's active kind. Pass null to hide. Re-tinting on
// the same kind is a no-op (we keep the bob phase running rather than
// resetting it, so a steady state condition doesn't strobe).
export function setGuardStateMarker(
  m: GuardStateMarker,
  kind: GuardStateMarkerKind | null,
) {
  if (m.kind === kind) return;
  m.kind = kind;
  if (kind) {
    const hex = COLORS[kind];
    m.stemMat.color.setHex(hex);
    m.dotMat.color.setHex(hex);
    m.haloMat.color.setHex(hex);
    m.age = 0;
  }
}

// Per-frame animation tick. Lerps visibility toward the target,
// drives a gentle Y bob, and pulses the halo's opacity. Hides the
// group entirely once visibility hits 0 so the renderer skips it.
export function updateGuardStateMarker(m: GuardStateMarker, dt: number) {
  const target = m.kind ? 1 : 0;
  if (m.visibility !== target) {
    const rate = target > m.visibility ? dt / POP_IN : dt / FADE_OUT;
    m.visibility = Math.max(
      0,
      Math.min(1, m.visibility + (target - m.visibility) * Math.min(1, rate)),
    );
  }
  if (m.visibility <= 0.001) {
    m.group.visible = false;
    return;
  }
  m.group.visible = true;
  m.age += dt;

  // Subtle bob: ±0.06 around the resting head height. Frequency is
  // higher for chase/stunned to read as urgent.
  const bobHz = m.kind === 'chase' || m.kind === 'stunned' ? 5 : 3;
  const bob = Math.sin(m.age * bobHz * Math.PI) * 0.06;
  m.group.position.y = ABOVE_HEAD + bob;

  // Pop-in overshoot: scale jumps to 1.15 at full visibility then
  // settles. Clamps at the steady-state pulse once the pop completes.
  const popPhase = Math.min(1, m.age / POP_IN);
  const overshoot = popPhase < 1 ? 1 + 0.35 * Math.sin(popPhase * Math.PI) : 1;
  // Steady-state breath: 8% scale wobble at the same Hz as the bob.
  const breath = 1 + Math.sin(m.age * bobHz * Math.PI) * 0.08;
  m.group.scale.setScalar(m.visibility * overshoot * breath);

  // Halo pulse: opacity varies between 0.15 and 0.55 at the bob
  // frequency, offset half a cycle so it crests when the bar is at
  // its lowest - reads like a heartbeat.
  const haloPulse = 0.35 + 0.20 * Math.sin(m.age * bobHz * Math.PI + Math.PI);
  m.haloMat.opacity = haloPulse * m.visibility;
  m.stemMat.opacity = m.visibility;
  m.dotMat.opacity = m.visibility;
}
