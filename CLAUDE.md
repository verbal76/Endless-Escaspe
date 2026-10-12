# Endless Escape: standing project rules (Hot Attic Games)

## Studio splash is mandatory
Every Hot Attic Games app opens with the Hot Attic Games studio card **before** the app's own title,
menu, onboarding or main interface. Cold launch only (never replayed on resume).

- The canonical artwork is **`Hot_Attic_Games_Master_Logo_ALPHA_FINAL.png`** (repository root; owner-supplied,
  1536x1024 RGBA with real transparency). Use exactly this file. Never redraw, recreate, crop, stretch, recolour
  or substitute it.
- The old path `branding/Hot_Attic_Games_Master_Logo.png` is obsolete. Do not wait for it or reference it.
- Launch order: app start -> Hot Attic Games card -> the game's own opening -> normal play.
- Implementation here: `src/ui/StudioSplash.tsx`, `src/util/studioSplash.ts`, `src/ui/studioSplashSource.ts`, wired in
  `App.tsx` (~2.5 s with fades, whole logo contained, safe areas respected, startup runs behind it, cannot hang).
  `tests/studioSplash.test.ts` pins the file's git blob hash. Details: `docs/infra/studio-splash.md`.
- Do not remove the card, add a second studio splash, or reintroduce a "logo missing" hold.

## Public version convention
The public version is one sequential integer, **Endless Escape v<N>**, set in `release.json` and propagated to the GitHub
release title, the APK filename, About and Copy Diagnostics. See `docs/RELEASING.md`. Bump it once per delivered build; never
reuse a number. Git SHA, versionCode, runtime, OTA ids are technical metadata, not the version.

## Governing studio standard
The Hot Attic Games **Master Engineering Directive v2.0** (owner-held document; not copied here because this repository is public) governs: one authoritative source line, **three** targets
(Android APK, Windows x86-64, native Linux x86-64), Steam as the primary destination, one build number per coordinated release, no automatic publishing of releases or OTA, safe updates, Steam Deck /
Machine controller and display requirements, the approved glyph library, honest testing claims. **Actual status here:** only Android exists; Windows, Linux and Steam are not started (RED: engine / platform
decision): `docs/PLATFORM_SUPPORT.md`, `docs/STEAM_HARDWARE_CHECKLIST.md`, `docs/COMPLIANCE-AUDIT.md`. Never claim a platform works because a package compiled, and never claim hardware testing that did not happen.

## Single source of truth (permanent engineering policy, all Hot Attic Games projects)
Every change belongs to one authoritative product history. Every supported platform builds from that history. Every abandoned branch must be
accounted for before valuable work is discarded.
- **One codebase, many targets, not many products.** This repository is ONE game with one implementation (Android native builds + OTA, plus the web harness used
  for development). Targets differ only through isolated, documented mechanisms (`Platform.OS` / `Platform.select`, expo config, build flags: currently confined to
  `src/util/support.ts`, `textures.ts`, `releaseRuntime.ts`). Game logic (physics, progression, procedural generation, AI, balance, saves) is shared; never fork it per
  platform. A fix for one target is evaluated for every target. Never degrade an established product to gain parity.
- **Branches are temporary workspaces, not separate products.** A branch starts from the authoritative line (`claude/game-review-suggestions-cjxiqh`, named in
  `release.json`), has one purpose, and is integrated after validation. Platform names in a branch name do not license a separate history. Parallel agents must not keep
  independent implementations. Unmerged work stays discoverable in `docs/branch-ledger.json` (+ `docs/BRANCH-LEDGER.md`, with a classification and disposition per branch);
  run `node scripts/ci/branch-inventory.mjs`. **Never delete or rewrite a branch because it looks obsolete**: some hold the source commits of shipped releases.
- **Audit before discarding.** A commit missing from the authoritative line may be integrated (cherry-picked, rewritten), superseded, or intentionally removed: compare with
  `git cherry`, merge bases and file bytes before concluding anything. Recover valuable missing work by targeted integration, not by merging old branches. Uncertain or
  product-changing recoveries need owner approval.
- **One approved source revision per release.** Every build is made from an explicit full SHA on the authoritative line (`scripts/ci/resolve-build-request.mjs` refuses
  anything else) and records its provenance: source SHA, branch/ref, public version, versionName/versionCode, platform, channel, configuration, runtime, native fingerprint,
  checksum, toolchain versions, timestamp. A coordinated multi-platform release uses one `sourceSha` for every target; if one platform fails, never substitute another revision.
- **OTA and native stay independent but traceable.** Keep the existing OTA architecture (runtime = app version, native fingerprint gate, safe-point activation, rollback);
  an OTA never creates a second history. Not every change is OTA-compatible: the fingerprint gate decides.
- **CI cannot lie.** No skipped / only / todo tests; no step swallows failures; the check job always reports; release workflows build only the approved source.
- **Repository boundaries.** This policy is universal but each repository stays independent: never inspect, modify or merge another repository without explicit authorization.

## Licensing and third-party material
Do not assume an asset is commercially usable because it is in the repository. Asset licences live in `assets/LICENSES.md` (music is **Unconfirmed**: an owner gate); npm
notices for the shipped bundle in `docs/THIRD-PARTY-NOTICES.md` (regenerate with `node scripts/gen-third-party-notices.mjs` when dependencies change; `tests/licenses.test.ts`
fails on a non-permissive or unknown licence); the controller-glyph archive's provenance in `docs/GLYPH-LIBRARY.md` (not bundled: the game has no controller input). Never invent
licence evidence and never substitute an unverified asset. The latest compliance audit and its finding queue: `docs/COMPLIANCE-AUDIT.md`.

## GitHub Actions budget (standing owner directive)
**Development validation should be cheap, release validation should be thorough, and publishing must be intentional.**
Actions minutes are shared across the owner's projects with a small monthly budget. Prove things locally first (typecheck, tests,
native-fingerprint gate, `scripts/ci/check-workflows.py`, `expo export`, `expo prebuild`). `ci.yml` runs once per PR revision (draft and ready; docs-only
changes do no heavy work; no push trigger). A source change, a branch push, a docs edit or a version bump (`release.json`) must never start a native build
or an OTA. An APK is built only from an explicit build request naming the approved source SHA (`workflow_dispatch` inputs or `.github/build-request.json`),
from exactly that SHA, with a provenance record; a rebuild needs no version bump. OTA publishing keeps its own gates and authorization. Never rebuild the same
SHA needlessly, never build platforms nobody asked for, never weaken a release gate to save minutes. Details: `docs/ACTIONS-BUDGET.md`.

## Release hold
The live branch `claude/game-review-suggestions-cjxiqh` (OTA 131, runtime 0.2.1) is frozen until the owner lifts the hold:
no pushes, no OTAs. Native / next-version work happens on `claude/api36-native-qualification` (draft PR #7, do not merge).
Do not publish an OTA, release or production build automatically.
