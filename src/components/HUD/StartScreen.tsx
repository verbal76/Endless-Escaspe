import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
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
        { translateY: -8 * wave },
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

type Mode = 'home' | 'pick' | 'name' | 'continue';

export function StartScreen() {
  const runState = useStore((s) => s.runState);
  const startRun = useStore((s) => s.startRun);
  const setPlayerSkin = useStore((s) => s.setPlayerSkin);
  const setStage = useStore((s) => s.setStage);
  const saves = useStore((s) => s.saves);
  const upsertSave = useStore((s) => s.upsertSave);
  const removeSave = useStore((s) => s.removeSave);
  const setActiveSave = useStore((s) => s.setActiveSave);
  const setPlayerName = useStore((s) => s.setPlayerName);

  const [mode, setMode] = useState<Mode>('home');
  const [pickedSkin, setPickedSkin] = useState<PlayerSkin | null>(null);
  const [nameDraft, setNameDraft] = useState('');
  const [nameError, setNameError] = useState<string | null>(null);

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
    }
  }, [runState, mode]);

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
      setNameError('A save with that name already exists.');
      return;
    }
    const save: Save = {
      name,
      skin: pickedSkin,
      stage: 1,
      updatedAt: Date.now(),
    };
    upsertSave(save);
    setActiveSave(key);
    setPlayerSkin(pickedSkin);
    setPlayerName(name);
    setStage(1);
    const next: SavesMap = { ...saves, [key]: save };
    writeSaves(next);
    startRun();
  };

  const onLoadSave = (s: Save) => {
    const key = saveKeyFromName(s.name);
    setActiveSave(key);
    setPlayerSkin(s.skin);
    setPlayerName(s.name);
    setStage(s.stage);
    startRun();
  };

  const onDeleteSave = (s: Save) => {
    Alert.alert(
      'Delete save?',
      `Permanently delete "${s.name}" (Stage ${s.stage}).`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            const key = saveKeyFromName(s.name);
            removeSave(key);
            const next: SavesMap = {};
            for (const k of Object.keys(saves)) {
              if (k !== key) next[k] = saves[k];
            }
            writeSaves(next);
            // If they just emptied the list, fall back to the home
            // screen so they're not staring at an empty CONTINUE list.
            if (Object.keys(next).length === 0) goBackHome();
          },
        },
      ],
    );
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
    return (
      <View pointerEvents="box-none" style={styles.root}>
        <TitleRow />
        <Text style={styles.tagline}>Name your save</Text>
        {pickedSkin ? (
          <View style={styles.namePreviewWrap}>
            <PrisonerFigure skin={pickedSkin} size="sm" />
          </View>
        ) : null}
        <TextInput
          value={nameDraft}
          onChangeText={(v) => {
            setNameDraft(v);
            if (nameError) setNameError(null);
          }}
          placeholder="Enter a name"
          placeholderTextColor="rgba(255,255,255,0.35)"
          style={styles.nameInput}
          autoFocus
          autoCorrect={false}
          autoCapitalize="words"
          maxLength={20}
          returnKeyType="done"
          onSubmitEditing={onConfirmName}
        />
        {nameError ? <Text style={styles.errorText}>{nameError}</Text> : null}
        <View style={styles.nameBtnRow}>
          <Pressable
            onPress={() => setMode('pick')}
            style={({ pressed }) => [
              styles.bigBtn,
              styles.bigBtnSecondary,
              pressed && styles.bigBtnDown,
            ]}
          >
            <Text style={styles.bigBtnLabel}>BACK</Text>
          </Pressable>
          <Pressable
            onPress={onConfirmName}
            style={({ pressed }) => [
              styles.bigBtn,
              styles.bigBtnPrimary,
              pressed && styles.bigBtnDown,
            ]}
          >
            <Text style={styles.bigBtnLabel}>START</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  // mode === 'continue'
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
              onPress={() => onLoadSave(s)}
              style={({ pressed }) => [
                styles.saveRowMain,
                pressed && styles.saveRowMainDown,
              ]}
            >
              <PrisonerFigure skin={s.skin} size="sm" />
              <View style={styles.saveRowText}>
                <Text style={styles.saveName}>{s.name}</Text>
                <Text style={styles.saveStage}>Stage {s.stage}</Text>
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
    fontSize: 34,
    fontWeight: '900',
    letterSpacing: 1.5,
    marginHorizontal: 1,
    textShadowColor: '#1a1206',
    textShadowOffset: { width: 2, height: 2 },
    textShadowRadius: 1,
  },
  titleSpace: {
    width: 12,
  },
  tagline: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 1.5,
    marginBottom: 14,
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
