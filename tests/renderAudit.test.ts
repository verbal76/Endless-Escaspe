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

test('runRenderAudit works on an expo-gl style context (no gl.canvas, no resetState)', async () => {
  const { runRenderAudit } = await import('../src/util/renderAudit');
  const calls: string[] = [];
  const gl = {
    FRAMEBUFFER: 1, COLOR_ATTACHMENT0: 2, TEXTURE_2D: 3, FRAMEBUFFER_COMPLETE: 4, RGBA: 5, UNSIGNED_BYTE: 6,
    createFramebuffer: () => ({}),
    bindFramebuffer: (_t: number, fb: unknown) => calls.push(fb === null ? 'bind-null' : 'bind-fbo'),
    framebufferTexture2D: () => {},
    checkFramebufferStatus: () => 4,
    readPixels: () => {},
    deleteFramebuffer: () => calls.push('delete'),
  };
  const { root } = scene({ playerTextured: true });
  const renderer = {
    getContext: () => gl as unknown as WebGL2RenderingContext,
    properties: { get: () => ({ __webglTexture: {} as WebGLTexture }) },
  };
  const a = runRenderAudit(renderer, root);
  assert.ok(a.gpu.length > 0);
  assert.equal(calls[calls.length - 2], 'bind-null', 'default framebuffer restored');
});

// One fake GL texture per texture key, answering with that key's texels.
function perKeyGpu() {
  const byKey = new Map<string, WebGLTexture>();
  const keyOf = new Map<WebGLTexture, string>();
  const isUploaded = (tex: THREE.Texture) => {
    const key = tex.userData.textureKey as string;
    let gl = byKey.get(key);
    if (!gl) {
      gl = {} as WebGLTexture;
      byKey.set(key, gl);
      keyOf.set(gl, key);
    }
    return gl;
  };
  const read = (gl: WebGLTexture, pts: Array<[number, number]>, mode: 'blank' | 'correct') =>
    fakeGpu(keyOf.get(gl) as string, mode)(pts);
  return { isUploaded, read };
}

// C-4: the GPU readback runs once per texture per session, not on
// every rebuild / restart / outfit change.
test('GPU check results are cached per texture: later audits do no readback', async () => {
  const { clearGpuCheckCache } = await import('../src/util/renderAudit');
  const { evaluateRenderLog } = await import('../scripts/ci/check-render-audit.mjs');
  clearGpuCheckCache();
  const { root } = scene({ playerTextured: true });
  const gpu = perKeyGpu();
  const isUploaded = gpu.isUploaded;
  let reads = 0;
  const reader = (t: WebGLTexture, pts: Array<[number, number]>) => {
    reads += pts.length;
    return gpu.read(t, pts, 'correct');
  };
  const first = auditScene(root, isUploaded, reader);
  const firstReads = reads;
  assert.ok(firstReads > 0);
  for (let i = 0; i < 5; i++) {
    // Same verdicts (so the same CI log line content), no readback.
    assert.deepEqual(auditScene(root, isUploaded, reader), first);
  }
  assert.equal(reads, firstReads, 'no readPixels after the first audit');
  // The CI log check still passes on a cached audit line.
  const ok = { meshes: 1, textured: 1, flat: 0, notUploaded: 0 };
  const audit = { ...first, groups: { ...first.groups, props: ok, ground: ok } };
  const log = [
    `I ReactNativeJS: [release] ${JSON.stringify({ line: 'x', source: 'embedded', gitSha: null })}`,
    `I ReactNativeJS: [font] ${JSON.stringify({ state: 'loaded' })}`,
    `I ReactNativeJS: [render-audit] ${JSON.stringify(audit)}`,
  ].join('\n');
  assert.deepEqual(evaluateRenderLog(log, null).problems, []);
});

test('GPU check cache: failures are re-read, and a new GL texture is re-checked', async () => {
  const { clearGpuCheckCache } = await import('../src/util/renderAudit');
  clearGpuCheckCache();
  const { root } = scene({ playerTextured: true });
  const gpu = perKeyGpu();
  const isUploaded = gpu.isUploaded;
  let reads = 0;
  let mode: 'blank' | 'correct' = 'blank';
  const reader = (t: WebGLTexture, pts: Array<[number, number]>) => {
    reads++;
    return gpu.read(t, pts, mode);
  };
  assert.ok(auditScene(root, isUploaded, reader).problems.some((p) => /blank/.test(p)));
  const afterFail = reads;
  mode = 'correct';
  // Not cached: the retry audit reads again and now passes.
  assert.deepEqual(auditScene(root, isUploaded, reader).problems, []);
  assert.ok(reads > afterFail);
  const afterOk = reads;
  auditScene(root, isUploaded, reader);
  assert.equal(reads, afterOk, 'verified texture not re-read');
  // Same key, different GL texture object (re-upload / new context).
  const fresh = perKeyGpu();
  auditScene(root, fresh.isUploaded, (t, pts) => {
    reads++;
    return fresh.read(t, pts, 'correct');
  });
  assert.ok(reads > afterOk, 're-uploaded texture is checked again');
});
