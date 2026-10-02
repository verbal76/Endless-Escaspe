// Music / Sfx / Siren against fake players: state transitions,
// silence at 0, recovery from external pauses, throttling, teardown.
import { test } from 'node:test';
import assert from 'node:assert/strict';

// Metro turns require('...mp3') into an asset id; ESM tests have no require.
const g = globalThis as unknown as { require?: unknown };
let assetId = 0;
g.require ??= () => ++assetId;

type Status = { playing?: boolean; didJustFinish?: boolean; currentTime?: number; duration?: number };

class FakePlayer {
  volume = 0;
  loop = false;
  playing = false;
  rate = 1;
  removed = false;
  log: string[] = [];
  private cbs: Array<(s: Status) => void> = [];
  asset: number;
  constructor(asset: number) {
    this.asset = asset;
  }
  play() {
    this.log.push('play');
    this.playing = true;
  }
  pause() {
    this.log.push('pause');
    this.playing = false;
  }
  seekTo(t: number) {
    this.log.push(`seek:${t}`);
  }
  remove() {
    this.removed = true;
  }
  setPlaybackRate(r: number) {
    this.rate = r;
  }
  addListener(_e: string, cb: (s: Status) => void) {
    this.cbs.push(cb);
    return { remove: () => (this.cbs = this.cbs.filter((c) => c !== cb)) };
  }
  emit(s: Status) {
    if (typeof s.playing === 'boolean') this.playing = s.playing;
    for (const cb of [...this.cbs]) cb(s);
  }
  get listeners() {
    return this.cbs.length;
  }
}

class FakeAppState {
  currentState = 'active';
  private cbs: Array<(s: string) => void> = [];
  addEventListener(_t: 'change', cb: (s: string) => void) {
    this.cbs.push(cb);
    return { remove: () => (this.cbs = this.cbs.filter((c) => c !== cb)) };
  }
  set(s: string) {
    this.currentState = s;
    for (const cb of this.cbs) cb(s);
  }
}

async function makeMusic(volume: number, randomSeq: number[] = [0]) {
  const { createMusic } = await import('../src/scenes/Music');
  const players: FakePlayer[] = [];
  const app = new FakeAppState();
  let t = 0;
  let r = 0;
  const music = createMusic(volume, {
    createPlayer: (asset, loop) => {
      const p = new FakePlayer(asset);
      p.loop = loop;
      players.push(p);
      return p;
    },
    appState: app,
    now: () => t,
    random: () => randomSeq[r++ % randomSeq.length],
  });
  const [calmA, calmB, tension] = players;
  return {
    music,
    app,
    calm: [calmA, calmB],
    tension,
    advance: (ms: number) => {
      t += ms;
    },
  };
}

test('music: boots on a calm track, tension paused while inaudible', async () => {
  const m = await makeMusic(0.6);
  const playingCalm = m.calm.filter((p) => p.playing);
  assert.equal(playingCalm.length, 1);
  assert.ok(Math.abs(playingCalm[0].volume - 0.36) < 1e-9, 'perceptual curve: 0.6^2');
  assert.equal(m.tension.playing, false);
  assert.equal(m.tension.loop, true);
});

test('music: volume 0 is exactly silent and holds no playing player', async () => {
  const m = await makeMusic(0.5);
  // A descending slider ramp ending at 0.
  for (let v = 0.5; v > 0; v -= 0.0193) m.music.setVolume(v);
  m.music.setVolume(0);
  for (const p of [...m.calm, m.tension]) {
    assert.equal(p.volume, 0);
    assert.equal(p.playing, false);
  }
  // Raising it again resumes the calm track.
  m.music.setVolume(0.5);
  assert.equal(m.calm.filter((p) => p.playing).length, 1);
});

test('music: chase crossfades to the tension track alone; calm pauses and resumes', async () => {
  const m = await makeMusic(1);
  const cur = m.calm.find((p) => p.playing)!;
  m.music.setMix(0.15, 0.8, 1); // alert
  assert.equal(m.tension.playing, true);
  assert.ok(Math.abs(m.tension.volume - 0.8) < 1e-9);
  m.music.setMix(0, 1, 1.06); // chase
  assert.equal(cur.playing, false);
  assert.equal(cur.volume, 0);
  assert.equal(m.tension.rate, 1.06);
  m.music.setMix(1, 0, 1); // calm again
  assert.equal(cur.playing, true);
  assert.equal(m.tension.playing, false);
  // Resumed, not restarted.
  assert.equal(cur.log.filter((l) => l.startsWith('seek')).length, 1);
});

test('music: an external pause is retried (paced) while in the foreground', async () => {
  const m = await makeMusic(0.5);
  const cur = m.calm.find((p) => p.playing)!;
  const plays = () => cur.log.filter((l) => l === 'play').length;
  const before = plays();
  m.advance(2000);
  cur.emit({ playing: false, didJustFinish: false, currentTime: 10, duration: 120 });
  assert.equal(plays(), before + 1);
  // Debounced: a second report right away does not spam play().
  cur.emit({ playing: false, didJustFinish: false, currentTime: 10, duration: 120 });
  assert.equal(plays(), before + 1);
  m.advance(1100);
  cur.emit({ playing: false, didJustFinish: false, currentTime: 10, duration: 120 });
  assert.equal(plays(), before + 2);
});

test('music: no retries in the background; foreground re-asserts state', async () => {
  const m = await makeMusic(0.5);
  const cur = m.calm.find((p) => p.playing)!;
  const plays = () => cur.log.filter((l) => l === 'play').length;
  m.app.set('background');
  m.advance(5000);
  cur.emit({ playing: false }); // OS paused it
  const n = plays();
  m.advance(5000);
  cur.emit({ playing: false });
  assert.equal(plays(), n, 'must not play in the background');
  // The OS resumed the inaudible tension player on its own: paused again.
  m.tension.emit({ playing: true });
  m.app.set('active');
  assert.equal(plays(), n + 1);
  assert.equal(cur.playing, true);
  assert.equal(m.tension.playing, false);
});

test('music: next calm track starts just before the end (no gap); no triple repeats', async () => {
  // random 0 -> always the first allowed candidate.
  const m = await makeMusic(0.5, [0]);
  const first = m.calm.findIndex((p) => p.playing);
  const other = 1 - first;
  m.calm[first].emit({ playing: true, currentTime: 63.9, duration: 64.4 });
  // Either a repeat was queued (handoff waits for the end) or the other started.
  if (!m.calm[other].playing) {
    m.calm[first].emit({ playing: false, didJustFinish: true, currentTime: 64.4, duration: 64.4 });
    assert.equal(m.calm[first].playing, true, 'repeat restarts the same track');
    m.calm[first].emit({ playing: true, currentTime: 63.9, duration: 64.4 });
  }
  assert.equal(m.calm[other].playing, true, 'third play must switch track');
  // The outgoing track plays out its tail, then is left alone.
  m.calm[first].emit({ playing: false, didJustFinish: true, currentTime: 64.4, duration: 64.4 });
  assert.equal(m.calm[other].playing, true);
});

test('music: dispose releases players and listeners and is idempotent', async () => {
  const m = await makeMusic(0.5);
  m.music.dispose();
  m.music.dispose();
  for (const p of [...m.calm, m.tension]) {
    assert.equal(p.removed, true);
    assert.equal(p.listeners, 0);
  }
  m.music.setVolume(1); // no throw, no effect
  assert.ok(m.calm.every((p) => !p.playing));
});

test('pickNextCalm never picks the same track a third time', async () => {
  const { pickNextCalm } = await import('../src/scenes/Music');
  assert.equal(pickNextCalm([0, 1], [0, 0], () => 0), 1);
  assert.equal(pickNextCalm([0, 1], [1, 1], () => 0.99), 0);
  assert.equal(pickNextCalm([0, 1], [0, 1], () => 0), 0);
  assert.equal(pickNextCalm([1], [1, 1], () => 0), 1);
  assert.equal(pickNextCalm([], [], () => 0), -1);
});

test('sfx: perceptual master, endpoints silent, throttled stingers, new events', async () => {
  const { createSfx, playSfx, sfxVolume, SFX_GAIN } = await import('../src/scenes/Sfx');
  const s = createSfx();
  for (const n of ['stage_clear', 'coin', 'purchase', 'spotted', 'alarm', 'ui_tap'] as const) {
    assert.ok(s.pools[n].players.length > 0, n);
  }
  assert.equal(sfxVolume('gunshot', 0), 0);
  assert.equal(sfxVolume('gunshot', 0.004), 0);
  assert.ok(Math.abs(sfxVolume('caught', 0.5) - 0.25 * SFX_GAIN.caught) < 1e-9);
  // Level balance: the death cues outrank the gunshot that precedes them.
  assert.ok(SFX_GAIN.hurt > SFX_GAIN.gunshot);
  assert.equal(playSfx(s, 'gunshot', 0), false);
  assert.equal(playSfx(s, 'spotted', 1, 1, 1000), true);
  assert.equal(playSfx(s, 'spotted', 1, 1, 2500), false);
  assert.equal(playSfx(s, 'spotted', 1, 1, 3001), true);
  assert.equal(playSfx(s, 'ui_tap', 1, 1, 0), true);
  assert.equal(playSfx(s, 'ui_tap', 1, 1, 30), false);
  assert.equal(playSfx(s, 'ui_tap', 1, 1, 61), true);
  s.dispose();
  s.dispose();
  assert.equal(playSfx(s, 'caught', 1), false);
});

test('siren: fades in above threshold, follows native state, retries after an external pause', async () => {
  const { updateSiren, sirenVolume, SIREN_PLAY_THRESHOLD, SIREN_FADE_IN_SPAN } = await import('../src/scenes/Siren');
  assert.equal(sirenVolume(SIREN_PLAY_THRESHOLD - 0.01, 1), 0);
  assert.equal(sirenVolume(SIREN_PLAY_THRESHOLD, 1), 0);
  assert.ok(sirenVolume(SIREN_PLAY_THRESHOLD + SIREN_FADE_IN_SPAN / 2, 1) < sirenVolume(SIREN_PLAY_THRESHOLD + SIREN_FADE_IN_SPAN, 1));
  assert.equal(sirenVolume(1, 0), 0);
  assert.ok(sirenVolume(1, 1) <= 0.5);

  const p = new FakePlayer(1);
  const handle = {
    player: p as never,
    lastVolume: 0,
    nativePlaying: false,
    wantPlaying: false,
    lastCommandAt: -Infinity,
    ready: true,
    dispose: () => {},
  };
  p.addListener('playbackStatusUpdate', (st) => {
    if (typeof st.playing === 'boolean') handle.nativePlaying = st.playing;
  });
  updateSiren(handle, 0.9, 1, 0);
  assert.equal(p.log.filter((l) => l === 'play').length, 1);
  p.emit({ playing: true });
  updateSiren(handle, 0.9, 1, 100);
  assert.equal(p.log.filter((l) => l === 'play').length, 1);
  // Interrupted behind our back while detection stays high.
  p.emit({ playing: false });
  updateSiren(handle, 0.9, 1, 500);
  assert.equal(p.log.filter((l) => l === 'play').length, 1, 'paced');
  updateSiren(handle, 0.9, 1, 1200);
  assert.equal(p.log.filter((l) => l === 'play').length, 2, 'retried');
  // Master 0: exactly silent and paused.
  updateSiren(handle, 0.9, 0, 1300);
  assert.equal(p.volume, 0);
  assert.equal(p.playing, false);
});
