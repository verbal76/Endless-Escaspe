import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  APPLYING_MESSAGE,
  INITIAL_FLOW,
  applyFailed,
  decide,
  RESUME_CHECK_MIN_INTERVAL_MS,
  isSafePoint,
  shouldCheckOnResume,
  type SafePoint,
  type UpdatesSnapshot,
} from '../src/util/updateFlow';

const SAFE: SafePoint = { runIdle: true, menuHome: true, noOverlay: true };
const snap = (p: Partial<UpdatesSnapshot> = {}): UpdatesSnapshot => ({
  enabled: true,
  isChecking: false,
  isDownloading: false,
  isUpdatePending: false,
  pendingUpdateId: null,
  ...p,
});

test('update flow: exact wording', () => {
  assert.equal(APPLYING_MESSAGE, 'Please wait, applying update');
});

test('update flow: no update, checking and background download never apply (no modal)', () => {
  for (const s of [snap(), snap({ isChecking: true }), snap({ isDownloading: true })]) {
    const d = decide(INITIAL_FLOW, s, SAFE);
    assert.equal(d.apply, false);
    assert.notEqual(d.next.phase, 'applying');
  }
  assert.equal(decide(INITIAL_FLOW, snap({ isChecking: true }), SAFE).next.phase, 'checking');
  assert.equal(decide(INITIAL_FLOW, snap({ isDownloading: true }), SAFE).next.phase, 'downloading');
});

test('update flow: disabled updates (dev/web) never apply', () => {
  const d = decide(INITIAL_FLOW, snap({ enabled: false, isUpdatePending: true, pendingUpdateId: 'a' }), SAFE);
  assert.equal(d.apply, false);
  assert.equal(d.next.phase, 'idle');
});

test('update flow: a pending update waits for a safe point, then applies exactly once', () => {
  const pending = snap({ isUpdatePending: true, pendingUpdateId: 'u1' });
  for (const unsafe of [
    { ...SAFE, runIdle: false },
    { ...SAFE, menuHome: false },
    { ...SAFE, noOverlay: false },
  ]) {
    assert.equal(isSafePoint(unsafe), false);
    const d = decide(INITIAL_FLOW, pending, unsafe);
    assert.equal(d.apply, false, 'never mid-run / mid-menu / over a dialog');
    assert.equal(d.next.phase, 'staged');
  }
  const first = decide({ phase: 'staged', attempted: [] }, pending, SAFE);
  assert.equal(first.apply, true);
  assert.equal(first.next.phase, 'applying');
  // Re-evaluating while applying never starts a second activation.
  const again = decide(first.next, pending, SAFE);
  assert.equal(again.apply, false);
  assert.equal(again.next.phase, 'applying');
});

test('update flow: a failed activation is not retried (no reload loop) and stays usable', () => {
  const pending = snap({ isUpdatePending: true, pendingUpdateId: 'u1' });
  const started = decide(INITIAL_FLOW, pending, SAFE).next;
  const failed = applyFailed(started);
  assert.equal(failed.phase, 'failed');
  assert.equal(decide(failed, pending, SAFE).apply, false);
  // After a restart-less recovery the same id is still not retried...
  const back = decide({ phase: 'idle', attempted: failed.attempted }, pending, SAFE);
  assert.equal(back.apply, false);
  assert.equal(back.next.phase, 'failed');
  // ...but a NEWER update is.
  const newer = decide({ phase: 'idle', attempted: failed.attempted }, snap({ isUpdatePending: true, pendingUpdateId: 'u2' }), SAFE);
  assert.equal(newer.apply, true);
});

test('update flow: unknown update id is attempted once', () => {
  const pending = snap({ isUpdatePending: true });
  const a = decide(INITIAL_FLOW, pending, SAFE);
  assert.equal(a.apply, true);
  assert.equal(decide({ phase: 'idle', attempted: a.next.attempted }, pending, SAFE).apply, false);
});

test('update flow: resume check is throttled and never overlaps another stage', () => {
  const T = RESUME_CHECK_MIN_INTERVAL_MS;
  assert.equal(shouldCheckOnResume(1000, null, 'idle'), true);
  assert.equal(shouldCheckOnResume(T - 1, 0, 'idle'), false, 'too soon after the last check');
  assert.equal(shouldCheckOnResume(T, 0, 'idle'), true);
  assert.equal(shouldCheckOnResume(T * 5, 0, 'failed'), true, 'a failed earlier update does not stop discovering newer ones');
  for (const p of ['checking', 'downloading', 'staged', 'applying'] as const) {
    assert.equal(shouldCheckOnResume(T * 5, 0, p), false, p);
  }
});
