# Branch recovery ledger and release provenance

Read-only forensic audit of this repository (snapshot **2026-10-12**), made with commit ancestry, merge bases, patch equivalence
(`git cherry`), byte comparison of files, and reading the diffs. Machine-readable twin: `docs/branch-ledger.json` (validated by
`scripts/ci/branch-inventory.mjs` and `tests/singleSourceOfTruth.test.ts`). No branch was deleted or rewritten.

**Authoritative line:** `claude/game-review-suggestions-cjxiqh` (tip 02e13eb, OTA 131, runtime 0.2.1, frozen by owner hold).
Everything else is a workspace or history. The qualification branch `claude/api36-native-qualification` descends from that tip.

## Branch inventory

| Branch (tip) | Relation to the authoritative tip | Classification | Disposition |
| --- | --- | --- | --- |
| `claude/game-review-suggestions-cjxiqh` (02e13eb) | itself | **authoritative** | single history |
| `claude/api36-native-qualification` (draft PR #7) | 0 behind, ahead by the v15 work | working | merge after the owner's v15 test and hold release |
| `claude/hold-native-batch` (7131cdb, PR #5) | 4 ahead | integrated (merged into qualification) | close PR when qualification merges |
| `claude/hold-infra-ota-about-splash` (c734f31, PR #6) | 2 ahead | integrated (merged into qualification) | close PR when qualification merges |
| `claude/hold-scenarios` (1c962e5, PR #3) | 2 ahead | missing, needs a decision | needs web dev dependencies (F-23); owner decision |
| `claude/hold-ci-hardening` (5e8b92f, PR #4) | 3 ahead | missing, conflicts / unrelated risk | adopt the early-exit idea apart from the nine action upgrades |
| `claude/ledger-docs` (d2c9c4e, PR #2) | 5 ahead (docs only) | missing, suitable | safe docs merge on hold release |
| `main` (84f6b74) | 198 behind | intentionally kept | legacy workflows + logo; owner decision to refresh; never delete |
| `Github-APK-Transition-Escap` (e970c74) | 88 behind, 6 ahead | superseded **but provenance** | holds the source commits of releases build-5 and build-7: keep forever |
| `claude/boss-pickups-scene-rebuild-0YBha` (481e307) | 161 behind | superseded | pickups already live; only legacy workflow syncs differ |
| `claude/endless-escape-game-android-gRlFH` (0171d65) | ancestor | integrated | legacy `main` workflows still name it as a trigger |
| `claude/fix-apk-screen-issue-etmic` (b595f5d) | 198 behind, docs only | recovered (archived doc) | `docs/archive/HANDOFF-2026-05-11-fix-apk-screen-issue.md` |

Local-only refs in this agent container (not on the remote): 8 `worktree-agent-*` branches, `canary-local`, `packs-local`, `packs-backup-d9b5073`.
Every commit on them is an ancestor of, or patch-equivalent to, a commit on the authoritative line. The one doubtful case (`worktree-agent-aa78c866`,
"Rendering: no per-frame shader program re-resolution") is integrated as live 7428134: 15 of 16 files are byte-identical; `LightTower.ts` differs
only by an unused import that live already removed. No unique work was found on any local-only branch.

**Publishing hazard on old branches (finding F-22, docs/COMPLIANCE-AUDIT.md):** `claude/endless-escape-game-android-gRlFH` and `Github-APK-Transition-Escap` still contain `apk-build.yml` and
`eas-update.yml` that start on a push to either branch (and `main` holds legacy `eas-build.yml` / `eas-update.yml` that trigger on the first). A push there could publish an OTA or take over the "Latest"
release. Do not push to those branches; the owner can block it without code with a GitHub ruleset that restricts updates to them.

## Missing-work ledger (outside the authoritative line)

| Item | Where | Class | Proposed disposition |
| --- | --- | --- | --- |
| Native batch (0.3.0, blocked permissions, nav bar, eas.json, signing plan) | PR #5 | integrated into qualification | merge with qualification |
| OTA safe-point activation, applying overlay, About, saves backup, splash | PR #6 | integrated into qualification | merge with qualification |
| Studio logo `Hot_Attic_Games_Master_Logo_ALPHA_FINAL.png` | `main` only | integrated (qualification) | arrives on the authoritative line with the merge |
| Knowledge docs (review, findings, music provenance, Play readiness, decomposition plan) | PR #2 | missing, suitable | merge as docs on hold release |
| Deterministic scenario runner + regression guards | PR #3 | missing, needs dependency decision | owner review |
| OTA superseded-run early exit, publish-gate scripts | PR #4 | missing, partly redundant with the budget policy | owner review; split from the action upgrades |
| HANDOFF.md pipeline playbook | `fix-apk-screen-issue-etmic` | recovered as archive | done |
| EAS Build / EAS Update / Prune Artifacts workflows | `main` | intentionally kept (default-branch requirement) | refresh `main` by owner decision |
| Reverted changes needing investigation | none found | n/a | n/a |
| Performance / UI / bug fixes lost in branch changes | none found: every agent worktree is integrated (patch-equivalent or byte-identical) | n/a | n/a |

## Release provenance

Release tags `build-2 .. build-13` do **not** point at the commits that were built: `build-2/4/5/7` point at `main` commit 934391b and
`build-9/10/12/13` at `main` commit df65081 (the default branch at the time the release was created). The built commit is recorded in each release body:

| Tag | Built commit | Where that commit lives | Note |
| --- | --- | --- | --- |
| build-2 | 1052b26 | authoritative line | |
| build-4 | 0171d65 | authoritative line | |
| build-5 | cdf9a35 | `Github-APK-Transition-Escap` only | workflow-only difference from 1052b26: product code identical |
| build-7 | eb34160 | `Github-APK-Transition-Escap` only | babel comment difference only: product code identical |
| build-9 | d1bc973 | authoritative line | |
| build-10 | 39b311e | authoritative line | |
| build-12 | 3f639e0 | authoritative line | |
| build-13 | 0defe73 | authoritative line | **the installed v13 baseline** |
| build-15 (v14) | 95dcc77 | qualification | tag exact |
| build-16 (v15) | c30232d | qualification | tag exact |

Existing tags are immutable provenance and were not moved (re-pointing needs a human tag force-push, which is outside this audit's authority).
From now on `apk-build.yml` creates the tag at the approved source SHA and attaches a provenance record, so new tags are exact.

## Rules now enforced
- A build request must name a full source SHA that lies **on the authoritative line** (ancestor or descendant of its tip); commits on a diverged or abandoned
  branch are refused (`scripts/ci/resolve-build-request.mjs`).
- Every build request runs the branch inventory: a remote branch missing from the ledger produces a visible warning.
- Tests cannot be skipped silently (no `.skip` / `.only` / `.todo`, the whole `tests/` directory runs, no CI step may swallow failures).
