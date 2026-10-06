// The canonical Hot Attic Games studio logo, bundled for the opening
// splash (src/ui/StudioSplash.tsx).
//
// The owner-supplied artwork is Hot_Attic_Games_Master_Logo_ALPHA_FINAL.png
// at the repository root (1536x1024 RGBA, real transparency). Never redraw,
// crop, recolour or substitute it. tests/studioSplash.test.ts pins this file
// to that exact PNG (git blob e11f8c57...), so a changed or replaced image
// fails CI.
export const STUDIO_SPLASH_SOURCE: number | null = require('../../Hot_Attic_Games_Master_Logo_ALPHA_FINAL.png');
