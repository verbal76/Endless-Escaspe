// Audio review fixes: volume snapping / curve, music mix targets,
// siren loop continuity and level, haptics gating.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_BLEND,
  MusicIntensity,
  musicTargets,
  perceptualVolume,
  snapVolume,
} from '../src/util/musicIntensity';
import { buildSirenPcm, getSirenDataUri, SIREN_SAMPLE_RATE } from '../src/util/siren';
import { haptics, setHapticsBackendForTests, setHapticsEnabled } from '../src/util/haptics';
import { useStore } from '../src/state/store';

test('volume endpoints snap to exact 0 and 1', () => {
  assert.equal(snapVolume(0.0042), 0);
  assert.equal(snapVolume(0.01), 0);
  assert.equal(snapVolume(-3), 0);
  assert.equal(snapVolume(Number.NaN), 0);
  assert.equal(snapVolume(0.995), 1);
  assert.equal(snapVolume(7), 1);
  assert.equal(snapVolume(0.5), 0.5);
});

test('store: a slider drag ending near 0 lands on exactly 0 (and 1)', () => {
  const st = useStore.getState();
  st.setMasterVolume(0.7);
  // 0.0071 steps leave 0.0042 behind; the final 0 must still land.
  for (let v = 0.7; v > 0; v -= 0.0071) useStore.getState().setMasterVolume(v);
  useStore.getState().setMasterVolume(0.0042);
  assert.equal(useStore.getState().masterVolume, 0);
  useStore.getState().setMasterVolume(0.004);
  useStore.getState().setMasterVolume(0);
  assert.equal(useStore.getState().masterVolume, 0);

  useStore.getState().setMusicVolume(0.996);
  assert.equal(useStore.getState().musicVolume, 1);
  useStore.getState().setMusicVolume(0.008);
  assert.equal(useStore.getState().musicVolume, 0);
  // Slider noise in the middle is still coalesced.
  useStore.getState().setMusicVolume(0.5);
  useStore.getState().setMusicVolume(0.502);
  assert.equal(useStore.getState().musicVolume, 0.5);
});

test('perceptual curve: squared, monotonic, exact endpoints', () => {
  assert.equal(perceptualVolume(0), 0);
  assert.equal(perceptualVolume(0.005), 0);
  assert.equal(perceptualVolume(1), 1);
  assert.ok(Math.abs(perceptualVolume(0.5) - Math.pow(0.5, 1.5)) < 1e-12);
  // Monotonic over the whole slider.
  for (let v = 0.02; v <= 1; v += 0.02) assert.ok(perceptualVolume(v) >= perceptualVolume(v - 0.02));
  let prev = -1;
  for (let v = 0; v <= 1; v += 0.01) {
    const p = perceptualVolume(v);
    assert.ok(p >= prev);
    prev = p;
  }
});

test('music mix: calm and tension never blend at comparable levels when settled', () => {
  for (const s of ['calm', 'alert', 'chase'] as const) {
    const t = musicTargets(s);
    assert.ok(Math.min(t.calm, t.tension) <= MAX_BLEND, s);
  }
  assert.equal(musicTargets('chase').calm, 0);
  // Settled states reached through the hysteresis machine agree.
  const m = new MusicIntensity();
  let mix = m.update(0.5, false, 1 / 60);
  for (let i = 0; i < 300; i++) mix = m.update(0.5, false, 1 / 60);
  assert.equal(mix.state, 'alert');
  assert.ok(Math.min(mix.calmGain, mix.tensionGain) <= MAX_BLEND);
  for (let i = 0; i < 300; i++) mix = m.update(1, true, 1 / 60);
  assert.equal(mix.state, 'chase');
  assert.equal(mix.calmGain, 0);
});

test('siren loop is phase-continuous at the seam (no click)', () => {
  const s = buildSirenPcm();
  const n = s.length;
  assert.ok(Math.abs(n - SIREN_SAMPLE_RATE * 1.4) <= 1);
  let maxStep = 0;
  let maxCurve = 0;
  for (let i = 2; i < n; i++) {
    maxStep = Math.max(maxStep, Math.abs(s[i] - s[i - 1]));
    maxCurve = Math.max(maxCurve, Math.abs(s[i] - 2 * s[i - 1] + s[i - 2]));
  }
  // Across the wrap: last -> first must look like any interior step.
  const seamStep = Math.abs(s[0] - s[n - 1]);
  const seamCurve = Math.abs(s[0] - 2 * s[n - 1] + s[n - 2]);
  assert.ok(seamStep <= maxStep * 1.02, `seam step ${seamStep} vs ${maxStep}`);
  assert.ok(seamCurve <= maxCurve * 1.02, `seam curvature ${seamCurve} vs ${maxCurve}`);
  // Softer than the old full-scale-ish 18000 sine.
  let peak = 0;
  for (const v of s) peak = Math.max(peak, Math.abs(v));
  assert.ok(peak <= 14000, `peak ${peak}`);
});

test('siren data URI wraps the same PCM in a valid WAV', () => {
  const uri = getSirenDataUri();
  assert.match(uri, /^data:audio\/wav;base64,/);
  const buf = Buffer.from(uri.split(',')[1], 'base64');
  assert.equal(buf.toString('ascii', 0, 4), 'RIFF');
  assert.equal(buf.readUInt32LE(24), SIREN_SAMPLE_RATE);
  const pcm = buildSirenPcm();
  assert.equal(buf.readUInt32LE(40), pcm.length * 2);
  for (const i of [0, 1, 777, pcm.length - 1]) assert.equal(buf.readInt16LE(44 + i * 2), pcm[i]);
});

test('haptics: distinct patterns, and nothing fires while disabled', async () => {
  const calls: string[] = [];
  setHapticsBackendForTests({
    ImpactFeedbackStyle: { Light: 'light', Medium: 'medium', Heavy: 'heavy', Rigid: 'rigid', Soft: 'soft' },
    NotificationFeedbackType: { Success: 'success', Warning: 'warning', Error: 'error' },
    impactAsync: async (s: string) => {
      calls.push(`impact:${s}`);
    },
    notificationAsync: async (t: string) => {
      calls.push(`notify:${t}`);
    },
  } as never);
  try {
    haptics.crowbarHit();
    haptics.crowbarMiss();
    haptics.alarm();
    haptics.heartLost();
    assert.deepEqual(calls, ['impact:heavy', 'impact:light', 'notify:warning', 'impact:heavy']);
    calls.length = 0;
    haptics.caught();
    assert.deepEqual(calls, ['impact:heavy']);
    await new Promise((r) => setTimeout(r, 200));
    assert.deepEqual(calls, ['impact:heavy', 'notify:error']);

    calls.length = 0;
    setHapticsEnabled(false);
    for (const fn of Object.values(haptics)) fn();
    await new Promise((r) => setTimeout(r, 200));
    assert.deepEqual(calls, []);
  } finally {
    setHapticsEnabled(true);
    setHapticsBackendForTests(null);
  }
  // Without a real backend (tests / web) calls never throw.
  for (const fn of Object.values(haptics)) fn();
});
