import * as THREE from 'three';
import type { ModelFigure } from './ModelFigure';
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
const BEAM_MAT = new THREE.ShaderMaterial({
  transparent: true,
  side: THREE.DoubleSide,
  depthWrite: false,
  uniforms: {
    uColor: { value: new THREE.Color(0xffe385) },
    uMaxOpacity: { value: 0.22 },
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  // ConeGeometry: vUv.y = 1 at the apex (flashlight tip, brightest)
  // and vUv.y = 0 at the base (far end of the throw, where the beam
  // should fade to invisible rather than stop at a hard rim).
  fragmentShader: `
    uniform vec3 uColor;
    uniform float uMaxOpacity;
    varying vec2 vUv;
    void main() {
      float farFade = smoothstep(0.0, 0.55, vUv.y);
      float nearFade = 1.0 - smoothstep(0.96, 1.0, vUv.y);
      gl_FragColor = vec4(uColor, farFade * nearFade * uMaxOpacity);
    }
  `,
});

[FLASHLIGHT_MAT, PISTOL_MAT, BEAM_MAT].forEach((m) => markShared(m));

export type GuardEquipment = {
  flashlight: THREE.Mesh;
  beam: THREE.Mesh;
  pistol: THREE.Mesh;
};

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
  figure: ModelFigure,
  visionRange: number,
): GuardEquipment {
  // Pull the resolved arm geometry from the figure so positioning
  // tracks whatever character variant is loaded (Kenney models all
  // share a rig but limb dimensions can shift slightly between
  // textures; this also lets future figure variants drop in cleanly).
  const { armH, shoulderX, shoulderY } = figure.dims;

  // Right arm: flashlight body mounted at the hand, pointing forward.
  // Position is in armR's local frame (origin at the shoulder pivot,
  // arm hanging in -Y), so the hand sits at local y=-armH.
  const flashlight = new THREE.Mesh(
    new THREE.BoxGeometry(FLASHLIGHT_BODY_W, FLASHLIGHT_BODY_H, FLASHLIGHT_BODY_L),
    FLASHLIGHT_MAT,
  );
  flashlight.position.set(0, -armH, FLASHLIGHT_BODY_L / 2 + 0.02);
  figure.armR.add(flashlight);

  // BEAM: parented to the figure GROUP root (not the swinging arm)
  // so it stays aimed reliably along the guard's facing direction
  // even though the flashlight hand-pose is fixed by poseGuardArms.
  // After poseGuardArms rotates armR by -PI/2 around X, the hand
  // (originally at local (0, -armH, 0)) ends up at +Z = armH from
  // the shoulder, so the flashlight tip sits at world:
  //   (shoulderX, shoulderY, armH + FLASHLIGHT_BODY_L).
  const beam = buildBeam(visionRange);
  beam.position.set(
    shoulderX,
    shoulderY,
    armH + FLASHLIGHT_BODY_L,
  );
  figure.group.add(beam);

  // Left arm: pistol at the hand.
  const pistol = new THREE.Mesh(
    new THREE.BoxGeometry(PISTOL_W, PISTOL_H, PISTOL_L),
    PISTOL_MAT,
  );
  pistol.position.set(0, -armH, PISTOL_L / 2 + 0.02);
  figure.armL.add(pistol);

  return { flashlight, beam, pistol };
}

// Force a guard's arms into the "extended forward" pose so the
// flashlight + pistol point reliably down the figure's facing
// direction rather than swinging with the walk cycle.
export function poseGuardArms(figure: ModelFigure) {
  // Rotate each arm forward (around X) so it points along +Z. -PI/2
  // around X makes a downward arm point along +Z (forward).
  figure.armR.rotation.set(-Math.PI / 2, 0, 0);
  figure.armL.rotation.set(-Math.PI / 2, 0, 0);
}
