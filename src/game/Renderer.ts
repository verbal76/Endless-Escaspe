import type { ExpoWebGLRenderingContext } from 'expo-gl';
import * as THREE from 'three';

export type GameRenderer = {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  gl: ExpoWebGLRenderingContext;
  renderer: THREE.WebGLRenderer;
  worldRoot: THREE.Group;
  // Cached light handles so per-stage lighting updates never have to
  // search the scene graph.
  ambient: THREE.AmbientLight;
  hemi: THREE.HemisphereLight;
  sun: THREE.DirectionalLight;
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
  // Daylight sky baseline for stage 1. applyStageLighting (called
  // from Game.tsx after each scene rebuild) re-tints the clear
  // colour, fog, and lights to the stage's sky / dusk / night look.
  renderer.setClearColor(0x88b4d8, 1);

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x88b4d8, 60, 800);

  const aspect = gl.drawingBufferWidth / gl.drawingBufferHeight;
  const camera = new THREE.PerspectiveCamera(60, aspect, 0.1, 1500);
  camera.position.set(0, 7, -8);
  camera.lookAt(0, 0, 6);

  const ambient = new THREE.AmbientLight(0xc8d4e0, 0.75);
  scene.add(ambient);
  // Sky / ground fill: tops of props catch the sky colour, undersides
  // the ground bounce, so shapes read without real shadows.
  const hemi = new THREE.HemisphereLight(0xcfe2ff, 0x6b5a44, 0.9);
  scene.add(hemi);
  // The sun sits behind and to the left of the camera (the camera
  // looks down +Z), so the faces the player sees are lit; it used to
  // sit ahead of the camera and every visible face was backlit.
  const sun = new THREE.DirectionalLight(0xfff6dd, 1.0);
  sun.position.set(-7, 12, -9);
  scene.add(sun);

  const worldRoot = new THREE.Group();
  scene.add(worldRoot);

  return {
    gl,
    renderer,
    scene,
    camera,
    worldRoot,
    ambient,
    hemi,
    sun,
    draw: () => {
      renderer.render(scene, camera);
      gl.endFrameEXP();
    },
  };
}
