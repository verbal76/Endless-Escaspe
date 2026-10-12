# Compliance audit, 2026-10-12 (overnight autonomous directive)

Audited against the **Hot Attic Games Master Engineering Directive v2.0** ("Universal Game Development, Build, Update and Distribution Standard"). The owner uploaded it mid-session as a Word
document (found only after a first, provisional pass; the scorecard below is the corrected one). It is not copied into this public repository. It requires **three targets** (Android APK, Windows
x86-64, native Linux x86-64), Steam as the primary destination, one build number across platforms, and no automatic OTA / release publication. Project: Endless Escape (Expo SDK 54 /
React Native 0.81.5, three.js on expo-gl; Android + OTA). Authoritative line `claude/game-review-suggestions-cjxiqh` (02e13eb, OTA 131, frozen); working branch `claude/api36-native-qualification` (draft PR #7).

## Scorecard (PASS needs evidence)
| Category | Status | Evidence | Action |
| --- | --- | --- | --- |
| 1 Source and branches | PASS | one authoritative line; `docs/BRANCH-LEDGER.md`; inventory 0 unaccounted; builds refused off-line | audited earlier today |
| 2 Android | PARTIAL | v15 built from c30232d, API 36, 16 KB (64-bit), emulator smoke test | no physical test (F-10) |
| 3 Windows | **FAIL** | required by the standard; no target exists (F-03) | owner decision |
| 4 Linux | **FAIL** | required; no target (F-03) | owner decision |
| 5 Build flags | PARTIAL | one source line, `platform` input exists, `windows` / `linux` / `all` refused visibly; no PC adapters | F-24 |
| 6 Build numbering | PASS | one monotonic public number in `release.json`; versionCode = run number | |
| 7 GitHub Releases | PARTIAL | v14 / v15 numbered and named; no manifest or checksums attached to existing releases; naming wording differs from the standard (F-09) | F-24 (next build) |
| 8 Build provenance | PARTIAL | manifest, checksums and verification implemented and unit-tested; **not yet run on a hosted runner**; old tags inexact (F-11) | F-24 |
| 9 Release authorization | **FAIL** | APK builds need an explicit request; **OTA publishes on a push to the live branch** (F-04) and **stale branches still carry publishing workflows** (F-22) | deferred (RED) |
| 10 OTA architecture | PARTIAL | expo-updates, runtime = app version, fingerprint gate, safe-point activation, `verify-ota`; no update code signing (F-05) | |
| 11 OTA rollback | PASS | `ota-rollback.yml`, known-good retention via EAS; fallback to embedded | |
| 12 Steam controller completeness | **FAIL** | touch-only game, no gamepad / keyboard input | F-19 |
| 13 Steam Input | BLOCKED | no Steam target, no Steamworks credentials | F-03 |
| 14 Mixed input | NOT APPLICABLE | no mouse-style camera source | |
| 15 Automatic text input | BLOCKED | one text field (save import); no Steamworks | |
| 16 Steam display | PARTIAL | title screen clean at 1280 x 800 and 1920 x 1080 in the web harness; HUD / ultrawide / device unverified | `docs/STEAM_HARDWARE_CHECKLIST.md` |
| 17 Steam graphics | UNVERIFIED | OpenGL ES via expo-gl; no Vulkan evaluation | |
| 18 Steam performance | UNVERIFIED | no measured device performance | |
| 19 Steam stability | PARTIAL | Android emulator cold launch / restart / resume only | |
| 20 Controller glyphs | BLOCKED | archive received and inventoried; licence evidence is a screenshot only; nothing to map (no controller input) | F-02, `docs/GLYPH-LIBRARY.md` |
| 21 Offline play | PARTIAL | local saves, non-blocking update check; no offline device test | |
| 22 Save safety | PASS | schema v2 + migration, backup, quarantine, non-destructive import, tests | |
| 23 Steam Cloud | BLOCKED | no Steam target; credentials unavailable (pending, not complete) | |
| 24 Graphics settings | FAIL | no per-device graphics modes (nothing locked either) | |
| 25 Branding | PARTIAL | canonical logo bundled and verified in the APK; splash 2.5 s once per cold launch (emulator); device unverified | F-10 |
| 26 Automated testing | PASS | 265 tests, 0 failed / skipped / todo, no-skip guard | |
| 27 Physical testing | UNVERIFIED | none supplied | F-10 |
| 28 CI efficiency | PASS | draft / docs / ready tiers verified on GitHub; explicit builds | earlier today |
| 29 Licensing | PARTIAL | JS notices complete (48 permissive); asset licences documented; music unconfirmed (F-06); ML Kit in APK (F-12) | F-07 |
| 30 Commercial readiness | **FAIL** | not Steam-submittable: no PC builds, no controller support; blockers F-03, F-04, F-06, F-10, F-12, F-22 | |

## Finding queue (priority order) and disposition
| ID | P | Finding (evidence) | Auth | Effort | Status |
| --- | --- | --- | --- | --- | --- |
| F-22 | **P0 (dormant)** | Old branches carry **live publishing workflows**: `claude/endless-escape-game-android-gRlFH` and `Github-APK-Transition-Escap` each hold `apk-build.yml` + `eas-update.yml` that trigger on a push to either branch, and `main` (plus 4 other branches) holds legacy `eas-build.yml` / `eas-update.yml` triggering on `claude/endless-escape-game-android-gRlFH`. A push there would publish an OTA to the `preview` channel or create a release and take over "Latest". Needs a push to a stale branch, so it is dormant | RED (changing historical branches / `main`) | S | deferred. **Owner, one minute, zero code:** a GitHub ruleset restricting updates to those two branches |
| F-03 | P1 | Required Windows x86-64 and native Linux x86-64 targets (and Steam) do not exist. The game does run in Chromium via the Expo web target, so a desktop shell keeps one source line; the alternative is an engine migration the standard forbids without approval (`docs/PLATFORM_SUPPORT.md`) | RED (platform / engine) | L | deferred, owner decision |
| F-04 | P1 | `eas-update.yml` publishes an OTA on a push to the live branch; standard section 9 says pushes and merges must not publish OTA. Merging PR #7 (or any live push) would publish. Not changed: rewriting a publishing workflow cannot be validated without publishing. Design: same explicit-request pattern as APK builds (request file or dispatch naming the approved SHA, checkout and verification of that exact SHA) | RED (OTA authorization) | M | deferred; mitigation today: the live-branch hold |
| F-19 | P1 | No gamepad or keyboard input; controller completeness, Steam Input and the glyph library cannot apply (touch-only) | RED (new input scope) | L | deferred, depends on F-03 |
| F-06 | P1 | 3 music tracks have no recorded source / licence (`assets/LICENSES.md` Unconfirmed) | RED (owner) | M | deferred, owner |
| F-10 | P1 | No physical-device evidence for v15 (install over v13, splash, saves, OTA) | RED (owner) | S | UNVERIFIED |
| F-12 | P2 | `expo-dev-client` plugin pulls `expo-dev-launcher` -> Google ML Kit `barcode-scanning:17.3.0` + `play-services-code-scanner`; `libbarhopper_v3.so` is in the release APK though the game never scans (dev tooling in production, larger APK, separate Google terms) | RED (native change) | M | deferred |
| F-05 | P2 | `expo-updates` code signing is not enabled (authenticity rests on TLS + the EAS account; standard asks for authenticity verification) | RED (credentials, native) | L | deferred |
| F-23 | P2 | The repository is **public**: every APK in Releases is world-downloadable; the standard asks for access-controlled distribution if confidentiality is required | RED (owner) | S | deferred, owner |
| F-09 | P2 | Naming: standard "Game Title Build NN [APK].apk"; the repo follows the owner's earlier "Endless Escape vN" / `Endless-Escape-vN.apk` (same sequence number, different wording). Recommendation: adopt the standard's wording going forward (newer, studio-wide); the change is `release.json` + workflow titles / filenames + About text + docs / tests | RED (owner) | S | deferred, owner |
| F-08 | P2 | Notices are in the repo, not shipped or shown in the app | RED (new UI) | M | deferred |
| F-21 | P2 | PRs #2 (docs), #3 (scenarios), #4 (CI) unmerged; `main` stale | RED (merge / default branch) | M | deferred, owner |
| F-11 | P3 | Tags `build-2..13` point at `main`, not the built commits | RED (immutable) | S | documented |
| F-13 | P3 | 14 armeabi-v7a libs are 4 KB aligned (Play 16 KB rule concerns 64-bit) | RED | M | informational |
| F-15 | P3 | `prune-artifacts` (on `main`) keeps the 3 newest artifacts repo-wide; releases hold the APKs | RED (`main`) | S | deferred |
| F-16 | P3 | Actions run on deprecated Node 20 (forced to 24); upgrade batch lives in PR #4 | RED / deferred | M | deferred |
| F-18 | P3 | Android Auto Backup behaviour for AsyncStorage saves not checked | YELLOW | S | UNVERIFIED |
| F-20 | P3 | `expo-doctor`: 16 of 18 checks passed; 2 need the Expo API (unreachable from the sandbox) | n/a | S | UNVERIFIED |
| F-02 | P3 | Glyph archive (standard section 13: every game uses it): received, inventoried, licence evidence is a screenshot only; not bundled because there are no controller prompts to map | GREEN (docs) | S | PARTIAL: provenance recorded (`docs/GLYPH-LIBRARY.md`); integration blocked by F-19 |
| F-07 | P2 | No third-party notice text for the code bundled in the app | GREEN | S | **RESOLVED** `docs/THIRD-PARTY-NOTICES.md` (48 permissive packages) + generator + tests; the first generator mis-attributed nested packages, caught by its own test |
| F-14 | P2 | `ubuntu-latest` moves to Ubuntu 26.04 from 2026-10-19 (per PR #4's notes citing GitHub's changelog; not re-verified: host blocked); the emulator / APK jobs depend on the image | GREEN | S | **CORRECTED** pinned to `ubuntu-24.04`; static test only |
| F-17 | P3 | Docs stale (v15 "next", dispatch wording) | GREEN | S | **RESOLVED** |
| F-24 | P2 | Standard sections 5, 8, 9: manual build inputs, `build-manifest.json`, `checksums.sha256`, manifest verified against the packaged file, build-number uniqueness validated, windows / linux / all refused visibly | GREEN | M | **CORRECTED** (265 tests, actionlint); hosted run not performed |
| F-25 | P3 | Standard section 19 documents missing (platform support, Steam checklist, map of equivalents) | GREEN | S | **RESOLVED** `docs/PLATFORM_SUPPORT.md`, `docs/STEAM_HARDWARE_CHECKLIST.md` |

Counts: 24 findings. 5 corrected and validated locally (F-07, F-14, F-17, F-24, F-25; F-14 and F-24 are unproven on a hosted runner); 1 partial (F-02); 15 deferred, all RED (F-03, F-04, F-05, F-06, F-08, F-09, F-11, F-12, F-13, F-15, F-16, F-19, F-21, F-22, F-23);
3 unverified (F-10, F-18, F-20). The master standard was missing for part of the session (first finding, resolved when the owner supplied it).
