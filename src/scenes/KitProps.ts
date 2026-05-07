import * as THREE from 'three';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { markShared } from '../util/dispose';
import { getPropTexture } from '../util/textures';
import { barrierA_OBJ } from '../../assets/props/barrierAObj';
import { barrierB_OBJ } from '../../assets/props/barrierBObj';
import { block_OBJ } from '../../assets/props/blockObj';
import { dumpsterClosed_OBJ } from '../../assets/props/dumpsterClosedObj';
import { dumpsterOpen_OBJ } from '../../assets/props/dumpsterOpenObj';
import { treePineTallA_OBJ } from '../../assets/props/treePineTallAObj';
import { treePineTallADetailed_OBJ } from '../../assets/props/treePineTallADetailedObj';

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
  | 'treePineTallA'
  | 'treePineTallADetailed';

const OBJ_BY_KIND: Record<KitKind, string> = {
  barrierA: barrierA_OBJ,
  barrierB: barrierB_OBJ,
  block: block_OBJ,
  dumpsterClosed: dumpsterClosed_OBJ,
  dumpsterOpen: dumpsterOpen_OBJ,
  treePineTallA: treePineTallA_OBJ,
  treePineTallADetailed: treePineTallADetailed_OBJ,
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
  // Tall-pine OBJ kit: real 3D geometry (trunk + stacked leaf cones)
  // with two named MTL materials. Bark colour comes straight from the
  // kit's MTL Kd; the leaf colour is overridden from the MTL's teal
  // to a forest green so the tree row reads as evergreen pines
  // instead of stylised cyan tropicals.
  woodBarkDark: { color: 0xcc7659, emissiveIntensity: 0.40 },
  leafsDark: { color: 0x3a7d2e, emissiveIntensity: 0.42 },
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
  const mat = tex
    ? new THREE.MeshStandardMaterial({
        map: tex,
        emissive: 0xffffff,
        emissiveMap: tex,
        emissiveIntensity: def.emissiveIntensity,
        roughness: 0.7,
        metalness: def.metalness ?? 0.1,
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
//
// When OBJLoader hits multiple `usemtl` switches in one `g` group it
// builds ONE Mesh with an array of materials + matching geometry
// groups (multi-material). We capture every material name so the
// per-spawn factory can apply the correct palette material to each
// group instead of forcing the whole mesh through one material.
type SubMesh = { geometry: THREE.BufferGeometry; materialNames: string[] };
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
    const material = mesh.material as THREE.Material | THREE.Material[];
    let materialNames: string[];
    if (Array.isArray(material)) {
      materialNames = material.map((m) => m.name || 'concrete');
    } else {
      materialNames = [material.name || 'concrete'];
    }
    subs.push({ geometry: geo, materialNames });
  });
  TEMPLATES[kind] = subs;
  return subs;
}

// Spawn a prop instance. The caller positions + rotates the returned
// Group; `scale` is applied here (some obstacle kinds need anisotropic
// scaling to fit their existing hitbox - e.g. lowwall stretches the
// short barrier model along X).
//
// `materialOverride` replaces every `usemtl` name with the supplied
// palette key so the whole prop renders as that single material -
// useful for variant-skin spawns. Without it each material name
// from the OBJ is looked up individually so a multi-material rig
// (e.g. tall-pine = woodBarkDark + leafsDark) gets the correct
// per-section colour.
export function createKitProp(
  kind: KitKind,
  scale: number | THREE.Vector3,
  materialOverride?: string,
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
    const mats = s.materialNames.map((n) =>
      materialFor(materialOverride ?? n),
    );
    // Three.js matches a material array against geometry.groups -
    // each face's group.materialIndex picks from the array. Pass an
    // array for multi-material rigs; a single Material for single-
    // material ones.
    const mesh = new THREE.Mesh(geo, mats.length > 1 ? mats : mats[0]);
    group.add(mesh);
  }
  if (typeof scale === 'number') {
    group.scale.setScalar(scale);
  } else {
    group.scale.copy(scale);
  }
  return group;
}
