> Research of 2026-10-03. Items marked VERIFIED cite a source; several official pages (support.google.com, docs.expo.dev, kenney.nl, help.suno.com) were not directly fetchable from the agent sandbox, so those are search-excerpt verified or ASSUMPTION. The owner should open and snapshot the cited pages once before relying on them.

# E - Open actions that ONLY the owner can do (2026-10-03)
Legend: [BLOCKER] = release cannot ship without it. See E-music-licensing.md and E-play-store-readiness.md for evidence/sources.

## A. Music / asset licences
- [ ] [BLOCKER] Open Suno library for the three song ids (8938bae7-841b-473c-9708-03c516517051 pocketEscapeRemix; 13ea8b44-ead0-4ec6-953c-daea3ed90d4f polysneakPursuit; 7fc89f77-095d-4005-8ca2-430d9663cd3d voxelSneakParade) - tags say "made with suno", created 2026-05-07 00:23-00:30 UTC.
- [ ] [BLOCKER] Prove a paid Suno plan (Pro/Premier) was active on 2026-05-07: invoice/billing page screenshots/PDF. Free-tier songs are non-commercial (Suno help 9601601 / Terms). Subscribing later does not fix them (help 2425729).
- [ ] [BLOCKER] State whether "Pocket Escape (Remix)" used any uploaded/third-party audio or lyrics as input (third-party rights).
- [ ] Save Suno ToS + help article snapshots (as of creation date) and prompts/lyrics into the repo docs; decide the credit line.
- [ ] If proof is missing: decide replace (CC0 packs, new Suno songs under paid plan with receipt, commission) or ship without music; give the replacement files + evidence.
- [ ] Confirm authorship/licence of assets/icon.png (the "existing voxel artwork") and assets/ui/settings-gear.png (owner-supplied): created by you / licensed / AI-generated with which tool+terms.
- [ ] Name the exact Kenney packs used for models/textures (characters, props, vehicles, dog) and save the kenney.nl page URLs (CC0).
- [ ] Approve in-app Credits/About text (none exists yet) incl. Kenney (optional), Black Ops One OFL notice, music credit.

## B. Play Console account
- [ ] Confirm account type (personal vs organisation) and creation date; if personal created after 2023-11-13: recruit >= 12 testers for 14 continuous days.
- [ ] Pay fee / complete identity verification; complete Android developer verification (package registration; relevant from 2026-09-30 in BR/ID/SG/TH).
- [ ] Create the app (name "Endless Escape", package com.verbal76.endlessescaspe - confirm it is the final, unchangeable id).
- [ ] Choose Play App Signing with a Google-generated app signing key; generate/hold the upload key (back up offline); never use the public Expo debug keystore.
- [ ] Create a Google Play service-account JSON key if using `eas submit`; add it to EAS credentials.
- [ ] Decide whether the Play build keeps expo-updates OTA (read the Play Device & Network Abuse policy), and which channel/runtime it uses.

## C. Legal pages and declarations
- [ ] Write and host a public privacy policy URL (no policy exists). Contents: local saves, expo-updates network call (Expo servers, IP), user-initiated bug-report email with diagnostics and save names, no ads/analytics/accounts, contact hotatticgames@gmail.com, how to delete data (uninstall), children (13+), crash tool if added.
- [ ] Review and submit Data Safety answers (proposals A/B in E-play-store-readiness.md section 2.3).
- [ ] Answer the IARC questionnaire yourself (facts in section 3); choose target audience 13+ (avoid Families).
- [ ] Declare: no ads, no in-app purchases, no news/health/finance, app access (no login).
- [ ] Confirm the support email hotatticgames@gmail.com is the one to publish.

## D. Store listing
- [ ] Provide 512x512 icon PNG, 1024x500 feature graphic, >= 4 landscape 1920x1080 phone screenshots (tablet optional), title (<=30), short (<=80) and long (<=4000) descriptions, category, tags.
- [ ] Approve the listing text (no AI-music claims unless true; no misleading violence descriptions).

## E. Release engineering decisions (then the team implements)
- [ ] Approve a Play build profile (AAB) and permission clean-up (blockedPermissions + remove expo-sensors) - needs a new native build and a runtime version bump.
- [ ] Choose crash reporting (Play Android vitals only / Sentry / Crashlytics) and approve the Data Safety impact.

## F. Testers and migration
- [ ] Recruit and track >= 12 (aim 15-20) testers with Google accounts; create a closed-test email list/Google Group; send the opt-in link; keep them opted in 14 days.
- [ ] Announce to the existing sideload testers: uninstall required, saves lost; consider a final sideload build with save export first (not in repo yet).
- [ ] Decide the future of the GitHub debug-signed APK line (stop publishing under the same package id once Play ships).
