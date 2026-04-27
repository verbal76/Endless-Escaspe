import React, { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { useStore, type PlayerSkin } from '../../state/store';
import { saveSettings } from '../../util/storage';

const TITLE = 'ENDLESS ESCASPE';

// Per-letter bouncing/pulsating title. Each letter gets its own
// looping translateY + scale animation with a phase offset based
// on its index, so the wave reads as a left-to-right ripple
// instead of every letter moving in unison.

function BouncingLetter({ char, index }: { char: string; index: number }) {
  const t = useSharedValue(0);

  useEffect(() => {
    // 1.6s loop; each letter starts a fraction of that delayed by
    // its position so the wave staggers across the title.
    t.value = 0;
    t.value = withRepeat(
      withTiming(1, { duration: 1600, easing: Easing.inOut(Easing.quad) }),
      -1,
      true,
    );
  }, [t]);

  const style = useAnimatedStyle(() => {
    // Phase offset by letter index: shift the wave so adjacent
    // letters peak at slightly different times.
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

function PlayerPreview({
  skin,
  selected,
  onTap,
}: {
  skin: PlayerSkin;
  selected: boolean;
  onTap: () => void;
}) {
  // Stylised 2D blocky figure built from absolutely-positioned
  // Views. Reads as a chunky little prisoner facing the camera.
  const headColor = skin === 'brown' ? '#7e4f2a' : '#e8c697';
  return (
    <Pressable
      onPress={onTap}
      style={[styles.figureFrame, selected && styles.figureFrameSelected]}
    >
      <View style={styles.figureWrap}>
        {/* head */}
        <View style={[styles.head, { backgroundColor: headColor }]} />
        {/* torso (jumpsuit) */}
        <View style={styles.torso} />
        {/* arms */}
        <View style={[styles.arm, styles.armL]} />
        <View style={[styles.arm, styles.armR]} />
        {/* legs */}
        <View style={[styles.leg, styles.legL]} />
        <View style={[styles.leg, styles.legR]} />
      </View>
      <Text style={[styles.skinLabel, selected && styles.skinLabelSelected]}>
        {skin === 'brown' ? 'BROWN' : 'BEIGE'}
      </Text>
    </Pressable>
  );
}

export function StartScreen() {
  const runState = useStore((s) => s.runState);
  const startRun = useStore((s) => s.startRun);
  const playerSkin = useStore((s) => s.playerSkin);
  const setPlayerSkin = useStore((s) => s.setPlayerSkin);
  const masterVolume = useStore((s) => s.masterVolume);
  const weatherEnabled = useStore((s) => s.weatherEnabled);
  const stage = useStore((s) => s.stage);
  const isContinuing = stage > 1;

  if (runState !== 'idle') return null;

  const onPickSkin = (skin: PlayerSkin) => {
    setPlayerSkin(skin);
    // Persist immediately so the choice survives an app kill.
    saveSettings({ masterVolume, weatherEnabled, playerSkin: skin });
  };

  const onStart = () => {
    startRun();
  };

  return (
    <View pointerEvents="box-none" style={styles.root}>
      <View style={styles.titleRow}>
        {TITLE.split('').map((c, i) =>
          c === ' ' ? (
            <View key={i} style={styles.titleSpace} />
          ) : (
            <BouncingLetter key={i} char={c} index={i} />
          ),
        )}
      </View>

      <Text style={styles.tagline}>Pick your prisoner</Text>
      <View style={styles.previewRow}>
        <PlayerPreview
          skin="beige"
          selected={playerSkin === 'beige'}
          onTap={() => onPickSkin('beige')}
        />
        <PlayerPreview
          skin="brown"
          selected={playerSkin === 'brown'}
          onTap={() => onPickSkin('brown')}
        />
      </View>

      <Pressable
        onPress={onStart}
        style={({ pressed }) => [styles.startBtn, pressed && styles.startBtnDown]}
      >
        <Text style={styles.startLabel}>{isContinuing ? 'CONTINUE' : 'START'}</Text>
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
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 18,
    flexWrap: 'wrap',
  },
  titleLetter: {
    color: '#ffd14a',
    fontSize: 38,
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
    marginBottom: 12,
  },
  previewRow: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 18,
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
  head: {
    position: 'absolute',
    top: 0,
    left: 23,
    width: 24,
    height: 24,
    borderRadius: 4,
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
  arm: {
    position: 'absolute',
    top: 28,
    width: 10,
    height: 32,
    backgroundColor: '#a05423',
    borderRadius: 3,
  },
  armL: { left: 6 },
  armR: { left: 54 },
  leg: {
    position: 'absolute',
    top: 66,
    width: 12,
    height: 36,
    backgroundColor: '#a05423',
    borderRadius: 3,
  },
  legL: { left: 18 },
  legR: { left: 40 },
  skinLabel: {
    marginTop: 6,
    color: 'rgba(255, 255, 255, 0.55)',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.5,
  },
  skinLabelSelected: {
    color: '#ffd14a',
  },
  startBtn: {
    paddingHorizontal: 36,
    paddingVertical: 14,
    borderRadius: 32,
    backgroundColor: 'rgba(255, 210, 90, 0.92)',
    borderWidth: 2,
    borderColor: 'rgba(255, 230, 140, 1)',
  },
  startBtnDown: {
    backgroundColor: 'rgba(255, 180, 40, 1)',
  },
  startLabel: {
    color: '#1b1206',
    fontWeight: '900',
    letterSpacing: 1.8,
    fontSize: 18,
  },
});
