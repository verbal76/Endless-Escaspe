# Branch protection for the two legacy publishing branches

**Status: NOT ACTIVE.** This agent session could read the repository's rulesets (`GET /rulesets` returns `[]`, i.e. none exist) but GitHub's API write path is
refused through the session proxy (`POST /rulesets` -> HTTP 403 "Write access to this GitHub API path is not permitted through this proxy", re-tried 2026-10-12).
Nothing was created or changed. Protection becomes real only when the repository owner imports the ruleset below and GitHub shows it as **Active**.

## Why these two branches
`claude/endless-escape-game-android-gRlFH` and `Github-APK-Transition-Escap` still contain live `apk-build.yml` / `eas-update.yml` that trigger on a push to
those branches (finding F-22 in `docs/COMPLIANCE-AUDIT.md`; both are in `docs/branch-ledger.json` as stale). The workflow that runs on a push is the one stored on the
pushed branch, so a stray push (or a merge into either branch) could still publish an APK or an OTA from there. The authoritative workflows
(`apk-build.yml`, `eas-update.yml` on the working and live branches) are request-based and cannot be started by a push.

## Ruleset (importable): `docs/rulesets/protect-legacy-publishing-branches.json`
| Rule | Effect |
| --- | --- |
| `update` | no one but a bypass actor can push to or merge into the branch (so its stale workflows can never fire) |
| `non_fast_forward` | no force-push |
| `deletion` | the branch cannot be deleted (the history is kept; the ledger records why) |
| bypass | repository role **Admin** only (`actor_id` 5), mode `always`: the owner can still maintain or retire the branches. Nobody else, and no bot or Actions app, can bypass. |

Deliberately NOT included: required pull requests, required status checks and required reviews. These branches are dormant references, not development branches;
requiring checks the branch never produces would only make them un-pushable for the owner too. Existing protections on other branches are not touched and the
ruleset's include list names only these two refs, so the live branch, the working branch and `main` are unaffected, and the owner's release process
(`apk-build.yml` / `eas-update.yml` on the authoritative branch) is not blocked.

## Owner steps (about two minutes)
1. GitHub -> repository **Settings -> Rules -> Rulesets -> New ruleset -> Import a ruleset**, choose `docs/rulesets/protect-legacy-publishing-branches.json`.
2. Check the preview: enforcement **Active**; target branches exactly the two names above; rules Restrict updates, Restrict deletions, Block force pushes; bypass list = **Repository admin**.
3. **Create**. Then confirm GitHub lists the ruleset as Active (Settings -> Rules -> Rulesets). Optional check: `gh api repos/verbal76/endless-escaspe/rulesets` shows it with `"enforcement": "active"`.
4. Verify it bites: from a clone, `git push origin HEAD:refs/heads/Github-APK-Transition-Escap` must be rejected ("Cannot update this protected ref") unless you are an admin using the bypass.

## Equivalent classic branch protection (if rulesets are unavailable)
Settings -> Branches -> Add branch protection rule, once per branch: "Restrict who can push to matching branches" (choose nobody / admins only), leave "Allow force pushes" and
"Allow deletions" **off**, and enable "Do not allow bypassing the above settings" only if you also want to be blocked yourself.

## Optional hardening (owner decision, not done here)
- A required-reviewer **Environment** (Settings -> Environments) attached to the `publish` job of `apk-build.yml` and the `publish` job of `eas-update.yml` would add a second human approval before anything is published. It needs the owner to create the environment; the workflows do not reference one yet.
- Once the ruleset is active the two stale branches can stay as read-only history; deleting them is a separate decision recorded in `docs/branch-ledger.json`.

## What is enforced today without any GitHub setting
See "Publishing safeguards" in `docs/RELEASING.md`: no workflow that can publish has a push, pull-request, merge, tag, version-bump or schedule trigger, except
`apk-build.yml`'s explicit `.github/build-request.json` request file on the two active branches; `tests/actionsBudget.test.ts` ("publishing audit") fails the build
if that ever changes.
