import AsyncStorage from '@react-native-async-storage/async-storage';
// Namespace import: AppState is looked up defensively (the unit-test
// stub of react-native has no AppState).
import * as ReactNative from 'react-native';

// Crash-resistant ring-buffer logger. Two storage slots:
//   debug:current   - this run's log, written on every entry (debounced)
//   debug:previous  - last run's log, copied from `current` at boot
//
// At app start we read `current` (= what survived the prior run /
// crash), copy it to `previous` so the bug-report composer can attach
// it, then wipe `current` to start fresh. If the app crashes mid-run
// the next launch finds the partially-written buffer in `current`
// and treats it as the previous run's log - which is exactly the
// crash-to-desktop trail the user wants in their bug reports.
//
// Persistence is debounced by ~200 ms to keep AsyncStorage off the
// hot path. Error-level entries, the app going to the background and
// the global-error handler write immediately instead.
//
// Limitation (honest version): AsyncStorage has no synchronous write,
// so no flush here is guaranteed to land. For a fatal JS error the
// handler starts the write and holds the default (crashing) handler
// back for up to FATAL_FLUSH_WAIT_MS so the native write can finish;
// if the process dies sooner, or the crash is native (OOM, a native
// module, the OS killing the app), the last entries since the previous
// flush - at most ~200 ms of logging - are lost. The background flush
// covers the common "killed while backgrounded" case.

const KEY_CURRENT = 'debug:current';
const KEY_PREVIOUS = 'debug:previous';
const MAX_ENTRIES = 120;
const FLUSH_DELAY_MS = 200;
// How long a fatal error waits for the crash trail to be written
// before handing over to the default handler.
const FATAL_FLUSH_WAIT_MS = 250;

export type LogLevel = 'log' | 'warn' | 'error';
export type LogEntry = { t: number; level: LogLevel; msg: string };

let entries: LogEntry[] = [];
let previousRun: LogEntry[] | null = null;
let installed = false;
let flushTimer: ReturnType<typeof setTimeout> | null = null;

function stringify(v: unknown): string {
  if (typeof v === 'string') return v;
  if (v instanceof Error) return `${v.message}\n${v.stack ?? ''}`;
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

// Writes are chained so an older snapshot can never land after a
// newer one.
let writeChain: Promise<void> = Promise.resolve();
let flushFailures = 0;
let lastImmediateFlush = 0;

function flush(): Promise<void> {
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  const snapshot = JSON.stringify(entries.slice(-MAX_ENTRIES));
  // Not awaited by the game loop: a slow AsyncStorage write shouldn't
  // stall a frame. The next entry will queue another flush.
  writeChain = writeChain
    .then(() => AsyncStorage.setItem(KEY_CURRENT, snapshot))
    .then(
      () => {
        flushFailures = 0;
      },
      () => {
        // Persistence is best-effort; count failures so the in-memory
        // log (shown in bug reports from this session) says so, without
        // logging every retry.
        flushFailures++;
        if (flushFailures === 1) {
          entries.push({ t: Date.now(), level: 'warn', msg: '[debug] crash-trail write failed' });
        }
      },
    );
  return writeChain;
}

// Write the log now (e.g. before reloading into an update). Resolves
// when the write settled; never rejects.
export function flushDebugLog(): Promise<void> {
  return flush();
}

function scheduleFlush() {
  if (flushTimer) return;
  flushTimer = setTimeout(flush, FLUSH_DELAY_MS);
}

export function logDebug(level: LogLevel, ...parts: unknown[]) {
  entries.push({
    t: Date.now(),
    level,
    msg: parts.map(stringify).join(' '),
  });
  // Cap memory so a long session doesn't eat the heap. We keep
  // double the persisted ceiling so the in-memory buffer can absorb
  // a burst between flushes.
  if (entries.length > MAX_ENTRIES * 2) {
    entries = entries.slice(-MAX_ENTRIES);
  }
  // Errors are what a crash trail is for: write them without the
  // debounce, at most once a second (a library spamming console.error
  // every frame must not turn into a storage write every frame).
  const now = Date.now();
  if (level === 'error' && now - lastImmediateFlush >= 1000) {
    lastImmediateFlush = now;
    void flush();
  } else scheduleFlush();
}

export function getEntries(): LogEntry[] {
  return entries.slice(-MAX_ENTRIES);
}

export function getPreviousRun(): LogEntry[] | null {
  return previousRun;
}

export function formatEntry(e: LogEntry): string {
  // ISO HH:MM:SS prefix keeps the timeline readable in plain text;
  // the level tag is padded so columns align.
  const ts = new Date(e.t).toISOString().slice(11, 19);
  return `${ts} ${e.level.toUpperCase().padEnd(5)} ${e.msg}`;
}

// One-shot install. Idempotent so a hot reload doesn't double-hook
// console / ErrorUtils.
export async function installDebugLogger(): Promise<void> {
  if (installed) return;
  installed = true;

  try {
    const prev = await AsyncStorage.getItem(KEY_CURRENT);
    if (prev) {
      try {
        previousRun = JSON.parse(prev) as LogEntry[];
      } catch {
        previousRun = null;
      }
      // Persist the rotated copy so a debugger can read it later
      // even after the in-memory previousRun is wiped on a hot
      // reload.
      await AsyncStorage.setItem(KEY_PREVIOUS, prev);
    }
    await AsyncStorage.removeItem(KEY_CURRENT);
  } catch (e) {
    // Best-effort; note it in this session's log.
    entries.push({ t: Date.now(), level: 'warn', msg: `[debug] rotating previous log failed: ${stringify(e)}` });
  }

  // Mirror console.error / console.warn into the buffer so library
  // warnings + thrown errors land in the report alongside our
  // explicit logDebug() calls. The originals still fire so dev
  // tools keep showing them.
  const origError = console.error;
  console.error = (...args: unknown[]) => {
    logDebug('error', ...args);
    origError.apply(console, args as []);
  };
  const origWarn = console.warn;
  console.warn = (...args: unknown[]) => {
    logDebug('warn', ...args);
    origWarn.apply(console, args as []);
  };

  // Capture uncaught JS errors via React Native's global error
  // trampoline. The entry is written at once; for a fatal error the
  // default handler (which tears the app down in release builds) is
  // held back until that write settles or FATAL_FLUSH_WAIT_MS passes.
  type ErrorUtilsLike = {
    getGlobalHandler?: () => (err: Error, isFatal?: boolean) => void;
    setGlobalHandler?: (h: (err: Error, isFatal?: boolean) => void) => void;
  };
  const eu = (globalThis as { ErrorUtils?: ErrorUtilsLike }).ErrorUtils;
  if (eu?.setGlobalHandler) {
    const prevHandler = eu.getGlobalHandler?.();
    let fatalPending = false;
    eu.setGlobalHandler((err, isFatal) => {
      logDebug(
        'error',
        `[${isFatal ? 'fatal' : 'soft'}] ${err?.message ?? String(err)}`,
        err?.stack ?? '',
      );
      // Write now, whatever the debounce / rate limit decided.
      void flush();
      if (!prevHandler) return;
      if (!isFatal || fatalPending) {
        prevHandler(err, isFatal);
        return;
      }
      fatalPending = true;
      let handed = false;
      const handOver = () => {
        if (handed) return;
        handed = true;
        prevHandler(err, isFatal);
      };
      writeChain.then(handOver, handOver);
      setTimeout(handOver, FATAL_FLUSH_WAIT_MS);
    });
  }

  // Backgrounding is when Android may kill the process without any JS
  // running again: write the trail now.
  const appState = (ReactNative as { AppState?: { addEventListener?: (t: 'change', cb: (s: string) => void) => unknown } })
    .AppState;
  if (appState?.addEventListener) {
    try {
      appState.addEventListener('change', (next) => {
        logDebug('log', `app state -> ${next}`);
        if (next !== 'active') void flush();
      });
    } catch {
      // No AppState on this platform; the debounced flush still runs.
    }
  }

  logDebug('log', 'logger installed');
}
