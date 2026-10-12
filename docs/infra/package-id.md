# Package ID decision (before first Google Play upload) - evidence and sequence

Current: `com.verbal76.endlessescaspe`. Candidate permanent ID: `com.hotatticgames.endlessescape`. **Not renamed.** Nothing was changed, built or published.

## Has the current ID acquired an external identity?  Classification: A (not established) by repository evidence; Play Console itself UNVERIFIED
Evidence (VERIFIED from the repository, git history and GitHub releases, 2026-10-03):
- The ID has existed since the scaffold commit (9de0981, 2026-04-26) and has only ever been used by **debug-keystore-signed GitHub release APKs** (releases build-2 ... build-13).
- No Play Console / upload evidence: no `submit` configuration (`eas.json` has an empty `submit.production`), no workflow mentions Google Play, no service-account JSON,
  no keystore or upload key in the repo, no Firebase / google-services configuration, no external API tied to the package (no accounts, no ads, no billing, no analytics).
- EAS: the project is identified by its project id (`extra.eas.projectId`) and slug `runner`, not by the package. OTA delivery matches runtime + channel, not package.
  EAS-managed credentials were NOT created (owner action) - UNVERIFIED on the Expo side without an Expo login (`eas credentials` was not run).
- Play Console: whether the owner already created an app entry or uploaded a build for this ID cannot be observed from the repository. **OWNER MUST CONFIRM** that no Play app exists for
  `com.verbal76.endlessescaspe` before the rename is committed to (once a package ID is used in Play it can never be changed or reused).
Conclusion: if the owner confirms nothing exists in Play/EAS credentials, the ID can still be changed at no external cost.

## Why it is NOT safe to switch now (all three must change first)
1. **Owner data.** Saves live in the app's private AsyncStorage (SQLite `RKStorage`; keys `endless-escaspe:saves:v1`, `.bak`, `.unreadable`, `endless-escaspe:settings:v1`),
   inside the sandbox of the INSTALLED PACKAGE. A different package is a different app with an EMPTY sandbox. Schema: one JSON object, key = lower-cased character name
   -> Save {name, skin, stage, bestStars, updatedAt, tipsSeen, coins, coinStars, lastRewardedRun, outfits, outfit, endlessBest, daily, perkStages} plus a `~meta` entry {schemaVersion: 2, writtenBy: 2};
   unreadable entries are preserved verbatim.
2. **No transfer path is live.** OTA 131 (live, frozen) has no export/import. This branch now has one (`src/util/saveExport.ts` pure logic + `src/util/saveBackup.ts` glue + Settings > Saves backup UI),
   unit-tested (round trip into an empty sandbox, never deletes, never downgrades, rejects damaged/foreign/edited text). It is HELD: it ships by OTA only after the freeze is released. Cross-package transfer
   across two real apps (share sheet -> paste) is PHYSICAL TEST REQUIRED.
3. **Native consequences.** The package is native config: it changes the native fingerprint, forces a version/runtime bump and a new APK (`scripts/native-fingerprint.json`), and the new package is a SEPARATE app
   (it installs side by side with Build 13; Build 13 keeps running and keeps receiving 0.2.1 OTAs).

## Safe sequence for the owner (nothing here has been done)
1. Finish the OTA 131 playtest. Owner releases the freeze (merge PR #6 = OTA with auto-activation + About + Saves backup; later also the native-batch prep).
2. Install that OTA on Build 13 (it applies itself at the main menu). Settings > Saves backup > **EXPORT SAVES**; send/copy the text to a safe place (Notes, mail to self). Verify by IMPORTing it into
   the same install ("0 added ... kept as they were") and by checking the character count in the message.
3. Owner confirms in Play Console that no app/ID exists for the old package. Decide: keep `com.verbal76.endlessescaspe` (nothing more to do) or move to `com.hotatticgames.endlessescape`.
4. If moving: change the package in `app.json` (`android.package`) AND `scripts/ci/android-render-check.sh` (`PKG=`) together (tests/identity.test.ts fails on a half-done rename); bump version, record the native
   fingerprint, build a NEW baseline APK/AAB (native batch; EAS-managed credentials). Install it side by side (no uninstall needed for the package change itself).
5. In the new app: Settings > Saves backup > IMPORT SAVES > paste. Verify characters, stages, coins, outfits.
6. Only then proceed toward Play (privacy policy, Data Safety, upload key, internal testing). Keep Build 13 installed until the import is verified.

## Rename touchpoints (the complete operational list; historical docs intentionally keep the old ID)
- `app.json` `android.package` - the only declaration. `app.config.js` / eas.json / workflows do not name the package.
- `scripts/ci/android-render-check.sh` `PKG=` (emulator install/launch).
- Tests/fixtures: `tests/aboutInfo.test.ts` uses the ID only as a fixture value. About / Copy Diagnostics read `Application.applicationId` at runtime, so they report the installed package after a rename (no stale value).
- Docs: this file, docs/infra/play-identity.md, docs on claude/ledger-docs and claude/hold-native-batch (signing-migration.md says the package "must not change": superseded by this decision record if the owner chooses to move).
- Outside the repo: Play Console app entry, EAS credentials, any store listing - none exist yet (owner to confirm).
