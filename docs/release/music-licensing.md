> Research of 2026-10-03. Items marked VERIFIED cite a source; several official pages (support.google.com, docs.expo.dev, kenney.nl, help.suno.com) were not directly fetchable from the agent sandbox, so those are search-excerpt verified or ASSUMPTION. The owner should open and snapshot the cited pages once before relying on them.

# E - Music / asset provenance audit (release gate)
Repo: /home/user/Endless-Escaspe @ branch claude/game-review-suggestions-cjxiqh (read-only). Audit date 2026-10-03.
Method note: the research sandbox blocked WebFetch for kenney.nl, support.google.com, help.suno.com, docs.expo.dev (EGRESS_BLOCKED). github.com, raw.githubusercontent.com and developer.android.com WERE fetched directly. For blocked hosts, "VERIFIED (search)" below means the statement appears in the search-result excerpt of the official page; the owner should open the page once and snapshot it.

## 1. HEADLINE (release blocker)
All three music tracks carry an ID3 comment tag **"made with suno; created=2026-05-07T...; id=<uuid>"** (read with ffmpeg from the files in assets/music AND from the originals committed in 9f35704). They are **AI-generated with Suno**. assets/LICENSES.md says only "Source, author and licence not recorded" - the repo has never recorded this; the metadata is the only evidence.

Suno's licence depends on the PLAN ACTIVE WHEN EACH SONG WAS CREATED (VERIFIED (search) from help.suno.com articles 9601601 "What rights do I have with the free plan?", 2425729 "If I subscribe, do I get rights for the songs I made before subscribing?", 2416769, and about.suno.com/terms):
- Free/Basic tier: Suno retains ownership; use only "solely for your lawful, internal, personal and non-commercial purposes, provided that you give attribution credit to Suno". A Play Store game is commercial/public distribution -> **not permitted** (even a free game with no ads is public distribution; treat as not allowed unless Suno confirms in writing).
- Pro/Premier: commercial use rights granted for songs generated WHILE subscribed. Subscribing later does NOT retroactively license songs made on free plan.
- Suno's wording says commercial-use rights are "granted" (not necessarily ownership) - fine for use as game BGM; get the terms snapshot.
Therefore: the owner must prove which plan was active on **2026-05-07 (00:23-00:30 UTC)** when the three tracks were created. Evidence below. If free plan -> tracks cannot ship commercially; options: (a) none retroactively fix this; replace tracks (see section 6) or re-generate under a paid plan (new songs, new provenance record).

## 2. Music inventory (all UNVERIFIED licence; origin = Suno per metadata)
| File | Size (bytes) | Duration / format (ffmpeg) | Suno created (UTC) / id (tag) | Origin per evidence | Claimed licence | Status |
|---|---|---|---|---|---|---|
| assets/music/pocketEscapeRemix.mp3 | 3,256,110 | 2:20.47, MP3 48 kHz stereo 185 kb/s | 2026-05-07T00:30:16Z / 8938bae7-841b-473c-9708-03c516517051 | Suno (tag). Added 9f35704 (2026-05-07, author "Claude", msg "soundtrack + music slider wired up"). Title "Remix" - source song/remix input unknown | None recorded ("Unconfirmed") | UNVERIFIED |
| assets/music/polysneakPursuit.mp3 | 3,578,885 (edited 2026-10-02; original 3,613,302) | 2:24.84, MP3 48 kHz stereo 197 kb/s | 2026-05-07T00:23:49Z / 13ea8b44-ead0-4ec6-953c-daea3ed90d4f | Suno (tag). Added 9f35704; trimmed + fade edges in ba90a05/e6e59f9 (scratch: audio/music.sh) | None recorded | UNVERIFIED |
| assets/music/voxelSneakParade.mp3 | 1,424,645 (edited; original 1,433,334) | 1:04.51, MP3 48 kHz stereo 176 kb/s | 2026-05-07T00:26:15Z / 7fc89f77-095d-4005-8ca2-430d9663cd3d | Suno (tag). Added 9f35704; 1.5 s fade-out added later | None recorded | UNVERIFIED |
Notes: the three tags are the Suno song IDs - the owner can look each up in their Suno library (https://suno.com/song/<id>) to see the creation date and, via account billing history, the plan at that date. The "Remix" in pocketEscapeRemix suggests an upload/cover/remaster input: if an existing third-party song or melody was uploaded as input, a THIRD-PARTY copyright question exists in addition to Suno's terms (owner must state what was uploaded). Edits to the files (trim/fade) do not change the licence. Git authorship "Claude" is a tooling artifact, not provenance. No git commit message, LICENSES.md line, receipt or note records plan/author (git log -S for polysneakPursuit / voxelSneakParade / pocketEscape: only 9f35704, ba90a05, e6e59f9; scratch notes review2/E.md E-3 and E-integration.md independently flag "licence unverified"; they contain no provenance).

## 3. SFX (assets/sfx/*.mp3, 16 files) - status VERIFIED-CC0 for sources, with one caveat
Source claim in LICENSES.md: Kenney Starter-Kits on GitHub, converted OGG -> mono 96 kbps MP3.
- VERIFIED 2026-10-03: licence text read in the local clones (scratchpad/kenney/, clone dates Mar-Aug 2026) and, for Starter-Kit-FPS, fetched live from https://github.com/KenneyNL/Starter-Kit-FPS. README "License" section of FPS and City-Builder: "Assets included in this package (2D sprites, 3D models and sound effects) are CC0 licensed" (code is MIT). 3D-Platformer and Racing READMEs list "Sound effects (CC0 licensed)" / "3D Models & sounds (CC0 licensed)" (see their README lines 11-12 / 10). NOTE: the feature-list line in FPS/City-Builder README says only "Sprites and 3D Models (CC0)"; the explicit sound-effects CC0 sentence is in the License section. Snapshot the four README licence sections + LICENSE files into docs/licences/ for the record.
- All 11 original .ogg files named in LICENSES.md exist in the clones (blaster, enemy_destroy, enemy_hurt, weapon_change; placement-a/b, removal-b; impact; coin, jump, break) - mapping VERIFIED for existence (not byte-compared to the mp3s).
- VERIFIED (search) kenney.nl/support: all Kenney game assets are CC0, commercial use allowed, attribution not required (credit "Kenney" optional; do not use Kenney logo).
- Caveat: the mp3s were not byte-compared to the OGG originals (re-encoded); trust is by LICENSES.md mapping + file existence.
| File | Size | Original (per LICENSES.md) |
|---|---|---|
| aim_click.mp3 | 1,924 | City-Builder/sounds/placement-a.ogg |
| ui_tap.mp3 | 1,924 | City-Builder/sounds/placement-b.ogg |
| smoke_pop.mp3 | 5,373 | City-Builder/sounds/removal-b.ogg |
| caught.mp3 | 12,896 | FPS/sounds/enemy_destroy.ogg |
| gunshot.mp3 | 16,971 | FPS/sounds/blaster.ogg |
| hurt.mp3 | 4,119 | FPS/sounds/enemy_hurt.ogg (relevelled + layered) |
| crowbar_swing.mp3 | 5,686 | FPS/sounds/weapon_change.ogg (relevelled) |
| crowbar_hit.mp3 | 8,821 | Racing/audio/impact.ogg |
| pickup_grab.mp3 | 4,119 | 3D-Platformer/sounds/coin.ogg |
| throw.mp3 | 2,865 | 3D-Platformer/sounds/jump.ogg |
| throw_land.mp3 | 5,686 | 3D-Platformer/sounds/break.ogg |
| stage_clear 5,999 / coin 2,865 / purchase 4,746 / spotted 2,551 / alarm 9,761 | | derived (pitch/layer) from the above |
(Derivative works of CC0 are CC0-compatible.)

## 4. Fonts, models, textures, icons
- Font assets/fonts/BlackOpsOne-Regular.ttf (166,532 B) + OFL.txt: VERIFIED 2026-10-03 (fetched raw.githubusercontent.com/google/fonts/main/ofl/blackopsone/OFL.txt): "Copyright 2022 The Black-Ops Project Authors (https://github.com/googlefonts/googlefonts-project-template) ... licensed under the SIL Open Font License, Version 1.1". LICENSES.md names "James Grieshaber" as designer (true per Google Fonts, not in the OFL copyright line). OFL allows embedding/bundling in apps; requires keeping the copyright + licence text with the font (OFL.txt is in repo - ship it / show in credits); font may not be sold on its own. Also splash-icon.png typeset in it (fine).
- 3D models (characters/*.obj, animals/dog.obj, props/*.obj, vehicles/firetruck.obj, police.obj), textures (characters/texture-*.png, props/*.png, vehicles/colormap.png) and the *Obj.ts embeds: claim = Kenney, CC0. Licence VERIFIED (search: kenney.nl/support CC0 for all assets). Per-file pack identity is NOT recorded in LICENSES.md (just "characters, props, vehicles, animals") -> UNVERIFIED mapping. Likely Kenney "Blocky Characters", "City Kit", "Car Kit" etc.; owner should record exact pack names + download page URLs. The local clones in scratchpad/kenney are Starter Kits only, not these packs.
- assets/icon.png (2,336,304 B, "voxel artwork"), adaptive-icon*.png, favicon.png: derived "from the existing voxel artwork in assets/icon.png" - origin of icon.png itself is NOT recorded (could be Kenney-based, hand-made or AI-generated). UNVERIFIED -> owner must state. Play requires you to have rights to the icon.
- assets/ui/settings-gear.png: owner-supplied gear artwork (LICENSES.md; scratch gear-recipe.py). Provenance = owner-supplied; NEEDS OWNER CONFIRMATION that owner created it or has a licence (and if AI-generated, which tool/terms).
- Chain-link fence and blob shadows: generated in code - no third-party asset.
- Emoji (skull, in CatchFlash/Banner): rendered by device font (Noto Color Emoji on Android, OFL/Apache) - not bundled.

## 5. Evidence required per UNVERIFIED asset
Music x3 (each song id):
1. Screenshot/export of the song page from the owner's Suno library showing id, created date (matches tag), title, and **whether made via "Upload"/cover/remaster of existing audio**.
2. Suno **billing/subscription history** (Pro/Premier invoice or account page) proving an active paid plan on 2026-05-07 00:23-00:30 UTC (invoice PDFs; the repo owner's account email). Without it, treat as free tier.
3. Snapshot (PDF/Wayback) of Suno Terms of Service and the "Rights & Ownership" help articles as of the creation date, saved in the repo/docs (e.g. docs/licences/). Terms were changed in 2025-26 (Warner deal) - the version in force at creation date is what counts; keep both.
4. Prompts/lyrics/style used and the Suno "Persona"/input audio if any (no third-party artist names; any uploaded audio must be owner-owned or licensed).
5. Written note: author of record (the owner), and decision on whether to also disclose "AI-generated" in credits.
If no paid-plan proof exists: either obtain Suno's written confirmation, or replace (owner decision; this report only lists options, section 6).
Kenney SFX: snapshot of each Starter-Kit README licence section (4) + kenney.nl/support page - low effort (originals already confirmed to exist).
Models/textures: exact Kenney pack names + kenney.nl/assets/<pack> page snapshots (CC0 line).
icon.png / settings-gear.png: statement of authorship, source files (layered/PSD/original prompt), or licence.
Font: keep OFL.txt in repo (done).

## 6. Options if music cannot be proven (candidate sources; NOT a recommendation, no replacement exists in repo)
No clearly licensed replacement music exists in the repo. Candidates (licence pages to verify before use; not fetched here because kenney.nl / opengameart.org blocked):
- Kenney audio packs (kenney.nl/assets?q=audio, e.g. "Music Jingles", "Digital Audio", "Interface Sounds"): CC0 (VERIFIED search) - jingles only, not full tracks.
- OpenGameArt CC0-filtered music (opengameart.org/art-search-advanced?field_art_licenses_tid=...CC0): per-track licence + author page must be recorded; "CC0" only, avoid CC-BY-SA/GPL.
- Re-generate in Suno under a paid plan with a recorded invoice (new provenance).
- Commission or purchase a royalty-free track with a receipt.
Also: the game can ship with the music slider but no music asset (code change - out of scope here).

## 7. Attribution text needed
- Kenney CC0 / OFL: no legal attribution required for CC0; OFL requires the licence/copyright notice to accompany the font (OFL.txt). Recommended in-app Credits/About screen (there is **none today**: grep of src for credits/licen finds nothing - the only way a licence notice reaches users is the repo, which is not shipped). Suggested text:
  "3D models, textures and sound effects by Kenney (kenney.nl), CC0 1.0. Font: Black Ops One (c) 2022 The Black-Ops Project Authors, SIL Open Font License 1.1. Music: [per owner evidence - e.g. 'Music generated with Suno (commercial licence under the owner's Pro plan)' or replacement credit]."
- Play listing: no legal requirement to credit CC0/OFL assets; if the music licence requires attribution (Suno free tier does, but free tier is non-commercial anyway; Pro does not need it), put it in the full description. If a CC-BY replacement is chosen, the required credit line goes in-app AND the listing.
- Google Play policy on AI content: the Play "AI-Generated Content" policy targets apps that generate content for users (VERIFY separately; NEEDS OWNER CONFIRMATION that it doesn't apply to bundled AI-made assets).
