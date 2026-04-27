import * as THREE from 'three';
import type { Stance } from '../types/world';

// Procedural blocky figure: head + torso + 2 arms + 2 legs, all
// parented to a Group so callers can position/rotate the whole
// figure. Limb meshes are exposed so the render loop can drive a
// simple walk/run/crouch/crawl cycle by setting rotations + positions
// each frame. No external assets, no rigging.

export type BlockyFigure = {
  group: THREE.Group;
  head: THREE.Mesh;
  torso: THREE.Mesh;
  armL: THREE.Mesh;
  armR: THREE.Mesh;
  legL: THREE.Mesh;
  legR: THREE.Mesh;
  // Snapshot of each part's initial (standing) position so
  // updateFigurePose can reset before applying a stance override.
  // Without this, transient crawl-pose positions would leak into
  // walk/crouch frames after a stance change.
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

export function updateFigurePose(fig: BlockyFigure, input: FigurePoseInput) {
  const { stance, speed, isRunning, facing, time, hidden } = input;

  // Whole-figure yaw: face the movement direction.
  fig.group.rotation.y = -facing + Math.PI / 2;

  resetPose(fig);

  const cycleHz = isRunning ? 4.5 : 2.4;
  const phase = time * cycleHz * 2 * Math.PI;
  const swing = Math.min(1, speed / 4) * (isRunning ? 0.9 : 0.55);

  if (stance === 'crawl') {
    // Baby crawl: on hands and knees with the body horizontal,
    // supported by extended arms in front and bent legs underneath.
    // Limbs cycle in opposite-pair phase (left arm + right leg
    // forward, then right arm + left leg forward).
    //
    // Reaching arm: extends forward AND swings inward toward the
    // centreline so the hand ends up over/in front of the head, not
    // out at the shoulder line. Tucked arm stays at the body's
    // side. Same for the legs to keep the silhouette consistent.

    fig.torso.rotation.x = Math.PI / 2.4;
    fig.torso.position.set(0, 0.6, 0);

    fig.head.position.set(0, 0.7, 0.55);
    fig.head.rotation.x = -Math.PI / 5;

    // Shoulders pulled inboard a touch from the standing pose so
    // the inward arm swing puts the hand cleanly in front of the
    // head, not too far across the body.
    const shoulderHalf = TORSO_W / 2 - 0.04;
    const shoulderY = 0.65;
    const handForward = 0.18;
    fig.armL.position.set(-shoulderHalf, shoulderY, handForward);
    fig.armR.position.set(shoulderHalf, shoulderY, handForward);

    const hipY = 0.55;
    const hipBack = -0.2;
    fig.legL.position.set(-(LEG_W / 2 + 0.02), hipY, hipBack);
    fig.legR.position.set(LEG_W / 2 + 0.02, hipY, hipBack);

    // Forwardness factors per limb (cosine cycle, opposites alternate).
    const armForwardL = Math.cos(phase);
    const armForwardR = -armForwardL;
    const legForwardR = armForwardL; // right leg syncs with left arm
    const legForwardL = -armForwardL;

    const armBase = Math.PI / 2 + 0.05;
    const legBase = Math.PI / 2 + 0.05;
    // Bigger forward swing on the reaching half so the hand sweeps
    // out past the head, then tucks back toward the body.
    const armSwing = 0.5 * swing;
    const legSwing = 0.4 * swing;

    fig.armL.rotation.x = armBase + armForwardL * armSwing;
    fig.armR.rotation.x = armBase + armForwardR * armSwing;
    fig.legR.rotation.x = legBase + legForwardR * legSwing;
    fig.legL.rotation.x = legBase + legForwardL * legSwing;

    // Inward yaw: only the REACHING arm angles toward centreline
    // (the tucked arm stays at the body side). 0.95 rad (~54 deg)
    // pulls the hand cleanly across centre so it ends up over /
    // in front of the head, not at the shoulder line.
    const inwardYaw = 0.95;
    fig.armL.rotation.y = inwardYaw * Math.max(0, armForwardL);
    fig.armR.rotation.y = -inwardYaw * Math.max(0, armForwardR);
  } else if (stance === 'crouch') {
    fig.group.position.y = -0.35;
    fig.torso.rotation.x = 0.25;
    fig.legL.rotation.x = -0.6 + Math.sin(phase) * 0.35 * swing;
    fig.legR.rotation.x = -0.6 + Math.sin(phase + Math.PI) * 0.35 * swing;
    fig.armL.rotation.x = Math.sin(phase + Math.PI) * 0.4 * swing;
    fig.armR.rotation.x = Math.sin(phase) * 0.4 * swing;
  } else {
    // Walk / run.
    if (isRunning) fig.torso.rotation.x = 0.18;
    fig.legL.rotation.x = Math.sin(phase) * 0.7 * swing;
    fig.legR.rotation.x = Math.sin(phase + Math.PI) * 0.7 * swing;
    fig.armL.rotation.x = Math.sin(phase + Math.PI) * 0.7 * swing;
    fig.armR.rotation.x = Math.sin(phase) * 0.7 * swing;
  }

  const targetOpacity = hidden ? 0.35 : 1;
  for (const key of PARTS) {
    const part = fig[key] as THREE.Mesh;
    const mat = part.material as THREE.MeshStandardMaterial;
    if (mat.opacity !== targetOpacity) mat.opacity = targetOpacity;
  }
}

export function setFigurePosition(fig: BlockyFigure, x: number, z: number) {
  fig.group.position.x = x;
  fig.group.position.z = z;
}
