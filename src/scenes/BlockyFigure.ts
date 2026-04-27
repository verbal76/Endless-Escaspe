import * as THREE from 'three';
import type { Stance } from '../types/world';

// Procedural blocky figure: head + torso + 2 arms + 2 legs, all
// parented to a Group so callers can position/rotate the whole
// figure. Limb meshes are exposed so the render loop can drive a
// simple walk/run cycle by setting their rotations each frame.
//
// No external assets, no rigging. The figure reads as "humanoid"
// without the asset pipeline work that proper GLB models would
// require, and stance poses (walk / crouch / crawl) are all driven
// from a single update function below.

export type BlockyFigure = {
  group: THREE.Group;
  head: THREE.Mesh;
  torso: THREE.Mesh;
  armL: THREE.Mesh;
  armR: THREE.Mesh;
  legL: THREE.Mesh;
  legR: THREE.Mesh;
};

const HEAD_SIZE = 0.42;
const TORSO_W = 0.62;
const TORSO_H = 0.7;
const TORSO_D = 0.32;
const ARM_W = 0.18;
const ARM_H = 0.62;
const ARM_D = 0.18;
const LEG_W = 0.22;
const LEG_H = 0.7;
const LEG_D = 0.22;

// Reference y of each part when standing upright. The pivot for
// limb swing is at the top of the limb (shoulder / hip), achieved
// by translating the geometry down so its top sits at y=0 inside
// the local mesh frame.
const HIP_Y = 0.7;     // top of legs / bottom of torso
const SHOULDER_Y = 1.5; // top of torso / arm pivot
const HEAD_Y = 1.78;
const TORSO_CENTER_Y = HIP_Y + TORSO_H / 2;

function makePart(
  w: number,
  h: number,
  d: number,
  color: number,
  pivotAtTop: boolean,
): THREE.Mesh {
  const geo = new THREE.BoxGeometry(w, h, d);
  if (pivotAtTop) {
    // Translate so the top face sits at y=0 in local frame; then the
    // mesh rotates around its top edge (the pivot) instead of its
    // centre, mimicking a shoulder/hip joint.
    geo.translate(0, -h / 2, 0);
  }
  const mat = new THREE.MeshStandardMaterial({
    color,
    roughness: 0.55,
    transparent: true,
    opacity: 1,
  });
  return new THREE.Mesh(geo, mat);
}

export function createBlockyFigure(color: number): BlockyFigure {
  const group = new THREE.Group();

  const head = makePart(HEAD_SIZE, HEAD_SIZE, HEAD_SIZE, color, false);
  head.position.y = HEAD_Y;
  group.add(head);

  const torso = makePart(TORSO_W, TORSO_H, TORSO_D, color, false);
  torso.position.y = TORSO_CENTER_Y;
  group.add(torso);

  const armL = makePart(ARM_W, ARM_H, ARM_D, color, true);
  armL.position.set(-(TORSO_W / 2 + ARM_W / 2 + 0.02), SHOULDER_Y, 0);
  group.add(armL);

  const armR = makePart(ARM_W, ARM_H, ARM_D, color, true);
  armR.position.set(TORSO_W / 2 + ARM_W / 2 + 0.02, SHOULDER_Y, 0);
  group.add(armR);

  const legL = makePart(LEG_W, LEG_H, LEG_D, color, true);
  legL.position.set(-(LEG_W / 2 + 0.02), HIP_Y, 0);
  group.add(legL);

  const legR = makePart(LEG_W, LEG_H, LEG_D, color, true);
  legR.position.set(LEG_W / 2 + 0.02, HIP_Y, 0);
  group.add(legR);

  return { group, head, torso, armL, armR, legL, legR };
}

export type FigurePoseInput = {
  stance: Stance;
  speed: number;        // current movement speed in m/s
  isRunning: boolean;
  facing: number;       // world bearing in radians (0 = +X, PI/2 = +Z)
  time: number;         // accumulator in seconds for animation phase
  hidden?: boolean;     // dim opacity when hidden
};

const PARTS: Array<keyof BlockyFigure> = ['head', 'torso', 'armL', 'armR', 'legL', 'legR'];

export function updateFigurePose(fig: BlockyFigure, input: FigurePoseInput) {
  const { stance, speed, isRunning, facing, time, hidden } = input;

  // Whole-figure rotation: face the movement direction. The figure's
  // "forward" is +Z in its local frame, so we rotate around Y so +Z
  // aligns with the world bearing.
  fig.group.rotation.y = -facing + Math.PI / 2;

  // Animation phase advances faster while running.
  const cycleHz = isRunning ? 4.5 : 2.4;
  const phase = time * cycleHz * 2 * Math.PI;
  // Swing amplitude scales with speed (no swing when standing still).
  const swing = Math.min(1, speed / 4) * (isRunning ? 0.9 : 0.55);

  // Default pose: limbs neutral.
  fig.armL.rotation.x = 0;
  fig.armR.rotation.x = 0;
  fig.legL.rotation.x = 0;
  fig.legR.rotation.x = 0;
  fig.armL.rotation.z = 0;
  fig.armR.rotation.z = 0;
  fig.head.rotation.x = 0;
  fig.torso.rotation.x = 0;

  if (stance === 'crawl') {
    // Lay flat: rotate the whole figure around X so the torso lies
    // along its forward axis. Lift slightly off the ground so the
    // body sits flush, not embedded.
    fig.group.rotation.x = -Math.PI / 2;
    fig.group.position.y = 0.45;
    // "Swim" motion: arms reach forward, legs trail. Phase-offset
    // so the limbs alternate side-to-side when speed > 0.
    fig.armL.rotation.x = -Math.PI / 2 + Math.sin(phase) * 0.4 * swing;
    fig.armR.rotation.x = -Math.PI / 2 + Math.sin(phase + Math.PI) * 0.4 * swing;
    fig.legL.rotation.x = -0.1 + Math.sin(phase) * 0.3 * swing;
    fig.legR.rotation.x = -0.1 + Math.sin(phase + Math.PI) * 0.3 * swing;
  } else if (stance === 'crouch') {
    // Bent legs + lowered torso, slower swing.
    fig.group.rotation.x = 0;
    fig.group.position.y = -0.35;
    fig.torso.rotation.x = 0.25; // lean forward slightly
    fig.legL.rotation.x = -0.6 + Math.sin(phase) * 0.35 * swing;
    fig.legR.rotation.x = -0.6 + Math.sin(phase + Math.PI) * 0.35 * swing;
    fig.armL.rotation.x = Math.sin(phase + Math.PI) * 0.4 * swing;
    fig.armR.rotation.x = Math.sin(phase) * 0.4 * swing;
  } else {
    // Standing walk / run.
    fig.group.rotation.x = 0;
    fig.group.position.y = 0;
    if (isRunning) fig.torso.rotation.x = 0.18; // forward lean
    fig.legL.rotation.x = Math.sin(phase) * 0.7 * swing;
    fig.legR.rotation.x = Math.sin(phase + Math.PI) * 0.7 * swing;
    fig.armL.rotation.x = Math.sin(phase + Math.PI) * 0.7 * swing;
    fig.armR.rotation.x = Math.sin(phase) * 0.7 * swing;
  }

  // Hidden = ghost-out the whole figure so the player can see they're
  // tucked in cover.
  const targetOpacity = hidden ? 0.35 : 1;
  for (const key of PARTS) {
    const part = fig[key] as THREE.Mesh;
    const mat = part.material as THREE.MeshStandardMaterial;
    if (mat.opacity !== targetOpacity) mat.opacity = targetOpacity;
  }
}

export function setFigurePosition(fig: BlockyFigure, x: number, z: number) {
  // Preserve the y offset that updateFigurePose set for the current
  // stance. Position the group at world (x, group.position.y, z).
  fig.group.position.x = x;
  fig.group.position.z = z;
}
