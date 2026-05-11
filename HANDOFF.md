Handoff briefing for the next Claude instance working on Endless-Escaspe
========================================================================

This document is a complete knowledge transfer. Read it cover to cover before doing any work on this repo. Everything below was figured out in a prior session and is current as of 2026-05-09.


1. Repository overview
----------------------

Owner / repo: verbal76/Endless-Escaspe (note the capital E and the typo "Escaspe" — the GitHub URL is case-insensitive but the repo name itself preserves that spelling).

It is an Expo / React Native + Three.js stealth game. The native android/ folder is NOT checked in; it is regenerated on each CI run via `npx expo prebuild --platform android --clean`. All real source lives under src/ and assets/ at the repo root.

Important platform context: the Anthropic-hosted MCP server I have access to is restricted to this repo only. Calls to other repositories will be denied. My local git push is authenticated only for one specific working branch (the harness-assigned one for the session); any push to a different branch returns HTTP 403. The workaround is to use the GitHub MCP create_or_update_file / push_files tools, which are authenticated through a different path and can write to any branch.


2. Branch strategy and the de-facto main
----------------------------------------

The user's de-facto main is the branch named: Github-APK-Transition-Escap

Important: that is NOT the GitHub default branch. The default branch is "main", but main only contains the workflow YAML files — no source. The user explicitly told me "this is my defacto main, make sure this branch is fully up to date. when I ask for OTAs, moving forward this will be the branch to apply them to. And this is the build I am running."

Other branches you may see:

- main — workflow-only branch. The user does not develop here. Do not push code here.
- claude/endless-escape-game-android-gRlFH — the original dev branch where the bulk of the source history lives. Github-APK-Transition-Escap was forked from this branch. The workflows still trigger on this branch too for backward compatibility.
- claude/boss-pickups-scene-rebuild-0YBha — a STALE feature branch from April 28. Contains older, duplicate versions of features that already landed on gRlFH. The user knows about it and chose to leave it (asked to delete, then said "let's just leave it"). Do not merge from it. Do not delete it without permission.

How features got into Github-APK-Transition-Escap: by being committed to gRlFH first, then Github-APK-Transition-Escap was forked off gRlFH at commit 1052b26 on 2026-05-08. So everything reachable from 1052b26 is in this branch's history.


3. Feature inventory — what is already present
----------------------------------------------

The user explicitly asked to confirm these features are in the de-facto main. They are. Source-of-truth commits, all reachable from Github-APK-Transition-Escap:

- Boss arenas every 10 stages — commit 31dbc65, May 7. Boss arena triggers automatically on stage 10, 20, 30 and so on. "BOSS ROUND" popup appears via GameModal the moment a boss scene is built. Force-pause until tap. Failure auto-advances to the next stage with full hearts. The deprecated dev-unlock code entry and bossModeEnabled toggle were removed from the pause menu in this commit but the storage flags stay resident as no-ops so existing saves do not crash on hydration.

- Hardness multipliers — commit 96d75f1, April 27. The single source of truth is src/util/progression.ts. Every stage-driven system reads from there: vision range, light vision bonus, floodlight bump rates, detection rate scale, decay, walk/crouch noise ranges, segment length, starting hearts (3 / 2 / 1 across stages 1-9 / 10-19 / 20+), guard count (2 baseline +1 every 6 stages capped at 5), light tower rows (3 baseline +1 every 6 stages capped at 5), scan speed multiplier (ramps to 1.3x by stage 15), tracking (enabled at stage 8+), searchlight one-shot (2s sustained track triggers a one-time +0.4 detection bump on every guard), AI tier (tier 3 squad coordination at 12+, tier 4 leading shots at 18+), dogs (1 from stage 8, 2 from stage 16), razor wire (true at stage 14+), forced stormy weather (skips clear-roll at stage 15+), slow-mo close calls (active stages <12), stamina (gated at stage 5+, drains 0.30/s while running, regen 0.15/s), cameras + alarm (cameras visible at 10+, full alarm scales every guard's vision 1.25x).

- Pickups (crowbar + smoke bomb) — commit 64f904e, April 28, plus tuning commits 79969e5 and 18ee498. Spawn from procgen, walk over to grab, HUD bag with two use buttons. Crowbar stuns the nearest guard within 3m for 4s. Smoke bomb drops a 3.5m vision-blocking cloud at the player's feet for 5s. The boss-pickups branch has its own older parallel commit 481e307 for the same feature; do not merge that in — it is the dead version.

- Day/night cycle, music tracks, dumpster scaling, Kenney pine trees, OBB hitboxes, polish layers (haptics, flashes, sparkles, sound blips, animated HUD), tutorial cutscene, character save files, per-character star boards, scene rebuild on stage advance — all present, all reachable from the current branch HEAD.


4. The babel.config.js trigger-marker convention
------------------------------------------------

There is an unusual file convention worth knowing: babel.config.js contains a comment header that is bumped purely to fire builds. The current content (synced from gRlFH on 2026-05-09 via commit eb34160) is:

    // Build-trigger marker. Bumping this comment fires a fresh APK
    // build via the apk-build.yml workflow without changing real
    // behaviour - babel.config.js is in the path-trigger list and a
    // touch here is the cheapest way to ask for a build on demand.
    //   build #1 (2025-05-08) - GitHub-hosted Gradle smoke test
    module.exports = function (api) {
      api.cache(true);
      return {
        presets: ['babel-preset-expo'],
        plugins: ['react-native-worklets/plugin'],
      };
    };

How to use it: append a new comment line under the existing "build #1" line (e.g. "//   build #2 (2026-05-09) - whatever you want to label it"). That single-character change is enough to make the workflow's path filter on babel.config.js match, which fires a fresh APK build. Do not modify the function body for this purpose.


5. The APK build pipeline
-------------------------

File: .github/workflows/apk-build.yml

Pipeline summary: this is a self-hosted Gradle build on GitHub's free Actions minutes. It replaced the prior EAS-cloud build to avoid burning EAS build credits. Each push that touches a path-filter file runs through: checkout, setup-node 22, setup-java temurin 17, setup-android, npm ci, expo prebuild, gradle cache restore, ./gradlew assembleDebug, locate APK, rename APK, upload as workflow artifact, publish a GitHub Release tagged build-N with the APK attached.

Trigger branches: claude/endless-escape-game-android-gRlFH and Github-APK-Transition-Escap. Workflow_dispatch is also enabled.

Path filter: package.json, package-lock.json, app.json, eas.json, babel.config.js, metro.config.js, android/**, ios/**, assets/icon.png, assets/adaptive-icon.png, assets/splash-icon.png, .github/workflows/apk-build.yml.

Permissions: contents: write (needed by softprops/action-gh-release).

Concurrency: group apk-build-${{ github.ref }} with cancel-in-progress: true. So a fresh push to the same branch cancels the in-flight build.

Why assembleDebug, not assembleRelease: the user explicitly chose developer builds. assembleDebug needs no keystore setup (debug-signed APKs install fine for sideloading), is faster on CI, and on this Expo setup actually does load standalone (verified via build-2 and build-4 on the user's phone showing the title screen and pause menu without a Metro server). Do not switch to assembleRelease without explicit user instruction — see the cautionary tale in section 7.

Full file contents (keep this in mind when editing — overwrite via mcp__github__create_or_update_file with the prior blob SHA passed in):

    name: APK Build (GitHub-hosted)

    # Replaces the prior EAS-cloud build with a GitHub-hosted Gradle
    # build so the project uses GitHub Actions' free runner minutes
    # instead of EAS build credits. The result is a debug-signed APK
    # uploaded to a GitHub Release that testers can download +
    # sideload directly. Expo's managed workflow means we run
    # `expo prebuild` fresh on each CI run to generate the android/
    # project; nothing native is checked into the repo.
    #
    # OTA updates still flow through EAS via eas-update.yml - that
    # workflow stays unchanged and uses EAS's free Updates tier.

    on:
      workflow_dispatch:
      push:
        branches:
          - claude/endless-escape-game-android-gRlFH
          - Github-APK-Transition-Escap
        paths:
          - 'package.json'
          - 'package-lock.json'
          - 'app.json'
          - 'eas.json'
          - 'babel.config.js'
          - 'metro.config.js'
          - 'android/**'
          - 'ios/**'
          - 'assets/icon.png'
          - 'assets/adaptive-icon.png'
          - 'assets/splash-icon.png'
          - '.github/workflows/apk-build.yml'

    permissions:
      # softprops/action-gh-release needs write access to publish the
      # release + upload the APK as an asset.
      contents: write

    concurrency:
      group: apk-build-${{ github.ref }}
      cancel-in-progress: true

    jobs:
      build:
        name: Build Android APK
        runs-on: ubuntu-latest
        timeout-minutes: 60
        steps:
          - name: Check out repo
            uses: actions/checkout@v4

          - name: Set up Node
            uses: actions/setup-node@v4
            with:
              node-version: '22'
              cache: 'npm'

          - name: Set up Java (Temurin 17)
            uses: actions/setup-java@v4
            with:
              distribution: 'temurin'
              java-version: '17'

          - name: Set up Android SDK
            uses: android-actions/setup-android@v3

          - name: Install dependencies
            run: npm ci --no-audit --no-fund

          - name: Generate android/ project (expo prebuild)
            run: npx expo prebuild --platform android --clean
            env:
              EXPO_NO_TELEMETRY: '1'

          - name: Cache Gradle
            uses: actions/cache@v4
            with:
              path: |
                ~/.gradle/caches
                ~/.gradle/wrapper
              key: gradle-${{ hashFiles('android/**/*.gradle*', 'android/**/gradle-wrapper.properties') }}
              restore-keys: |
                gradle-

          # assembleDebug produces a debug-signed APK that's sideloadable
          # without any keystore setup. It's the simplest "I just want a
          # tester APK" path - no GitHub Secrets needed for signing keys.
          # Switch to assembleRelease once you set up upload-key signing
          # (and add the keystore + key alias as repo secrets).
          - name: Build debug APK
            working-directory: android
            run: ./gradlew assembleDebug --no-daemon -Dorg.gradle.jvmargs="-Xmx4g"

          - name: Locate APK
            id: apk
            run: |
              APK=$(find android/app/build/outputs/apk/debug -name "*.apk" -print -quit)
              if [ -z "$APK" ]; then
                echo "::error::No APK found under android/app/build/outputs/apk/debug"
                exit 1
              fi
              echo "path=$APK" >> "$GITHUB_OUTPUT"
              echo "name=endless-escape-build-${{ github.run_number }}.apk" >> "$GITHUB_OUTPUT"

          - name: Read OTA version label
            id: ver
            run: |
              OTA=$(grep -oE "OTA #[0-9]+[^']*" src/version.ts | head -1 || echo "unknown")
              echo "ota=$OTA" >> "$GITHUB_OUTPUT"

          - name: Rename APK for upload
            run: cp "${{ steps.apk.outputs.path }}" "${{ steps.apk.outputs.name }}"

          - name: Upload APK as workflow artifact
            uses: actions/upload-artifact@v4
            with:
              name: ${{ steps.apk.outputs.name }}
              path: ${{ steps.apk.outputs.name }}
              if-no-files-found: error

          # Auto-publish a GitHub Release on every push so testers always
          # have a stable URL for the latest build. Manual (workflow_-
          # dispatch) runs skip this and just leave the APK as a workflow
          # artifact you can download from the run page.
          - name: Publish GitHub Release
            if: github.event_name == 'push'
            uses: softprops/action-gh-release@v2
            with:
              tag_name: build-${{ github.run_number }}
              name: 'APK build #${{ github.run_number }}'
              body: |
                Auto-built from commit `${{ github.sha }}`.

                **${{ steps.ver.outputs.ota }}**

                Sideload-only debug-signed APK. Install via:
                1. Download the APK below.
                2. On your Android device, allow "install from unknown sources" for your browser / file manager.
                3. Open the downloaded APK to install.
              files: ${{ steps.apk.outputs.name }}
              token: ${{ secrets.GITHUB_TOKEN }}


6. The OTA update pipeline
--------------------------

File: .github/workflows/eas-update.yml

OTAs still ship through EAS Updates (free tier). The pipeline only runs on JS-only changes — anything that requires a native rebuild is excluded by the paths-ignore filter and goes through the APK build instead.

Trigger branches: claude/endless-escape-game-android-gRlFH and Github-APK-Transition-Escap. Workflow_dispatch is enabled.

Paths-ignore: package.json, package-lock.json, app.json, eas.json, babel.config.js, metro.config.js, android/**, ios/**, assets/icon.png, assets/adaptive-icon.png, assets/splash-icon.png, .github/workflows/**, README.md, .gitignore. Everything else is JS-only.

How to ship an OTA: the user will say "ship an OTA for X". Make the JS change, commit it, push to Github-APK-Transition-Escap (via mcp__github__create_or_update_file or push_files), and the workflow auto-publishes the bundle to EAS branch "preview". The phone picks it up on next launch.

Full file contents:

    name: EAS Update (OTA)

    on:
      workflow_dispatch:
      # JS-only pushes ship as OTA. Native/build/config changes are handled
      # by eas-build.yml instead (which embeds the new JS in the new APK).
      push:
        # main holds only the workflow files (no source). Pushes there must
        # not trigger this workflow; the dev branch is where real code lives.
        branches:
          - claude/endless-escape-game-android-gRlFH
          - Github-APK-Transition-Escap
        paths-ignore:
          - 'package.json'
          - 'package-lock.json'
          - 'app.json'
          - 'eas.json'
          - 'babel.config.js'
          - 'metro.config.js'
          - 'android/**'
          - 'ios/**'
          - 'assets/icon.png'
          - 'assets/adaptive-icon.png'
          - 'assets/splash-icon.png'
          - '.github/workflows/**'
          - 'README.md'
          - '.gitignore'

    concurrency:
      group: eas-update-${{ github.ref }}
      cancel-in-progress: true

    jobs:
      publish:
        name: Publish OTA bundle
        runs-on: ubuntu-latest
        steps:
          - name: Check out repo
            uses: actions/checkout@v4

          - name: Set up Node
            uses: actions/setup-node@v4
            with:
              node-version: '22'
              cache: 'npm'

          - name: Install dependencies
            run: npm ci --no-audit --no-fund

          - name: Set up EAS
            uses: expo/expo-github-action@v8
            with:
              eas-version: latest
              token: ${{ secrets.EAS }}

          - name: Publish update
            env:
              EXPO_TOKEN: ${{ secrets.EAS }}
            run: |
              MSG=$(git log -1 --pretty=%s | head -c 200)
              eas update \
                --branch preview \
                --message "$MSG" \
                --non-interactive

The required secret is "EAS" (the EAS auth token). It is already set in repo secrets.


7. eas.json (relevant for the rare native rebuild)
--------------------------------------------------

This file is a path-filter trigger for apk-build.yml so any change to it forces a native rebuild. The contents are:

    {
      "cli": {
        "version": ">= 16.0.0",
        "appVersionSource": "remote"
      },
      "build": {
        "development": {
          "developmentClient": true,
          "distribution": "internal",
          "android": {
            "buildType": "apk"
          },
          "channel": "development"
        },
        "preview": {
          "distribution": "internal",
          "android": {
            "buildType": "apk"
          },
          "channel": "preview"
        },
        "production": {
          "android": {
            "buildType": "apk"
          },
          "channel": "production"
        }
      },
      "submit": {
        "production": {}
      }
    }

The "development" profile has developmentClient: true. An APK built from that profile shows the "Development Build / npx expo start" screen instead of the game and requires a Metro server on your computer to load JS. This is the issue that started the whole conversation. The "preview" and "production" profiles are standalone. The GitHub-hosted Gradle pipeline does not use eas.json profiles at all — it runs gradle assembleDebug directly — so this file matters only for the legacy EAS-cloud path which has been deprecated.


8. Build variants explained (if the user ever asks)
---------------------------------------------------

assembleDebug = developer build. Faster CI, larger APK, debug hooks present, debug-signed (no keystore setup). Builds 2 and 4 used this and worked standalone on the user's phone.

assembleRelease = production-style build. Minified, JS bundled, smaller APK, release-mode (no dev hooks). Build 5 used this and also worked. Slightly slower CI. Requires a release signingConfig — Expo's prebuild template defaults release.signingConfig to signingConfigs.debug, so out of the box no keystore secrets are needed; the APK is signed with the auto-included debug.keystore in android/app/.

The user chose assembleDebug. Both variants work; the choice is essentially aesthetic for their use case (private sideload, no store publishing).


9. Cautionary tale: the assembleRelease detour (do not repeat)
--------------------------------------------------------------

In this prior session I (the Claude that wrote this document) misread the situation. The user's first screenshot showed the "Development Build / npx expo start" screen. I assumed that came from the GitHub-hosted assembleDebug pipeline and "fixed" it by switching to assembleRelease. The push went through (commit cdf9a35) and produced build #5, which actually worked.

But before that build finished, my polling loop (a bash curl loop against the public GitHub API) got rate-limited and timed out at 15 minutes without seeing the new release. I assumed the build had failed and reverted to assembleDebug (commit adb94e0). Then the user sent screenshots showing the game running fine on build-2 (the original assembleDebug), and later showed me build-5 had also succeeded. The whole detour was unnecessary.

Lessons for the next instance:

- The "Development Build / npx expo start" screen comes from the EAS development-profile APK (eas.json's "development" profile with developmentClient: true), NOT from the GitHub-hosted assembleDebug build. Do not conflate the two. If the user shows that screen, ask which APK they installed; if it is from a GitHub Release tagged build-N, that is the Gradle pipeline and the screen is not from a dev-client build.

- The unauthenticated GitHub API has a 60-requests-per-hour limit per IP. Polling loops via curl will hit that cap fast. Use the authenticated MCP tools (mcp__github__list_releases, mcp__github__get_commit, etc.) for status checks instead.

- The available github MCP toolset does NOT include workflow-run inspection (no list_workflow_runs, no get_workflow_run, no check-runs endpoint). You cannot see the status of a CI build from inside the session. If you need to know whether a run succeeded, ask the user to check the Actions page and paste the result, or wait for a new release to appear via list_releases.

- Local git push is restricted to the harness-assigned branch (HTTP 403 for any other). Use mcp__github__create_or_update_file or mcp__github__push_files to write to other branches.

- Do not invent fixes for problems that may not exist. Ask the user what they are seeing before making structural pipeline changes.


10. Status as of this handoff
-----------------------------

Last commit on Github-APK-Transition-Escap: eb34160 ("Sync babel.config.js trigger-marker comment from gRlFH"). That push was made via mcp__github__create_or_update_file and fires a fresh apk-build.yml run. The expected result is a build-N release at https://github.com/verbal76/Endless-Escaspe/releases/latest a few minutes after the push.

The user's phone is running build-5 (the assembleRelease build from commit cdf9a35). Future builds will go back to assembleDebug variant per the user's choice. Both work standalone for them.

Open question that the user did not pick on: whether to delete the stale claude/boss-pickups-scene-rebuild-0YBha branch. They said "let's just leave it." Do not delete it.


11. Cross-project recipe: pngjs "unrecognised content at end of stream"
-----------------------------------------------------------------------

The user separately asked about an unrelated project (Zombie-squisher) hitting this error in scripts/make-icon.mjs:

    Error: unrecognised content at end of stream
        at SyncReader.process (.../pngjs/lib/sync-reader.js:43:11)
        at module.exports (.../pngjs/lib/parser-sync.js:68:10)
        at exports.read (.../pngjs/lib/png-sync.js:7:10)
        at file:///.../scripts/make-icon.mjs:28:24

Diagnosis: pngjs's sync parser is strict and throws this error when the PNG file has any bytes after the IEND chunk. Many tools append trailing data: Photoshop ICC profiles, Apple thumbnail boxes, EXIF chunks, AI-image-generator metadata. The PNG is structurally fine; pngjs is just refusing the trailer.

Three fixes, in increasing order of how invasive they are:

Fix 1 — clean the source PNG (no code change). Run any normalizing tool over it: pngcrush -ow path/to/source.png, or optipng path/to/source.png, or open in GIMP and "Export As PNG" with default settings. Any of these strips trailing bytes.

Fix 2 — strip trailing bytes inline before pngjs reads. Patch scripts/make-icon.mjs around line 28:

    const buf = fs.readFileSync(srcPath);
    const iend = Buffer.from([0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82]); // "IEND" + its CRC
    const cut = buf.lastIndexOf(iend);
    const clean = cut > 0 ? buf.subarray(0, cut + 8) : buf;
    const png = PNG.sync.read(clean);

This makes the script tolerant of any future asset with the same issue.

Fix 3 — replace pngjs with sharp (best long-term). sharp is more lenient, much faster, and is already a transitive dep of most Expo / RN projects. The rewrite of make-icon.mjs becomes roughly:

    import sharp from 'sharp';
    await sharp(srcPath).resize(1024, 1024).png().toFile(outPath);

I'd start with Fix 1. If the script consumes user-supplied or AI-generated PNGs as input, also do Fix 2 so it survives the next quirky file. Reach for Fix 3 only if you're touching the script for other reasons anyway.


12. Tone and operating style the user prefers
---------------------------------------------

- Short answers. Re-read your draft and cut anything that is not load-bearing.
- Plain English. The user pushes back on jargon ("what's the difference", "explain this question"). When asked a question, lead with the practical bottom line, then offer detail.
- Be honest about uncertainty. If you cannot see CI status from inside the session, say so. Do not guess at failure modes when you can ask the user to paste the actual error.
- Confirm before destructive or visible-to-others actions. The user asked me to delete a branch and I tried; I could not, and I told them how to do it themselves. Do not amend commits, force-push, or rewrite history without explicit instruction.
- Use the AskUserQuestion tool sparingly. Multi-question prompts annoy the user when they can be answered with a one-line explanation in your reply.

End of handoff.
