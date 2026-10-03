// The canonical Hot Attic Games studio logo, bundled for the opening
// splash (src/ui/StudioSplash.tsx).
//
// HELD: branding/Hot_Attic_Games_Master_Logo.png does not exist in this
// repository yet, so there is nothing to show and the splash is off
// (startup is unchanged). Do not draw or substitute a logo. To enable:
// add the owner-supplied file at that exact path, then replace the line
// below with
//   export const STUDIO_SPLASH_SOURCE: number | null = require('../../branding/Hot_Attic_Games_Master_Logo.png');
// (tests/studioSplash.test.ts fails if the file exists but this still
// says null, or the other way round).
export const STUDIO_SPLASH_SOURCE: number | null = null;
