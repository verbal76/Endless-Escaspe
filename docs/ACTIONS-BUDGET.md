# GitHub Actions budget policy (standing owner directive)

> **Development validation should be cheap, release validation should be thorough, and publishing must be intentional.**
> A source change, a branch push, a documentation edit, or a version bump must never accidentally authorize an expensive native
> compilation or a production publish.

GitHub-hosted Actions minutes are shared across the owner's projects and the monthly budget is small. Before starting any workflow ask:
**"Does this need GitHub Actions, or can I prove it locally?"**

## Prove it locally first
`npm ci`, `npx tsc --noEmit`, `npm test`, `node scripts/check-native-fingerprint.mjs`, `python3 scripts/ci/check-workflows.py`,
`actionlint` (`pip install actionlint-py`; catches workflow syntax / expression mistakes that cost a hosted run to discover),
`npx expo export --platform android` and `npx expo prebuild --platform android --clean --no-install` all run locally and are the same
gates CI runs. The browser harness covers UI. Use them; push when they pass.

## The three tiers
| tier | what runs | when | cost |
| --- | --- | --- | --- |
| **Development** (`ci.yml`) | typecheck, unit tests, native-fingerprint gate, workflow/config check | once per push to any pull request, **draft or ready** | ~2 min |
| &nbsp;&nbsp;docs-only push | nothing heavy (the job still runs and reports success, so a required check never stays pending) | a push to a PR that changes only `docs/**` / `*.md` since the previous head (a newly opened / ready PR is classified against its base) | seconds |
| **Qualification** (`ci.yml`, ready PR) | the above + the Android bundle export | PR marked ready; also the OTA `validate` stage | ~3-4 min |
| **Release** | `eas-update.yml` (OTA) or `apk-build.yml` (APK): full gates, emulator render / smoke test, verification | only on an explicit authorization (below) | 15-45 min |

No development or qualification run starts an emulator, a native compile or an APK.

## How each thing is authorized
| action | authorization | notes |
| --- | --- | --- |
| validate a change | open / update a PR | `ci.yml`. A plain push without a PR starts nothing (validate locally); a PR branch push used to run CI twice |
| publish an OTA | a push to the **live branch** touching publishing paths (JS / assets), or a manual run | `eas-update.yml`, unchanged: validate, same-commit emulator render check, newest-commit gate, fingerprint gate, `verify-ota.mjs`. Never cancelled mid-publish |
| bump the public version | edit `release.json` | version management only. **Starts nothing**, not a build and not an OTA (`release.json` is path-ignored by `eas-update.yml`) |
| build an APK | an explicit **build request** naming the approved source commit | see below |
| rollback / production build | manual runs only (`ota-rollback.yml`, `production-build.yml`) | |

### Build request (`apk-build.yml`)
A request names: **`sourceSha`** (full 40-char SHA of the approved source), **platform** (`android`), **channel** (`preview`), whether to
**publish a release**, and optionally the **expected public version** at that SHA. Two equivalent ways to make it:
1. *Run workflow* on `APK Build` with those inputs (owner / UI), or
2. commit **`.github/build-request.json`** (this is what an agent session uses, since it cannot dispatch workflows):
   ```json
   { "sourceSha": "<40 hex>", "platform": "android", "channel": "preview", "publishRelease": true, "expectedVersion": 16, "id": "free text, change it to request a rebuild" }
   ```
The workflow builds **exactly `sourceSha`** (never the commit carrying the request; it must be an ancestor of it and lie on the authoritative line, see `docs/RELEASING.md`), stamps it into the APK, and
writes a provenance record (`<Product>-v<N>.provenance.json`: source SHA, request commit and ref, public version, versionName, versionCode,
platform, channel, configuration, runtime, native fingerprint, SHA-256, build time, toolchain versions, run URL). A **rebuild needs no version bump**: if the
version already has a release (or `publishRelease` is false) the result is a workflow artifact only; a public version is never overwritten.
Only commit the request file in the commit that requests a build.

A coordinated multi-platform release uses **one request with one `sourceSha`**; every platform artifact is built from it. This repository
currently targets Android only.

## Rules of thumb
- One build per delivered version; one request per build. Do not push to "retry"; read the logs, fix, then request once.
- Never bypass a release gate to save minutes (signing, runtime / fingerprint compatibility, rollback protection, packaged-content checks, `verify-ota`).
- Cancel superseded **development** checks (automatic); never cancel an OTA publish or an APK release in progress.
- Add `[skip ci]` to commits that need no validation (the pull-request check is suppressed too: verified on 2f07df6 and 47791ea, 0 runs).
- Edit workflows locally, run `python3 scripts/ci/check-workflows.py` and `npm test` (`tests/actionsBudget.test.ts` guards this policy).

## Required checks / branch protection
No rulesets exist and the qualification branch is unprotected (read 2026-10-12). Protection settings of the live branch and `main` could not be read from
the agent session. Compatibility: the check keeps one stable name (`Typecheck, tests, native fingerprint, Android bundle`) and runs for **every** PR
(including docs-only), so requiring it can never leave a PR pending. Pushes to a branch with no PR produce no check, so require the check only on pull requests.

## Related held work
PR #4 (`claude/hold-ci-hardening`) holds a more elaborate dedupe / superseded-run design for the live branch (`still-newest`, `plan` jobs) plus
Node-24 action upgrades that have never run in the emulator / APK workflows. It is untouched here: its useful idea (an early exit for superseded OTA
runs) is complementary, but adopting it needs the live branch and the unrelated action upgrades split out first.

## Verified on GitHub (2026-10-12)
- `[skip ci]` suppressed every workflow, including the pull-request check, for commits 2f07df6 and 47791ea (0 runs each).
- Draft PR #7, commit 06e6f1f: exactly one run (`CI` #46, event `pull_request`, 51 s, no push-triggered duplicate): classify ran (not docs-only), typecheck / unit tests / native fingerprint / workflow-config check ran, the Android bundle export was skipped (draft tier). No APK build, no emulator.
- Docs-only classification must compare the previous head with the new head, not the whole PR (the first version compared `base...head`, so a docs-only push to a PR that also contained code ran the full tier; fixed in 4ccd016).
- Docs-only push, commit 83e3b5b: `CI` #49 ran 8 s, success, and skipped install / typecheck / tests / fingerprint / config check / bundle export (the check still reports, so it never stays pending). Across five pushes only `ci.yml` started: no APK, emulator or OTA run.
- Not verified on a hosted runner (static tests, `actionlint` and local scripts only): the `apk-build.yml` resolve / build / smoke-test / publish chain with a build request, the ready-PR bundle-export step, the render-check `ref` input, and the cancellation rules. The first real build request is their first execution.
