import * as THREE from 'three';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import type { Stance } from '../types/world';
import { character_d_OBJ } from '../../assets/characters/characterDObj';
import { character_g_OBJ } from '../../assets/characters/characterGObj';
import { character_j_OBJ } from '../../assets/characters/characterJObj';
import { getCharacterTexture } from '../util/textures';

// 3D-modeled character figure. Replaces the procedural BlockyFigure
// for player + guard so the silhouette reads as a real character
// (rounded head, separated legs, articulated arms) rather than a
// stack of cubes. Animation is preserved by walking the OBJ's
// named groups (head / torso / arm-left / arm-right / leg-left /
// leg-right - Kenney's standard rig naming) and parking each limb
// inside a pivot Group whose origin sits at the joint, so the
// existing updateModelFigurePose can rotate the limb groups exactly
// like it did the BlockyFigure box meshes.
//
// Textures (PNG) are NOT applied yet: the expo-gl + bare three.js
// stack has no DOM Image so TextureLoader.load() throws. We render
// solid per-limb colours instead. Future follow-up: bring in
// expo-three or a custom expo-gl uploader and apply texture-d.png /
// texture-g.png / texture-j.png to swap into the textured look the
// user uploaded.

export type ModelKind = 'd' | 'g' | 'j';

// Target overall figure height in world units. Kenney's character
// rig is ~2.5 m tall in OBJ-native units; the prison yard scene was
// authored around the prior BlockyFigure (~1.9 m tall), so we scale
// every loaded figure by TARGET_HEIGHT / native_height to keep the
// world feeling consistent (cover obstacles, camera framing, hide
// cone radii were all tuned at the smaller scale).
const TARGET_HEIGHT = 1.85;

export type ModelFigure = {
  group: THREE.Group;
  // Each limb is a wrapper Group with its origin at the joint. The
  // updateModelFigurePose tick rotates these wrappers and the inner
  // meshes follow.
  head: THREE.Object3D;
  torso: THREE.Object3D;
  armL: THREE.Object3D;
  armR: THREE.Object3D;
  legL: THREE.Object3D;
  legR: THREE.Object3D;
  // Resting positions for the wrapper groups so the pose-tick can
  // restore them between frames (crouch/walk modify them).
  rest: {
    head: THREE.Vector3;
    torso: THREE.Vector3;
    armL: THREE.Vector3;
    armR: THREE.Vector3;
    legL: THREE.Vector3;
    legR: THREE.Vector3;
  };
  // Resolved limb dimensions after scaling. GuardEquipment reads these
  // when attaching the flashlight + pistol so the props line up with
  // the actual hand position regardless of which character variant
  // was loaded.
  dims: {
    armH: number;       // shoulder-to-hand length
    shoulderX: number;  // |armR.position.x|
    shoulderY: number;  // armR.position.y
    scale: number;      // applied uniform scale (debug + reproduce)
  };
};

// Per-character colour palette. The OBJ-driven figure renders with
// solid per-limb colours (no texture); these were eyeballed off the
// uploaded Kenney textures so the three variants stay distinguishable
// at a glance during gameplay.
type Palette = {
  body: number;      // torso + limbs
  head: number;      // head colour (face area)
};

const PALETTES: Record<ModelKind, Palette> = {
  // Yellow prisoner uniform.
  d: { body: 0xf2c14a, head: 0xf2e8c8 },
  // Grey + red striped prisoner uniform. Solid grey here; stripes
  // require a texture pass to surface.
  g: { body: 0x99a0b0, head: 0xf2e8c8 },
  // Police-navy uniform with skin-tone head.
  j: { body: 0x2b3d68, head: 0xe8c697 },
};

const OBJ_BY_KIND: Record<ModelKind, string> = {
  d: character_d_OBJ,
  g: character_g_OBJ,
  j: character_j_OBJ,
};

// Module-level cache: parse each OBJ exactly once. The result is a
// THREE.Group whose direct children are the named-group meshes. We
// clone these meshes per figure so rotations don't share state.
type ParsedTemplate = {
  parts: Record<string, { geometry: THREE.BufferGeometry; bbox: THREE.Box3 }>;
};

const TEMPLATES: Partial<Record<ModelKind, ParsedTemplate>> = {};

function parseTemplate(kind: ModelKind): ParsedTemplate {
  const cached = TEMPLATES[kind];
  if (cached) return cached;
  const loader = new OBJLoader();
  const root = loader.parse(OBJ_BY_KIND[kind]);
  const parts: ParsedTemplate['parts'] = {};
  root.traverse((node) => {
    // OBJLoader emits one Mesh per `g` group, with the group name on
    // node.name. We capture the geometry + its bbox so each figure
    // instance can clone the geometry but pivot it correctly.
    if ((node as THREE.Mesh).isMesh && node.name) {
      const mesh = node as THREE.Mesh;
      const geo = mesh.geometry as THREE.BufferGeometry;
      geo.computeBoundingBox();
      parts[node.name] = {
        geometry: geo,
        bbox: geo.boundingBox!.clone(),
      };
    }
  });
  const template: ParsedTemplate = { parts };
  TEMPLATES[kind] = template;
  return template;
}

// Build a wrapper Group whose origin sits at the joint we want to
// pivot around. The mesh is translated so its joint-aligned vertex
// lands at the wrapper's origin; rotating the wrapper then swings
// the limb around the correct axis.
//
// `jointSide`:
//   'top'    - shoulder / hip pivot (limbs swing from the body)
//   'center' - torso, head: pivot at the geometric centre
function buildLimb(
  geometry: THREE.BufferGeometry,
  bbox: THREE.Box3,
  material: THREE.Material,
  jointSide: 'top' | 'center',
): THREE.Group {
  const wrapper = new THREE.Group();
  const cx = (bbox.min.x + bbox.max.x) / 2;
  const cz = (bbox.min.z + bbox.max.z) / 2;
  const cy = (bbox.min.y + bbox.max.y) / 2;
  const jointY = jointSide === 'top' ? bbox.max.y : cy;
  wrapper.position.set(cx, jointY, cz);

  // Clone the geometry rather than translating in place so the
  // template stays untouched for future figures.
  const cloned = geometry.clone();
  cloned.translate(-cx, -jointY, -cz);
  const mesh = new THREE.Mesh(cloned, material);
  wrapper.add(mesh);
  return wrapper;
}

export function createModelFigure(kind: ModelKind): ModelFigure {
  const template = parseTemplate(kind);
  const palette = PALETTES[kind];

  // Try the textured material first. If the asset preload couldn't
  // resolve the image (network glitch on first launch, etc.) we fall
  // back to the solid-colour palette so the figure still renders
  // recognisably. One material is shared across every limb because
  // the OBJ's UVs map all body parts onto a single texture sheet.
  const tex = getCharacterTexture(kind);
  const sharedMat = tex
    ? new THREE.MeshStandardMaterial({
        map: tex,
        roughness: 0.7,
        // Bump emissive map slightly so the figure stays legible
        // against the dark night palette without dimming the texture
        // brightness in daylight.
        emissive: 0xffffff,
        emissiveMap: tex,
        emissiveIntensity: 0.20,
      })
    : new THREE.MeshStandardMaterial({
        color: palette.body,
        emissive: palette.body,
        emissiveIntensity: 0.18,
        roughness: 0.7,
      });
  const bodyMat = sharedMat;
  const headMat = sharedMat;

  const group = new THREE.Group();

  // Compute the figure's native total height across every part bbox so
  // the uniform scale below can normalise to TARGET_HEIGHT.
  let nativeMinY = Infinity;
  let nativeMaxY = -Infinity;
  for (const key of Object.keys(template.parts)) {
    const bb = template.parts[key].bbox;
    if (bb.min.y < nativeMinY) nativeMinY = bb.min.y;
    if (bb.max.y > nativeMaxY) nativeMaxY = bb.max.y;
  }
  const nativeHeight = Math.max(0.5, nativeMaxY - nativeMinY);
  const scale = TARGET_HEIGHT / nativeHeight;

  // Torso: pivot at centre so a slight forward-lean (running) rotates
  // around the chest rather than a foot.
  const torso = buildLimb(
    template.parts.torso.geometry,
    template.parts.torso.bbox,
    bodyMat,
    'center',
  );
  group.add(torso);

  // Head: pivot at the neck (bottom of head bbox) so the head can
  // tilt without lifting off the shoulders.
  const headPart = template.parts.head;
  const headWrapper = new THREE.Group();
  const hcx = (headPart.bbox.min.x + headPart.bbox.max.x) / 2;
  const hcz = (headPart.bbox.min.z + headPart.bbox.max.z) / 2;
  const hcy = headPart.bbox.min.y;
  headWrapper.position.set(hcx, hcy, hcz);
  const headGeo = headPart.geometry.clone();
  headGeo.translate(-hcx, -hcy, -hcz);
  headWrapper.add(new THREE.Mesh(headGeo, headMat));
  group.add(headWrapper);

  // Limbs pivot at the top edge of their bbox (shoulder for arms,
  // hip for legs).
  const armL = buildLimb(
    template.parts['arm-left'].geometry,
    template.parts['arm-left'].bbox,
    bodyMat,
    'top',
  );
  const armR = buildLimb(
    template.parts['arm-right'].geometry,
    template.parts['arm-right'].bbox,
    bodyMat,
    'top',
  );
  const legL = buildLimb(
    template.parts['leg-left'].geometry,
    template.parts['leg-left'].bbox,
    bodyMat,
    'top',
  );
  const legR = buildLimb(
    template.parts['leg-right'].geometry,
    template.parts['leg-right'].bbox,
    bodyMat,
    'top',
  );
  group.add(armL);
  group.add(armR);
  group.add(legL);
  group.add(legR);

  // Apply the uniform scale to the root so every child + their nested
  // wrappers shrink together. Scaling here (rather than baking into
  // each geometry) keeps the wrapper pivot positions correct under a
  // single transform.
  group.scale.setScalar(scale);

  // Capture rest positions BEFORE scaling, since updateModelFigurePose
  // restores wrapper positions in their parent (group)'s local frame.
  // The group's scale is applied on top by three.js automatically.
  const armRBb = template.parts['arm-right'].bbox;
  const armH = armRBb.max.y - armRBb.min.y;

  return {
    group,
    head: headWrapper,
    torso,
    armL,
    armR,
    legL,
    legR,
    rest: {
      head: headWrapper.position.clone(),
      torso: torso.position.clone(),
      armL: armL.position.clone(),
      armR: armR.position.clone(),
      legL: legL.position.clone(),
      legR: legR.position.clone(),
    },
    dims: {
      armH,
      shoulderX: Math.abs(armR.position.x),
      shoulderY: armR.position.y,
      scale,
    },
  };
}

export type ModelFigurePoseInput = {
  stance: Stance;
  speed: number;
  isRunning: boolean;
  facing: number;
  time: number;
  hidden?: boolean;
  // Stun progress 0..1 across the stunTimer's lifetime, where 0 = the
  // moment the crowbar landed and 1 = the moment the guard wakes up.
  // When > 0 the pose tick overrides walk / crouch with a knockout
  // animation (drop to crouch, flatten face-down, hold flat, rise to
  // crouch, rise to stand). Undefined / 0 means "not stunned, animate
  // normally". Caller computes this as 1 - stunTimer / CROWBAR_STUN_DURATION.
  stunProgress?: number;
};

function resetPose(fig: ModelFigure) {
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

// Square-wave-with-fast-transition pose blend, ported from
// BlockyFigure so the crouch/crawl animation reads identically.
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

// Knockout animation phases driven by stunProgress in [0, 1].
//
//   0.00 - 0.18  drop from standing into a crouch (knees buckle)
//   0.18 - 0.32  pitch forward from crouch onto face-down flat
//   0.32 - 0.68  hold flat (most of the stun)
//   0.68 - 0.82  push back up from flat to crouch
//   0.82 - 1.00  rise from crouch to stand
//
// Each phase returns a (crouchAmount, flatAmount) blend so the pose
// can be built once and animated over the same body.
function stunPhase(p: number): { crouchAmount: number; flatAmount: number } {
  if (p <= 0) return { crouchAmount: 0, flatAmount: 0 };
  if (p >= 1) return { crouchAmount: 0, flatAmount: 0 };
  if (p < 0.18) {
    // Stand -> crouch
    const t = p / 0.18;
    return { crouchAmount: t, flatAmount: 0 };
  }
  if (p < 0.32) {
    // Crouch -> flat
    const t = (p - 0.18) / 0.14;
    return { crouchAmount: 1 - t, flatAmount: t };
  }
  if (p < 0.68) {
    // Hold flat
    return { crouchAmount: 0, flatAmount: 1 };
  }
  if (p < 0.82) {
    // Flat -> crouch
    const t = (p - 0.68) / 0.14;
    return { crouchAmount: t, flatAmount: 1 - t };
  }
  // Crouch -> stand
  const t = (p - 0.82) / 0.18;
  return { crouchAmount: 1 - t, flatAmount: 0 };
}

// Apply the knockout pose to the figure. Mutates positions / rotations
// in place; the caller has already run resetPose.
function applyStunPose(fig: ModelFigure, crouchAmount: number, flatAmount: number) {
  // Crouch lean: torso pitches forward, head drops. Reuses the same
  // pivot tuning as the regular crouch animation.
  const crouchTilt = (Math.PI / 2.4) * crouchAmount;
  const flatTilt = (Math.PI / 2) * flatAmount;
  fig.torso.rotation.x = crouchTilt + flatTilt;
  // Drop the torso pivot down so the figure approaches the ground as
  // it folds forward. flatAmount drops it the rest of the way.
  const torsoDrop =
    crouchAmount * 0.4 + flatAmount * (fig.rest.torso.y - 0.15);
  fig.torso.position.y = Math.max(0.15, fig.rest.torso.y - torsoDrop);
  fig.torso.position.z = 0.05 * crouchAmount + 0.25 * flatAmount;

  fig.head.rotation.x = -Math.PI / 5 * crouchAmount - Math.PI / 6 * flatAmount;
  fig.head.position.z = 0.25 * crouchAmount + 0.40 * flatAmount;
  fig.head.position.y = fig.rest.head.y - 0.10 * flatAmount;

  // Limbs splay outward when flat. Arms hang loose; legs sprawl back.
  const armReachX = (Math.PI / 3) * crouchAmount + (Math.PI / 4) * flatAmount;
  const legReachX =
    (-Math.PI / 2 + 0.20) * crouchAmount + (-Math.PI / 6) * flatAmount;
  fig.armL.rotation.x = armReachX;
  fig.armR.rotation.x = armReachX;
  fig.armL.rotation.y = -0.4 * flatAmount;
  fig.armR.rotation.y = 0.4 * flatAmount;
  fig.legL.rotation.x = legReachX;
  fig.legR.rotation.x = legReachX;
  fig.legL.rotation.y = 0.2 * flatAmount;
  fig.legR.rotation.y = -0.2 * flatAmount;
}

export function updateModelFigurePose(
  fig: ModelFigure,
  input: ModelFigurePoseInput,
) {
  const { stance, speed, isRunning, facing, time, hidden, stunProgress } = input;
  fig.group.rotation.y = -facing + Math.PI / 2;
  resetPose(fig);

  // Stun knockout takes priority over every other pose: the AI froze
  // the guard's movement, so the figure shouldn't be walking / aiming.
  if (stunProgress !== undefined && stunProgress > 0 && stunProgress < 1) {
    const { crouchAmount, flatAmount } = stunPhase(stunProgress);
    applyStunPose(fig, crouchAmount, flatAmount);
    void hidden;
    return;
  }

  const cycleHz = isRunning ? 4.5 : 2.4;
  const phase = time * cycleHz * 2 * Math.PI;
  const swing = Math.min(1, speed / 4) * (isRunning ? 0.9 : 0.55);

  if (stance === 'crouch') {
    // On-hands-and-knees crouch: torso tipped forward, head dropped,
    // limbs reaching alternately. Mirrors BlockyFigure's crouch tuning
    // so the player and guard animate identically across the swap.
    fig.torso.rotation.x = Math.PI / 2.4;
    // Pull the torso pivot down + slightly forward so the figure
    // hugs the ground instead of pivoting around the chest mid-air.
    fig.torso.position.y = Math.max(0.2, fig.rest.torso.y - 0.4);
    fig.torso.position.z = 0.05;
    fig.head.rotation.x = -Math.PI / 5;
    fig.head.position.z = 0.25;

    const aRaw = poseA_amount(phase);
    const a = swing > 0.05 ? aRaw : 1;
    const b = 1 - a;

    const ARM_REACH_X = Math.PI / 3;
    const ARM_REACH_OUTWARD_Y = 0.55;
    fig.armL.rotation.x = a * ARM_REACH_X;
    fig.armR.rotation.x = b * ARM_REACH_X;
    fig.armL.rotation.y = -a * ARM_REACH_OUTWARD_Y;
    fig.armR.rotation.y = b * ARM_REACH_OUTWARD_Y;

    const LEG_REACH_X = -Math.PI / 2 + 0.20;
    const LEG_REACH_OUTWARD_Y = 0.40;
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

  void hidden;
}

export function setModelFigurePosition(
  fig: ModelFigure,
  x: number,
  z: number,
) {
  fig.group.position.x = x;
  fig.group.position.z = z;
}
