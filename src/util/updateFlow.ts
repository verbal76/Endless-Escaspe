// OTA activation policy (pure; the expo-updates calls live in
// components/HUD/UpdateApplying.tsx).
//
// expo-updates checks for an update when the app loads and downloads it
// in the background (checkAutomatically ON_LOAD, fallbackToCacheTimeout 0),
// so startup never waits on the network. A downloaded update only runs
// after the JS runtime reloads. This policy decides WHEN that reload is
// safe, so the owner never has to tap anything:
//
//   discovered -> downloaded + verified by expo-updates ("pending")
//     -> a SAFE POINT (main menu, nothing open, not mid-run)
//     -> show "Please wait, applying update" -> reload into it.
//
// The applying message is shown only once activation is really about to
// start - never for checking or background downloading.

export type UpdatePhase =
  | 'idle' // nothing known / current
  | 'checking'
  | 'downloading'
  | 'staged' // downloaded + verified, waiting for a safe point
  | 'applying'
  | 'failed'; // activation did not complete (watchdog / reload error)

export type UpdatesSnapshot = {
  enabled: boolean;
  isChecking: boolean;
  isDownloading: boolean;
  // A downloaded, verified update is waiting to be launched.
  isUpdatePending: boolean;
  // ID of that update when known (used so one update is tried once).
  pendingUpdateId: string | null;
};

// Where the app is: the update may only be applied when nothing the
// player is doing can be lost or interrupted.
export type SafePoint = {
  runIdle: boolean; // runState === 'idle' (no run in progress, no result card)
  menuHome: boolean; // start screen on its home step (no name being typed, etc.)
  noOverlay: boolean; // no dialog, tutorial, rules reference or settings panel open
};

export function isSafePoint(s: SafePoint): boolean {
  return s.runIdle && s.menuHome && s.noOverlay;
}

export type FlowState = {
  phase: UpdatePhase;
  // Update IDs already tried this session: one attempt each, so a failed
  // activation can never turn into a reload loop.
  attempted: readonly string[];
};

export const INITIAL_FLOW: FlowState = { phase: 'idle', attempted: [] };

// Key under which a pending update is remembered when its ID is unknown.
export const UNKNOWN_UPDATE = '(unknown)';

export type Decision = {
  next: FlowState;
  // True exactly once per update: start activation now.
  apply: boolean;
};

// Pure transition. Call it whenever the snapshot or the safe point
// changes. `applying` and `failed` are only left through `applyFailed`
// / `applyStarted`, never by the snapshot alone.
export function decide(state: FlowState, snap: UpdatesSnapshot, safe: SafePoint): Decision {
  if (!snap.enabled) return { next: { ...state, phase: 'idle' }, apply: false };
  if (state.phase === 'applying' || state.phase === 'failed') return { next: state, apply: false };

  if (snap.isUpdatePending) {
    const key = snap.pendingUpdateId ?? UNKNOWN_UPDATE;
    if (state.attempted.includes(key)) {
      // Already tried this one and it did not take: leave it, stay usable.
      return { next: { ...state, phase: 'failed' }, apply: false };
    }
    if (isSafePoint(safe)) {
      return { next: { phase: 'applying', attempted: [...state.attempted, key] }, apply: true };
    }
    return { next: { ...state, phase: 'staged' }, apply: false };
  }
  if (snap.isDownloading) return { next: { ...state, phase: 'downloading' }, apply: false };
  if (snap.isChecking) return { next: { ...state, phase: 'checking' }, apply: false };
  return { next: { ...state, phase: 'idle' }, apply: false };
}

// Activation did not complete (watchdog timeout or the reload call threw).
export function applyFailed(state: FlowState): FlowState {
  return { ...state, phase: 'failed' };
}

// How long the applying message may stay up before it is given up on.
// A successful reload replaces the JS runtime, so this only ever fires
// when activation is stuck.
export const APPLY_WATCHDOG_MS = 20000;

export function phaseLabel(p: UpdatePhase): string {
  switch (p) {
    case 'idle':
      return 'Up to date';
    case 'checking':
      return 'Checking for update';
    case 'downloading':
      return 'Downloading update';
    case 'staged':
      return 'Update ready (applies at the main menu)';
    case 'applying':
      return 'Applying update';
    case 'failed':
      return 'Last update did not apply (running the previous version)';
  }
}

// Exact user-facing wording (standardised across Hot Attic Games apps).
export const APPLYING_MESSAGE = 'Please wait, applying update';

// Resume checks: the app often stays in memory for days, so the launch
// check alone could leave a published update undiscovered. On returning
// to the foreground a check is made - at most once per interval, and
// never while one is already in flight, an update is already staged,
// or an activation is under way. Cheap: one small manifest request.
export const RESUME_CHECK_MIN_INTERVAL_MS = 30 * 60 * 1000;

export function shouldCheckOnResume(
  nowMs: number,
  lastCheckMs: number | null,
  phase: UpdatePhase,
  minIntervalMs: number = RESUME_CHECK_MIN_INTERVAL_MS,
): boolean {
  if (phase === 'checking' || phase === 'downloading' || phase === 'staged' || phase === 'applying') return false;
  if (lastCheckMs === null) return true;
  return nowMs - lastCheckMs >= minIntervalMs;
}
