import * as THREE from 'three';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { markShared } from '../util/dispose';
import { getPropTexture } from '../util/textures';
import { tagAuditMaterial } from '../util/renderAudit';
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
// Emissive "self-lift" keeps props legible at night. It used to sit
// at 0.38-0.45, which flattened all shading into a uniform glow; the
// stage moods now carry night readability through ambient light, so
// the lift is a subtle 0.10-0.14.
type MaterialDef = { color: number; emissiveIntensity: number };
const PALETTE: Record<string, MaterialDef> = {
  concrete: { color: 0xbababa, emissiveIntensity: 0.12 },
  signs: { color: 0xffd14a, emissiveIntensity: 0.14 },
  wall: { color: 0x4a5a3a, emissiveIntensity: 0.12 },
  wall_metal: { color: 0x8a8e94, emissiveIntensity: 0.12 },
  roof: { color: 0x32323a, emissiveIntensity: 0.12 },
  dirt: { color: 0x6e5232, emissiveIntensity: 0.11 },
  woodBarkDark: { color: 0xcc7659, emissiveIntensity: 0.12 },
  leafsDark: { color: 0x3a7d2e, emissiveIntensity: 0.12 },
};

const SOLID_BY_DESIGN: Record<string, true> = { woodBarkDark: true, leafsDark: true };

const DEFAULT_DEF: MaterialDef = { color: 0xb0b0b0, emissiveIntensity: 0.12 };

// Lambert (per-vertex diffuse) instead of Standard PBR: the art is
// flat low-poly, so the PBR maths bought nothing visible and cost
// fragment time on mid-range phones.
const SHARED_MATERIALS: Record<string, THREE.MeshLambertMaterial> = {};

function materialFor(name: string): THREE.MeshLambertMaterial {
  const cached = SHARED_MATERIALS[name];
  if (cached) return cached;
  const def = PALETTE[name] ?? DEFAULT_DEF;
  const tex = getPropTexture(name);
  const mat = tex
    ? new THREE.MeshLambertMaterial({
        map: tex,
        emissive: 0xffffff,
        emissiveMap: tex,
        emissiveIntensity: def.emissiveIntensity,
      })
    : new THREE.MeshLambertMaterial({
        color: def.color,
        emissive: def.color,
        emissiveIntensity: def.emissiveIntensity,
      });
  markShared(mat);
  // Tree bark / leaves are solid colours by design; everything else
  // in the kit is drawn from its Kenney texture.
  tagAuditMaterial(mat, 'props', name, !(name in SOLID_BY_DESIGN));
  SHARED_MATERIALS[name] = mat;
  return mat;
}

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

// Build a prop instance. Geometry is the shared parsed template (never
// cloned - every dumpster in a segment references the same buffers,
// and the dispose pass skips shared resources); only the transform is
// per-instance.
export function createKitProp(
  kind: KitKind,
  scale: number | THREE.Vector3,
  materialOverride?: string,
): THREE.Group {
  const subs = parseTemplate(kind);
  const group = new THREE.Group();
  for (const s of subs) {
    const mats = s.materialNames.map((n) => materialFor(materialOverride ?? n));
    const mesh = new THREE.Mesh(s.geometry, mats.length > 1 ? mats : mats[0]);
    group.add(mesh);
  }
  if (typeof scale === 'number') {
    group.scale.setScalar(scale);
  } else {
    group.scale.copy(scale);
  }
  return group;
}

// Many copies of one prop in a single draw call per material group:
// one InstancedMesh per template sub-mesh, sharing the template
// geometry and materials. `matrices` are full world transforms.
export function createKitPropInstances(kind: KitKind, matrices: readonly THREE.Matrix4[]): THREE.Group {
  const subs = parseTemplate(kind);
  const group = new THREE.Group();
  for (const s of subs) {
    const mats = s.materialNames.map((n) => materialFor(n));
    const inst = new THREE.InstancedMesh(s.geometry, mats.length > 1 ? mats : mats[0], matrices.length);
    for (let i = 0; i < matrices.length; i++) inst.setMatrixAt(i, matrices[i]);
    inst.instanceMatrix.needsUpdate = true;
    inst.computeBoundingSphere();
    group.add(inst);
  }
  return group;
}
