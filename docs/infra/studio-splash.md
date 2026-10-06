# E. Hot Attic Games opening studio splash

**Status: ACTIVE.** The canonical artwork was supplied by the owner as
`Hot_Attic_Games_Master_Logo_ALPHA_FINAL.png` (repository root; 1536x1024 RGBA,
real transparency: 475,725 fully transparent pixels, the rest opaque, no baked-in
checkerboard; git blob `e11f8c576652b82780967a02ee4b4acd12e8a3c8`, SHA-256
`e3d9bb5653eafb783eede827606e7ac73a4e45564a1c25b1ed13ad1429f48c4e`). It is byte-identical to
the file on `main`; it is never redrawn, cropped, recoloured or replaced.
The earlier blocker ("`branding/Hot_Attic_Games_Master_Logo.png` not found, requires owner supply") is
**obsolete and resolved**; that old path must not be referenced anywhere.

- Mechanism (unchanged design, now enabled): `src/ui/StudioSplash.tsx` (card), `src/util/studioSplash.ts` (plan),
  `src/ui/studioSplashSource.ts` (`require()` of the canonical PNG), wiring in `App.tsx`.
- Launch order on a cold start: Android system splash (game icon on `#0b0d12`, unchanged and not removable on
  Android 12+) -> **Hot Attic Games card** -> the game's own opening (boot -> title / menu) -> normal play.
- Card: the whole logo, centred, `resizeMode="contain"` (original aspect ratio, never cropped or stretched), on `#0b0d12`
  (the same colour as the system splash and the boot screen, so there is no flash; the PNG's transparency shows it), inside the
  safe-area insets plus 24 dp. Fade in 350 ms, hold, fade out 350 ms; **2.5 s total** (clamped 2-3 s). Silent, no text, no buttons, offline.
- Startup work is not delayed: settings, saves, textures and the display font load behind the card (the mount effect in
  `App.tsx`); `Game` mounts when both the card and boot are done.
- Cold launch only: the card's "done" state lives in `App`'s React state, which exists for the life of the process, so
  background / resume never replays it. It can't strand the user: it ends on its animation, on a backstop timer, and at once
  if the image fails to load (`onError`).
- Native build required: **NO**. The change is JavaScript plus a bundled asset, so it is OTA-capable. It does not touch the native
  fingerprint (runtime 0.3.0 = `b32bf103...` unchanged). The system splash (`app.json` `splash`) was deliberately left alone: on Android 12+
  the system always draws an icon splash, so removing the image gains nothing.
- Tests (`tests/studioSplash.test.ts`): canonical filename and exact git blob hash; PNG header (1536x1024, RGBA); alpha decoded from the
  file (transparent corners, opaque artwork); the bundled source requires exactly that file and not the old path; duration within 2-3 s
  and fades add up; `contain`, safe-area use, error backstop, no text / buttons / sound; cold-launch order in `App.tsx`; resume
  never touches the splash.
- Verified in the browser harness with the real file: the card shows the complete logo (natural 1536x1024, fitted by `contain`), on the dark
  background with transparent edges, for ~2.5 s, then the title screen; no console errors. NOT verified on a device: the fade
  feel, the system-splash -> card hand-off, orientations and cutouts. The browser harness could not sample the fade opacity.
- Standing studio requirement: every Hot Attic Games app opens with this card (see `CLAUDE.md`).
