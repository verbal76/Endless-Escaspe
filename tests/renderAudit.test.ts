import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  auditScene,
  checkTexture,
  formatAuditRows,
  tagAuditMaterial,
  tagAuditRole,
} from '../src/util/renderAudit';
import { TEXTURE_PROBES } from '../src/util/textureProbes';

// A fake GPU: texel values per WebGL texture, addressed like
// readPixels (x, GL row). `rows` maps the PNG to GL rows the way a
// correct flipY upload does.
function fakeGpu(probeKey: string, mode: 'correct' | 'upside-down' | 'blank' | 'wrong') {
  const p = TEXTURE_PROBES[probeKey];
  return (pts: Array<[number, number]>) =>
    pts.map(([x, row]) => {
      if (mode === 'blank') return new Uint8Array([0, 0, 0, 0]);
      if (mode === 'wrong') return new Uint8Array([255, 0, 255, 255]);
      const imgY = mode === 'correct' ? p.height - 1 - row : row;
      const hit = p.points.find(([px, py]) => px === x && py === imgY);
      return hit ? new Uint8Array(hit.slice(2)) : new Uint8Array([1, 2, 3, 4]);
    });
}

test('GPU check: correct upload, upside-down, blank and wrong image are told apart', () => {
  assert.equal(checkTexture('character-d', true, fakeGpu('character-d', 'correct')).status, 'ok');
  assert.equal(checkTexture('character-d', true, fakeGpu('character-d', 'upside-down')).status, 'upside-down');
  assert.equal(checkTexture('character-d', true, fakeGpu('character-d', 'blank')).status, 'blank');
  const wrong = checkTexture('character-d', true, fakeGpu('character-d', 'wrong'));
  assert.equal(wrong.status, 'mismatch');
  assert.match(wrong.detail ?? '', /expected/);
  assert.equal(checkTexture('character-d', true, () => 'incomplete').status, 'incomplete');
  assert.equal(checkTexture('nope', true, fakeGpu('character-d', 'correct')).status, 'no-probe');
});

function texture(key: string) {
  const t = new THREE.Texture();
  t.userData.textureKey = key;
  return t;
}

function scene(opts: { playerTextured: boolean; uploaded?: boolean }) {
  const root = new THREE.Group();
  const tex = texture('character-d');
  const playerMat = opts.playerTextured
    ? new THREE.MeshLambertMaterial({ map: tex })
    : new THREE.MeshLambertMaterial({ color: 0xf2c14a });
  tagAuditMaterial(playerMat, 'player', 'figure-d');
  const player = new THREE.Group();
  tagAuditRole(player, 'player');
  player.add(new THREE.Mesh(new THREE.BoxGeometry(), playerMat), new THREE.Mesh(new THREE.BoxGeometry(), playerMat));
  root.add(player);
  // A guard shares the figure material family but is tagged by role.
  const guardMat = new THREE.MeshLambertMaterial({ map: texture('character-j') });
  tagAuditMaterial(guardMat, 'guards', 'figure-j');
  const guard = new THREE.Group();
  tagAuditRole(guard, 'guards');
  guard.add(new THREE.Mesh(new THREE.BoxGeometry(), guardMat));
  root.add(guard);
  // Bark is solid by design and must not count as a failure.
  const bark = new THREE.MeshLambertMaterial({ color: 0x884422 });
  tagAuditMaterial(bark, 'props', 'woodBarkDark', false);
  root.add(new THREE.Mesh(new THREE.BoxGeometry(), bark));
  // Untagged meshes (sky, effects) are ignored.
  root.add(new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial()));
  const uploaded = opts.uploaded ?? true;
  const glTex = {} as WebGLTexture;
  return { root, isUploaded: () => (uploaded ? glTex : null) };
}

test('scene audit: fully textured scene has no problems', () => {
  const { root, isUploaded } = scene({ playerTextured: true });
  const a = auditScene(root, isUploaded, (_t, pts) => {
    // Serve the right texels for whichever probe set is asked for.
    const key = pts.length === TEXTURE_PROBES['character-d'].points.length * 2 ? 'character-d' : 'character-d';
    return fakeGpu(key, 'correct')(pts);
  });
  assert.deepEqual(a.groups.player, { meshes: 2, textured: 2, flat: 0, notUploaded: 0 });
  assert.deepEqual(a.groups.guards, { meshes: 1, textured: 1, flat: 0, notUploaded: 0 });
  assert.equal(a.groups.props.meshes, 0, 'solid-by-design materials are not counted');
  assert.equal(a.gpu.find((c) => c.key === 'character-d')?.status, 'ok');
});

test('scene audit: a flat-colour fallback player is reported even when files "loaded"', () => {
  const { root, isUploaded } = scene({ playerTextured: false });
  const a = auditScene(root, isUploaded, null);
  assert.deepEqual(a.groups.player, { meshes: 2, textured: 0, flat: 2, notUploaded: 0 });
  assert.ok(a.problems.some((p) => /player: 2\/2 meshes flat colour/.test(p)));
  const rows = formatAuditRows(a);
  assert.match(rows[0].value, /^PROBLEM - player/);
});

test('scene audit: textures three.js never uploaded are reported', () => {
  const { root, isUploaded } = scene({ playerTextured: true, uploaded: false });
  const a = auditScene(root, isUploaded, null);
  assert.equal(a.groups.player.notUploaded, 2);
  assert.ok(a.problems.some((p) => /not on the GPU/.test(p)));
});

test('scene audit: blank GPU texture is a problem', () => {
  const { root, isUploaded } = scene({ playerTextured: true });
  const a = auditScene(root, isUploaded, (_t, pts) => pts.map(() => new Uint8Array(4)));
  assert.ok(a.problems.some((p) => /character-d: GPU texture blank/.test(p)));
});

test('rows before any audit say so honestly', () => {
  assert.match(formatAuditRows(null)[0].value, /Not checked yet/);
});
