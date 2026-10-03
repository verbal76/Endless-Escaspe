# Integrated review findings (status: open / fixed <sha> / rejected: reason)

## Progression / modes (review A)
P1 endless/daily respawn at z=1 into trimmed void after catch — CONFIRMED (Game.tsx resolveCatch) — fixed efd3582
P2 daily re-entry same day reuses scene: stale maxZ, hearts from campaign stage, repeat payout (coin farming) — CONFIRMED — fixed efd3582
P3 campaign stage leaks into endless: razorWire, lighting visionMul, Hearts HUD (dup of U1) — fixed efd3582
P4 removed section guards keep st.detection → alarm overlay stuck — fixed efd3582
P5 BOSS ROUND modal twice on advancing into stage 10/20 — fixed efd3582
P6 boss retry: perk decays on retry, fewer hearts; Hearts HUD perk count — fixed efd3582
P7 endless fork side never alternates ((i/10)%2) — fixed efd3582

## UI / lifecycle / audio / OTA (review C)
U1 Hearts/StaminaBar/AlarmBar use campaign stage in endless — fixed efd3582
U2 no pause on background / Android back — fixed dbeb84b
U3 embedded launch "Source commit Unavailable" (read Constants.expoConfig) — fixed dbeb84b
U4 HUD overlaps: DistanceHud vs AlarmBar; Toast vs BossTimer — fixed dbeb84b
U5 tips marked seen on display; can be overwritten / lost — fixed dbeb84b
U6 Volume slider doesn't affect music; music not paused in pause; ui_tap unused; seekTo promise — fixed dbeb84b
U7 tutorial prompt says 14 s (actual ~28 s); tutorialSeen never read — fixed dbeb84b
U8 OTA diag edges: dev label, emergency marker in menu line, reload rejection, restart-mid-run — fixed dbeb84b
U9 title wraps on <690dp wide screens — fixed dbeb84b
U10 banner card ~370dp tall clips on 360dp phones — fixed dbeb84b
U11 right-hand controls ignore safe-area insets — rejected: 63 dp side margins already clear cutouts/gesture insets

## Own findings
M1 endless geometry growth = density scaling (plateaus) — rejected (not a leak); confirm plateau in final perf

## Stealth / AI (review B)
S2 guard lastSeen never cleared; belief() overrides fresh rock/noise/radio targets (probe-verified) — fixed efd3582
S4 section removal drops chasing guards/dogs mid-chase (by homeZ) + stuck detection (= P4) — fixed efd3582
S5 endless reinforcements capped at 2 per run, never removed, trail across trimmed zone — fixed efd3582
S6 reinforcement 0.45 meter lost (same-frame snapshot) — fixed efd3582
S7 endless forks: always same side (=P7) and first fork at level 2 (<3) — fixed efd3582
S8 rock doesn't distract leashed dogs (comment promises) — comment corrected (dogs are leashed by design) dbeb84b
S9 crouched behind low wall hidden from sight but isHidden/pose false — fixed efd3582
S10 RUN toggled while standing drains stamina — fixed efd3582
S11 crowbar dog scare 3.5 m vs ring 3.0 m — fixed efd3582

## Rendering / perf (review D)
R1 = P3 (lighting/razor) — fixed with P3
R2 detection store not cleared on requestRestart; guard ids restart at 1 on rebuild → stale meters seed new guards — fixed efd3582
R3 AlarmOverlay selector returns raw float → re-render + pulse restart every frame — fixed dbeb84b
R4 render audit: 132 blocking readPixels + retries → frame hitch after rebuild — fixed 5650433 (half the readbacks; runs once after rebuild)
R5 weather/backdrop frozen on start screen (update returns early) — fixed dbeb84b
R6 walking backwards in endless shows stripped world / safe zone — fixed efd3582
R7 textures not tagged sRGB (washed out?) — NOT CHANGING: that is how the textured art always rendered (known-good look); note in report
R8 nearest filtering shimmer — not changing (intended crisp palette look)
R9 weather toggle only applies on next rebuild — fixed dbeb84b
R10 fence wire colour assumes old mood schedule — fixed dbeb84b
R11 per-frame allocations — not changing (small, no GC hitch measured)
