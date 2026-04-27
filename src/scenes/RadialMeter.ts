import * as THREE from 'three';

// 12-dot ring around the player. Dot 0 sits at "11 o'clock relative
// to +Z forward" (world angle 120deg, since +Z is 90deg and 11 o'clock
// is 30deg counterclockwise of straight forward). Subsequent dots
// step CLOCKWISE (decreasing angle by 30deg) so the visual fill order
// is "starting at 11 o'clock and going clockwise" as the user asked.
//
// The Group is parented to the world root and re-positioned to the
// player each frame; dots themselves are stationary inside the group.

export const RADIAL_DOTS = 12;
const RADIUS = 1.6;
const DOT_RADIUS = 0.12;
const DOT_HEIGHT = 0.06;

export type RadialMeter = {
  group: THREE.Group;
  dots: THREE.Mesh[];
  materials: THREE.MeshBasicMaterial[];
};

export function createRadialMeter(): RadialMeter {
  const group = new THREE.Group();
  const dots: THREE.Mesh[] = [];
  const materials: THREE.MeshBasicMaterial[] = [];
  const geo = new THREE.SphereGeometry(DOT_RADIUS, 8, 8);
  for (let i = 0; i < RADIAL_DOTS; i++) {
    const angle = (Math.PI / 2) + Math.PI / 6 - i * (Math.PI / 6); // start 120deg, step -30deg
    const mat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.18,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(Math.cos(angle) * RADIUS, DOT_HEIGHT, Math.sin(angle) * RADIUS);
    group.add(mesh);
    dots.push(mesh);
    materials.push(mat);
  }
  return { group, dots, materials };
}

// Ramp the lit color by detection level: yellow -> orange -> red.
function colorFor(detection: number): number {
  if (detection >= 0.85) return 0xff4444;
  if (detection >= 0.5) return 0xffaa33;
  return 0xffd14a;
}

export function updateRadialMeter(meter: RadialMeter, detection: number) {
  const lit = colorFor(detection);
  for (let i = 0; i < RADIAL_DOTS; i++) {
    const threshold = i / RADIAL_DOTS;
    const isLit = detection >= threshold + 0.0001;
    const m = meter.materials[i];
    if (isLit) {
      m.color.setHex(lit);
      m.opacity = 0.95;
    } else {
      m.color.setHex(0xffffff);
      m.opacity = 0.18;
    }
  }
}
