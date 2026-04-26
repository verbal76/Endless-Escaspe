import React, { useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { GLView } from 'expo-gl';
import type { ExpoWebGLRenderingContext } from 'expo-gl';
import * as THREE from 'three';

import { createRenderer } from './Renderer';
import { startLoop, type LoopHandle } from './Loop';
import { updateCameraRig } from './CameraRig';
import { ProcgenSystem } from '../systems/ProcgenSystem';
import { updatePlayer } from '../systems/PlayerController';
import { updateGuard } from '../systems/GuardAI';
import { updateDetection } from '../systems/DetectionSystem';
import { updateHide } from '../systems/HideSystem';
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
    r.worldRoot.add(playerMesh);

    const guard = createGuard();
    guard.mesh = createGuardMesh();
    guard.mesh.position.set(guard.x, 0.7, guard.z);
    r.worldRoot.add(guard.mesh);
    guard.visionMesh = createFacingMarker();
    // Anchor as child of guard so it inherits position+rotation; offset forward 2m.
    guard.visionMesh.position.set(0, 0.05, 2);
    guard.mesh.add(guard.visionMesh);

    const procgen = new ProcgenSystem(useStore.getState().segmentSeed, r.worldRoot);
    procgen.init();

    const segmentEndZ = CHUNK_LEN * CHUNKS_AHEAD;

    const update = (dt: number) => {
      const st = useStore.getState();
      if (st.runState !== 'playing') return;

      updatePlayer(player, procgen.obstacles(), dt);
      updateHide(player, procgen.obstacles());
      const prev = st.detection[guard.id] ?? 0;
      const next = updateDetection(guard, player, procgen.obstacles(), prev, dt);
      st.setDetection(guard.id, next);
      updateGuard(guard, player, next, dt);
      procgen.update(player.z);

      // Win condition
      if (player.z >= segmentEndZ) {
        st.setRunState('cleared');
        st.setHearts(3);
        return;
      }

      // Catch condition: chase + contact
      if (
        guard.state === 'chase' &&
        circleHit(
          { x: player.x, z: player.z, r: PLAYER_RADIUS },
          { x: guard.x, z: guard.z, r: 0.6 },
        )
      ) {
        const remaining = st.hearts - 1;
        st.setHearts(remaining);
        if (remaining <= 0) {
          st.setRunState('caught');
        } else {
          // Soft restart: zero player + detection, keep segment seed.
          player.x = 0;
          player.z = 1;
          player.isHidden = false;
          guard.x = guard.waypoints[0].x;
          guard.z = guard.waypoints[0].z;
          guard.waypointIndex = 0;
          st.setDetection(guard.id, 0);
        }
      }
    };

    const render = (_alpha: number) => {
      playerMesh.position.x = player.x;
      playerMesh.position.z = player.z;
      playerMesh.scale.y = player.isCrouched ? 0.55 : 1;
      playerMesh.visible = !player.isHidden;

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
      <Joystick />
      <ActionButtons />
      <Hearts />
      <DetectionMarker />
      <Banner />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0b0d12' },
});
