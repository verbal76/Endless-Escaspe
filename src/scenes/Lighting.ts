import * as THREE from 'three';

// Stage-driven sky / ambient progression. Stage 1 is bright daylight;
// each successive stage darkens and warms toward dusk and then night.
// The renderer is built once with daylight defaults; this module
// re-tints the scene + camera background to match the current stage.

export type StageLighting = {
  sky: number;
  fog: number;
  ambientColor: number;
  ambientIntensity: number;
  sunColor: number;
  sunIntensity: number;
};

const STAGES: StageLighting[] = [
  // Stage 1 - bright daylight
  {
    sky: 0x88b4d8,
    fog: 0x88b4d8,
    ambientColor: 0xc8d4e0,
    ambientIntensity: 0.75,
    sunColor: 0xfff6dd,
    sunIntensity: 1.0,
  },
  // Stage 2 - late afternoon
  {
    sky: 0xb89878,
    fog: 0xb89878,
    ambientColor: 0xd4bfa0,
    ambientIntensity: 0.65,
    sunColor: 0xffd9a0,
    sunIntensity: 0.85,
  },
  // Stage 3 - dusk
  {
    sky: 0x7a5566,
    fog: 0x7a5566,
    ambientColor: 0x806f8a,
    ambientIntensity: 0.50,
    sunColor: 0xff9a70,
    sunIntensity: 0.55,
  },
  // Stage 4 - early night. Bumped a touch so obstacle colour is still
  // legible against the ground; the prior 0.35/0.30 crushed boulders
  // and dark-blue cover into near-silhouettes.
  {
    sky: 0x2a3148,
    fog: 0x2a3148,
    ambientColor: 0x5a6c8e,
    ambientIntensity: 0.55,
    sunColor: 0xa0b8de,
    sunIntensity: 0.45,
  },
  // Stage 5+ - deep night. Brighter than a strict simulation would
  // call for: silhouettes have to remain readable enough that the
  // player can plan around obstacles. Bumped again from 0.55/0.45
  // because cover/crate/boulder colours were still bottoming out
  // on the device. Combined with the +emissive bump on every obstacle
  // material this is the brightest night will get.
  {
    sky: 0x1c2640,
    fog: 0x1c2640,
    ambientColor: 0x6478a0,
    ambientIntensity: 0.75,
    sunColor: 0xb4c4e8,
    sunIntensity: 0.60,
  },
];

// Stages cycle dawn -> day -> dusk -> night and then loop, with each
// loop trending darker on the night phases so late-game nights are
// genuinely dim. Indexes 0..4 in STAGES correspond to one cycle;
// past stage 5 we cycle through them and then bias toward darker
// indices via a tier offset.
export function getStageLighting(stage: number): StageLighting {
  const s = Math.max(1, stage | 0);
  // Late-game tier bias: after the first cycle we lean later in the
  // table so brightness keeps trending down.
  const tier = Math.min(2, Math.floor((s - 1) / 5));
  const cyclePos = (s - 1) % 5;
  const idx = Math.min(STAGES.length - 1, cyclePos + tier);
  return STAGES[idx];
}

// 8-bit-per-channel hex colour lerp. Output is the same packed-int
// form the rest of the lighting code uses.
function lerpColor(a: number, b: number, t: number): number {
  const ar = (a >> 16) & 0xff;
  const ag = (a >> 8) & 0xff;
  const ab = a & 0xff;
  const br = (b >> 16) & 0xff;
  const bg = (b >> 8) & 0xff;
  const bb = b & 0xff;
  const r = Math.round(ar + (br - ar) * t);
  const g = Math.round(ag + (bg - ag) * t);
  const bv = Math.round(ab + (bb - ab) * t);
  return (r << 16) | (g << 8) | bv;
}

function lerpStage(a: StageLighting, b: StageLighting, t: number): StageLighting {
  return {
    sky: lerpColor(a.sky, b.sky, t),
    fog: lerpColor(a.fog, b.fog, t),
    ambientColor: lerpColor(a.ambientColor, b.ambientColor, t),
    ambientIntensity: a.ambientIntensity + (b.ambientIntensity - a.ambientIntensity) * t,
    sunColor: lerpColor(a.sunColor, b.sunColor, t),
    sunIntensity: a.sunIntensity + (b.sunIntensity - a.sunIntensity) * t,
  };
}

// Cycle through the five STAGES palettes mirrored over a full
// CYCLE_DURATION_S (bright -> dark -> bright -> dark -> ...). At any
// time within the cycle the result is a smooth blend between two
// adjacent palettes - colours and intensities both lerp - so the
// world fades gradually instead of snapping between presets.
const CYCLE_DURATION_S = 180; // 3 minutes per full bright->dark->bright loop
export function getCycleLighting(cycleTimeS: number): StageLighting {
  // Wrap the time into [0, CYCLE_DURATION_S) and normalise to t01.
  const wrapped = ((cycleTimeS % CYCLE_DURATION_S) + CYCLE_DURATION_S) % CYCLE_DURATION_S;
  const t01 = wrapped / CYCLE_DURATION_S;
  // Mirror: 0..0.5 maps to phase 0..1 (bright -> dark), 0.5..1 maps
  // to phase 1..0 (dark -> bright). The eye sees a smooth sun-up
  // sun-down loop instead of a snap-back at the loop boundary.
  const phase = t01 < 0.5 ? t01 * 2 : (1 - t01) * 2;
  // Map phase to a fractional palette index across the STAGES table.
  const idx = phase * (STAGES.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.min(STAGES.length - 1, lo + 1);
  const f = idx - lo;
  return lerpStage(STAGES[lo], STAGES[hi], f);
}

// Apply a fully-resolved StageLighting struct to the scene. Used by
// both the per-frame cycle path and the legacy applyStageLighting
// entry point.
function applyResolved(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  light: StageLighting,
) {
  renderer.setClearColor(light.sky, 1);
  if (scene.fog && scene.fog instanceof THREE.Fog) {
    scene.fog.color.setHex(light.fog);
  }
  scene.traverse((node) => {
    if ((node as THREE.AmbientLight).isAmbientLight) {
      const a = node as THREE.AmbientLight;
      a.color.setHex(light.ambientColor);
      a.intensity = light.ambientIntensity;
    } else if ((node as THREE.DirectionalLight).isDirectionalLight) {
      const d = node as THREE.DirectionalLight;
      d.color.setHex(light.sunColor);
      d.intensity = light.sunIntensity;
    }
  });
}

export function applyStageLighting(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  stage: number,
) {
  applyResolved(renderer, scene, getStageLighting(stage));
}

// Per-frame entry point for the day/night cycle. Resolves the
// blended palette for the supplied cycleTime and writes it into the
// renderer + scene lights. Cheap (just lerps + uniform updates), so
// it can run every frame without measurable cost.
export function applyDynamicLighting(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  cycleTimeS: number,
) {
  applyResolved(renderer, scene, getCycleLighting(cycleTimeS));
}
