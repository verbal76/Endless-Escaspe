# Proposal: Daily replay rewards pay only for improvement (finding A-11)

STATUS: DECIDED by the owner, NOT IMPLEMENTED (OTA 131 is frozen for a physical playtest). Implement in the post-playtest batch.

## Problem (verified, docs/reviews/A-lifecycle-saves.md A-11)
`dailyReward(distanceM, firstRunToday)` in `src/util/economy.ts` pays `floor(distanceM / 20)` for EVERY Daily run
(plus +10 for the first Daily of the day). The Daily seed is fixed for the whole UTC day, so the yard can be memorised
and RUN AGAIN is one tap. Five 400 m runs pay 110 coins in Daily vs 80 in Endless (1 coin / 25 m), i.e. Daily out-earns
Endless without limit. Coins only buy cosmetic outfits, so this is an economy-integrity issue, not a security one.

## Decided behaviour
A Daily run pays only for distance beyond the best distance already rewarded that UTC day:

    prevBest = (save.daily && save.daily.day === runDay) ? save.daily.best : 0
    firstRunToday = !(save.daily && save.daily.day === runDay)
    earned = max(0, floor(distance / 20) - floor(prevBest / 20)) + (firstRunToday ? 10 : 0)

Properties:
- The first Daily of a day pays exactly what it pays today (`floor(d/20) + 10`).
- Total payable per day is bounded: `floor(bestToday / 20) + 10`.
- A replay that does not beat the day's best pays 0. A replay that does pays the difference.
- Day rollover (a different `daily.day`) resets prevBest to 0 - same as today's `sameDay` logic.
- Endless and campaign rules are unchanged. `lastRewardedRun` still prevents double-paying one run.
- No schema change: `Save.daily = { day, best }` already stores what is needed. `best` is currently
  `max(prev best, floor(distance))`, which is exactly the rewarded-high-water mark.

## Code change set (small)
1. `src/util/economy.ts`: `dailyReward(distanceM, firstRunToday, prevBestM = 0)`; `applyRunResult` passes
   `sameDay ? save.daily.best : 0`.
2. UI copy: result card "Coins earned" row for a non-improving Daily replay should read `+0` and the card/Banner should
   say "No new best today - no coins" (Banner.tsx near the `summary.mode === 'daily'` rows).
3. How to Play (`src/components/HUD/HowToPlay.tsx`, "Stars and coins"): change "1 per 20 m in Daily (+10 for your first
   Daily each day)" to "Daily pays 1 coin per 20 m beyond your best that day (+10 for your first Daily each day)".
4. Tests (`tests/economy*.test.ts`): first run unchanged; replay below best = 0; replay above best = diff only; rollover
   resets; exactly-equal best pays 0; participation bonus once per day; 5x400 m replays pay the same total as one 400 m run
   (110 -> 30); Endless unaffected. Update the browser scenario P2 ("same-day Daily restart is a fresh run, no stale
   payout") expectations accordingly.

## Risks / notes
- Players who liked farming lose an exploit: expected. Per-metre rate (1/20) stays above Endless (1/25) - intentional
  incentive for the one-shot Daily; revisit only if the owner wants parity.
- Needs no migration. Safe to ship by OTA (JS only).
- Model: Sonnet 5.5 / medium. Parallel-safe (economy.ts + Banner.tsx + HowToPlay.tsx + tests; not Game.tsx).
