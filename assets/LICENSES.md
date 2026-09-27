# Third-party asset licences

| Asset | Source | Licence |
| --- | --- | --- |
| `assets/fonts/BlackOpsOne-Regular.ttf` | Black Ops One by James Grieshaber, via [google/fonts](https://github.com/google/fonts/tree/main/ofl/blackopsone) | SIL Open Font License 1.1 (`assets/fonts/OFL.txt`) |
| Kenney models / textures already in `assets/` (characters, props, vehicles, animals) | [Kenney](https://kenney.nl) | CC0 1.0 |
| `assets/sfx/*.mp3` | Kenney sound effects from the Kenney starter kits on GitHub ([Starter-Kit-FPS](https://github.com/KenneyNL/Starter-Kit-FPS), [Starter-Kit-3D-Platformer](https://github.com/KenneyNL/Starter-Kit-3D-Platformer), [Starter-Kit-City-Builder](https://github.com/KenneyNL/Starter-Kit-City-Builder), [Starter-Kit-Racing](https://github.com/KenneyNL/Starter-Kit-Racing)); each kit's README states its sound effects are CC0. Converted from OGG to mono 96 kbps MP3 with loudness normalisation. | CC0 1.0 |

## Generated in this repository

- `assets/adaptive-icon.png` / `assets/adaptive-icon-background.png` are
  derived from the existing voxel artwork in `assets/icon.png` (border
  stripped, art re-framed for Android's adaptive-icon safe zone; the
  background layer is a blurred, dimmed copy of the same art).
- `assets/splash-icon.png` is typeset in Black Ops One (OFL).
- The chain-link fence and blob-shadow textures are generated in code
  (`src/scenes/Fence.ts`, `src/scenes/BlobShadows.ts`).

### Sound effect sources

| File | Original |
| --- | --- |
| pickup_grab.mp3 | Starter-Kit-3D-Platformer/sounds/coin.ogg |
| crowbar_swing.mp3 | Starter-Kit-FPS/sounds/weapon_change.ogg |
| crowbar_hit.mp3 | Starter-Kit-Racing/audio/impact.ogg |
| smoke_pop.mp3 | Starter-Kit-City-Builder/sounds/removal-b.ogg |
| gunshot.mp3 | Starter-Kit-FPS/sounds/blaster.ogg |
| aim_click.mp3 | Starter-Kit-City-Builder/sounds/placement-a.ogg |
| caught.mp3 | Starter-Kit-FPS/sounds/enemy_destroy.ogg |
| hurt.mp3 | Starter-Kit-FPS/sounds/enemy_hurt.ogg |
| ui_tap.mp3 | Starter-Kit-City-Builder/sounds/placement-b.ogg |
| throw.mp3 | Starter-Kit-3D-Platformer/sounds/jump.ogg |
| throw_land.mp3 | Starter-Kit-3D-Platformer/sounds/break.ogg |
