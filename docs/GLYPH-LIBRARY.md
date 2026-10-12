# Controller glyph library: provenance record (not bundled)

Studio-provided archive received 2026-10-12 as `Source.zip` (owner upload). **Not added to this repository or the APK**: Endless Escape is touch-only
(virtual joystick and on-screen buttons, no gamepad or keyboard input in `src/`), so there are no controller prompts to map. Importing 17.6 MB of unused
art would be a new feature, not a correction. This file preserves what was verified so any future controller work starts from facts.

| Item | Verified value |
| --- | --- |
| Archive | `Source.zip`, 12,999,638 bytes, SHA-256 `f6c75921b9d6ab2cb2b5249f547c7b7ba19e22da9f4f3b45693cf0912f25ded0` |
| Integrity | zip test OK; no path traversal; no executable content (only `.png` x1580 and `.svg` x21) |
| Contents (1,633 files, 17.6 MB uncompressed) | `Keyboard_Mouse` (510: Alt, Dark, Retro, Vintage, White, Blanks), `P4Gamepad` (316: Default, Light, Alt, Stylized, Retro), `P5Gamepad` (320: Default, Light, Alt, Alt 2, Retro), `SGamepad` (235: Default, Light, Alt, Alt 2, Retro), `XGamepad` (220: Default, Light, Alt, Alt 2, Retro) |
| Format | 128 x 128 PNG icons (some Stylized / Retro variants are 128 x 129..161, and each gamepad folder has one large sprite sheet), plus SVG key sprites |
| Naming | `T_<Family>_<Control>[_Color\|_White]_<Variant>.png`, e.g. `T_X_A_Color_Alt.png` |
| Steam Deck ABXY prompts | Xbox-family `XGamepad` (ABXY) is the matching set; no Deck-specific folder |

## Licence evidence (what is and is not verified)
- The archive contains **no licence or readme file**.
- The only licence evidence is the owner-supplied screenshot of the asset's source page (author **JulioCacko**, "Input Prompts" pack, published Jun 30 2023, updated Feb 03 2025,
  on itch.io and FAB). The page states: *"License: CC0 1.0 Universal. Free to use in any project, commercial or non-commercial. No attribution required"*; Asset license
  **Creative Commons Zero v1.0 Universal**; Code license **MIT**; *"No generative AI was used"*.
- Status: **licence identified, not independently verified.** The page itself was not fetched (network restricted) and the archive carries no licence text.
  Before commercial use: keep the page URL, save a dated copy of the licence statement alongside the assets, and confirm the archive matches the published pack.

## If controller support is ever added
Use the Xbox family for ABXY / Steam Deck prompts, switch families by last-used input device, keep a manual override, and add the licence statement to
`assets/LICENSES.md` in the same change. That is new product scope and needs the owner's decision.
