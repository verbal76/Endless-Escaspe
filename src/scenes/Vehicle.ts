import * as THREE from 'three';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { markShared } from '../util/dispose';
import { firetruck_OBJ } from '../../assets/vehicles/firetruckObj';
import { police_OBJ } from '../../assets/vehicles/policeObj';

// Kenney-modelled drivable obstacles. Replaces the procedural box-
// car that used to populate Obstacles.ts's `'car'` branch with one
// of two textured 3D models (police cruiser / fire truck) parsed
// from inlined OBJ strings.
//
// Both models share a colormap.png palette that we don't sample yet
// (texture loading still requires an expo-three pipeline we haven't
// added), so each named OBJ group ('body' / 'grill' / 'wheel-*') is
// rendered with a hand-picked solid colour that approximates the
// palette cell its UVs would have hit. This keeps the silhouette +
// part definition (chrome grill, dark tyres, painted body) without
// any async asset loading.

export type VehicleKind = 'police' | 'firetruck';

// Per-kind uniform scale. Police is sized 2x the original 0.78
// baseline (sits as a recognisable cruiser), firetruck 3x (a real
// hulking emergency vehicle that dominates whatever cell it spawns
// in). The procgen min-spacing radius (OBSTACLE_RADIUS.car) was
// bumped accordingly so other props don't get placed inside the
// firetruck's footprint.
const SCALE_BY_KIND: Record<VehicleKind, number> = {
  police: 0.78 * 2,    // 1.56
  firetruck: 0.78 * 3, // 2.34
};

type Palette = {
  body: number;
  grill: number;
  wheels: number;
};

const PALETTES: Record<VehicleKind, Palette> = {
  police: {
    body: 0x2540a0,    // police navy
    grill: 0xe8e8ec,   // chrome / silver
    wheels: 0x1a1a20,
  },
  firetruck: {
    body: 0xcc2222,    // fire-engine red
    grill: 0xe8e8ec,   // chrome / silver
    wheels: 0x1a1a20,
  },
};

const OBJ_BY_KIND: Record<VehicleKind, string> = {
  police: police_OBJ,
  firetruck: firetruck_OBJ,
};

// Module-level cache: parse each OBJ exactly once, then clone the
// geometry per spawned obstacle. Materials are shared across all
// instances of the same kind via markShared so the dispose pass on
// scene rebuild leaves them resident for the next segment.
type ParsedTemplate = {
  parts: Array<{ name: string; geometry: THREE.BufferGeometry }>;
};

const TEMPLATES: Partial<Record<VehicleKind, ParsedTemplate>> = {};
const MATERIALS: Partial<Record<VehicleKind, Record<string, THREE.Material>>> = {};

function getMaterials(kind: VehicleKind): Record<string, THREE.Material> {
  const cached = MATERIALS[kind];
  if (cached) return cached;
  const palette = PALETTES[kind];
  const make = (color: number) =>
    markShared(
      new THREE.MeshStandardMaterial({
        color,
        emissive: color,
        // Vehicles get a moderate emissive so they read at night the
        // same way obstacle materials do (see Obstacles.ts), keeping
        // their colour distinct from the ambient floor.
        emissiveIntensity: 0.20,
        roughness: 0.55,
        metalness: 0.20,
      }),
    );
  const mats = {
    body: make(palette.body),
    grill: make(palette.grill),
    wheels: make(palette.wheels),
  };
  MATERIALS[kind] = mats;
  return mats;
}

function parseTemplate(kind: VehicleKind): ParsedTemplate {
  const cached = TEMPLATES[kind];
  if (cached) return cached;
  const loader = new OBJLoader();
  const root = loader.parse(OBJ_BY_KIND[kind]);
  const parts: ParsedTemplate['parts'] = [];
  root.traverse((node) => {
    if ((node as THREE.Mesh).isMesh && node.name) {
      const mesh = node as THREE.Mesh;
      const geo = mesh.geometry as THREE.BufferGeometry;
      // Mark shared so the scene-rebuild dispose pass leaves the
      // template geometry resident; per-instance clones still get
      // disposed when their figure is torn down.
      markShared(geo);
      parts.push({ name: node.name, geometry: geo });
    }
  });
  const template: ParsedTemplate = { parts };
  TEMPLATES[kind] = template;
  return template;
}

// Map a part's group name to a material slot. Wheels (front/back/
// left/right) all share the same dark tyre material; the body and
// grill each get their own.
function materialFor(
  partName: string,
  mats: Record<string, THREE.Material>,
): THREE.Material {
  if (partName === 'body') return mats.body;
  if (partName === 'grill') return mats.grill;
  return mats.wheels;
}

// Build a vehicle Group ready to be parented into a scene node.
// Caller is responsible for positioning + Y-rotating it (Obstacles.ts
// places at the obstacle's x/z and applies a random yaw for variety).
export function createVehicle(kind: VehicleKind): THREE.Group {
  const template = parseTemplate(kind);
  const mats = getMaterials(kind);
  const group = new THREE.Group();
  for (const part of template.parts) {
    // Geometry is shared (template-level) so we clone() per instance.
    // Without the clone, every mesh of the same kind would share an
    // attribute buffer and any future per-instance tweak (vertex
    // colours from a future texture pass, e.g.) would leak to the
    // others. BufferGeometry.clone deep-copies userData, so the clone
    // inherits userData.shared from the template - explicitly unset
    // it here so the scene-rebuild dispose pass actually frees the
    // per-instance buffer.
    const geo = part.geometry.clone();
    geo.userData.shared = false;
    const mesh = new THREE.Mesh(geo, materialFor(part.name, mats));
    group.add(mesh);
  }
  group.scale.setScalar(SCALE_BY_KIND[kind]);
  return group;
}
