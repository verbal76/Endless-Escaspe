import React, { useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { GLView } from 'expo-gl';
import type { ExpoWebGLRenderingContext } from 'expo-gl';
import * as THREE from 'three';

import { createRenderer } from './Renderer';
import { startLoop, type LoopHandle } from './Loop';
import { updateCameraRig } from './CameraRig';
import { ProcgenSystem } from '../systems/ProcgenSystem';
import { ProjectileSystem } from '../systems/ProjectileSystem';
import { updatePlayer } from '../systems/PlayerController';
import { updateGuard } from '../systems/GuardAI';
import { updateDetection } from '../systems/DetectionSystem';
import { updateHide } from '../systems/HideSystem';
import {
  createGround,
  createGuard,
  createGuardConfigs,
  createGuardFigure,
  createPlayer,
  createPlayerFigure,
  createWinLine,
} from '../scenes/PrisonYard1';
import { useStore, type RunStats } from '../state/store';
import type { Guard } from '../types/world';
import { input } from '../systems/InputSystem';
import { animatePickup } from '../scenes/Pickup';
import {
  createSmokeCloud,
  disposeSmokeCloud,
  updateSmokeCloud,
  type SmokeCloud,
} from '../scenes/SmokeCloud';
import {
  createSwingArc,
  disposeSwingArc,
  updateSwingArc,
  type SwingArc,
} from '../scenes/SwingArc';
import {
  createFootprintField,
  disposeFootprintField,
  spawnFootprint,
  updateFootprintField,
  FOOTPRINT_SPAWN_INTERVAL,
} from '../scenes/Footprints';
import type { SmokeRegion } from '../systems/DetectionSystem';
import {
  CHUNK_LEN,
  CHUNKS_AHEAD,
  PLAYER_RADIUS,
} from '../util/geometry';
import { circleHit } from '../util/collision';
import {
  aiTierFor,
  detectionDecayFor,
  detectionRateScaleFor,
  dogCountFor,
  floodlightCrouchedRateFor,
  floodlightStandingRateFor,
  forceStormyWeatherFor,
  guardCountFor,
  lightScanSpeedMulFor,
  lightTowerRowsFor,
  lightVisionBonusFor,
  noiseRangeCrouchSqFor,
  noiseRangeWalkSqFor,
  razorWireEnabledFor,
  segmentLengthMulFor,
  slowMoEnabledFor,
  staminaEnabledFor,
  startingHeartsFor,
  visionRangeFor,
} from '../util/progression';
import {
  createDog,
  dogHits,
  setDogTransform,
  updateDog,
  type Dog,
} from '../scenes/Dog';
import { isTouchingFence } from '../scenes/Fence';
import {
  cameraCountFor,
  isBossStage,
  spawnCameras,
  updateCameraAlarm,
  type Camera,
} from '../scenes/Camera';

import { Joystick } from '../components/HUD/Joystick';
import { ActionButtons } from '../components/HUD/ActionButtons';
import { RunButton } from '../components/HUD/RunButton';
import { LookButtons } from '../components/HUD/LookButtons';
import { Hearts } from '../components/HUD/Hearts';
import { StaminaBar } from '../components/HUD/StaminaBar';
import { AlarmBar } from '../components/HUD/AlarmBar';
import { Banner } from '../components/HUD/Banner';
import { StartScreen } from '../components/HUD/StartScreen';
import { AlarmOverlay } from '../components/HUD/AlarmOverlay';
import { SettingsScreen } from '../components/HUD/SettingsScreen';
import { PickupBag } from '../components/HUD/PickupBag';
import { EventFlash } from '../components/HUD/EventFlash';
import { Tutorial } from '../components/HUD/Tutorial';
import { createRadialMeter, updateRadialMeter } from '../scenes/RadialMeter';
import { createThreatArrow, updateThreatArrow, type ThreatArrow } from '../scenes/ThreatArrow';
import { spawnFences } from '../scenes/Fence';
import {
  consumeSearchlightTrigger,
  isPlayerLit,
  spawnLightTowers,
  updateLightTower,
  type LightTower,
} from '../scenes/LightTower';
import {
  type BlockyFigure,
  setFigurePosition,
  updateFigurePose,
} from '../scenes/BlockyFigure';
import { attachGuardEquipment, poseGuardArms, type GuardEquipment } from '../scenes/GuardEquipment';
import {
  createGuardStateMarker,
  triggerGuardStateMarker,
  updateGuardStateMarker,
  type GuardStateMarker,
} from '../scenes/GuardStateMarker';
import { createBackdrop, updateBackdrop } from '../scenes/Backdrop';
import {
  createWeather,
  noiseMultiplier,
  pickWeather,
  updateWeather,
  visionMultiplier,
  type Weather,
  type WeatherKind,
} from '../scenes/Weather';
import { dustObstaclesWithSnow } from '../scenes/SnowCaps';
import { applyStageLighting } from '../scenes/Lighting';
import { createSiren, updateSiren, type SirenHandle } from '../scenes/Siren';
import {
  createPickupSounds,
  playPickupGrab,
  playPickupUse,
  type PickupSounds,
} from '../scenes/PickupSounds';
import { writeSaves, type Save } from '../util/storage';
import { haptics } from '../util/haptics';

// Stats thresholds. Higher = lenient; lower = stingy.
const STAT_DETECTED_3 = 3;   // <= seconds detected for 3 stars on this metric
const STAT_DETECTED_2 = 12;
const STAT_TIMES_3 = 0;
const STAT_TIMES_2 = 2;
const STAT_TIME_3 = 60;
const STAT_TIME_2 = 120;
const SEEN_THRESHOLD = 0.5;
const DETECTED_THRESHOLD = 0.3;

// Crowbar tuning. Range is intentionally short so the player has to
// commit to a melee approach; duration is long enough to clear a
// chase past a chokepoint but not so long it's a free pass.
const CROWBAR_RANGE = 3.0;
const CROWBAR_RANGE_SQ = CROWBAR_RANGE * CROWBAR_RANGE;
const CROWBAR_STUN_DURATION = 4.0;

// Stun the nearest non-stunned guard within CROWBAR_RANGE of (px, pz).
// No-op if no guard is in range. Resets that guard's investigation
// state so the unstun re-enters wander rather than re-aggroing the
// player from where they were standing when they swung.
function applyCrowbarStun(px: number, pz: number, guards: readonly Guard[]) {
  let nearest: Guard | null = null;
  let nearestDistSq = CROWBAR_RANGE_SQ;
  for (const g of guards) {
    if (g.stunTimer > 0) continue;
    const dx = g.x - px;
    const dz = g.z - pz;
    const dSq = dx * dx + dz * dz;
    if (dSq <= nearestDistSq) {
      nearestDistSq = dSq;
      nearest = g;
    }
  }
  if (!nearest) return;
  nearest.stunTimer = CROWBAR_STUN_DURATION;
  nearest.state = 'wander';
  nearest.investigationTarget = null;
  nearest.behaviorTimer = 0;
  nearest.fireCooldown = Math.max(nearest.fireCooldown, 0.5);
}

function scoreStars(s: Omit<RunStats, 'stars'>): number {
  let pts = 0;
  // Each metric: 0 / 0.5 / 1 contribution.
  pts += s.timesSeen <= STAT_TIMES_3 ? 1 : s.timesSeen <= STAT_TIMES_2 ? 0.5 : 0;
  pts +=
    s.timeDetected <= STAT_DETECTED_3
      ? 1
      : s.timeDetected <= STAT_DETECTED_2
        ? 0.5
        : 0;
  pts +=
    s.runDurationS <= STAT_TIME_3 ? 1 : s.runDurationS <= STAT_TIME_2 ? 0.5 : 0;
  pts += s.livesUsed === 0 ? 1 : s.livesUsed === 1 ? 0.5 : 0;
  // Out of 4 -> stars 1..3 (always at least 1 for clearing).
  return Math.max(1, Math.min(3, Math.round((pts / 4) * 3)));
}

export function Game() {
  const loopRef = useRef<LoopHandle | null>(null);

  const onContextCreate = (gl: ExpoWebGLRenderingContext) => {
    const r = createRenderer(gl);

    // ---- Mount-once entities ----------------------------------------
    // These survive the lifetime of the GLView and are NOT rebuilt
    // when the player advances stage. Anything that depends on the
    // current stage / segment seed lives below, on segmentRoot, and
    // gets torn down + reconstructed by buildScene().

    const player = createPlayer();
    let playerSkin = useStore.getState().playerSkin;
    let playerFigure = createPlayerFigure(playerSkin);
    r.worldRoot.add(playerFigure.group);

    const backdrop = createBackdrop();
    r.worldRoot.add(backdrop.group);

    const radialMeter = createRadialMeter();
    r.worldRoot.add(radialMeter.group);

    const siren: SirenHandle = createSiren();
    const pickupSounds: PickupSounds = createPickupSounds();
    const projectiles = new ProjectileSystem(r.worldRoot);

    // Active smoke clouds dropped by the player. Each cloud lives for
    // SMOKE_LIFETIME seconds and blocks vision of guards inside its
    // radius. Owned by the GLView (not the segment) so a cloud thrown
    // a frame before a stage advance still gets cleanly disposed.
    const smokeClouds: SmokeCloud[] = [];
    const smokeRegions: SmokeRegion[] = [];

    // Transient swing-arc decals that visualise crowbar use. Each
    // arc lives for ~180ms; we keep them on r.worldRoot so a swing
    // during the last frame of a segment doesn't disappear when the
    // scene rebuilds.
    const swingArcs: SwingArc[] = [];

    // Snow footprints. Active only on snow-weather segments; the
    // field tracks alternating sides + a spawn-interval counter so
    // prints stagger naturally as the player walks.
    const footprintField = createFootprintField();

    type GuardEntry = {
      guard: Guard;
      figure: BlockyFigure;
      equipment: GuardEquipment;
      marker: GuardStateMarker;
      // Last guard.state observed by the marker-update tick, used to
      // detect transitions into alert/investigate/chase so the pop
      // animation only fires on the leading edge.
      lastState: Guard['state'];
    };

    type Scene = {
      // Parent Group for every per-segment mesh. Removing this from
      // r.worldRoot detaches the entire world in one operation; the
      // next buildScene() call constructs a fresh root.
      root: THREE.Group;
      segLen: number;
      segmentEndZ: number;
      weatherKind: WeatherKind;
      weatherEnabledAtInit: boolean;
      weather: Weather;
      groundMat: THREE.MeshStandardMaterial;
      // Win-line material exposed so the render loop can pulse its
      // opacity (subtle "land here" glow rather than a flat plane).
      winLineMat: THREE.MeshBasicMaterial;
      baseVisionRange: number;
      razorWire: boolean;
      guardEntries: GuardEntry[];
      guards: Guard[];
      procgen: ProcgenSystem;
      lightTowers: LightTower[];
      dogs: Dog[];
      cameras: Camera[];
      threatArrows: ThreatArrow[];
      bossStage: boolean;
      bossGuardId: number;
    };

    // ---- Per-segment scene builder ----------------------------------
    // Constructs a fresh scene root with all stage-driven entities
    // (guards, dogs, cameras, towers, fences, procgen, weather, etc.)
    // parented to it. Run once at GLView mount and again every time
    // the player advances stage or starts a new segment.
    const buildScene = (stage: number, seed: number): Scene => {
      const root = new THREE.Group();
      r.worldRoot.add(root);

      const segLengthMul = segmentLengthMulFor(stage);
      const chunkCount = Math.max(
        CHUNKS_AHEAD,
        Math.round(CHUNKS_AHEAD * segLengthMul),
      );
      const segLen = chunkCount * CHUNK_LEN;

      const ground = createGround();
      const groundMat = ground.material as THREE.MeshStandardMaterial;
      root.add(ground);

      // Per-segment weather. Picked deterministically from the segment
      // seed so a restart of the same segment gets the same conditions.
      // If the user has weather effects toggled off, force clear and
      // boost the AI senses (see the update loop below) so toggling
      // off doesn't hand the player a free pass. From stage 15+, even
      // the toggle-off path produces a non-clear roll so storms become
      // a permanent late-game pressure.
      const weatherEnabledAtInit = useStore.getState().weatherEnabled;
      const rolledWeatherKind = pickWeather(seed);
      const stormyForced = forceStormyWeatherFor(stage);
      let weatherKind: WeatherKind = weatherEnabledAtInit ? rolledWeatherKind : 'clear';
      if (stormyForced && weatherKind === 'clear') {
        // Coin flip between rain and snow so late stages don't always
        // pick the same storm type.
        weatherKind = (seed & 1) === 0 ? 'rain' : 'snow';
      }
      useStore.getState().setWeather(weatherKind);
      const weather: Weather = createWeather(weatherKind, 0, 1);
      root.add(weather.group);
      if (weatherKind === 'snow') {
        groundMat.color.setHex(0xc8d6dc);
      }

      const winLine = createWinLine(segLen);
      const winLineMat = winLine.material as THREE.MeshBasicMaterial;
      // The win line is built opaque; flip the material to transparent
      // so the render loop's opacity pulse actually shows up.
      winLineMat.transparent = true;
      root.add(winLine);

      const baseVisionRange = visionRangeFor(stage);

      const guardCount = guardCountFor(stage);
      const guardEntries: GuardEntry[] = createGuardConfigs(guardCount, segLen).map(
        (cfg) => {
          const guard = createGuard(cfg);
          const figure = createGuardFigure();
          figure.group.position.set(guard.x, 0, guard.z);
          root.add(figure.group);
          const equipment = attachGuardEquipment(figure, baseVisionRange);
          const marker = createGuardStateMarker();
          figure.group.add(marker.group);
          guard.mesh = figure.group;
          return { guard, figure, equipment, marker, lastState: guard.state };
        },
      );
      const guards: Guard[] = guardEntries.map((e) => e.guard);

      const procgen = new ProcgenSystem(seed, root, chunkCount);
      procgen.init();

      // Snow weather: dust the top of every obstacle with a thin
      // white cap so the world reads as blanketed.
      if (weatherKind === 'snow') {
        dustObstaclesWithSnow(procgen.obstacles());
      }

      const razorWire = razorWireEnabledFor(stage);
      spawnFences(root, stage, weatherKind, segLen, razorWire);
      const lightTowers: LightTower[] = spawnLightTowers(
        root,
        segLen,
        lightTowerRowsFor(stage),
        lightScanSpeedMulFor(stage),
        stage >= 8, // tracking from stage 8+
      );

      // Dogs: trail a designated handler guard, smell the player at
      // close range, detach into chase when the handler does. One per
      // entry in dogCountFor; we pair them with the first N guards.
      const dogs: Dog[] = [];
      const dogCount = dogCountFor(stage);
      for (let i = 0; i < dogCount && i < guards.length; i++) {
        const handler = guards[i];
        const d = createDog(i + 1, handler.id, handler.x + 1, handler.z);
        root.add(d.group);
        dogs.push(d);
      }

      const cameras: Camera[] = spawnCameras(root, segLen, cameraCountFor(stage));

      // Boss stage: pump up the lead guard's effective vision so the
      // segment reads as a tougher fight without changing procgen.
      // The bonus is multiplied into baseVisionRange at detection time.
      const bossStage = isBossStage(stage);
      const bossGuardId = bossStage && guards.length > 0 ? guards[0].id : -1;

      const threatArrows: ThreatArrow[] = guards.map(() => {
        const a = createThreatArrow();
        root.add(a.mesh);
        return a;
      });

      return {
        root,
        segLen,
        segmentEndZ: segLen,
        weatherKind,
        weatherEnabledAtInit,
        weather,
        groundMat,
        winLineMat,
        baseVisionRange,
        razorWire,
        guardEntries,
        guards,
        procgen,
        lightTowers,
        dogs,
        cameras,
        threatArrows,
        bossStage,
        bossGuardId,
      };
    };

    // ---- Initial scene ----------------------------------------------
    // Snapshot the stage at scene-init time. Most stage-driven knobs
    // are resolved once per buildScene; a few (decay, rate scale, AI
    // tier, slow-mo gate) are re-evaluated each frame because they're
    // cheap.
    const initialStage = useStore.getState().stage;
    let scene: Scene = buildScene(initialStage, useStore.getState().segmentSeed);

    // Per-stage scene lighting (day -> dusk -> night). Cycles every
    // 5 stages and trends darker each cycle (see Lighting.ts). Re-
    // applied on every rebuild so loading a save at stage 17 doesn't
    // keep the bright stage-1 sky.
    applyStageLighting(r.renderer, r.scene, initialStage);

    // Detach the active scene's world subtree from the renderer and
    // dispose its procgen chunks. Mount-once entities (player, smoke
    // clouds, projectiles) live elsewhere so they survive teardown.
    const tearDownScene = (s: Scene) => {
      s.procgen.dispose();
      r.worldRoot.remove(s.root);
    };

    // Swap the world for a fresh one matching the supplied stage and
    // seed, and re-tint the sky / ambient lights. Called when the
    // player advances stage or starts a new segment via the banner.
    // Caller must run resetSegment() afterwards to re-zero player +
    // accumulator state against the freshly built guards / dogs.
    const rebuildScene = (stage: number, seed: number) => {
      tearDownScene(scene);
      scene = buildScene(stage, seed);
      applyStageLighting(r.renderer, r.scene, stage);
    };

    // Per-run stats accumulators.
    let runTime = 0;
    let timeDetectedAcc = 0;
    let timesSeenAcc = 0;
    let prevAnyDetected = false;
    let lastSegmentSeed = useStore.getState().segmentSeed;
    let lastStage = useStore.getState().stage;
    let lastRestartCounter = useStore.getState().restartCounter;
    let animTime = 0;
    const tmpVec = new THREE.Vector3();

    // Camera-shake state. handleCatch sets shakeRemaining to
    // SHAKE_DURATION; update() decays it; render() applies a small
    // sin-driven offset to camera position scaled by the remaining
    // fraction so the kick eases out smoothly.
    const SHAKE_DURATION = 0.28;
    let shakeRemaining = 0;

    // Brief sparkle animation on collected pickups: instead of
    // despawning the mesh immediately, scale it up and let it fade
    // out across PICKUP_GRAB_DURATION seconds so the player sees
    // their grab register. The owning Object3D outlives the procgen
    // scene-root so we keep our own list and clean it up here.
    const PICKUP_GRAB_DURATION = 0.22;
    type FadingPickup = { mesh: THREE.Object3D; age: number };
    const fadingPickups: FadingPickup[] = [];

    const resetSegment = () => {
      runTime = 0;
      timeDetectedAcc = 0;
      timesSeenAcc = 0;
      prevAnyDetected = false;
      animTime = 0;
      player.x = 0;
      player.z = 1;
      player.isHidden = false;
      player.stance = 'walk';
      player.stamina = 1;
      const st = useStore.getState();
      st.setStance('walk');
      st.setStamina(1);
      st.setAlarmLevel(0);
      for (const g of scene.guards) {
        g.x = g.homeX;
        g.z = g.homeZ;
        g.state = 'wander';
        g.behaviorTimer = 0;
        g.wanderTimer = 0;
        g.investigationTarget = null;
        g.fireCooldown = 0;
        g.stunTimer = 0;
        st.setDetection(g.id, 0);
      }
      // Reset dogs to their handler's spawn position and cancel
      // any chase state.
      for (const d of scene.dogs) {
        const handler = scene.guards.find((g) => g.id === d.handlerGuardId);
        d.x = handler ? handler.x + 1 : 0;
        d.z = handler ? handler.z : 1;
        d.state = 'leash';
        setDogTransform(d);
      }
      projectiles.clear();
      // Clear active smoke clouds and consume any pending pickup-use
      // flags so a tap right before a segment boundary doesn't
      // discharge into the new segment.
      for (const c of smokeClouds) {
        r.worldRoot.remove(c.group);
        disposeSmokeCloud(c);
      }
      smokeClouds.length = 0;
      // Cancel any in-flight pickup-grab sparkles. Their meshes were
      // children of scene.root which the rebuild already detached;
      // explicit removes here are belt-and-braces for the restart
      // path that doesn't tear the scene down.
      for (const fp of fadingPickups) {
        if (fp.mesh.parent) fp.mesh.parent.remove(fp.mesh);
      }
      fadingPickups.length = 0;
      // Despawn any in-flight swing arcs from the player's last
      // crowbar tap; otherwise a stale ring would linger at the
      // pre-reset spawn after a catch.
      for (const arc of swingArcs) {
        r.worldRoot.remove(arc.mesh);
        disposeSwingArc(arc);
      }
      swingArcs.length = 0;
      // Clear snow footprints from the prior life - leaving a trail
      // at the soft-restart spawn point would read as the wrong
      // player's footsteps.
      disposeFootprintField(footprintField);
      input.useCrowbar = false;
      input.useSmokeBomb = false;
    };

    const handleCatch = () => {
      const st = useStore.getState();
      const remaining = st.hearts - 1;
      st.setHearts(remaining);
      projectiles.clear();
      shakeRemaining = SHAKE_DURATION;
      if (remaining <= 0) {
        haptics.caught();
        st.setRunState('caught');
        return;
      }
      haptics.heartLost();
      // Soft restart inside the segment - keep run stats so the
      // end-of-segment board reflects all attempts in this run.
      player.x = 0;
      player.z = 1;
      player.isHidden = false;
      player.stance = 'walk';
      player.stamina = 1;
      st.setStance('walk');
      st.setStamina(1);
      for (const g of scene.guards) {
        g.x = g.homeX;
        g.z = g.homeZ;
        g.state = 'wander';
        g.behaviorTimer = 0;
        g.wanderTimer = 0;
        g.investigationTarget = null;
        g.fireCooldown = 0;
        g.stunTimer = 0;
        st.setDetection(g.id, 0);
      }
      for (const d of scene.dogs) {
        const handler = scene.guards.find((g) => g.id === d.handlerGuardId);
        d.x = handler ? handler.x + 1 : 0;
        d.z = handler ? handler.z : 1;
        d.state = 'leash';
        // Snap the mesh to the new home position so the player
        // doesn't see the dog "teleport" a frame later when the
        // update loop's render pass picks up the change.
        setDogTransform(d);
      }
      // Despawn any active smoke and consume queued use-flags so the
      // soft-restart starts cleanly from spawn. Inventory counts are
      // intentionally preserved across catches inside a segment.
      for (const c of smokeClouds) {
        r.worldRoot.remove(c.group);
        disposeSmokeCloud(c);
      }
      smokeClouds.length = 0;
      // Tear down any in-flight pickup-grab sparkles too so they
      // don't hover in the world while the player is back at spawn.
      for (const fp of fadingPickups) {
        if (fp.mesh.parent) fp.mesh.parent.remove(fp.mesh);
      }
      fadingPickups.length = 0;
      // Despawn any in-flight swing arcs from the player's last
      // crowbar tap; otherwise a stale ring would linger at the
      // pre-reset spawn after a catch.
      for (const arc of swingArcs) {
        r.worldRoot.remove(arc.mesh);
        disposeSwingArc(arc);
      }
      swingArcs.length = 0;
      // Clear snow footprints from the prior life - leaving a trail
      // at the soft-restart spawn point would read as the wrong
      // player's footsteps.
      disposeFootprintField(footprintField);
      input.useCrowbar = false;
      input.useSmokeBomb = false;
    };

    const handleWin = () => {
      const st = useStore.getState();
      const justClearedStage = st.stage;
      const stats: Omit<RunStats, 'stars'> = {
        timesSeen: timesSeenAcc,
        timeDetected: timeDetectedAcc,
        runDurationS: runTime,
        livesUsed: 3 - st.hearts,
      };
      const stars = scoreStars(stats);
      st.setLastStats({ ...stats, stars });
      // Mirror the new high (if any) into the in-memory bestStars
      // map so the post-run banner shows the right number.
      st.recordSegmentStars(justClearedStage, stars);

      // Advance to the next stage. After replaying a lower stage
      // this still bumps you forward into linear play, but the save
      // file's own stage is treated as a high-water mark so we
      // never roll a returning player's progress backwards.
      st.setStage(justClearedStage + 1);

      // Mirror stage progress + the new star high onto the active
      // character save so "Continue" picks up correctly and the
      // star board on the load screen reflects this run.
      const after = useStore.getState();
      const key = after.activeSaveName;
      if (key) {
        const existing = after.saves[key];
        if (existing) {
          const oldBest = existing.bestStars[justClearedStage] ?? 0;
          const newBest = Math.max(oldBest, stars);
          const updated: Save = {
            ...existing,
            stage: Math.max(existing.stage, justClearedStage + 1),
            bestStars:
              newBest > oldBest
                ? { ...existing.bestStars, [justClearedStage]: newBest }
                : existing.bestStars,
            updatedAt: Date.now(),
          };
          after.upsertSave(updated);
          writeSaves({ ...after.saves, [key]: updated });
        }
      }

      st.setRunState('cleared');
      haptics.cleared();
      // Hearts count for the *next* segment (post-Banner) is the
      // stage-driven starting count. Game.tsx's startRun and the
      // restart path use this same helper.
      st.setHearts(startingHeartsFor(justClearedStage + 1));
      projectiles.clear();
    };

    const update = (dt: number) => {
      const st = useStore.getState();

      // Detect external state transitions (segment seed change from
      // Banner's Next Segment, save load with a different stage, or
      // restart request from pause panel).
      //
      // Stage *or* segmentSeed change triggers a full scene rebuild
      // so the entity counts (guards, dogs, cameras, towers, segment
      // length, razor wire) catch up to the new stage. Restart re-
      // uses the existing scene by design - same seed, same world,
      // just back to spawn.
      if (st.segmentSeed !== lastSegmentSeed || st.stage !== lastStage) {
        lastSegmentSeed = st.segmentSeed;
        lastStage = st.stage;
        rebuildScene(st.stage, st.segmentSeed);
        resetSegment();
      }
      // Skin change (typically from a save load on the start screen):
      // detach the existing player figure and rebuild it with the
      // new skin so the in-world avatar matches the picker / save.
      if (st.playerSkin !== playerSkin) {
        playerSkin = st.playerSkin;
        r.worldRoot.remove(playerFigure.group);
        playerFigure = createPlayerFigure(playerSkin);
        r.worldRoot.add(playerFigure.group);
      }
      if (st.restartCounter !== lastRestartCounter) {
        lastRestartCounter = st.restartCounter;
        st.setHearts(startingHeartsFor(st.stage));
        st.setLastStats(null);
        st.setRunState('playing');
        resetSegment();
      }

      if (st.runState !== 'playing' || st.paused) {
        projectiles.clear();
        // Silence the siren on pause / non-playing states so the
        // speaker doesn't keep wailing while the player is in menus.
        updateSiren(siren, 0, useStore.getState().masterVolume);
        return;
      }

      runTime += dt;
      animTime += dt;
      if (shakeRemaining > 0) {
        shakeRemaining = Math.max(0, shakeRemaining - dt);
      }

      // Slow-mo close call: when detection is high AND a chasing
      // guard is right on top of you, stretch real-time briefly so
      // the player has a frame's grace to break LOS. Disabled past
      // the slow-mo tier so it doesn't carry late-stage runs.
      let timeScale = 1;
      if (slowMoEnabledFor(st.stage)) {
        let closeCall = false;
        const detmap = st.detection;
        for (const g of scene.guards) {
          const detv = detmap[g.id] ?? 0;
          if (detv >= 0.8) {
            const dx = g.x - player.x;
            const dz = g.z - player.z;
            if (dx * dx + dz * dz <= 64 /* 8m */) {
              closeCall = true;
              break;
            }
          }
        }
        if (closeCall) timeScale = 0.5;
      }
      const effDt = dt * timeScale;

      updateBackdrop(backdrop, effDt);
      updateWeather(scene.weather, effDt, player.x, player.z);

      const staminaActive = staminaEnabledFor(st.stage);
      updatePlayer(player, scene.procgen.obstacles(), effDt, scene.segmentEndZ, staminaActive);
      updateHide(player, scene.procgen.obstacles());
      if (player.stance !== st.stance) st.setStance(player.stance);
      st.setStamina(player.stamina);

      // Razor wire: touching the fence at razor-wire stages costs
      // a heart and resets the player to spawn. Treat it as a catch.
      if (scene.razorWire && isTouchingFence(player.x)) {
        handleCatch();
        return;
      }

      // Pickup overlap: walk over a pickup to grab it. Iterate the
      // chunk's pickup list and increment the inventory counter. The
      // mesh stays parented to scene.root for a brief sparkle (scale-
      // up + lift) tracked in fadingPickups; it's removed from the
      // graph when the animation completes a few frames later.
      for (const p of scene.procgen.pickups()) {
        if (p.collected) continue;
        const dx = p.x - player.x;
        const dz = p.z - player.z;
        const reach = p.r + PLAYER_RADIUS;
        if (dx * dx + dz * dz <= reach * reach) {
          p.collected = true;
          if (p.mesh) {
            fadingPickups.push({ mesh: p.mesh, age: 0 });
            p.mesh = null;
          }
          st.addPickup(p.kind);
          haptics.pickupGrab();
          playPickupGrab(pickupSounds, st.masterVolume);
        }
      }

      // Advance fading pickup sparkles. Each entry scales up and
      // rises off the ground over PICKUP_GRAB_DURATION seconds, then
      // is detached from whatever group still parents it (usually
      // scene.root unless a stage advance happened mid-fade).
      for (let i = fadingPickups.length - 1; i >= 0; i--) {
        const fp = fadingPickups[i];
        fp.age += effDt;
        const t = Math.min(1, fp.age / PICKUP_GRAB_DURATION);
        fp.mesh.scale.setScalar(1 + 0.6 * t);
        fp.mesh.position.y = 0.08 + 0.5 * t;
        if (t >= 1) {
          if (fp.mesh.parent) fp.mesh.parent.remove(fp.mesh);
          fadingPickups.splice(i, 1);
        }
      }

      // Pickup-use one-shot flags. Crowbar stuns the nearest unstunned
      // guard within range; smoke bomb spawns a vision-blocking cloud
      // at the player's feet. Each consumes one item from inventory.
      if (input.useCrowbar) {
        input.useCrowbar = false;
        if (st.consumePickup('crowbar')) {
          applyCrowbarStun(player.x, player.z, scene.guards);
          const arc = createSwingArc(player.x, player.z, CROWBAR_RANGE);
          r.worldRoot.add(arc.mesh);
          swingArcs.push(arc);
          haptics.pickupUse();
          playPickupUse(pickupSounds, st.masterVolume);
        }
      }
      if (input.useSmokeBomb) {
        input.useSmokeBomb = false;
        if (st.consumePickup('smokebomb')) {
          const cloud = createSmokeCloud(player.x, player.z);
          r.worldRoot.add(cloud.group);
          smokeClouds.push(cloud);
          haptics.pickupUse();
          playPickupUse(pickupSounds, st.masterVolume);
        }
      }

      // Advance smoke clouds; rebuild the per-frame list of vision-
      // blocking regions DetectionSystem reads. Walk backwards so we
      // can splice expired clouds without shifting indices.
      smokeRegions.length = 0;
      for (let i = smokeClouds.length - 1; i >= 0; i--) {
        const c = smokeClouds[i];
        const alive = updateSmokeCloud(c, effDt);
        if (!alive) {
          r.worldRoot.remove(c.group);
          disposeSmokeCloud(c);
          smokeClouds.splice(i, 1);
          continue;
        }
        smokeRegions.push({ x: c.x, z: c.z, radius: c.radius });
      }

      // Advance any active crowbar swing arcs. Same expire-and-prune
      // pattern as smoke; arcs don't influence detection so we don't
      // collect any per-frame side data here.
      for (let i = swingArcs.length - 1; i >= 0; i--) {
        const arc = swingArcs[i];
        const alive = updateSwingArc(arc, effDt);
        if (!alive) {
          r.worldRoot.remove(arc.mesh);
          disposeSwingArc(arc);
          swingArcs.splice(i, 1);
        }
      }

      // Snow footprints. Drop a new print at FOOTPRINT_SPAWN_INTERVAL
      // while the player is moving on a snow-weather segment, then
      // age out the rest of the field. Off-snow stages skip the
      // spawn entirely so the field stays empty.
      if (scene.weatherKind === 'snow') {
        footprintField.sinceSpawn += effDt;
        const speed = Math.hypot(player.vx, player.vz);
        if (speed > 0.4 && footprintField.sinceSpawn >= FOOTPRINT_SPAWN_INTERVAL) {
          footprintField.sinceSpawn = 0;
          spawnFootprint(
            footprintField,
            player.x,
            player.z,
            Math.atan2(player.vz, player.vx),
            r.worldRoot,
          );
        }
      }
      updateFootprintField(footprintField, effDt);

      let lit = false;
      // Searchlight one-shot bump: when a tracking-capable tower
      // has held the player in its beam for long enough, every
      // guard's detection meter takes a single jolt of this size.
      let searchlightBump = 0;
      for (const t of scene.lightTowers) {
        updateLightTower(t, effDt, player.x, player.z);
        if (!lit && isPlayerLit(t, player.x, player.z)) lit = true;
        if (consumeSearchlightTrigger(t)) {
          // Late-stage searchlights bite harder. 0.4 is a discrete
          // jump - should yank the meter past the SEEN_THRESHOLD if
          // it was anywhere near it.
          searchlightBump = Math.max(searchlightBump, 0.4);
        }
      }
      // Weather modifiers: snow boosts vision (player more visible
      // against bright background); rain dampens player noise.
      // Compensation: if weather effects are toggled OFF, give the
      // AI a constant +10% vision and a stronger light tower bonus
      // so the player doesn't get an easier game by hitting the
      // toggle. weatherEnabled is fixed for the lifetime of the
      // segment (captured at init); changing the toggle takes effect
      // on the next segment.
      const weatherVision = scene.weatherEnabledAtInit
        ? visionMultiplier(scene.weather.kind)
        : 1.10;
      const weatherNoise = scene.weatherEnabledAtInit
        ? noiseMultiplier(scene.weather.kind)
        : 1.0;
      const litBonus = lightVisionBonusFor(st.stage);
      const effectiveVisionRange = (lit
        ? scene.baseVisionRange * (1 + litBonus)
        : scene.baseVisionRange) * weatherVision;

      const litRateBase = lit
        ? player.isCrouched
          ? floodlightCrouchedRateFor(st.stage)
          : floodlightStandingRateFor(st.stage)
        : 0;
      const litAdd = litRateBase * effDt;

      // Stage-driven detection tuning passed to DetectionSystem so
      // the rate ramp + decay curve all flow from progression.ts.
      const tuning = {
        rateScale: detectionRateScaleFor(st.stage),
        decay: detectionDecayFor(st.stage),
        noiseRangeWalkSq: noiseRangeWalkSqFor(st.stage),
        noiseRangeCrouchSq: noiseRangeCrouchSqFor(st.stage),
      };
      const aiTier = aiTierFor(st.stage);

      // Camera alarm bar: cameras feed a separate yard-alarm pool
      // that, when full, escalates every guard. Update first so the
      // guard pass below can read the current level.
      const newAlarm =
        scene.cameras.length > 0
          ? updateCameraAlarm(scene.cameras, player, scene.procgen.obstacles(), st.alarmLevel, effDt)
          : 0;
      if (scene.cameras.length > 0) st.setAlarmLevel(newAlarm);
      // While the alarm is full, scale every guard's effective
      // vision range up by 25% - readable as "the whole yard is
      // looking for you now."
      const alarmHot = newAlarm >= 1.0;
      const effectiveVisionRangeWithAlarm = alarmHot
        ? effectiveVisionRange * 1.25
        : effectiveVisionRange;

      // Pass 1: compute new detection for every guard, including
      // any dog smell contribution to the handler.
      const nextDetection: Record<number, number> = {};
      let anyDetected = false;
      let maxDetection = 0;
      let chaserGuard: Guard | null = null;
      for (const entry of scene.guardEntries) {
        const g = entry.guard;
        const prev = st.detection[g.id] ?? 0;
        // Boss guard sees ~50% further than the rest at boss stages.
        const guardRange =
          g.id === scene.bossGuardId
            ? effectiveVisionRangeWithAlarm * 1.5
            : effectiveVisionRangeWithAlarm;
        const visionAndNoise = updateDetection(
          g,
          player,
          scene.procgen.obstacles(),
          prev,
          effDt,
          guardRange,
          tuning,
          weatherNoise,
          smokeRegions,
        );
        let dogSmell = 0;
        for (const d of scene.dogs) {
          if (d.handlerGuardId === g.id) {
            dogSmell += updateDog(d, g, player, effDt);
          }
        }
        const next = Math.min(
          1,
          visionAndNoise + litAdd + dogSmell + searchlightBump,
        );
        nextDetection[g.id] = next;
        if (next > maxDetection) maxDetection = next;
        if (next > DETECTED_THRESHOLD) anyDetected = true;
        if (next >= 1.0 && !chaserGuard) chaserGuard = g;
      }

      // Pass 2: write detection to the store and run guard AI. This
      // ordering lets us implement the AI tier-3 broadcast: if any
      // guard has hit chase, point the nearest other non-chase
      // guard at the same investigation target.
      for (const entry of scene.guardEntries) {
        const g = entry.guard;
        const next = nextDetection[g.id] ?? 0;
        st.setDetection(g.id, next);
        // Tier 3 broadcast: silent investigation cue for non-chasing
        // guards in earshot of the chaser.
        if (aiTier >= 3 && chaserGuard && g.id !== chaserGuard.id && g.state !== 'chase') {
          const dx = g.x - chaserGuard.x;
          const dz = g.z - chaserGuard.z;
          if (dx * dx + dz * dz <= 400 /* 20m */) {
            g.investigationTarget = { x: player.x, z: player.z };
            if (g.state === 'wander' || g.state === 'return') {
              g.state = 'investigate';
              g.behaviorTimer = 0;
            }
          }
        }
        updateGuard(g, player, next, effDt, scene.procgen.obstacles(), (gFiring, tx, tz) => {
          const firingEntry = scene.guardEntries.find((e) => e.guard.id === gFiring.id);
          let fx = gFiring.x;
          let fz = gFiring.z;
          if (firingEntry) {
            firingEntry.equipment.pistol.getWorldPosition(tmpVec);
            fx = tmpVec.x;
            fz = tmpVec.z;
          }
          // Tier 4 lead shots: aim at the player's projected
          // position N seconds out instead of their current spot.
          let aimX = tx;
          let aimZ = tz;
          if (aiTier >= 4) {
            const lead = 0.25;
            aimX = tx + player.vx * lead;
            aimZ = tz + player.vz * lead;
          }
          projectiles.spawn(fx, fz, aimX, aimZ);
        });
      }

      // Guard state-change pops: fire a "!" marker above any guard
      // whose state just transitioned into alert / investigate /
      // chase. Tracking the previous state per entry means the pop
      // only triggers on the leading edge - the marker's own
      // animation handles the hold + fade.
      for (const entry of scene.guardEntries) {
        const next = entry.guard.state;
        if (next !== entry.lastState) {
          if (next === 'alert') triggerGuardStateMarker(entry.marker, 'alert');
          else if (next === 'investigate') triggerGuardStateMarker(entry.marker, 'investigate');
          else if (next === 'chase') triggerGuardStateMarker(entry.marker, 'chase');
          entry.lastState = next;
        }
      }

      // Detached dogs that aren't paired with any handler still
      // need an update tick (they keep chasing the player even if
      // the handler has been despawned, which can't happen yet but
      // belt-and-braces). Also handle dog->player collision: dogs
      // count as a soft catch identical to a guard touch.
      for (const d of scene.dogs) {
        if (d.state === 'chase') {
          updateDog(d, undefined, player, effDt);
        }
        setDogTransform(d);
        if (dogHits(d, player)) {
          handleCatch();
          return;
        }
      }

      // Stats accumulators.
      if (anyDetected) timeDetectedAcc += effDt;
      if (maxDetection > SEEN_THRESHOLD && !prevAnyDetected) timesSeenAcc++;
      prevAnyDetected = maxDetection > SEEN_THRESHOLD;

      // Live siren volume tracks the highest detection across guards,
      // multiplied by the master volume slider in the pause panel.
      updateSiren(siren, maxDetection, st.masterVolume);

      scene.procgen.update(player.z);

      if (player.z >= scene.segmentEndZ) {
        handleWin();
        return;
      }

      if (projectiles.update(effDt, player)) {
        handleCatch();
        return;
      }

      for (const g of scene.guards) {
        if (
          g.state === 'chase' &&
          circleHit(
            { x: player.x, z: player.z, r: PLAYER_RADIUS },
            { x: g.x, z: g.z, r: 0.6 },
          )
        ) {
          handleCatch();
          break;
        }
      }
    };


    const render = (_alpha: number) => {
      // Idle bob/spin on every uncollected pickup. Cheap; only the
      // mesh transform is touched.
      for (const p of scene.procgen.pickups()) animatePickup(p, animTime);

      // Win-line glow: pulse the opacity so the green plane reads as
      // an active goal rather than a static stripe. Runs at ~0.5 Hz.
      scene.winLineMat.opacity = 0.65 + 0.35 * Math.sin(animTime * 3.2);

      // Player figure pose + position.
      const pSpeed = Math.hypot(player.vx, player.vz);
      // Facing matches movement direction; if standing still, keep
      // the last facing by computing one from velocity only when it
      // is non-trivial.
      const pFacing =
        pSpeed > 0.05 ? Math.atan2(player.vz, player.vx) : playerFigure.group.rotation.y;
      updateFigurePose(playerFigure, {
        stance: player.stance,
        speed: pSpeed,
        isRunning: player.isRunning,
        facing: pSpeed > 0.05 ? pFacing : -playerFigure.group.rotation.y + Math.PI / 2,
        time: animTime,
        hidden: player.isHidden,
      });
      setFigurePosition(playerFigure, player.x, player.z);

      for (const entry of scene.guardEntries) {
        const g = entry.guard;
        const fig = entry.figure;
        const moving =
          fig.group.position.x !== g.x || fig.group.position.z !== g.z;
        const speed = moving ? 1.5 : 0;
        updateFigurePose(fig, {
          stance: 'walk',
          speed,
          isRunning: g.state === 'chase',
          facing: g.facing,
          time: animTime,
        });
        setFigurePosition(fig, g.x, g.z);
        // Override the swinging arm pose so flashlight + pistol stay
        // aimed reliably down the figure's facing direction.
        poseGuardArms(fig);
        // Counter-rotate the state marker so it always faces the
        // camera direction (i.e. doesn't yaw with the figure). The
        // figure rotates around Y by figure.group.rotation.y; we
        // negate that on the marker's own Y rotation.
        entry.marker.group.rotation.y = -fig.group.rotation.y;
        updateGuardStateMarker(entry.marker, 1 / 60);
      }

      // Radial meter follows the player; lit by the highest detection.
      radialMeter.group.position.set(player.x, 0, player.z);
      const detectionMap = useStore.getState().detection;
      let maxDetection = 0;
      for (let i = 0; i < scene.guards.length; i++) {
        const v = detectionMap[scene.guards[i].id] ?? 0;
        if (v > maxDetection) maxDetection = v;
      }
      updateRadialMeter(radialMeter, maxDetection);

      for (let i = 0; i < scene.guards.length; i++) {
        const g = scene.guards[i];
        const v = detectionMap[g.id] ?? 0;
        updateThreatArrow(
          scene.threatArrows[i],
          player.x,
          player.z,
          g.x,
          g.z,
          v,
          g.state === 'chase',
          animTime,
        );
      }

      updateCameraRig(r.camera, player, 1 / 60);
      // Catch shake: small sin-driven offset on top of the rig pose,
      // scaled by the remaining fraction of SHAKE_DURATION so the
      // kick eases out. Frequency intentionally non-integer to avoid
      // the shake reading as a consistent wobble.
      if (shakeRemaining > 0) {
        const t = shakeRemaining / SHAKE_DURATION;
        const amp = 0.18 * t;
        r.camera.position.x += Math.sin(animTime * 92) * amp;
        r.camera.position.y += Math.cos(animTime * 71) * amp * 0.7;
      }
      r.draw();
    };

    loopRef.current = startLoop({ update, render });
  };

  return (
    <View style={styles.root}>
      <GLView style={StyleSheet.absoluteFill} onContextCreate={onContextCreate} />
      <AlarmOverlay />
      <Joystick />
      <RunButton />
      <ActionButtons />
      <PickupBag />
      <LookButtons />
      <Hearts />
      <StaminaBar />
      <AlarmBar />
      <EventFlash />
      <Banner />
      <StartScreen />
      <SettingsScreen />
      <Tutorial />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0b0d12' },
});
