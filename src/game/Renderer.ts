import type { ExpoWebGLRenderingContext } from 'expo-gl';
import * as THREE from 'three';

export type GameRenderer = {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  gl: ExpoWebGLRenderingContext;
  renderer: THREE.WebGLRenderer;
  worldRoot: THREE.Group;
  draw: () => void;
};

// three's WebGLRenderer expects a DOM canvas; expo-gl gives us a raw GL
// context, so we hand it a minimal shim with the methods three actually
// touches during construction (size, style, no-op listeners).
function makeCanvasShim(gl: ExpoWebGLRenderingContext) {
  return {
    width: gl.drawingBufferWidth,
    height: gl.drawingBufferHeight,
    clientWidth: gl.drawingBufferWidth,
    clientHeight: gl.drawingBufferHeight,
    style: {},
    addEventListener: () => {},
    removeEventListener: () => {},
    getContext: () => gl,
  } as unknown as HTMLCanvasElement;
}

export function createRenderer(gl: ExpoWebGLRenderingContext): GameRenderer {
  const renderer = new THREE.WebGLRenderer({
    canvas: makeCanvasShim(gl),
    context: gl as unknown as WebGLRenderingContext,
    antialias: false,
  });
  renderer.setSize(gl.drawingBufferWidth, gl.drawingBufferHeight);
  // Dawn / dusk sky so the snow-capped backdrop reads against
  // something other than pitch black. Fog ramps in late and far
  // (60 -> 800) so distant mountain meshes stay visible while
  // the playfield still gets atmospheric depth.
  renderer.setClearColor(0x4a6178, 1);

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x4a6178, 60, 800);

  const aspect = gl.drawingBufferWidth / gl.drawingBufferHeight;
  // Far plane bumped to 1500 so the mountain range at z ~700 is
  // inside the view frustum.
  const camera = new THREE.PerspectiveCamera(60, aspect, 0.1, 1500);
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
