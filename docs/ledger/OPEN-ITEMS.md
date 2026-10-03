# Endless Escape: open-item ledger (frozen at OTA 131 / 02e13eb; decisions of 2026-10-03 applied)

Per-finding status: docs/ledger/FINDINGS-STATUS.md. Owner decisions: docs/ledger/DECISIONS.md. Source reports: docs/reviews/, docs/audits/.
Paths such as `scratchpad/review2/...` inside older reports refer to the original session scratch space; the same material now lives under `docs/`.

Playtest baseline: v0.2.1 · Build 13 APK · runtime 0.2.1 · channel preview · OTA 131
update 01a0ff62-763b-726e-b85a-dae0a561ed37 · commit 02e13eb2bcee30265a7006afc5c323bccfa02f19
Source reports: scratchpad/review2/{A,B/B,C,D,E,F}.md, old-items.md, tutorial-audit.md, gfx-audit.md

## 1. Native / release work (needs a new APK)
- V13 / F: Android navigation bar shows over the game (expo-navigation-bar; native module)
- F-6: unused RECORD_AUDIO / ACTIVITY_RECOGNITION (and FOREGROUND_SERVICE_MEDIA_PLAYBACK) permissions -> app.json android.blockedPermissions
- F-5: react-native-worklets SDK-compatible pin (~0.5.1 direct dep); drop duplicate worklets babel plugin
- F-7: production release signing (APK is currently signed with the debug keystore) - needs owner keystore/credentials
- F-22: package.json cleanup (remove expo-sensors, @types/three -> devDependencies, engines node >=22.18), eas.json trimmed to `cli`
- Then: bump version, record new native fingerprint (scripts/native-fingerprint.json), build APK
- F-3 follow-up: re-point old build-N release tags at their built commits (needs a human tag force-push)
- F-23: web build not reproducible from a clean install (react-dom / react-native-web dev deps)
- apk-build.yml still lists the two old branches in its triggers
- Run numbers reused on reruns for the APK versionCode (only the OTA message gets `.N`)
- CI housekeeping: actions on Node 20 (deprecated), setup-java v4, ubuntu-latest -> Ubuntu 26 on 2026-10-19

## 2. Post-playtest improvements
- D-12 shared UI terminology (save / character / run, Lives vs hearts, ARRESTED shown for dog bite / razor wire, title casing)
- D-14 reduce-motion support
- D-25 detection indicators rely on colour alone
- D-22 GPU diagnostics in player-facing Build / Update Info
- D-23 camera-cutout / right-control safe-area (cluster sits 63 dp from the edge; judged low risk, unverified on device)
- D-17 remaining font-size / face / gold-alpha drift; D-21 outfit swatches; D-16 remaining glyphs (★☆×⌫‹›)
- UI leftovers: boss-code digit buttons 32x36 dp; a 3-line tip at 640x360 with the perk tag can touch the joystick ring
- C-2 rest: split Endless populateSection across frames (if still needed after device test)
- C-8 render-scale option (needs a setting + device testing)
- C-6 shader prewarm for first rain/snow stage; defer stage rebuild one frame so the button press paints first
- C-5 rest: interpolate guards / dogs (player + camera already interpolated)
- Endless section roots (guards, towers, fences, trees) are not distance-culled (~60 far draw calls)
- C-7 extras: lazy decode of guard sheet, 512² character sheets (art check)
- C S4-S5: 16-bit depth buffer artefacts at the horizon (near plane 0.5 would help), beam shaders skip colour space / fog, props between camera and player not faded, no resize / aspect handling
- F-20 Game.tsx decomposition (and F-14 tests for Game.tsx closure logic, e.g. B-9 alarm reset, A-2 retry)
- F-18 textures shipped twice (embedded base64 + require'd PNGs + textureSource.ts)
- F-19 overlapping danger/catch effects (AlarmOverlay + EdgeVignette; EventFlash + vignette pulse + CatchFlash + Banner; Siren + music tension)
- Convert browser scenarios (pack2 / pack5 / review) into permanent CI gates (needs F-23)
- F-21 ESLint; noUnusedLocals (2 sites left: StartScreen FigurePickButton / onPickSkin)
- F-15 rest: uiIcons / textureProbes tests grep source text
- Cosmetic Math.random in Obstacles.ts (prop yaw, vehicle type) not seeded
- Stale comment CatchFlash.tsx:22 ("skull emoji")
- Questions carried from earlier ledger: boss guard (every 5th stage) visually indistinct; first rain / snow tip; tutorialSeen is global while tipsSeen is per save
- E: dog bark / footstep sounds (no suitable CC0 source in the credited kits)

## 3. Product decisions (resolved 2026-10-03 unless marked OPEN)
- A-11 Daily replay coin rules: DECIDED - pay only improvement over the day's best. Implementation held until after the playtest: docs/proposals/daily-replay-rewards.md
- Music licence: DECIDED - treat as a release gate; evidence required per asset: docs/release/music-licensing.md
- Rollback behaviour: DECIDED - keep current (newer unreadable copy preserved and hidden; never substitute an older backup)
- Production signing approach: DECIDED - EAS-managed production credentials (prepare only; no credential/build without explicit owner authorization)
- Stage 21+ difficulty: OPEN - do not tune before the physical playtest (evidence plan: docs/plans/balance-evidence.md if present)
- Early crouch-walk strength: OPEN - same
- Default music level after the volume-curve change (0.5 x master 0.7) - confirm by ear
- Tutorial audit section 5 open questions (scratchpad/tutorial-audit.md)

## 4. Needs physical-device evidence
- 90 / 120 Hz smoothness (new interpolation + camera real-dt)
- Endless section-transition hitch (now ~8 ms desktop; expect 5-15x on Hermes)
- Vibration feel / timing (impact-frame catch, crowbar hit/miss, alarm) and the new Vibration toggle
- Large system text (font scaling capped at 1.3x; controls fixed)
- Far-chunk culling pop at the vanishing point (desktop: ~40x16 px area behind fog)
- Audio: mixing with other apps' audio, focus loss / regain, new SFX levels, music level after curve change
- Android back on every screen; boot screen on a slow device; keep-awake only during play
- Save recovery notice / write-failure notice (needs a corrupted / full-storage device to provoke)
- Camera cutout vs right-hand controls (D-23)

## 5. Previously held playtest items
- Settings gear (user-supplied artwork): IMPLEMENTED and released - commit e0b4609, first shipped OTA 117, included in OTA 131
- Tutorial / How to Play revision (audit T1-T9): IMPLEMENTED and released - commit c9c44cf, first shipped OTA 119, included in OTA 131
  (T10 stale comments merged into hygiene; done except CatchFlash comment). Audit open questions: section 3 above.
- Right-side control readability (L2): released OTA 117 (6eeda39), re-laid out in this pass (hudLayout.ts)
- Graphics / UI audit V1-V12: released OTA 118-120; V13 (nav bar) is in section 1

## 6. Added during the OTA 131 hold (2026-10-03)
- RELEASE GATE: music provenance. All 3 music tracks carry an ID3 tag "made with suno" (created 2026-05-07). Suno free tier is non-commercial; owner must show a paid plan was active on that date (no retroactive licence) and whether any third-party audio was uploaded to "Pocket Escape (Remix)". Details: docs/release/music-licensing.md
- Unverified asset provenance: Kenney models/textures (pack names not recorded), icon.png origin, settings-gear.png (owner-supplied). No in-app credits screen.
- Play release prerequisites found missing in the repo: AAB build profile (eas.json production builds an APK), `blockedPermissions`, app.json hard-codes the `preview` update channel, privacy-policy URL, listing graphics, credits. See docs/release/play-store-readiness.md and owner-actions.md
- Tester migration: debug-signed APK line -> Play-signed line requires uninstall (saves lost). A save export/import shipped by OTA BEFORE the key switch is the practical mitigation (plan: docs/signing-migration.md on claude/hold-native-batch).
