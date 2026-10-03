# Revalidation of previously open items (against HEAD 370a624)

| Old item | Status now | Evidence / action |
|---|---|---|
| L1 settings gear | CLOSED - shipped OTA 117 | e0b4609 |
| L2 right-side control readability | CLOSED - shipped OTA 117 | 6eeda39; re-check under D (UI review) on real layout |
| L3 tutorial T1-T9 | CLOSED - shipped OTA 119 | c9c44cf |
| L3 T10 stale code comments (Obstacles.ts cover height, unused geometry.ts detection consts) | MERGED into F (dead code / stale comments sweep) | |
| L4 V1-V12 graphics/UI | CLOSED - shipped OTA 118-120 | 4771970, 07cc023, 370a624 |
| L4 V13 hide Android nav bar | OPEN - needs native module (expo-navigation-bar) = new APK + runtime bump; owner chose OTA-only | stays on native-build list |
| C1 adb fail-fast | CLOSED - ed1e282, verified run 15 | |
| Old R7 sRGB | CLOSED (reversed; implemented) | |
| Old R8 nearest filtering | CLOSED - intentional (crisp palette atlases); ground uses mips | |
| Old R11 per-frame allocations | RE-OPENED as candidate -> reviewer C to measure | |
| Old U11 right controls ignore safe-area insets | RE-OPENED as candidate -> reviewer D (landscape cutouts) | |
| Q: boss guard (every 5th stage) visually indistinct | candidate -> B (gameplay) / D (UI) | bossGuardId exists Game.tsx:774,1945 |
| Q: tutorialSeen global vs tipsSeen per save | candidate -> A | |
| Q: razor wire / dog bite labelled ARRESTED | candidate -> D (copy) | Banner.tsx:97, CatchFlash.tsx:56 |
| Q: first rain/snow tip | candidate -> D | |
| Stale comment: CatchFlash.tsx:22 says "skull emoji" (now drawn SkullIcon) | NEW trivial - fix in hygiene pass | |
