import React, { useEffect, useMemo, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { useStore, type PlayerSkin } from '../../state/store';
import {
  newSave,
  saveKeyFromName,
  saveSettings,
  writeSaves,
  type Save,
  type SavesMap,
} from '../../util/storage';
import { NameKeyboard } from './NameKeyboard';
import { getReleaseInfo } from '../../util/releaseRuntime';
import { formatMenuLine } from '../../util/releaseInfo';
import { OUTFITS, type OutfitId } from '../../util/outfits';
import { equipOutfit, purchaseOutfit } from '../../util/economy';
import { dailySeed, utcDayKey } from '../../util/daily';
import { buttonFill, color as ui, type as T, fonts } from '../../ui/theme';

const TITLE = 'ENDLESS ESCAPE';

// Text drawn straight over the 3D scene (no panel behind it).
const overSceneShadow = {
  textShadowColor: 'rgba(0, 0, 0, 0.85)',
  textShadowOffset: { width: 0, height: 1 },
  textShadowRadius: 3,
} as const;

// Title: one piece of text per word on a shared baseline, animated as
// a whole - a short drop-in when the menu appears, then a slow 2%
// breathing scale. (Each letter used to bob and scale on its own
// phase; neighbouring stencil capitals then sat up to 28 dp apart and
// ~12% different in size, which read as "ENDLEsS eSCAPE".)

// The full title measures ~660 dp at the hero size (Black Ops One
// advances + the word gap); narrower screens scale it down instead of
// breaking a word across lines, and a wrap on a very narrow screen can
// only fall between the two words.
const TITLE_WIDTH_AT_HERO = 660;

function TitleRow() {
  const { width } = useWindowDimensions();
  const fontSize = Math.max(34, Math.min(T.hero, Math.floor(((width - 48) * T.hero) / TITLE_WIDTH_AT_HERO)));
  const drop = useSharedValue(0);
  const breathe = useSharedValue(0);

  useEffect(() => {
    drop.value = withTiming(1, { duration: 450, easing: Easing.out(Easing.back(1.4)) });
    breathe.value = withRepeat(withTiming(1, { duration: 2600, easing: Easing.inOut(Easing.quad) }), -1, true);
  }, [drop, breathe]);

  const style = useAnimatedStyle(() => ({
    opacity: drop.value,
    transform: [{ translateY: (1 - drop.value) * -24 }, { scale: 1 + 0.02 * breathe.value }],
  }));

  return (
    <Animated.View style={[styles.titleRow, style]}>
      {TITLE.split(' ').map((word, w) => (
        <Text
          key={w}
          style={[styles.titleWord, { fontSize }, w > 0 && { marginLeft: Math.round((18 * fontSize) / T.hero) }]}
        >
          {word}
        </Text>
      ))}
    </Animated.View>
  );
}

// Stylised 2D blocky prisoner figure built from absolutely-positioned
// Views. Reads as a chunky little character facing the camera. Used
// both at full size on the figure picker and at small size as a
// thumbnail next to each saved character.
function PrisonerFigure({
  skin,
  size = 'lg',
}: {
  skin: PlayerSkin;
  size?: 'lg' | 'sm';
}) {
  const headColor = skin === 'brown' ? '#7e4f2a' : '#e8c697';
  const wrap = size === 'sm' ? styles.figureWrapSmall : styles.figureWrap;
  const head = size === 'sm' ? styles.headSmall : styles.head;
  const torso = size === 'sm' ? styles.torsoSmall : styles.torso;
  const stripe = size === 'sm' ? styles.torsoStripeSmall : styles.torsoStripe;
  const arm = size === 'sm' ? styles.armSmall : styles.arm;
  const armL = size === 'sm' ? styles.armLSmall : styles.armL;
  const armR = size === 'sm' ? styles.armRSmall : styles.armR;
  const leg = size === 'sm' ? styles.legSmall : styles.leg;
  const legL = size === 'sm' ? styles.legLSmall : styles.legL;
  const legR = size === 'sm' ? styles.legRSmall : styles.legR;
  return (
    <View style={wrap}>
      <View style={[head, { backgroundColor: headColor }]} />
      <View style={torso}>
        <View style={stripe} />
      </View>
      <View style={[arm, armL]} />
      <View style={[arm, armR]} />
      <View style={[leg, legL]} />
      <View style={[leg, legR]} />
    </View>
  );
}

function FigurePickButton({
  skin,
  selected,
  onTap,
}: {
  skin: PlayerSkin;
  selected: boolean;
  onTap: () => void;
}) {
  return (
    <Pressable
      onPress={onTap}
      style={[styles.figureFrame, selected && styles.figureFrameSelected]}
    >
      <PrisonerFigure skin={skin} />
    </Pressable>
  );
}

type Mode = 'home' | 'name' | 'tutorialPrompt' | 'continue' | 'profile' | 'outfits';

export function StartScreen() {
  const runState = useStore((s) => s.runState);
  const startRun = useStore((s) => s.startRun);
  const setPlayerSkin = useStore((s) => s.setPlayerSkin);
  const setStage = useStore((s) => s.setStage);
  const setBestStars = useStore((s) => s.setBestStars);
  const saves = useStore((s) => s.saves);
  const upsertSave = useStore((s) => s.upsertSave);
  const removeSave = useStore((s) => s.removeSave);
  const setActiveSave = useStore((s) => s.setActiveSave);
  const setPlayerName = useStore((s) => s.setPlayerName);
  const pendingStartMode = useStore((s) => s.pendingStartMode);
  const setPendingStartMode = useStore((s) => s.setPendingStartMode);
  const setShowTutorial = useStore((s) => s.setShowTutorial);
  const showTutorial = useStore((s) => s.showTutorial);
  const setGameModal = useStore((s) => s.setGameModal);

  const [mode, setMode] = useState<Mode>('home');
  const [pickedSkin, setPickedSkin] = useState<PlayerSkin | null>(null);
  const [nameDraft, setNameDraft] = useState('');
  const [nameError, setNameError] = useState<string | null>(null);
  // Set true when the tutorial-prompt step launches the cutscene; the
  // effect below watches for the cutscene to flip back to false and
  // then starts the run, so YES → demo → game flows automatically.
  const [pendingRunAfterTutorial, setPendingRunAfterTutorial] = useState(false);
  // The save key currently being viewed in 'profile' mode. Decoupled
  // from activeSaveName so we can browse a save's star board without
  // committing to load it until the player taps a stage / PLAY.
  const [profileKey, setProfileKey] = useState<string | null>(null);

  // List view sorted most-recent-first so the player's likely target
  // is at the top of the list.
  const sortedSaves = useMemo(
    () => Object.values(saves).sort((a, b) => b.updatedAt - a.updatedAt),
    [saves],
  );

  // Reset transient flow state whenever we return to the main menu.
  useEffect(() => {
    if (runState === 'idle' && mode === 'home') {
      setPickedSkin(null);
      setNameDraft('');
      setNameError(null);
      setProfileKey(null);
      // Also drop any "auto-start run after tutorial" flag that
      // wasn't consumed - otherwise opening HOW TO PLAY from the
      // home menu later could spuriously kick off a run when the
      // cutscene closes.
      setPendingRunAfterTutorial(false);
    }
  }, [runState, mode]);

  // Once the player actually leaves idle (run started), clear the
  // pending-run flag so it can't fire again on a future tutorial
  // close.
  useEffect(() => {
    if (runState !== 'idle' && pendingRunAfterTutorial) {
      setPendingRunAfterTutorial(false);
    }
  }, [runState, pendingRunAfterTutorial]);

  // Honour pause-menu "LOAD RUN": drop directly onto the save list.
  // Cleared via setPendingStartMode(null) so the next plain return
  // to the main menu lands on 'home' as usual.
  useEffect(() => {
    if (runState !== 'idle') return;
    if (pendingStartMode === 'continue') {
      setMode(Object.keys(saves).length > 0 ? 'continue' : 'home');
      setPendingStartMode(null);
    } else if (pendingStartMode === 'home') {
      setMode('home');
      setPendingStartMode(null);
    }
  }, [pendingStartMode, runState, saves, setPendingStartMode]);

  // If the profile we're viewing has been deleted (or the key is
  // stale for any other reason) bounce back to the appropriate
  // surface on the next tick. Keeps render side-effect-free.
  useEffect(() => {
    if (mode !== 'profile') return;
    if (!profileKey || !saves[profileKey]) {
      setMode(Object.keys(saves).length > 0 ? 'continue' : 'home');
      setProfileKey(null);
    }
  }, [mode, profileKey, saves]);

  // After the tutorial cutscene closes, if it was launched from the
  // post-name prompt, start the run automatically so the player
  // doesn't have to tap again.
  useEffect(() => {
    if (pendingRunAfterTutorial && !showTutorial) {
      setPendingRunAfterTutorial(false);
      startRun();
    }
  }, [pendingRunAfterTutorial, showTutorial, startRun]);

  if (runState !== 'idle') return null;

  const goBackHome = () => {
    setMode('home');
    setPickedSkin(null);
    setNameDraft('');
    setNameError(null);
  };

  // New runs jump straight to the name-entry step now that we ship
  // a single Kenney character model - the prior beige/brown skin
  // picker was meaningless after the procedural figure was retired.
  // pickedSkin defaults to 'beige' so the save file's existing
  // skin field stays populated with a valid value.
  const beginNewRun = () => {
    setPickedSkin('beige');
    setNameDraft('');
    setNameError(null);
    setMode('name');
  };

  const beginContinue = () => setMode('continue');

  const onPickSkin = (skin: PlayerSkin) => {
    setPickedSkin(skin);
    setNameDraft('');
    setNameError(null);
    setMode('name');
  };

  const onConfirmName = () => {
    const name = nameDraft.trim();
    if (!name) {
      setNameError('Pick a name for your save.');
      return;
    }
    if (name.length > 20) {
      setNameError('Keep it under 20 characters.');
      return;
    }
    if (!pickedSkin) {
      // Pick is a no-op now that skin selection is gone; just default
      // and bounce back to home so the user re-enters the new-run flow.
      setPickedSkin('beige');
      setMode('home');
      return;
    }
    const key = saveKeyFromName(name);
    // Live read of saves so a save upserted during the keystroke
    // window is honoured by the duplicate check.
    const liveSavesPre = useStore.getState().saves;
    if (liveSavesPre[key]) {
      setGameModal({
        title: 'Name already taken',
        body: `"${name}" is already in use. Pick a different name or delete the existing save from the load screen.`,
        actions: [
          { label: 'OK', variant: 'primary', onPress: () => setGameModal(null) },
        ],
      });
      return;
    }
    const save: Save = newSave(name, pickedSkin);
    upsertSave(save);
    setActiveSave(key);
    setPlayerSkin(pickedSkin);
    useStore.getState().setPlayerOutfit(save.outfit);
    useStore.getState().setGameMode('campaign');
    setPlayerName(name);
    setStage(1);
    setBestStars({});
    // Build the on-disk record from the post-upsert store state so
    // any save not represented in the prior closure is preserved.
    const next: SavesMap = useStore.getState().saves;
    writeSaves(next);
    // Don't drop straight into gameplay - offer the intro cutscene
    // first so first-time players get a quick demo of the rules. Once
    // it has been watched (or skipped) it isn't offered again; "How to
    // play" on the start screen still replays it.
    if (useStore.getState().tutorialSeen) startRun();
    else setMode('tutorialPrompt');
  };

  // Load the active save, optionally jumping into a specific stage
  // (replay) instead of the save's own resume point.
  const beginRunForSave = (s: Save, stage?: number) => {
    const key = saveKeyFromName(s.name);
    setActiveSave(key);
    setPlayerSkin(s.skin);
    useStore.getState().setPlayerOutfit(s.outfit);
    useStore.getState().setGameMode('campaign');
    setPlayerName(s.name);
    setBestStars(s.bestStars);
    setStage(stage ?? s.stage);
    startRun();
  };

  // Endless / Daily with this character (coins and bests go to it).
  const beginEndlessForSave = (s: Save, kind: 'endless' | 'daily') => {
    const st = useStore.getState();
    const key = saveKeyFromName(s.name);
    setActiveSave(key);
    setPlayerSkin(s.skin);
    setPlayerName(s.name);
    st.setPlayerOutfit(s.outfit);
    const day = utcDayKey(new Date());
    st.setGameMode(kind, kind === 'daily' ? day : null);
    startRun();
    st.resetForSegment(kind === 'daily' ? dailySeed(day) : (Math.random() * 0x7fffffff) | 0);
  };

  const onBuyOrEquip = (s: Save, id: OutfitId) => {
    const key = saveKeyFromName(s.name);
    let updated: Save | null = null;
    if (s.outfits.includes(id)) {
      updated = equipOutfit(s, id);
    } else {
      const r = purchaseOutfit(s, id);
      if (r.ok) updated = r.save;
      else {
        setGameModal({
          title: r.reason === 'funds' ? 'Not enough coins' : 'Can\'t buy that',
          body:
            r.reason === 'funds'
              ? 'Earn coins by clearing stages (more stars pay more) and by going the distance in Endless and Daily runs.'
              : 'That outfit is not available.',
          actions: [{ label: 'OK', variant: 'primary', onPress: () => setGameModal(null) }],
        });
        return;
      }
    }
    if (!updated) return;
    upsertSave(updated);
    writeSaves({ ...useStore.getState().saves, [key]: updated });
    if (useStore.getState().activeSaveName === key) useStore.getState().setPlayerOutfit(updated.outfit);
  };

  const onOpenProfile = (s: Save) => {
    setProfileKey(saveKeyFromName(s.name));
    setMode('profile');
  };

  const onDeleteSave = (s: Save) => {
    setGameModal({
      title: 'Delete character?',
      body: `Permanently delete "${s.name}" and their star board.`,
      actions: [
        {
          label: 'CANCEL',
          variant: 'cancel',
          onPress: () => setGameModal(null),
        },
        {
          label: 'DELETE',
          variant: 'danger',
          onPress: () => {
            const key = saveKeyFromName(s.name);
            // Read the live saves map from the store so a concurrent
            // upsert between modal open and DELETE press isn't
            // wiped from disk on the writeSaves below. The closure
            // capture would have used a stale snapshot.
            const liveSaves = useStore.getState().saves;
            removeSave(key);
            const next: SavesMap = {};
            for (const k of Object.keys(liveSaves)) {
              if (k !== key) next[k] = liveSaves[k];
            }
            writeSaves(next);
            // If we deleted the save we were profiling, bounce back
            // to the list (or home if nothing's left).
            if (mode === 'profile' && profileKey === key) {
              if (Object.keys(next).length === 0) goBackHome();
              else setMode('continue');
            } else if (
              mode === 'continue' &&
              Object.keys(next).length === 0
            ) {
              goBackHome();
            }
            setGameModal(null);
          },
        },
      ],
    });
  };

  // ---- Render ----

  // The intro tutorial covers the screen: draw nothing underneath it
  // (the title used to ghost through the tutorial's backdrop).
  if (showTutorial) return null;

  if (mode === 'home') {
    const hasSaves = sortedSaves.length > 0;
    return (
      <View pointerEvents="box-none" style={styles.root}>
        <TitleRow />
        <Text style={styles.tagline}>Prison yard, no exits, all sirens.</Text>
        <View style={styles.homeBtnRow}>
          <Pressable
            onPress={beginNewRun}
            style={({ pressed }) => [
              styles.bigBtn,
              styles.bigBtnPrimary,
              pressed && styles.bigBtnDown,
            ]}
          >
            <Text style={styles.bigBtnLabel}>NEW RUN</Text>
          </Pressable>
          {hasSaves ? (
            <Pressable
              onPress={beginContinue}
              style={({ pressed }) => [
                styles.bigBtn,
                styles.bigBtnSecondary,
                pressed && styles.bigBtnDown,
              ]}
            >
              <Text style={[styles.bigBtnLabel, styles.bigBtnLabelOnDark]}>CONTINUE</Text>
            </Pressable>
          ) : null}
        </View>
        <Pressable
          onPress={() => useStore.getState().setHowToPlay('home')}
          style={({ pressed }) => [styles.linkBtn, pressed && styles.linkBtnDown]}
        >
          <Text style={styles.linkLabel}>HOW TO PLAY</Text>
        </Pressable>
        {/* Permanent release identifier: what is actually running
            (APK version + build, and the OTA sequence when a
            downloaded update is live). Full details: Settings. */}
        <Text pointerEvents="none" style={styles.releaseLine} numberOfLines={1}>
          {formatMenuLine(getReleaseInfo())}
        </Text>
      </View>
    );
  }

  // 'pick' mode (skin chooser) was removed when the figure rig
  // collapsed to a single Kenney model - beginNewRun jumps straight
  // from 'home' to 'name'. The PlayerSkin type + FigurePickButton
  // stay around because the continue / save panels still render
  // tiny prisoner thumbnails next to each save name.

  if (mode === 'name') {
    // Custom in-app keyboard - the system soft keyboard takes ~half
    // the landscape screen and ships in light theme. NameKeyboard
    // matches the dark UI, multi-touch friendly, and stays compact
    // enough to leave the input + BACK / START buttons fully visible.
    //
    // appendChar handles auto-capitalisation: the first character of
    // each space-separated word is uppercase, the rest are lowercase
    // (matches what the system keyboard's autoCapitalize="words"
    // gave us before the swap).
    const appendChar = (c: string) => {
      // Functional setState reads the latest value at apply time, so
      // a double-tap in the same React tick sees the post-first-tap
      // string when deciding whether to cap at 20 chars or apply the
      // word-boundary capitalisation rule.
      setNameDraft((prev) => {
        if (prev.length >= 20) return prev;
        const isFirstOfWord = prev.length === 0 || prev.endsWith(' ');
        const ch = isFirstOfWord ? c.toUpperCase() : c.toLowerCase();
        return prev + ch;
      });
      if (nameError) setNameError(null);
    };
    const backspace = () => {
      setNameDraft((prev) => (prev.length === 0 ? prev : prev.slice(0, -1)));
      if (nameError) setNameError(null);
    };

    return (
      <View pointerEvents="box-none" style={styles.root}>
        <View style={styles.nameTopRow}>
          {pickedSkin ? (
            <View style={styles.namePreviewWrapCompact}>
              <PrisonerFigure skin={pickedSkin} size="sm" />
            </View>
          ) : null}
          <View style={styles.nameDisplay}>
            <Text style={styles.taglineCompact}>Name your save</Text>
            <Text
              style={[
                styles.nameValueText,
                nameDraft.length === 0 && styles.nameValuePlaceholder,
              ]}
              numberOfLines={1}
            >
              {nameDraft.length > 0 ? nameDraft : 'Enter a name'}
            </Text>
          </View>
        </View>
        {nameError ? <Text style={styles.errorText}>{nameError}</Text> : null}
        <View style={styles.nameBtnRowCompact}>
          <Pressable
            onPress={goBackHome}
            style={({ pressed }) => [
              styles.bigBtnCompact,
              styles.bigBtnSecondary,
              pressed && styles.bigBtnDown,
            ]}
          >
            <Text style={[styles.bigBtnLabelCompact, styles.bigBtnLabelOnDark]}>BACK</Text>
          </Pressable>
          <Pressable
            onPress={onConfirmName}
            style={({ pressed }) => [
              styles.bigBtnCompact,
              styles.bigBtnPrimary,
              pressed && styles.bigBtnDown,
            ]}
          >
            <Text style={styles.bigBtnLabelCompact}>START</Text>
          </Pressable>
        </View>
        <View style={styles.nameKeyboardWrap}>
          <NameKeyboard
            onKey={appendChar}
            onBackspace={backspace}
            onDone={onConfirmName}
            doneEnabled={nameDraft.trim().length > 0}
          />
        </View>
      </View>
    );
  }

  if (mode === 'tutorialPrompt') {
    return (
      <View pointerEvents="box-none" style={styles.root}>
        <TitleRow />
        <Text style={styles.tagline}>Quick demo?</Text>
        <Text style={styles.promptBody}>
          Show you the basics in about 30 seconds, or jump straight in?
        </Text>
        <View style={styles.nameBtnRow}>
          <Pressable
            onPress={() => {
              saveSettings({ tutorialSeen: true });
              useStore.getState().setTutorialSeen(true);
              startRun();
            }}
            style={({ pressed }) => [
              styles.bigBtn,
              styles.bigBtnSecondary,
              pressed && styles.bigBtnDown,
            ]}
          >
            <Text style={[styles.bigBtnLabel, styles.bigBtnLabelOnDark]}>SKIP</Text>
          </Pressable>
          <Pressable
            onPress={() => {
              setPendingRunAfterTutorial(true);
              setShowTutorial(true);
            }}
            style={({ pressed }) => [
              styles.bigBtn,
              styles.bigBtnPrimary,
              pressed && styles.bigBtnDown,
            ]}
          >
            <Text style={styles.bigBtnLabel}>SHOW ME</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  if (mode === 'continue') {
    return (
      <View pointerEvents="box-none" style={styles.root}>
        <TitleRow />
        <Text style={styles.tagline}>Continue a run</Text>
        <ScrollView
          style={styles.saveList}
          contentContainerStyle={styles.saveListContent}
          showsVerticalScrollIndicator={false}
        >
          {sortedSaves.map((s) => (
            <View key={saveKeyFromName(s.name)} style={styles.saveRow}>
              <Pressable
                onPress={() => onOpenProfile(s)}
                style={({ pressed }) => [
                  styles.saveRowMain,
                  pressed && styles.saveRowMainDown,
                ]}
              >
                <PrisonerFigure skin={s.skin} size="sm" />
                <View style={styles.saveRowText}>
                  <Text style={styles.saveName}>{s.name}</Text>
                  <Text style={styles.saveStage}>
                    Stage {s.stage}
                    {totalStars(s) > 0 ? `  ·  ${totalStars(s)}★` : ''}
                  </Text>
                </View>
              </Pressable>
              <Pressable
                onPress={() => onDeleteSave(s)}
                hitSlop={8}
                style={({ pressed }) => [
                  styles.deleteBtn,
                  pressed && styles.deleteBtnDown,
                ]}
              >
                <Text style={styles.deleteGlyph}>×</Text>
              </Pressable>
            </View>
          ))}
        </ScrollView>
        <Pressable
          onPress={goBackHome}
          style={({ pressed }) => [styles.linkBtn, pressed && styles.linkBtnDown]}
        >
          <Text style={styles.linkLabel}>BACK</Text>
        </Pressable>
      </View>
    );
  }

  if (mode === 'outfits') {
    const owner = profileKey ? saves[profileKey] : undefined;
    if (!owner) return null;
    return (
      <View pointerEvents="box-none" style={styles.root}>
        <Text style={styles.outfitTitle}>OUTFITS</Text>
        <Text style={styles.outfitCoins}>{owner.coins} coins  ·  cosmetic only</Text>
        <View style={styles.outfitGrid}>
          {OUTFITS.map((o) => {
            const owned = owner.outfits.includes(o.id);
            const equipped = owner.outfit === o.id;
            return (
              <Pressable
                key={o.id}
                onPress={() => onBuyOrEquip(owner, o.id)}
                style={({ pressed }) => [
                  styles.outfitCell,
                  equipped && styles.outfitCellEquipped,
                  pressed && styles.boardCellDown,
                ]}
              >
                <View
                  style={[
                    styles.outfitSwatch,
                    { backgroundColor: o.tint !== null ? `#${o.tint.toString(16).padStart(6, '0')}` : o.model === 'g' ? '#9aa0a8' : '#f2c14a' },
                  ]}
                />
                <Text style={styles.outfitName}>{o.name}</Text>
                <Text style={styles.outfitState}>
                  {equipped ? 'WEARING' : owned ? 'TAP TO WEAR' : `${o.price} coins`}
                </Text>
              </Pressable>
            );
          })}
        </View>
        <Pressable
          onPress={() => setMode('profile')}
          style={({ pressed }) => [styles.bigBtn, styles.bigBtnSecondary, pressed && styles.bigBtnDown]}
        >
          <Text style={[styles.bigBtnLabel, styles.bigBtnLabelOnDark]}>BACK</Text>
        </Pressable>
      </View>
    );
  }

  // mode === 'profile'. The effect above redirects when the key is
  // stale; just render nothing this frame.
  const profile = profileKey ? saves[profileKey] : undefined;
  if (!profile) return null;
  const clearedStages = Math.max(0, profile.stage - 1);
  // Show every stage they've cleared plus the current "next" stage,
  // so the player can both review past results and pick up where
  // they left off from a single grid.
  const boardStages: number[] = [];
  for (let i = 1; i <= profile.stage; i++) boardStages.push(i);

  return (
    <View pointerEvents="box-none" style={styles.root}>
      <View style={styles.profileHeader}>
        <View style={styles.profileFigureFrame}>
          <PrisonerFigure skin={profile.skin} size="sm" />
        </View>
        <View style={styles.profileHeaderText}>
          <Text style={styles.profileName}>{profile.name}</Text>
          <Text style={styles.profileSubtitle}>
            {clearedStages === 0
              ? 'No stages cleared yet'
              : `${clearedStages} stage${clearedStages === 1 ? '' : 's'} cleared  ·  ${totalStars(profile)}★`}
            {`  ·  ${profile.coins} coins`}
          </Text>
        </View>
      <View style={styles.modeRow}>
          <Pressable
            onPress={() => beginEndlessForSave(profile, 'endless')}
            style={({ pressed }) => [styles.modeBtn, pressed && styles.bigBtnDown]}
          >
            <Text style={styles.modeLabel}>ENDLESS</Text>
            <Text style={styles.modeHint}>No finish. Harder every 120 m.</Text>
            <Text style={styles.modeSub}>best {profile.endlessBest} m</Text>
          </Pressable>
          <Pressable
            onPress={() => beginEndlessForSave(profile, 'daily')}
            style={({ pressed }) => [styles.modeBtn, pressed && styles.bigBtnDown]}
          >
            <Text style={styles.modeLabel}>DAILY RUN</Text>
            <Text style={styles.modeHint}>Same yard for everyone today.</Text>
            <Text style={styles.modeSub}>
              {profile.daily?.day === utcDayKey(new Date()) ? `today ${profile.daily.best} m` : 'new today'}
            </Text>
          </Pressable>
          <Pressable
            onPress={() => setMode('outfits')}
            style={({ pressed }) => [styles.modeBtn, pressed && styles.bigBtnDown]}
          >
            <Text style={styles.modeLabel}>OUTFITS</Text>
            <Text style={styles.modeHint}>Looks only.</Text>
            <Text style={styles.modeSub}>{profile.coins} coins</Text>
          </Pressable>
        </View>

      </View>

      <ScrollView
        style={styles.boardList}
        contentContainerStyle={styles.boardListContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.boardGrid}>
          {boardStages.map((n) => {
            const stars = profile.bestStars[n] ?? 0;
            const isNext = n === profile.stage;
            const isCleared = n < profile.stage;
            return (
              <Pressable
                key={n}
                onPress={() => beginRunForSave(profile, n)}
                style={({ pressed }) => [
                  styles.boardCell,
                  isNext && styles.boardCellNext,
                  isCleared && styles.boardCellCleared,
                  pressed && styles.boardCellDown,
                ]}
              >
                <Text style={styles.boardStageNum}>{n}</Text>
                <Text style={styles.boardStars}>
                  {stars > 0
                    ? STAR_FILLED.repeat(stars) + STAR_EMPTY.repeat(3 - stars)
                    : isNext
                      ? 'NEXT'
                      : '— — —'}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </ScrollView>

      <View style={styles.profileBtnRow}>
        <Pressable
          onPress={() => setMode('continue')}
          style={({ pressed }) => [
            styles.bigBtn,
            styles.bigBtnSecondary,
            pressed && styles.bigBtnDown,
          ]}
        >
          <Text style={[styles.bigBtnLabel, styles.bigBtnLabelOnDark]}>BACK</Text>
        </Pressable>
        <Pressable
          onPress={() => beginRunForSave(profile)}
          style={({ pressed }) => [
            styles.bigBtn,
            styles.bigBtnPrimary,
            pressed && styles.bigBtnDown,
          ]}
        >
          <Text style={styles.bigBtnLabel}>PLAY STAGE {profile.stage}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const STAR_FILLED = '★';
const STAR_EMPTY = '☆';

function totalStars(s: Save): number {
  let total = 0;
  for (const k of Object.keys(s.bestStars)) {
    total += s.bestStars[Number(k)] | 0;
  }
  return total;
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFillObject,
    // Dims the live 3D menu scene so the title, tagline and buttons
    // don't compete with fences, props and the patrol car behind them.
    backgroundColor: 'rgba(8, 10, 14, 0.32)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
    flexWrap: 'wrap',
  },
  titleWord: {
    color: ui.gold,
    fontSize: T.hero,
    fontFamily: fonts.display,
    letterSpacing: 4,
    textShadowColor: '#1a1206',
    textShadowOffset: { width: 3, height: 3 },
    textShadowRadius: 2,
  },
  releaseLine: {
    position: 'absolute',
    bottom: 8,
    alignSelf: 'center',
    color: 'rgba(255,255,255,0.72)',
    fontSize: T.caption,
    fontWeight: '600',
    letterSpacing: 0.4,
    textShadowColor: 'rgba(0,0,0,0.85)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 2,
  },
  tagline: {
    color: ui.text,
    fontSize: T.body,
    fontWeight: '700',
    letterSpacing: 1.5,
    marginBottom: 14,
    ...overSceneShadow,
  },
  promptBody: {
    ...overSceneShadow,
    color: ui.textBody,
    fontSize: T.caption,
    textAlign: 'center',
    paddingHorizontal: 32,
    marginBottom: 16,
    lineHeight: 17,
  },

  // Home buttons
  homeBtnRow: {
    flexDirection: 'row',
    gap: 14,
    marginTop: 4,
  },
  bigBtn: {
    paddingHorizontal: 28,
    paddingVertical: 12,
    borderRadius: 28,
    borderWidth: 2,
    minWidth: 140,
    alignItems: 'center',
  },
  bigBtnPrimary: buttonFill('primary'),
  // Solid dark fill + light-blue rim + white label: readable over any
  // scene (the old 20% translucent pill with dark ink was ~2:1).
  bigBtnSecondary: buttonFill('secondary'),
  bigBtnLabelOnDark: {
    color: ui.text,
  },
  bigBtnDown: {
    opacity: 0.75,
  },
  bigBtnLabel: {
    color: ui.onGold,
    fontFamily: fonts.display,
    letterSpacing: 1.6,
    fontSize: T.label,
  },

  // Figure picker
  previewRow: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 14,
  },
  figureFrame: {
    width: 100,
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    backgroundColor: 'rgba(20, 24, 32, 0.7)',
    alignItems: 'center',
  },
  figureFrameSelected: {
    borderColor: 'rgba(255, 209, 74, 0.95)',
    backgroundColor: 'rgba(50, 38, 20, 0.85)',
  },
  figureWrap: {
    width: 70,
    height: 110,
    position: 'relative',
  },
  figureWrapSmall: {
    width: 36,
    height: 56,
    position: 'relative',
  },
  head: {
    position: 'absolute',
    top: 0,
    left: 23,
    width: 24,
    height: 24,
    borderRadius: 4,
  },
  headSmall: {
    position: 'absolute',
    top: 0,
    left: 11,
    width: 14,
    height: 14,
    borderRadius: 2,
  },
  torso: {
    position: 'absolute',
    top: 26,
    left: 19,
    width: 32,
    height: 38,
    backgroundColor: ui.gold,
    borderRadius: 3,
    overflow: 'hidden',
  },
  torsoSmall: {
    position: 'absolute',
    top: 14,
    left: 9,
    width: 18,
    height: 20,
    backgroundColor: ui.gold,
    borderRadius: 2,
    overflow: 'hidden',
  },
  // Horizontal dark stripe across the torso, matching the Kenney
  // prisoner D uniform's belt band so the 2D thumbnail reads as
  // the same character that runs around in-game.
  torsoStripe: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 22,
    height: 6,
    backgroundColor: ui.onGold,
  },
  torsoStripeSmall: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 11,
    height: 3,
    backgroundColor: ui.onGold,
  },
  arm: {
    position: 'absolute',
    top: 28,
    width: 10,
    height: 32,
    backgroundColor: ui.gold,
    borderRadius: 3,
  },
  armSmall: {
    position: 'absolute',
    top: 15,
    width: 5,
    height: 17,
    backgroundColor: ui.gold,
    borderRadius: 1,
  },
  armL: { left: 6 },
  armR: { left: 54 },
  armLSmall: { left: 3 },
  armRSmall: { left: 28 },
  leg: {
    position: 'absolute',
    top: 66,
    width: 12,
    height: 36,
    backgroundColor: ui.gold,
    borderRadius: 3,
  },
  legSmall: {
    position: 'absolute',
    top: 35,
    width: 7,
    height: 19,
    backgroundColor: ui.gold,
    borderRadius: 1,
  },
  legL: { left: 18 },
  legR: { left: 40 },
  legLSmall: { left: 9 },
  legRSmall: { left: 20 },

  // Name entry
  namePreviewWrap: {
    marginBottom: 10,
    padding: 6,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: 'rgba(255, 209, 74, 0.95)',
    backgroundColor: 'rgba(50, 38, 20, 0.85)',
  },
  // Compact (~20% smaller) versions used on the name-entry screen
  // so they still fit when the OS keyboard slides up. The non-
  // compact versions stay around for any future surface that needs
  // the larger size.
  nameTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 8,
  },
  nameDisplay: {
    minWidth: 220,
    alignItems: 'flex-start',
  },
  nameValueText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: 1,
    minHeight: 22,
  },
  nameValuePlaceholder: {
    color: ui.textMuted,
    fontWeight: '600',
  },
  nameKeyboardWrap: {
    width: '100%',
    marginTop: 10,
    paddingHorizontal: 12,
  },
  taglineCompact: {
    color: ui.textBody,
    fontSize: T.caption,
    fontWeight: '700',
    letterSpacing: 1.5,
    marginBottom: 2,
    ...overSceneShadow,
  },
  namePreviewWrapCompact: {
    marginBottom: 8,
    padding: 4,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: 'rgba(255, 209, 74, 0.95)',
    backgroundColor: 'rgba(50, 38, 20, 0.85)',
    transform: [{ scale: 0.8 }],
  },
  nameInput: {
    width: 260,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.20)',
    backgroundColor: 'rgba(20, 24, 32, 0.85)',
    color: '#fff',
    fontSize: T.label,
    fontWeight: '600',
    letterSpacing: 1.0,
    textAlign: 'center',
  },
  nameInputCompact: {
    width: 208,
    paddingHorizontal: 11,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.20)',
    backgroundColor: 'rgba(20, 24, 32, 0.85)',
    color: '#fff',
    fontSize: T.small,
    fontWeight: '600',
    letterSpacing: 1.0,
    textAlign: 'center',
  },
  errorText: {
    color: '#ff8a8a',
    fontSize: T.caption,
    fontWeight: '700',
    marginTop: 8,
  },
  nameBtnRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 14,
  },
  nameBtnRowCompact: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 10,
  },
  bigBtnCompact: {
    paddingHorizontal: 22,
    paddingVertical: 9,
    borderRadius: 22,
    borderWidth: 2,
    minWidth: 112,
    alignItems: 'center',
  },
  bigBtnLabelCompact: {
    color: ui.onGold,
    fontWeight: '900',
    letterSpacing: 1.4,
    fontSize: T.small,
  },

  // Continue list
  saveList: {
    width: '100%',
    maxWidth: 460,
    maxHeight: 220,
  },
  saveListContent: {
    paddingVertical: 4,
    gap: 8,
  },
  saveRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    backgroundColor: 'rgba(20, 24, 32, 0.7)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    borderRadius: 12,
    overflow: 'hidden',
  },
  saveRowMain: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    gap: 12,
  },
  saveRowMainDown: {
    backgroundColor: 'rgba(255, 209, 74, 0.10)',
  },
  saveRowText: {
    flex: 1,
  },
  saveName: {
    color: '#fff',
    fontSize: T.label,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  saveStage: {
    color: 'rgba(255, 209, 74, 0.85)',
    fontSize: T.caption,
    fontWeight: '700',
    letterSpacing: 1.0,
    marginTop: 2,
  },
  deleteBtn: {
    width: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderLeftWidth: 1,
    borderLeftColor: 'rgba(255, 255, 255, 0.10)',
  },
  deleteBtnDown: {
    backgroundColor: 'rgba(255, 80, 80, 0.30)',
  },
  deleteGlyph: {
    color: 'rgba(255, 200, 200, 0.8)',
    fontSize: 22,
    lineHeight: 22,
    fontWeight: '900',
  },

  // Profile / star board
  profileHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 10,
    paddingHorizontal: 6,
  },
  profileFigureFrame: {
    padding: 6,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: 'rgba(255, 209, 74, 0.95)',
    backgroundColor: 'rgba(50, 38, 20, 0.85)',
  },
  profileHeaderText: {
    flexShrink: 1,
  },
  profileName: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '900',
    letterSpacing: 1.0,
  },
  profileSubtitle: {
    color: 'rgba(255, 209, 74, 0.85)',
    fontSize: T.caption,
    fontWeight: '700',
    letterSpacing: 1.0,
    marginTop: 2,
  },
  boardList: {
    width: '100%',
    maxWidth: 520,
    maxHeight: 200,
  },
  boardListContent: {
    paddingVertical: 4,
  },
  boardGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'center',
  },
  boardCell: {
    width: 76,
    height: 64,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    backgroundColor: 'rgba(20, 24, 32, 0.7)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  boardCellCleared: {
    borderColor: 'rgba(255, 209, 74, 0.55)',
    backgroundColor: 'rgba(50, 38, 20, 0.65)',
  },
  boardCellNext: {
    borderColor: 'rgba(120, 240, 160, 0.85)',
    backgroundColor: 'rgba(40, 70, 50, 0.85)',
  },
  boardCellDown: {
    opacity: 0.7,
  },
  boardStageNum: {
    color: '#fff',
    fontSize: T.label,
    fontWeight: '900',
    letterSpacing: 0.6,
  },
  boardStars: {
    color: ui.gold,
    fontSize: T.body,
    letterSpacing: 2,
    marginTop: 2,
  },
  profileBtnRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 12,
  },
  modeRow: {
    flexDirection: 'row',
    gap: 8,
    marginLeft: 18,
  },
  modeBtn: {
    minWidth: 104,
    paddingVertical: 4,
    paddingHorizontal: 12,
    borderRadius: 14,
    alignItems: 'center',
    backgroundColor: ui.control,
    borderWidth: 1,
    borderColor: ui.controlBorder,
  },
  modeLabel: {
    color: ui.gold,
    fontFamily: fonts.display,
    fontSize: T.body,
    letterSpacing: 1,
  },
  modeSub: {
    color: ui.textMuted,
    fontSize: T.caption,
    marginTop: 1,
  },
  modeHint: {
    color: ui.textBody,
    fontSize: T.caption,
    textAlign: 'center',
    maxWidth: 150,
  },
  outfitTitle: {
    color: ui.gold,
    fontFamily: fonts.display,
    fontSize: T.heading,
  },
  outfitCoins: {
    color: ui.textMuted,
    fontSize: T.caption,
    marginBottom: 10,
  },
  outfitGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 8,
    maxWidth: 640,
    marginBottom: 12,
  },
  outfitCell: {
    width: 150,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 12,
    backgroundColor: ui.panelSoft,
    borderWidth: 1,
    borderColor: ui.controlBorder,
  },
  outfitCellEquipped: {
    borderColor: ui.gold,
    borderWidth: 2,
  },
  outfitSwatch: {
    width: 28,
    height: 28,
    borderRadius: 14,
    marginBottom: 4,
    borderWidth: 2,
    borderColor: 'rgba(0,0,0,0.4)',
  },
  outfitName: {
    color: ui.text,
    fontSize: T.small,
    fontWeight: '700',
  },
  outfitState: {
    color: ui.textMuted,
    fontSize: T.caption,
  },

  // Back link
  linkBtn: {
    marginTop: 14,
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  linkBtnDown: {
    opacity: 0.6,
  },
  linkLabel: {
    color: ui.textBody,
    fontSize: T.small,
    fontWeight: '700',
    letterSpacing: 1.5,
    ...overSceneShadow,
  },
});
