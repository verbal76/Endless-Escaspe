import * as THREE from 'three';
import { markShared } from '../util/dispose';

// A see-through, double-sided closed shape (a light beam cone) needs
// its far faces drawn before its near faces. three does that itself
// for `transparent && DoubleSide` materials by drawing the object
// twice and flipping material.side in between - and every flip marks
// the material dirty, so the renderer re-resolves its shader program
// twice per object per frame (getParameters + a ~100-entry cache key).
//
// Same picture without the churn: a BackSide mesh with a FrontSide
// child sharing its geometry. Both sit at the same world position, so
// the transparent sort keeps them adjacent and draws the parent (lower
// id) first - exactly the back-then-front order of the two-pass path.
// Hide / scale / move the returned (parent) mesh as before.

const variants = new WeakMap<THREE.Material, { back: THREE.Material; front: THREE.Material }>();

function sides(mat: THREE.Material): { back: THREE.Material; front: THREE.Material } {
  let v = variants.get(mat);
  if (!v) {
    const back = mat.clone();
    back.side = THREE.BackSide;
    const front = mat.clone();
    front.side = THREE.FrontSide;
    markShared(back);
    markShared(front);
    v = { back, front };
    variants.set(mat, v);
  }
  return v;
}

export function twoSidedTransparentMesh(geo: THREE.BufferGeometry, mat: THREE.Material): THREE.Mesh {
  const v = sides(mat);
  const back = new THREE.Mesh(geo, v.back);
  const front = new THREE.Mesh(geo, v.front);
  front.name = 'frontFaces';
  back.add(front);
  return back;
}
