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
import {
  CHUNK_LEN,
  CHUNKS_AHEAD,
  LIGHT_VISION_BONUS,
  PLAYER_RADIUS,
  getVisionRange,
} from '../util/geometry';
import { circleHit } from '../util/collision';

import { Joystick } from '../components/HUD/Joystick';
import { ActionButtons } from '../components/HUD/ActionButtons';
import { RunButton } from '../components/HUD/RunButton';
import { LookButtons } from '../components/HUD/LookButtons';
import { Hearts } from '../components/HUD/Hearts';
import { Banner } from '../components/HUD/Banner';
import { StartScreen } from '../components/HUD/StartScreen';
import { AlarmOverlay } from '../components/HUD/AlarmOverlay';
import { SettingsScreen } from '../components/HUD/SettingsScreen';
import { createRadialMeter, updateRadialMeter } from '../scenes/RadialMeter';
import { createThreatArrow, updateThreatArrow, type ThreatArrow } from '../scenes/ThreatArrow';
import { spawnFences } from '../scenes/Fence';
import { spawnLightTowers, updateLightTower, isPlayerLit, type LightTower } from '../scenes/LightTower';
import {
  type BlockyFigure,
  setFigurePosition,
  updateFigurePose,
} from '../scenes/BlockyFigure';
import { attachGuardEquipment, poseGuardArms, type GuardEquipment } from '../scenes/GuardEquipment';
import { createBackdrop, updateBackdrop } from '../scenes/Backdrop';
import {
  createWeather,
  noiseMultiplier,
  pickWeather,
  updateWeather,
  visionMultiplier,
  type Weather,
} from '../scenes/Weather';
import { dustObstaclesWithSnow } from '../scenes/SnowCaps';
import { applyStageLighting } from '../scenes/Lighting';
import { createSiren, updateSiren, type SirenHandle } from '../scenes/Siren';
import { saveBestStars, writeSaves, type Save } from '../util/storage';

// Stats thresholds. Higher = lenient; lower = stingy.
const STAT_DETECTED_3 = 3;   // <= seconds detected for 3 stars on this metric
const STAT_DETECTED_2 = 12;
const STAT_TIMES_3 = 0;
const STAT_TIMES_2 = 2;
const STAT_TIME_3 = 60;
const STAT_TIME_2 = 120;
const SEEN_THRESHOLD = 0.5;
const DETECTED_THRESHOLD = 0.3;

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

    const ground = createGround();
    const groundMat = ground.material as THREE.MeshStandardMaterial;
    r.worldRoot.add(ground);

    const backdrop = createBackdrop();
    r.worldRoot.add(backdrop.group);

    // Per-segment weather. Picked deterministically from the segment
    // seed so a restart of the same segment gets the same conditions.
    // If the user has weather effects toggled off, force clear and
    // boost the AI senses (see the update loop below) so toggling
    // off doesn't hand the player a free pass.
    const weatherEnabledAtInit = useStore.getState().weatherEnabled;
    const rolledWeatherKind = pickWeather(useStore.getState().segmentSeed);
    const weatherKind = weatherEnabledAtInit ? rolledWeatherKind : 'clear';
    useStore.getState().setWeather(weatherKind);
    const weather: Weather = createWeather(weatherKind, 0, 1);
    r.worldRoot.add(weather.group);
    if (weatherKind === 'snow') {
      groundMat.color.setHex(0xc8d6dc);
    }

    const winLine = createWinLine();
    r.worldRoot.add(winLine);

    const player = createPlayer();
    const playerFigure = createPlayerFigure(useStore.getState().playerSkin);
    r.worldRoot.add(playerFigure.group);

    const baseVisionRange = getVisionRange(useStore.getState().stage);

    type GuardEntry = { guard: Guard; figure: BlockyFigure; equipment: GuardEquipment };
    const guardEntries: GuardEntry[] = createGuardConfigs().map((cfg) => {
      const guard = createGuard(cfg);
      const figure = createGuardFigure();
      figure.group.position.set(guard.x, 0, guard.z);
      r.worldRoot.add(figure.group);
      // Equipment: flashlight (with visible beam) + pistol on the
      // figure's arms. Forced "extended forward" pose every render
      // so they stay aimed reliably.
      const equipment = attachGuardEquipment(figure, baseVisionRange);
      // Wire the legacy mesh field so guard-touching catch logic
      // still has something non-null to reference - but its rotation
      // is no longer used for aiming.
      guard.mesh = figure.group;
      return { guard, figure, equipment };
    });
    const guards: Guard[] = guardEntries.map((e) => e.guard);

    const procgen = new ProcgenSystem(useStore.getState().segmentSeed, r.worldRoot);
    procgen.init();

    // Snow weather: dust the top of every obstacle with a thin
    // white cap so the world reads as blanketed.
    if (weatherKind === 'snow') {
      dustObstaclesWithSnow(procgen.obstacles());
    }

    // Per-stage scene lighting (day -> dusk -> night).
    applyStageLighting(r.renderer, r.scene, useStore.getState().stage);

    // Real siren: synthesised WAV played by expo-audio when detection
    // is above PLAY_THRESHOLD; volume tracks the meter.
    const siren: SirenHandle = createSiren();

    const projectiles = new ProjectileSystem(r.worldRoot);

    spawnFences(r.worldRoot, useStore.getState().stage, weatherKind);
    const lightTowers: LightTower[] = spawnLightTowers(r.worldRoot);

    const radialMeter = createRadialMeter();
    r.worldRoot.add(radialMeter.group);

    const threatArrows: ThreatArrow[] = guards.map(() => {
      const a = createThreatArrow();
      r.worldRoot.add(a.mesh);
      return a;
    });

    const segmentEndZ = CHUNK_LEN * CHUNKS_AHEAD;

    // Per-run stats accumulators.
    let runTime = 0;
    let timeDetectedAcc = 0;
    let timesSeenAcc = 0;
    let prevAnyDetected = false;
    let lastSegmentSeed = useStore.getState().segmentSeed;
    let lastRestartCounter = useStore.getState().restartCounter;
    let animTime = 0;
    const tmpVec = new THREE.Vector3();

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
      const st = useStore.getState();
      st.setStance('walk');
      for (const g of guards) {
        g.x = g.homeX;
        g.z = g.homeZ;
        g.state = 'wander';
        g.behaviorTimer = 0;
        g.wanderTimer = 0;
        g.investigationTarget = null;
        g.fireCooldown = 0;
        st.setDetection(g.id, 0);
      }
      projectiles.clear();
    };

    const handleCatch = () => {
      const st = useStore.getState();
      const remaining = st.hearts - 1;
      st.setHearts(remaining);
      projectiles.clear();
      if (remaining <= 0) {
        st.setRunState('caught');
        return;
      }
      // Soft restart inside the segment - keep run stats so the
      // end-of-segment board reflects all attempts in this run.
      player.x = 0;
      player.z = 1;
      player.isHidden = false;
      player.stance = 'walk';
      st.setStance('walk');
      for (const g of guards) {
        g.x = g.homeX;
        g.z = g.homeZ;
        g.state = 'wander';
        g.behaviorTimer = 0;
        g.wanderTimer = 0;
        g.investigationTarget = null;
        g.fireCooldown = 0;
        st.setDetection(g.id, 0);
      }
    };

    const handleWin = () => {
      const st = useStore.getState();
      const stats: Omit<RunStats, 'stars'> = {
        timesSeen: timesSeenAcc,
        timeDetected: timeDetectedAcc,
        runDurationS: runTime,
        livesUsed: 3 - st.hearts,
      };
      const stars = scoreStars(stats);
      st.setLastStats({ ...stats, stars });
      const isNewHigh = st.recordSegmentStars(st.stage, stars);
      if (isNewHigh) {
        // Persist out of band; failure to save is non-fatal (storage
        // helper swallows errors).
        saveBestStars(useStore.getState().bestStars);
      }
      // Advance to the next stage so the next run is harder (longer
      // vision, dimmer light, etc.).
      st.setStage(st.stage + 1);

      // Mirror stage progress onto the active character save so
      // "Continue" picks up at the new stage on the next launch.
      const after = useStore.getState();
      const key = after.activeSaveName;
      if (key) {
        const existing = after.saves[key];
        if (existing) {
          const updated: Save = {
            ...existing,
            stage: after.stage,
            updatedAt: Date.now(),
          };
          after.upsertSave(updated);
          writeSaves({ ...after.saves, [key]: updated });
        }
      }

      st.setRunState('cleared');
      st.setHearts(3);
      projectiles.clear();
    };

    const update = (dt: number) => {
      const st = useStore.getState();

      // Detect external state transitions (segment seed change from
      // Banner's Next Segment, or restart request from pause panel).
      if (st.segmentSeed !== lastSegmentSeed) {
        lastSegmentSeed = st.segmentSeed;
        resetSegment();
      }
      if (st.restartCounter !== lastRestartCounter) {
        lastRestartCounter = st.restartCounter;
        st.setHearts(3);
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

      updateBackdrop(backdrop, dt);
      updateWeather(weather, dt, player.x, player.z);

      updatePlayer(player, procgen.obstacles(), dt, segmentEndZ);
      updateHide(player, procgen.obstacles());
      if (player.stance !== st.stance) st.setStance(player.stance);

      let lit = false;
      for (const t of lightTowers) {
        updateLightTower(t, dt);
        if (!lit && isPlayerLit(t, player.x, player.z)) lit = true;
      }
      // Weather modifiers: snow boosts vision (player more visible
      // against bright background); rain dampens player noise.
      // Compensation: if weather effects are toggled OFF, give the
      // AI a constant +10% vision and a stronger light tower bonus
      // so the player doesn't get an easier game by hitting the
      // toggle. weatherEnabled is fixed for the lifetime of the
      // segment (captured at init); changing the toggle takes effect
      // on the next segment.
      const weatherVision = weatherEnabledAtInit
        ? visionMultiplier(weather.kind)
        : 1.10;
      const weatherNoise = weatherEnabledAtInit
        ? noiseMultiplier(weather.kind)
        : 1.0;
      const litBonus = weatherEnabledAtInit ? LIGHT_VISION_BONUS : 0.18;
      const effectiveVisionRange = (lit
        ? baseVisionRange * (1 + litBonus)
        : baseVisionRange) * weatherVision;

      // Standing in a floodlight footprint adds detection directly
      // to every guard, on top of the vision range bonus. Crouching
      // halves the contribution (smaller silhouette). Per-second
      // rate, scaled by dt.
      const litRate = lit ? (player.isCrouched ? 0.10 : 0.25) : 0;
      const litAdd = litRate * dt;

      let anyDetected = false;
      let maxDetection = 0;
      for (const entry of guardEntries) {
        const g = entry.guard;
        const prev = st.detection[g.id] ?? 0;
        const visionAndNoise = updateDetection(
          g,
          player,
          procgen.obstacles(),
          prev,
          dt,
          effectiveVisionRange,
          weatherNoise,
        );
        // Apply the floodlight bump on top.
        const next = Math.min(1, visionAndNoise + litAdd);
        st.setDetection(g.id, next);
        if (next > maxDetection) maxDetection = next;
        if (next > DETECTED_THRESHOLD) anyDetected = true;
        updateGuard(g, player, next, dt, procgen.obstacles(), (gFiring, tx, tz) => {
          // Origin: pistol world position from the firing guard's
          // figure. Falls back to guard centre if the matrix isn't
          // ready (defensive).
          const firingEntry = guardEntries.find((e) => e.guard.id === gFiring.id);
          let fx = gFiring.x;
          let fz = gFiring.z;
          if (firingEntry) {
            firingEntry.equipment.pistol.getWorldPosition(tmpVec);
            fx = tmpVec.x;
            fz = tmpVec.z;
          }
          projectiles.spawn(fx, fz, tx, tz);
        });
      }

      // Stats accumulators.
      if (anyDetected) timeDetectedAcc += dt;
      if (maxDetection > SEEN_THRESHOLD && !prevAnyDetected) timesSeenAcc++;
      prevAnyDetected = maxDetection > SEEN_THRESHOLD;

      // Live siren volume tracks the highest detection across guards,
      // multiplied by the master volume slider in the pause panel.
      updateSiren(siren, maxDetection, st.masterVolume);

      procgen.update(player.z);

      if (player.z >= segmentEndZ) {
        handleWin();
        return;
      }

      if (projectiles.update(dt, player)) {
        handleCatch();
        return;
      }

      for (const g of guards) {
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

      for (const entry of guardEntries) {
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
      }

      // Radial meter follows the player; lit by the highest detection.
      radialMeter.group.position.set(player.x, 0, player.z);
      const detectionMap = useStore.getState().detection;
      let maxDetection = 0;
      for (let i = 0; i < guards.length; i++) {
        const v = detectionMap[guards[i].id] ?? 0;
        if (v > maxDetection) maxDetection = v;
      }
      updateRadialMeter(radialMeter, maxDetection);

      for (let i = 0; i < guards.length; i++) {
        const g = guards[i];
        const v = detectionMap[g.id] ?? 0;
        updateThreatArrow(threatArrows[i], player.x, player.z, g.x, g.z, v);
      }

      updateCameraRig(r.camera, player, 1 / 60);
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
      <LookButtons />
      <Hearts />
      <Banner />
      <StartScreen />
      <SettingsScreen />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0b0d12' },
});
