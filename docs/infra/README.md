# Hot Attic Games infrastructure directive - Endless Escape (execution record, 2026-10-03)

Branch: `claude/hold-infra-ota-about-splash`, from the frozen live commit 02e13eb (OTA 131). **Nothing here is live.**
The live branch `claude/game-review-suggestions-cjxiqh` is frozen for the owner's physical playtest; app-code changes on this branch ship as an
OTA only after the owner releases the freeze (see docs on `claude/ledger-docs`: docs/ledger/DECISIONS.md).

| Objective | Status |
|---|---|
| 1 Self-discovering OTA | EXISTING expo-updates pipeline audited and preserved; gap repaired: automatic safe activation + throttled resume check (code on this branch) |
| 2 Settings > About + Copy Diagnostics | IMPLEMENTED on this branch (held) |
| 3 Hot Attic Games opening studio splash | PREPARED / HELD: mechanism + tests done; canonical asset `branding/Hot_Attic_Games_Master_Logo.png` is MISSING from the repository |
| 4 "Please wait, applying update" | IMPLEMENTED on this branch (held) |
| Play/API audit | Verified compliant (target API 36 = requirement); no Class A/B work |

Files: `play-identity.md` (A), `ota.md` (B + applying experience C), `about-screen.md` (D), `studio-splash.md` (E).
Nothing was built, published, signed or submitted. Physical-device behaviour is NOT verified.
