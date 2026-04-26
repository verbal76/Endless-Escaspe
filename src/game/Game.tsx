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
import {
  createFacingMarker,
  createGround,
  createGuard,
  createGuardMesh,
  createPlayer,
  createPlayerMesh,
  createWinLine,
} from '../scenes/PrisonYard1';
import { useStore } from '../state/store';
import { CHUNK_LEN, CHUNKS_AHEAD, PLAYER_RADIUS } from '../util/geometry';
import { circleHit } from '../util/collision';

import { Joystick } from '../components/HUD/Joystick';
import { ActionButtons } from '../components/HUD/ActionButtons';
import { Hearts } from '../components/HUD/Hearts';
import { DetectionMarker } from '../components/HUD/DetectionMarker';
import { Banner } from '../components/HUD/Banner';
import { AlarmOverlay } from '../components/HUD/AlarmOverlay';
import { HiddenBadge } from '../components/HUD/HiddenBadge';
import { SettingsScreen } from '../components/HUD/SettingsScreen';

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

    const guard = createGuard();
    guard.mesh = createGuardMesh();
    guard.mesh.position.set(guard.x, 0.7, guard.z);
    r.worldRoot.add(guard.mesh);
    guard.visionMesh = createFacingMarker();
    guard.visionMesh.position.set(0, 0.05, 2);
    guard.mesh.add(guard.visionMesh);

    const procgen = new ProcgenSystem(useStore.getState().segmentSeed, r.worldRoot);
    procgen.init();

    const projectiles = new ProjectileSystem(r.worldRoot);

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
      player.isProne = false;
      player.isHidden = false;
      player.isCrouched = false;
      st.setHidden(false);
      guard.x = guard.waypoints[0].x;
      guard.z = guard.waypoints[0].z;
      guard.waypointIndex = 0;
      guard.fireCooldown = 0;
      st.setDetection(guard.id, 0);
    };

    const update = (dt: number) => {
      const st = useStore.getState();
      if (st.runState !== 'playing') {
        projectiles.clear();
        return;
      }

      updatePlayer(player, procgen.obstacles(), dt, segmentEndZ);
      // Mirror prone state into the store so the HUD's PRONE pill stays
      // in sync without re-rendering each frame.
      if (player.isProne !== st.isHidden) st.setHidden(player.isProne);

      const prev = st.detection[guard.id] ?? 0;
      const next = updateDetection(guard, player, procgen.obstacles(), prev, dt);
      st.setDetection(guard.id, next);

      updateGuard(guard, player, next, dt, (g, tx, tz) => {
        projectiles.spawn(g.x, g.z, tx, tz);
      });

      procgen.update(player.z);

      // Win condition.
      if (player.z >= segmentEndZ) {
        projectiles.clear();
        st.setRunState('cleared');
        st.setHearts(3);
        return;
      }

      // Projectile-driven catch.
      if (projectiles.update(dt, player)) {
        handleCatch();
        return;
      }

      // Direct-contact catch (chase + body collision) stays as a backup.
      if (
        guard.state === 'chase' &&
        circleHit(
          { x: player.x, z: player.z, r: PLAYER_RADIUS },
          { x: guard.x, z: guard.z, r: 0.6 },
        )
      ) {
        handleCatch();
      }
    };

    const render = (_alpha: number) => {
      playerMesh.position.x = player.x;
      playerMesh.position.z = player.z;
      // Standing 1.0 / Crouched 0.55 / Prone 0.30 (lay flat).
      playerMesh.scale.y = player.isProne ? 0.30 : player.isCrouched ? 0.55 : 1;
      playerMat.opacity = 1;

      if (guard.mesh) {
        guard.mesh.position.x = guard.x;
        guard.mesh.position.z = guard.z;
        guard.mesh.rotation.y = -guard.facing + Math.PI / 2;
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
      <ActionButtons />
      <Hearts />
      <HiddenBadge />
      <DetectionMarker />
      <Banner />
      <SettingsScreen />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0b0d12' },
});
