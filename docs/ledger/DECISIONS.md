# Owner decisions and standing rules (as of 2026-10-03)

## Standing rules
- Branch `claude/game-review-suggestions-cjxiqh` is the ONLY branch that publishes OTAs (eas-update.yml). Every push of
  app code to it publishes after the same-commit emulator gate. Treat it as live.
- OTA 131 (commit 02e13eb, update 01a0ff62-763b-726e-b85a-dae0a561ed37, runtime 0.2.1, channel preview) is FROZEN as the
  physical-playtest candidate. Do not modify, supersede or push to the live branch until the owner reports playtest results
  or explicitly releases the freeze. Silence is not a release.
- Native changes (permissions, signing, new native modules, expo/react-native upgrades) cannot ship as an OTA: the
  native-fingerprint gate blocks them; they need a version bump + new APK. The owner wants ONE consolidated native cycle.
- No credentials/keystore creation or rotation, production/paid builds, store submission, or other irreversible signing
  operation without explicit owner authorization.
- Commit trailers: `Co-Authored-By: <model> <noreply@anthropic.com>` and `Claude-Session: <session url>`; no model ids in
  code, commit subjects or PR titles/bodies.
- Game.tsx is a single-owner hotspot: one worker at a time; read-only during a freeze.

## Product decisions
1. Daily replay coin rule: pay only improvement over the day's best (docs/proposals/daily-replay-rewards.md). Implement
   after the playtest.
2. Music: not commercially cleared. Existing assets stay for development. Licensing is a RELEASE GATE
   (docs/release/music-licensing.md). Do not replace music unless a clearly licensed replacement already exists in the repo.
3. Production signing: EAS-managed production credentials are the intended approach. Prepare plan/config on non-live
   branches only; no credential creation or builds without explicit owner authorization.
4. Rollback / unreadable characters: keep current behaviour. If an older build cannot read a newer character copy, keep the
   newer copy and keep it hidden until a compatible build can read it. Never substitute an older backup in a way that could
   overwrite newer data.
5. Stage 21+ difficulty and early crouch-walk strength: do NOT tune before the owner's physical playtest. Evidence /
   instrumentation planning only.
6. Earlier decisions still in force: Copy/Share via the share sheet; empty pickup slots hidden; HOW TO PLAY opens the
   reference with WATCH INTRO; RUN stands the player up from crouch; OTA-only for JS/asset changes; no APK churn.

## Hold-period branches (all non-OTA)
| Branch | Purpose |
|---|---|
| claude/ledger-docs | this documentation tree |
| claude/hold-scenarios | deterministic browser scenarios as repo tests (scripts/scenarios) |
| claude/hold-ci-hardening | workflow efficiency / deprecation fixes (not merged into the live branch) |
| claude/hold-native-batch | consolidated native/release batch preparation (not merged; do not push to live) |
