# Third-party asset licences

| Asset | Source | Licence |
| --- | --- | --- |
| `assets/fonts/BlackOpsOne-Regular.ttf` | Black Ops One by James Grieshaber, via [google/fonts](https://github.com/google/fonts/tree/main/ofl/blackopsone) | SIL Open Font License 1.1 (`assets/fonts/OFL.txt`) |
| Kenney models / textures already in `assets/` (characters, props, vehicles, animals) | [Kenney](https://kenney.nl) | CC0 1.0 |

## Generated in this repository

- `assets/adaptive-icon.png` / `assets/adaptive-icon-background.png` are
  derived from the existing voxel artwork in `assets/icon.png` (border
  stripped, art re-framed for Android's adaptive-icon safe zone; the
  background layer is a blurred, dimmed copy of the same art).
- `assets/splash-icon.png` is typeset in Black Ops One (OFL).
- The chain-link fence and blob-shadow textures are generated in code
  (`src/scenes/Fence.ts`, `src/scenes/BlobShadows.ts`).
