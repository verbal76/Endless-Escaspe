import AsyncStorage from '@react-native-async-storage/async-storage';

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
// hot path; the global-error handler force-flushes synchronously so
// the very last entries before a JS-level crash are captured.

const KEY_CURRENT = 'debug:current';
const KEY_PREVIOUS = 'debug:previous';
const MAX_ENTRIES = 120;
const FLUSH_DELAY_MS = 200;

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

function flush() {
  flushTimer = null;
  // Fire-and-forget: a slow AsyncStorage write shouldn't stall the
  // game loop. The next entry will queue another flush.
  AsyncStorage.setItem(
    KEY_CURRENT,
    JSON.stringify(entries.slice(-MAX_ENTRIES)),
  ).catch(() => {
    // ignore - persistence is best-effort
  });
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
  scheduleFlush();
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
  } catch {
    // best-effort
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
  // trampoline. We force a synchronous-ish flush so the very last
  // entries make it to disk before the app tears down.
  type ErrorUtilsLike = {
    getGlobalHandler?: () => (err: Error, isFatal?: boolean) => void;
    setGlobalHandler?: (h: (err: Error, isFatal?: boolean) => void) => void;
  };
  const eu = (globalThis as { ErrorUtils?: ErrorUtilsLike }).ErrorUtils;
  if (eu?.setGlobalHandler) {
    const prevHandler = eu.getGlobalHandler?.();
    eu.setGlobalHandler((err, isFatal) => {
      logDebug(
        'error',
        `[${isFatal ? 'fatal' : 'soft'}] ${err.message}`,
        err.stack ?? '',
      );
      // Cancel the pending debounce + write right now so the crash
      // log isn't lost waiting for the timer.
      if (flushTimer) {
        clearTimeout(flushTimer);
        flushTimer = null;
      }
      flush();
      if (prevHandler) prevHandler(err, isFatal);
    });
  }

  logDebug('log', 'logger installed');
}
