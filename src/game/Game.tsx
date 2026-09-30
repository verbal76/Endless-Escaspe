import React, { useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { GLView } from 'expo-gl';
import type { ExpoWebGLRenderingContext } from 'expo-gl';
import * as THREE from 'three';

import { createRenderer } from './Renderer';
import { startLoop, type LoopHandle } from './Loop';
import { updateCameraRig } from './CameraRig';
import { ProcgenSystem, type ChunkPlan } from '../systems/ProcgenSystem';
import { ProjectileSystem } from '../systems/ProjectileSystem';
import { updatePlayer } from '../systems/PlayerController';
import { resetGuardMemory, updateGuard, hearNoiseAt, type GuardSenses } from '../systems/GuardAI';
import {
  EXTERNAL_FEED_GAIN,
  baseNoisePerSecond,
  noiseRadius,
  updateDetection,
  type DetectionResult,
} from '../systems/DetectionSystem';
import { isNearCover } from '../systems/HideSystem';
import {
  createGround,
  createGuard,
  createGuardConfigs,
  createGuardFigure,
  createPlayer,
  createPlayerFigure,
  createWinLine,
} from '../scenes/PrisonYard1';
import { useStore, type GameMode, type RunStats } from '../state/store';
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
  chunkDensityFor,
  forksEnabledFor,
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
  resetDog,
  scareDog,
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
import { HowToPlay } from '../components/HUD/HowToPlay';
import { GameModal } from '../components/HUD/GameModal';
import { Toast } from '../components/HUD/Toast';
import { DistanceHud } from '../components/HUD/DistanceHud';
import { EdgeVignette } from '../components/HUD/EdgeVignette';
import {
  clearDustField,
  createBurstPool,
  createDustField,
  spawnBurst,
  updateBursts,
  updateDustField,
} from '../scenes/Juice';
import {
  createAimLaser,
  createNoiseRing,
  createTargetMarker,
  updateAimLaser,
  updateNoiseRing,
  updateTargetMarker,
  type AimLaser,
} from '../scenes/StealthCues';
import { AIM_TIME_S } from '../systems/GuardAI';
import { BossTimer } from '../components/HUD/BossTimer';
import { logDebug } from '../util/debug';
import { runRenderAudit, type RenderAudit } from '../util/renderAudit';

const RENDER_AUDIT_DELAY_FRAMES = 3;
const RENDER_AUDIT_RETRY_FRAMES = 60;
const RENDER_AUDIT_RETRIES = 3;
import { disposeSubtree } from '../util/dispose';
import { createRadialMeter, updateRadialMeter } from '../scenes/RadialMeter';
import { createThreatArrow, updateThreatArrow, type ThreatArrow } from '../scenes/ThreatArrow';
import { spawnChainLinkWall, spawnFences } from '../scenes/Fence';
import { createBlobShadow, placeBlobShadow } from '../scenes/BlobShadows';
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
import {
  applyBackdropMood,
  createBackdrop,
  createTreeLine,
  followBackdrop,
  updateBackdropFar,
  setBackdropSnow,
  updateBackdrop,
} from '../scenes/Backdrop';
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
import { applyStageLighting, getStageLighting, type StageLighting } from '../scenes/Lighting';
import { createSiren, updateSiren, type SirenHandle } from '../scenes/Siren';
import { createMusic, type MusicPlayer } from '../scenes/Music';
import { MusicIntensity } from '../util/musicIntensity';
import {
  THROW_HEAR_RADIUS,
  clearRocks,
  createRockPool,
  launchRock,
  throwTarget,
  updateRocks,
} from '../scenes/ThrownRock';
import { TIPS, contextTip, levelTips, stageStartTips, type TipId } from '../util/stageTips';
import { createSfx, playSfx, type Sfx } from '../scenes/Sfx';
import { writeSaves, type Save } from '../util/storage';
import { haptics } from '../util/haptics';
import { scoreStars, timeTargetsFor } from '../util/scoring';
import { applyRunResult, type RunResult } from '../util/economy';
import { RunTracker } from '../util/runStats';
import { BossClock } from '../util/bossClock';
import { resetNavState } from '../systems/Navigator';

// Crowbar tuning. Range is intentionally short so the player has to
// commit to a melee approach; duration is long enough to clear a
// chase past a chokepoint but not so long it's a free pass.
const CROWBAR_RANGE = 3.0;
const CROWBAR_RANGE_SQ = CROWBAR_RANGE * CROWBAR_RANGE;
// Dogs are scared from a little further than a guard can be stunned;
// the target ring / button highlight use the same reach.
const CROWBAR_DOG_REACH = CROWBAR_RANGE + 0.5;
const CROWBAR_DOG_REACH_SQ = CROWBAR_DOG_REACH * CROWBAR_DOG_REACH;
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
    let playerOutfit = useStore.getState().playerOutfit;
    let playerFigure = createPlayerFigure(playerSkin, playerOutfit);
    r.worldRoot.add(playerFigure.group);

    const playerShadow = createBlobShadow(1.1);
    r.worldRoot.add(playerShadow);

    const backdrop = createBackdrop();
    r.worldRoot.add(backdrop.group);

    const radialMeter = createRadialMeter();
    r.worldRoot.add(radialMeter.group);

    // Stealth readability cues (mount-once): hearing radius around the
    // player and the crowbar target ring.
    const noiseRing = createNoiseRing();
    r.worldRoot.add(noiseRing.mesh);
    const crowbarMarker = createTargetMarker();
    r.worldRoot.add(crowbarMarker.mesh);
    // Pooled game-feel effects.
    const dust = createDustField();
    r.worldRoot.add(dust.root);
    const bursts = createBurstPool(4);
    r.worldRoot.add(bursts.root);
    const rocks = createRockPool(r.worldRoot, 2);
    // Last non-zero movement direction (throws go this way).
    let facingX = 0;
    let facingZ = 1;
    // Written by update(), read by render().
    let noiseRadiusNow = 0;
    let noiseLoudness = 0;
    let crowbarTarget: { x: number; z: number } | null = null;
    // Reused per-frame detection outputs.
    const senseOut: DetectionResult = { visual: false, heard: false };
    const guardSenses = new Map<number, GuardSenses>();
    const nextDetection = new Map<number, number>();
    // Detection floors requested this frame by distractions.
    const nextDetectionFloor = new Map<number, number>();

    const siren: SirenHandle = createSiren();
    const sfx: Sfx = createSfx();
    // Background music. Initial volume picked from the store so a
    // returning player gets the slider-saved level instead of the
    // default. The store-subscription below keeps the live track
    // synced with the slider while the panel is open.
    // Music level = master Volume x Music slider (the pause panel's
    // "Volume" is the master control for everything).
    const musicLevel = (st: { masterVolume: number; musicVolume: number }) => st.masterVolume * st.musicVolume;
    const music: MusicPlayer = createMusic(musicLevel(useStore.getState()));
    // Danger -> music mix (calm / alert / chase with hysteresis).
    const musicIntensity = new MusicIntensity();
    // Live-update the music volume whenever the slider moves. The
    // returned unsubscribe is intentionally not called - the music
    // is alive for the whole GLView lifetime, which matches the app's
    // lifetime in this codebase.
    void useStore.subscribe((st, prev) => {
      if (st.musicVolume !== prev.musicVolume || st.masterVolume !== prev.masterVolume) music.setVolume(musicLevel(st));
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
      // Laser sight shown during the shot wind-up.
      laser: AimLaser;
      shadow: THREE.Mesh;
      // Effective vision range this frame (drives the cone's length).
      range: number;
      // Summoned by a full camera alarm (removed on restart).
      reinforcement: boolean;
      // Endless: index of the streamed section that spawned this guard
      // (null for campaign guards and reinforcements).
      section: number | null;
      // Was this guard winding up a shot last frame (aim-click cue)?
      aiming: boolean;
    };

    type Section = { index: number; zStart: number; len: number; root: THREE.Group };

    type Scene = {
      // Parent Group for every per-segment mesh. Removing this from
      // r.worldRoot detaches the entire world in one operation; the
      // next buildScene() call constructs a fresh root.
      root: THREE.Group;
      mode: GameMode;
      // Endless / Daily: the world streams in sections and never ends.
      endless: boolean;
      seed: number;
      sections: Section[];
      nextSection: number;
      nextGuardId: number;
      // Furthest Z the player has reached (Endless distance).
      maxZ: number;
      ground: THREE.Mesh;
      segLen: number;
      segmentEndZ: number;
      weatherKind: WeatherKind;
      weatherEnabledAtInit: boolean;
      weather: Weather;
      groundMat: THREE.MeshLambertMaterial;
      // Win-line material is null for arena variants (no win line).
      winLineMat: THREE.MeshBasicMaterial | null;
      baseVisionRange: number;
      razorWire: boolean;
      guardEntries: GuardEntry[];
      guards: Guard[];
      procgen: ProcgenSystem;
      lightTowers: LightTower[];
      dogs: Dog[];
      dogShadows: THREE.Mesh[];
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
      // Camera-alarm reinforcements spawned this segment, and whether
      // the alarm was already full last frame (rising-edge detect).
      reinforcements: number;
      alarmWasFull: boolean;
    };

    // Guard flashlight cones are built at this length and scaled each
    // frame to the guard's real effective range.
    const BEAM_BASE_RANGE = 6;

    // Build one guard (figure, equipment, marker, laser) under `root`.
    const makeGuardEntry = (
      root: THREE.Group,
      cfg: { id: number; homeX: number; homeZ: number; homeRadius: number },
      baseVisionRange: number,
      reinforcement: boolean,
    ): GuardEntry => {
      const guard = createGuard(cfg);
      const figure = createGuardFigure();
      figure.group.position.set(guard.x, 0, guard.z);
      root.add(figure.group);
      const equipment = attachGuardEquipment(figure, baseVisionRange);
      const marker = createGuardStateMarker();
      figure.group.add(marker.group);
      guard.mesh = figure.group;
      const laser = createAimLaser();
      root.add(laser.mesh);
      const shadow = createBlobShadow(1.2);
      root.add(shadow);
      return {
        shadow,
        guard,
        figure,
        equipment,
        marker,
        lastState: guard.state,
        laser,
        range: baseVisionRange,
        reinforcement,
        section: null,
        aiming: false,
      };
    };

    // ---- Per-segment scene builder ----------------------------------
    // Constructs a fresh scene root with all stage-driven entities
    // (guards, dogs, cameras, towers, fences, procgen, weather, etc.)
    // parented to it. Run once at GLView mount and again every time
    // the player advances stage or starts a new segment.
    // A stretch of yard with its own guards / dogs / lights / cameras /
    // fences / trees. A campaign segment is ONE section; Endless and
    // Daily runs stream a new section in ahead of the player and drop
    // old ones behind.
    const populateSection = (s: Scene, index: number, zStart: number, len: number, level: number) => {
      const secRoot = new THREE.Group();
      s.root.add(secRoot);
      const isArena = s.isBossArena;
      const guardCount = guardCountFor(level) + (isArena ? 3 : 0);
      const firstGuard = s.guards.length;
      const configs = createGuardConfigs(guardCount, len, zStart, s.nextGuardId);
      s.nextGuardId += configs.length;
      for (const cfg of configs) {
        const e = makeGuardEntry(secRoot, cfg, BEAM_BASE_RANGE, false);
        if (s.endless) e.section = index;
        // Guard home points are laid out on a fixed pattern, so a prop
        // can land right on one. Snap each home to the nearest cell a
        // guard can actually stand on, otherwise the guard spawns
        // inside the prop and can never move.
        const cell = s.procgen.nav.nearestFree(e.guard.homeX, e.guard.homeZ, 16);
        if (cell) {
          const g = e.guard;
          g.homeX = s.procgen.nav.colX(cell.col);
          g.homeZ = s.procgen.nav.rowZ(cell.row);
          g.x = g.homeX;
          g.z = g.homeZ;
          g.wanderTarget = { x: g.homeX, z: g.homeZ };
          e.figure.group.position.set(g.x, 0, g.z);
        }
        s.guardEntries.push(e);
        s.guards.push(e.guard);
        const a = createThreatArrow();
        secRoot.add(a.mesh);
        s.threatArrows.push(a);
      }
      // Risk / reward forks in this stretch get a guard post in the
      // danger lane (a guard that barely leaves its spot).
      for (const f of s.procgen.forks()) {
        if (f.startZ < zStart || f.startZ >= zStart + len) continue;
        const e = makeGuardEntry(
          secRoot,
          { id: s.nextGuardId++, homeX: f.postX, homeZ: f.postZ, homeRadius: 1.5 },
          BEAM_BASE_RANGE,
          false,
        );
        e.guard.facing = -Math.PI / 2; // looking back toward the approach
        if (s.endless) e.section = index;
        s.guardEntries.push(e);
        s.guards.push(e.guard);
        const a = createThreatArrow();
        secRoot.add(a.mesh);
        s.threatArrows.push(a);
      }
      const sectionGuards = s.guards.slice(firstGuard);

      // Dogs: trail a designated handler guard, smell the player at
      // close range, detach into chase when the handler does.
      const dogCount = dogCountFor(level) + (isArena ? 1 : 0);
      for (let i = 0; i < dogCount && i < sectionGuards.length; i++) {
        const handler = sectionGuards[i];
        const d = createDog(s.nextGuardId * 100 + i, handler.id, handler.x + 1, handler.z);
        secRoot.add(d.group);
        s.dogs.push(d);
        const ds = createBlobShadow(0.9);
        secRoot.add(ds);
        s.dogShadows.push(ds);
      }

      const towers = spawnLightTowers(
        secRoot,
        len,
        lightTowerRowsFor(level),
        lightScanSpeedMulFor(level),
        level >= 8, // tracking from stage 8+
        zStart,
      );
      s.lightTowers.push(...towers);
      // Boss arenas force a minimum of 4 cameras even on early-stage
      // arenas where the stage tuning wouldn't have unlocked any.
      const camCount = isArena ? Math.max(4, cameraCountFor(level)) : cameraCountFor(level);
      s.cameras.push(...spawnCameras(secRoot, len, camCount, zStart));

      if (s.endless) {
        spawnFences(secRoot, moodStageFor(level, s.mode, s.seed), s.weatherKind, len, razorWireEnabledFor(level), len, zStart === 0 ? null : zStart);
        secRoot.add(createTreeLine(zStart === 0 ? -10 : zStart, zStart === 0 ? len + 10 : len, s.seed + index));
      }
      if (s.weatherKind === 'snow') {
        dustObstaclesWithSnow(s.procgen.obstacles().filter((o) => o.z >= zStart && o.z < zStart + len + CHUNK_LEN));
      }
      s.sections.push({ index, zStart, len, root: secRoot });
    };

    // Drop a section that is far behind the player (Endless).
    // Remove one guard (logic + meshes) and zero its detection so no
    // stale meter keeps the HUD alarm lit.
    const dropGuardAt = (s: Scene, i: number) => {
      const e = s.guardEntries[i];
      const arrow = s.threatArrows[i];
      for (const o of [e.figure.group, e.laser.mesh, e.shadow, arrow?.mesh]) {
        if (!o) continue;
        o.parent?.remove(o);
        disposeSubtree(o);
      }
      s.guardEntries.splice(i, 1);
      s.guards.splice(i, 1);
      s.threatArrows.splice(i, 1);
      if (e.reinforcement) s.reinforcements = Math.max(0, s.reinforcements - 1);
      useStore.getState().setDetection(e.guard.id, 0);
    };

    // A section is still in play while any of its guards is alerted /
    // investigating / chasing or any of its dogs is chasing: dropping
    // it then would make them vanish mid-pursuit.
    const sectionBusy = (s: Scene, sec: Section): boolean => {
      for (const e of s.guardEntries) {
        if (e.section === sec.index && e.guard.state !== 'wander' && e.guard.state !== 'return') return true;
      }
      for (const d of s.dogs) {
        if (d.group.parent === sec.root && d.state === 'chase') return true;
      }
      return false;
    };

    const removeSection = (s: Scene, sec: Section) => {
      // Guards belong to the section that spawned them (their home can
      // be snapped a few metres outside its Z range, so membership is
      // recorded rather than inferred from homeZ).
      for (let i = s.guardEntries.length - 1; i >= 0; i--) {
        if (s.guardEntries[i].section === sec.index) dropGuardAt(s, i);
      }
      for (let i = s.dogs.length - 1; i >= 0; i--) {
        if (s.dogs[i].group.parent === sec.root) {
          s.dogs.splice(i, 1);
          s.dogShadows.splice(i, 1);
        }
      }
      const end = sec.zStart + sec.len;
      s.lightTowers = s.lightTowers.filter((t) => t.z < sec.zStart || t.z >= end);
      s.cameras = s.cameras.filter((c) => c.z < sec.zStart || c.z >= end);
      s.root.remove(sec.root);
      disposeSubtree(sec.root);
      s.sections = s.sections.filter((x) => x !== sec);
    };

    // Endless / Daily: difficulty level for a world Z.
    const ENDLESS_SECTION_LEN = CHUNKS_AHEAD * CHUNK_LEN; // 120 m
    // Endless / Daily: one mood per run, picked from the run's seed
    // (day, afternoon, dusk or night - the moods of stages 1-4), so runs
    // differ but a Daily is the same for everyone that day. Independent
    // of the player's campaign progress.
    const moodStageFor = (stage: number, mode: GameMode, seed: number) =>
      mode === 'campaign' ? stage : 1 + (((seed >>> 0) * 2654435761) >>> 0) % 4;
    const levelAtZ = (z: number) => Math.min(30, 1 + Math.floor(Math.max(0, z) / ENDLESS_SECTION_LEN));

    const buildScene = (stage: number, seed: number, mode: GameMode = 'campaign'): Scene => {
      const root = new THREE.Group();
      r.worldRoot.add(root);
      const endless = mode !== 'campaign';

      // Boss round trigger: every 10th campaign stage (10, 20, 30, ...)
      // the segment becomes a boss arena - smaller enclosed playfield
      // with a survive-the-timer goal handled in the update loop.
      const isBossArena = !endless && stage > 0 && stage % 10 === 0;
      const ARENA_CHUNKS = 2; // ~48 m enclosed arena
      const ARENA_SURVIVE_SECONDS = 60;

      const segLengthMul = segmentLengthMulFor(stage);
      const chunkCount = endless
        ? 6
        : isBossArena
          ? ARENA_CHUNKS
          : Math.max(CHUNKS_AHEAD, Math.round(CHUNKS_AHEAD * segLengthMul));
      const segLen = chunkCount * CHUNK_LEN;

      const ground = createGround();
      const groundMat = ground.material as THREE.MeshLambertMaterial;
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
      const stormyForced = !endless && forceStormyWeatherFor(stage);
      let weatherKind: WeatherKind = weatherEnabledAtInit ? rolledWeatherKind : 'clear';
      if (stormyForced && weatherKind === 'clear') {
        // Coin flip between rain and snow so late stages don't always
        // pick the same storm type.
        weatherKind = (seed & 1) === 0 ? 'rain' : 'snow';
      }
      useStore.getState().setWeather(weatherKind);
      useStore.getState().setSegmentWeatherEnabled(weatherEnabledAtInit);
      const weather: Weather = createWeather(weatherKind, 0, 1);
      root.add(weather.group);
      if (weatherKind === 'snow') {
        // Snow cover: the grass texture stays (faintly showing through)
        // but a cool white emissive base carries the ground, dimmed with
        // the mood so night snow doesn't glow. Tinting the colour alone
        // left dark brown mud once textures decode as sRGB.
        const dark = getStageLighting(moodStageFor(stage, mode, seed)).darkness;
        groundMat.color.setHex(0xdfe6ec);
        groundMat.emissive.setHex(0xb4c0cc);
        groundMat.emissiveMap = null;
        groundMat.emissiveIntensity = 0.75 * (1 - 0.7 * dark);
        groundMat.needsUpdate = true;
        // Snow covers the worn yard floor too.
        const yardFloor = ground.getObjectByName('yardFloor');
        if (yardFloor) yardFloor.visible = false;
      }

      // Win line is omitted on arena stages (survive the timer) and in
      // Endless / Daily (there is no end).
      let winLineMat: THREE.MeshBasicMaterial | null = null;
      if (!isBossArena && !endless) {
        const winLine = createWinLine(segLen);
        winLineMat = winLine.material as THREE.MeshBasicMaterial;
        // The win line is built opaque; flip the material to transparent
        // so the render loop's opacity pulse actually shows up.
        winLineMat.transparent = true;
        root.add(winLine);
      }

      // Arena back wall: a chain-link panel across the far end of the
      // playfield so the eye sees an enclosed yard. Player z is already
      // clamped to segmentEndZ in PlayerController so this is purely
      // visual.
      if (isBossArena) {
        spawnChainLinkWall(root, PLAY_HALF_W * 2 + 0.6, 0, segLen);
      }

      // Layout plan: density rises with the stage (campaign) or with
      // distance (Endless); risk / reward forks from stage 3 - one per
      // campaign segment, every ~10 chunks in Endless.
      const forkSide: -1 | 1 = (seed & 2) === 0 ? 1 : -1;
      const campaignForkChunk = forksEnabledFor(stage) && !isBossArena && chunkCount >= 5 ? 2 + (seed % 2) : -1;
      const plan: ChunkPlan = endless
        ? (i) => ({
            spec: chunkDensityFor(levelAtZ(i * CHUNK_LEN)),
            fork: i % 10 === 8 && forksEnabledFor(levelAtZ(i * CHUNK_LEN)) ? (Math.floor(i / 10) % 2 === 0 ? forkSide : (-forkSide as -1 | 1)) : undefined,
          })
        : (i) => ({ spec: chunkDensityFor(stage), fork: i === campaignForkChunk ? forkSide : undefined });
      // Horizon chunks render past the gameplay end so the path
      // visually continues toward the mountains; arenas skip them so
      // the back wall reads as a real wall, and Endless has no end.
      const HORIZON_CHUNKS = isBossArena || endless ? 0 : 6;
      const procgen = new ProcgenSystem(seed, root, chunkCount, HORIZON_CHUNKS, plan);
      procgen.init();

      // Endless / Daily: the campaign stage must not leak into the run
      // (a Daily is the same yard and rules for everyone).
      const razorWire = razorWireEnabledFor(endless ? 1 : stage);
      const baseVisionRange = visionRangeFor(endless ? 1 : stage);
      const scene: Scene = {
        root,
        mode,
        endless,
        seed,
        segLen,
        segmentEndZ: endless ? procgen.endZ() - 2 : segLen,
        weatherKind,
        weatherEnabledAtInit,
        weather,
        ground,
        groundMat,
        winLineMat,
        baseVisionRange,
        razorWire,
        guardEntries: [],
        guards: [],
        procgen,
        lightTowers: [],
        dogs: [],
        dogShadows: [],
        cameras: [],
        threatArrows: [],
        bossStage: false,
        bossGuardId: -1,
        isBossArena,
        bossSurviveSeconds: ARENA_SURVIVE_SECONDS,
        reinforcements: 0,
        alarmWasFull: false,
        sections: [],
        nextSection: 0,
        nextGuardId: 1,
        maxZ: 0,
      };

      if (endless) {
        // First two sections now; the rest stream in as the player
        // advances (see streamEndless).
        for (let k = 0; k < 2; k++) {
          procgen.extendTo((k + 1) * ENDLESS_SECTION_LEN + CHUNK_LEN);
          populateSection(scene, k, k * ENDLESS_SECTION_LEN, ENDLESS_SECTION_LEN, levelAtZ(k * ENDLESS_SECTION_LEN));
          scene.nextSection = k + 1;
        }
        scene.segmentEndZ = procgen.endZ() - 2;
      } else {
        populateSection(scene, 0, 0, segLen, stage);
        scene.nextSection = 1;
        // Visual fence length = gameplay segment + horizon chunks +
        // small lead-in, so the fence keeps going past the win line.
        spawnFences(root, moodStageFor(stage, mode, seed), weatherKind, segLen, razorWire, segLen + HORIZON_CHUNKS * CHUNK_LEN + 4);
        root.add(createTreeLine(-10, segLen + HORIZON_CHUNKS * CHUNK_LEN + 40, seed));
        // Boss stage: the lead guard sees ~50% further (every 5th stage).
        if (isBossStage(stage) && scene.guards.length > 0) {
          scene.bossStage = true;
          scene.bossGuardId = scene.guards[0].id;
        }
      }
      return scene;
    };

    // Endless: generate ahead, populate new sections, drop old ones.
    const streamEndless = () => {
      const s = scene;
      const need = player.z + 2 * ENDLESS_SECTION_LEN;
      while (s.nextSection * ENDLESS_SECTION_LEN < need) {
        const k = s.nextSection;
        s.procgen.extendTo((k + 1) * ENDLESS_SECTION_LEN + CHUNK_LEN);
        populateSection(s, k, k * ENDLESS_SECTION_LEN, ENDLESS_SECTION_LEN, levelAtZ(k * ENDLESS_SECTION_LEN));
        s.nextSection = k + 1;
      }
      s.segmentEndZ = s.procgen.endZ() - 2;
      // Drop sections well behind the player once nothing in them is
      // still after the player (or unconditionally once they are very
      // far behind), and trim the level behind the oldest section kept.
      for (const sec of [...s.sections]) {
        const behind = player.z - (sec.zStart + sec.len);
        if (behind > 45 && (behind > 160 || !sectionBusy(s, sec))) removeSection(s, sec);
      }
      // Camera-alarm reinforcements left far behind: remove them so
      // the per-run cap doesn't run out for the rest of an endless run.
      for (let i = s.guardEntries.length - 1; i >= 0; i--) {
        const e = s.guardEntries[i];
        if (e.reinforcement && e.guard.z < player.z - 60 && e.guard.state !== 'chase') dropGuardAt(s, i);
      }
      const keepFrom = s.sections.length > 0 ? Math.min(player.z - 50, s.sections[0].zStart) : player.z - 50;
      s.procgen.trimBefore(keepFrom);
    };

    // ---- Initial scene ----------------------------------------------
    // Snapshot the stage at scene-init time. Most stage-driven knobs
    // are resolved once per buildScene; a few (decay, rate scale, AI
    // tier, slow-mo gate) are re-evaluated each frame because they're
    // cheap.
    const initialStage = useStore.getState().stage;
    let renderAuditIn = RENDER_AUDIT_DELAY_FRAMES;
    let renderAuditRetries = 0;
    let scene: Scene = buildScene(initialStage, useStore.getState().segmentSeed, useStore.getState().gameMode);

    // One lighting mood per stage (day / afternoon / dusk / night /
    // deep night; see Lighting.ts). Applied once per (re)build - the
    // mood never changes during a stage.
    // Rain is overcast: dim the sun and sky fill so rain reads as a
    // mood, not just falling lines.
    const applyWeatherLight = (s: Scene) => {
      if (s.weatherKind !== 'rain') return;
      r.sun.intensity *= 0.72;
      r.hemi.intensity *= 0.85;
    };
    let lighting: StageLighting = applyStageLighting(r, moodStageFor(initialStage, useStore.getState().gameMode, useStore.getState().segmentSeed));
    applyWeatherLight(scene);
    applyBackdropMood(backdrop, lighting);
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
    const rebuildScene = (stage: number, seed: number, mode: GameMode) => {
      logDebug('log', 'rebuildScene', { stage, seed, mode });
      renderAuditIn = RENDER_AUDIT_DELAY_FRAMES;
      tearDownScene(scene);
      scene = buildScene(stage, seed, mode);
      if (!scene.endless) backdrop.group.position.z = 0;
      lighting = applyStageLighting(r, moodStageFor(stage, mode, seed));
      applyWeatherLight(scene);
      applyBackdropMood(backdrop, lighting);
      setBackdropSnow(backdrop, scene.weatherKind === 'snow');
      // The boss countdown is re-armed by resetSegment(), which every
      // rebuild is followed by.
    };

    // Per-segment stats accumulators (stars input).
    const tracker = new RunTracker();
    // Camera alarm level (0..1); mirrored to the store for the HUD.
    let alarmLevel = 0;
    // Scratch map reused every frame for dog smell per handler.
    const dogSmellByHandler = new Map<number, number>();
    let lastSegmentSeed = useStore.getState().segmentSeed;
    let lastStage = useStore.getState().stage;
    let lastMode: GameMode = useStore.getState().gameMode;
    let lastRestartCounter = useStore.getState().restartCounter;
    // Tracks the last observed runState so we can detect a fresh
    // transition into 'playing' (e.g. tapping START on a new save
    // or finishing the tutorial prompt) and snap the player off of
    // wherever the splash-demo left them and back to spawn.
    let lastRunState = useStore.getState().runState;
    let animTime = 0;
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

    // Drop camera-alarm reinforcements (restart / new segment).
    const removeReinforcements = () => {
      if (scene.reinforcements === 0) return;
      for (let i = scene.guardEntries.length - 1; i >= 0; i--) {
        if (scene.guardEntries[i].reinforcement) dropGuardAt(scene, i);
      }
      scene.reinforcements = 0;
    };

    // Full camera alarm: dispatch a reinforcement guard from further
    // up the yard toward where the cameras last saw the player.
    const MAX_REINFORCEMENTS = 2;
    const summonReinforcement = (sightX: number, sightZ: number): boolean => {
      if (scene.reinforcements >= MAX_REINFORCEMENTS) return false;
      const nav = scene.procgen.nav;
      const side = scene.reinforcements % 2 === 0 ? 1 : -1;
      const wantZ = Math.min(scene.segmentEndZ - 2, player.z + 22);
      const cell = nav.nearestFree(side * (PLAY_HALF_W - 1.5), wantZ, 20);
      if (!cell) return false;
      const id = scene.nextGuardId++;
      const x = nav.colX(cell.col);
      const z = nav.rowZ(cell.row);
      const entry = makeGuardEntry(
        scene.root,
        { id, homeX: x, homeZ: z, homeRadius: 6 },
        BEAM_BASE_RANGE,
        true,
      );
      scene.guardEntries.push(entry);
      scene.guards.push(entry.guard);
      const arrow = createThreatArrow();
      scene.root.add(arrow.mesh);
      scene.threatArrows.push(arrow);
      hearNoiseAt(entry.guard, sightX, sightZ);
      // Seed the meter through the per-frame floor: the detection pass
      // reads the frame's store snapshot, so a direct store write here
      // would be overwritten with ~0 at the end of this frame.
      nextDetectionFloor.set(id, 0.45);
      scene.reinforcements++;
      return true;
    };

    // ---- In-game tutorial prompts ------------------------------------
    // One tip on screen at a time, spaced out; each tip is marked seen
    // on the active character save so it never repeats.
    const tipQueue: TipId[] = [];
    let tipCooldown = 0;
    let stageTipDelay = -1;
    // Endless / Daily: highest level whose tips were offered this run.
    let tipLevel = 1;
    // Throttle for the low-wall proximity check (seconds).
    let lowWallCheck = 0;
    const sessionSeen = new Set<string>();
    const seenTips = (): readonly string[] => {
      const st = useStore.getState();
      const save = st.activeSaveName ? st.saves[st.activeSaveName] : null;
      return save ? [...save.tipsSeen, ...sessionSeen] : [...sessionSeen];
    };
    // A tip counts as seen only once it has been on screen for
    // TIP_READ_S of actual play. One that is replaced by another toast,
    // cut off by a catch / run end, or expires behind the pause panel
    // goes back in the queue instead of being lost for this save.
    const TIP_READ_S = 2;
    let showingTip: { id: TipId; toastId: number; shown: number } | null = null;
    const queueTip = (id: TipId | null) => {
      if (!id || tipQueue.includes(id) || showingTip?.id === id || seenTips().includes(id)) return;
      tipQueue.push(id);
    };
    // Per-frame triggers (floodlight, camera, low wall) offer their
    // tip at most once per segment, without rebuilding the seen list
    // every frame.
    const offered = new Set<TipId>();
    const offerTip = (id: TipId) => {
      if (offered.has(id)) return;
      offered.add(id);
      queueTip(contextTip(id, seenTips()));
    };
    const markTipSeen = (id: TipId) => {
      sessionSeen.add(id);
      const st = useStore.getState();
      const key = st.activeSaveName;
      const save = key ? st.saves[key] : null;
      if (!key || !save || save.tipsSeen.includes(id)) return;
      const updated: Save = { ...save, tipsSeen: [...save.tipsSeen, id] };
      st.upsertSave(updated);
      writeSaves({ ...useStore.getState().saves, [key]: updated });
    };
    const tickTips = (dt: number) => {
      if (stageTipDelay >= 0) {
        stageTipDelay -= dt;
        if (stageTipDelay < 0) {
          if (scene.endless) queueTip(contextTip(scene.mode === 'daily' ? 'daily' : 'endless', seenTips()));
          else for (const id of stageStartTips(useStore.getState().stage, seenTips())) queueTip(id);
        }
      }
      if (showingTip) {
        const toast = useStore.getState().toast;
        if (toast && toast.id === showingTip.toastId) {
          showingTip.shown += dt;
          if (showingTip.shown >= TIP_READ_S) {
            markTipSeen(showingTip.id);
            showingTip = null;
          }
        } else {
          tipQueue.unshift(showingTip.id);
          showingTip = null;
          tipCooldown = Math.max(tipCooldown, 2);
        }
      }
      tipCooldown = Math.max(0, tipCooldown - dt);
      if (tipCooldown > 0 || tipQueue.length === 0 || showingTip) return;
      const id = tipQueue.shift() as TipId;
      if (seenTips().includes(id)) return;
      useStore.getState().showToast(TIPS[id], 'tip');
      const shown = useStore.getState().toast;
      if (shown) showingTip = { id, toastId: shown.id, shown: 0 };
      // Tip toasts hold ~4.7 s (Toast.tsx): leave a short gap after.
      tipCooldown = 5.4;
    };

    const resetSegment = () => {
      clearRocks(rocks);
      runId = `run-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
      tipQueue.length = 0;
      showingTip = null;
      stageTipDelay = 1.2;
      tipLevel = 1;
      offered.clear();
      clearDustField(dust);
      useStore.getState().setDangerLevel(0);
      pendingCatch = null;
      hitStopRemaining = 0;
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
      alarmLevel = 0;
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
        resetGuardMemory(g);
        st.setDetection(g.id, 0);
      }
      // Reset dogs to their handler's spawn position and cancel
      // any chase state.
      for (const d of scene.dogs) {
        const handler = scene.guards.find((g) => g.id === d.handlerGuardId);
        resetDog(d, handler ? handler.x + 1 : 0, handler ? handler.z : 1);
        setDogTransform(d);
      }
      removeReinforcements();
      scene.alarmWasFull = false;
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
    let bossIntroPending = false;
    let perkChargedStage = -1;
    let perkBonusThisStage = 0;
    const grantStartingHearts = (stage: number) => {
      const st = useStore.getState();
      // Endless / Daily: a fixed 3-heart run, no campaign boss perk.
      if (st.gameMode !== 'campaign') {
        st.setHearts(startingHeartsFor(1));
        return;
      }
      // The perk is charged once per stage entered: a restart or a
      // failed-boss retry of the same stage gets the same bonus as the
      // first attempt instead of decaying it again.
      if (stage !== perkChargedStage) {
        perkChargedStage = stage;
        perkBonusThisStage = st.perkRemainingStages > 0 ? 1 : 0;
        if (perkBonusThisStage) {
          st.decayBossPerk();
          queueTip(contextTip('perk', seenTips()));
        }
      }
      st.setHearts(startingHeartsFor(stage) + perkBonusThisStage);
    };

    // Hit-stop: on a catch the world freezes for HIT_STOP_S (camera
    // shake, red screen edge and the catch flash still play), THEN the
    // respawn / run-end resolves. Makes every hit land instead of the
    // player silently teleporting to spawn.
    const HIT_STOP_S = 0.14;
    let hitStopRemaining = 0;
    let pendingCatch: (() => void) | null = null;

    const handleCatch = (cause: 'arrested' | 'killed' = 'arrested') => {
      // Already frozen on a catch this frame / hit-stop: ignore extra
      // hits so one moment can't cost two hearts.
      if (pendingCatch) return;
      const st = useStore.getState();
      const remaining = st.hearts - 1;
      logDebug('log', 'handleCatch', { cause, stage: st.stage, remaining, isBossArena: scene.isBossArena });
      st.setHearts(remaining);
      st.setLastDeathCause(cause);
      tracker.onCatch();
      playSfx(sfx, cause === 'killed' ? 'hurt' : 'caught', st.masterVolume);
      // Trigger the shield+skull catch flash. CatchFlash subscribes
      // to catchCounter; bumping it here means every hit (soft or
      // run-ending) plays the same brief notification before the
      // soft-restart respawn or the run-ending banner.
      st.bumpCatchCounter();
      projectiles.clear();
      shakeRemaining = SHAKE_DURATION;
      const resolveRemaining = remaining;
      pendingCatch = () => resolveCatch(resolveRemaining);
      hitStopRemaining = HIT_STOP_S;
    };

    const ENDLESS_RESPAWN_BACK = 20;
    // How far behind their furthest point a player may walk back in
    // Endless (sections are dropped 45 m behind, the level 50 m).
    const ENDLESS_BACKTRACK = 30;
    const respawnPoint = (): { x: number; z: number } => {
      if (!scene.endless) return { x: 0, z: 1 };
      const z = Math.max(scene.procgen.startZ() + 3, scene.maxZ - ENDLESS_BACKTRACK + 2, player.z - ENDLESS_RESPAWN_BACK);
      const nav = scene.procgen.nav;
      const cell = nav.nearestFree(0, z, 16);
      return cell ? { x: nav.colX(cell.col), z: nav.rowZ(cell.row) } : { x: 0, z };
    };

    const resolveCatch = (remaining: number) => {
      const st = useStore.getState();
      if (remaining <= 0) {
        haptics.caught();
        // Boss-round failure: the round must be retried - losing
        // never advances the stage. Fresh hearts, same arena, timer
        // re-armed (resetSegment via the restart path). No boss perk:
        // only a clear earns that.
        if (scene.isBossArena) {
          st.setLastStats(null);
          st.requestRestart();
          st.showToast('Boss round failed - try again. Survive the timer to advance.', 'warn');
          return;
        }
        if (scene.endless) {
          finishEndlessRun();
          return;
        }
        // Non-boss run-ending death: clear the boss perk so the
        // next run starts clean.
        st.clearBossPerk();
        perkChargedStage = -1;
        perkBonusThisStage = 0;
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
      // Campaign: back to the start line. Endless / Daily: the world
      // behind the player has been streamed out, so respawn a short
      // way back from the catch on ground that still exists.
      const spawn = respawnPoint();
      player.x = spawn.x;
      player.z = spawn.z;
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
        resetGuardMemory(g);
        st.setDetection(g.id, 0);
      }
      for (const d of scene.dogs) {
        const handler = scene.guards.find((g) => g.id === d.handlerGuardId);
        resetDog(d, handler ? handler.x + 1 : 0, handler ? handler.z : 1);
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

    // Pay out a finished run to the active save (idempotent per run id)
    // and persist.
    let runId = `run-${Date.now()}`;
    const payRun = (result: RunResult): { earned: number; total: number; save: Save | null } => {
      const st = useStore.getState();
      const key = st.activeSaveName;
      const save = key ? st.saves[key] : null;
      if (!key || !save) return { earned: 0, total: 0, save: null };
      const { save: updated, earned } = applyRunResult(save, result);
      if (updated !== save) {
        st.upsertSave(updated);
        writeSaves({ ...useStore.getState().saves, [key]: updated });
      }
      return { earned, total: updated.coins, save: updated };
    };

    const finishEndlessRun = () => {
      const st = useStore.getState();
      const distanceM = Math.floor(scene.maxZ);
      const day = st.gameMode === 'daily' ? st.dailyDay : null;
      const paid = payRun(
        st.gameMode === 'daily' && day
          ? { kind: 'daily', runId, distanceM, day }
          : { kind: 'endless', runId, distanceM },
      );
      const best = paid.save
        ? st.gameMode === 'daily'
          ? paid.save.daily?.best ?? distanceM
          : paid.save.endlessBest
        : distanceM;
      st.setRunSummary({
        mode: st.gameMode,
        distanceM,
        bestM: best,
        coinsEarned: paid.earned,
        coinsTotal: paid.total,
        day,
      });
      st.setLastStats({ ...tracker.snapshot(), stars: 0 });
      st.setRunState('caught');
    };

    const handleWin = () => {
      const st = useStore.getState();
      const justClearedStage = st.stage;
      logDebug('log', 'handleWin', { stage: justClearedStage, isBossArena: scene.isBossArena, runTime: tracker.runTime });
      const stats: Omit<RunStats, 'stars'> = tracker.snapshot();
      const targets = timeTargetsFor(scene.segLen, scene.isBossArena ? scene.bossSurviveSeconds : null);
      const stars = scoreStars(stats, targets);
      st.setLastStats({ ...stats, stars, timeTarget3: targets.three });
      const paid = payRun({ kind: 'campaign', runId, stage: justClearedStage, stars });
      st.setRunSummary({
        mode: 'campaign',
        distanceM: 0,
        bestM: 0,
        coinsEarned: paid.earned,
        coinsTotal: paid.total,
        day: null,
      });
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
        st.stage !== lastStage ||
        st.gameMode !== lastMode
      ) {
        lastSegmentSeed = st.segmentSeed;
        lastStage = st.stage;
        lastMode = st.gameMode;
        rebuildScene(st.stage, st.segmentSeed, st.gameMode);
        resetSegment();
        // Every Endless / Daily (re)start is a fresh 3-heart run.
        if (scene.endless) grantStartingHearts(st.stage);
        // Boss-round popup: every 10th stage (10, 20, 30, ...) is an
        // arena. Shown once, when the arena actually starts (below) -
        // not here, where a rebuild can happen while the stage-cleared
        // banner is still up and again on NEXT SEGMENT.
        bossIntroPending = st.gameMode === 'campaign' && scene.isBossArena;
      }
      // Skin change (typically from a save load on the start screen):
      // detach the existing player figure and rebuild it with the
      // new skin so the in-world avatar matches the picker / save.
      if (st.playerSkin !== playerSkin || st.playerOutfit !== playerOutfit) {
        playerSkin = st.playerSkin;
        playerOutfit = st.playerOutfit;
        r.worldRoot.remove(playerFigure.group);
        playerFigure = createPlayerFigure(playerSkin, playerOutfit);
        renderAuditIn = RENDER_AUDIT_DELAY_FRAMES;
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
        // Endless / Daily streamed and trimmed the world as the player
        // went; a restart starts the run over from a fresh build.
        if (scene.endless) rebuildScene(st.stage, st.segmentSeed, st.gameMode);
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
        // A run started from the menu is a new run: the boss-perk
        // charge bookkeeping starts over with it.
        if (lastRunState === 'idle') {
          perkChargedStage = -1;
          perkBonusThisStage = 0;
        }
        if (
          st.segmentSeed === lastSegmentSeed &&
          st.stage === lastStage &&
          st.gameMode === lastMode &&
          st.restartCounter === lastRestartCounter
        ) {
          // Endless / Daily streamed and trimmed the previous world
          // (and its distance): every new run needs a fresh build and
          // fresh hearts, even when the seed is unchanged - e.g.
          // starting today's Daily again from the menu.
          if (scene.endless) rebuildScene(st.stage, st.segmentSeed, st.gameMode);
          resetSegment();
          if (scene.endless) grantStartingHearts(st.stage);
        }
      }
      lastRunState = st.runState;

      if (bossIntroPending && st.runState === 'playing' && !st.gameModal) {
        bossIntroPending = false;
        st.setPaused(true);
        st.setGameModal({
          title: 'BOSS ROUND',
          body: [
            startingHeartsFor(st.stage) < startingHeartsFor(st.stage - 1)
              ? `From this stage you start with ${startingHeartsFor(st.stage)} heart${startingHeartsFor(st.stage) === 1 ? '' : 's'}.`
              : '',
            `Survive 60 seconds in the arena. Lose every heart and you retry the round.`,
            `Win: +1 heart for the next 10 stages.`,
          ]
            .filter(Boolean)
            .join(' '),
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

      if (st.runState !== 'playing' || st.paused) {
        projectiles.clear();
        noiseRadiusNow = 0;
        crowbarTarget = null;
        st.setDangerLevel(0);
        const calmMix = musicIntensity.update(0, false, dt);
        music.setMix(calmMix.calmGain, calmMix.tensionGain, calmMix.rate);
        for (const e of scene.guardEntries) e.guard.aimTimer = 0;
        // Silence the siren on pause / non-playing states so the
        // speaker doesn't keep wailing while the player is in menus.
        updateSiren(siren, 0, useStore.getState().masterVolume);
        // Splash-demo loop. Only runs while we're idle (start screen
        // up, no pause overlay). Drives scripted axis input + crouch
        // stance and then defers to the same updatePlayer that runs
        // during gameplay so the figure actually navigates around
        // obstacles instead of clipping through them.
        // Menu: keep the title clear of falling rain / snow (the run
        // itself still has its weather).
        scene.weather.group.visible = st.runState !== 'idle';
        if (st.runState === 'idle' && !st.paused) {
          demoTime += dt;
          animTime += dt;
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
          // Keep the menu backdrop alive: falling rain / snow, drifting
          // clouds and birds (they froze in mid-air before).
          updateBackdrop(backdrop, dt);
          updateWeather(scene.weather, dt, player.x, player.z);
        }
        return;
      }

      // Hit-stop after a catch: hold the world still, then resolve the
      // respawn / run end.
      if (pendingCatch) {
        hitStopRemaining -= dt;
        if (shakeRemaining > 0) shakeRemaining = Math.max(0, shakeRemaining - dt);
        if (hitStopRemaining <= 0) {
          const resolve = pendingCatch;
          pendingCatch = null;
          resolve();
        }
        return;
      }

      tracker.tickTime(dt);
      tickTips(dt);
      for (const f of scene.procgen.forks()) {
        if (player.z > f.startZ - 12 && player.z < f.startZ) queueTip(contextTip('fork', seenTips()));
      }
      animTime += dt;
      // Difficulty level driving every stage-based knob this frame:
      // the campaign stage, or in Endless / Daily the level reached at
      // the player's distance.
      const stageNow = scene.endless ? levelAtZ(player.z) : st.stage;
      scene.weather.group.visible = true;
      if (shakeRemaining > 0) {
        shakeRemaining = Math.max(0, shakeRemaining - dt);
      }

      // Slow-mo close call: when detection is high AND a chasing
      // guard is right on top of you, stretch real-time briefly so
      // the player has a frame's grace to break LOS. Disabled past
      // the slow-mo tier so it doesn't carry late-stage runs.
      let timeScale = 1;
      if (slowMoEnabledFor(stageNow)) {
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

      if (scene.endless) {
        streamEndless();
        if (player.z > scene.maxZ) scene.maxZ = player.z;
        st.setDistance(scene.maxZ, levelAtZ(player.z));
        // Rules that switch on with the level get their tip here (the
        // campaign shows them at stage start).
        const lvl = levelAtZ(player.z);
        while (tipLevel < lvl) {
          tipLevel++;
          for (const id of levelTips(tipLevel, seenTips())) queueTip(id);
        }
      }
      // First low wall nearby while standing: teach that crouching
      // behind it hides you (standing needs taller cover).
      lowWallCheck -= dt;
      if (lowWallCheck <= 0) {
        lowWallCheck = 0.25;
        if (!player.isCrouched) {
          for (const o of scene.procgen.obstacles()) {
            if (o.kind !== 'lowwall') continue;
            const dx = o.x - player.x;
            const dz = o.z - player.z;
            if (dx * dx + dz * dz < 9) {
              offerTip('crouch');
              break;
            }
          }
        }
      }
      const staminaActive = staminaEnabledFor(stageNow);
      updatePlayer(player, scene.procgen.obstacles(), effDt, scene.segmentEndZ, staminaActive);
      // Endless / Daily: the world behind the player is streamed out;
      // don't let them walk back into the stripped stretch.
      if (scene.endless) {
        const back = Math.max(scene.procgen.startZ() + 2, scene.maxZ - ENDLESS_BACKTRACK);
        if (player.z < back) player.z = back;
      }
      const nearCover = isNearCover(player, scene.procgen.obstacles());
      if (player.stance !== st.stance) st.setStance(player.stance);
      st.setStamina(player.stamina);
      // Exhaustion switches the RUN toggle off inside updatePlayer;
      // mirror that onto the store so the button un-highlights.
      if (st.running !== input.run) st.setRunning(input.run);

      // Razor wire: touching the fence at razor-wire stages costs
      // a heart and resets the player to spawn. Treat it as a catch.
      // Endless: wire is drawn per section by level; match that.
      const wireLive = scene.endless ? razorWireEnabledFor(levelAtZ(player.z)) : scene.razorWire;
      if (wireLive && isTouchingFence(player.x)) {
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
          queueTip(contextTip(p.kind, seenTips()));
          spawnBurst(bursts, p.x, p.z);
          haptics.pickupGrab();
          playSfx(sfx, 'pickup_grab', st.masterVolume);
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
          let hit = applyCrowbarStun(player.x, player.z, scene.guards);
          // The swing also scares off any dog within reach.
          for (const d of scene.dogs) {
            if (scareDog(d, player.x, player.z, CROWBAR_DOG_REACH)) hit = true;
          }
          const arc = createSwingArc(player.x, player.z, CROWBAR_RANGE);
          r.worldRoot.add(arc.mesh);
          swingArcs.push(arc);
          haptics.pickupUse();
          // Always play the swing whoosh; layer the bonk thump on top
          // when contact actually lands. The two cue different things
          // for the player: whoosh = "you swung", bonk = "you connected".
          playSfx(sfx, 'crowbar_swing', st.masterVolume);
          if (hit) playSfx(sfx, 'crowbar_hit', st.masterVolume);
        }
      }
      if (Math.hypot(player.vx, player.vz) > 0.3) {
        facingX = player.vx;
        facingZ = player.vz;
      }
      if (input.throwRock) {
        input.throwRock = false;
        if (st.consumePickup('rock')) {
          const target = throwTarget(player.x, player.z, facingX, facingZ);
          launchRock(rocks, player.x, player.z, target.x, target.z);
          playSfx(sfx, 'throw', st.masterVolume);
          haptics.pickupUse();
        }
      }
      // Landed rocks make noise: every guard in earshot goes to look
      // at the landing spot (not at the player). Leashed dogs follow
      // their handler, so they go along.
      updateRocks(rocks, effDt, (lx, lz) => {
        const vol = Math.max(0.3, 1 - Math.hypot(lx - player.x, lz - player.z) / 25);
        playSfx(sfx, 'throw_land', st.masterVolume, vol);
        for (const g of scene.guards) {
          if (g.stunTimer > 0 || g.state === 'chase') continue;
          if (Math.hypot(g.x - lx, g.z - lz) > THROW_HEAR_RADIUS) continue;
          hearNoiseAt(g, lx, lz);
          const cur = st.detection[g.id] ?? 0;
          // Enough to investigate, never enough to chase.
          if (cur < 0.42) nextDetectionFloor.set(g.id, 0.42);
        }
      });
      if (input.useSmokeBomb) {
        input.useSmokeBomb = false;
        if (st.consumePickup('smokebomb')) {
          const cloud = createSmokeCloud(player.x, player.z);
          r.worldRoot.add(cloud.group);
          smokeClouds.push(cloud);
          haptics.pickupUse();
          playSfx(sfx, 'smoke_pop', st.masterVolume);
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
        if (!lit && isPlayerLit(t, player.x, player.z)) {
          lit = true;
          offerTip('floodlight');
        }
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
      const litBonus = lightVisionBonusFor(stageNow);
      // Night moods shorten guard sight in the dark, but a player
      // standing in a floodlight is fully visible whatever the hour -
      // so after dark the lights are what give you away.
      const baseRange = scene.endless ? visionRangeFor(stageNow) : scene.baseVisionRange;
      const effectiveVisionRange = (lit
        ? baseRange * (1 + litBonus)
        : baseRange * lighting.visionMul) * weatherVision;

      const litRateBase = lit
        ? player.isCrouched
          ? floodlightCrouchedRateFor(stageNow)
          : floodlightStandingRateFor(stageNow)
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
        rateScale: detectionRateScaleFor(stageNow) * bossMul,
        decay: detectionDecayFor(stageNow) / bossMul,
        noiseRangeWalkSq: noiseRangeWalkSqFor(stageNow),
        noiseRangeCrouchSq: noiseRangeCrouchSqFor(stageNow),
      };
      const aiTier = aiTierFor(stageNow);

      // Camera alarm bar: cameras feed a separate yard-alarm pool
      // that, when full, escalates every guard. Update first so the
      // guard pass below can read the current level.
      const newAlarm =
        scene.cameras.length > 0
          ? updateCameraAlarm(scene.cameras, player, scene.procgen.obstacles(), alarmLevel, effDt)
          : 0;
      // The authoritative level lives here: the store setter coalesces
      // sub-1% changes for the HUD, and feeding that coalesced value
      // back in (as before) meant per-frame increments (~0.0015) were
      // always dropped and the alarm could never fill.
      // First time a camera actually sees the player (any mode).
      if (newAlarm > alarmLevel) offerTip('cameras');
      alarmLevel = newAlarm;
      st.setAlarmLevel(newAlarm);
      // While the alarm is full, scale every guard's effective
      // vision range up by 25% - readable as "the whole yard is
      // looking for you now."
      const alarmHot = newAlarm >= 1.0;
      if (alarmHot && !scene.alarmWasFull) {
        if (summonReinforcement(player.x, player.z)) {
          st.showToast('ALARM! A guard has been dispatched', 'warn');
          haptics.heartLost();
        }
        // Every guard hears the alarm and converges on the sighting.
        for (const g of scene.guards) {
          if (g.state !== 'chase') hearNoiseAt(g, player.x, player.z);
        }
      }
      scene.alarmWasFull = alarmHot;
      const effectiveVisionRangeWithAlarm = alarmHot
        ? effectiveVisionRange * 1.25
        : effectiveVisionRange;

      // Pass 1: compute new detection for every guard, including
      // any dog smell contribution to the handler.
      nextDetection.clear();
      let maxDetection = 0;
      let anyVisual = false;
      let chaserGuard: Guard | null = null;
      // Every dog moves exactly once per frame here; leashed dogs
      // report smell for their handler's meter.
      updateDogs(scene.dogs, scene.guards, player, effDt, dogSmellByHandler, {
        grid: scene.procgen.nav,
        obstacles: scene.procgen.obstacles(),
        smoke: smokeRegions,
      });
      for (const entry of scene.guardEntries) {
        const g = entry.guard;
        const prev = Math.max(st.detection[g.id] ?? 0, nextDetectionFloor.get(g.id) ?? 0);
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
        // Floodlight and dog feeds now compete with decay whenever the
        // guard can't see the player, so they're scaled up to stay
        // meaningful; the searchlight jolt is a one-off and unscaled.
        const externalBumps = stunned
          ? 0
          : (litAdd + dogSmell) * EXTERNAL_FEED_GAIN + searchlightBump;
        entry.range = guardRange;
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
          senseOut,
        );
        nextDetection.set(g.id, next);
        let sense = guardSenses.get(g.id);
        if (!sense) {
          sense = { visual: false, heard: false, aiTier };
          guardSenses.set(g.id, sense);
        }
        sense.visual = senseOut.visual;
        sense.heard = senseOut.heard;
        sense.aiTier = aiTier;
        if (senseOut.visual) anyVisual = true;
        if (next > maxDetection) maxDetection = next;
        if (next >= 1.0 && !chaserGuard) chaserGuard = g;
      }

      st.setDetections(nextDetection);
      nextDetectionFloor.clear();
      // Pass 2: run guard AI. This
      // ordering lets us implement the AI tier-3 broadcast: if any
      // guard has hit chase, point the nearest other non-chase
      // guard at the same investigation target.
      for (const entry of scene.guardEntries) {
        const g = entry.guard;
        const next = nextDetection.get(g.id) ?? 0;
        // Tier 3 broadcast: silent investigation cue for non-chasing
        // guards in earshot of the chaser.
        if (aiTier >= 3 && chaserGuard && g.id !== chaserGuard.id && g.state !== 'chase') {
          const dx = g.x - chaserGuard.x;
          const dz = g.z - chaserGuard.z;
          if (dx * dx + dz * dz <= 400 /* 20m */) {
            // Radio call-out: head for where the chaser last SAW the
            // player, not the player's live position.
            const spot = chaserGuard.lastSeen;
            if (spot) hearNoiseAt(g, spot.x, spot.z);
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
          // Louder the closer the shooter.
          const shotDist = Math.hypot(gFiring.x - player.x, gFiring.z - player.z);
          playSfx(sfx, 'gunshot', st.masterVolume, Math.max(0.35, 1 - shotDist / 30));
        }, scene.procgen.nav, guardSenses.get(g.id));
        // Audible half of the shot telegraph: a click as the laser
        // sight comes up.
        const aimingNow = g.aimTimer > 0;
        if (aimingNow && !entry.aiming) {
          playSfx(sfx, 'aim_click', st.masterVolume);
          queueTip(contextTip('aimed', seenTips()));
        }
        entry.aiming = aimingNow;
      }

      // Tucked in safely: crouched by cover with no guard looking.
      player.isHidden = nearCover && !anyVisual;

      // Noise ring: how far the current action carries.
      noiseRadiusNow = noiseRadius(player, tuning, weatherNoise);
      noiseLoudness = noiseRadiusNow > 0 ? Math.min(1, baseNoisePerSecond(player) / 0.8) : 0;

      // Crowbar reach: nearest un-stunned guard or active dog in range.
      crowbarTarget = null;
      if (st.inventory.crowbar > 0) {
        let best = CROWBAR_RANGE_SQ;
        for (const g of scene.guards) {
          if (g.stunTimer > 0) continue;
          const dSq = (g.x - player.x) ** 2 + (g.z - player.z) ** 2;
          if (dSq <= best) {
            best = dSq;
            crowbarTarget = g;
          }
        }
        for (const d of scene.dogs) {
          if (d.state === 'flee') continue;
          const dSq = (d.x - player.x) ** 2 + (d.z - player.z) ** 2;
          if (dSq <= CROWBAR_DOG_REACH_SQ && (crowbarTarget === null || dSq < best)) {
            best = dSq;
            crowbarTarget = d;
          }
        }
      }
      st.setCrowbarInRange(crowbarTarget !== null);

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
      st.setDangerLevel(maxDetection);

      // Music reacts to danger: the tension layer rises with the
      // highest meter and takes over during a chase.
      let anyChase = false;
      for (const g of scene.guards) if (g.state === 'chase') anyChase = true;
      for (const d of scene.dogs) if (d.state === 'chase') anyChase = true;
      const mix = musicIntensity.update(maxDetection, anyChase, dt);
      music.setMix(mix.calmGain, mix.tensionGain, mix.rate);

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
      } else if (!scene.endless && player.z >= scene.segmentEndZ) {
        handleWin();
        return;
      }

      if (projectiles.update(effDt, player, scene.procgen.obstacles())) {
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


    // Wall-clock delta between rendered frames, for purely visual
    // smoothing that must not assume 60 fps.
    let lastRenderMs = 0;
    const render = (_alpha: number) => {
      const nowMs = Date.now();
      const renderDt = lastRenderMs ? Math.min(0.1, (nowMs - lastRenderMs) / 1000) : 1 / 60;
      lastRenderMs = nowMs;

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
      placeBlobShadow(playerShadow, player.x, player.z);
      for (let i = 0; i < scene.dogs.length; i++) {
        placeBlobShadow(scene.dogShadows[i], scene.dogs[i].x, scene.dogs[i].z);
      }

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
        placeBlobShadow(entry.shadow, g.x, g.z);
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
          // Cone length tracks the guard's real effective range (lit,
          // weather, alarm, boss guard) instead of the stage base.
          entry.equipment.beam.scale.setScalar(entry.range / BEAM_BASE_RANGE);
        } else {
          entry.equipment.beam.visible = false;
        }
        // Counter-rotate the state marker so it always faces the
        // camera direction (i.e. doesn't yaw with the figure). The
        // figure rotates around Y by figure.group.rotation.y; we
        // negate that on the marker's own Y rotation.
        entry.marker.group.rotation.y = -fig.group.rotation.y;
        entry.equipment.pistol.getWorldPosition(tmpVec);
        updateAimLaser(entry.laser, tmpVec, player.x, player.z, g.aimTimer / AIM_TIME_S, animTime);
        updateGuardStateMarker(entry.marker, renderDt);
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
      updateDustField(
        dust,
        renderDt,
        useStore.getState().runState === 'playing' &&
          player.isRunning &&
          !player.isCrouched &&
          scene.weatherKind !== 'snow' &&
          Math.hypot(player.vx, player.vz) > 4,
        player.x,
        player.z,
        player.vx,
        player.vz,
        r.camera,
        scene.weatherKind === 'rain' ? 0x8a8174 : 0xcbbfa6,
      );
      updateBursts(bursts, renderDt);
      updateNoiseRing(noiseRing, player.x, player.z, noiseRadiusNow, noiseLoudness, animTime, renderDt);
      updateTargetMarker(crowbarMarker, crowbarTarget, animTime);

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

      if (scene.endless) {
        // The ground tile repeats every 4 m, so snapping the plane in
        // 4 m steps keeps the pattern fixed in the world while the
        // plane follows the player indefinitely.
        scene.ground.position.z = 400 + Math.round(player.z / 4) * 4;
        followBackdrop(backdrop, player.z);
      }
      updateBackdropFar(backdrop, player.x, player.z);
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
      // A few frames after each scene build (textures are uploaded
      // lazily on first draw), check what is really on screen: which
      // meshes are textured vs flat fallback, and whether the GPU
      // textures hold the source images (util/renderAudit.ts).
      // Problems are re-checked a few times a second apart before they
      // stand (images can still be decoding on the web build).
      if (renderAuditIn > 0 && --renderAuditIn === 0) {
        let audit: RenderAudit;
        try {
          audit = runRenderAudit(r.renderer, r.scene);
        } catch (e) {
          // A diagnostic must never take the game down.
          logDebug('error', '[render-audit] crashed', e);
          audit = { groups: {} as RenderAudit['groups'], gpu: [], problems: [] };
        }
        if (audit.problems.length > 0 && renderAuditRetries < RENDER_AUDIT_RETRIES) {
          renderAuditRetries++;
          renderAuditIn = RENDER_AUDIT_RETRY_FRAMES;
        } else {
          renderAuditRetries = 0;
          if (audit.problems.length > 0) logDebug('warn', '[render-audit]', audit.problems);
        }
      }
    };

    loopRef.current = startLoop({ update, render });
  };

  return (
    <View style={styles.root}>
      <GLView style={StyleSheet.absoluteFill} onContextCreate={onContextCreate} />
      <AlarmOverlay />
      <EdgeVignette />
      <Joystick />
      <RunButton />
      <ActionButtons />
      <PickupBag />
      <LookButtons />
      <Hearts />
      <StaminaBar />
      <AlarmBar />
      <BossTimer />
      <DistanceHud />
      <EventFlash />
      <CatchFlash />
      <Banner />
      <StartScreen />
      <SettingsScreen />
      <Tutorial />
      <HowToPlay where="home" />
      <GameModal />
      <Toast />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0b0d12' },
});
