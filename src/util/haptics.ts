// Thin wrapper over expo-haptics so the call-sites stay readable
// and so we can swallow failures on devices / simulators that don't
// support haptics. Each named event maps to a vibration profile
// that fits the in-game moment:
//
//   pickupGrab    - light blip when walking over a pickup
//   pickupUse     - medium tap when crowbar / smoke bomb fires
//   heartLost     - heavy thud on catch (one heart down)
//   caught        - heavy thud + warning notification on game over
//   cleared       - success notification when a segment is won
//
// Calls are fire-and-forget and never throw.

import * as Haptics from 'expo-haptics';

const swallow = (p: Promise<unknown>) => {
  // Devices without a vibrator (web, sim) reject these calls; we don't
  // want a stray rejection to surface in dev menus.
  p.catch(() => {});
};

export const haptics = {
  pickupGrab: () => swallow(Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)),
  pickupUse: () => swallow(Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)),
  heartLost: () => swallow(Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy)),
  caught: () =>
    swallow(Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)),
  cleared: () =>
    swallow(Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)),
};
