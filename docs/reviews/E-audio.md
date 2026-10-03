# Review E: audio, haptics and game feel (Endless Escape @ 370a624)

Reviewer area: audio correctness and lifecycle, haptics, moment-to-moment feedback.
Method: I read all the audio and feel code (Music.ts, musicIntensity.ts, Sfx.ts, Siren.ts, siren.ts, haptics.ts, the HUD flashes, and the Game.tsx call sites) and the expo-audio 1.1.1 native sources in node_modules (Android `AudioModule.kt` / `AudioPlayer.kt`). The target is Android-only: eas.json has Android profiles only.
Measurements are in `review2/E/`:
- `a1.mjs` / `a1.out`: browser harness on port 8805, with `window.Audio` and `HTMLMediaElement.play` instrumented. It counts players at boot and over 60 s of scripted play (item use, catches, wins, stage rebuilds), plus volume after slider drags and the state on pause and in the menu.
- `a4.mjs` / `a4.out`: siren behaviour under forced detection, on pause and at master volume 0.
- `a2.mjs` / `a2.out`, `a3.mjs` / `a3.out`: every mp3 decoded with WebAudio for duration, leading/trailing silence, edge levels and effective loudness after the per-effect GAIN.
- `music.test.mjs` / `music.out`: Music.ts plus MusicIntensity plus Sfx.ts run under node with an instrumented expo-audio stub.
- Baseline `npm test`: 91/91 pass.

Severity: S1 crash/leak, S2 major, S3 functional defect, S4 feel/feedback gap, S5 polish.

---

## What is solid (verified)

- **No player churn or leak during play.** All 20 players are created once at GLView mount: 16 SFX (round-robin pools), 3 music, 1 siren. After 60 s of play with 55 item uses, 3 catches, wins and several `resetForSegment` rebuilds, the count is still 20 (a1.out `after60.n = 20`). There were no media errors and no rejected `play()` calls.
- **Music does not restart on stage change or rebuild.** It is created once, and the playlist advanced correctly from voxelSneakParade to pocketEscapeRemix on the web build at t = 64.48 s.
- **The siren works and goes silent in every non-playing state.** It starts at a raw detection of 0.20, tracks detection × 0.85 × master, and pauses with volume 0 on pause, menu, cleared or caught (a4.out). At master 0 it plays at volume 0, which is silent.
- **SFX volume is read per play from `masterVolume`.** Distance falloff on gunshot and rock landings is clamped to a sensible floor. Guards can only fire with line of sight, so the 0.35 floor never comes from an invisible shooter.
- **Danger music has proper hysteresis.** It enters fast, leaves after a hold, and gains glide over 1.2 s. Native writes are coalesced. It is unit-tested (pack4-feel).
- **Backgrounding is handled natively.** expo-audio 1.1.1 on Android pauses every playing player on `OnActivityEntersBackground` and resumes them on foreground (AudioModule.kt:217-251). The JS side opens the pause panel on an AppState change (SettingsScreen.tsx:156). Phone calls give AUDIOFOCUS_LOSS_TRANSIENT, and expo-audio pauses and resumes for those (AudioModule.kt:72-80, 100-108).
- **Hit-stop audio is on the impact frame.** The caught/hurt SFX, CatchFlash and camera shake all fire at the start of the 140 ms freeze, not after it.
- **Each effect pairs sound, visuals and haptics.** Pickups get a burst, sound and a light haptic. Crowbar, rock and smoke get a whoosh or pop and a medium haptic. Crowbar contact layers a hit sound on the swing.
- **Haptic calls are safe.** They are fire-and-forget, rejections are swallowed, and they are not spammy: one per discrete event.

---

## Findings

### E-1 (S3, confidence high on code path / medium on user impact): the game takes exclusive audio focus for the whole session and pauses the player's own music, even with Music at 0
- **Evidence:**
  - Nothing in the app calls `setAudioModeAsync` (grep: no hits in src/ or App.tsx).
  - With `interruptionMode` null, expo-audio requests `AUDIOFOCUS_GAIN_TRANSIENT` on the first `play()` (AudioModule.kt:118-131, 388-397).
  - It releases focus only when no player is playing (`shouldReleaseFocus`, :113; `onPlaybackStateChange`, :283-289).
  - Music.ts starts a calm track and the looping tension layer at boot and never stops them. The tension layer runs at volume 0 whenever calm (a1.out: `polysneakPursuit vol 0, paused false` in game, pause and menu).
  - So focus is never released. Spotify, podcasts and similar apps are paused as soon as the game boots, and stay paused while it is open. This happens even when the player sets Music to 0 precisely to listen to their own music.
- **Root cause / class:** no audio-session policy is configured, and players stay "playing" while inaudible (*resource held while logically idle*).
- **Fix (OTA-safe; JS API of an already-linked module):**
  1. In App.tsx at boot, call `setAudioModeAsync({ interruptionMode: 'mixWithOthers', shouldPlayInBackground: false, playsInSilentMode: false })`. On Android, `MIX_WITH_OTHERS` makes `requestAudioFocus` a no-op (:119). Backgrounding still pauses audio (the lifecycle hooks are independent of focus).
  2. In Music.ts, pause the calm and tension players when the music level × gain is 0, and resume them when it rises. This saves two always-on MP3 decoders, which matters for battery.
  - If exclusive focus is a deliberate design choice, keep `doNotMix` but implement E-2.
- **Regression test:** a unit test with an expo-audio stub asserting `setAudioModeAsync` is called once before the first `createAudioPlayer`. A Music.ts test asserting that `setVolume(0)` leaves no player `playing`.

### E-2 (S3, confidence high on code path / medium on frequency): after a permanent focus loss, music is silent for the rest of the session
- **Evidence:**
  - On `AUDIOFOCUS_LOSS`, expo-audio pauses every player but does not set `isPaused` (AudioModule.kt:65-70). So neither `AUDIOFOCUS_GAIN` nor `OnActivityEntersForeground` will resume them (:100-108, :235-247).
  - Triggers: the user presses play on the notification-shade media control, a Bluetooth headset or a watch, or a voice assistant starts music while the game is in the foreground.
  - Music.ts has no recovery. The calm track never reaches `didJustFinish`, so `startNextCalm` never runs. `music.resume()` exists but is never called (grep: no call sites).
  - The next game SFX `play()` re-requests GAIN_TRANSIENT (:394-396), which pauses the user's media again. The result is the worst of both: no game music, and the user's music keeps getting killed.
  - Siren: `s.isPlaying` stays true while the native player is paused, so the siren is mute until detection falls below 0.20 and rises again (Siren.ts:70-77).
- **Root cause / class:** JS-side play state is cached and never reconciled with native state (*state desync after an external interruption*).
- **Fix (OTA-safe):**
  - Mostly removed by E-1's `mixWithOthers`.
  - Defensively, in Music's `playbackStatusUpdate` listener: when `i === current && !paused && status.playing === false && !status.didJustFinish`, call `p.play()` (debounced to about 1 s). Do the same for the tension player.
  - Call `music.resume()` from an AppState `active` handler.
  - In `updateSiren`, use `s.player.playing` rather than the cached `isPlaying` flag.
- **Regression test:** with a stub, emit `{playing:false, didJustFinish:false}` for the current calm player and assert `play()` is called again. In the siren test, set the stub's `playing=false` while detection is high and assert `play()` is retried.

### E-3 (S3, confidence high that it is undocumented; licence itself unverified): music provenance and licence missing from assets/LICENSES.md
- **Evidence:**
  - LICENSES.md documents the fonts, the Kenney models and textures, and every SFX with its source file.
  - The three music tracks (8.3 MB) are not mentioned (`grep -i "music|polysneak|voxel|pocket"` gives no hits).
  - The commit that added them (9f35704) gives the titles but no source or licence.
- **Class:** release compliance / asset provenance.
- **Fix:** add the source, author and licence for each track (and the AI-generation terms, if that is where they came from) before release. OTA-safe: yes (docs only).

### E-4 (S4, confidence high, measured): Volume or Music at 0 is not truly silent
- **Evidence:**
  - a1.out `slider`: dragging master from 0.7 to 0 in 0.0071 steps leaves `store.masterVolume = 0.0042` and the music element at `volume 0.0092`.
  - With 0.0193 steps the store reaches 0, but the music element is still at 0.0026.
  - music.out: `after slider->0 calm 0.00920`. At master 0.004, an SFX play still goes out at volume 0.0024 (music.out).
- **Root cause / class:** two stacked dead-bands with no endpoint snapping (*coalescing threshold swallows the final value*).
  - `setMasterVolume` / `setMusicVolume` drop changes under 0.005 (store.ts:368-381). From 0.0042, the final 0 is ignored.
  - Music `apply()` skips writes under 0.01 (Music.ts:60-66). The last write before 0 sticks, which leaves about -40 dBFS of music, audible on headphones in a quiet room.
- **Fix (OTA-safe):**
  - In the store setters, always accept `clamped === 0 || clamped === 1`, or snap values under 0.01 to 0.
  - In Music `apply()`, write whenever the target is 0 and the last write was not 0.
  - In Siren, apply the same rule to its 0.02 dead-band (Siren.ts:66).
  - Optionally use a perceptual slider curve (v², see E-12).
- **Regression test:** a store test where `setMasterVolume(0.004)` then `setMasterVolume(0)` gives 0. A Music.ts stub test where a descending `setVolume` ramp ending at 0 leaves `player.volume === 0`.

### E-5 (S4, confidence high, measured): the two most important negative cues are the quietest sounds in the mix
- **Evidence (a3.out, loudest 50 ms window + 20·log10(GAIN)):**

  | Sound | Effective level |
  | --- | --- |
  | caught | -9.3 dB |
  | gunshot | -10.9 dB |
  | pickup | -12.2 dB |
  | crowbar_hit | -12.4 dB |
  | throw_land | -15.2 dB |
  | smoke | -15.6 dB |
  | throw | -17.3 dB |
  | aim_click | -19.4 dB |
  | **hurt (shot dead) | -23.5 dB** |
  | **crowbar_swing | -27.5 dB** |

  - Music at the default 0.35 averages about -24.8 dB RMS (a2: track RMS -15.7 dB, × 0.35).
  - So the "KILLED" cue sits at music level, right after a -10.9 dB gunshot that masks it.
  - The crowbar whoosh, which is the only feedback for a miss, sits below the music bed.
  - LICENSES.md says the SFX were "loudness normalised", but they span 18 dB.
- **Class:** mix balance / asset normalisation.
- **Fix (OTA-safe; GAIN constants or re-exported assets):**
  - Re-normalise the assets to a common short-term loudness, or raise `GAIN.hurt` and `GAIN.crowbar_swing` (about +12 dB is needed, so re-export the assets rather than exceed a gain of 1).
  - Consider a louder or longer "killed" asset, layered or stinger-like, distinct from `caught`.
- **Regression test:** a script test that decodes `assets/sfx` (or a precomputed loudness JSON checked in CI) and asserts each effect's effective level is within ±4 dB of a target.

### E-6 (S4, confidence high): key events have no sound, and `ui_tap` is loaded but never played
- **Evidence:** `playSfx` call sites are only in Game.tsx (lines 1177, 1700, 1738-1739, 1751, 1760, 1777, 2038, 2044). No component imports Sfx. The following are silent:
  - **Stage clear:** the biggest reward beat. handleWin gives a haptic and a gold flash only (Game.tsx:1402-1403; EventFlash).
  - **Coins earned / star tally** on the Banner, and **outfit purchase / equip** (StartScreen.tsx:349-366). Neither has audio or haptics.
  - **All UI buttons:** `ui_tap` is in SOURCES with a player allocated (a1.out shows the element) but has 0 plays and no call site.
  - **Guard spots the player / enters chase:** there is a visual "!" (GuardStateMarker) and a continuous siren and music ramp, but no discrete stinger.
  - **Alarm full + reinforcement:** a toast plus the heart-loss haptic only (Game.tsx:1911-1916).
  - **Dogs:** no bark when alerted or chasing; a dog catch reuses `caught`.
  - **Player footsteps / run noise:** none, although noise radius is a core mechanic (only the noise ring shows it).
  - **Boss timer reaching zero** (it resolves through handleWin, so it is silent too).
- **Class:** missing feedback channel.
- **Fix (OTA-safe; new mp3 assets ship over OTA, no native module):**
  - Add `stage_clear`, `spotted`, `alarm`, `dog_bark`, `coin` and `purchase` entries to Sfx.ts.
  - Export `playSfx` through a small singleton (or a store action) so HUD components can call `ui_tap`. Throttle UI taps with a 60 ms minimum interval.
  - Trigger `spotted` on any guard's non-chase → chase transition, at most once per 2 s across all guards.
  - If footsteps are too costly, a quiet run-step tick tied to noise radius is a strong stealth readability cue.
- **Regression test:** a source-level test asserting every `SfxName` has at least one call site, so a dead `ui_tap` cannot ship. A Game.tsx event test (with a stub) asserting `stage_clear` is played on handleWin.

### E-7 (S4, confidence high on mechanism; musical effect is a judgement): the "tension layer" is a different song, so alert state plays two unrelated tracks at once
- **Evidence:**
  - TENSION_TRACK is "Polysneak Pursuit", a standalone song: commit 9f35704 lists it as one of three playlist tracks.
  - Alert targets are calm 0.4 / tension 0.6 (musicIntensity.ts:31-35), held for the whole alert state.
  - The two tracks run unsynchronised: the tension layer starts at t = 0 at boot and the calm track is wherever it is. Tempo, key and phrase do not line up.
  - Chase leaves the calm track at 0.08 (-22 dB), still audible as a clash.
- **Class:** adaptive-music design (layer is not stem-aligned).
- **Fix (OTA-safe):** make alert a short crossfade into the tension track rather than a sustained blend, for example alert {calm 0.15, tension 0.8} and chase {calm 0, tension 1}. Even better, source stems of one song, or one composition with matched tempo and key.
- **Regression test:** a pack4-feel style test asserting that in any steady state, `min(calmGain, tensionGain) <= 0.15`.

### E-8 (S5, confidence high, measured): music asset edges cause a dropout in the chase loop and a hard cut between calm tracks
- **Evidence (a2.out):**
  - polysneakPursuit (the looping tension layer) ends with **1.20 s of trailing silence** (last 100 ms at -82 dB) and restarts at full level (-13.5 dB). Every 146.9 s the chase music drops out for 1.2 s, then slams back in at the intro.
  - voxelSneakParade ends un-faded (last 100 ms at -27 dB, no tail silence), so its hand-off to the next calm track is a hard cut followed by a JS round-trip gap (`didJustFinish` → `seekTo` → `play` on another player).
  - The calm "playlist" is 2 tracks that strictly alternate (`do … while (next === current)`), a 3.4-minute cycle.
- **Fix (OTA-safe; re-export assets):** trim the tension tail to a musical loop point, add a 1-2 s fade-out to voxelSneakParade, and optionally start the next calm track about 1 s before the end with a short volume crossfade.
- **Regression test:** an asset test (decoded in the harness or by a precomputed JSON) asserting looped assets have under 50 ms of trailing silence.

### E-9 (S5, confidence medium-high, computed): the synthesized siren clicks at every loop seam (every 1.4 s)
- **Evidence:**
  - siren.ts accumulates phase over 15,434 samples, ending at 1063.931 cycles, which is not an integer.
  - The sample before the wrap is -7554, and the expected next sample is about -1400. The loop restarts at +7555.
  - That is a 0.069-cycle (about 25°) phase jump on a pure sine, which is a periodic tick.
  - The siren is also a bare 11 kHz sine and the loudest continuous element: at full detection and default master it measures about -12.7 dB RMS, versus music at about -24.8 dB. It reads as placeholder and can be fatiguing.
  - It starts abruptly at 12% volume when the 0.20 threshold is crossed (a4.out: `0.21 0.12 false`).
- **Fix (OTA-safe):**
  - Scale the per-sample phase increment by `round(totalCycles)/totalCycles` so the loop closes at an integer cycle count, or apply a 5 ms crossfade at the seam.
  - Ramp the volume from 0 over the first 0.1 of detection above the threshold.
  - Consider a sampled CC0 siren or alarm.
- **Regression test:** a unit test on `getSirenDataUri()` that decodes the PCM and asserts |first − predicted next| is under 5% of full scale at the seam.

### E-10 (S5, confidence high): haptic timing and profiles are inconsistent with the event
- **Evidence:**
  - Catch: the sound, CatchFlash and shake fire at impact (Game.tsx:1177-1187), but `haptics.heartLost()` / `haptics.caught()` fire in `resolveCatch` after the 140 ms hit-stop (Game.tsx:1205, 1233). The thud is split from the hit.
  - Alarm-full reinforcement reuses `heartLost` (heavy, Game.tsx:1915), so it feels like losing a heart.
  - Crowbar hit and crowbar miss get the same Medium haptic (Game.tsx:1734). Contact deserves Heavy.
  - The haptics.ts header says `caught` is "heavy thud + warning", but the code is a single Error notification.
- **Fix (OTA-safe):**
  - Fire the heart or caught haptic in `handleCatch`.
  - Add `alarm: notificationAsync(Warning)`.
  - Use Heavy on crowbar contact.
  - Fix the doc comment.
- **Regression test:** with haptics stubbed via the loader, assert that handleCatch invokes the haptic in the same tick as `playSfx('caught')`.

### E-11 (S4, confidence high): no way to turn haptics off
- **Evidence:** there is no haptics flag in store.ts or storage.ts (grep), and haptics.ts calls are unconditional. This is an accessibility and comfort gap; vibration-sensitive players have no option.
- **Fix (OTA-safe):**
  - Add `hapticsEnabled` to Settings and storage (same pattern as `weatherEnabled`), with a Toggle in the pause panel.
  - Gate it inside `haptics.ts` with `useStore.getState().hapticsEnabled`.
- **Regression test:** a storage round-trip test, and a haptics test asserting nothing is invoked when the flag is false.

### E-12 (S5, confidence medium): volume UX and persistence nits
- **Linear amplitude sliders:** the bottom 10% of the knob does most of the audible attenuation, and the default 0.35 effective music level is already "loud". A v² or v³ curve is fixable OTA.
- **Settings are persisted only by the panel buttons** (`close`, `onRestart`, `onMainMenu`, `onLoadRun`; SettingsScreen.tsx:124-185). A volume change followed by backgrounding and the OS killing the app with the panel open is lost. Persist on slider release, debounced.
- **Boot race (low risk):** Game mounts after the texture preload, while `loadSettings` runs in parallel (App.tsx:38-55). If settings resolved later, music would start at the default 0.35 for a moment before the store subscription corrected it. Gating Game on the settings load too removes this.
- **No distinct menu music.** The calm playlist continues straight from menu into the run, and stays playing while paused (the mix just returns to calm). This is acceptable, but `Music.pause()` / `resume()` are dead code (no call sites); remove them or use them (see E-2).

### E-13 (S5, confidence high): silent failure, no teardown, and dead code in the audio modules
- **Silent failure:** every catch in Music.ts, Sfx.ts and Siren.ts swallows errors without logging. A broken audio pipeline in a release leaves nothing in the `logDebug` crash trail that bug reports include. Log once per module, e.g. `logDebug('warn','[audio] create failed', name, e)`.
- **No teardown:** Game.tsx never disposes `music`, `sfx` or `siren`, never stops the loop, and deliberately never unsubscribes the store listener (Game.tsx:322-328). This is safe today because Game mounts once (App.tsx gate). Any future remount, such as an error-boundary reset or a dev fast-refresh, would double the music and leak 20 players. Add a `useEffect` cleanup that calls `loopRef.current?.stop()` and the three `dispose()` functions, and unsubscribes.
- **Dead code:** the `ui_tap` player is allocated but never used (see E-6). AlarmOverlay.tsx:13 still says "Visual stand-in for a siren until expo-audio is wired". EventFlash.tsx has an empty `import {  } from '../../ui/theme'`.
- **Threshold mismatch:** the siren starts at a raw detection of 0.20, but AlarmOverlay quantises to 0.1 and needs a value above 0.20, which in practice means 0.25 or more. Between 0.20 and 0.25 the siren sounds with no red edge.
- **Fix:** OTA-safe, trivial.

---

## Not issues / checked and fine
- **Many SFX in one frame:** pools of 1-3 with round-robin. A 4th simultaneous gunshot restarts the oldest one, which is acceptable. `throw_land` uses a pool of 2. No unbounded allocation per play.
- **Pause / menu / death / clear:** the siren is silenced every frame in the non-playing branch (Game.tsx:1527-1533). Verified in the browser.
- **Notification sounds on Android 8+** are auto-ducked by the system and do not reach the LOSS_TRANSIENT_CAN_DUCK pause path (focus is requested without `setWillPauseWhenDucked`).
- **Music rate change (chase 1.06×):** pitch is preserved by default on Android (`preservesPitch = true`).
- **iOS silent switch / AVAudioSession:** not applicable to this Android-only build. If iOS ships, E-1's `setAudioModeAsync` call must set `playsInSilentMode` deliberately.

## Summary (by severity)
| ID | Sev | Conf | Title | OTA |
|---|---|---|---|---|
| E-1 | S3 | high/med | Exclusive GAIN_TRANSIENT focus held all session; kills user's music even at Music 0 | yes |
| E-2 | S3 | high/med | Permanent focus loss leaves game music dead; siren flag desync | yes |
| E-3 | S3 | high | Music tracks have no provenance/licence in LICENSES.md | yes |
| E-4 | S4 | high | Volume 0 not silent (store 0.005 + Music 0.01 dead-bands) | yes |
| E-5 | S4 | high | hurt (-23.5 dB) / crowbar_swing (-27.5 dB) buried under music | yes |
| E-6 | S4 | high | Silent stage clear, coins, purchase, UI (ui_tap unused), spotted, alarm, dogs, footsteps | yes |
| E-7 | S4 | high | Alert state blends two unrelated songs | yes |
| E-11 | S4 | high | No haptics on/off setting | yes |
| E-8 | S5 | high | 1.2 s dropout in tension loop; hard cut calm→calm; 2-track playlist | yes |
| E-9 | S5 | med-high | Siren loop-seam click every 1.4 s; placeholder sine; abrupt onset | yes |
| E-10 | S5 | high | Catch haptic 140 ms late; alarm reuses heartLost; crowbar hit=miss | yes |
| E-12 | S5 | med | Linear sliders; settings persisted only on panel close; boot race; dead pause/resume | yes |
| E-13 | S5 | high | Silent catch blocks, no teardown, stale comments, siren/overlay threshold mismatch | yes |
