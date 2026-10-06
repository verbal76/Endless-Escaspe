# GitHub Actions budget policy (standing owner directive)

GitHub-hosted Actions minutes are shared across the owner's projects and the monthly budget is small.
Treat them as scarce. Before starting any workflow ask: **"Does this need GitHub Actions, or can I prove it locally?"**

## Prove it locally first
`npm ci`, `npx tsc --noEmit`, `npm test`, `node scripts/check-native-fingerprint.mjs`, `npx expo export --platform android`
and `npx expo prebuild --platform android --clean --no-install` all run locally and are the same gates CI runs. The browser harness
covers UI. Use them; push when they pass.

## Actions are for
- the final validation of a candidate that is approaching release or OTA publication;
- an APK / AAB the owner needs for physical testing or release (a public-version bump, below);
- OTA publication and its safety checks (typecheck, tests, native-fingerprint gate, same-commit emulator render check,
  `verify-ota.mjs`, rollback protections);
- store / release builds and required release verification (signing, runtime, package, API level, 16 KB, packaged content, emulator smoke test);
- a platform-specific check that cannot be reproduced locally.

## Actions are NOT for
building every platform after every push; Windows EXEs nobody asked for; an Android artifact for an OTA-only change; re-running an
expensive workflow "to see if it passes"; rebuilding the same source SHA when a verified artifact exists; release validation of docs,
research, comments or bookkeeping; using CI as a debugger.

## How the workflows are set up (and why)
| workflow | triggers | cost note |
| --- | --- | --- |
| `ci.yml` | **ready** pull requests (not drafts, not docs-only), `workflow_call` (OTA validate), manual | no push trigger: a PR branch push used to run twice; docs-only = 0 minutes; draft PRs = 0 (validate locally, mark ready) |
| `apk-build.yml` | push touching **`release.json`** on the live / qualification branches, manual | a build = delivering a new public version. Native-file edits alone no longer build. Obsolete branches removed. Refuses a version that already has a release. |
| `android-render-check.yml` | `workflow_call` (OTA gate, APK gate), manual | no push trigger: script edits no longer boot an emulator (15-40 min) |
| `eas-update.yml` | push to the live branch touching publishing paths, manual | the release train; keeps every gate. Docs / tests / scripts / workflow edits are path-ignored. |
| `ota-rollback.yml`, `production-build.yml` | manual only | |

Superseded runs are cancelled (`concurrency`) except OTA publication, which is never cancelled mid-publish.
Docs-only and other non-product changes use no Actions minutes (also add `[skip ci]` to the commit message when a push would otherwise start a run).

## Rules of thumb
- One build per delivered version. Do not push to retry a build; read the logs, fix, then push once.
- Do not push several small commits to a branch that auto-builds or publishes. Batch them.
- Never bypass a release safety gate to save minutes (signing, runtime / fingerprint compatibility, rollback protection, verify-ota).
- Unreviewed workflow edits can burn minutes: edit workflows locally, check the YAML parses, and rely on `tests/actionsBudget.test.ts`.

## Related held work
PR #4 (`claude/hold-ci-hardening`) holds a more elaborate dedupe / superseded-run design for the live branch (plus Node-24 action upgrades
that have never run in the emulator / APK workflows). It is complementary and untouched; review before merging.
