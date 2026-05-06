import * as THREE from 'three';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { markShared } from '../util/dispose';
import { getPropTexture } from '../util/textures';
import { barrierA_OBJ } from '../../assets/props/barrierAObj';
import { barrierB_OBJ } from '../../assets/props/barrierBObj';
import { block_OBJ } from '../../assets/props/blockObj';
import { dumpsterClosed_OBJ } from '../../assets/props/dumpsterClosedObj';
import { dumpsterOpen_OBJ } from '../../assets/props/dumpsterOpenObj';
import { treePine_OBJ } from '../../assets/props/treePineObj';

// Kenney prison-yard kit props. Each obstacle kind in Obstacles.ts
// now maps to one of these models instead of a primitive box, giving
// the world more silhouette variety than the old uniform crates +
// barriers could.
//
// OBJs are inlined as TS strings (a few KB each); textures are NOT
// loaded yet (no expo-three pipeline), so each MTL material name
// gets a hand-picked solid colour from PALETTE that approximates
// the texel a textured render would have sampled.
//
// All shared materials carry markShared so the scene-rebuild dispose
// pass leaves them resident across segment swaps.

export type KitKind =
  | 'barrierA'
  | 'barrierB'
  | 'block'
  | 'dumpsterClosed'
  | 'dumpsterOpen'
  | 'treePine';

const OBJ_BY_KIND: Record<KitKind, string> = {
  barrierA: barrierA_OBJ,
  barrierB: barrierB_OBJ,
  block: block_OBJ,
  dumpsterClosed: dumpsterClosed_OBJ,
  dumpsterOpen: dumpsterOpen_OBJ,
  treePine: treePine_OBJ,
};

// Per-MTL solid-colour palette. Names match the MTL file's `newmtl`
// entries so OBJLoader's emitted Mesh.material.name keys cleanly into
// this lookup. Emissive intensity matches the rest of the obstacle
// materials so deep-night nights still read - see Obstacles.ts.
type MaterialDef = { color: number; emissiveIntensity: number; metalness?: number };
const PALETTE: Record<string, MaterialDef> = {
  // Concrete kit props (barrier A/B, block) - dirty light grey.
  concrete: { color: 0xbababa, emissiveIntensity: 0.40 },
  // Yellow caution sign on barrierB.
  signs: { color: 0xffd14a, emissiveIntensity: 0.45 },
  // Dumpster body - dark olive-green (typical municipal dumpster).
  wall: { color: 0x4a5a3a, emissiveIntensity: 0.42 },
  // Dumpster lid edges + metallic trim.
  wall_metal: { color: 0x8a8e94, emissiveIntensity: 0.40, metalness: 0.4 },
  // Dumpster closed-top lid - darker grey.
  roof: { color: 0x32323a, emissiveIntensity: 0.40 },
  // Dirt visible inside the open dumpster.
  dirt: { color: 0x6e5232, emissiveIntensity: 0.38 },
  // Pine tree foliage + trunk all share a single material since the
  // kit author baked everything to one texture.
  treeB: { color: 0x3f6c30, emissiveIntensity: 0.44 },
};

// Default material for any unrecognised MTL name (so a future kit
// doesn't crash if it pulls in an unfamiliar material).
const DEFAULT_DEF: MaterialDef = { color: 0xb0b0b0, emissiveIntensity: 0.40 };

// Materials are shared across every spawned prop of the same MTL
// name. Built lazily on first use.
const SHARED_MATERIALS: Record<string, THREE.MeshStandardMaterial> = {};

function materialFor(name: string): THREE.MeshStandardMaterial {
  const cached = SHARED_MATERIALS[name];
  if (cached) return cached;
  const def = PALETTE[name] ?? DEFAULT_DEF;
  // If we have a real PNG for this MTL (currently wall, treeB, and
  // a wall_garage stand-in for wall_metal), bind it as map +
  // emissiveMap so the prop reads with detail. Falls back to the
  // hand-picked solid colour from PALETTE for materials whose PNGs
  // we don't have yet (concrete / signs / roof / dirt / grass).
  const tex = getPropTexture(name);
  // Tree foliage is authored as crossed billboard planes with an
  // alpha-keyed pine silhouette; without alpha-test the rectangular
  // planes render solid green and the tree looks like a flat cutout.
  // alphaTest=0.5 discards transparent pixels at the silhouette edge
  // so the tree reads as a 3D-shaped bush from any angle. Other
  // textures (concrete, dumpster wall, etc.) tile across opaque
  // surfaces - alpha-test would do nothing useful for them.
  const isFoliage = name === 'treeB';
  const mat = tex
    ? new THREE.MeshStandardMaterial({
        map: tex,
        emissive: 0xffffff,
        emissiveMap: tex,
        emissiveIntensity: def.emissiveIntensity,
        roughness: 0.7,
        metalness: def.metalness ?? 0.1,
        transparent: isFoliage,
        alphaTest: isFoliage ? 0.5 : 0,
        side: isFoliage ? THREE.DoubleSide : THREE.FrontSide,
      })
    : new THREE.MeshStandardMaterial({
        color: def.color,
        emissive: def.color,
        emissiveIntensity: def.emissiveIntensity,
        roughness: 0.7,
        metalness: def.metalness ?? 0.1,
      });
  markShared(mat);
  SHARED_MATERIALS[name] = mat;
  return mat;
}

// One parsed template per kind. A template is a list of submeshes;
// each submesh comes from a `usemtl` block inside the OBJ's single
// group (so a dumpster with wall + wall_metal + roof yields three
// submeshes). Geometries are markShared so per-spawn clones can be
// disposed independently while the template buffers stay resident.
type SubMesh = { geometry: THREE.BufferGeometry; materialName: string };
const TEMPLATES: Partial<Record<KitKind, SubMesh[]>> = {};

function parseTemplate(kind: KitKind): SubMesh[] {
  const cached = TEMPLATES[kind];
  if (cached) return cached;
  const loader = new OBJLoader();
  const root = loader.parse(OBJ_BY_KIND[kind]);
  const subs: SubMesh[] = [];
  root.traverse((node) => {
    const mesh = node as THREE.Mesh;
    if (!mesh.isMesh) return;
    const geo = mesh.geometry as THREE.BufferGeometry;
    markShared(geo);
    // OBJLoader sets each mesh's material to a default whose name
    // mirrors the OBJ's `usemtl X`. Read X back to drive our
    // palette lookup.
    const material = mesh.material as THREE.Material | THREE.Material[];
    const name = Array.isArray(material) ? material[0].name : material.name;
    subs.push({ geometry: geo, materialName: name || 'concrete' });
  });
  TEMPLATES[kind] = subs;
  return subs;
}

// Spawn a prop instance. The caller positions + rotates the returned
// Group; `scale` is applied here (some obstacle kinds need anisotropic
// scaling to fit their existing hitbox - e.g. lowwall stretches the
// short barrier model along X).
export function createKitProp(
  kind: KitKind,
  scale: number | THREE.Vector3,
): THREE.Group {
  const subs = parseTemplate(kind);
  const group = new THREE.Group();
  for (const s of subs) {
    // Geometry is shared at the template level, so clone() per spawn
    // keeps per-instance edits (e.g. a future texture pass embedding
    // vertex colours) from leaking across props. BufferGeometry.clone
    // deep-copies userData, so the clone inherits userData.shared
    // from the template - explicitly unset it here so the scene-
    // rebuild dispose pass actually frees the per-instance buffer.
    const geo = s.geometry.clone();
    geo.userData.shared = false;
    const mesh = new THREE.Mesh(geo, materialFor(s.materialName));
    group.add(mesh);
  }
  if (typeof scale === 'number') {
    group.scale.setScalar(scale);
  } else {
    group.scale.copy(scale);
  }
  return group;
}
