import * as THREE from 'three';
import type { Stance } from '../types/world';

// Procedural blocky figure: head + torso + 2 arms + 2 legs, all
// parented to a Group so callers can position/rotate the whole
// figure. Limb meshes are exposed so the render loop can drive a
// simple walk/run/crouch/crawl cycle by setting rotations + positions
// each frame.

export type BlockyFigure = {
  group: THREE.Group;
  head: THREE.Mesh;
  torso: THREE.Mesh;
  armL: THREE.Mesh;
  armR: THREE.Mesh;
  legL: THREE.Mesh;
  legR: THREE.Mesh;
  rest: {
    head: THREE.Vector3;
    torso: THREE.Vector3;
    armL: THREE.Vector3;
    armR: THREE.Vector3;
    legL: THREE.Vector3;
    legR: THREE.Vector3;
  };
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

const HIP_Y = 0.7;
const SHOULDER_Y = 1.5;
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

// Spherical head replaces the original cube head: same overall
// volume but a markedly less blocky silhouette. Radius is
// HEAD_SIZE * 0.58 so the apparent height of the head matches the
// pre-bump cube while reading rounder against shoulders.
function makeHead(color: number): THREE.Mesh {
  const geo = new THREE.SphereGeometry(HEAD_SIZE * 0.58, 14, 10);
  const mat = new THREE.MeshStandardMaterial({
    color,
    roughness: 0.55,
    transparent: true,
    opacity: 1,
  });
  return new THREE.Mesh(geo, mat);
}

// Optional headColor lets guards / players override just the head
// while keeping the body uniform-coloured. If omitted, the head
// matches the body colour.
export function createBlockyFigure(color: number, headColor?: number): BlockyFigure {
  const group = new THREE.Group();

  const head = makeHead(headColor ?? color);
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

  return {
    group,
    head,
    torso,
    armL,
    armR,
    legL,
    legR,
    rest: {
      head: head.position.clone(),
      torso: torso.position.clone(),
      armL: armL.position.clone(),
      armR: armR.position.clone(),
      legL: legL.position.clone(),
      legR: legR.position.clone(),
    },
  };
}

export type FigurePoseInput = {
  stance: Stance;
  speed: number;
  isRunning: boolean;
  facing: number;
  time: number;
  hidden?: boolean;
};

const PARTS: Array<keyof BlockyFigure> = ['head', 'torso', 'armL', 'armR', 'legL', 'legR'];

function resetPose(fig: BlockyFigure) {
  fig.head.position.copy(fig.rest.head);
  fig.torso.position.copy(fig.rest.torso);
  fig.armL.position.copy(fig.rest.armL);
  fig.armR.position.copy(fig.rest.armR);
  fig.legL.position.copy(fig.rest.legL);
  fig.legR.position.copy(fig.rest.legR);
  fig.head.rotation.set(0, 0, 0);
  fig.torso.rotation.set(0, 0, 0);
  fig.armL.rotation.set(0, 0, 0);
  fig.armR.rotation.set(0, 0, 0);
  fig.legL.rotation.set(0, 0, 0);
  fig.legR.rotation.set(0, 0, 0);
  fig.group.rotation.x = 0;
  fig.group.position.y = 0;
}

// Square-wave-with-fast-transition. Returns 1 for ~half the cycle
// (Pose A locked), 0 for the other half (Pose B locked), with a
// quick smooth ramp at each swap. This avoids the "halfway between"
// frame where both limbs look ambiguous - the user wants to see
// either left-side reaching OR right-side reaching, never a blend.
function poseA_amount(phase: number): number {
  const TRANSITION = 0.12;
  const t = ((phase % (2 * Math.PI)) / (2 * Math.PI) + 1) % 1;
  if (t < 0.5 - TRANSITION) return 1;
  if (t < 0.5 + TRANSITION) {
    return 1 - (t - (0.5 - TRANSITION)) / (2 * TRANSITION);
  }
  if (t < 1 - TRANSITION) return 0;
  return (t - (1 - TRANSITION)) / (2 * TRANSITION);
}

export function updateFigurePose(fig: BlockyFigure, input: FigurePoseInput) {
  const { stance, speed, isRunning, facing, time, hidden } = input;

  fig.group.rotation.y = -facing + Math.PI / 2;

  resetPose(fig);

  const cycleHz = isRunning ? 4.5 : 2.4;
  const phase = time * cycleHz * 2 * Math.PI;
  const swing = Math.min(1, speed / 4) * (isRunning ? 0.9 : 0.55);

  if (stance === 'crouch') {
    // CROUCH now uses the on-hands-and-knees animation that was
    // formerly the CRAWL stance - same-side reach pair (left arm +
    // left leg, then right arm + right leg) per the user's hand-
    // drawn reference. Reaching arm sweeps UP and FORWARD past the
    // head; trailing leg kicks back. Tucked limbs hang at the body
    // side, foreshortened from the camera.

    fig.torso.rotation.x = Math.PI / 2.4;
    fig.torso.position.set(0, 0.6, 0);

    fig.head.position.set(0, 0.7, 0.55);
    fig.head.rotation.x = -Math.PI / 5;

    const shoulderHalf = TORSO_W / 2 + ARM_W / 2 + 0.02;
    const shoulderY = 0.75;
    const hipY = 0.55;
    const hipBack = -0.2;

    const aRaw = poseA_amount(phase);
    const a = swing > 0.05 ? aRaw : 1; // freeze on Pose A when still
    const b = 1 - a;

    const ARM_REACH_X = Math.PI / 3;
    const ARM_REACH_OUTWARD_Y = 0.55;
    fig.armL.position.set(-shoulderHalf, shoulderY, 0.18);
    fig.armR.position.set(shoulderHalf, shoulderY, 0.18);
    fig.armL.rotation.x = a * ARM_REACH_X;
    fig.armR.rotation.x = b * ARM_REACH_X;
    fig.armL.rotation.y = -a * ARM_REACH_OUTWARD_Y;
    fig.armR.rotation.y = b * ARM_REACH_OUTWARD_Y;

    const LEG_REACH_X = -Math.PI / 2 + 0.20;
    const LEG_REACH_OUTWARD_Y = 0.40;
    fig.legL.position.set(-(LEG_W / 2 + 0.02), hipY, hipBack);
    fig.legR.position.set(LEG_W / 2 + 0.02, hipY, hipBack);
    fig.legL.rotation.x = a * LEG_REACH_X;
    fig.legR.rotation.x = b * LEG_REACH_X;
    fig.legL.rotation.y = a * LEG_REACH_OUTWARD_Y;
    fig.legR.rotation.y = -b * LEG_REACH_OUTWARD_Y;
  } else {
    if (isRunning) fig.torso.rotation.x = 0.18;
    fig.legL.rotation.x = Math.sin(phase) * 0.7 * swing;
    fig.legR.rotation.x = Math.sin(phase + Math.PI) * 0.7 * swing;
    fig.armL.rotation.x = Math.sin(phase + Math.PI) * 0.7 * swing;
    fig.armR.rotation.x = Math.sin(phase) * 0.7 * swing;
  }

  // Hidden state used to dim the figure to 35% opacity for "you're
  // hidden by cover" feedback, but the user found it confusing
  // (player thought they were broken). Detection meter already
  // communicates concealment, so the figure stays fully opaque.
  for (const key of PARTS) {
    const part = fig[key] as THREE.Mesh;
    const mat = part.material as THREE.MeshStandardMaterial;
    if (mat.opacity !== 1) mat.opacity = 1;
  }
  void hidden;
}

export function setFigurePosition(fig: BlockyFigure, x: number, z: number) {
  fig.group.position.x = x;
  fig.group.position.z = z;
}
