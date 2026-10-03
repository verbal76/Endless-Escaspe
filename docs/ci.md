# CI / release pipeline

Pipeline map, the gates and why each exists, what each stage costs, and
how to check the first run after a pipeline change.

## Map

```
push / PR ──► ci.yml ──────────────────────────────────────────► (nothing is published)

push to the live branch (claude/game-review-suggestions-cjxiqh)
  touching a publishing path
        │
        ▼
  eas-update.yml
   ├─ validate        = ci.yml (workflow_call, ota: true)      ~4-6 min
   ├─ still-newest    scripts/ci/publish-gate.mjs newest       ~30 s   ◄ early exit
   ├─ render-check    = android-render-check.yml (call)        ~12-40 min, emulator
   └─ publish         fingerprint gate, newest (strict),
                      eas update, verify-ota.mjs, summary      ~3 min

push touching native config / icons ──► apk-build.yml ──► GitHub Release build-N (APK)
manual                              ──► ota-rollback.yml ──► new update on `preview`
```

Workflows: `ci.yml`, `eas-update.yml`, `android-render-check.yml`,
`apk-build.yml`, `ota-rollback.yml`. Only `eas-update.yml` (publish job),
`ota-rollback.yml` and `apk-build.yml` (release job) have side effects.

## Triggers and the duplicate-run fix

`eas-update.yml` starts on a push to the live branch unless EVERY changed
file is in its `paths-ignore` (package.json, app.json, eas.json, icons,
`.github/**`, `scripts/**`, `tests/**`, `docs/**`, `**/*.md` ...). Its
validate stage is `ci.yml`. Before this change a publishing push ran CI
twice (standalone and as validate), and a push touching both
`scripts/ci/**` and app code booted the emulator twice (standalone
render check plus the OTA call).

Now the standalone push runs of `ci.yml` and `android-render-check.yml`
have a `plan` job that asks `publish-gate.mjs standalone` whether
`eas-update.yml` is starting for this push:

| event | eas-update.yml | ci.yml `check` | android-render-check.yml |
| --- | --- | --- | --- |
| push, other branch / tag | no | runs | no |
| pull_request | no | runs | no |
| manual run of ci.yml | no | runs | no |
| push, live branch, any publishing path changed | runs (calls both) | stands down (standalone) / runs (as validate) | stands down (standalone; also only starts if `scripts/ci/**` or its own file changed) / runs (as OTA call) |
| push, live branch, ONLY ignored paths (tests, docs, ...) | does not start | runs | runs only if `scripts/ci/**` or its workflow file changed |
| push, live branch, diff unknown (new branch, force push, >= 300 files, fetch error) | maybe | runs (fail-safe) | runs (fail-safe, if its path filter matched) |
| eas-update.yml (push or dispatch) | runs | runs, `ota: true` never stands down | runs, `ota: true` |

Invariant: every push is validated by exactly one `ci.yml` check run, or
by none only when a validate stage of eas-update.yml covers it. The
direction of every uncertainty is "run a duplicate", never "skip".
Cost of the mechanism: one ~10 s `plan` job per run.

The publishing-path list exists twice because GitHub cannot read a file
in `paths-ignore`: `eas-update.yml` and `scripts/ci/publish-paths.mjs`.
`tests/ciGate.test.ts` fails if they differ, and also checks that the
live branch named in `ci.yml`, `android-render-check.yml` and
`eas-update.yml` is the same. The classification is unit tested there.

## Superseded runs

Rapid pushes: each publishing push starts an `eas-update.yml` run.
Before the emulator job, `still-newest` runs
`publish-gate.mjs newest --lenient`; a run whose commit is no longer the
newest publishable commit (a newer commit with a publishing change is on
the branch, or this commit left the branch) stops there; `render-check`
and `publish` are skipped, the run ends green with a notice. Newer
commits that only touch ignored paths do not supersede (no run of theirs
publishes). Worst case a run still burns `validate` (~5 min). The
`publish` job repeats the same check strictly after the emulator (the
former inline step, now the same script), and the render check's own
concurrency group still cancels an older emulator when a newer run's
render check starts.

## Gates (none weakened by this work)

| gate | where | why |
| --- | --- | --- |
| typecheck + unit tests | validate | cheapest catch for regressions |
| native fingerprint | validate and publish | an OTA must never need native code the installed APKs lack; the hash of the native layer must equal the one recorded for app.json's `version` |
| Android bundle export | validate | Metro resolution / asset errors before any publish |
| same-commit emulator render check | before publish | Android-only GL / asset paths cannot be caught in a browser; the textures must really draw |
| newest publishable commit | early (lenient) and publish (strict) | a re-run of an old run, or an out-of-date run, must not roll devices back |
| `verify-ota.mjs` | after `eas update` | asks the update server like an installed APK; fails unless it serves the update just published, with the expected sequence and commit |
| single publish queue (`eas-update-preview`, never cancelled) | publish / rollback | a cancel between `eas update` and verify would leave an update live but unverified |

## Cost per stage (approximate, Linux minutes)

| stage | typical | notes |
| --- | --- | --- |
| plan (standalone) | ~0.2 min | skipped steps on PRs and other branches |
| validate / ci check | 4-6 | npm ci, tests ~15 s, bundle export |
| still-newest | 0.5 | checkout with full history |
| render check | 12-40 (cap 90) | x86_64 release build + emulator boot dominate |
| publish | ~3 | eas update + verify |
| apk-build | up to 60 | arm64 + armv7 release build |

Saved by this change: one validate run per publishing push to the live
branch (~5 min), one emulator run per push that touched both
`scripts/ci/**` and publishing paths, and the emulator for every run
superseded during validate.

## Actions versions (all verified Node 24)

Checked 2026-10-03 by reading each action's `action.yml` at the tag
(`runs.using`) and diffing its inputs against the old major; every input
this repo uses is unchanged.

| action | old | new | runtime |
| --- | --- | --- | --- |
| actions/checkout | v4 | v7 | node24 |
| actions/setup-node | v4 | v7 | node24 (explicit `cache: npm` still works; v6+ only auto-caches npm) |
| actions/cache | v4 | v6 | node24 |
| actions/upload-artifact | v4 | v7 | node24 (new `archive` input, default unchanged) |
| actions/setup-java | v4 | v6 | node24 (v5 is also node24; v6 is current. `verify-signature` unset = warnings only) |
| expo/expo-github-action | v8 | v9 | node24; inputs `eas-version`, `token` unchanged; eas-cli stays pinned 24.9.0 |
| android-actions/setup-android | v3 | v4 | node24; `packages` unchanged |
| softprops/action-gh-release | v2.6.2 sha | v3.0.3 `efb35369...` | node24 (v3.0.0 raised the requirement to Node 24) |
| reactivecircus/android-emulator-runner | v2 | v2 | already node24; no v3 exists |

Sources: `https://raw.githubusercontent.com/<repo>/<tag>/action.yml`
for each pair, and the release / tag pages of each repository. Node 24
actions need runner >= 2.327.1 (always true on GitHub-hosted runners).

## Runner image

GitHub announced that the `ubuntu-latest` label moves from Ubuntu 24.04
to 26.04, rolling out gradually 2026-10-19 to 2026-11-19, and that
workflows may pin `ubuntu-24.04`
(<https://github.blog/changelog/2026-09-17-ubuntu-26-generally-available-and-latest-migration/>).

Decision:

- `android-render-check.yml` (emulator) and `apk-build.yml` (Gradle,
  NDK, release signing) are pinned to `ubuntu-24.04`. They depend on
  `/dev/kvm` and the udev rule, the preinstalled Android SDK layout that
  the "Free runner disk space" step prunes, Temurin 17 / NDK / Gradle
  versions, and the 26.04 image documents removed and updated tools.
  The risk of a silent break (a 40-minute job failing for an image
  reason on the day the label flips) is higher than the value of being
  on the newest image. Pin until 26.04 has been tried deliberately.
- `ci.yml`, `plan`, `still-newest`, `publish` and `ota-rollback.yml`
  stay on `ubuntu-latest`: they only need Node 22 and git, are cheap,
  and serve as the canary for the new image. If one breaks, pin it
  and look.

Not verified: that the emulator job actually works on 26.04 (it cannot
be tested without running workflows). Trial it later with a manual
`workflow_dispatch` of a copy of the job on `ubuntu-26.04`, then move
both pins.

## Manual verification checklist (first run after merge)

Pushing this change to the live branch will not publish an OTA (it only
touches `.github/**`, `scripts/**`, `tests/**`, `docs/**`, all ignored),
so the first runs are:

1. Actions tab: one **CI** run (`check` ran; `plan` showed the notice
   "only non-publishing paths changed ... running") and NOT a second
   one. Also one **Android render check** standalone run, because
   `scripts/ci/**` and its workflow file changed (expected, once, ~40 min,
   on the pinned `ubuntu-24.04`). Check its job log: `/dev/kvm` step,
   emulator boots, render audit passes. If `Run the APK ...` fails with
   an image-related error, it is the pin / action bump, not the game.
2. No `EAS Update` run starts for that push.
3. Step logs show no "Node.js 20 actions are deprecated" annotation on
   the run summary.
4. The next real code push: one `EAS Update` run with jobs Validate
   (`Plan` skipped steps, `check` ran), `Still the newest?`
   (`::notice::... is the branch head`), Render check, Publish. No
   standalone CI run (or only a stood-down one showing the notice "this
   push publishes").
5. Push two publishing commits within ~5 minutes: the first run's
   `Still the newest?` notice reads "... publishes itself", its Render
   check and Publish show as skipped, the run is green; the second run
   publishes.
6. `Publish OTA bundle` still runs `Set up EAS` (v9) and the update is
   verified by `verify-ota.mjs`; the summary table is written.
7. Next APK build (manual run is fine): release `build-N` is created
   by softprops v3.0.3 with the APK attached.
8. If anything in `plan` misbehaves, the fail-safe is to revert
   `ci.yml` only: its `plan` job is the sole piece that can skip CI.
