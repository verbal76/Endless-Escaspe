# Third-party asset licences

| Asset | Source | Licence |
| --- | --- | --- |
| `assets/fonts/BlackOpsOne-Regular.ttf` | Black Ops One by James Grieshaber, via [google/fonts](https://github.com/google/fonts/tree/main/ofl/blackopsone) | SIL Open Font License 1.1 (`assets/fonts/OFL.txt`) |
| Kenney models / textures already in `assets/` (characters, props, vehicles, animals) | [Kenney](https://kenney.nl) | CC0 1.0 |
| `assets/sfx/*.mp3` | Kenney sound effects from the Kenney starter kits on GitHub ([Starter-Kit-FPS](https://github.com/KenneyNL/Starter-Kit-FPS), [Starter-Kit-3D-Platformer](https://github.com/KenneyNL/Starter-Kit-3D-Platformer), [Starter-Kit-City-Builder](https://github.com/KenneyNL/Starter-Kit-City-Builder), [Starter-Kit-Racing](https://github.com/KenneyNL/Starter-Kit-Racing)); each kit's README states its sound effects are CC0. Converted from OGG to mono 96 kbps MP3 with loudness normalisation. | CC0 1.0 |
| `assets/music/pocketEscapeRemix.mp3`, `assets/music/voxelSneakParade.mp3`, `assets/music/polysneakPursuit.mp3` ("Pocket Escape (Remix)", "Voxel Sneak Parade", "Polysneak Pursuit") | Supplied with the project (added in commit 9f35704 with titles only). **Source, author and licence not recorded - the project owner must confirm them (and, if the tracks were AI-generated, the generator's terms) before release.** | **Unconfirmed** |

## Generated in this repository

- `assets/adaptive-icon.png` / `assets/adaptive-icon-background.png` are
  derived from the existing voxel artwork in `assets/icon.png` (border
  stripped, art re-framed for Android's adaptive-icon safe zone; the
  background layer is a blurred, dimmed copy of the same art).
- `assets/splash-icon.png` is typeset in Black Ops One (OFL).
- The chain-link fence and blob-shadow textures are generated in code
  (`src/scenes/Fence.ts`, `src/scenes/BlobShadows.ts`).
- `assets/ui/settings-gear.png` is the settings gear artwork supplied by
  the project owner, cropped to the gear, centred on a square
  transparent canvas and resized to 144 px (embedded via
  `scripts/gen-ui-icons.mjs`).

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

`hurt.mp3` and `crowbar_swing.mp3` were later re-levelled (gain into a
limiter; `hurt` also layered with a pitched-down copy of itself). The
following are derived from the files above (pitched / layered with
ffmpeg), so they carry the same CC0 status:

| File | Derived from |
| --- | --- |
| stage_clear.mp3 | pickup_grab.mp3 (coin) at 1x, 1.25x, 1.5x, 2x pitch as a rising arpeggio |
| coin.mp3 | pickup_grab.mp3 at 1.33x pitch, shortened |
| purchase.mp3 | ui_tap.mp3 + pickup_grab.mp3 at 1x and 1.5x pitch |
| spotted.mp3 | aim_click.mp3 at 1.5x then 2x pitch |
| alarm.mp3 | ui_tap.mp3 at 0.6x pitch (three pulses) + caught.mp3 at 0.8x pitch |

### Music edits

`polysneakPursuit.mp3` (the looping tension track) had ~2 s of trailing
near-silence trimmed and short edge fades added so the loop has no
dropout or click; `voxelSneakParade.mp3` got a 1.5 s fade-out on its
last seconds. Both re-encoded as 48 kHz VBR MP3. These are edits only;
the licence question above still applies.
