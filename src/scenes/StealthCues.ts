import * as THREE from 'three';
import { markShared } from '../util/dispose';

// World-space readability cues for the stealth loop:
//   NoiseRing     - ring around the player's feet showing how far the
//                   current action can be heard
//   AimLaser      - a guard's laser sight during the shot wind-up
//   TargetMarker  - ring under whatever the crowbar would hit
//
// All mount-once or per-guard; each owns tiny geometry and uses
// shared materials where the colour doesn't vary per instance.

const RING_GEO = markShared(new THREE.RingGeometry(0.94, 1.0, 64));

export type NoiseRing = {
  mesh: THREE.Mesh;
  mat: THREE.MeshBasicMaterial;
  shown: number;
};

export function createNoiseRing(): NoiseRing {
  const mat = new THREE.MeshBasicMaterial({
    color: 0x9fd8ff,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    side: THREE.DoubleSide,
    forceSinglePass: true,
  });
  const mesh = new THREE.Mesh(RING_GEO, mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = 0.035;
  mesh.visible = false;
  mesh.renderOrder = 2;
  return { mesh, mat, shown: 0 };
}

// radius = hearing radius (0 when silent); loudness 0..1 tints the
// ring from cool blue (quiet) to amber (loud). Smoothed so the ring
// grows / shrinks instead of popping.
export function updateNoiseRing(
  r: NoiseRing,
  x: number,
  z: number,
  radius: number,
  loudness: number,
  time: number,
  dt: number,
) {
  const k = Math.min(1, dt * 10);
  r.shown += (radius - r.shown) * k;
  if (r.shown < 0.15) {
    r.mesh.visible = false;
    return;
  }
  r.mesh.visible = true;
  r.mesh.position.x = x;
  r.mesh.position.z = z;
  // Subtle breathing so the edge reads as "sound", not a hard wall.
  const s = r.shown * (1 + 0.025 * Math.sin(time * 9));
  r.mesh.scale.set(s, s, 1);
  r.mat.color.setRGB(0.62 + 0.38 * loudness, 0.85 - 0.2 * loudness, 1.0 - 0.75 * loudness);
  r.mat.opacity = 0.22 + 0.2 * loudness;
}

const LASER_GEO = markShared(new THREE.BoxGeometry(0.035, 0.035, 1));
LASER_GEO.translate(0, 0, 0.5);

export type AimLaser = {
  mesh: THREE.Mesh;
  mat: THREE.MeshBasicMaterial;
};

export function createAimLaser(): AimLaser {
  const mat = new THREE.MeshBasicMaterial({
    color: 0xff2a2a,
    transparent: true,
    opacity: 0,
    depthWrite: false,
  });
  const mesh = new THREE.Mesh(LASER_GEO, mat);
  mesh.visible = false;
  mesh.renderOrder = 3;
  return { mesh, mat };
}

const tmpA = new THREE.Vector3();
const tmpB = new THREE.Vector3();

// progress 0..1 through the wind-up; 0 hides the laser. The beam
// flickers faster and brightens as the shot approaches.
export function updateAimLaser(
  l: AimLaser,
  from: THREE.Vector3,
  toX: number,
  toZ: number,
  progress: number,
  time: number,
) {
  if (progress <= 0) {
    l.mesh.visible = false;
    return;
  }
  tmpA.copy(from);
  tmpB.set(toX, 0.9, toZ);
  const len = tmpA.distanceTo(tmpB);
  l.mesh.visible = true;
  l.mesh.position.copy(tmpA);
  l.mesh.lookAt(tmpB);
  l.mesh.scale.set(1 + progress, 1 + progress, len);
  const flicker = 0.75 + 0.25 * Math.sin(time * (18 + 30 * progress));
  l.mat.opacity = (0.25 + 0.65 * progress) * flicker;
}

export type TargetMarker = {
  mesh: THREE.Mesh;
  mat: THREE.MeshBasicMaterial;
};

export function createTargetMarker(): TargetMarker {
  const mat = new THREE.MeshBasicMaterial({
    color: 0xffd14a,
    transparent: true,
    opacity: 0.6,
    depthWrite: false,
    side: THREE.DoubleSide,
    forceSinglePass: true,
  });
  const mesh = new THREE.Mesh(RING_GEO, mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = 0.04;
  mesh.visible = false;
  return { mesh, mat };
}

export function updateTargetMarker(m: TargetMarker, target: { x: number; z: number } | null, time: number) {
  if (!target) {
    m.mesh.visible = false;
    return;
  }
  m.mesh.visible = true;
  m.mesh.position.x = target.x;
  m.mesh.position.z = target.z;
  const s = 0.85 + 0.08 * Math.sin(time * 6);
  m.mesh.scale.set(s, s, 1);
  m.mat.opacity = 0.45 + 0.2 * Math.sin(time * 6);
}
