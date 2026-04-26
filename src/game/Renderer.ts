import { Renderer as ExpoTHREERenderer } from 'expo-three';
import type { ExpoWebGLRenderingContext } from 'expo-gl';
import * as THREE from 'three';

export type GameRenderer = {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  gl: ExpoWebGLRenderingContext;
  renderer: ExpoTHREERenderer;
  worldRoot: THREE.Group;
  draw: () => void;
};

export function createRenderer(gl: ExpoWebGLRenderingContext): GameRenderer {
  const renderer = new ExpoTHREERenderer({ gl });
  renderer.setSize(gl.drawingBufferWidth, gl.drawingBufferHeight);
  renderer.setClearColor(0x0b0d12, 1);

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x0b0d12, 25, 70);

  const aspect = gl.drawingBufferWidth / gl.drawingBufferHeight;
  const camera = new THREE.PerspectiveCamera(60, aspect, 0.1, 200);
  camera.position.set(0, 7, -8);
  camera.lookAt(0, 0, 6);

  const ambient = new THREE.AmbientLight(0x99aacc, 0.55);
  scene.add(ambient);
  const sun = new THREE.DirectionalLight(0xffe7b3, 0.85);
  sun.position.set(8, 14, 4);
  scene.add(sun);

  const worldRoot = new THREE.Group();
  scene.add(worldRoot);

  return {
    gl,
    renderer,
    scene,
    camera,
    worldRoot,
    draw: () => {
      renderer.render(scene, camera);
      gl.endFrameEXP();
    },
  };
}
