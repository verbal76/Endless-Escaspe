import * as THREE from 'three';
import type { Guard, Player } from '../types/world';
import {
  CHUNK_LEN,
  CHUNKS_AHEAD,
  PLAY_HALF_W,
  VISION_CONE_DEG,
} from '../util/geometry';
import { createModelFigure, type ModelFigure } from './ModelFigure';
import { getGrassTexture } from '../util/textures';
import { createNavState } from '../systems/Navigator';

// Player + guard figures are now Kenney-modelled OBJs (see
// ModelFigure.ts) instead of the procedural blocks. Public API names
// (createPlayerFigure / createGuardFigure / BlockyFigure-shaped result)
// stay the same so the rest of the codebase keeps working through
// a `ModelFigure` type alias.
export type BlockyFigure = ModelFigure;
// Legacy colour exports kept for compatibility with any caller that
// pulled them in (e.g. UI tints). The actual figure colours now live
// in ModelFigure.PALETTES, keyed by character kind.
export const PLAYER_COLOR = 0xa05423;
export const GUARD_COLOR = 0x2b4f8e;

// Skin tone palette - shared by player choice and randomised guard
// heads. Beige is a warm pale tan; brown is a deeper, warmer tan.
export const SKIN_BEIGE = 0xe8c697;
export const SKIN_BROWN = 0x7e4f2a;

export function skinHex(skin: 'beige' | 'brown'): number {
  return skin === 'brown' ? SKIN_BROWN : SKIN_BEIGE;
}

export function createPlayer(): Player {
  return {
    x: 0,
    z: 1,
    vx: 0,
    vz: 0,
    stance: 'walk',
    isRunning: false,
    isCrouched: false,
    isHidden: false,
    stamina: 1,
    exhausted: false,
  };
}

// Player figure: maps the two save-skin choices onto the two prisoner
// uniforms.
//   beige -> character D (yellow striped jumpsuit)
//   brown -> character G (grey + red striped jumpsuit)
export function createPlayerFigure(skin: 'beige' | 'brown' = 'beige'): ModelFigure {
  return createModelFigure(skin === 'brown' ? 'g' : 'd');
}

export type GuardConfig = {
  id: number;
  homeX: number;
  homeZ: number;
  homeRadius: number;
};

export function createGuard(cfg: GuardConfig): Guard {
  return {
    id: cfg.id,
    x: cfg.homeX,
    z: cfg.homeZ,
    facing: 0,
    state: 'wander',
    homeX: cfg.homeX,
    homeZ: cfg.homeZ,
    homeRadius: cfg.homeRadius,
    wanderTarget: { x: cfg.homeX, z: cfg.homeZ },
    wanderTimer: 0,
    behaviorTimer: 0,
    investigationTarget: null,
    fireCooldown: 0,
    stunTimer: 0,
    nav: createNavState(),
    lastSeen: null,
    lastHeard: null,
    sinceSeen: 999,
    hearTimer: 0,
    lookTimer: 0,
    lookBase: 0,
    aimTimer: 0,
    mesh: null,
    visionMesh: null,
  };
}

// Guards split the segment along Z into vertical zones; they
// alternate sides on X. Two-guard layout for early stages; later
// stages add up to three more, packed across the segment so coverage
// scales with difficulty without leaving the player nowhere to go.
export function createGuardConfigs(
  guardCount: number,
  segLen: number,
): GuardConfig[] {
  const n = Math.max(1, guardCount | 0);
  const halfX = Math.max(2, PLAY_HALF_W * 0.55);
  const configs: GuardConfig[] = [];
  for (let i = 0; i < n; i++) {
    // Zones evenly distributed along Z: i / n .. (i+1) / n.
    const t = (i + 0.5) / n;
    const homeZ = segLen * (0.18 + 0.74 * t);
    const sideX = i % 2 === 0 ? -halfX : halfX;
    configs.push({
      id: i + 1,
      homeX: sideX,
      homeZ,
      // Home radius shrinks slightly with more guards so they keep
      // distinct turf rather than overlapping into one mob.
      homeRadius: Math.max(5, 10 - n),
    });
  }
  return configs;
}

// Every guard uses character J (police uniform). Variation between
// guards used to come from beige/brown skin tones; with the textured
// model we get the moustache + uniform "for free" and the crew is
// readable as a uniform police force at a glance.
export function createGuardFigure(): ModelFigure {
  return createModelFigure('j');
}

// Flat triangular cone on the ground showing the guard's actual
// vision footprint: VISION_CONE_DEG wide, `visionRange` long. Apex
// sits at the guard, base spans the full cone angle at max range.
// Visual matches DetectionSystem behavior 1:1; guards are blind
// outside this footprint.
export function createFacingMarker(visionRange: number): THREE.Mesh {
  const halfAngle = (VISION_CONE_DEG * Math.PI) / 180 / 2;
  const baseHalfWidth = Math.tan(halfAngle) * visionRange;
  const verts = new Float32Array([
    0, 0, 0,
    -baseHalfWidth, 0, visionRange,
    baseHalfWidth, 0, visionRange,
  ]);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(verts, 3));
  geo.setIndex([0, 1, 2]);
  geo.computeVertexNormals();
  const mat = new THREE.MeshBasicMaterial({
    color: 0xffd14a,
    transparent: true,
    opacity: 0.30,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  return new THREE.Mesh(geo, mat);
}

export function createGround(): THREE.Mesh {
  // Grass-covered yard. Plane is intentionally enormous (800m wide,
  // 100m+ longer than the playfield in either direction) so the
  // grass always reaches the screen edge regardless of camera yaw,
  // resolution, or how far the player has traversed within the
  // segment. The Z dimension explicitly extends past the backdrop
  // mountain row (z ~= 720) so the mountains visually root in the
  // same plane the player walks on rather than floating above an
  // empty fog field.
  const geo = new THREE.PlaneGeometry(800, 1800);
  // Try to texture the ground with the Kenney grass tile. The PNG is
  // 64x64 so we set a per-square-metre repeat (one tile every 4 m)
  // and clone the texture before tweaking wrap/repeat so this
  // ground's settings don't leak into other materials sharing the
  // same loaded texture instance. Falls back to a flat green when
  // the asset preload didn't resolve.
  const grassTex = getGrassTexture();
  let mat: THREE.MeshLambertMaterial;
  if (grassTex) {
    const tex = grassTex.clone();
    tex.needsUpdate = true;
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    // 800m wide / 4m per tile = 200 reps in X; 1800m / 4m = 450 in Y.
    // Linear filter would blend into a muddy green; nearest preserves
    // the per-blade detail of the source tile.
    tex.repeat.set(200, 450);
    // Close up, nearest keeps the per-blade pixel detail. In the
    // distance the 450x-tiled grass used to minify with no mipmaps and
    // shimmered / moire'd badly; trilinear mip filtering plus a little
    // anisotropy (the ground is always seen at a grazing angle) keeps
    // the far field calm.
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.generateMipmaps = true;
    tex.anisotropy = 4;
    mat = new THREE.MeshLambertMaterial({
      map: tex,
      // Slight emissive lift so the ground stays legible on the
      // deep-night palette, same trick the obstacle materials use.
      emissive: 0xffffff,
      emissiveMap: tex,
      emissiveIntensity: 0.08,
    });
  } else {
    mat = new THREE.MeshLambertMaterial({
      color: 0x3f6a2c,
    });
  }
  const m = new THREE.Mesh(geo, mat);
  m.rotation.x = -Math.PI / 2;
  // Centred so the plane spans roughly z = -500 .. +1300, which
  // covers everything from a few metres behind the start line out
  // to the mountain row plus its depth.
  m.position.set(0, 0, 400);
  return m;
}

export function createWinLine(segLen: number = CHUNK_LEN * CHUNKS_AHEAD): THREE.Mesh {
  // Spans fence-to-fence. PLAY_HALF_W is the playfield half-width
  // (gameplay clamps the player to that), and the fences sit just
  // outside it - so a 2*PLAY_HALF_W stripe touches both fence
  // posts edge-to-edge.
  const geo = new THREE.PlaneGeometry(PLAY_HALF_W * 2, 0.4);
  const mat = new THREE.MeshBasicMaterial({ color: 0x55ff88 });
  const m = new THREE.Mesh(geo, mat);
  m.rotation.x = -Math.PI / 2;
  m.position.set(0, 0.02, segLen - 0.5);
  return m;
}
