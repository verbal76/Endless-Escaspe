import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluateRenderLog, lastTagged } from '../scripts/ci/check-render-audit.mjs';

const SHA = '133f35b925898cc058d15d24853dc9f54a89d66c';
const OTHER = '370a6241c5a4707413b1232b547c0b07bf494203';
const PREFIX = '10-02 19:55:13.123  4321  4400 I ReactNativeJS: ';

const goodAudit = {
  problems: [],
  groups: { player: { meshes: 3 }, guards: { meshes: 6 }, props: { meshes: 40 }, ground: { meshes: 2 } },
  gpu: [{ key: 'character-d', status: 'ok' }],
};
const line = (tag: string, payload: unknown) => `${PREFIX}${tag} ${JSON.stringify(payload)}`;
const log = (parts: { release?: unknown; font?: unknown; audit?: unknown; extra?: string[] }) =>
  [
    '--------- beginning of main',
    ...(parts.extra ?? []),
    parts.release === undefined ? '' : line('[release]', parts.release),
    line('[textures]', { files: 11 }),
    parts.font === undefined ? '' : line('[font]', parts.font),
    parts.audit === undefined ? '' : line('[render-audit]', parts.audit),
  ].join('\n');

const embedded = (gitSha: string | null) => ({ line: 'v0.2.1 • Build 13 • Embedded', source: 'embedded', updateId: null, gitSha, otaSequence: null });
const ota = (gitSha: string | null) => ({ line: 'v0.2.1 • Build 13 • OTA 121', source: 'ota', updateId: 'u', gitSha, otaSequence: 121 });

test('render check: a complete embedded launch of the expected commit passes', () => {
  const r = evaluateRenderLog(log({ release: embedded(SHA), font: { state: 'loaded' }, audit: goodAudit }), SHA.toUpperCase());
  assert.deepEqual(r.problems, []);
  assert.equal(r.ok, true);
  assert.match(r.notes.join(), /verified/);
});

test('render check: the embedded commit is verified too, not only OTA launches', () => {
  const r = evaluateRenderLog(log({ release: embedded(OTHER), font: { state: 'loaded' }, audit: goodAudit }), SHA);
  assert.equal(r.ok, false);
  assert.match(r.problems.join('\n'), new RegExp(`app ran ${OTHER} \\(embedded`));
  const otaMissing = evaluateRenderLog(log({ release: ota(null), font: { state: 'loaded' }, audit: goodAudit }), SHA);
  assert.match(otaMissing.problems.join('\n'), /OTA launch reports no source commit/);
  // An embedded bundle without commit metadata is noted, not failed.
  const unstamped = evaluateRenderLog(log({ release: embedded(null), font: { state: 'loaded' }, audit: goodAudit }), SHA);
  assert.equal(unstamped.ok, true);
  assert.match(unstamped.notes.join(), /not verified/);
});

test('render check: missing lines, failed font, empty groups and unchecked player texture all fail', () => {
  const empty = evaluateRenderLog('nothing here\n', SHA);
  assert.deepEqual(empty.problems, [
    'no [release] line: the app did not boot this code',
    'no [font] line',
    'no [render-audit] line: no scene was rendered',
  ]);
  const bad = evaluateRenderLog(
    log({
      release: embedded(SHA),
      font: { state: 'failed', error: 'boom' },
      audit: { problems: ['ground: texture blank'], groups: { player: { meshes: 1 }, guards: { meshes: 0 } }, gpu: [{ key: 'concrete' }] },
    }),
    SHA,
  );
  assert.deepEqual(bad.problems, [
    'display font not loaded: boom',
    'ground: texture blank',
    'guards: no meshes in the scene',
    'props: no meshes in the scene',
    'ground: no meshes in the scene',
    'player texture was not GPU-checked',
  ]);
});

test('render check: a logcat-truncated audit line is reported, and the last line of a tag wins', () => {
  const full = line('[render-audit]', goodAudit);
  const truncated = evaluateRenderLog(
    [line('[release]', embedded(SHA)), line('[font]', { state: 'loaded' }), full.slice(0, full.length - 20)].join('\n'),
    SHA,
  );
  assert.deepEqual(truncated.problems, ['[render-audit] line was truncated by logcat']);
  const lines = [line('[font]', { state: 'pending' }), 'noise', line('[font]', { state: 'loaded' })];
  assert.deepEqual(lastTagged(lines, '[font]'), { state: 'loaded' });
  assert.equal(lastTagged(lines, '[release]'), null);
});
