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
  createFacingMarker,
  createGround,
  createGuard,
  createGuardConfigs,
  createGuardMesh,
  createPlayer,
  createPlayerMesh,
  createWinLine,
} from '../scenes/PrisonYard1';
import { useStore } from '../state/store';
import type { Guard } from '../types/world';
import { CHUNK_LEN, CHUNKS_AHEAD, PLAYER_RADIUS } from '../util/geometry';
import { circleHit } from '../util/collision';

import { Joystick } from '../components/HUD/Joystick';
import { ActionButtons } from '../components/HUD/ActionButtons';
import { RunButton } from '../components/HUD/RunButton';
import { Hearts } from '../components/HUD/Hearts';
import { Banner } from '../components/HUD/Banner';
import { AlarmOverlay } from '../components/HUD/AlarmOverlay';
import { HiddenBadge } from '../components/HUD/HiddenBadge';
import { SettingsScreen } from '../components/HUD/SettingsScreen';
import { createRadialMeter, updateRadialMeter } from '../scenes/RadialMeter';
import { createThreatArrow, updateThreatArrow, type ThreatArrow } from '../scenes/ThreatArrow';
import { spawnFences } from '../scenes/Fence';
import { spawnLightTowers, updateLightTower, isPlayerLit, type LightTower } from '../scenes/LightTower';

export function Game() {
  const loopRef = useRef<LoopHandle | null>(null);

  const onContextCreate = (gl: ExpoWebGLRenderingContext) => {
    const r = createRenderer(gl);

    const ground = createGround();
    r.worldRoot.add(ground);

    const winLine = createWinLine();
    r.worldRoot.add(winLine);

    const player = createPlayer();
    const playerMesh = createPlayerMesh();
    const playerMat = playerMesh.material as THREE.MeshStandardMaterial;
    r.worldRoot.add(playerMesh);

    // Two guards, separate home zones (see createGuardConfigs).
    const guards: Guard[] = createGuardConfigs().map((cfg) => {
      const g = createGuard(cfg);
      g.mesh = createGuardMesh();
      g.mesh.position.set(g.x, 0.7, g.z);
      r.worldRoot.add(g.mesh);
      g.visionMesh = createFacingMarker();
      g.visionMesh.position.set(0, 0.05, 2);
      g.mesh.add(g.visionMesh);
      return g;
    });

    const procgen = new ProcgenSystem(useStore.getState().segmentSeed, r.worldRoot);
    procgen.init();

    const projectiles = new ProjectileSystem(r.worldRoot);

    // Side fences (cosmetic; collision is via PlayerController X clamp).
    spawnFences(r.worldRoot);

    // Scanning floodlight towers; player walking through their lit
    // footprint adds detection to every guard.
    const lightTowers: LightTower[] = spawnLightTowers(r.worldRoot);

    // 3D radial detection meter parented to the world root and moved
    // to the player each frame.
    const radialMeter = createRadialMeter();
    r.worldRoot.add(radialMeter.group);

    // One threat arrow per guard.
    const threatArrows: ThreatArrow[] = guards.map(() => {
      const a = createThreatArrow();
      r.worldRoot.add(a.mesh);
      return a;
    });

    const segmentEndZ = CHUNK_LEN * CHUNKS_AHEAD;

    const handleCatch = () => {
      const st = useStore.getState();
      const remaining = st.hearts - 1;
      st.setHearts(remaining);
      projectiles.clear();
      if (remaining <= 0) {
        st.setRunState('caught');
        return;
      }
      // Soft restart inside the segment.
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

    const update = (dt: number) => {
      const st = useStore.getState();
      if (st.runState !== 'playing') {
        projectiles.clear();
        return;
      }

      updatePlayer(player, procgen.obstacles(), dt, segmentEndZ);
      updateHide(player, procgen.obstacles());
      if (player.stance !== st.stance) st.setStance(player.stance);

      // Light tower scan + lit-detection bump. Walking through a
      // floodlight footprint accelerates EVERY guard's detection,
      // even guards without direct line of sight.
      let lit = false;
      for (const t of lightTowers) {
        updateLightTower(t, dt);
        if (!lit && isPlayerLit(t, player.x, player.z)) lit = true;
      }
      // Soft when crouched / prone (smaller silhouette catches less light),
      // strong when standing.
      const litRate = player.isProne ? 0.15 : player.isCrouched ? 0.30 : 0.55;

      for (const g of guards) {
        const prev = st.detection[g.id] ?? 0;
        let next = updateDetection(g, player, procgen.obstacles(), prev, dt);
        if (lit) {
          next = Math.min(1, next + litRate * dt);
        }
        st.setDetection(g.id, next);
        updateGuard(g, player, next, dt, procgen.obstacles(), (gFiring, tx, tz) => {
          projectiles.spawn(gFiring.x, gFiring.z, tx, tz);
        });
      }

      procgen.update(player.z);

      // Win condition.
      if (player.z >= segmentEndZ) {
        projectiles.clear();
        st.setRunState('cleared');
        st.setHearts(3);
        return;
      }

      // Projectile-driven catch (any projectile from any guard).
      if (projectiles.update(dt, player)) {
        handleCatch();
        return;
      }

      // Direct-contact catch from any chasing guard.
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
      playerMesh.position.x = player.x;
      playerMesh.position.z = player.z;
      if (player.isProne) {
        // Lay flat along Z; sit low on the ground.
        playerMesh.rotation.x = Math.PI / 2;
        playerMesh.scale.set(1, 1, 1);
        playerMesh.position.y = 0.25;
      } else if (player.isCrouched) {
        playerMesh.rotation.x = 0;
        playerMesh.scale.set(1, 0.55, 1);
        playerMesh.position.y = 0.5;
      } else {
        playerMesh.rotation.x = 0;
        playerMesh.scale.set(1, 1, 1);
        playerMesh.position.y = 0.7;
      }
      playerMat.opacity = 1;

      for (const g of guards) {
        if (!g.mesh) continue;
        g.mesh.position.x = g.x;
        g.mesh.position.z = g.z;
        g.mesh.rotation.y = -g.facing + Math.PI / 2;
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

      // Threat arrows: one per guard, only visible while that guard
      // contributes detection; aimed FROM player TOWARD that guard.
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
      <Hearts />
      <HiddenBadge />
      <Banner />
      <SettingsScreen />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0b0d12' },
});
