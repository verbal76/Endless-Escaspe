import React, { useEffect, useMemo, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
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
  saveKeyFromName,
  writeSaves,
  type Save,
  type SavesMap,
} from '../../util/storage';
import { NameKeyboard } from './NameKeyboard';

const TITLE = 'ENDLESS ESCASPE';

// Per-letter bouncing/pulsating title. Each letter gets its own
// looping translateY + scale animation with a phase offset based
// on its index, so the wave reads as a left-to-right ripple
// instead of every letter moving in unison.

function BouncingLetter({ char, index }: { char: string; index: number }) {
  const t = useSharedValue(0);

  useEffect(() => {
    t.value = 0;
    t.value = withRepeat(
      withTiming(1, { duration: 1600, easing: Easing.inOut(Easing.quad) }),
      -1,
      true,
    );
  }, [t]);

  const style = useAnimatedStyle(() => {
    const phase = (t.value + index * 0.10) % 1;
    const wave = Math.sin(phase * Math.PI * 2);
    return {
      transform: [
        // Amplitude tracks the title size (-18 at fontSize 77,
        // -14 here at fontSize 62) so the wave reads consistently
        // regardless of how often we retune the title.
        { translateY: -14 * wave },
        { scale: 1 + 0.06 * wave },
      ],
    };
  });

  return (
    <Animated.Text style={[styles.titleLetter, style]}>{char}</Animated.Text>
  );
}

function TitleRow() {
  return (
    <View style={styles.titleRow}>
      {TITLE.split('').map((c, i) =>
        c === ' ' ? (
          <View key={i} style={styles.titleSpace} />
        ) : (
          <BouncingLetter key={i} char={c} index={i} />
        ),
      )}
    </View>
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
  const arm = size === 'sm' ? styles.armSmall : styles.arm;
  const armL = size === 'sm' ? styles.armLSmall : styles.armL;
  const armR = size === 'sm' ? styles.armRSmall : styles.armR;
  const leg = size === 'sm' ? styles.legSmall : styles.leg;
  const legL = size === 'sm' ? styles.legLSmall : styles.legL;
  const legR = size === 'sm' ? styles.legRSmall : styles.legR;
  return (
    <View style={wrap}>
      <View style={[head, { backgroundColor: headColor }]} />
      <View style={torso} />
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

type Mode = 'home' | 'pick' | 'name' | 'tutorialPrompt' | 'continue' | 'profile';

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
    }
  }, [runState, mode]);

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

  const beginNewRun = () => setMode('pick');

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
      setNameError(null);
      setMode('pick');
      return;
    }
    const key = saveKeyFromName(name);
    if (saves[key]) {
      setGameModal({
        title: 'Name already taken',
        body: `"${name}" is already in use. Pick a different name or delete the existing save from the load screen.`,
        actions: [
          { label: 'OK', variant: 'primary', onPress: () => setGameModal(null) },
        ],
      });
      return;
    }
    const save: Save = {
      name,
      skin: pickedSkin,
      stage: 1,
      bestStars: {},
      updatedAt: Date.now(),
    };
    upsertSave(save);
    setActiveSave(key);
    setPlayerSkin(pickedSkin);
    setPlayerName(name);
    setStage(1);
    setBestStars({});
    const next: SavesMap = { ...saves, [key]: save };
    writeSaves(next);
    // Don't drop straight into gameplay - offer the intro cutscene
    // first so first-time players get a quick demo of the rules.
    setMode('tutorialPrompt');
  };

  // Load the active save, optionally jumping into a specific stage
  // (replay) instead of the save's own resume point.
  const beginRunForSave = (s: Save, stage?: number) => {
    const key = saveKeyFromName(s.name);
    setActiveSave(key);
    setPlayerSkin(s.skin);
    setPlayerName(s.name);
    setBestStars(s.bestStars);
    setStage(stage ?? s.stage);
    startRun();
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
            removeSave(key);
            const next: SavesMap = {};
            for (const k of Object.keys(saves)) {
              if (k !== key) next[k] = saves[k];
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
              <Text style={styles.bigBtnLabel}>CONTINUE</Text>
            </Pressable>
          ) : null}
        </View>
        <Pressable
          onPress={() => setShowTutorial(true)}
          style={({ pressed }) => [styles.linkBtn, pressed && styles.linkBtnDown]}
        >
          <Text style={styles.linkLabel}>HOW TO PLAY</Text>
        </Pressable>
      </View>
    );
  }

  if (mode === 'pick') {
    return (
      <View pointerEvents="box-none" style={styles.root}>
        <TitleRow />
        <Text style={styles.tagline}>Pick your prisoner</Text>
        <View style={styles.previewRow}>
          <FigurePickButton
            skin="beige"
            selected={pickedSkin === 'beige'}
            onTap={() => onPickSkin('beige')}
          />
          <FigurePickButton
            skin="brown"
            selected={pickedSkin === 'brown'}
            onTap={() => onPickSkin('brown')}
          />
        </View>
        <Pressable
          onPress={goBackHome}
          style={({ pressed }) => [styles.linkBtn, pressed && styles.linkBtnDown]}
        >
          <Text style={styles.linkLabel}>BACK</Text>
        </Pressable>
      </View>
    );
  }

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
      if (nameDraft.length >= 20) return;
      const isFirstOfWord = nameDraft.length === 0 || nameDraft.endsWith(' ');
      const ch = isFirstOfWord ? c.toUpperCase() : c.toLowerCase();
      setNameDraft(nameDraft + ch);
      if (nameError) setNameError(null);
    };
    const backspace = () => {
      if (nameDraft.length === 0) return;
      setNameDraft(nameDraft.slice(0, -1));
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
            onPress={() => setMode('pick')}
            style={({ pressed }) => [
              styles.bigBtnCompact,
              styles.bigBtnSecondary,
              pressed && styles.bigBtnDown,
            ]}
          >
            <Text style={styles.bigBtnLabelCompact}>BACK</Text>
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
          Show you the basics in 14 seconds, or jump straight in?
        </Text>
        <View style={styles.nameBtnRow}>
          <Pressable
            onPress={() => startRun()}
            style={({ pressed }) => [
              styles.bigBtn,
              styles.bigBtnSecondary,
              pressed && styles.bigBtnDown,
            ]}
          >
            <Text style={styles.bigBtnLabel}>SKIP</Text>
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
          </Text>
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
          <Text style={styles.bigBtnLabel}>BACK</Text>
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
  titleLetter: {
    color: '#ffd14a',
    fontSize: 62,
    fontWeight: '900',
    letterSpacing: 1.8,
    marginHorizontal: 2,
    textShadowColor: '#1a1206',
    textShadowOffset: { width: 3, height: 3 },
    textShadowRadius: 2,
  },
  titleSpace: {
    width: 16,
  },
  tagline: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 1.5,
    marginBottom: 14,
  },
  promptBody: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 12,
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
  bigBtnPrimary: {
    backgroundColor: 'rgba(255, 210, 90, 0.92)',
    borderColor: 'rgba(255, 230, 140, 1)',
  },
  bigBtnSecondary: {
    backgroundColor: 'rgba(120, 200, 255, 0.20)',
    borderColor: 'rgba(140, 220, 255, 0.65)',
  },
  bigBtnDown: {
    opacity: 0.75,
  },
  bigBtnLabel: {
    color: '#1b1206',
    fontWeight: '900',
    letterSpacing: 1.6,
    fontSize: 16,
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
    borderColor: 'rgba(255, 210, 90, 0.95)',
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
    backgroundColor: '#a05423',
    borderRadius: 3,
  },
  torsoSmall: {
    position: 'absolute',
    top: 14,
    left: 9,
    width: 18,
    height: 20,
    backgroundColor: '#a05423',
    borderRadius: 2,
  },
  arm: {
    position: 'absolute',
    top: 28,
    width: 10,
    height: 32,
    backgroundColor: '#a05423',
    borderRadius: 3,
  },
  armSmall: {
    position: 'absolute',
    top: 15,
    width: 5,
    height: 17,
    backgroundColor: '#a05423',
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
    backgroundColor: '#a05423',
    borderRadius: 3,
  },
  legSmall: {
    position: 'absolute',
    top: 35,
    width: 7,
    height: 19,
    backgroundColor: '#a05423',
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
    borderColor: 'rgba(255, 210, 90, 0.95)',
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
    color: 'rgba(255,255,255,0.35)',
    fontWeight: '600',
  },
  nameKeyboardWrap: {
    width: '100%',
    marginTop: 10,
    paddingHorizontal: 12,
  },
  taglineCompact: {
    color: 'rgba(255,255,255,0.65)',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.5,
    marginBottom: 2,
  },
  namePreviewWrapCompact: {
    marginBottom: 8,
    padding: 4,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: 'rgba(255, 210, 90, 0.95)',
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
    fontSize: 16,
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
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 1.0,
    textAlign: 'center',
  },
  errorText: {
    color: '#ff8a8a',
    fontSize: 12,
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
    color: '#1b1206',
    fontWeight: '900',
    letterSpacing: 1.4,
    fontSize: 13,
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
    backgroundColor: 'rgba(255, 210, 90, 0.10)',
  },
  saveRowText: {
    flex: 1,
  },
  saveName: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  saveStage: {
    color: 'rgba(255, 210, 90, 0.85)',
    fontSize: 12,
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
    borderColor: 'rgba(255, 210, 90, 0.95)',
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
    color: 'rgba(255, 210, 90, 0.85)',
    fontSize: 12,
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
    borderColor: 'rgba(255, 210, 90, 0.55)',
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
    fontSize: 16,
    fontWeight: '900',
    letterSpacing: 0.6,
  },
  boardStars: {
    color: '#ffd14a',
    fontSize: 14,
    letterSpacing: 2,
    marginTop: 2,
  },
  profileBtnRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 12,
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
    color: 'rgba(255, 255, 255, 0.65)',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 1.5,
  },
});
