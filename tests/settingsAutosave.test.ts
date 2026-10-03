import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startSettingsAutosave, type AutosaveFields } from '../src/util/settingsAutosave';

function fakeStore(init: AutosaveFields & { other: number }) {
  let state = init;
  const ls = new Set<(s: typeof init, p: typeof init) => void>();
  return {
    getState: () => state,
    subscribe: (l: (s: typeof init, p: typeof init) => void) => {
      ls.add(l);
      return () => ls.delete(l);
    },
    set: (patch: Partial<typeof init>) => {
      const prev = state;
      state = { ...state, ...patch };
      ls.forEach((l) => l(state, prev));
    },
  };
}

function fakeTimers() {
  const pending = new Map<number, () => void>();
  let id = 0;
  return {
    set: ((fn: () => void) => {
      pending.set(++id, fn);
      return id;
    }) as unknown as typeof setTimeout,
    clear: ((h: number) => {
      pending.delete(h);
    }) as unknown as typeof clearTimeout,
    run: () => {
      const fns = [...pending.values()];
      pending.clear();
      fns.forEach((f) => f());
    },
    count: () => pending.size,
  };
}

test('settings autosave: debounced, skips unchanged and unrelated state, flushes on demand', () => {
  const store = fakeStore({ masterVolume: 0.7, musicVolume: 0.5, weatherEnabled: true, hapticsEnabled: true, other: 0 });
  const t = fakeTimers();
  const writes: AutosaveFields[] = [];
  const a = startSettingsAutosave(store, (p) => writes.push(p), 400, t);

  store.set({ other: 1 });
  assert.equal(t.count(), 0, 'unrelated state never schedules a write');

  store.set({ masterVolume: 0.6 });
  store.set({ masterVolume: 0.5 });
  assert.equal(t.count(), 1, 'one pending write while dragging');
  t.run();
  assert.deepEqual(writes, [{ masterVolume: 0.5, musicVolume: 0.5, weatherEnabled: true, hapticsEnabled: true }]);

  store.set({ weatherEnabled: false });
  a.flush();
  assert.equal(writes.length, 2);
  assert.equal(writes[1].weatherEnabled, false);
  t.run();
  assert.equal(writes.length, 2, 'a flushed change is not written twice');

  store.set({ hapticsEnabled: false });
  a.flush();
  assert.equal(writes.length, 3, 'the haptics toggle is saved too');
  assert.equal(writes[2].hapticsEnabled, false);

  store.set({ musicVolume: 0.2 });
  store.set({ musicVolume: 0.5 });
  t.run();
  assert.equal(writes.length, 3, 'a change undone before the write is skipped');

  a.stop();
  store.set({ musicVolume: 0.1 });
  assert.equal(t.count(), 0, 'stopped');
});

test('settings autosave: a throwing or rejecting save never reaches the store', () => {
  const store = fakeStore({ masterVolume: 0.7, musicVolume: 0.5, weatherEnabled: true, hapticsEnabled: true, other: 0 });
  const t = fakeTimers();
  let n = 0;
  const a = startSettingsAutosave(store, () => {
    n++;
    if (n === 1) throw new Error('boom');
    return Promise.reject(new Error('later'));
  }, 400, t);
  store.set({ masterVolume: 0.1 });
  assert.doesNotThrow(() => t.run());
  store.set({ masterVolume: 0.2 });
  assert.doesNotThrow(() => a.flush());
  assert.equal(n, 2);
});
