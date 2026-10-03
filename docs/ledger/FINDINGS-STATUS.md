# Findings status at OTA 131 (commit 02e13eb)

Every finding ID from the six independent reviews (`docs/reviews/`) with its status after the review-and-fix pass.
Reviews describe the code as it was at commit 370a624 (OTA 120); the SHAs below are on branch
`claude/game-review-suggestions-cjxiqh`. "Device-untested" = verified in unit tests, the browser harness and/or the
Android emulator check, but not on a physical phone.

Legend: FIXED · PARTIAL (what is left is stated) · OPEN (not started) · DECISION (owner product decision needed) · NATIVE (needs a new APK)

## A - lifecycle, saves, flow (docs/reviews/A-lifecycle-saves.md)
| ID | Status | Where / note |
|---|---|---|
| A-1 | FIXED | b89e9c7 gear off a live run = SETTINGS only (same fix as D-2) |
| A-2 | FIXED | c179f6f every restart / menu start rebuilds the scene from its seed |
| A-3 | FIXED | 724df33 + dab6f0f + d12e5cf boss perk saved (Save.perkStages), restored, charged on menu start, cleared on final death |
| A-4 | FIXED | 724df33 unknown entries/fields/outfits kept, corrupt primary falls back to backup, bad primary parked at `saves:v1.unreadable`, `~meta` schema version, early-write merge |
| A-5 | FIXED | 9b5adcc/133f35b loop survives exceptions; d12e5cf recovery dialog after 30 failing frames |
| A-6 | FIXED | a798994 start screen resets on run start |
| A-7 | FIXED | 724df33 + dab6f0f own-property save lookups, `isSaveKeyTaken` |
| A-8 | FIXED | c8ff37b autosave (debounced, flushed on background / before OTA reload); 6d53e80 fixes a web-only `setTimeout` invocation bug |
| A-9 | FIXED (device-untested) | a798994 Android back on every menu step, intro and dialogs |
| A-10 | FIXED | b2f565e crash trail flushes errors at once; 724df33/dab6f0f write-failure + recovery toasts |
| A-11 | DECISION -> DECIDED | owner chose "pay only improvement on the day's best". Not implemented (freeze). See docs/proposals/daily-replay-rewards.md |
| A-12 | FIXED | eb181ca RUN AGAIN after UTC midnight starts today's Daily |
| A-13 | FIXED | c6f2d2d one scene build per stage clear |
| A-14 | PARTIAL | keep-awake only during play + no unhandled rejection (c8ff37b). OPEN: dead `bossMode*` settings still in storage/store |

## B - gameplay (docs/reviews/B-gameplay.md) - gameplay pass 0c7f942, aa13b2b, 6baaa3f, c179f6f, f92fcf5 (tests), 6a84afd
| ID | Status | Note |
|---|---|---|
| B-1 | FIXED | no goal-less `investigate`; positioned external feeds; smoke/stun gating |
| B-2 | FIXED | pause no longer clears bullets / aim wind-ups |
| B-3 | FIXED | restart empties the bag + rebuilds |
| B-4 | FIXED | `moodStageFor` uses `Math.imul` (src/game/runRules.ts) |
| B-5 | FIXED | beams reach the centre lane; tracking turn-rate limited |
| B-6 | FIXED | leashed/returning dogs catch up |
| B-7 | FIXED | `PlayerController.resolveMove` clamp-then-slide |
| B-8 | FIXED | seeded guard/dog RNG; `DAILY_RULES_VERSION` = 2 |
| B-9 | FIXED | alarm resets on catch respawn (Game.tsx closure; browser-checked only) |
| B-10 | FIXED | src/systems/Crowbar.ts line-of-sight rules; smoke vs. light |
| B-11 | FIXED | `hearNoiseAt` renews an investigation |
Balance notes in B.md (stage 21+, crouch-walk) are NOT findings to fix: DECISION, see ledger/OPEN-ITEMS.md section 3.

## C - rendering / performance (docs/reviews/C-rendering-performance.md). Desktop V8 numbers; expect 5-15x slower on Hermes.
| ID | Status | Note |
|---|---|---|
| C-1 | FIXED / PARTIAL | f24f1dd batching + 02e13eb far-chunk culling: stage 29 865 -> ~380 calls. OPEN: Endless section roots (guards, towers, fences, trees) are not culled (~60 far calls) |
| C-2 | PARTIAL | a33e0d7 banded flood + 02e13eb prefetch: section build 38 -> ~8 ms. OPEN: `populateSection` still runs in one frame |
| C-3 | FIXED | 7428134 0 program re-resolves per frame |
| C-4 | FIXED | 5434081 audit GPU check cached per texture |
| C-5 | PARTIAL | e4882f0 + 02e13eb loop snap, player/camera interpolation, real camera dt. OPEN: guards/dogs not interpolated |
| C-6 | OPEN | stage-start freeze (defer rebuild one frame; precompile rain/snow shaders) |
| C-7 | PARTIAL | 39c94e0 faster decoder + pixels freed after upload. OPEN: lazy guard-sheet decode, 512 px character sheets |
| C-8 | OPEN | render-scale option (needs store setting + Settings row + device test) |
| C-9 | FIXED | d12e5cf old loop/audio/subscriptions released on context re-creation and unmount |
| C-10 | FIXED | e4882f0 + 02e13eb quarter-rate redraw while paused over a frozen scene |
| C-11 | OPEN | 16-bit depth buffer; near plane 0.5 would reduce horizon artefacts |
| C-12 | OPEN | beam ShaderMaterials skip colour space / fog |
| C-13 | OPEN | props between camera and player not faded |
| C-14 | OPEN | viewport/aspect fixed at context creation |
| C-15 | OPEN | small per-frame allocations (low) |

## D - UI/UX (docs/reviews/D-ui-ux.md)
| ID | Status | Note |
|---|---|---|
| D-1 | FIXED | a798994 |
| D-2 | FIXED | b89e9c7 |
| D-3 | FIXED | 81f01b8 profile/stage board fits 360 dp (src/ui/menuLayout.ts) |
| D-4 | FIXED | 7a51000 TRY AGAIN on game over; MAIN MENU on the cleared card |
| D-5 | FIXED (device-untested) | a798994 incl. GameModal `onRequestClose` |
| D-6 | FIXED | 90150bd src/ui/hudLayout.ts (HUD geometry + toast placement, overlap test across 6 sizes) |
| D-7 | FIXED (device-untested) | 1365d96 `src/ui/Text.tsx` (`Text` capped 1.3x, `FixedText` for control labels) |
| D-8 | FIXED | 81f01b8 |
| D-9 | FIXED | 81f01b8 confirm dialog + affordability; 6d53e80 purchase sound |
| D-10 | FIXED | 81f01b8 board scrolls to NEXT |
| D-11 | PARTIAL | df364f1. OPEN: boss-code digit buttons are 32x36 dp |
| D-12 | OPEN | terminology (save/character/run, Lives vs hearts, ARRESTED for dog/razor, casing) |
| D-13 | FIXED | dab6f0f write-failure toast (warnings now show on menus too) |
| D-14 | OPEN | reduce-motion |
| D-15 | OPEN | YARD ALARM / SURVIVE text has no backing |
| D-16 | OPEN | remaining Unicode glyphs |
| D-17 | PARTIAL | 590f43b pressed token + name-entry face. OPEN: off-scale font sizes, mixed faces, gold-alpha |
| D-18 | FIXED | 81f01b8 |
| D-19 | FIXED | df364f1 tutorial card max width 460 dp |
| D-20 | FIXED | df364f1 |
| D-21 | PARTIAL | 3x2 outfit grid; swatches OPEN |
| D-22 | OPEN | GPU diagnostics visible in the player pause panel |
| D-23 | OPEN / UNVERIFIED | right-hand cluster sits 63 dp from the edge; real cutout behaviour needs a device |
| D-24 | FIXED | 6d53e80 boot screen (title + spinner) |
| D-25 | OPEN | detection ring relies on colour alone |

## E - audio (docs/reviews/E-audio.md)
| ID | Status | Note |
|---|---|---|
| E-1, E-2 | FIXED (device-untested) | 06d8cb5 `interruptionMode: mixWithOthers`, focus-loss recovery |
| E-3 | OPEN -> RELEASE GATE | music provenance unverified; see docs/release/music-licensing.md |
| E-4 | FIXED | 06d8cb5 volume 0 is exactly silent; perceptual curve exponent 1.5 (b5250f3) so saved levels don't become much quieter |
| E-5 | FIXED | e6e59f9 death / swing cues re-levelled |
| E-6 | PARTIAL | stage-clear, spotted, alarm, ui_tap, purchase SFX wired (d12e5cf, 6d53e80). OPEN: `coin` cue not wired to the coins-earned row; no dog bark / footsteps (no suitable CC0 source) |
| E-7 | FIXED | 06d8cb5 tension is crossfaded |
| E-8, E-9 | FIXED | e6e59f9 music loop edges; 06d8cb5 seamless siren |
| E-10 | FIXED (device-untested) | fecad70 + d12e5cf haptic profiles, impact-frame timing |
| E-11 | FIXED | 8869f63 + 6d53e80 Vibration toggle (persisted) |
| E-12 | PARTIAL | settings persist on change (c8ff37b). Default music level (0.5 x master 0.7 under the new curve) to be confirmed by ear |
| E-13 | FIXED | 06d8cb5 + d12e5cf dispose/teardown |

## F - build, CI, tests, hygiene (docs/reviews/F-build-ci-tests.md)
| ID | Status | Note |
|---|---|---|
| F-1 | FIXED | ee4ac0a native fingerprint gate (scripts/check-native-fingerprint.mjs) |
| F-2 | FIXED | 425d439 OTA only after same-commit emulator check; ota-rollback.yml |
| F-3 | PARTIAL | 3562ece new releases tagged at the built commit. OPEN (human): old `build-N` tags still point at main |
| F-4 | FIXED | ci.yml on every PR/push. Duplicate execution on the live branch = open efficiency item (see hold-ci-hardening) |
| F-5 | NATIVE | react-native-worklets pin |
| F-6 | NATIVE | unused RECORD_AUDIO / ACTIVITY_RECOGNITION permissions |
| F-7 | NATIVE / OWNER | debug-keystore signing; production signing needs owner credentials |
| F-8 | PARTIAL | 425d439 least-privilege permissions, pinned eas-cli. OPEN: deprecated Node-20 actions, setup-java v4 |
| F-9 | FIXED | 425d439 one publish queue; only the live branch publishes |
| F-10 | FIXED | b5250f3 bounded, non-fatal boot steps |
| F-11 | FIXED | 724df33 |
| F-12 | FIXED | af19f55 + 1fc8815 size budget + share-sheet fallback |
| F-13 | FIXED | d12e5cf |
| F-14 | OPEN | Game.tsx closure logic has no unit tests (browser scenarios cover it; being made durable on claude/hold-scenarios) |
| F-15 | PARTIAL | c1c5dcd dog test uses `moveSpeed`. OPEN: uiIcons/textureProbes grep source text |
| F-16 | FIXED | cdd541b polling + parser test; ce21a3a reads only the current launch's pid |
| F-17 | PARTIAL | 852e652 + d12e5cf. OPEN: StartScreen `FigurePickButton` / `onPickSkin` unused |
| F-18 | OPEN | textures shipped twice (embedded base64 + require'd PNGs + textureSource.ts) |
| F-19 | OPEN | overlapping danger/catch feedback (design call) |
| F-20 | OPEN | Game.tsx decomposition (plan: docs/plans/game-tsx-decomposition.md if present on this branch) |
| F-21 | PARTIAL | 1375fe5 tsconfig flags. OPEN: ESLint, noUnusedLocals |
| F-22 | NATIVE | package.json / eas.json hygiene |
| F-23 | OPEN | web build not reproducible from a clean install (needed by the browser scenarios) |
| F-24 | PARTIAL | README rewritten for the pipeline/rollback (425d439); keystore note still open |
