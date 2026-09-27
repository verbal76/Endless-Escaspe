import * as THREE from 'three';

// Per-stage lighting / environment mood. Each stage gets ONE mood for
// its whole duration (the old 60 s rolling day/night loop is gone), so
// visibility never swings mid-run. Night moods are a deliberate
// difficulty feature: guards see less far in the dark, which makes
// floodlights and searchlights matter more.

export type MoodName = 'day' | 'afternoon' | 'dusk' | 'night' | 'deepNight';

export type StageLighting = {
  mood: MoodName;
  sky: number;
  fog: number;
  fogNear: number;
  fogFar: number;
  ambientColor: number;
  ambientIntensity: number;
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
    sky: 0x88b4d8,
    fog: 0x9cc0dd,
    fogNear: 70,
    fogFar: 800,
    ambientColor: 0xd0dae6,
    ambientIntensity: 1.05,
    sunColor: 0xfff4dc,
    sunIntensity: 1.35,
    darkness: 0,
    visionMul: 1.0,
  },
  afternoon: {
    mood: 'afternoon',
    sky: 0xc9a27c,
    fog: 0xc7a585,
    fogNear: 60,
    fogFar: 700,
    ambientColor: 0xe0c8a8,
    ambientIntensity: 0.95,
    sunColor: 0xffd9a0,
    sunIntensity: 1.15,
    darkness: 0.2,
    visionMul: 1.0,
  },
  dusk: {
    mood: 'dusk',
    sky: 0x7a5566,
    fog: 0x6e5262,
    fogNear: 45,
    fogFar: 520,
    ambientColor: 0x9a88a8,
    ambientIntensity: 0.85,
    sunColor: 0xff9a70,
    sunIntensity: 0.8,
    darkness: 0.5,
    visionMul: 0.95,
  },
  night: {
    mood: 'night',
    sky: 0x1f2740,
    fog: 0x1f2740,
    fogNear: 30,
    fogFar: 380,
    ambientColor: 0x7288b0,
    ambientIntensity: 0.8,
    sunColor: 0xa8bee6,
    sunIntensity: 0.55,
    darkness: 0.85,
    visionMul: 0.88,
  },
  deepNight: {
    mood: 'deepNight',
    sky: 0x121a2e,
    fog: 0x121a2e,
    fogNear: 24,
    fogFar: 300,
    ambientColor: 0x6a80aa,
    ambientIntensity: 0.72,
    sunColor: 0x9fb2dc,
    sunIntensity: 0.45,
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

export function moodByName(name: MoodName): StageLighting {
  return MOODS[name];
}

export type LightRig = {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  ambient: THREE.AmbientLight;
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
  rig.sun.color.setHex(light.sunColor);
  rig.sun.intensity = light.sunIntensity;
}

export function applyStageLighting(rig: LightRig, stage: number): StageLighting {
  const l = getStageLighting(stage);
  applyLighting(rig, l);
  return l;
}
