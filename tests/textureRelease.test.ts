import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { releasePixelsAfterUpload } from '../src/util/textures';

// C-7: decoded RGBA is dropped once uploaded and decoded again only if
// a texture sharing that image is uploaded again (clone with other
// sampling, new GL context).
test('decoded pixels are released after upload and re-decoded on demand', () => {
  const px = new Uint8Array([1, 2, 3, 4]);
  let redecodes = 0;
  const tex = new THREE.DataTexture(px, 1, 1);
  releasePixelsAfterUpload(tex, px, 1, 1, () => {
    redecodes++;
    return new Uint8Array([1, 2, 3, 4]);
  });
  assert.equal(tex.image.width, 1);
  assert.equal(tex.image.data, px, 'first upload reads the decoded pixels');
  (tex.onUpdate as unknown as () => void)(); // what three calls right after texImage2D
  assert.equal(redecodes, 0);
  const clone = tex.clone();
  assert.deepEqual(Array.from(clone.image.data as Uint8Array), [1, 2, 3, 4], 'clone shares the image');
  assert.equal(redecodes, 1);
  assert.equal(clone.image.data, clone.image.data, 'kept until the next upload completes');
  assert.equal(redecodes, 1);
  (tex.onUpdate as unknown as () => void)();
  void tex.image.data;
  assert.equal(redecodes, 2);
});
