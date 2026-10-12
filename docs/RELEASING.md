# Releasing: the public version convention (Hot Attic Games, studio-wide)

> **From the next release the coordinated naming below applies** (owner directive, desktop expansion): the release is titled **`Endless Escape Build NN`** and carries
> `Endless Escape Build NN APK.apk`, `Endless Escape Build NN EXE.zip`, `Endless Escape Build NN Linux.tar.gz`, `build-manifest.json` and `checksums.sha256`. NN is the
> number in `release.json` `publicVersion` at the source SHA (next valid: **16**; historical `vNN` releases and `build-N` tags stay untouched and still reserve their numbers).
> The new release tag is `endless-escape-build-NN` (the old `build-<run>` scheme is not reused). Android versionCode stays the workflow run number (monotonic, update-compatible).
> OTA revisions (`OTA NNN`, the run number of `eas-update.yml`) are numbered separately and never consume a Build number. Sections below describing the old `vNN` file names are the historical convention.

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

## Per-release checklist (coordinated build)
1. Validate locally (`docs/ACTIONS-BUDGET.md`): `npm run typecheck`, `npm test`, native fingerprint, `python3 scripts/ci/check-workflows.py`, actionlint, and a local `node scripts/desktop/package.mjs` run.
2. Bump `release.json` `publicVersion` to the new Build number in the change that delivers it (a bump alone starts nothing).
3. Authorize the build explicitly (a separate decision): run `Coordinated Build` (`apk-build.yml`) with `platform`, the approved full `source_sha`, `build_number`, `destination` (`github_releases` | `local_only`), or commit
   `.github/build-request.json` naming them (`{ "sourceSha": "<40 hex>", "platform": "all", "buildNumber": <N>, "destination": "github_releases", "channel": "preview" }`).
4. The workflow checks out exactly that SHA; `validate` confirms the number equals `release.json` and (for a release) is unused (no `Endless Escape Build N` / legacy `Endless Escape vN` release, no tag);
   the Android job verifies the APK, runs the emulator smoke test; the Linux job unpacks and launches the archive under xvfb; the Windows job cross-packages and checks the zip structurally (never executed); `bundle`
   assembles `Endless Escape Build NN ...` + `build-manifest.json` + `checksums.sha256` from the final bytes and verifies them; only then `publish` creates the release (Latest). A failing platform fails the whole run: nothing partial is published.
5. A single-platform run or a rebuild of an already-released number uses `destination: local_only` (workflow artifact only, no new number, no release).
6. If a release ever needs retitling or reassigning Latest by hand, do it in GitHub: title `Endless Escape Build <N>`, tick "Set as the latest release".

## Publishing safeguards (what can publish, and what starts it)
| Workflow | Can publish | Started only by | Guard |
| --- | --- | --- | --- |
| `apk-build.yml` | GitHub Release (APK + EXE zip + Linux archive) | `workflow_dispatch` with `source_sha` / `build_number`, or a commit that changes `.github/build-request.json` on the two active branches | `resolve` (full SHA, ancestor, authoritative line), `validate` (number matches `release.json`, unused), `bundle` verification, `publish` needs platform `all` and `destination: github_releases`; only job with `contents: write` |
| `eas-update.yml` | OTA to channel `preview` | `workflow_dispatch` on the publishing branch naming the SHA being run | `authorize` job, ci.yml validate, emulator render check, branch-head check, fingerprint gate, `verify-ota.mjs`; no push / merge / tag / version-bump trigger |
| `ota-rollback.yml` | OTA rollback / republish | `workflow_dispatch` only | needs a group id; manual |
| `production-build.yml` | EAS Android build (AAB) | `workflow_dispatch` only | held; manual |
| `ci.yml`, `android-render-check.yml` | nothing | PR / call | no write permission, no publish step |
Nothing uploads to Steam or Google Play from CI. Steam (SteamPipe) is a manual owner step with owner credentials. `tests/actionsBudget.test.ts` ("publishing audit") fails if a publishing workflow gains a push / PR / schedule trigger,
if a second job gains `contents: write`, or if a store upload appears. The two stale branches that still carry old publishing workflows are covered by `docs/BRANCH-PROTECTION.md` (ruleset prepared, **not active** until the owner imports it).
