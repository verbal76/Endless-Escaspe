# Releasing: the public version convention (Hot Attic Games, studio-wide)

**The public version is one plain integer: `Endless Escape v15`.** Nobody should
have to decode a branch, SHA, build number, codename or OTA id to know which file
to install. The next delivered build is always the previous number + 1.

## The rules
1. Public name: `<Product> v<number>`; here **Endless Escape v<number>**. Sequential
   integers only (v14, v15, v16 ...). No semantic versions, no codenames
   (`b9`, `build-17`, `candidate`, `final`, `api36` ...) in anything the owner sees.
2. **Source of truth: `release.json`** (`productName`, `fileSlug`, `publicVersion`).
   Bump `publicVersion` by 1 in the commit that produces each *new delivered
   playable build*. One number = one binary: never reuse it, never overwrite a
   release with a different binary. CI builds that are never delivered do not
   consume numbers (the workflow refuses a duplicate title, so bump before a rebuild).
3. It propagates from that one file to: the GitHub Release title, the APK filename
   (`Endless-Escape-v15.apk`), the release notes headline, `app.config.js` ->
   `extra.release.publicVersion` -> the main-menu line (`v15 - 0.3.0 - Build 16 ...`)
   and Settings > About / Copy Diagnostics (`Version: v15`).
4. The newest delivered playable build is the repository's **Latest release**
   (the workflow publishes it as Latest, not as a prerelease).
5. Engineering metadata stays, as *technical* detail, never in the title or filename:
   git SHA, Android versionCode (= workflow run number), tag `build-<run>`, package
   id, runtime version, OTA channel / id / sequence, native fingerprint, API level,
   signing state, checksums. They live in release notes (below the headline),
   About > Install / Updates sections, CI logs and `docs/`.
6. **OTA updates do not create public versions.** An OTA is an internal revision of
   the installed public version (shown separately as "OTA sequence" / "Update ID").
   A new public version is for a newly delivered *build*.
7. Other platforms of the same release share the number
   (`Product-v15.apk`, `Product-v15-Windows.zip`).
8. Historical tags stay (immutable provenance). Old releases may be retitled for
   display only; never rewrite history for naming.

## History (decided 2026-10-04)
Delivered APKs were `build-2, 4, 5, 7, 9, 10, 12, 13` (GitHub run numbers; the
gaps were failed/cancelled runs that never produced a release). Continuity is
kept with the number the owner already uses: **v13 = `build-13`**; earlier
releases map to their own build number (v2, v4, v5, v7, v9, v10, v12).

| Public | Tag | Android versionCode | Source | Notes |
|---|---|---|---|---|
| v13 | build-13 | 13 | 0defe73 | Android 0.2.1, runtime 0.2.1; OTA 131 is an OTA revision of v13 |
| v14 | build-15 | 15 | 95dcc77 | Android 0.3.0, runtime 0.3.0 (API 36 candidate). Built before the convention: its About screen shows "0.3.0 / Build 15", not "v14" |
| v15 | build-16 | 16 | c30232d | first build whose About shows its public version; built from an explicit source SHA from here on |
| v16 | (next) | next run | a request names the approved SHA | bump `release.json` to 16 in that change; a rebuild of v15 needs no bump (artifact only) |

## Provenance and the single authoritative line
- Every build comes from one approved **full source SHA** that lies on the authoritative line named in `release.json` (`authoritativeBranch`): an ancestor of its tip
  or a descendant of it. A commit on a diverged or abandoned branch is refused by `scripts/ci/resolve-build-request.mjs`, so an outdated branch cannot be published.
- The build records `build-manifest.json` (source SHA, request commit and ref, build number, versionName / versionCode, platform, channel, configuration,
  runtime, native fingerprint, SHA-256, build time, toolchain versions, run URL) next to the APK; the release tag is created at the source SHA.
- A coordinated multi-platform release uses one request with one `sourceSha`; all platform artifacts are built from it, and a failing platform is never rebuilt from a
  different revision.
- Historical tags `build-2 .. build-13` point at `main` commits, not at the built commits; the true source of each is in `docs/BRANCH-LEDGER.md` (builds 5 and 7 exist only
  on `Github-APK-Transition-Escap`: never delete it).

## Per-release checklist
1. Validate locally (`docs/ACTIONS-BUDGET.md`). Bump `release.json` `publicVersion` in the change that delivers a new build. A version bump alone starts nothing.
2. Authorize the native build explicitly (separate decision): run `APK Build` with the approved full source SHA, or commit `.github/build-request.json`
   naming it (`{ "sourceSha": "<40 hex>", "platform": "android", "buildNumber": <N>, "destination": "github_releases", "channel": "preview" }`).
3. The workflow builds exactly that SHA, verifies the APK and its packaged content, runs the emulator smoke test, and publishes `Endless Escape v<N>`
   (Latest) with `Endless-Escape-v<N>.apk`, `build-manifest.json` and `checksums.sha256` (both verified against the packaged APK). A rebuild of an already-released number (use destination `local_only`; no bump)
   produces a workflow artifact only.
4. If a release ever needs retitling or reassigning Latest by hand (sessions without release-write access cannot), do it in GitHub: title
   `Endless Escape v<N>`, tick "Set as the latest release".
