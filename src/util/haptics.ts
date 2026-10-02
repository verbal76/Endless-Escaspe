// Thin wrapper over expo-haptics so the call-sites stay readable
// and so we can swallow failures on devices / simulators that don't
// support haptics. Each named event maps to a vibration profile
// that fits the in-game moment:
//
//   pickupGrab    - light blip when walking over a pickup
//   pickupUse     - medium tap when a throwable / smoke bomb fires
//   crowbarMiss   - light tap: the crowbar swung at nothing
//   crowbarHit    - heavy impact: the crowbar connected
//   heartLost     - heavy thud on catch (one heart down)
//   caught        - heavy thud, then an error buzz, on game over
//   alarm         - warning notification when the alarm fills and
//                   reinforcements arrive (distinct from heartLost)
//   cleared       - success notification when a segment is won
//
// Fire catch / caught at the moment of impact (same tick as the
// caught / hurt sound), not after the hit-stop.
//
// Calls are fire-and-forget, never throw, and do nothing while
// haptics are disabled (setHapticsEnabled(false), the player's
// settings toggle).

import * as Haptics from 'expo-haptics';

// The slice of expo-haptics used here; swappable for tests.
export type HapticsBackend = {
  impactAsync: (style: Haptics.ImpactFeedbackStyle) => Promise<void>;
  notificationAsync: (type: Haptics.NotificationFeedbackType) => Promise<void>;
  ImpactFeedbackStyle: typeof Haptics.ImpactFeedbackStyle;
  NotificationFeedbackType: typeof Haptics.NotificationFeedbackType;
};

let backend: HapticsBackend = Haptics as unknown as HapticsBackend;
let enabled = true;

export function setHapticsEnabled(on: boolean) {
  enabled = on;
}

export function hapticsEnabled(): boolean {
  return enabled;
}

// Test hook: route calls to a fake backend (pass null to restore).
export function setHapticsBackendForTests(b: HapticsBackend | null) {
  backend = b ?? (Haptics as unknown as HapticsBackend);
}

// Delay between the thud and the error buzz of `caught`.
const CAUGHT_BUZZ_DELAY_MS = 110;

const fire = (call: (b: HapticsBackend) => Promise<unknown> | undefined) => {
  if (!enabled) return;
  try {
    // Devices without a vibrator (web, sim) reject these calls; we
    // don't want a stray rejection to surface in dev menus.
    call(backend)?.catch(() => {});
  } catch {
    // backend missing (tests / unsupported platform)
  }
};

const impact = (pick: (s: typeof Haptics.ImpactFeedbackStyle) => Haptics.ImpactFeedbackStyle) =>
  fire((b) => b.impactAsync(pick(b.ImpactFeedbackStyle)));
const notify = (
  pick: (t: typeof Haptics.NotificationFeedbackType) => Haptics.NotificationFeedbackType,
) => fire((b) => b.notificationAsync(pick(b.NotificationFeedbackType)));

export const haptics = {
  pickupGrab: () => impact((s) => s.Light),
  pickupUse: () => impact((s) => s.Medium),
  crowbarMiss: () => impact((s) => s.Light),
  crowbarHit: () => impact((s) => s.Heavy),
  heartLost: () => impact((s) => s.Heavy),
  caught: () => {
    if (!enabled) return;
    impact((s) => s.Heavy);
    setTimeout(() => notify((t) => t.Error), CAUGHT_BUZZ_DELAY_MS);
  },
  alarm: () => notify((t) => t.Warning),
  cleared: () => notify((t) => t.Success),
};
