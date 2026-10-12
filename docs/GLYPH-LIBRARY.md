# Controller glyph library: provenance record

Studio-provided archive received 2026-10-12 as `Source.zip` (owner upload). **The archive itself is not committed.** Since the desktop work (owner directive "Desktop expansion") a
43-file subset (220 KB, 128 px PNG) is imported into `assets/glyphs/{xbox,playstation,switch,keyboard}` by `scripts/desktop/import-glyphs.mjs`
(checksums in `assets/glyphs/SHA256SUMS`, mapping in `src/desktop/glyphManifest.ts`). The glyphs are only referenced by the desktop shell
(`src/desktop/DesktopLayer.tsx`); the Android bundle was checked to contain none of them. This file preserves what was verified about the source.

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

## Use in the game
Prompt families: Xbox (also Steam Deck / Steam Input), PlayStation, Switch, Keyboard. Automatic selection follows the last device used (1.2 s hysteresis);
F2 or the on-screen "Prompts" chip cycles an override stored device-locally. The Xbox set has no Menu/View glyph, so those two prompts are a text chip.
Licence statement for the imported subset: `assets/LICENSES.md`.
