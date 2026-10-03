import * as THREE from 'three';

// Per-stage lighting / environment mood. Each stage gets ONE mood for
// its whole duration (the old 60 s rolling day/night loop is gone), so
// visibility never swings mid-run. Night moods are a deliberate
// difficulty feature: guards see less far in the dark, which makes
// floodlights and searchlights matter more.

export type MoodName = 'day' | 'afternoon' | 'dusk' | 'night' | 'deepNight';

export type StageLighting = {
  mood: MoodName;
  // Clear colour and fog colour - both the horizon colour, so the
  // ground melts into the base of the sky dome with no seam.
  sky: number;
  fog: number;
  fogNear: number;
  fogFar: number;
  // Sky dome gradient (Backdrop): horizon at eye level up to zenith.
  zenith: number;
  horizon: number;
  // Distant ridge silhouettes (far / near layer) and their snow line.
  ridgeFar: number;
  ridgeNear: number;
  snow: number;
  ambientColor: number;
  ambientIntensity: number;
  // Hemisphere fill: sky colour from above, ground bounce from below.
  hemiSky: number;
  hemiGround: number;
  hemiIntensity: number;
  sunColor: number;
  sunIntensity: number;
  // 0 = full daylight .. 1 = deepest night. Drives backdrop tinting.
  darkness: number;
  // Multiplier on guard vision range for this mood.
  visionMul: number;
};

const MOODS: Record<MoodName, StageLighting> = {
  day: {
    mood: 'day',
    sky: 0xcfe2ee,
    fog: 0xcfe2ee,
    fogNear: 60,
    fogFar: 560,
    zenith: 0x4a7fc1,
    horizon: 0xcfe2ee,
    ridgeFar: 0x8fa6c0,
    ridgeNear: 0x5c7390,
    snow: 0xf4f7fb,
    ambientColor: 0xd0dae6,
    ambientIntensity: 1.0,
    hemiSky: 0xcfe2ff,
    hemiGround: 0x7a6a50,
    hemiIntensity: 1.3,
    sunColor: 0xfff4dc,
    sunIntensity: 2.1,
    darkness: 0,
    visionMul: 1.0,
  },
  afternoon: {
    mood: 'afternoon',
    sky: 0xf3d2a2,
    fog: 0xf3d2a2,
    fogNear: 55,
    fogFar: 520,
    zenith: 0x6f8fc0,
    horizon: 0xf3d2a2,
    ridgeFar: 0xb89a94,
    ridgeNear: 0x7d6a73,
    snow: 0xfff1dc,
    ambientColor: 0xe0c8a8,
    ambientIntensity: 0.9,
    hemiSky: 0xf5dcc0,
    hemiGround: 0x7a5c48,
    hemiIntensity: 1.2,
    sunColor: 0xffd9a0,
    sunIntensity: 1.9,
    darkness: 0.2,
    visionMul: 1.0,
  },
  dusk: {
    mood: 'dusk',
    sky: 0xc47a6c,
    fog: 0xc47a6c,
    fogNear: 40,
    fogFar: 420,
    zenith: 0x2e2a52,
    horizon: 0xc47a6c,
    ridgeFar: 0x7b5670,
    ridgeNear: 0x4a3a55,
    snow: 0xf2c7c0,
    ambientColor: 0x9a88a8,
    ambientIntensity: 0.7,
    hemiSky: 0xc89aa8,
    hemiGround: 0x3a2c30,
    hemiIntensity: 1.0,
    sunColor: 0xff9a70,
    sunIntensity: 1.3,
    darkness: 0.5,
    visionMul: 0.95,
  },
  night: {
    mood: 'night',
    sky: 0x2a3a5c,
    fog: 0x2a3a5c,
    fogNear: 30,
    fogFar: 360,
    zenith: 0x0b1226,
    horizon: 0x2a3a5c,
    ridgeFar: 0x24324f,
    ridgeNear: 0x18223a,
    snow: 0x8ea3c8,
    ambientColor: 0x7288b0,
    ambientIntensity: 0.4,
    hemiSky: 0x5a70a0,
    hemiGround: 0x1a1c22,
    hemiIntensity: 0.7,
    sunColor: 0xa8bee6,
    sunIntensity: 0.5,
    darkness: 0.85,
    visionMul: 0.88,
  },
  deepNight: {
    mood: 'deepNight',
    sky: 0x1a2540,
    fog: 0x1a2540,
    fogNear: 24,
    fogFar: 300,
    zenith: 0x060a16,
    horizon: 0x1a2540,
    ridgeFar: 0x18223a,
    ridgeNear: 0x0f1628,
    snow: 0x5d6f94,
    ambientColor: 0x6a80aa,
    ambientIntensity: 0.34,
    hemiSky: 0x4a5f8f,
    hemiGround: 0x16181e,
    hemiIntensity: 0.6,
    sunColor: 0x9fb2dc,
    sunIntensity: 0.4,
    darkness: 1,
    visionMul: 0.82,
  },
};

const ORDER: MoodName[] = ['day', 'afternoon', 'dusk', 'night', 'deepNight'];

// Deterministic mood for a stage. Stages step through the day in
// blocks of five and each later block starts darker, so early stages
// are mostly daylight and late stages mostly night.
export function getStageLighting(stage: number): StageLighting {
  const s = Math.max(1, stage | 0);
  const tier = Math.min(2, Math.floor((s - 1) / 5));
  const cyclePos = (s - 1) % 5;
  const idx = Math.min(ORDER.length - 1, cyclePos + tier);
  return MOODS[ORDER[idx]];
}

export type LightRig = {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  ambient: THREE.AmbientLight;
  hemi: THREE.HemisphereLight;
  sun: THREE.DirectionalLight;
};

// Apply a mood to the cached lights, clear colour and fog. Called once
// per scene (re)build - never per frame.
export function applyLighting(rig: LightRig, light: StageLighting) {
  rig.renderer.setClearColor(light.sky, 1);
  if (rig.scene.fog && rig.scene.fog instanceof THREE.Fog) {
    rig.scene.fog.color.setHex(light.fog);
    rig.scene.fog.near = light.fogNear;
    rig.scene.fog.far = light.fogFar;
  }
  rig.ambient.color.setHex(light.ambientColor);
  rig.ambient.intensity = light.ambientIntensity;
  rig.hemi.color.setHex(light.hemiSky);
  rig.hemi.groundColor.setHex(light.hemiGround);
  rig.hemi.intensity = light.hemiIntensity;
  rig.sun.color.setHex(light.sunColor);
  rig.sun.intensity = light.sunIntensity;
}

export function applyStageLighting(rig: LightRig, stage: number): StageLighting {
  const l = getStageLighting(stage);
  applyLighting(rig, l);
  return l;
}
