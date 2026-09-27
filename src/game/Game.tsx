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
import { input, resetInput } from '../systems/InputSystem';
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
  PLAY_HALF_W,
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
  updateDogs,
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
import { CatchFlash } from '../components/HUD/CatchFlash';
import { EventFlash } from '../components/HUD/EventFlash';
import { Tutorial } from '../components/HUD/Tutorial';
import { GameModal } from '../components/HUD/GameModal';
import { BossTimer } from '../components/HUD/BossTimer';
import { logDebug } from '../util/debug';
import { disposeSubtree } from '../util/dispose';
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
  type ModelFigure as BlockyFigure,
  setModelFigurePosition as setFigurePosition,
  updateModelFigurePose as updateFigurePose,
} from '../scenes/ModelFigure';
import { attachGuardEquipment, poseGuardArms, type GuardEquipment } from '../scenes/GuardEquipment';
import {
  createGuardStateMarker,
  setGuardStateMarker,
  updateGuardStateMarker,
  type GuardStateMarker,
} from '../scenes/GuardStateMarker';
import { createBackdrop, setBackdropSnow, updateBackdrop } from '../scenes/Backdrop';
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
import { applyDynamicLighting, applyStageLighting } from '../scenes/Lighting';
import { createSiren, updateSiren, type SirenHandle } from '../scenes/Siren';
import { createMusic, type MusicPlayer } from '../scenes/Music';
import {
  createPickupSounds,
  playPickupGrab,
  playCrowbarBonk,
  playPickupUse,
  type PickupSounds,
} from '../scenes/PickupSounds';
import { writeSaves, type Save } from '../util/storage';
import { haptics } from '../util/haptics';
import { scoreStars } from '../util/scoring';
import { RunTracker } from '../util/runStats';
import { BossClock } from '../util/bossClock';
import { resetNavState } from '../systems/Navigator';

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
// Returns true on a successful hit so the caller can fire the bonk
// SFX + haptic feedback only when contact actually lands (a swing
// into empty air should be silent).
function applyCrowbarStun(
  px: number,
  pz: number,
  guards: readonly Guard[],
): boolean {
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
  if (!nearest) return false;
  nearest.stunTimer = CROWBAR_STUN_DURATION;
  nearest.state = 'wander';
  nearest.investigationTarget = null;
  nearest.behaviorTimer = 0;
  nearest.fireCooldown = Math.max(nearest.fireCooldown, 0.5);
  return true;
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
    // Background music. Initial volume picked from the store so a
    // returning player gets the slider-saved level instead of the
    // default. The store-subscription below keeps the live track
    // synced with the slider while the panel is open.
    const music: MusicPlayer = createMusic(useStore.getState().musicVolume);
    // Live-update the music volume whenever the slider moves. The
    // returned unsubscribe is intentionally not called - the music
    // is alive for the whole GLView lifetime, which matches the app's
    // lifetime in this codebase.
    void useStore.subscribe((st, prev) => {
      if (st.musicVolume !== prev.musicVolume) music.setVolume(st.musicVolume);
    });
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
      // Win-line material is null for arena variants (no win line).
      winLineMat: THREE.MeshBasicMaterial | null;
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
      // True when this is a boss-arena variant: smaller enclosed
      // playfield, no win line, win condition is "survive the
      // timer". `bossSurviveSeconds` is the target; the update
      // loop counts down from it once gameplay is active.
      isBossArena: boolean;
      bossSurviveSeconds: number;
    };

    // ---- Per-segment scene builder ----------------------------------
    // Constructs a fresh scene root with all stage-driven entities
    // (guards, dogs, cameras, towers, fences, procgen, weather, etc.)
    // parented to it. Run once at GLView mount and again every time
    // the player advances stage or starts a new segment.
    const buildScene = (stage: number, seed: number): Scene => {
      const root = new THREE.Group();
      r.worldRoot.add(root);

      // Boss-arena variant: shorter playfield, no win line, no
      // horizon chunks, a back wall, extra guards, and a survive-
      // Boss round trigger: every 10th stage (10, 20, 30, ...) the
      // segment becomes a boss arena - smaller enclosed playfield
      // with a survive-the-timer goal handled in the update loop.
      // Replaces the prior dev-unlock toggle: the boss round is now
      // a guaranteed checkpoint at every 10-stage milestone.
      const isBossArena = stage > 0 && stage % 10 === 0;
      const ARENA_CHUNKS = 2; // ~48 m enclosed arena
      const ARENA_SURVIVE_SECONDS = 60;

      const segLengthMul = segmentLengthMulFor(stage);
      const chunkCount = isBossArena
        ? ARENA_CHUNKS
        : Math.max(
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

      // Win line is omitted on arena stages (no end zone to cross -
      // the goal is to survive the timer instead). The render loop
      // skips its opacity pulse when winLineMat is null.
      let winLineMat: THREE.MeshBasicMaterial | null = null;
      if (!isBossArena) {
        const winLine = createWinLine(segLen);
        winLineMat = winLine.material as THREE.MeshBasicMaterial;
        // The win line is built opaque; flip the material to transparent
        // so the render loop's opacity pulse actually shows up.
        winLineMat.transparent = true;
        root.add(winLine);
      }

      // Arena back wall: a wireframe panel running across the far
      // end of the playfield so the eye sees an enclosed yard.
      // Player z is already clamped to segmentEndZ in PlayerController
      // so this is purely visual.
      if (isBossArena) {
        const wallW = PLAY_HALF_W * 2 + 1.5;
        const wallH = 2.6;
        const wallGeo = new THREE.BoxGeometry(wallW, wallH, 0.05, 12, 5, 1);
        const wallMat = new THREE.MeshBasicMaterial({
          color: 0x111114,
          wireframe: true,
          transparent: true,
          opacity: 0.7,
        });
        const wall = new THREE.Mesh(wallGeo, wallMat);
        wall.position.set(0, wallH / 2, segLen);
        root.add(wall);
      }

      const baseVisionRange = visionRangeFor(stage);

      // Arena bumps the guard count by 2 so the smaller playfield
      // doesn't feel sparse. Capped further up by createGuardConfigs.
      // Boss arenas amp up entity counts so the survive-the-timer
      // round actually feels like a boss fight: +3 guards, +1 dog
      // beyond the stage default, and a minimum 4 cameras feeding
      // the alarm bar regardless of whether stage tuning would have
      // unlocked them yet. Detection rates are bumped 30% inside
      // the arena too (see the `tuning` block in update()).
      const guardCount = guardCountFor(stage) + (isBossArena ? 3 : 0);
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

      // Horizon chunks render past the gameplay end so the path
      // visually continues toward the mountains - a chained "next
      // segment" view that sells the endless-escape framing without
      // affecting collision, detection, or the win check (those all
      // ignore isHorizon chunks). Arenas skip them entirely so the
      // back wall reads as a real wall instead of teasing more yard.
      const HORIZON_CHUNKS = isBossArena ? 0 : 6;
      const procgen = new ProcgenSystem(seed, root, chunkCount, HORIZON_CHUNKS);
      procgen.init();

      // Guard home points are laid out on a fixed pattern, so a prop
      // can land right on one. Snap each home to the nearest cell a
      // guard can actually stand on, otherwise the guard spawns inside
      // the prop and can never move.
      for (const e of guardEntries) {
        const g = e.guard;
        const cell = procgen.nav.nearestFree(g.homeX, g.homeZ, 16);
        if (cell) {
          g.homeX = procgen.nav.colX(cell.col);
          g.homeZ = procgen.nav.rowZ(cell.row);
          g.x = g.homeX;
          g.z = g.homeZ;
          g.wanderTarget = { x: g.homeX, z: g.homeZ };
          e.figure.group.position.set(g.x, 0, g.z);
        }
      }

      // Snow weather: dust the top of every obstacle with a thin
      // white cap so the world reads as blanketed.
      if (weatherKind === 'snow') {
        dustObstaclesWithSnow(procgen.obstacles());
      }

      const razorWire = razorWireEnabledFor(stage);
      // Visual fence length = gameplay segment + horizon chunks +
      // small lead-in. Lets the fence keep going past the win line
      // so the eye doesn't see the path terminate.
      const fenceVisualLen = segLen + HORIZON_CHUNKS * CHUNK_LEN + 4;
      spawnFences(root, stage, weatherKind, segLen, razorWire, fenceVisualLen);
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
      const dogCount = dogCountFor(stage) + (isBossArena ? 1 : 0);
      for (let i = 0; i < dogCount && i < guards.length; i++) {
        const handler = guards[i];
        const d = createDog(i + 1, handler.id, handler.x + 1, handler.z);
        root.add(d.group);
        dogs.push(d);
      }

      // Boss arenas force a minimum of 4 cameras even on early-stage
      // arenas where the stage tuning wouldn't have unlocked any.
      const baseCameraCount = cameraCountFor(stage);
      const cameraCount = isBossArena
        ? Math.max(4, baseCameraCount)
        : baseCameraCount;
      const cameras: Camera[] = spawnCameras(root, segLen, cameraCount);

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
        isBossArena,
        bossSurviveSeconds: ARENA_SURVIVE_SECONDS,
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
    setBackdropSnow(backdrop, scene.weatherKind === 'snow');
    useStore
      .getState()
      .setBossTimeRemaining(scene.isBossArena ? scene.bossSurviveSeconds : 0);

    // Detach the active scene's world subtree from the renderer and
    // dispose its procgen chunks. Mount-once entities (player, smoke
    // clouds, projectiles) live elsewhere so they survive teardown.
    const tearDownScene = (s: Scene) => {
      s.procgen.dispose();
      r.worldRoot.remove(s.root);
      // Free per-instance GPU resources under the old scene root
      // (per-segment fence wireframes, ground plane, win line,
      // light-tower / camera / dog / guard meshes, threat arrows,
      // weather sheets, etc). Module-level shared geos / mats are
      // tagged userData.shared = true and are skipped by this walk.
      disposeSubtree(s.root);
    };

    // Swap the world for a fresh one matching the supplied stage and
    // seed, and re-tint the sky / ambient lights. Called when the
    // player advances stage or starts a new segment via the banner.
    // Caller must run resetSegment() afterwards to re-zero player +
    // accumulator state against the freshly built guards / dogs.
    const rebuildScene = (stage: number, seed: number) => {
      logDebug('log', 'rebuildScene', { stage, seed });
      tearDownScene(scene);
      scene = buildScene(stage, seed);
      applyStageLighting(r.renderer, r.scene, stage);
      setBackdropSnow(backdrop, scene.weatherKind === 'snow');
      // The boss countdown is re-armed by resetSegment(), which every
      // rebuild is followed by.
    };

    // Per-segment stats accumulators (stars input).
    const tracker = new RunTracker();
    // Scratch map reused every frame for dog smell per handler.
    const dogSmellByHandler = new Map<number, number>();
    let lastSegmentSeed = useStore.getState().segmentSeed;
    let lastStage = useStore.getState().stage;
    let lastRestartCounter = useStore.getState().restartCounter;
    // Tracks the last observed runState so we can detect a fresh
    // transition into 'playing' (e.g. tapping START on a new save
    // or finishing the tutorial prompt) and snap the player off of
    // wherever the splash-demo left them and back to spawn.
    let lastRunState = useStore.getState().runState;
    let animTime = 0;
    // Day/night cycle clock. Independent of animTime (which resets
    // on each segment) so the cycle progresses continuously across
    // resets / restarts and the player sees an unbroken sun-up
    // sun-down loop. Bumped each frame from the update tick.
    let cycleTime = 0;
    // Boss-arena countdown. Armed by resetSegment() (every rebuild,
    // restart and fresh run goes through it); the update loop ticks it
    // in real time during gameplay and fires handleWin at zero.
    // Inactive on linear segments.
    const bossClock = new BossClock();
    bossClock.arm(scene.isBossArena ? scene.bossSurviveSeconds : 0);
    const tmpVec = new THREE.Vector3();

    // Camera-shake state. handleCatch sets shakeRemaining to
    // SHAKE_DURATION; update() decays it; render() applies a small
    // sin-driven offset to camera position scaled by the remaining
    // fraction so the kick eases out smoothly.
    const SHAKE_DURATION = 0.28;
    let shakeRemaining = 0;

    // Idle splash-demo state. Drives the player figure on a slow
    // crouched ping-pong path while the start screen is up so the
    // backdrop reads as a living scene instead of a frozen still.
    const DEMO_PERIOD = 14;
    let demoTime = 0;

    // Brief sparkle animation on collected pickups: instead of
    // despawning the mesh immediately, scale it up and let it fade
    // out across PICKUP_GRAB_DURATION seconds so the player sees
    // their grab register. The owning Object3D outlives the procgen
    // scene-root so we keep our own list and clean it up here.
    const PICKUP_GRAB_DURATION = 0.22;
    type FadingPickup = { mesh: THREE.Object3D; age: number };
    const fadingPickups: FadingPickup[] = [];

    const resetSegment = () => {
      tracker.reset();
      bossClock.arm(scene.isBossArena ? scene.bossSurviveSeconds : 0);
      useStore.getState().setBossTimeRemaining(bossClock.displaySeconds());
      animTime = 0;
      player.x = 0;
      player.z = 1;
      player.isHidden = false;
      player.stance = 'walk';
      player.stamina = 1;
      player.exhausted = false;
      player.isRunning = false;
      player.vx = 0;
      player.vz = 0;
      const st = useStore.getState();
      st.setStance('walk');
      st.setRunning(false);
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
        resetNavState(g.nav);
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
      // Zero every input axis / toggle so the player doesn't carry
      // forward residual state from the splash demo (which scripts
      // axisY=0.62, stance=crouch) or from the prior segment (RUN
      // toggle held, look-yaw mid-rotation). Without this the player
      // sometimes spawns into a new segment already drifting forward
      // before the joystick is even touched.
      resetInput();
    };

    // `cause` distinguishes the catch path so the death banner can
    // pick its title. 'killed' = projectile hit; 'arrested' = body
    // contact (guard touch / dog / razor wire). The store keeps the
    // most recent cause so the banner reads it on the run-ending hit.
    // Set hearts to the stage's starting count plus the boss-perk
    // bonus (+1 if the player cleared a boss within the last 10
    // stages), then decay the perk counter. Centralised so every
    // fresh-stage path (boss auto-advance, win, restart) routes
    // through the same calc.
    const grantStartingHearts = (stage: number) => {
      const st = useStore.getState();
      const bonus = st.perkRemainingStages > 0 ? 1 : 0;
      st.setHearts(startingHeartsFor(stage) + bonus);
      st.decayBossPerk();
    };

    const handleCatch = (cause: 'arrested' | 'killed' = 'arrested') => {
      const st = useStore.getState();
      const remaining = st.hearts - 1;
      logDebug('log', 'handleCatch', { cause, stage: st.stage, remaining, isBossArena: scene.isBossArena });
      st.setHearts(remaining);
      st.setLastDeathCause(cause);
      tracker.onCatch();
      // Trigger the shield+skull catch flash. CatchFlash subscribes
      // to catchCounter; bumping it here means every hit (soft or
      // run-ending) plays the same brief notification before the
      // soft-restart respawn or the run-ending banner.
      st.bumpCatchCounter();
      projectiles.clear();
      shakeRemaining = SHAKE_DURATION;
      if (remaining <= 0) {
        haptics.caught();
        // Boss-round failure isn't a run-ender: the user wants the
        // arena to be a checkpoint that doesn't gate progression.
        // Advance to the next stage with a fresh hearts pool and
        // load the next segment instead of rolling the death banner.
        // Boss perk is NOT granted on failure - only a clear earns
        // the +1 heart buffer (handled in handleWin).
        if (scene.isBossArena) {
          const nextStage = st.stage + 1;
          st.setStage(nextStage);
          grantStartingHearts(nextStage);
          st.setLastStats(null);
          st.resetForSegment(st.segmentSeed + 1);
          return;
        }
        // Non-boss run-ending death: clear the boss perk so the
        // next run starts clean.
        st.clearBossPerk();
        // Final death (non-boss): mirror handleWin's stats build so
        // the death banner can render the same post-run summary the
        // win banner uses.
        const finalStats: RunStats = { ...tracker.snapshot(), stars: 0 };
        st.setLastStats(finalStats);
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
      player.exhausted = false;
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
        resetNavState(g.nav);
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
      // Soft restart after a hit: zero input so the player respawns
      // stationary even if the joystick was held mid-flight.
      resetInput();
      st.setStance('walk');
      st.setRunning(false);
    };

    const handleWin = () => {
      const st = useStore.getState();
      const justClearedStage = st.stage;
      logDebug('log', 'handleWin', { stage: justClearedStage, isBossArena: scene.isBossArena, runTime: tracker.runTime });
      const stats: Omit<RunStats, 'stars'> = tracker.snapshot();
      const stars = scoreStars(stats);
      st.setLastStats({ ...stats, stars });
      // Mirror the new high (if any) into the in-memory bestStars
      // map so the post-run banner shows the right number.
      st.recordSegmentStars(justClearedStage, stars);

      // Boss-arena clear: grant the perk. This refreshes the +1-
      // heart buffer for the next 10 stages. Failing the boss takes
      // the auto-advance branch in handleCatch and skips this.
      if (scene.isBossArena) {
        st.grantBossPerk();
      }

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
      // Hearts count for the *next* segment (post-Banner) routes
      // through grantStartingHearts so the boss perk's +1 buffer
      // applies + decays alongside the stage advance.
      grantStartingHearts(justClearedStage + 1);
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
      if (
        st.segmentSeed !== lastSegmentSeed ||
        st.stage !== lastStage
      ) {
        lastSegmentSeed = st.segmentSeed;
        lastStage = st.stage;
        rebuildScene(st.stage, st.segmentSeed);
        resetSegment();
        // Boss-round popup: every 10th stage (10, 20, 30, ...) is
        // an arena. Pause the world and pop a "BOSS ROUND" modal
        // before the survive-the-timer countdown starts so the
        // player isn't dropped into a fight cold.
        if (st.stage > 0 && st.stage % 10 === 0) {
          st.setPaused(true);
          st.setGameModal({
            title: 'BOSS ROUND',
            body: `Stage ${st.stage} is a boss arena. Survive 60 seconds inside the enclosed yard. Get caught and you advance to stage ${st.stage + 1} anyway - this round can't gate your run.`,
            actions: [
              {
                label: 'START',
                variant: 'primary',
                onPress: () => {
                  useStore.getState().setGameModal(null);
                  useStore.getState().setPaused(false);
                },
              },
            ],
          });
        }
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
        // Restart re-uses the current scene; heart count rolls
        // through grantStartingHearts so an active boss perk still
        // applies + decays on a mid-run restart.
        grantStartingHearts(st.stage);
        st.setLastStats(null);
        st.setRunState('playing');
        resetSegment();
      }
      // Fresh transition into gameplay (typically from the start
      // screen's NEW RUN / CONTINUE / tutorial prompt path). The
      // splash-demo loop has been driving player.x/z to drift the
      // figure across the yard during idle; without this catch the
      // player would inherit the demo's last position when the run
      // begins. Skip if a rebuild already ran above (resetSegment
      // would just be called twice).
      if (st.runState === 'playing' && lastRunState !== 'playing') {
        if (
          st.segmentSeed === lastSegmentSeed &&
          st.stage === lastStage &&
          st.restartCounter === lastRestartCounter
        ) {
          resetSegment();
        }
      }
      lastRunState = st.runState;

      if (st.runState !== 'playing' || st.paused) {
        projectiles.clear();
        // Silence the siren on pause / non-playing states so the
        // speaker doesn't keep wailing while the player is in menus.
        updateSiren(siren, 0, useStore.getState().masterVolume);
        // Splash-demo loop. Only runs while we're idle (start screen
        // up, no pause overlay). Drives scripted axis input + crouch
        // stance and then defers to the same updatePlayer that runs
        // during gameplay so the figure actually navigates around
        // obstacles instead of clipping through them.
        if (st.runState === 'idle' && !st.paused) {
          demoTime += dt;
          animTime += dt;
          // Bump the day/night cycle on the splash too so the
          // start screen shows the world fading the same way.
          cycleTime += dt;
          // Forward bias with a slow x-wander. The 0.62 forward
          // scalar keeps the cycle leisurely; the sin term makes the
          // path feel hand-piloted rather than ruler-straight.
          input.axisX = Math.sin(demoTime * 0.55) * 0.35;
          input.axisY = 0.62;
          input.run = false;
          input.stance = 'crouch';
          updatePlayer(
            player,
            scene.procgen.obstacles(),
            dt,
            scene.segmentEndZ,
            false,
          );
          // Loop back to spawn when the demo player nears the win
          // line so the splash never ends in a frozen pose.
          if (player.z >= scene.segmentEndZ - 4) {
            player.x = 0;
            player.z = 1;
          }
        }
        return;
      }

      tracker.tickTime(dt);
      animTime += dt;
      // Cycle uses raw dt (not effDt) so slow-mo + pause don't
      // freeze the day/night progression; the lighting feels alive
      // even during a slow-mo capture.
      cycleTime += dt;
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
      // Exhaustion switches the RUN toggle off inside updatePlayer;
      // mirror that onto the store so the button un-highlights.
      if (st.running !== input.run) st.setRunning(input.run);

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
          const hit = applyCrowbarStun(player.x, player.z, scene.guards);
          const arc = createSwingArc(player.x, player.z, CROWBAR_RANGE);
          r.worldRoot.add(arc.mesh);
          swingArcs.push(arc);
          haptics.pickupUse();
          // Always play the swing whoosh; layer the bonk thump on top
          // when contact actually lands. The two cue different things
          // for the player: whoosh = "you swung", bonk = "you connected".
          playPickupUse(pickupSounds, st.masterVolume);
          if (hit) playCrowbarBonk(pickupSounds, st.masterVolume);
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
      // Boss arenas: 30% bump on the detection meter rate + a
      // matching slowdown on decay so the player's "I broke LOS,
      // I'm safe" window is shorter inside the arena than out in
      // the open yard.
      const bossMul = scene.isBossArena ? 1.3 : 1.0;
      const tuning = {
        rateScale: detectionRateScaleFor(st.stage) * bossMul,
        decay: detectionDecayFor(st.stage) / bossMul,
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
      let maxDetection = 0;
      let chaserGuard: Guard | null = null;
      // Every dog moves exactly once per frame here; leashed dogs
      // report smell for their handler's meter.
      updateDogs(scene.dogs, scene.guards, player, effDt, dogSmellByHandler);
      for (const entry of scene.guardEntries) {
        const g = entry.guard;
        const prev = st.detection[g.id] ?? 0;
        // Boss guard sees ~50% further than the rest at boss stages.
        const guardRange =
          g.id === scene.bossGuardId
            ? effectiveVisionRangeWithAlarm * 1.5
            : effectiveVisionRangeWithAlarm;
        // Stun freeze: a crowbar-stunned guard's detection meter only
        // decays. Don't pile on dog smell, floodlight rate, or the
        // searchlight bump - otherwise the meter pegs while the guard
        // is frozen and the moment the stun ends they're already at
        // chase. updateDetection above already handles the vision /
        // noise side of the freeze.
        const stunned = g.stunTimer > 0;
        const dogSmell = stunned ? 0 : dogSmellByHandler.get(g.id) ?? 0;
        // Route external feeds through updateDetection so they suppress
        // the decay branch. Critical for early-stage spotlights: the
        // floodlight rate (0.125/s) is below the decay rate (0.15/s)
        // so adding the bump *after* the function would never move
        // the meter. With the bump inside, decay is skipped on any
        // frame where lit / dog / searchlight is feeding the guard.
        const externalBumps = stunned ? 0 : litAdd + dogSmell + searchlightBump;
        const next = updateDetection(
          g,
          player,
          scene.procgen.obstacles(),
          prev,
          effDt,
          guardRange,
          tuning,
          weatherNoise,
          smokeRegions,
          externalBumps,
        );
        nextDetection[g.id] = next;
        if (next > maxDetection) maxDetection = next;
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
        }, scene.procgen.nav);
      }

      // Sustained "!" markers above each guard. Priority order:
      //   stunned  -> red    (knocked out by crowbar)
      //   smoke    -> orange (guard inside an active smoke cloud)
      //   chase    -> red    (active pursuit)
      //   search   -> yellow (alert + investigate states share the
      //                       same "looking for the player" intent)
      // The marker is hidden when none of these apply; setGuardState-
      // Marker is a no-op when the kind hasn't changed so the bob /
      // pulse phase stays continuous frame-to-frame.
      for (const entry of scene.guardEntries) {
        const g = entry.guard;
        let kind: 'search' | 'chase' | 'stunned' | 'smoke' | null = null;
        if (g.stunTimer > 0) kind = 'stunned';
        else {
          // Smoke check uses the same regions list the DetectionSystem
          // consumes - any guard within an active cloud's radius gets
          // the orange marker.
          let inSmoke = false;
          for (const sr of smokeRegions) {
            const dx = g.x - sr.x;
            const dz = g.z - sr.z;
            if (dx * dx + dz * dz <= sr.radius * sr.radius) {
              inSmoke = true;
              break;
            }
          }
          if (inSmoke) kind = 'smoke';
          else if (g.state === 'chase') kind = 'chase';
          else if (g.state === 'alert' || g.state === 'investigate') {
            kind = 'search';
          }
        }
        setGuardStateMarker(entry.marker, kind);
        entry.lastState = g.state;
      }

      // Detached dogs that aren't paired with any handler still
      // need an update tick (they keep chasing the player even if
      // the handler has been despawned, which can't happen yet but
      // belt-and-braces). Also handle dog->player collision: dogs
      // count as a soft catch identical to a guard touch.
      for (const d of scene.dogs) {
        setDogTransform(d);
        if (dogHits(d, player)) {
          handleCatch();
          return;
        }
      }

      // Stats accumulators.
      tracker.tickDetection(maxDetection, effDt);

      // Live siren volume tracks the highest detection across guards,
      // multiplied by the master volume slider in the pause panel.
      updateSiren(siren, maxDetection, st.masterVolume);

      scene.procgen.update(player.z);

      if (scene.isBossArena) {
        // Survive-the-timer win: count down each frame, fire
        // handleWin when the clock hits zero. Mirror the integer
        // remaining seconds onto the store so the BossTimer HUD
        // can render without re-mounting on every frame.
        // Real-time dt: slow-mo must not stretch the survive timer.
        const finished = bossClock.tick(dt);
        const displaySec = bossClock.displaySeconds();
        if (st.bossTimeRemaining !== displaySec) {
          st.setBossTimeRemaining(displaySec);
        }
        if (finished) {
          handleWin();
          return;
        }
      } else if (player.z >= scene.segmentEndZ) {
        handleWin();
        return;
      }

      if (projectiles.update(effDt, player)) {
        handleCatch('killed');
        return;
      }

      // Body-contact arrest. ANY non-stunned guard touching the
      // player counts as an arrest, regardless of their AI state -
      // a wandering guard who walks into you is just as bad as a
      // chasing one. Stunned guards (crowbar) are frozen and don't
      // catch even on contact. Shooting stays gated on the chase
      // state inside updateGuard above, so distance threats still
      // come from active chasers and not patrolling guards.
      for (const g of scene.guards) {
        if (g.stunTimer > 0) continue;
        if (
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
      // Day/night cycle: applyDynamicLighting writes a smoothly
      // blended palette into the renderer + scene each frame so the
      // world fades through bright -> dusk -> night -> dawn -> ...
      // continuously, mirrored over a 3-minute round trip. Cheap
      // (lerps + uniform updates only) so the per-frame call doesn't
      // measurably affect framerate.
      applyDynamicLighting(r.renderer, r.scene, cycleTime);

      // Idle bob/spin on every uncollected pickup. Cheap; only the
      // mesh transform is touched.
      for (const p of scene.procgen.pickups()) animatePickup(p, animTime);

      // Win-line glow: pulse the opacity so the green plane reads as
      // an active goal rather than a static stripe. Runs at ~0.5 Hz.
      // Skipped on arena segments where winLineMat is null (no win
      // line - the timer is the goal).
      if (scene.winLineMat) {
        scene.winLineMat.opacity = 0.65 + 0.35 * Math.sin(animTime * 3.2);
      }

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
        // Knockout pose: the figure folds into a crouch, then flat
        // face-down, holds, then rises back to standing as stunTimer
        // ticks down. progress = 1 - stunTimer/CROWBAR_STUN_DURATION
        // gives 0 the moment the crowbar lands and 1 when the guard
        // wakes up.
        const stunProgress =
          g.stunTimer > 0
            ? Math.max(0, Math.min(1, 1 - g.stunTimer / CROWBAR_STUN_DURATION))
            : undefined;
        updateFigurePose(fig, {
          stance: 'walk',
          speed,
          isRunning: g.state === 'chase',
          facing: g.facing,
          time: animTime,
          stunProgress,
        });
        setFigurePosition(fig, g.x, g.z);
        // Override the swinging arm pose so flashlight + pistol stay
        // aimed reliably down the figure's facing direction. Skipped
        // while stunned - the knockout pose owns the arms and we
        // don't want the flashlight pointing forward from a flat-
        // on-the-ground guard. The vision-cone beam is also hidden
        // for the same reason: a face-down guard isn't lighting
        // anything up.
        if (stunProgress === undefined) {
          poseGuardArms(fig);
          entry.equipment.beam.visible = true;
        } else {
          entry.equipment.beam.visible = false;
        }
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
      <BossTimer />
      <EventFlash />
      <CatchFlash />
      <Banner />
      <StartScreen />
      <SettingsScreen />
      <Tutorial />
      <GameModal />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0b0d12' },
});
