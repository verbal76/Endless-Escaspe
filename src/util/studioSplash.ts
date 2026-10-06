// Hot Attic Games opening studio splash (pure rules).
//
// Hot Attic Games standing requirement: every studio app opens with the
// studio card before its own title / menu. Sequence on a genuine cold
// launch: native (system) splash -> studio card -> the app's own opening
// -> normal experience. The card shows the canonical logo, centred, whole
// artwork, original aspect ratio, with a short fade in / out (~2.5 s
// total), silent, offline. It never gates on the network and cannot get
// stuck: it ends on a timer, and at once if the image fails to load.

// Total on-screen time including both fades (the brief is ~2-3 s).
export const STUDIO_SPLASH_MS = 2500;
export const STUDIO_FADE_MS = 350;
// Canonical studio asset (owner-supplied; never redrawn or replaced). It
// sits at the repository root under exactly this name.
export const STUDIO_LOGO_FILE = 'Hot_Attic_Games_Master_Logo_ALPHA_FINAL.png';
export const STUDIO_LOGO_PATH = STUDIO_LOGO_FILE;
// Same colour as the native splash / app boot background, so the card
// appears with no flash between them. The logo's transparency shows it.
export const STUDIO_SPLASH_BACKGROUND = '#0b0d12';

export type SplashPlan = { show: boolean; durationMs: number; fadeMs: number; holdMs: number };

// `source` is the bundled image (a require() result) or null when the
// canonical asset is unavailable (the splash is then skipped entirely).
export function splashPlan(source: unknown | null, durationMs: number = STUDIO_SPLASH_MS): SplashPlan {
  if (source === null || source === undefined) return { show: false, durationMs: 0, fadeMs: 0, holdMs: 0 };
  const ms = Number.isFinite(durationMs) ? Math.max(2000, Math.min(3000, Math.round(durationMs))) : STUDIO_SPLASH_MS;
  return { show: true, durationMs: ms, fadeMs: STUDIO_FADE_MS, holdMs: ms - 2 * STUDIO_FADE_MS };
}
