// Hot Attic Games opening studio splash (pure rules).
//
// Sequence on a genuine launch: native splash -> studio card (black,
// canonical logo centred, aspect preserved) -> the app's own loading /
// title. ~1.5 s, silent. It is additive: the game's own splash and menu
// are untouched. It never gates on the network and cannot get stuck: it
// ends on a timer, and at once if the image fails to load.

export const STUDIO_SPLASH_MS = 1500;
// Canonical studio asset (owner-supplied; never redrawn or replaced).
export const STUDIO_LOGO_PATH = 'branding/Hot_Attic_Games_Master_Logo.png';

export type SplashPlan = { show: boolean; durationMs: number };

// `source` is the bundled image (a require() result) or null when the
// canonical asset has not been added to the repository yet.
export function splashPlan(source: unknown | null, durationMs: number = STUDIO_SPLASH_MS): SplashPlan {
  if (source === null || source === undefined) return { show: false, durationMs: 0 };
  const ms = Number.isFinite(durationMs) ? Math.max(500, Math.min(2500, Math.round(durationMs))) : STUDIO_SPLASH_MS;
  return { show: true, durationMs: ms };
}
