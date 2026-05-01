import * as THREE from 'three';
import type { BlockyFigure } from './BlockyFigure';
import { VISION_CONE_DEG } from '../util/geometry';
import { markShared } from '../util/dispose';

// Equipment for a guard figure: a flashlight in the right hand
// (whose visible beam represents the vision cone) and a pistol in
// the left hand (origin point for projectiles).
//
// The arms are forced into an "extended forward" pose for guards
// (see Game.tsx render hook) so the equipment + beam stay aimed
// reliably down the guard's facing direction instead of swinging
// with the walk cycle.

const FLASHLIGHT_BODY_W = 0.10;
const FLASHLIGHT_BODY_H = 0.10;
const FLASHLIGHT_BODY_L = 0.20;

const PISTOL_W = 0.10;
const PISTOL_H = 0.14;
const PISTOL_L = 0.22;

const FLASHLIGHT_MAT = new THREE.MeshStandardMaterial({
  color: 0x303035,
  roughness: 0.4,
  metalness: 0.5,
});
const PISTOL_MAT = new THREE.MeshStandardMaterial({
  color: 0x202024,
  roughness: 0.3,
  metalness: 0.6,
});
const BEAM_MAT = new THREE.MeshBasicMaterial({
  color: 0xffe385,
  transparent: true,
  opacity: 0.18,
  depthWrite: false,
  side: THREE.DoubleSide,
});

[FLASHLIGHT_MAT, PISTOL_MAT, BEAM_MAT].forEach((m) => markShared(m));

export type GuardEquipment = {
  flashlight: THREE.Mesh;
  beam: THREE.Mesh;
  pistol: THREE.Mesh;
};

// Arm length used by BlockyFigure for the limb mesh (the arm
// geometry is pivoted at the top, so the hand sits at local y=-ARM_H
// inside the arm's frame).
const ARM_H = 0.62;

function buildBeam(visionRange: number): THREE.Mesh {
  const halfAngle = (VISION_CONE_DEG * Math.PI) / 180 / 2;
  const baseR = Math.tan(halfAngle) * visionRange;
  // ConeGeometry: apex at +Y/2, base at -Y/2. We want apex at the
  // origin (the flashlight tip) and the base extending along +Z so
  // the beam points "forward" in the parent's frame. rotateX(-PI/2)
  // takes the -Y end (the base) to +Z; rotateX(+PI/2) sends it to
  // -Z, which is what was happening before and produced a beam that
  // poured out behind the guard.
  const geo = new THREE.ConeGeometry(baseR, visionRange, 16, 1, true);
  geo.translate(0, -visionRange / 2, 0);
  geo.rotateX(-Math.PI / 2);
  return new THREE.Mesh(geo, BEAM_MAT);
}

export function attachGuardEquipment(
  figure: BlockyFigure,
  visionRange: number,
): GuardEquipment {
  // Right arm: flashlight body mounted at the hand, pointing forward
  // (visual prop only; the actual beam is parented to the figure
  // root - see below).
  const flashlight = new THREE.Mesh(
    new THREE.BoxGeometry(FLASHLIGHT_BODY_W, FLASHLIGHT_BODY_H, FLASHLIGHT_BODY_L),
    FLASHLIGHT_MAT,
  );
  flashlight.position.set(0, -ARM_H, FLASHLIGHT_BODY_L / 2 + 0.02);
  figure.armR.add(flashlight);

  // BEAM: parented to the figure GROUP root (not the swinging arm)
  // so it stays aimed reliably along the guard's facing direction
  // even though the flashlight hand-pose is fixed by poseGuardArms.
  // Apex sits at the FLASHLIGHT tip so the cone visually pours out
  // of the device the guard is holding.
  //
  // With armR forced into rotation.x = -PI/2 (extended forward) by
  // poseGuardArms, the flashlight ends up at roughly:
  //   armR.position(x = TORSO_W/2 + ARM_W/2 + 0.02 ~= 0.4)
  // and after the rotation, the hand sits at +Z = ARM_H ~= 0.62
  // in front of the shoulder, with the flashlight body extending
  // FLASHLIGHT_BODY_L further forward. So the flashlight tip is
  // around (0.4, 1.5 + something small, ARM_H + FLASHLIGHT_BODY_L).
  // Anchor the beam apex there in figure-local space.
  // Numbers below are the resolved figure pivots from BlockyFigure
  // constants (TORSO_W=0.62, ARM_W=0.18, ARM_H=0.62, SHOULDER_Y=1.5);
  // hardcoding rather than re-importing keeps this module self-
  // contained.
  const beam = buildBeam(visionRange);
  beam.position.set(
    0.42,                          // shoulder X (right side)
    1.55,                          // hand height after extending arm
    ARM_H + FLASHLIGHT_BODY_L,    // forward of shoulder by arm length + flashlight tip
  );
  figure.group.add(beam);

  // Left arm: pistol at the hand.
  const pistol = new THREE.Mesh(
    new THREE.BoxGeometry(PISTOL_W, PISTOL_H, PISTOL_L),
    PISTOL_MAT,
  );
  pistol.position.set(0, -ARM_H, PISTOL_L / 2 + 0.02);
  figure.armL.add(pistol);

  return { flashlight, beam, pistol };
}

// Force a guard's arms into the "extended forward" pose so the
// flashlight + pistol point reliably down the figure's facing
// direction rather than swinging with the walk cycle.
export function poseGuardArms(figure: BlockyFigure) {
  // Rotate each arm forward (around X) so it points along +Z. -PI/2
  // around X makes a downward arm point along +Z (forward).
  figure.armR.rotation.set(-Math.PI / 2, 0, 0);
  figure.armL.rotation.set(-Math.PI / 2, 0, 0);
}
