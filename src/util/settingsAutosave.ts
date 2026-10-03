// Persist the player's settings as soon as they change (review A-8).
// They used to be written only when the pause panel closed, so a slider
// change followed by the app being killed - or by restarting into an
// update from that same panel - was lost.
//
// Writes are debounced (a dragged slider is one write, not dozens) and
// `flush()` writes any pending change at once (app going to the
// background, restarting into an update).

export type AutosaveFields = {
  masterVolume: number;
  musicVolume: number;
  weatherEnabled: boolean;
  hapticsEnabled: boolean;
};

type Source<S> = {
  getState: () => S;
  subscribe: (listener: (state: S, prev: S) => void) => () => void;
};

export type SettingsAutosave = { flush: () => Promise<void>; stop: () => void };

const pick = (s: AutosaveFields): AutosaveFields => ({
  masterVolume: s.masterVolume,
  musicVolume: s.musicVolume,
  weatherEnabled: s.weatherEnabled,
  hapticsEnabled: s.hapticsEnabled,
});

const same = (a: AutosaveFields, b: AutosaveFields) =>
    a.masterVolume === b.masterVolume &&
  a.musicVolume === b.musicVolume &&
  a.weatherEnabled === b.weatherEnabled &&
  a.hapticsEnabled === b.hapticsEnabled;

export function startSettingsAutosave<S extends AutosaveFields>(
  store: Source<S>,
  save: (patch: AutosaveFields) => unknown,
  delayMs = 400,
  timers: { set: typeof setTimeout; clear: typeof clearTimeout } = { set: setTimeout, clear: clearTimeout },
): SettingsAutosave {
  let written = pick(store.getState());
  let timer: ReturnType<typeof setTimeout> | null = null;

  const flush = (): Promise<void> => {
    if (timer !== null) {
      timers.clear(timer);
      timer = null;
    }
    const now = pick(store.getState());
    if (same(now, written)) return Promise.resolve();
    written = now;
    try {
      return Promise.resolve(save(now)).then(() => undefined, () => undefined);
    } catch {
      // saveSettings logs its own failures; never throw into the store.
      return Promise.resolve();
    }
  };

  const unsubscribe = store.subscribe((s) => {
    if (same(pick(s), written)) return;
    if (timer !== null) timers.clear(timer);
    timer = timers.set(() => void flush(), delayMs);
  });

  return {
    flush,
    stop: () => {
      void flush();
      unsubscribe();
    },
  };
}

// The app's one running instance (App.tsx), so a restart into an update
// can write a pending change first.
let active: SettingsAutosave | null = null;
export function setActiveSettingsAutosave(a: SettingsAutosave | null): void {
  active = a;
}
export function flushPendingSettings(): Promise<void> {
  return active?.flush() ?? Promise.resolve();
}
