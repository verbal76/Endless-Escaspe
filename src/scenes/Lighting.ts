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
  // Stage 4 - early night
  {
    sky: 0x2a3148,
    fog: 0x2a3148,
    ambientColor: 0x4a5a78,
    ambientIntensity: 0.35,
    sunColor: 0x90a8d0,
    sunIntensity: 0.30,
  },
  // Stage 5+ - deep night
  {
    sky: 0x0d1426,
    fog: 0x0d1426,
    ambientColor: 0x303a55,
    ambientIntensity: 0.25,
    sunColor: 0x7088b8,
    sunIntensity: 0.20,
  },
];

export function getStageLighting(stage: number): StageLighting {
  const idx = Math.min(STAGES.length - 1, Math.max(0, stage - 1));
  return STAGES[idx];
}

export function applyStageLighting(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  stage: number,
) {
  const light = getStageLighting(stage);
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
