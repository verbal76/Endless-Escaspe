# Project knowledge base (docs/)

This tree preserves the knowledge produced by the 2026-09/10 independent pre-release review so a fresh session can continue
without the original conversation. Start here:

1. `STATE.md` - what exists, how it ships, what is frozen.
2. `ledger/DECISIONS.md` - standing rules and owner decisions (READ FIRST: the live branch is frozen until the owner says so).
3. `ledger/FINDINGS-STATUS.md` - every review finding ID with its status and the commit that fixed it.
4. `ledger/OPEN-ITEMS.md` - what remains, categorised: native/release, post-playtest, product decisions, device evidence, held items.
5. `reviews/` - the six full review reports (A lifecycle/saves, B gameplay, C rendering/perf, D UI/UX, E audio, F build/CI/tests),
   written against commit 370a624. `integration-notes/` are the hand-off notes used to wire fixes (all applied by OTA 131).
6. `audits/` - graphics audit and tutorial/instruction audit (tutorial revision shipped in OTA 119; graphics V1-V12 in OTA 118-120).
7. `proposals/` - decided-but-unimplemented designs (Daily replay rewards).
8. `release/` - music licensing audit, Play Store readiness, owner-only actions.
9. `evidence/` - raw repro scripts used by the reviews (`repro/`), and the original browser scenario packs (`scenarios-as-was/`).
   Scripts reference a scratch build (`__ee` debug hook injected into a copy of Game.tsx) - see scripts/scenarios on
   claude/hold-scenarios for the maintained, deterministic version.
10. `history/` - earlier-phase reports (OTA 115/116 baseline, punch list, first findings list).

Screenshots from the reviews were NOT preserved (77 MB); regenerate with the harness if needed.
Paths like `scratchpad/review2/...` in the reports mean the original session scratch space; the content is under docs/.
