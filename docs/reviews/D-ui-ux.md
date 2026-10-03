# Review D: player-facing UI/UX QA (HEAD 370a624)

Scope: every screen and HUD element, at 915x412, 851x393, 800x360, 740x360, 640x360 and 1280x800.
Method: frozen web build through review2/h.mjs on port 8804, scripts `review2/D/s*.mjs`, screenshots in `review2/D/` (named `<screen>_<WxH>.png`). Code references are to /home/user/Endless-Escaspe at 370a624. Nothing in the repo was modified.
Limits: on the web build all safe-area insets are 0, `hitSlop` is ignored, and the OS font scale cannot be set. Font scaling was approximated by multiplying every computed text size by 1.3 (`*_font130.png`). Findings that depend on the device are marked "code-inferred".

Severity: S2 dead end / blocking UX · S3 functional UI defect · S4 inconsistency / feedback / clarity · S5 polish.

---

## What already looks professional
- **How to Play** (`howto_640x360.png`, `howto_end_640x360.png`): a solid panel, clear section hierarchy, readable 14/20 body text, sticky header with CLOSE, and it scrolls cleanly at 360 dp. The copy matches the code: coin rates match economy.ts (10/5/25/20/10), heart counts match progression.ts, smoke lasts 5 s and the crowbar 4 s.
- **Pause panel** (`flow_pause_ingame_915x412.png`, `pause_from_home_640x360.png`): two columns, the height comes from the window and insets (pauseLayout.ts), Build Info scrolls inside the panel, and one primary, two secondary and one danger button form a clean hierarchy.
- **GameModal** dialogs (`delete_confirm_640x360.png`, `boss_modal_640x360.png`): use the brand, a correct cancel/danger pairing, and an entry animation.
- **Result cards** fit at 360 dp tall in compact mode (`banner_cleared_640x360.png`). The stat rows are staggered in, and each target is shown next to its stat.
- **HUD controls** have dark backings and light rims that read on snow, night and dusk (`after_skip_915x412.png`, `play_busy_*`). The crowbar pill turns gold when in range, and empty pickup slots are hidden.
- **Update and share errors** are handled with explicit status strings (BuildInfo.tsx:32-50).
- **Tutorial**: the SKIP button is always visible, the dots show progress, and the 6 beats take about 28 s, which matches the "about 30 seconds" prompt.

---

## Findings

### D-1 · S2 · Returning to the main menu shows a stale start-screen step: a demo prompt that silently starts a run, or a pre-filled name that is "already taken" · confidence high (reproduced)
- **Evidence:**
  - `flow_mainmenu_after_firstrun_915x412.png`: NEW RUN → name "Kev" → START → Quick demo? SKIP → play → gear → MAIN MENU lands back on **"Quick demo? SKIP / SHOW ME"**. Tapping SKIP there immediately starts another run on the active save (script output `after stale SKIP ['playing', 1, 'kev']`).
  - `flow_mainmenu_after_namestart_915x412.png`: with tutorialSeen, NEW RUN → "Zed" → START → play → MAIN MENU lands on the **name-entry screen with "Zed" still typed in**. Pressing START opens "Name already taken".
- **Root cause:** StartScreen keeps `mode` in local state. The reset effect only runs when `mode === 'home'` (StartScreen.tsx:182). `startRun()` never resets `mode`, and the pause MAIN MENU (SettingsScreen.tsx:175-180) and the result card's MAIN MENU (Banner.tsx:198, 217) only call `setRunState('idle')`. The same applies to 'profile' and 'outfits', which happens to look acceptable.
- **Defect class:** screen state is held in a component that outlives the run. The return navigation is implicit.
- **Fix:** in StartScreen, track the previous runState. On a transition from not-idle to idle with no `pendingStartMode`, set mode to `'profile'` when there is an active save (the natural "back to my character" place), otherwise `'home'`, and clear `nameDraft`. Alternatively, have both MAIN MENU handlers call `setPendingStartMode('home')`.
- **OTA-safe:** yes.

### D-2 · S2 · The gear opens "GAME PAUSED" on every menu and results card; RESTART there starts an unsaved anonymous run · confidence high (reproduced)
- **Evidence:**
  - `pause_from_home_915x412.png`, `pause_from_home_640x360.png`: from the title screen the panel says GAME PAUSED and offers RESUME, RESTART, LOAD RUN and MAIN MENU.
  - `anon_cleared_915x412.png` (script s6): gear → RESTART on a fresh install gives `{runState:'playing', activeSaveName:null}`. After clearing the stage the card shows "Coins earned +0 · total 0" and `saves` stays `[]`, so all progress is discarded.
  - The gear is also live over name entry (`name_empty_915x412.png`), the tutorial prompt, and the result cards (`banner_*`). On a cleared card, RESTART starts the *next* stage, because the stage was already advanced.
- **Root cause:** the gear Pressable in SettingsScreen.tsx:202-219 is rendered without checking runState. Restart (Game.tsx:1452-1464) calls `setRunState('playing')` regardless of whether a save is active.
- **Defect class:** global overlay controls that do not know which screen they are on (see also the Toast in D-6).
- **Fix:** render the gear only while `runState === 'playing'`. If menus need settings, open the same card titled "SETTINGS", show only the right-hand column, and add a CLOSE button (primary). Guard `requestRestart` so it does nothing when `activeSaveName == null && gameMode === 'campaign'`.
- **OTA-safe:** yes.

### D-3 · S2 (≤800x360) / S3 (wider) · The profile (stage board) screen breaks on phones · confidence high
- **Evidence:**
  - `profile_640x360.png`: the name wraps one letter per line ("Ma / xi / mil / ian…"), the OUTFITS card overflows the panel's right edge, the stage grid is pushed completely off-screen, and BACK / PLAY STAGE are clipped at the bottom.
  - `profile_740x360.png`, `profile_800x360.png`: the name wraps to two lines, the **gear icon is drawn on top of the character frame**, and the OUTFITS card overruns the panel (panel right edge about 696 dp at 740 width, card to about 718 dp).
  - `profile_915x412.png`: OUTFITS overruns the panel by about 6 dp, and "No finish. Harder every 120 / m." leaves an orphan "m.".
- **Root cause:** `profileHeader` (StartScreen.tsx:1243) is one non-wrapping row: a 50 dp figure, the text (flexShrink 1), then `modeRow` (1325: marginLeft 18 plus three `modeBtn` at minWidth 104 with padding, about 400 dp). Nothing caps the width to the 88 % decorative `panelBg`, so the text column is squeezed to zero. The board has a fixed `maxHeight: 200` (1273) inside a vertically centred root with no outer scroll, so the CTA row is pushed past the bottom.
- **Defect class:**
  - Absolute decorative `panelBg` with content that is not constrained to it: also continue (D-8), name and outfits.
  - Fixed `maxHeight` values instead of flex: `saveList` 220, `boardList` 200.
- **Fix:**
  - Lay the screen out as: row 1 is the figure plus name (`numberOfLines={1}`, `adjustsFontSizeToFit`, `minimumFontScale={0.7}`) plus stats; row 2 is ENDLESS / DAILY / OUTFITS with `flex:1` each and a hint `numberOfLines={2}`; row 3 is the board (`flex:1`, `minHeight: 64`); row 4 is the CTAs.
  - Wrap the content in a View of `width: '88%'` and pad the top by `max(insets.top, 0) + 56` so it clears the gear (or hide the gear, D-2).
  - At heights below 400, drop the hint lines.
- **OTA-safe:** yes.

### D-4 · S2 · A campaign game over has no "Try again" · confidence high
- **Evidence:** `banner_arrested_640x360.png`, `banner_killed_640x360.png`. The only action is MAIN MENU (Banner.tsx:212-223). Retrying the same stage takes MAIN MENU → CONTINUE → character → PLAY STAGE N (4 taps), and with D-1 it may land on a stale screen. Endless and Daily do offer RUN AGAIN (Banner.tsx:183-200), so this is also inconsistent. The cleared card has the reverse problem: it offers only NEXT STAGE, so the only way to stop is to start the next stage and pause.
- **Root cause:** the code comment says "send the player back to the start screen".
- **Fix:**
  - Caught card: primary "TRY AGAIN" calling `requestRestart()`, which already re-grants hearts via `grantStartingHearts(stage)` at Game.tsx:1457. Then secondary "MAIN MENU".
  - Cleared card: add a secondary "MENU" next to NEXT STAGE.
  - Use the `btnRow` already used for Endless.
- **OTA-safe:** yes.

### D-5 · S3 · The Android back button exits the app from most screens; the in-game dialog ignores back · confidence high (code), not device-tested
- **Evidence:**
  - The only back handlers are SettingsScreen.tsx:159 (it returns `false` unless the run is playing and not paused) and HowToPlay.tsx:115 (home reference only).
  - Name, Continue, Profile, Outfits, Tutorial prompt, Tutorial cutscene, and the cleared / caught cards have none, so back falls through to the activity and closes or backgrounds the game.
  - GameModal.tsx:66 renders `<Modal visible transparent>` without `onRequestClose`, so back does nothing on "Delete character?" and the other dialogs.
- **Fix:**
  - StartScreen: one `BackHandler` that maps name→home, continue→home, profile→continue, outfits→profile, tutorialPrompt→SKIP.
  - Tutorial: back calls `dismissAndPersist`.
  - Banner: back has the same effect as the secondary action.
  - GameModal: `onRequestClose` runs the action whose variant is `'cancel'`, otherwise the single action.
- **OTA-safe:** yes (pure JS).

### D-6 · S3 · Tips overlap the hearts, the BOSS PERK tag and the pickup buttons on narrow phones · confidence high
- **Evidence:**
  - `play_busy_640x360.png`: the tip covers the 3rd heart, "BOSS PERK · 10" and most of the THROW button.
  - `play_busy_800x360.png`: the tip's right edge runs into THROW.
  - `play_daily_640x360.png`: the tip touches CROUCH.
- **Measurements at 640x360:**
  - The Toast is `maxWidth: '60%'`, so about 384 dp centred (x 128-512, y 64-114).
  - Hearts with the perk end at x ≈ 194.
  - The pickup column is anchored `bottom: 230` and climbs to **y = 10** (crowbar) and y = 74-130 (THROW / SMOKE) at a height of 360, because PickupBag.tsx `col/rockSlot` measure from the bottom.
- **Root cause:** each HUD element positions itself independently with fixed numbers. Toast.tsx:38-41 only avoids the top-centre elements, not the side clusters.
- **Defect class:** no shared HUD layout map. AlarmBar, BossTimer, DistanceHud and Toast each hard-code `top` values (32 / 64 / 66 / 98 / 126).
- **Fix:**
  - Toast: when `width < 820`, place it at `top: 112` with `left: max(16, insets.left+12)` and `right: (rock slot visible ? 245 : 165) + insets.right`. That gives a band of about 380 dp at 640 below the hearts and left of the right cluster.
  - Toast: otherwise keep it centred with `maxWidth: min(60%, width - 2*245)`.
  - PickupBag: clamp its top to at least 56 dp (on screens shorter than 400 use `bottom: 230 - (400 - h)`, or lay crowbar, smoke and rock out in a row).
  - Put these constants in `src/ui/hudLayout.ts`.
- **OTA-safe:** yes.

### D-7 · S3 · OS "large text" breaks fixed-size controls · confidence medium (emulated: computed sizes ×1.3)
- **Evidence:**
  - `fs_play_915x412_font130.png`: CROWBAR, THROW and SMOKE labels spill outside their 78×56 pills, and the count and icon are pushed up.
  - `fs_profile_915x412_font130.png`: "— — —" wraps to 2 lines in the 76×64 cells, the header overflows the panel more, and the stats wrap.
  - `fs_pause_915x412_font130.png`: FEATURE REQUEST wraps and the column scrolls sooner.
- **Root cause:** `allowFontScaling` and `maxFontSizeMultiplier` are never set (grep finds 0 hits). RN Text scales with Android `fontScale` (up to 2.0 on Android 14) while the containers are fixed dp (PickupBag 78×56, ActionButtons 78×56, RunButton 70, boardCell 76×64, keyboard keys 36 high).
- **Fix:**
  - In App.tsx, before render: `Text.defaultProps = { ...Text.defaultProps, maxFontSizeMultiplier: 1.3 }`. `TextInput` is not used.
  - Gameplay control labels (PickupBag, ActionButtons, RunButton, NameKeyboard keys, board cells): `allowFontScaling={false}`. These are icon-like labels; reading text (How to Play, modal bodies, tips) keeps the 1.3 cap.
- **OTA-safe:** yes.

### D-8 · S4 · The Continue list wastes space on the hero title, collides with the gear, and hides how many saves exist · confidence high
- **Evidence:** `continue_list_640x360.png`, `continue_list_740x360.png`: the 62 dp hero title runs past the panel edges and the gear overlaps the "E". Only 2 of 8 saves are visible, the 3rd is cut, and there is no scroll indicator (`showsVerticalScrollIndicator={false}`, StartScreen.tsx:~617). At 915: 3 of 8.
- **Fix:**
  - Replace `<TitleRow/>` on this screen with a `T.heading` "CONTINUE" header.
  - Give `saveList` `flex:1` instead of `maxHeight 220` and show the scroll indicator.
  - Reduce row height (paddingVertical 6 and a 36 dp thumbnail) so 4 rows fit at 360.
  - Show the coin count and last-played time in each row instead of an identical figure.
- **OTA-safe:** yes.

### D-9 · S4 · Outfit shop: one-tap purchase, no affordability cue, unhelpful "not enough" message · confidence high
- **Evidence:**
  - `outfit_bought_915x412.png`: a single tap on "Hi-Vis Orange" spent 120 of 150 coins with no confirmation; the only feedback is the label changing to WEARING.
  - `outfits_640x360.png`: "400 coins" looks identical whether or not it is affordable.
  - `outfit_nofunds_915x412.png`: the message does not say how many more coins are needed.
- **Code:** StartScreen.tsx:347-372.
- **Fix:**
  - Before `purchaseOutfit`, show a GameModal "Buy Hi-Vis Orange? / 120 coins · you have 150" with BUY (primary) and CANCEL. On success, play a short pulse on the cell (scale 1→1.06→1) plus the existing `pickup_grab` sfx.
  - Unaffordable price: show it in `textDisabled` with "need 250 more".
  - Not-enough body: `You have ${coins}. ${price-coins} more needed. …`.
- **OTA-safe:** yes.

### D-10 · S4 · The stage board opens at stage 1; the NEXT stage is off-screen for veterans · confidence high
- **Evidence:** `profile_915x412.png` shows stages 1-18 of 34 with no scroll indicator, while the gold CTA says PLAY STAGE 34.
- **Fix:** give the ScrollView a ref plus `onContentSizeChange={() => ref.current?.scrollToEnd({animated:false})}`, and set `showsVerticalScrollIndicator`.
- **OTA-safe:** yes.

### D-11 · S4 · Touch targets below 44 dp · confidence high (DOM measured at 640x360, s10.mjs)
- **Measured sizes:**

  | Control | Size |
  |---|---|
  | Home "HOW TO PLAY" link | 139×**31** |
  | Continue "BACK" link | 76×**31** |
  | Name BACK / START | 112×**37** |
  | Keyboard keys | 52×**36** |
  | How to Play CLOSE / WATCH INTRO | **40** high |
  | Pause RESUME / RESTART / LOAD RUN / MAIN MENU | **42** high |
  | Pause HOW TO PLAY | about **32** high |
  | COPY / SHARE INFO | 165×**32** |
  | Weather toggle | 50×**28** |
  | Tutorial SKIP | about 32 high (hitSlop 8 helps on native) |

  The gear is 36×36 but has hitSlop 10 on native, which is fine.
- **Root cause:** each screen sets its own `paddingVertical` (8 / 9 / 10 / 11 / 12) and there is no minimum-height token.
- **Fix:**
  - Add `export const touch = { min: 44 }` to theme.ts and use `minHeight: touch.min` in every button style (`linkBtn`, `bigBtnCompact`, `feedbackBtn`, `bigBtn` in SettingsScreen, `btn` in BuildInfo).
  - Keyboard keys: height 40. The name screen fits: 4×44 rows = 176 plus header 120 at 360.
  - Toggle: give it a 44 dp hit wrapper.
- **OTA-safe:** yes.

### D-12 · S4 · Copy and terminology inconsistencies · confidence high
- **Same object, five names:** "Name your save", "Pick a name for your save", "Delete character?", "Continue a run", "LOAD RUN", and "delete the existing save from **the load screen**" (StartScreen.tsx:285). No screen is called "load screen".
- **Hearts vs lives:** "Lives used" on every result card (Banner.tsx:158, 177) while the HUD, How to Play ("hearts lost") and the boss popup all say *hearts*.
- **ARRESTED for non-arrests:** dog bites (Game.tsx:2124) and razor wire (Game.tsx:1676) call `handleCatch()` with the default `'arrested'`, so the handcuff flash and the "ARRESTED" card appear for a dog bite or a fence cut.
- **Mixed title case** in modal titles: "Name already taken", "Not enough coins", "Delete character?" next to "BOSS ROUND".
- "BOSS PERK · 10" does not say what 10 is. Suggest "+1 HEART · 10 STAGES".
- "Keep it under 20 characters." (StartScreen.tsx:273) is unreachable because the keyboard caps at 20, and it is wrong anyway since 20 is allowed.
- **Fix:**
  - Pick "character" for the object: "Name your character", "LOAD CHARACTER", "Characters".
  - Use "Hearts lost" everywhere.
  - Pass `'bitten'` / `'cut'` causes, or use a neutral "CAUGHT" for non-guard hits.
  - Uppercase all modal titles (the display font is designed for caps).
- **OTA-safe:** yes.

### D-13 · S4 · A failed save is invisible to the player · confidence high (code)
- **Evidence:** `writeSaves` swallows every error (storage.ts:324 `catch { // ignore }`), and none of the 6 call sites check a result. A full disk means progress, coins and purchases are silently lost on the next launch.
- **Fix:** have `writeSaves` resolve to `boolean`. On `false`, show `showToast('Couldn't save progress - free up storage', 'warn')` during play, or a GameModal on menus.
- **OTA-safe:** yes.

### D-14 · S4 · No reduce-motion support · confidence high (code)
- **Evidence:** grep for `useReducedMotion|ReduceMotion` finds 0 hits. Endless loops and shakes:
  - title breathe, `withRepeat` (StartScreen.tsx:63)
  - result card bob (Banner.tsx:62-71)
  - AlarmBar pulse
  - AlarmOverlay pulse
  - camera shake on every catch (Game.tsx render, amplitude 0.18)
  - full-screen red / gold EventFlash (55 % / 40 %)
- **Fix:** Reanimated 4 ships `useReducedMotion()`. Gate every `withRepeat` and the shake amplitude on it, or pass `reduceMotion: ReduceMotion.System` in the timing configs.
- **OTA-safe:** yes (no new module).

### D-15 · S4 · Text and bars drawn straight over the scene lack a backing (YARD ALARM, SURVIVE timer) · confidence medium-high
- **Evidence:**
  - `alarm_stage16_915x412.png`: the pink "YARD ALARM" label (rgba(255,200,200,.85)) sits on a dusk sky of about (123,82,92), roughly 3.7:1 for 12 dp text with only a 2 px blur shadow. The bar is 5 dp tall, so the empty track is nearly invisible.
  - `play_boss_640x360.png`: "SURVIVE" and the gold timer sit on a yellow floodlit arena.
  - DistanceHud has a `panelSoft` pill (`play_daily_*`), so this is also an inconsistency.
- **Fix:** give AlarmBar and BossTimer the DistanceHud pill (`backgroundColor: ui.panelSoft, borderRadius 12, padding 4/14`). Track height 8, label `hud.textShadow`. Perk tag: same shadow token.
- **OTA-safe:** yes.

### D-16 · S5 · Unicode glyphs still in the UI · confidence high
- ★ ☆ on result cards, the board, the continue rows and the profile subtitle (Banner.tsx:19-20, StartScreen.tsx:823-824). At 14 dp the outlined ☆ is hairline thin (`profile_915x412.png`).
- × delete (StartScreen.tsx:645) and ⌫ (NameKeyboard).
- ‹ › in the How to Play text and BuildInfo's " ›" expander.
- These depend on the platform font and do not match the drawn icon family in icons.tsx.
- **Fix:** add `StarIcon({filled})`, `CloseIcon` and `BackspaceIcon` to icons.tsx (the View-drawn style already used for Skull and Heart).
- **OTA-safe:** yes.

### D-17 · S5 · Drift from the token system · confidence high
- **Font sizes off the scale:** 15 (keyboard), 18 ×3 (name, profile name, code digit), 22 ×2 (pause title, delete glyph), 28 / 30 / 34 (Banner). The scale is 12/13/14/16/20/26/40/62.
- **Pressed styles:** 7 variants (opacity 0.6 / 0.7 / 0.75 / 0.85 with and without scale) against the `buttonPressed` token. StartScreen `bigBtnDown` uses opacity 0.75 with no scale.
- **Mixed faces in one group:**
  - Pause: RESUME uses the display face while RESTART / LOAD RUN / MAIN MENU use system 800 (`flow_pause_ingame_915x412.png`).
  - Banner: RUN AGAIN uses the display face but MAIN MENU is forced to the system font (`btnLabelDeath fontFamily: undefined`) (`banner_daily_640x360.png`).
  - Name screen: BACK / START use system 900 (`bigBtnLabelCompact`) while home buttons use the display face.
- **Gold tints:** 10 different alpha values of the brand gold in HUD files, and 110 distinct literal colours in src/components/HUD.
- **Fix:** add `type.subtitle: 18` and drop the other off-scale sizes. Use `buttonLabel(variant)` for every button label so the face follows the variant consistently (either all display or all system for secondary and danger). Add `gold(0.35)`, `gold(0.55)` and `gold(0.95)` as the only rim alphas.
- **OTA-safe:** yes.

### D-18 · S5 · Name-entry details · confidence high
- START stays enabled while DONE shows disabled; they are the same action in two states (`name_error_915x412.png`).
- The error line is inserted into the layout and pushes the keyboard down by about 11 dp (`name_empty` vs `name_error`).
- **Fix:** keep one CTA (DONE on the keyboard; drop START or disable it in sync). Reserve the error line with `minHeight: 16`.
- **OTA-safe:** yes.

### D-19 · S5 · Tutorial layout on tablets · confidence high
- **Evidence:** `tut_beat5_1280x800.png`: the explainer card stretches to about 940 dp on a single 100-character line, and the composition sits left of centre.
- **Cause:** `cardWidth = max(220, width - L.W - 80)` (Tutorial.tsx) has no maximum.
- **Fix:** `Math.min(460, …)` and centre the row. Optional: tap the card to advance a beat.
- **OTA-safe:** yes.

### D-20 · S5 · Result-card content · confidence high
- The death card lists star targets ("★ 0", "★ ≤ 3s") that cannot be earned on a loss (`banner_arrested_640x360.png`).
- Coin formats differ: Endless shows "Coins earned +10 / Coins 85" while campaign shows "+35 · total 75".
- **Fix:** hide targets when `!isCleared`, and use one format such as "Coins +35 (total 75)".
- **OTA-safe:** yes.

### D-21 · S5 · Outfit grid and swatches · confidence high
- Classic (#f2c14a) and Gold Standard (#ffe07a) swatches are nearly the same colour.
- At 915 the grid is 4+2 with orphans (`outfit_bought_915x412.png`).
- **Fix:** `maxWidth: 480` for a 3×2 grid. Draw the swatch as the drawn prisoner thumbnail (PrisonerFigure) tinted per outfit.
- **OTA-safe:** yes.

### D-22 · S5 · Engineering diagnostics in the player pause panel · confidence high
- **Evidence:** `pause_from_home_scrolled_640x360.png` shows the "Rendering … textured", "GPU textures 10/10 match the source images" and "Texture files" rows.
- **Fix:** collapse BuildInfo behind a "Build / Update info ›" disclosure that is closed by default. Keep the CHECK FOR UPDATE button visible.
- **OTA-safe:** yes.

### D-23 · S5 · Safe-area insets are not applied everywhere · confidence medium (code-inferred; web insets are 0)
- These ignore `insets.left/right`:
  - StaminaBar (`left: 24`, StaminaBar.tsx), which sits under a left punch-hole when the phone is rotated that way
  - PickupBag, ActionButtons, RunButton, LookButtons (fixed `right: 63…`), which clear typical insets of 24-48 dp by luck
  - StartScreen `panelBg` / profile content (D-3)
- Hearts, the gear, How to Play, the pause panel and the result cards do use insets.
- **Fix:** add `insets.right` to the right cluster's base offset and `insets.left` to StaminaBar.
- **OTA-safe:** yes.

### D-24 · S5 · No boot or loading visual · confidence low (code-inferred; textures load too fast on web to observe)
- App.tsx:62 renders nothing until textures and the font resolve. On slow devices the player sees a blank root view after the native splash hides.
- **Fix:** render a centred title plus a small indeterminate bar on `#0b0d12` while `!texturesReady`.
- **OTA-safe:** yes.

### D-25 · S5 · Colour-only stages in the detection ring · confidence medium
- **Cause:** RadialMeter.ts:46-49 uses yellow → orange (≥0.5) → red (≥0.85). The fill count is a redundant cue, but the "can shoot" threshold is not marked, and orange and red are hard to tell apart with protanopia or deuteranopia.
- **Fix:** at ≥0.85 also scale the dots ×1.4 or pulse them. How to Play would then say "red, bigger dots = can shoot".
- **OTA-safe:** yes.

---

## Summary (sorted by severity)

**S2**
- D-1 Stale start-screen step after MAIN MENU: the demo prompt SKIP starts a run; the name screen is pre-filled and then "already taken".
- D-2 The gear opens GAME PAUSED on menus and result cards; RESTART from home starts an unsaved run.
- D-3 Profile screen broken at ≤800x360: letter-per-line name, overflowing header, board and CTAs off-screen, gear over the figure.
- D-4 Campaign game over has only MAIN MENU (no TRY AGAIN); the cleared card has no way out.

**S3**
- D-5 Android back exits the app from menus, tutorial and results; GameModal ignores back.
- D-6 Tips overlap hearts, the perk tag and THROW at ≤800 wide; the pickup column climbs to y = 10.
- D-7 OS large text overflows the fixed 78×56 controls and board cells; no `maxFontSizeMultiplier`.

**S4**
- D-8 Continue list: hero title collides with the gear and overflows the panel; only 2 of 8 saves visible; no scroll indicator.
- D-9 Outfit shop buys on one tap, has no affordability cue, and the not-enough message omits the shortfall.
- D-10 Stage board does not scroll to the NEXT stage.
- D-11 Touch targets of 28-42 dp (links, name buttons, keys, pause buttons, toggle).
- D-12 Terminology: save / character / run / "load screen"; lives vs hearts; ARRESTED for dog bites and wire; mixed-case modal titles.
- D-13 Save failures are silent.
- D-14 No reduce-motion support.
- D-15 YARD ALARM and SURVIVE lack a backing (about 3.7:1 on a dusk sky; 5 dp track).

**S5**
- D-16 Unicode ★ ☆ × ⌫ ‹ › remain.
- D-17 Off-scale sizes, 7 pressed styles, mixed button faces, 10 gold alpha values.
- D-18 Name entry: START/DONE duplicate with different enabled states; the error line shifts the layout.
- D-19 Tutorial card has no maximum width on tablets.
- D-20 Death card shows star targets; coin formats differ between cards.
- D-21 Outfit swatches look alike; 4+2 grid.
- D-22 GPU and texture diagnostics shown to players in the pause panel.
- D-23 Some HUD elements ignore left/right insets.
- D-24 Blank boot screen.
- D-25 Detection-ring states rely on colour.

All fixes are JS / style only and OTA-safe.

Process note: early on, one `pkill -f chrome-linux` cleanup command matched by pattern and may have ended other reviewers' Chromium instances running at that moment. Their harness runs may need a re-run.
